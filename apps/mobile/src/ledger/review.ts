import type { Database } from '../storage';
import { forgetOverriddenMoney, readOverriddenMoney } from '../sync/own-money';
import { sharedGroup, writeLocalChange } from '../sync/records';
import {
  notifyExpensesChanged,
  readExpense,
  writeExpenseRows,
} from './expenses';

// What the user chooses for an expense that needs review (sync spec): one whose money
// another phone changed without having seen this phone's own change of it. Either choice
// settles the expense, and does nothing to an expense that is settled already.

/**
 * Keep Current: the expense stays as it is and no event is written. The phone forgets its
 * own money change of the expense, and the mark with it (SYNC-131.1).
 */
export async function keepCurrentMoney(database: Database, expenseId: string) {
  await database.transaction((tx) => forgetOverriddenMoney(tx, expenseId));
  notifyExpensesChanged(database);
}

/**
 * Use Mine: sets the expense's money back to the user's own as one more change of the
 * expense, written as an event based on the money it replaces (SYNC-132.1). Saves
 * nothing once the expense has been settled.
 */
export async function restoreOwnMoney(database: Database, expenseId: string) {
  await database.transaction(async (tx) => {
    const yours = await readOverriddenMoney(tx, expenseId);
    if (!yours) return;
    // Only an expense of a shared ledger has an own money change, and it goes with its expense.
    const expense = (await readExpense(tx, expenseId))!;
    const group = (await sharedGroup(tx, expense.spaceId))!;
    await writeExpenseRows(tx, { ...expense, ...yours }, true);
    await writeLocalChange(tx, group, 'expense', expenseId, { money: yours });
  });
  notifyExpensesChanged(database);
}
