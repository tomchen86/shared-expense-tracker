import {
  MINUTE,
  NOW,
  editExpense,
  ledgerOf,
  setApiTime,
  setClock,
  sync,
  titles,
  twoPhones,
  unsent,
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
// relays a phone's event so that it is refused, so the test hands the phone its own event
// as a download would, received an hour before it was stamped.

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

  expect(
    (await b.sync.listUnappliedChanges(b.database)).map(({ id, reason }) => [
      id,
      reason,
    ]),
  ).toEqual([[own.id, 'clock']]);
  expect(await titles(b)).toEqual(['Brunch']);
  expect(await unsent(b)).toEqual([]);

  setApiTime(NOW + MINUTE);
  setClock(a, NOW + MINUTE);
  await sync(b);
  await sync(a);

  expect(await titles(a)).toEqual(['Brunch']);
  expect(await ledgerOf(a)).toEqual(await ledgerOf(b));
});
