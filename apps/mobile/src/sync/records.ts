import {
  changedSyncUnits,
  checkSyncEvent,
  MAX_SYNC_PLAINTEXT_BYTES,
  mergeSyncEvent,
  nextSyncStamp,
  type SyncRecord,
  type SyncRecordType,
  type SyncStamp,
  type SyncUnits,
} from '@shared-expense/domain';
import type { Expense } from '../ledger/expenses';
import { createUuid, type SqlExecutor } from '../storage';

export interface SharedGroup {
  groupId: string;
  device: string;
}

export class SyncEventTooLargeError extends Error {}

export async function sharedGroup(
  tx: SqlExecutor,
  groupId: string,
): Promise<SharedGroup | undefined> {
  const [group] = await tx.all<SharedGroup>(
    'SELECT groupId, device FROM sync_groups WHERE groupId = ?',
    [groupId],
  );
  return group;
}

export async function latestStamp(
  tx: SqlExecutor,
): Promise<SyncStamp | undefined> {
  const [seen] = await tx.all<SyncStamp>(
    'SELECT ms, counter, device FROM sync_clock',
  );
  return seen;
}

export async function saveLatestStamp(tx: SqlExecutor, stamp: SyncStamp) {
  await tx.run(
    'INSERT OR REPLACE INTO sync_clock (singleton, ms, counter, device) VALUES (1, ?, ?, ?)',
    [stamp.ms, stamp.counter, stamp.device],
  );
}

/** A local edit always follows creation, so it keeps the original creation stamp. */
export async function storeLocalRecord(
  tx: SqlExecutor,
  groupId: string,
  record: SyncRecord,
  stamp: SyncStamp,
) {
  await tx.run(
    `INSERT INTO sync_records (groupId, type, id, created, record) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (groupId, type, id) DO UPDATE SET record = excluded.record`,
    [
      groupId,
      record.type,
      record.id,
      JSON.stringify(stamp),
      JSON.stringify(record),
    ],
  );
}

export function expenseSyncValues(expense: Expense): SyncUnits['expense'] {
  const { title, date, category, amountMinor, currency, payments, shares } =
    expense;
  return {
    title,
    date,
    note: expense.note ?? null,
    category,
    money: { amountMinor, currency, payments, shares },
    trashed: expense.trashOrder !== undefined,
  };
}

/** Called inside the transaction that writes the capability's own rows. */
export async function writeLocalChange<T extends SyncRecordType>(
  tx: SqlExecutor,
  group: SharedGroup,
  type: T,
  id: string,
  values: Partial<SyncUnits[T]> | (T extends 'category' ? 'delete' : never),
) {
  const [row] = await tx.all<{ record: string }>(
    'SELECT record FROM sync_records WHERE groupId = ? AND type = ? AND id = ?',
    [group.groupId, type, id],
  );
  const previous = row ? (JSON.parse(row.record) as SyncRecord) : undefined;
  let change;
  if (values === 'delete') {
    change = { deleted: true };
  } else {
    const units = changedSyncUnits(values, previous?.units ?? {});
    if (Object.keys(units).length === 0) return;
    change = { units };
  }

  const stamp = nextSyncStamp({
    seen: await latestStamp(tx),
    nowMs: Date.now(),
    device: group.device,
  });
  const verdict = checkSyncEvent(
    { version: 1, stamp, type, id, ...change },
    null,
  );
  if (verdict.status !== 'valid') throw new Error('Invalid local sync event');
  const content = JSON.stringify(verdict.event);
  if (new TextEncoder().encode(content).byteLength > MAX_SYNC_PLAINTEXT_BYTES)
    throw new SyncEventTooLargeError();

  const { record } = mergeSyncEvent({ record: previous, event: verdict.event });
  await storeLocalRecord(tx, group.groupId, record, stamp);
  await tx.run(
    'INSERT INTO sync_outbox (id, groupId, content) VALUES (?, ?, ?)',
    [await createUuid(tx), group.groupId, content],
  );
  await saveLatestStamp(tx, stamp);
}
