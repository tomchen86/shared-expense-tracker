import type { Share } from '@shared-expense/domain';
import { createUuid, type Database, type SqlExecutor } from '../storage';
import type { LocalIdentity } from '../shell';

/** An expense as the phone stores it (LEDGER-27.1). */
export interface Expense {
  id: string;
  title: string;
  amountMinor: number;
  currency: string;
  /** YYYY-MM-DD */
  date: string;
  /** The category, with its name and color as they were when the expense was last saved. */
  category: { id: string; name: string; color: string };
  /** Left out when the expense has no note. */
  note?: string;
  /** The personal space or the group the expense belongs to. */
  spaceId: string;
  /** Each payment's participant is a participant id. */
  payments: Share<string>[];
  /** Each share's participant is a participant id. */
  shares: Share<string>[];
}

interface ExpenseRow extends Omit<
  Expense,
  'category' | 'note' | 'payments' | 'shares'
> {
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  note: string | null;
  payments: string;
  shares: string;
}

/** Every stored expense, in the order of LEDGER-28.1. */
export async function listExpenses(database: SqlExecutor): Promise<Expense[]> {
  const rows = await database.all<ExpenseRow>(`
    SELECT e.*,
      (SELECT json_group_array(json_object('participant', participant, 'amountMinor', amountMinor))
        FROM expense_payments WHERE expenseId = e.id) AS payments,
      (SELECT json_group_array(json_object('participant', participant, 'amountMinor', amountMinor))
        FROM expense_shares WHERE expenseId = e.id) AS shares
    FROM expenses AS e ORDER BY e.date DESC, e.rowid DESC
  `);
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
  }));
}

type ExpenseInput = Pick<
  Expense,
  'title' | 'amountMinor' | 'currency' | 'date' | 'note'
> & { categoryId: string };

export async function savePersonalExpense(
  database: Database,
  identity: LocalIdentity,
  input: ExpenseInput,
  existing?: Expense,
): Promise<void> {
  await database.transaction(async (transaction) => {
    const [category] = await transaction.all<Expense['category']>(
      'SELECT id, name, color FROM categories WHERE id = ?',
      [input.categoryId],
    );
    if (!category) throw new Error('Category not found');
    const id = existing?.id ?? (await createUuid(transaction));
    const values = [
      input.title.trim(),
      input.amountMinor,
      input.date,
      category.id,
      category.name,
      category.color,
      input.note?.trim() || null,
    ];
    if (existing) {
      const result = await transaction.run(
        'UPDATE expenses SET title = ?, amountMinor = ?, date = ?, categoryId = ?, categoryName = ?, categoryColor = ?, note = ? WHERE id = ?',
        [...values, id],
      );
      if (result.changes !== 1) throw new Error('Expense not found');
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
        [...values, id, input.currency, identity.personalSpaceId],
      );
    }
    await transaction.run(
      'INSERT INTO expense_payments (expenseId, participant, amountMinor) VALUES (?, ?, ?)',
      [id, identity.personalParticipantId, input.amountMinor],
    );
    await transaction.run(
      'INSERT INTO expense_shares (expenseId, participant, amountMinor) VALUES (?, ?, ?)',
      [id, identity.personalParticipantId, input.amountMinor],
    );
  });
}
