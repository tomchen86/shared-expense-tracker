import {
  compareSyncStamps,
  type SyncEvent,
  type SyncRecord,
  type SyncStamp,
} from '@shared-expense/domain';
import type { SqlExecutor } from '../storage';
import { forgetRefusedMoney } from './own-money';
import {
  mergeRecordEvent,
  readReceived,
  readSyncRecord,
  storeSyncRecord,
  type StoredRecord,
} from './records';
import type { ReceivedSyncEvent } from './apply';

type Unit = { stamp: SyncStamp; value: unknown };

/** Only the address and stamp are needed. Even an event with malformed units can have both. */
function targetOf(content: unknown) {
  const event = content as Partial<SyncEvent> | null;
  if (
    typeof event?.type === 'string' &&
    typeof event.id === 'string' &&
    typeof event.stamp?.ms === 'number' &&
    typeof event.stamp.counter === 'number' &&
    typeof event.stamp.device === 'string'
  ) {
    return {
      type: event.type,
      id: event.id,
      stamp: event.stamp,
      deleted: 'deleted' in event && event.deleted === true,
      units: 'units' in event ? event.units : undefined,
    };
  }
}

/** Replace only the rejected stamp. Later local writes may already have left the outbox. */
function withoutStamp(
  current: StoredRecord,
  target: NonNullable<ReturnType<typeof targetOf>>,
  replacement: StoredRecord | undefined,
) {
  const { record } = current;
  const matches = (held: SyncStamp | undefined) =>
    held && compareSyncStamps(held, target.stamp) === 0;
  if (target.deleted && matches(record.deleted)) return replacement;

  const units: Record<string, Unit> = { ...record.units };
  const restored: Record<string, Unit> = replacement?.record.units ?? {};
  for (const [name, unit] of Object.entries(units)) {
    if (
      !matches(unit.stamp) ||
      !target.units ||
      !Object.hasOwn(target.units, name)
    )
      continue;
    if (restored[name]) units[name] = restored[name];
    else delete units[name];
  }
  const surviving = Object.values(units).map((unit) => unit.stamp);
  if (record.deleted) surviving.push(record.deleted);
  if (surviving.length === 0) return undefined;
  // When creation was refused, an already-uploaded surviving edit can be the first
  // remaining stamp. A seeded creation always keeps its original place.
  let created = current.created;
  if (matches(created)) {
    created = replacement?.created ?? surviving[0];
    if (!replacement?.seeded)
      for (const held of surviving)
        if (compareSyncStamps(held, created) < 0) created = held;
  }
  return {
    record: { ...record, units } as SyncRecord,
    created,
    seeded: current.seeded,
  };
}

/** Inside the delivery transaction. Returns the change to project into the capability tables. */
export async function undoRefusedEvent(
  tx: SqlExecutor,
  groupId: string,
  received: ReceivedSyncEvent,
  repeated: boolean,
) {
  const [pending] = await tx.all<{ content: string }>(
    'SELECT content FROM sync_outbox WHERE groupId = ? AND id = ?',
    [groupId, received.id],
  );
  if (repeated && !pending) return;
  if (pending)
    await tx.run('DELETE FROM sync_outbox WHERE groupId = ? AND id = ?', [
      groupId,
      received.id,
    ]);
  // A stamp check can have renamed the local copy since the API accepted this event ID.
  const target = targetOf(
    pending ? JSON.parse(pending.content) : received.content,
  );
  if (!target) return;
  const { type, id, stamp } = target;
  const previous = await readSyncRecord(tx, groupId, type, id);
  if (!previous) return;
  if (type === 'expense') await forgetRefusedMoney(tx, id, stamp);

  const held = [
    previous.created,
    previous.record.deleted,
    ...Object.values<Unit>(previous.record.units).map((unit) => unit.stamp),
  ];
  if (!held.some((value) => value && compareSyncStamps(value, stamp) === 0))
    return;
  const receivedResult = await readReceived(tx, groupId, target);
  if (!receivedResult) return; // The current record itself is the received result.
  let replacement = receivedResult.state;
  const remaining = await tx.all<{ content: string }>(
    `SELECT content FROM sync_outbox WHERE groupId = ?
    AND json_extract(content, '$.type') = ? AND json_extract(content, '$.id') = ? ORDER BY position`,
    [groupId, type, id],
  );
  for (const row of remaining)
    replacement = mergeRecordEvent(
      replacement,
      JSON.parse(row.content) as SyncEvent,
    );
  const next = withoutStamp(previous, target, replacement);
  if (next)
    await storeSyncRecord(tx, groupId, next.record, next.created, next.seeded);
  else
    await tx.run(
      'DELETE FROM sync_records WHERE groupId = ? AND type = ? AND id = ?',
      [groupId, type, id],
    );
  return {
    previous: previous.record,
    record: next?.record ?? { type, id, units: {} },
  };
}
