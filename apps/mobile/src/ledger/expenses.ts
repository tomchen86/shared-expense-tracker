import {
  splitEvenly,
  type Share,
  type SyncRecord,
  type SyncUnits,
} from '@shared-expense/domain';
import { createUuid, type Database, type SqlExecutor } from '../storage';
import type { LocalIdentity } from '../shell';
import { moneyToReview } from '../sync/own-money';
import {
  changedUnits,
  expenseSyncValues,
  readSyncRecord,
  sharedGroup,
  writeLocalChange,
  type SharedGroup,
} from '../sync/records';
import { revealPlacedExpense } from './list-filter-storage';

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
  /** This phone's own money change of the expense, once an event has overridden it. */
  overriddenMoney: string | null;
}

/** The units an expense's sync record holds, each with its stamp. */
export type ExpenseUnits = Extract<SyncRecord, { type: 'expense' }>['units'];

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

/** One expense with its stored category and allocations. */
export async function readExpense(
  database: SqlExecutor,
  id: string,
): Promise<Expense | undefined> {
  const [row] = await readExpenseRows(database, 'WHERE e.id = ?', [id]);
  return row && expenseOf(row);
}

/**
 * The expense as Edit Expense opens with it and, for a shared ledger's expense, the units
 * its record holds then. One statement reads both, so no event is applied between them:
 * a save bases on these stamps (SYNC-23.2).
 */
export async function readExpenseToEdit(
  database: SqlExecutor,
  id: string,
): Promise<{ expense: Expense; units?: ExpenseUnits } | undefined> {
  const [row] = await readExpenseRows<{ record: string | null }>(
    database,
    'WHERE e.id = ?',
    [id],
    `(SELECT record FROM sync_records
      WHERE groupId = e.spaceId AND type = 'expense' AND id = e.id) AS record,`,
  );
  if (!row) return undefined;
  const record =
    row.record === null
      ? undefined
      : (JSON.parse(row.record) as { units: ExpenseUnits });
  return { expense: expenseOf(row), units: record?.units };
}

/**
 * The same expenses with the local sort keys their cards use and, for each one that needs
 * review, `yours`: the money the user entered (LEDGER-151.1).
 */
export async function listExpensesForCards(database: SqlExecutor) {
  const rows = await readExpenseRows(database, '', []);
  return rows.map((row) => {
    const expense = expenseOf(row);
    return {
      ...expense,
      addedOrder: row.addedOrder,
      changedAt: row.changedAt,
      yours: moneyToReview(expense, row.overriddenMoney),
    };
  });
}

