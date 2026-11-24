import {
  GROUP_REFUSAL_STATUS,
  isGroupRefusal,
  isLeaveGroupResponse,
} from '@shared-expense/domain/api';
import { removeGroupMember } from '../groups';
import type { Database } from '../storage';
import {
  fetchGroupKeys,
  rotateGroupKey,
  type RotationPlan,
} from '../sync/key-rotation';
import { GIVE_UP_AFTER_MS, jsonIn, syncGroup } from '../sync/loop';
import { becomeReadOnlyCopy, readOnlyCopyOf } from '../sync/read-only-copy';
import { apiUrl } from './api-address';
import { sendApiRequest } from './api-request';

// Removing the phones of a member, and leaving a shared ledger
// (docs/specs/sharing/spec.md, SHARING-270.1 to 287.1; ADR-0041). What follows a sync by
// itself, rotating the key for a group that needs it, fetching a new key and revoking an
// invite a phone that left knows, has no function here: a sync of the ledger does it.

/** How removing a member who is represented by other phones ended (SHARING-270.1 to 274.1). */
export interface RemoveResult {
  /**
   * `removed`: the API took the phones off, or they were off already. `no-answer`: a
   * request of the sync or of the rotation got no answer. `failed`: anything else.
   */
  outcome: 'removed' | 'no-answer' | 'failed';
}

/** How leaving a shared ledger ended (SHARING-276.1, SHARING-277.1). */
export interface LeaveResult {
  /**
   * `left`: the ledger is a read-only copy on this phone now, also when the API says the
   * phone was no member device any more. `no-answer`: the request got no answer.
   */
  outcome: 'left' | 'no-answer' | 'failed';
}

/** A removal sends its rotation again at most twice (SHARING-274.1). */
const MOST_ROTATIONS = 3;

/**
 * Takes every other phone that represents the member out of the shared ledger and rotates
 * its key, as pressing Remove in the confirmation does (SHARING-270.1). Until the API
 * answers that it rotated, the local data does not change for the removal: the events
 * that say who left reach it as events the next sync downloads (SHARING-273.1).
 */
export async function removeMemberDevices(
  database: Database,
  groupId: string,
  memberId: string,
): Promise<RemoveResult> {
  const url = apiUrl();
  if (!url) return { outcome: 'failed' };
  const ledger = { apiUrl: url, groupId };
  const sync = () => syncGroup(database, ledger);
  try {
    // Whether or not this sync runs to its end: a phone that is behind, or waits for a
    // snapshot, can remove a device too.
    await sync();
    const plan: RotationPlan = { memberId };
    for (let sent = 1; ; sent += 1) {
      const result = await rotateGroupKey(database, ledger, plan);
      switch (result.outcome) {
        case 'rotated':
        case 'rotation-not-needed':
          // The phone's own events, or those of the phone that rotated first, come down.
          await sync().catch(() => undefined);
          return { outcome: 'removed' };
        case 'nobody':
          // The sync brought the events of his leaving: he has no phone to remove.
          await removeGroupMember(database, groupId, memberId).catch(
            () => undefined,
          );
          return { outcome: 'removed' };
        case 'devices':
          if (sent === MOST_ROTATIONS) return { outcome: 'failed' };
          await sync();
          plan.devices = result.devices;
          break;
        case 'epoch':
          if (sent === MOST_ROTATIONS) return { outcome: 'failed' };
          await fetchGroupKeys(database, ledger);
          await sync();
          break;
        case 'no-answer':
          return { outcome: 'no-answer' };
        default:
          // Nothing could be sent, or the API said something else.
          return { outcome: 'failed' };
      }
    }
  } catch {
    return { outcome: 'failed' };
  }
}

/** Leaves the shared ledger, as pressing Leave in the confirmation does (SHARING-276.1). */
export async function leaveSharedGroup(
  database: Database,
  groupId: string,
): Promise<LeaveResult> {
  const url = apiUrl();
  if (!url) return { outcome: 'failed' };
  try {
    // Changes not uploaded yet go first, whether or not this sync runs to its end.
    await syncGroup(database, { apiUrl: url, groupId });
    // That sync was told that this phone is no member device any more.
    if (await readOnlyCopyOf(database, groupId)) return { outcome: 'left' };
    const answer = await sendApiRequest(database, {
      apiUrl: url,
      method: 'POST',
      path: `/groups/${groupId}/leave`,
      giveUpAfterMs: GIVE_UP_AFTER_MS,
    });
    if (answer.outcome === 'no-answer') return { outcome: 'no-answer' };
    if (answer.outcome !== 'answered') return { outcome: 'failed' };
    const said = jsonIn(answer.body);
    const left = answer.status === 200 && isLeaveGroupResponse(said);
    const removed =
      isGroupRefusal(said) &&
      said.error === 'not-a-member' &&
      GROUP_REFUSAL_STATUS[said.error] === answer.status;
    if (!left && !removed) return { outcome: 'failed' };
    await becomeReadOnlyCopy(database, groupId, left ? 'left' : 'not-a-member');
    return { outcome: 'left' };
  } catch {
    return { outcome: 'failed' };
  }
}
