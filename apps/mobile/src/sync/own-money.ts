import {
  compareSyncStamps,
  overridesSyncMoney,
  sameSyncUnitValue,
  type SyncEvent,
  type SyncMoney,
  type SyncStamp,
} from '@shared-expense/domain';
import type { Expense } from '../ledger/expenses';
import type { SqlExecutor } from '../storage';

// This phone's own money change and the mark that an event or snapshot has overridden
// it (ADR-0029, ADR-0034). Both stay on this phone. Only a local edit sets its own
// money change. Everything here runs inside the caller's transaction.

interface OwnMoney {
  stamp: SyncStamp;
  money: SyncMoney;
}

async function readOwnMoney(
  tx: SqlExecutor,
  expenseId: string,
  where = '',
): Promise<OwnMoney | undefined> {
  const [own] = await tx.all<{ stamp: string; money: string }>(
    `SELECT stamp, money FROM sync_own_money WHERE expenseId = ? ${where}`,
    [expenseId],
  );
  return (
    own && {
      stamp: JSON.parse(own.stamp) as SyncStamp,
      money: JSON.parse(own.money) as SyncMoney,
    }
  );
}

/**
 * Keeps the money of an event this phone wrote, stamped `stamp`, as its own money change
 * of the expense, in place of the one it kept, and takes the expense's mark off
 * (SYNC-129.1).
 */
export async function keepOwnMoney(
  tx: SqlExecutor,
  expenseId: string,
  stamp: SyncStamp,
  money: SyncMoney,
) {
  await tx.run(
    `INSERT INTO sync_own_money (expenseId, stamp, money) VALUES (?, ?, ?)
     ON CONFLICT (expenseId) DO UPDATE
       SET stamp = excluded.stamp, money = excluded.money, overridden = 0`,
    [expenseId, JSON.stringify(stamp), JSON.stringify(money)],
  );
}

async function markOwnMoney(
  tx: SqlExecutor,
  expenseId: string,
  overridden: (own: OwnMoney) => boolean,
): Promise<boolean> {
  const own = await readOwnMoney(tx, expenseId, 'AND overridden = 0');
  if (!own || !overridden(own)) return false;
  await tx.run('UPDATE sync_own_money SET overridden = 1 WHERE expenseId = ?', [
    expenseId,
  ]);
  return true;
}

/** Whether an applied expense event newly marked this phone's money as overridden (SYNC-130.1). */
export function markIfOverridden(tx: SqlExecutor, event: SyncEvent) {
  return markOwnMoney(tx, event.id, (own) =>
    overridesSyncMoney(event, { id: event.id, ...own }),
  );
}

/** A snapshot carries no base. Compare its incoming money, even when the merge keeps another (SYNC-168.1). */
export function markSnapshotMoney(
  tx: SqlExecutor,
  expenseId: string,
  incoming: { stamp: SyncStamp; value: SyncMoney },
) {
  return markOwnMoney(
    tx,
    expenseId,
    (own) =>
      compareSyncStamps(incoming.stamp, own.stamp) > 0 &&
      !sameSyncUnitValue('money', incoming.value, own.money),
  );
}

/**
 * Gives the own money change of the expense the stamp `renamed` gives for the one it
 * holds: the stamp of the unsent event it came from has been replaced (SYNC-133.1).
 */
export async function renameOwnMoney(
  tx: SqlExecutor,
  expenseId: string,
  renamed: (stamp: SyncStamp) => SyncStamp,
) {
  const own = await readOwnMoney(tx, expenseId);
  if (!own) return;
  const stamp = JSON.stringify(renamed(own.stamp));
  await tx.run(
    'UPDATE sync_own_money SET stamp = ? WHERE expenseId = ? AND stamp <> ?',
    [stamp, expenseId, stamp],
  );
}

/** The user's own money of an expense marked as overridden: what Use Mine sets it back to (SYNC-132.1). */
export const readOverriddenMoney = async (tx: SqlExecutor, expenseId: string) =>
  (await readOwnMoney(tx, expenseId, 'AND overridden = 1'))?.money;

/**
 * Forgets this phone's own money change of an expense marked as overridden, and the mark
 * with it: what Keep Current does, and all it does (SYNC-131.1).
 */
export async function forgetOverriddenMoney(
  tx: SqlExecutor,
  expenseId: string,
) {
  await tx.run(
    'DELETE FROM sync_own_money WHERE expenseId = ? AND overridden = 1',
    [expenseId],
  );
}

/**
 * The money the user entered, when the expense needs review (sync spec): it is marked as
 * overridden, it is out of the trash, and the money it holds now is not the user's.
 * `overridden` is the own money change of a marked expense as stored, or null.
 */
export function moneyToReview(
  expense: Expense,
  overridden: string | null,
): SyncMoney | undefined {
  if (overridden === null || expense.trashOrder !== undefined) return undefined;
  const yours = JSON.parse(overridden) as SyncMoney;
  const { amountMinor, currency, payments, shares } = expense;
  const current: SyncMoney = { amountMinor, currency, payments, shares };
  return sameSyncUnitValue('money', current, yours) ? undefined : yours;
}
