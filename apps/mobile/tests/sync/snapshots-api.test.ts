import { dirname } from 'node:path';
import { exportData } from '../../src/backup/export';
import {
  createTemporaryDirectory,
  shareFile,
} from '../../src/storage/expo-files';
import {
  UPDATE_NOTICE,
  noticesOf,
  requestsOf,
  taylorBehind,
} from '../acceptance/sync-catch-up-app';
import {
  NOW,
  Prepared,
  addExpense,
  answerNext as answerEventRequest,
  apiUrl,
  copyOfData,
  deviceId,
  everythingIn,
  failSecureStoreReads,
  giveKey,
  importData as importCopy,
  keyOf,
  loseSeed,
  mark,
  noAnswerTo as noEventAnswerTo,
  randomKey,
  sealed,
  secureStoreWorks,
  sent,
  setEpoch,
  sync,
  twoPhones,
  unsent,
  uploadAs,
  whenAnswered as whenEventAnswered,
} from '../acceptance/sync-loop-app';
import {
  answerNext,
  contentFor,
  downloadsOf,
  endSnapshotWorld,
  inviteEvent,
  invitesIn,
  newInvite,
  newcomer,
  noAnswerTo,
  plant,
  sendSnapshot,
  sentSnapshot,
  snapshotRequests,
  startSnapshotWorld,
  takeSnapshot,
  uploadedChunks,
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
jest.mock('../../src/storage/expo-files', () => ({
  openDatabaseFile: jest.requireActual<typeof import('../../src/storage/node')>(
    '../../src/storage/node',
  ).openNodeDatabase,
  createTemporaryDirectory: jest.fn(),
  shareFile: jest.fn(),
  removeTemporaryFiles: async () => undefined,
}));

beforeEach(startSnapshotWorld);
afterEach(endSnapshotWorld);

test.each(['snapshot', 'continue'])(
  'a sync can use both recovery replies with %s first',
  async (first) => {
    const { a, b } = await twoPhones();
    await addExpense(b, { title: 'Lunch' });
    await addExpense(b, { title: 'Taxi' });
    await sync(b);
    await sentSnapshot(b, a);
    await addExpense(b, { title: 'Coffee' });
    await sync(b);
    await addExpense(a);

    const needsSnapshot = { error: 'snapshot-needed' };
    if (first === 'snapshot') {
      answerEventRequest('GET', 410, needsSnapshot);
      whenAnswered('GET', 0, async () =>
        answerEventRequest('GET', 410, { error: 'continue', after: 3 }),
      );
    } else {
      answerEventRequest('GET', 410, { error: 'continue', after: 1 });
      answerEventRequest('GET', 410, needsSnapshot);
    }
    const from = mark();
    await sync(a);

    expect(await requestsOf(a, from)).toEqual([
      'download after=0',
      ...(first === 'snapshot'
        ? ['ask', 'get chunk 0', 'download after=2', 'download after=3']
        : ['download after=1', 'ask', 'get chunk 0', 'download after=2']),
      'upload',
      'download after=3',
    ]);
    expect(await unsent(a)).toEqual([]);
  },
);

test('a backup restored while fetching a snapshot can already cover it', async () => {
  const { a, b } = await twoPhones();
  const before = await copyOfData(a);
  await addExpense(b, { title: 'Lunch' });
  await sync(b);
  await sync(a);
  await addExpense(a);
  const waiting = await unsent(a);
  const after = await copyOfData(a);
  await importCopy(a, before);
  await sentSnapshot(b, a);

  answerEventRequest('GET', 410, { error: 'snapshot-needed' });
  whenAnswered('GET', 0, () => importCopy(a, after));
  const from = mark();
  await sync(a);

  expect(await requestsOf(a, from)).toEqual([
    'download after=0',
    'ask',
    'get chunk 0',
  ]);
  expect(await unsent(a)).toEqual(waiting);
});

test('an interrupted snapshot download keeps the update notice only for the same snapshot', async () => {
  const { a, b, key } = await taylorBehind();
  const { sequence } = await sentSnapshot(b, a);
  const content = await contentFor(a, key);
  await plant(b, a, key, { ...content, version: 2 }, { sequence });
  await sync(a);
  expect(await noticesOf(a)).toEqual([UPDATE_NOTICE]);

  noAnswerTo('GET', 'ask');
  await sync(a);
  noAnswerTo('GET', 0);
  await sync(a);
  expect(await noticesOf(a)).toEqual([UPDATE_NOTICE]);

  await sentSnapshot(b, a);
  noAnswerTo('GET', 0);
  await sync(a);
  expect(await noticesOf(a)).toEqual([]);
});

test('a backup restores a retained upload alongside a later unsent event', async () => {
  const { a, b } = await twoPhones();
  await addExpense(a);
  const [retained] = await unsent(a);
  whenEventAnswered('POST', async () => noEventAnswerTo('GET'));
  await sync(a);
  await addExpense(a, { title: 'Lunch' });
  const [later] = await unsent(a);

  jest.mocked(createTemporaryDirectory).mockResolvedValue(dirname(a.file));
  await exportData(a.database);
  const [[file]] = jest.mocked(shareFile).mock.calls;
  await sync(a);
  expect(await unsent(a)).toEqual([]);
  // Through the harness: the import reads the secure store of the phone it runs on.
  await importCopy(a, file);
  expect(await unsent(a)).toEqual([later]);

  await sync(b);
  await sentSnapshot(b, a);
  expect(await takeSnapshot(a)).toEqual({ outcome: 'imported' });
  expect(await unsent(a)).toEqual([retained, later]);
});

test('a signed page response exposes the snapshot recipient header to its caller', async () => {
  const { a, b, A, brisbane } = await twoPhones();
  expect(await takeSnapshot(a)).toEqual({ outcome: 'none' });
  const response = await b.sharing.sendApiRequest(b.database, {
    apiUrl: apiUrl(),
    method: 'GET',
    path: `/groups/${brisbane}/events?after=0`,
  });
  expect(response).toMatchObject({
    outcome: 'answered',
    status: 200,
    snapshotNeededBy: A,
  });
});

test('a retained upload goes ahead of an older event whose content a backup restored during confirmation', async () => {
  const { a, b, A, brisbane, key } = await twoPhones();
  await addExpense(a);
  await addExpense(a, { title: 'Lunch' });
  const [older, later] = await unsent(a);
  const copy = await copyOfData(a);
  // The API already has the earlier event with a corrected stamp.
  const envelope = {
    groupId: brisbane,
    eventId: older.id,
    deviceId: A,
    epoch: 1,
  };
  const corrected = {
    ...older.content,
    stamp: { ...older.content.stamp, ms: NOW + 1 },
  };
  await uploadAs(a, key, [
    new Prepared(older.id, sealed(key, envelope, corrected)),
  ]);
  whenEventAnswered('POST', async () => {
    await importCopy(a, copy);
    noEventAnswerTo('POST');
    noEventAnswerTo('GET');
  });
  await sync(a);
  expect(await unsent(a)).toEqual([older]);

  await sync(b);
  await sentSnapshot(b, a);
  expect(await takeSnapshot(a)).toEqual({ outcome: 'imported' });
  expect(await unsent(a)).toEqual([later, older]);
});

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

test('a database error reading the device identity reaches the snapshot caller', async () => {
  const { a, B } = await twoPhones();
  const from = mark();
  const error = new Error('Cannot read the identity row');
  const read = jest.spyOn(a.database, 'all').mockRejectedValue(error);
  try {
    await expect(takeSnapshot(a)).rejects.toBe(error);
    await expect(sendSnapshot(a, B)).rejects.toBe(error);
    expect(snapshotRequests(from)).toEqual([]);
  } finally {
    read.mockRestore();
  }
});

test('an unreadable device seed stops the upload before the first request', async () => {
  const { a, A, B } = await twoPhones();
  const error = new Error('Cannot read the seed');
  const store = a.state.store;
  const get = store.get.bind(store);
  const read = jest.spyOn(store, 'get').mockImplementation((key) => {
    if (key === `device-seed.${A}`) throw error;
    return get(key);
  });
  const from = mark();
  try {
    await expect(sendSnapshot(a, B)).resolves.toEqual({ outcome: 'no-key' });
    expect(sent().slice(from)).toEqual([]);
    await expect(a.sharing.readDeviceIdentity(a.database)).rejects.toBe(error);
  } finally {
    read.mockRestore();
  }
});

test('an unreadable key for the requested epoch stops the retry', async () => {
  const { a, B, brisbane } = await twoPhones();
  await setEpoch(brisbane, 2);
  giveKey(a, brisbane, 2, randomKey());
  const from = mark();
  whenAnswered('PUT', 0, async () => failSecureStoreReads(a));

  expect(await sendSnapshot(a, B)).toEqual({ outcome: 'no-key' });
  expect(
    uploadedChunks(from).map(({ epoch, status }) => [epoch, status]),
  ).toEqual([[1, 409]]);
  secureStoreWorks(a);
  await sentSnapshot(a, B);
});

test('the snapshot includes every live link, even with another invite pending, up to the instant of expiry', async () => {
  const { a, b, B, brisbane, key } = await twoPhones();
  const live = [newInvite(NOW + 1), newInvite(NOW + 2)];
  const expired = newInvite(NOW);
  const pending = newInvite(NOW + 3);
  await uploadAs(
    b,
    key,
    [...live, expired].map((invite, counter) =>
      inviteEvent(invite, { ms: NOW, counter, device: B }),
    ),
  );
  await sync(a);
  await a.database.run(
    'INSERT INTO pending_invites (groupId, code, secret) VALUES (?, ?, ?)',
    [brisbane, pending.code, pending.secret],
  );

  await sentSnapshot(a, b);
  const content = await contentFor(b, key);
  expect(
    invitesIn(content)
      .map(({ id }) => id)
      .sort(),
  ).toEqual(live.map(({ code }) => code).sort());
  expect(JSON.stringify(content)).not.toContain(pending.secret);
});

test('an invite listed before the members uses the imported ledger for its card', async () => {
  const setup = await twoPhones();
  const { a, b, B, key, brisbane } = setup;
  const c = await newcomer(setup);
  const invite = newInvite(NOW + 60_000);
  await uploadAs(b, key, [
    inviteEvent(invite, { ms: NOW, counter: 0, device: B }),
  ]);
  await sync(a);
  await sentSnapshot(a, c);
  const content = await contentFor(c, key);
  const records = [
    ...invitesIn(content),
    ...content.records.filter((r) => r.type !== 'invite'),
  ];
  await plant(
    a,
    c,
    key,
    { ...content, records },
    { sequence: content.sequence },
  );

  expect(await takeSnapshot(c)).toEqual({ outcome: 'imported' });
  const { readCard } = jest.requireActual<
    typeof import('../../src/sharing/invite-card')
  >('../../src/sharing/invite-card');
  const card = await readCard(c.database, brisbane);
  expect(card.members).toBe(3);
  expect(
    await c.database.all('SELECT cardHash FROM group_invites WHERE id = ?', [
      invite.code,
    ]),
  ).toEqual([{ cardHash: card.hash }]);
});

test('a code already revoked in another ledger leaves no sync record in the imported ledger', async () => {
  const { a, b, A, key, tokyo } = await twoPhones({ tokyoShared: true });
  const invite = newInvite(NOW + 60_000);
  const stamp = { ms: NOW, counter: 0, device: A };
  await uploadAs(
    a,
    keyOf(a, tokyo),
    [{ version: 1, type: 'invite', id: invite.code, deleted: true, stamp }],
    { groupId: tokyo },
  );
  await sync(a, tokyo);
  await uploadAs(a, key, [inviteEvent(invite, stamp)]);
  await sync(b);
  await sentSnapshot(b, a);

  expect(await takeSnapshot(a)).toEqual({ outcome: 'imported' });
  expect(
    await a.database.all(
      "SELECT groupId FROM sync_records WHERE type = 'invite' AND id = ?",
      [invite.code],
    ),
  ).toEqual([{ groupId: tokyo }]);
  expect(
    await a.database.all('SELECT id FROM group_invites WHERE id = ?', [
      invite.code,
    ]),
  ).toEqual([]);
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
