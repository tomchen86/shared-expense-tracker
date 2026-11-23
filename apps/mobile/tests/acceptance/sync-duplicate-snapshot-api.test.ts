import type { SyncSnapshot } from '@shared-expense/domain';
import {
  NOW,
  ledgerOf,
  randomId,
  refusals,
  restart,
  stampOf,
  sync,
  twoPhones,
  uploadAs,
} from './sync-loop-app';
import {
  contentFor,
  endSnapshotWorld,
  newcomer,
  sentSnapshot,
  startSnapshotWorld,
  takeSnapshot,
} from './sync-snapshot-app';

// Runs in Node against the real API (sync-loop-app, sync-snapshot-app). A "not a
// duplicate" record (ADR-0035) is a record of the shared ledger like any other, so a
// snapshot carries it to a phone that was not there when its event was relayed.

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

/** The "not a duplicate" records of a snapshot. */
const distinctIn = (snapshot: SyncSnapshot) =>
  snapshot.records.filter((record) => (record.type as string) === 'distinct');

test('[SYNC-114.2] [SYNC-124.2] a snapshot holds a "not a duplicate" record with its stamp, a new phone stores it, also after a restart, and its own snapshot holds the same record', async () => {
  const setup = await twoPhones({ expenses: ['Dinner'] });
  const { a, b, key } = setup;
  const [dinner] = (await ledgerOf(a)).expenses;
  const id = randomId();
  const stamp = await stampOf(b, NOW);
  const pair = [dinner.id, randomId()];
  await uploadAs(b, key, [
    {
      version: 1,
      stamp,
      type: 'distinct',
      id,
      units: { expenses: { value: pair } },
    },
  ]);
  await sync(a);
  expect(await refusals(a)).toEqual([]);
  let c = await newcomer(setup);

  await sentSnapshot(a, c);

  const given = distinctIn(await contentFor(c, key));
  expect(given).toEqual([
    {
      type: 'distinct',
      id,
      units: { expenses: { value: pair, stamp } },
      created: stamp,
      seeded: false,
    },
  ]);

  expect(await takeSnapshot(c)).toEqual({ outcome: 'imported' });

  c = await restart(c);
  await sentSnapshot(c, a);
  expect(distinctIn(await contentFor(a, key))).toEqual(given);
});
