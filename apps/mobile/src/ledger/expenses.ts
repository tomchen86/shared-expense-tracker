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
  addedOrder: number;
  changedAt: number | null;
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
  eventMs?: number,
): Promise<void> {
  const { id, name, color, spaceId } = target;
  const expenses = await transaction.all<{ id: string }>(
    'SELECT id FROM expenses WHERE categoryId = ? AND spaceId = ? ORDER BY rowid',
    [sourceId, spaceId],
  );
  if (group) {
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
  await recordExpenseChanges(
    transaction,
    expenses.map((expense) => expense.id),
    eventMs,
  );
}

/** Stamp one write, including a whole category move. Only received events keep a later time. */
export async function recordExpenseChanges(
  transaction: SqlExecutor,
  ids: readonly string[],
  eventMs?: number,
) {
  if (ids.length === 0) return;
  await transaction.run(
    `INSERT INTO expense_changes (expenseId, changedAt)
     SELECT value, ? FROM json_each(?) WHERE true
     ON CONFLICT (expenseId) DO UPDATE SET changedAt = excluded.changedAt
     WHERE ? IS NULL OR excluded.changedAt > changedAt`,
    [eventMs ?? Date.now(), JSON.stringify(ids), eventMs ?? null],
  );
}

/** Stored expenses in the order of LEDGER-28.1, optionally limited to one space. */
export async function listExpenses(
  database: SqlExecutor,
  spaceId?: string,
): Promise<Expense[]> {
  const rows =
    spaceId === undefined
      ? await readExpenseRows(database, '', [])
      : await readExpenseRows(database, 'WHERE e.spaceId = ?', [spaceId]);
  return rows.map(expenseOf);
}

/** The same expenses with the local sort keys their cards use. */
export async function listExpensesForCards(database: SqlExecutor) {
  const rows = await readExpenseRows(database, '', []);
  return rows.map((row) => ({
    ...expenseOf(row),
    addedOrder: row.addedOrder,
    changedAt: row.changedAt,
  }));
}

function readExpenseRows(
  database: SqlExecutor,
  where: string,
  parameters: readonly string[],
): Promise<ExpenseRow[]> {
  return database.all<ExpenseRow>(
    `
    SELECT e.*, e.rowid AS addedOrder, c.changedAt,
      (SELECT json_group_array(json_object('participant', participant, 'amountMinor', amountMinor))
        FROM (SELECT participant, amountMinor FROM expense_payments
          WHERE expenseId = e.id ORDER BY position, rowid)) AS payments,
      (SELECT json_group_array(json_object('participant', participant, 'amountMinor', amountMinor))
        FROM (SELECT participant, amountMinor FROM expense_shares
          WHERE expenseId = e.id ORDER BY position, rowid)) AS shares
    FROM expenses AS e LEFT JOIN expense_changes AS c ON c.expenseId = e.id
    ${where} ORDER BY e.date DESC, e.rowid DESC
  `,
    parameters,
  );
}

function expenseOf(row: ExpenseRow): Expense {
  return {
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
  };
}

type ExpenseInput = Pick<
  Expense,
  'title' | 'amountMinor' | 'currency' | 'date' | 'note'
> & { categoryId: string };

/**
 * `leftTrash` are the expenses an applied event took out of the trash. `placed` is the expense the
 * user just added in New Expense or put back from the trash on this phone (LEDGER-117.2).
 */
type ExpenseListener = (
  leftTrash?: ReadonlySet<string>,
  placed?: string,
) => void;
const listeners = new WeakMap<Database, Set<ExpenseListener>>();

/** Mounted screens also refresh while another screen covers them. */
export function subscribeToExpenses(
  database: Database,
  listener: ExpenseListener,
) {
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

export function notifyExpensesChanged(
  database: Database,
  leftTrash?: ReadonlySet<string>,
  placed?: string,
) {
  listeners.get(database)?.forEach((listener) => listener(leftTrash, placed));
}

export interface GroupSplit {
  groupId: string;
  payerId: string;
  participants: string[];
}

export class ArchivedExpenseError extends Error {}

/** Write the expense and its ordered allocations, keeping an existing expense's rowid. */
export async function writeExpenseRows(
  transaction: SqlExecutor,
  expense: Expense,
  existing: boolean,
  eventMs?: number,
) {
  const { id, category, payments, shares } = expense;
  const values = [
    expense.title,
    expense.amountMinor,
    expense.currency,
    expense.date,
    category.id,
    category.name,
    category.color,
    expense.note ?? null,
    expense.spaceId,
    expense.trashOrder ?? null,
    id,
  ];
  if (existing) {
    await transaction.run(
      `UPDATE expenses SET title = ?, amountMinor = ?, currency = ?, date = ?,
       categoryId = ?, categoryName = ?, categoryColor = ?, note = ?, spaceId = ?, trashOrder = ? WHERE id = ?`,
      values,
    );
    await transaction.run('DELETE FROM expense_payments WHERE expenseId = ?', [
      id,
    ]);
    await transaction.run('DELETE FROM expense_shares WHERE expenseId = ?', [
      id,
    ]);
  } else {
    await transaction.run(
      `INSERT INTO expenses (title, amountMinor, currency, date, categoryId, categoryName, categoryColor,
       note, spaceId, trashOrder, id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      values,
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
  await recordExpenseChanges(transaction, [id], eventMs);
}

/** Save the expense and its ordered allocations together, or leave all of them unchanged. */
export async function saveExpense(
  database: Database,
  identity: LocalIdentity,
  input: ExpenseInput,
  original?: Expense,
  split?: GroupSplit,
): Promise<void> {
  const id = await database.transaction(async (transaction) => {
    const spaceId = split?.groupId ?? identity.personalSpaceId;
    const [existing] = original
      ? (
          await readExpenseRows(transaction, 'WHERE e.id = ?', [original.id])
        ).map(expenseOf)
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
    await writeExpenseRows(transaction, expense, !!existing);
    if (shared) {
      const units: Partial<SyncUnits['expense']> = expenseSyncValues(expense);
      // A displayed fallback category can differ from the synced category until it arrives.
      if (keepCategory) delete units.category;
      await writeLocalChange(transaction, shared, 'expense', id, units);
    }
    return id;
  });
  notifyExpensesChanged(database, undefined, original ? undefined : id);
}

export const savePersonalExpense = saveExpense;
