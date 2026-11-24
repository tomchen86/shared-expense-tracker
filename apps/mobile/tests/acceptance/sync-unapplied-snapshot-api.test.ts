import { requestsOf } from './sync-catch-up-app';
import {
  MINUTE,
  NOW,
  addExpense,
  answerNext,
  apiSql,
  editExpense,
  ledgerOf,
  mark,
  noAnswerTo,
  setApiTime,
  setClock,
  storedEvents,
  sync,
  titles,
  twoPhones,
  unsent,
  whenAnswered,
  type Phone,
} from './sync-loop-app';
import {
  endSnapshotWorld,
  sentSnapshot,
  startSnapshotWorld,
  takeSnapshot,
} from './sync-snapshot-app';

// Runs in Node against the real API (sync-loop-app, sync-snapshot-app). What a phone has
// received includes the snapshots it imported (sync spec, SYNC-351.1), so a change of its
// own that every phone refuses goes back to what a snapshot brought. The real API never
// relays a phone's event so that it is refused, so the first test hands the phone its own
// event as a download would, received an hour before it was stamped.
//
// The others let the phone download it: an event the API confirmed stays with the phone
// until its cursor covers it (SYNC-161.1), and one that came back refused is not queued
// again by what queues the others again, a snapshot or a number to go on from. There the
// tests change, in the API's database, when the API says it received the event.

jest.mock(
  'expo-secure-store',
  () =>
    jest
      .requireActual<typeof import('./sync-loop-app')>('./sync-loop-app')
      .secureStoreOfStartingPhone(),
  { virtual: true },
);

jest.mock(
  'expo-crypto',
  () =>
    jest.requireActual<typeof import('./sync-loop-app')>('./sync-loop-app')
      .randomSource,
  { virtual: true },
);

jest.mock('../../src/storage/expo', () => ({}));
jest.mock('../../src/storage/expo-files', () => ({}));

beforeEach(startSnapshotWorld);
afterEach(endSnapshotWorld);

const HOUR = 60 * MINUTE;

/** The changes of the phone's own that were not applied, as event ID and reason. */
const unappliedOn = async (phone: Phone) =>
  (await phone.sync.listUnappliedChanges(phone.database)).map(
    ({ id, reason }) => [id, reason],
  );

/** The sequence numbers of the events the API stores for the group. */
const numbersOf = async (groupId: string) =>
  (await storedEvents(groupId)).map(({ sequence }) => sequence);

/**
 * Taylor's phone adds Dinner and uploads it, and the download after the upload gets no
 * answer: the phone keeps the confirmed event, its cursor still at 0 (SYNC-161.1). The
 * API then says it received the event an hour before its stamp, and the phone's next sync
 * downloads it, so it is refused and taken back. Resolves with the event as written.
 */
async function ownEventCameBackRefused(phone: Phone) {
  await addExpense(phone);
  const [written] = await unsent(phone);
  whenAnswered('POST', async () => noAnswerTo('GET'));
  await sync(phone);
  expect(await unsent(phone)).toEqual([]);
  await apiSql()`
    UPDATE group_events SET received_at_ms = ${written.content.stamp.ms - HOUR}
    WHERE group_id = ${phone.brisbane} AND id = ${written.id}`;
  const from = mark();
  await sync(phone);
  expect(await requestsOf(phone, from)).toEqual(['download after=0']);
  expect(await unappliedOn(phone)).toEqual([[written.id, 'clock']]);
  return written;
}

test("[SYNC-351.1] takes a refused change of the phone's own back to what a snapshot it imported holds, and the two phones end the same", async () => {
  const { a, b } = await twoPhones({ expenses: ['Dinner'] });
  await sync(a);
  await sync(b);
  await editExpense(a, 'Dinner', { title: 'Brunch' });
  await sync(a);
  await sync(a);
  await sentSnapshot(a, b);
  // Casey's phone has not synced since: Brunch reaches it in the snapshot alone.
  setClock(b, NOW + MINUTE);
  await editExpense(b, 'Dinner', { title: 'Supper' });
  expect(await takeSnapshot(b)).toEqual({ outcome: 'imported' });
  expect(await titles(b)).toEqual(['Supper']);
  const [own] = await unsent(b);

  await b.sync.applySyncEvents(b.database, b.brisbane, [
    {
      id: own.id,
      device: own.content.stamp.device,
      receivedAtMs: own.content.stamp.ms - HOUR,
      content: own.content,
    },
  ]);

  expect(await unappliedOn(b)).toEqual([[own.id, 'clock']]);
  expect(await titles(b)).toEqual(['Brunch']);
  expect(await unsent(b)).toEqual([]);

  setApiTime(NOW + MINUTE);
  setClock(a, NOW + MINUTE);
  await sync(b);
  await sync(a);

  expect(await titles(a)).toEqual(['Brunch']);
  expect(await ledgerOf(a)).toEqual(await ledgerOf(b));
});

test("[SYNC-161.1] [SYNC-351.1] does not queue a refused event of the phone's own again when the phone takes a snapshot in", async () => {
  const { a, b, brisbane } = await twoPhones();
  const written = await ownEventCameBackRefused(a);
  await sync(b);
  await sentSnapshot(b, a);

  expect(await takeSnapshot(a)).toEqual({ outcome: 'imported' });

  expect(await unsent(a)).toEqual([]);
  const from = mark();
  await sync(a);
  expect(await requestsOf(a, from)).toEqual(['download after=1']);
  expect(await numbersOf(brisbane)).toEqual([1]);
  expect(await titles(a)).toEqual([]);
  expect(await unappliedOn(a)).toEqual([[written.id, 'clock']]);
});

test("[SYNC-161.1] [SYNC-351.1] does not queue a refused event of the phone's own again when the API tells the phone to go on from a later number", async () => {
  const { a, brisbane } = await twoPhones();
  const written = await ownEventCameBackRefused(a);
  answerNext('GET', 410, { error: 'continue', after: 2 });
  const from = mark();

  await sync(a);

  // The cursor moved, which queues again what the phone still keeps: it keeps nothing.
  expect(await requestsOf(a, from)).toEqual([
    'download after=1',
    'download after=2',
  ]);
  expect(await unsent(a)).toEqual([]);
  expect(await numbersOf(brisbane)).toEqual([1]);
  expect(await unappliedOn(a)).toEqual([[written.id, 'clock']]);
});
