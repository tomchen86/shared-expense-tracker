import {
  deviceId,
  everythingIn,
  failSecureStoreReads,
  loseSeed,
  mark,
  secureStoreWorks,
  twoPhones,
} from '../acceptance/sync-loop-app';
import {
  answerNext,
  downloadsOf,
  endSnapshotWorld,
  newcomer,
  noAnswerTo,
  sendSnapshot,
  sentSnapshot,
  snapshotRequests,
  startSnapshotWorld,
  takeSnapshot,
  whenAnswered,
} from '../acceptance/sync-snapshot-app';

jest.mock(
  'expo-secure-store',
  () =>
    jest
      .requireActual<typeof import('../acceptance/sync-loop-app')>(
        '../acceptance/sync-loop-app',
      )
      .secureStoreOfStartingPhone(),
  { virtual: true },
);
jest.mock(
  'expo-crypto',
  () =>
    jest.requireActual<typeof import('../acceptance/sync-loop-app')>(
      '../acceptance/sync-loop-app',
    ).randomSource,
  { virtual: true },
);
jest.mock('../../src/storage/expo', () => ({}));
jest.mock('../../src/storage/expo-files', () => ({}));

beforeEach(startSnapshotWorld);
afterEach(endSnapshotWorld);

test('losing access to the seed between chunks leaves the ledger untouched and the download can be retried', async () => {
  const expenses = Array.from({ length: 5 }, (_, i) =>
    String(i).padEnd(60_000, 'x'),
  );
  const setup = await twoPhones({ expenses });
  const phone = await newcomer(setup);
  await sentSnapshot(setup.a, phone);
  const before = everythingIn(phone);
  const from = mark();
  whenAnswered('GET', 0, async () => failSecureStoreReads(phone));
  expect(await takeSnapshot(phone)).toEqual({ outcome: 'no-key' });
  expect(downloadsOf(from)).toEqual(['ask', '0']);
  expect(everythingIn(phone)).toEqual(before);
  secureStoreWorks(phone);
  expect(await takeSnapshot(phone)).toEqual({ outcome: 'imported' });
});

test('a database error while preparing the lookup reaches the caller', async () => {
  const phone = await newcomer(await twoPhones());
  const from = mark();
  const error = new Error('Cannot read the identity row');
  const read = jest.spyOn(phone.database, 'all').mockRejectedValueOnce(error);
  try {
    await expect(takeSnapshot(phone)).rejects.toBe(error);
    expect(snapshotRequests(from)).toEqual([]);
  } finally {
    read.mockRestore();
  }
});

test('an unanswered lookup or a refusal with the wrong status leaves the download unstarted', async () => {
  const setup = await twoPhones();
  const phone = await newcomer(setup);
  noAnswerTo('GET', 'ask');
  expect(await takeSnapshot(phone)).toEqual({ outcome: 'failed' });
  for (const refusal of [
    { error: 'snapshots-full' },
    { error: 'no-snapshot', extra: 1 },
  ]) {
    answerNext('GET', 'ask', 404, refusal);
    expect(await takeSnapshot(phone)).toEqual({ outcome: 'failed' });
  }
});

test('an upload requires a readable ledger, a signing identity and a matching refusal body', async () => {
  const setup = await twoPhones();
  const { a } = setup;
  const to = await deviceId(await newcomer(setup));
  for (const [status, body] of [
    [409, { error: 'not-a-member' }],
    [413, { error: 'no-snapshot' }],
    [413, {}],
  ] as const) {
    answerNext('PUT', 0, status, body);
    expect(await sendSnapshot(a, to)).toEqual({ outcome: 'failed' });
  }
  const from = mark();
  await loseSeed(a);
  expect(await sendSnapshot(a, to)).toEqual({ outcome: 'failed' });
  await a.database.run(
    "UPDATE sync_records SET record = '{}' WHERE groupId = ? AND type = 'group'",
    [a.brisbane],
  );
  await expect(sendSnapshot(a, to)).rejects.toThrow(
    'Invalid snapshot in local data',
  );
  expect(snapshotRequests(from)).toEqual([]);
});
