import {
  splitEvenly,
  type Share,
  type SyncUnits,
} from '@shared-expense/domain';
import { createUuid, type Database, type SqlExecutor } from '../storage';
import type { LocalIdentity } from '../shell';
import {
  expenseSyncValues,
  sharedGroup,
  writeLocalChange,
  type SharedGroup,
} from '../sync/records';

/** An expense as the phone stores it (LEDGER-27.2). */
export interface Expense {
  id: string;
  title: string;
  amountMinor: number;
  currency: string;
  /** YYYY-MM-DD */
  date: string;
  /** A shared expense keeps the name and color from when it was assigned this category. */
  category: { id: string; name: string; color: string };
  /** Left out when the expense has no note. */
  note?: string;
  /** The personal space or the group the expense belongs to. */
  spaceId: string;
  /** Each payment's participant is a participant id. */
  payments: Share<string>[];
  /** Each share's participant is a participant id. */
  shares: Share<string>[];
  /** Present only in the trash; larger values were moved in later. */
  trashOrder?: number;
}

interface ExpenseRow extends Omit<
  Expense,
  'category' | 'note' | 'payments' | 'shares' | 'trashOrder'
> {
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  note: string | null;
  payments: string;
  shares: string;
  trashOrder: number | null;
}

export async function categoryExpenseCounts(
  database: SqlExecutor,
): Promise<Map<string, number>> {
  const rows = await database.all<{ categoryId: string; count: number }>(
    'SELECT categoryId, COUNT(*) AS count FROM expenses GROUP BY categoryId',
  );
  return new Map(rows.map(({ categoryId, count }) => [categoryId, count]));
}

export async function moveExpensesToCategory(
  transaction: SqlExecutor,
  sourceId: string,
  target: Expense['category'] & { spaceId: string },
  group: SharedGroup | undefined,
): Promise<void> {
  const { id, name, color, spaceId } = target;
  if (group) {
    const expenses = await transaction.all<{ id: string }>(
      'SELECT id FROM expenses WHERE categoryId = ? AND spaceId = ? ORDER BY rowid',
      [sourceId, spaceId],
    );
    const category = { id, name, color };
    for (const expense of expenses)
      await writeLocalChange(transaction, group, 'expense', expense.id, {
        category,
      });
  }
  await transaction.run(
    'UPDATE expenses SET categoryId = ?, categoryName = ?, categoryColor = ? WHERE categoryId = ? AND spaceId = ?',
    [id, name, color, sourceId, spaceId],
  );
}

/** Stored expenses in the order of LEDGER-28.1, optionally limited to one space. */
export function listExpenses(
  database: SqlExecutor,
  spaceId?: string,
): Promise<Expense[]> {
  return spaceId === undefined
    ? readExpenses(database, '', [])
    : readExpenses(database, 'WHERE e.spaceId = ?', [spaceId]);
}

async function readExpenses(
  database: SqlExecutor,
  where: string,
  parameters: readonly string[],
): Promise<Expense[]> {
  const rows = await database.all<ExpenseRow>(
    `
    SELECT e.*,
      (SELECT json_group_array(json_object('participant', participant, 'amountMinor', amountMinor))
        FROM (SELECT participant, amountMinor FROM expense_payments
          WHERE expenseId = e.id ORDER BY position, rowid)) AS payments,
      (SELECT json_group_array(json_object('participant', participant, 'amountMinor', amountMinor))
        FROM (SELECT participant, amountMinor FROM expense_shares
          WHERE expenseId = e.id ORDER BY position, rowid)) AS shares
    FROM expenses AS e ${where} ORDER BY e.date DESC, e.rowid DESC
  `,
    parameters,
  );
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    amountMinor: row.amountMinor,
    currency: row.currency,
    date: row.date,
    category: {
      id: row.categoryId,
      name: row.categoryName,
      color: row.categoryColor,
    },
    ...(row.note === null ? {} : { note: row.note }),
    spaceId: row.spaceId,
    payments: JSON.parse(row.payments) as Share<string>[],
    shares: JSON.parse(row.shares) as Share<string>[],
    ...(row.trashOrder == null ? {} : { trashOrder: row.trashOrder }),
  }));
}

type ExpenseInput = Pick<
  Expense,
  'title' | 'amountMinor' | 'currency' | 'date' | 'note'
> & { categoryId: string };

const listeners = new WeakMap<Database, Set<() => void>>();

/** Mounted screens also refresh while another screen covers them. */
export function subscribeToExpenses(database: Database, listener: () => void) {
  let subscribers = listeners.get(database);
  if (!subscribers) {
    subscribers = new Set();
    listeners.set(database, subscribers);
  }
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
  };
}