function readExpenseRows<More = unknown>(
  database: SqlExecutor,
  where: string,
  parameters: readonly string[],
  /** More columns to read with each expense, each ending in a comma. */
  more = '',
): Promise<(ExpenseRow & More)[]> {
  return database.all<ExpenseRow & More>(
    `
    SELECT e.*, e.rowid AS addedOrder, c.changedAt, m.money AS overriddenMoney, ${more}
      (SELECT json_group_array(json_object('participant', participant, 'amountMinor', amountMinor))
        FROM (SELECT participant, amountMinor FROM expense_payments
          WHERE expenseId = e.id ORDER BY position, rowid)) AS payments,
      (SELECT json_group_array(json_object('participant', participant, 'amountMinor', amountMinor))
        FROM (SELECT participant, amountMinor FROM expense_shares
          WHERE expenseId = e.id ORDER BY position, rowid)) AS shares
    FROM expenses AS e LEFT JOIN expense_changes AS c ON c.expenseId = e.id
      LEFT JOIN sync_own_money AS m ON m.expenseId = e.id AND m.overridden = 1
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

/**
 * Save the expense and its ordered allocations together, or leave all of them unchanged.
 * An edit of a shared ledger's expense saves only the units that differ from `opened`,
 * the units its record held when its form opened, and leaves the others as they are
 * stored, whatever was applied meanwhile (SYNC-23.2). Without `opened`, the edit is taken
 * as made on what the record holds now.
 */
export async function saveExpense(
  database: Database,
  identity: LocalIdentity,
  input: ExpenseInput,
  original?: Expense,
  split?: GroupSplit,
  opened?: ExpenseUnits,
): Promise<void> {
  const id = await database.transaction(async (transaction) => {
    const spaceId = split?.groupId ?? identity.personalSpaceId;
    const existing = original
      ? await readExpense(transaction, original.id)
      : undefined;
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
    const shared = split && (await sharedGroup(transaction, spaceId));
    const stored =
      shared && existing?.spaceId === spaceId
        ? await readSyncRecord(transaction, spaceId, 'expense', existing.id)
        : undefined;
    const since = stored && (opened ?? (stored.record.units as ExpenseUnits));
    // The expense those units belong to: `original` is the one the form opened with.
    const before = opened ? original : existing;
    // The group's members, while the save takes the payer and the sharers from the form:
    // they have to be among them.
    let currentMembers: ReadonlySet<string> | undefined;
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
      const current = new Set(
        members.filter((member) => !member.removed).map((member) => member.id),
      );
      const locked =
        existing?.spaceId === spaceId &&
        [...existing.payments, ...existing.shares].some(
          (share) => !current.has(share.participant),
        );
      if (locked) {
        amountMinor = existing.amountMinor;
        payments = existing.payments;
        shares = existing.shares;
      } else {
        const allocations = splitEvenly(amountMinor, split.participants);
        if (!allocations) throw new Error('Invalid split');
        payments = [{ participant: split.payerId, amountMinor }];
        shares = allocations;
        currentMembers = current;
      }
    }
    // A shared ledger's expense keeps its category, with the name and color it stores,
    // unless the form names another: also one that was renamed since, or is gone
    // (LEDGER-27.2, SYNC-41.1).
    let category =
      since && input.categoryId === before?.category.id
        ? existing?.category
        : undefined;
    const keepCategory = category !== undefined;
    if (!category) {
      const [selected] = await transaction.all<Expense['category']>(
        'SELECT id, name, color FROM categories WHERE id = ? AND spaceId = ?',
        [input.categoryId, spaceId],
      );
      if (!selected) throw new Error('Category not found');
      category = selected;
    }
    const id = existing?.id ?? (await createUuid(transaction));
    let expense: Expense = {
      id,
      spaceId,
      title: input.title.trim(),
      date: input.date,
      note: input.note?.trim() || undefined,
      category,
      amountMinor,
      // The form shows the amount in the currency the expense had when it opened.
      currency:
        since?.money?.value.currency ?? existing?.currency ?? input.currency,
      payments,
      shares,
      trashOrder: existing?.trashOrder,
    };
    const units: Partial<SyncUnits['expense']> = expenseSyncValues(expense);
    if (existing && since) {
      // Not changed on the form: whether the expense is in the trash, the category it left
      // as it was, and the money of an expense with a former member, kept above.
      delete units.trashed;
      if (keepCategory) delete units.category;
      if (!currentMembers) delete units.money;
      const changed = changedUnits(units, since);
      // The money stays as it is stored, whoever pays and shares it now.
      if (!('money' in changed)) currentMembers = undefined;
      const form = expense;
      const from = (unit: string) => (unit in changed ? form : existing);
      expense = {
        ...existing,
        title: from('title').title,
        date: from('date').date,
        note: from('note').note,
        category: from('category').category,
        ...expenseSyncValues(from('money')).money,
      };
    }
    if (
      split &&
      currentMembers &&
      [split.payerId, ...split.participants].some(
        (member) => !currentMembers.has(member),
      )
    )
      throw new Error('Member not found');
    await writeExpenseRows(transaction, expense, !!existing);
    if (shared)
      await writeLocalChange(transaction, shared, 'expense', id, units, since);
    if (!existing) await revealPlacedExpense(transaction, expense);
    return id;
  });
  notifyExpensesChanged(database, undefined, original ? undefined : id);
}

export const savePersonalExpense = saveExpense;
