import { toLocalDate } from '@shared-expense/domain';
import { formatExpenseDate } from '../ledger/format-date';
import type { Database, SqlExecutor } from '../storage';
import { notifyApplied } from './apply';
import { countGroupUnapplied } from './unapplied';

const UPDATE_NOTICE =
  'This group has changes from a newer version of the app. Update the app to see them.';
const FULL_NOTICE =
  'This group has reached its storage limit. New changes stay on this phone until there is room.';
const WAITING_NOTICE =
  'This group is out of date. It will catch up after another member opens the app.';
const OFFLINE_NOTICE =
  'Connect to the internet to sync this group. New changes stay on this phone until then.';
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

/** The phone's clock when this ledger last received a page, including an empty page. */
export async function lastSyncedAt(database: SqlExecutor, groupId: string) {
  const [ledger] = await database.all<{ lastSyncedAt: number | null }>(
    'SELECT lastSyncedAt FROM sync_groups WHERE groupId = ? AND readOnly IS NULL',
    [groupId],
  );
  return ledger?.lastSyncedAt ?? null;
}

// A local calendar date, or no answer. Both are decided only when a sync ends and
// forgotten on restart (SYNC-315.1, SYNC-316.1).
const noAnswer = Symbol('no answer');
type EndNotice = string | typeof noAnswer;
const endNotices = new WeakMap<SqlExecutor, Map<string, EndNotice>>();

export async function recordSyncEnd(
  database: Database,
  groupId: string,
  unanswered: boolean,
) {
  const last = await lastSyncedAt(database, groupId);
  let next: EndNotice | undefined;
  if (last !== null && Date.now() - last >= THREE_DAYS_MS)
    next = toLocalDate(
      new Date(last),
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    );
  else if (unanswered) next = noAnswer;

  const notices = endNotices.get(database) ?? new Map<string, EndNotice>();
  if (next === notices.get(groupId)) return;
  if (next === undefined) notices.delete(groupId);
  else notices.set(groupId, next);
  endNotices.set(database, notices);
  notifyApplied(database, groupId);
}

/** The lines under the group's title, followed on screen by its action buttons. */
export async function readSyncNotices(
  database: SqlExecutor,
  groupId: string,
  locale = 'en',
) {
  const [[ledger], unapplied] = await Promise.all([
    database.all<{
      waitsForUpdate: number;
      groupFull: number;
      waitsForSnapshot: number;
      snapshotNeedsUpdate: number;
    }>(
      `SELECT waitsForUpdate, groupFull, waitsForSnapshot,
              waitsForSnapshot AND snapshotNeedingUpdate IS NOT NULL AS snapshotNeedsUpdate
       FROM sync_groups WHERE groupId = ? AND readOnly IS NULL`,
      [groupId],
    ),
    countGroupUnapplied(database, groupId),
  ]);
  const lines: string[] = [];
  if (ledger) {
    if (ledger.waitsForUpdate || ledger.snapshotNeedsUpdate)
      lines.push(UPDATE_NOTICE);
    if (ledger.groupFull) lines.push(FULL_NOTICE);
    if (ledger.waitsForSnapshot) {
      if (!ledger.snapshotNeedsUpdate) lines.push(WAITING_NOTICE);
    } else {
      const ended = endNotices.get(database)?.get(groupId);
      if (ended === noAnswer) lines.push(OFFLINE_NOTICE);
      else if (ended)
        lines.push(
          `Last synced ${formatExpenseDate(ended, locale)}. Pull down to sync.`,
        );
    }
  }
  return { lines, unapplied };
}