export function notifyExpensesChanged(database: Database) {
  listeners.get(database)?.forEach((listener) => listener());
}

export interface GroupSplit {
  groupId: string;
  payerId: string;
  participants: string[];
}

export class ArchivedExpenseError extends Error {}

/** Save the expense and its ordered allocations together, or leave all of them unchanged. */
export async function saveExpense(
  database: Database,
  identity: LocalIdentity,
  input: ExpenseInput,
  original?: Expense,
  split?: GroupSplit,
): Promise<void> {
  await database.transaction(async (transaction) => {
    const spaceId = split?.groupId ?? identity.personalSpaceId;
    const [existing] = original
      ? await readExpenses(transaction, 'WHERE e.id = ?', [original.id])
      : [];
    if (original && !existing) throw new Error('Expense not found');
    let amountMinor = input.amountMinor;
    let payments = [
      { participant: identity.personalParticipantId, amountMinor },
    ];
    let shares = payments;
    if (
      existing &&
      existing.spaceId !== identity.personalSpaceId &&
      existing.spaceId !== spaceId
    )
      throw new Error('A group expense cannot change spaces');
    if (split) {
      const [group] = await transaction.all<{ archived: number }>(
        'SELECT archived FROM groups WHERE id = ?',
        [spaceId],
      );
      if (!group) throw new Error('Group not found');
      if (group.archived) throw new ArchivedExpenseError();
      const members = await transaction.all<{ id: string; removed: number }>(
        'SELECT id, removed FROM group_members WHERE groupId = ?',
        [spaceId],
      );
      const currentMembers = new Set(
        members.filter((member) => !member.removed).map((member) => member.id),
      );
      const locked =
        existing?.spaceId === spaceId &&
        [...existing.payments, ...existing.shares].some(
          (share) => !currentMembers.has(share.participant),
        );
      if (locked) {
        amountMinor = existing.amountMinor;
        payments = existing.payments;
        shares = existing.shares;
      } else {
        if (
          !currentMembers.has(split.payerId) ||
          split.participants.some((id) => !currentMembers.has(id))
        )
          throw new Error('Member not found');
        const allocations = splitEvenly(amountMinor, split.participants);
        if (!allocations) throw new Error('Invalid split');
        payments = [{ participant: split.payerId, amountMinor }];
        shares = allocations;
      }
    }
    const [selected] = await transaction.all<Expense['category']>(
      'SELECT id, name, color FROM categories WHERE id = ? AND spaceId = ?',
      [input.categoryId, spaceId],
    );
    if (!selected) throw new Error('Category not found');
    const shared = split && (await sharedGroup(transaction, spaceId));
    const keepCategory = shared && existing?.category.id === selected.id;
    const category = keepCategory ? existing.category : selected;
    const id = existing?.id ?? (await createUuid(transaction));
    const expense: Expense = {
      id,
      spaceId,
      title: input.title.trim(),
      date: input.date,
      note: input.note?.trim() || undefined,
      category,
      amountMinor,
      currency: existing?.currency ?? input.currency,
      payments,
      shares,
      trashOrder: existing?.trashOrder,
    };
    const values = [
      expense.title,
      expense.amountMinor,
      expense.date,
      category.id,
      category.name,
      category.color,
      expense.note ?? null,
    ];
    if (existing) {
      await transaction.run(
        'UPDATE expenses SET title = ?, amountMinor = ?, date = ?, categoryId = ?, categoryName = ?, categoryColor = ?, note = ?, spaceId = ? WHERE id = ?',
        [...values, spaceId, id],
      );
      await transaction.run(
        'DELETE FROM expense_payments WHERE expenseId = ?',
        [id],
      );
      await transaction.run('DELETE FROM expense_shares WHERE expenseId = ?', [
        id,
      ]);
    } else {
      await transaction.run(
        'INSERT INTO expenses (title, amountMinor, date, categoryId, categoryName, categoryColor, note, id, currency, spaceId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [...values, id, expense.currency, spaceId],
      );
    }
    for (const [table, allocations] of [
      ['expense_payments', payments],
      ['expense_shares', shares],
    ] as const) {
      for (const [position, share] of allocations.entries())
        await transaction.run(
          `INSERT INTO ${table} (expenseId, participant, amountMinor, position) VALUES (?, ?, ?, ?)`,
          [id, share.participant, share.amountMinor, position],
        );
    }
    if (shared) {
      const units: Partial<SyncUnits['expense']> = expenseSyncValues(expense);
      // A displayed fallback category can differ from the synced category until it arrives.
      if (keepCategory) delete units.category;
      await writeLocalChange(transaction, shared, 'expense', id, units);
    }
  });
  notifyExpensesChanged(database);
}

export const savePersonalExpense = saveExpense;
