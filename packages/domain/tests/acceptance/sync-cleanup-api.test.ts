import {
  SNAPSHOT_NEEDED_STATUS,
  isEventsPageResponse,
  isGroupRefusal,
  isSnapshotNeededResponse,
} from '../../src/api';

// The function that tells a phone the API's answer that it needs a snapshot (ADR-0007,
// ADR-0033): the API gives it to a download whose cursor is before events the group no
// longer stores. A value is that answer's body only when it is exactly it.

const BRISBANE = '9b2f6c1e-8d47-4f3a-b1c5-2e7d90a4f6b8';
const SNAPSHOT_NEEDED = { error: 'snapshot-needed' };

describe('SYNC-137.1', () => {
  test('[SYNC-137.1] is the reason alone, under status 410, and neither a refusal of the event API nor a page', () => {
    expect(isSnapshotNeededResponse(SNAPSHOT_NEEDED)).toBe(true);
    expect(SNAPSHOT_NEEDED_STATUS).toBe(410);

    expect(isGroupRefusal(SNAPSHOT_NEEDED)).toBe(false);
    expect(isEventsPageResponse(SNAPSHOT_NEEDED)).toBe(false);
  });

  test.each<[string, unknown]>([
    [
      'with the number the group is cleared to',
      { ...SNAPSHOT_NEEDED, sequence: 5 },
    ],
    ['with a cursor', { ...SNAPSHOT_NEEDED, cursor: 2 }],
    ['with the group ID', { ...SNAPSHOT_NEEDED, groupId: BRISBANE }],
    ['with capitals in the reason', { error: 'Snapshot-Needed' }],
    ['with a space after the reason', { error: 'snapshot-needed ' }],
    ['with the reason of no member device', { error: 'not-a-member' }],
    ['with the reason of a full group', { error: 'group-full' }],
    ['with the reason of a request written wrongly', { error: 'request' }],
    ['with a reason that is no text', { error: 410 }],
    ['with a reason that is empty', { error: null }],
    ['with the reason under another name', { reason: 'snapshot-needed' }],
    ['that is an empty object', {}],
    ['that is nothing', undefined],
    ['that is null', null],
    ['that is the reason as text', 'snapshot-needed'],
    ['that is an array', [SNAPSHOT_NEEDED]],
    ['that is a number', 410],
    ['that is a page', { events: [], more: false }],
  ])('[SYNC-137.1] is not a value %s', (_, value) => {
    // The answer itself, so that this is no test of a function that says no to everything.
    expect(isSnapshotNeededResponse(SNAPSHOT_NEEDED)).toBe(true);

    expect(isSnapshotNeededResponse(value)).toBe(false);
  });
});
