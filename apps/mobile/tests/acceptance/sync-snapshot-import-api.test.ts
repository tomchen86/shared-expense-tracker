import type {
  SyncSnapshot,
  SyncSnapshotRecord,
  SyncStamp,
} from '@shared-expense/domain';
import {
  MINUTE,
  NOW,
  T,
  addCategory,
  addExpense,
  addMember,
  addPersonalExpense,
  apiUrl,
  archiveCategory,
  categoryOf,
  created,
  deleteCategory,
  deviceId,
  downloads,
  editExpense,
  everythingIn,
  failSecureStoreReads,
  failingAtWrite,
  giveKey,
  keyOf,
  ledgerOf,
  localDataHolds,
  mark,
  memberIds,
  mostRequestsAtOnce,
  moveToTrash,
  randomId,
  randomKey,
  refusals,
  renameGroup,
  restart,
  saveKey,
  secureStoreWorks,
  send,
  sent,
  setApiTime,
  setClock,
  setEpoch,
  stampOf,
  sync,
  titles,
  twoPhones,
  unsent,
  uploadAs,
  uploads,
  utf8,
  type Phone,
  type Setup,
} from './sync-loop-app';
import {
  afterSixtySeconds,
  answerNext,
  associatedData,
  contentFor,
  downloadsOf,
  endSnapshotWorld,
  faultsLeft,
  fetched,
  join,
  neverAnswer,
  newcomer,
  noAnswerTo,
  plant,
  recordWith,
  sendSnapshot,
  sentSnapshot,
  sorted,
  startSnapshotWorld,
  takeSnapshot,
  uploadedChunks,
  whenAnswered,
} from './sync-snapshot-app';

// Runs in Node against the real API (sync-loop-app, sync-snapshot-app): a phone fetches the
// snapshot a group stores for it, opens and judges it, and merges it into its local data in
// one transaction (ADR-0028). Afterwards it syncs on from the event after the snapshot.

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

const IMPORTED = { outcome: 'imported' };
const FAILED = { outcome: 'failed' };
const UNUSABLE = { outcome: 'unusable' };

/** Twelve titles of 60,000 characters: with them a snapshot of Brisbane takes three chunks. */
const LONG_TITLES = Array.from({ length: 12 }, (_, index) =>
  String(index).padStart(2, '0').padEnd(60_000, 'x'),
);

/** Hands the phone events as the API would relay them, each uploaded by the device its stamp names when the stamp was made. */
async function apply(
  phone: Phone,
  contents: readonly ({ stamp: SyncStamp } & Record<string, unknown>)[],
  groupId = phone.brisbane,
) {
  setClock(phone, phone.state.clockMs);
  await phone.sync.applySyncEvents(
    phone.database,
    groupId,
    contents.map((content) => ({
      id: randomId(),
      device: content.stamp.device,
      receivedAtMs: content.stamp.ms,
      content,
    })),
  );
}

/** The phone's groups by name, in the order the phone lists them. */
const groupNames = async (phone: Phone) =>
  (await phone.groups.listGroups(phone.database)).map((group) => group.name);

const groupNamed = async (phone: Phone, name: string) => {
  const group = (await phone.groups.listGroups(phone.database)).find(
    (each) => each.name === name,
  );
  if (!group) throw new Error(`No group named ${name}`);
  return group;
};

/** Makes Osaka on the phone, a group of its own, and resolves with its ID. */
async function withOsaka(phone: Phone): Promise<string> {
  setClock(phone, phone.state.clockMs);
  await phone.groups.createGroup(phone.database, 'Osaka', phone.identity);
  return (await groupNamed(phone, 'Osaka')).id;
}

/** The phone's personal expenses, as it stores them. */
const personal = (phone: Phone) =>
  phone.expenses.listExpenses(phone.database, phone.identity.personalSpaceId);

/** The expense of Brisbane with this title, as the phone stores it. */
async function expenseOf(phone: Phone, title: string) {
  const found = (
    await phone.expenses.listExpenses(phone.database, phone.brisbane)
  ).find((expense) => expense.title === title);
  if (!found) throw new Error(`No expense titled ${title}`);
  return found;
}

/** A change to units of a record, as another phone's code would write it. */
const changed = (
  type: string,
  id: string,
  stamp: SyncStamp,
  values: Record<string, unknown>,
) => ({
  version: 1,
  stamp,
  type,
  id,
  units: Object.fromEntries(
    Object.entries(values).map(([unit, value]) => [unit, { value }]),
  ),
});

const deleted = (type: string, id: string, stamp: SyncStamp) => ({
  version: 1,
  stamp,
  type,
  id,
  deleted: true,
});

/** Five events of Casey's phone on the API, which Taylor's phone has applied: its cursor is 5. */
async function fiveEvents({ a, b, key }: Setup) {
  const five = [];
  for (const title of ['One', 'Two', 'Three', 'Four', 'Five']) {
    five.push(await created(b, title, await stampOf(b, NOW)));
  }
  await uploadAs(b, key, five);
  await sync(a);
}

describe('SYNC-121.1', () => {
  test('[SYNC-121.1] asks for the snapshot, then downloads its chunks in order, one at a time, and takes it in', async () => {
    const setup = await twoPhones({ expenses: LONG_TITLES });
    const { a } = setup;
    const c = await newcomer(setup);
    await sentSnapshot(a, c);
    const from = mark();

    expect(await takeSnapshot(c)).toEqual(IMPORTED);

    expect(downloadsOf(from)).toEqual(['ask', '0', '1', '2']);
    expect(mostRequestsAtOnce()).toBe(1);
    expect(await titles(c)).toEqual([...LONG_TITLES].sort());
  });

  test('[SYNC-121.1] opens the chunks with the key of the key epoch the API names', async () => {
    const setup = await twoPhones({ expenses: ['Dinner'] });
    const { a, brisbane } = setup;
    const c = await newcomer(setup);
    const next = randomKey();
    await setEpoch(brisbane, 2);
    await saveKey(a, brisbane, 2, next);
    await sentSnapshot(a, c);
    giveKey(c, brisbane, 2, next);

    expect(await takeSnapshot(c)).toEqual(IMPORTED);

    expect(await titles(c)).toEqual(['Dinner']);
  });

  test('[SYNC-121.1] opens each chunk with its own index and the device the API names', async () => {
    const setup = await twoPhones({ expenses: ['Dinner'] });
    const { a, B, key } = setup;
    const c = await newcomer(setup);
    await sentSnapshot(a, c);
    const content = await contentFor(c, key);
    const half = Math.ceil(utf8(JSON.stringify(content)).length / 2);
    const before = everythingIn(c);

    // Every chunk sealed as chunk 0.
    await plant(a, c, key, content, {
      piece: half,
      seal: (envelope) => associatedData(envelope, 0),
    });
    expect(await takeSnapshot(c)).toEqual(UNUSABLE);
    // Sealed as an upload of Casey's phone, and uploaded by Taylor's.
    await plant(a, c, key, content, {
      piece: half,
      seal: (envelope, index) =>
        associatedData({ ...envelope, deviceId: B }, index),
    });
    expect(await takeSnapshot(c)).toEqual(UNUSABLE);
    expect(everythingIn(c)).toEqual(before);

    // The same content in two chunks, sealed as it should be.
    await plant(a, c, key, content, { piece: half });
    expect(await takeSnapshot(c)).toEqual(IMPORTED);
  });
});

describe('SYNC-122.1', () => {
  test('[SYNC-122.1] reports that there is none when the API says so', async () => {
    const setup = await twoPhones({ expenses: ['Dinner'] });
    const c = await newcomer(setup);
    await sentSnapshot(setup.a, setup.b);
    const before = everythingIn(c);

    expect(await takeSnapshot(c)).toEqual({ outcome: 'none' });

    expect(everythingIn(c)).toEqual(before);
  });

  test('[SYNC-122.1] downloads no chunk without the key of the snapshot’s key epoch', async () => {
    const setup = await twoPhones({ expenses: ['Dinner'] });
    const { a, key, brisbane } = setup;
    const c = await newcomer(setup, { key: false });
    await sentSnapshot(a, c);
    const before = everythingIn(c);
    const from = mark();

    expect(await takeSnapshot(c)).toEqual({ outcome: 'no-key' });
    giveKey(c, brisbane, 2, randomKey());
    expect(await takeSnapshot(c)).toEqual({ outcome: 'no-key' });

    expect(downloadsOf(from)).toEqual(['ask', 'ask']);
    expect(sent().slice(from)).toHaveLength(2);
    expect(everythingIn(c)).toEqual(before);

    giveKey(c, brisbane, 1, key);
    expect(await takeSnapshot(c)).toEqual(IMPORTED);
  });

  test('[SYNC-122.1] reports no key while the secure store cannot be read, whether or not it could ask', async () => {
    const setup = await twoPhones({ expenses: ['Dinner'] });
    const { a } = setup;
    const c = await newcomer(setup);
    await sentSnapshot(a, c);
    const before = everythingIn(c);
    const from = mark();

    // The store answers for the phone's seed, and no longer for the group key.
    whenAnswered('GET', 'ask', async () => failSecureStoreReads(c));
    expect(await takeSnapshot(c)).toEqual({ outcome: 'no-key' });

    expect(faultsLeft()).toBe(0);
    expect(downloadsOf(from)).toEqual(['ask']);
    expect(sent().slice(from)).toHaveLength(1);

    // Now it cannot read its seed either, so it sends nothing (SHARING-30.1).
    expect(await takeSnapshot(c)).toEqual({ outcome: 'no-key' });

    expect(sent().slice(from)).toHaveLength(1);
    expect(everythingIn(c)).toEqual(before);

    secureStoreWorks(c);
    expect(await takeSnapshot(c)).toEqual(IMPORTED);
  });

  test('[SYNC-122.1] a download that stops halfway leaves nothing on the phone, and starts over the next time', async () => {
    const setup = await twoPhones({ expenses: LONG_TITLES });
    const { a } = setup;
    const c = await newcomer(setup);
    const sending = mark();
    await sentSnapshot(a, c);
    const [first] = uploadedChunks(sending);
    const before = everythingIn(c);
    noAnswerTo('GET', 1);
    const from = mark();

    expect(await takeSnapshot(c)).toEqual(FAILED);

    expect(downloadsOf(from)).toEqual(['ask', '0']);
    expect(everythingIn(c)).toEqual(before);
    expect(await groupNames(c)).toEqual([]);
    expect(localDataHolds(c, first.content)).toBe(false);
    // Chunk 0 holds 262,103 bytes of the snapshot, most of them the long titles.
    expect(localDataHolds(c, utf8('x'.repeat(1_000)))).toBe(false);
    expect((await fetched(c))?.snapshotId).toBe(first.snapshotId);

    const again = mark();
    expect(await takeSnapshot(c)).toEqual(IMPORTED);
    expect(downloadsOf(again)).toEqual(['ask', '0', '1', '2']);
  });

  test('[SYNC-122.1] fails when the snapshot is replaced while it downloads, and then takes the new one', async () => {
    const setup = await twoPhones({ expenses: LONG_TITLES });
    const { a } = setup;
    const c = await newcomer(setup);
    await sentSnapshot(a, c);
    const before = everythingIn(c);
    let second: string | undefined;
    whenAnswered('GET', 0, async () => {
      second = (await sentSnapshot(a, c)).snapshotId;
    });

    expect(await takeSnapshot(c)).toEqual(FAILED);

    expect(second).toBeDefined();
    expect(everythingIn(c)).toEqual(before);
    const from = mark();
    expect(await takeSnapshot(c)).toEqual(IMPORTED);
    expect(
      sent()
        .slice(from)
        .filter((request) => request.path.includes(`/${second}/`)),
    ).toHaveLength(3);
  });

  test('[SYNC-122.1] fails on an answer that is not the answer it asked for', async () => {
    const setup = await twoPhones({ expenses: ['Dinner'] });
    const { a, A } = setup;
    const c = await newcomer(setup);
    await sentSnapshot(a, c);
    const before = everythingIn(c);

    for (const body of [
      '{}',
      {
        snapshotId: randomId(),
        deviceId: A,
        epoch: 1,
        sequence: 0,
        count: 65,
      },
      'not json',
    ]) {
      answerNext('GET', 'ask', 200, body);
      expect(await takeSnapshot(c)).toEqual(FAILED);
    }
    answerNext('GET', 'ask', 500, '');
    expect(await takeSnapshot(c)).toEqual(FAILED);
    for (const [status, body] of [
      [200, '{}'],
      [200, { content: 'ABCD' }],
      [500, ''],
      [400, { error: 'request' }],
    ] as const) {
      answerNext('GET', 0, status, body);
      expect(await takeSnapshot(c)).toEqual(FAILED);
    }

    expect(everythingIn(c)).toEqual(before);
    expect(await takeSnapshot(c)).toEqual(IMPORTED);
  });

  test('[SYNC-122.1] fails for a phone that is no member device', async () => {
    const setup = await twoPhones({ expenses: ['Dinner'] });
    const c = await newcomer(setup, { member: false });
    await sentSnapshot(setup.a, c);
    const before = everythingIn(c);

    expect(await takeSnapshot(c)).toEqual(FAILED);

    expect(everythingIn(c)).toEqual(before);
    await join(c, setup.brisbane);
    expect(await takeSnapshot(c)).toEqual(IMPORTED);
  });

  test('[SYNC-122.1] gives up a chunk that has had no answer for 60 seconds', async () => {
    const setup = await twoPhones({ expenses: ['Dinner'] });
    const c = await newcomer(setup);
    await sentSnapshot(setup.a, c);
    const before = everythingIn(c);
    neverAnswer('GET', 0);

    const result = await afterSixtySeconds(c, () => takeSnapshot(c));

    expect(result).toEqual(FAILED);
    expect(everythingIn(c)).toEqual(before);
  });
});

/** A record of a snapshot, for a test to change. */
interface Editable {
  type: string;
  id: string;
  units: Record<string, { value: unknown }>;
}

/** A snapshot of Brisbane as Taylor's phone makes one, for a test to change and plant. */
async function realContent(setup: Setup, c: Phone): Promise<SyncSnapshot> {
  await sentSnapshot(setup.a, c);
  return contentFor(c, setup.key);
}

describe('SYNC-123.1', () => {
  test('[SYNC-123.1] takes nothing of a snapshot with a chunk that does not open', async () => {
    const setup = await twoPhones({ expenses: ['Dinner'] });
    const { a, key } = setup;
    const c = await newcomer(setup);
    const content = await realContent(setup, c);
    const before = everythingIn(c);

    await plant(a, c, key, content, {
      spoil: ([chunk]) => {
        const changed = Uint8Array.from(chunk);
        changed[changed.length - 1] ^= 1;
        return [changed];
      },
    });
    expect(await takeSnapshot(c)).toEqual(UNUSABLE);
    await plant(a, c, randomKey(), content);
    expect(await takeSnapshot(c)).toEqual(UNUSABLE);
    await plant(a, c, key, content, {
      seal: (envelope, index) =>
        associatedData({ ...envelope, count: envelope.count + 1 }, index),
    });
    expect(await takeSnapshot(c)).toEqual(UNUSABLE);

    expect(everythingIn(c)).toEqual(before);
    expect(await groupNames(c)).toEqual([]);
  });

  test('[SYNC-123.1] takes nothing of a snapshot that is no JSON', async () => {
    const setup = await twoPhones();
    const { a, key } = setup;
    const c = await newcomer(setup);
    const before = everythingIn(c);

    for (const bytes of [utf8('hello'), Uint8Array.from([0xff, 0xfe])]) {
      await plant(a, c, key, bytes);
      expect(await takeSnapshot(c)).toEqual(UNUSABLE);
    }

    expect(everythingIn(c)).toEqual(before);
  });

  test('[SYNC-123.1] takes none of the records of a snapshot that is not valid', async () => {
    const setup = await twoPhones({ expenses: ['Dinner'] });
    const { a, key } = setup;
    const c = await newcomer(setup);
    const content = await realContent(setup, c);
    const before = everythingIn(c);
    const records = (change: (record: Editable) => void) =>
      content.records.map((record) => {
        const copy = structuredClone(record) as unknown as Editable;
        change(copy);
        return copy as unknown as SyncSnapshotRecord;
      });
    const invalid: SyncSnapshot[] = [
      {
        ...content,
        records: content.records.filter((record) => record.type !== 'group'),
      },
      {
        ...content,
        records: records((record) => {
          if (record.type !== 'expense') return;
          const money = record.units.money.value as {
            shares: { amountMinor: number }[];
          };
          money.shares[0].amountMinor += 1;
        }),
      },
      {
        ...content,
        records: records((record) => {
          if (record.id === content.uncategorized) {
            record.units.name.value = 'Other';
          }
        }),
      },
    ];

    for (const each of invalid) {
      await plant(a, c, key, each);
      expect(await takeSnapshot(c)).toEqual(UNUSABLE);
    }

    expect(everythingIn(c)).toEqual(before);

    // The same snapshot unchanged is taken in.
    await plant(a, c, key, content);
    expect(await takeSnapshot(c)).toEqual(IMPORTED);
  });

  test('[SYNC-123.1] takes nothing of a snapshot of another group', async () => {
    const setup = await twoPhones({ expenses: ['Dinner'], tokyoShared: true });
    const { a, tokyo } = setup;
    const c = await newcomer(setup);
    const content = await realContent(setup, c);
    const tokyoKey = keyOf(a, tokyo);
    await join(c, tokyo);
    giveKey(c, tokyo, 1, tokyoKey);
    const before = everythingIn(c);

    await plant(a, c, tokyoKey, content, { groupId: tokyo });

    expect(await takeSnapshot(c, tokyo)).toEqual(UNUSABLE);
    expect(everythingIn(c)).toEqual(before);
  });

  test('[SYNC-123.1] waits for an app update when a format version is one it does not know', async () => {
    const setup = await twoPhones({ expenses: ['Dinner'] });
    const { a, key } = setup;
    const c = await newcomer(setup);
    const content = await realContent(setup, c);
    const before = everythingIn(c);
    const UPDATE = { outcome: 'update-needed' };

    await plant(a, c, key, content, {
      spoil: ([chunk]) => {
        const changed = Uint8Array.from(chunk);
        changed[0] = 2;
        return [changed];
      },
    });
    expect(await takeSnapshot(c)).toEqual(UPDATE);
    await plant(a, c, key, { ...content, version: 2 });
    expect(await takeSnapshot(c)).toEqual(UPDATE);
    await plant(a, c, key, { ...content, eventVersion: 2 });
    expect(await takeSnapshot(c)).toEqual(UPDATE);

    expect(everythingIn(c)).toEqual(before);
  });
});

describe('SYNC-124.1', () => {
  test('[SYNC-124.1] takes the snapshot in whole or not at all, whichever write fails', async () => {
    const setup = await twoPhones({ expenses: ['Dinner', 'Lunch'] });
    const { a, brisbane } = setup;
    const c = await newcomer(setup);
    await addPersonalExpense(c, 'Coffee run');
    await sentSnapshot(a, c);
    const before = everythingIn(c);

    let failures = 0;
    for (let nth = 1; ; nth += 1) {
      // A device sends at most 60 requests a minute (SHARING-37.1).
      setApiTime(NOW + nth * MINUTE);
      setClock(c, NOW + nth * MINUTE);
      const { database, failed } = failingAtWrite(c.database, nth);
      const result = await c.sync
        .takeSnapshot(database, { apiUrl: apiUrl(), groupId: brisbane })
        .catch(() => undefined);
      if (!failed()) {
        expect(result).toEqual(IMPORTED);
        break;
      }
      failures += 1;
      expect(result).not.toEqual(IMPORTED);
      expect(everythingIn(c)).toEqual(before);
      if (nth > 500) throw new Error('The import never stopped writing');
    }

    expect(failures).toBeGreaterThan(5);
    expect(await ledgerOf(c)).toEqual(await ledgerOf(a));
    expect((await personal(c)).map((expense) => expense.title)).toEqual([
      'Coffee run',
    ]);
  }, 120_000);

  test('[SYNC-124.1] the cursor is the number the snapshot covers, and stays after a restart', async () => {
    const setup = await twoPhones({ expenses: ['Dinner'] });
    await fiveEvents(setup);
    let c = await newcomer(setup);
    expect(await sendSnapshot(setup.a, c)).toMatchObject({ sequence: 5 });
    expect(await takeSnapshot(c)).toEqual(IMPORTED);
    const from = mark();

    await sync(c);
    c = await restart(c);
    await sync(c);

    expect(await downloads(c, from)).toEqual(['after=5', 'after=5']);
    expect(await ledgerOf(c)).toEqual(await ledgerOf(setup.a));
  });

  test("[SYNC-124.1] the phone's key epoch is the snapshot's", async () => {
    const setup = await twoPhones({ expenses: ['Dinner'] });
    const { a, brisbane } = setup;
    const c = await newcomer(setup, { key: false });
    const next = randomKey();
    await setEpoch(brisbane, 2);
    await saveKey(a, brisbane, 2, next);
    await sentSnapshot(a, c);
    giveKey(c, brisbane, 2, next);
    expect(await takeSnapshot(c)).toEqual(IMPORTED);
    await addExpense(c, { title: 'Coffee' });
    const from = mark();

    await sync(c);

    expect((await uploads(c, from)).map((upload) => upload.epoch)).toEqual([2]);
    expect(await unsent(c)).toEqual([]);
  });

  test('[SYNC-124.1] the latest stamp seen is not earlier than any stamp of the snapshot', async () => {
    const setup = await twoPhones({ expenses: ['Dinner'] });
    const { a, b, key } = setup;
    await uploadAs(b, key, [
      await created(b, 'Lunch', await stampOf(b, T + 6 * MINUTE)),
    ]);
    await sync(a);
    const c = await newcomer(setup);
    await sentSnapshot(a, c);
    expect(await takeSnapshot(c)).toEqual(IMPORTED);

    await addExpense(c, { title: 'Coffee' });

    const [coffee] = await unsent(c);
    expect(coffee.content.stamp).toEqual({
      ms: T + 6 * MINUTE,
      counter: 1,
      device: await deviceId(c),
    });
  });

  test("[SYNC-124.1] keeps the phone's own key epoch and latest stamp where they are higher than the snapshot's", async () => {
    const setup = await twoPhones({ expenses: ['Dinner'] });
    const { a, b, B, brisbane } = setup;
    await sentSnapshot(a, b);
    await setEpoch(brisbane, 2);
    await saveKey(b, brisbane, 2, randomKey());
    setClock(b, T + 5 * MINUTE);
    await editExpense(b, 'Dinner', { title: 'Supper' });
    setClock(b, NOW);
    expect(await takeSnapshot(b)).toEqual(IMPORTED);

    await addExpense(b, { title: 'Coffee' });

    const written = await unsent(b);
    expect(written.map((event) => event.content.stamp)).toEqual([
      { ms: T + 5 * MINUTE, counter: 0, device: B },
      { ms: T + 5 * MINUTE, counter: 1, device: B },
    ]);
    const from = mark();
    await sync(b);
    expect((await uploads(b, from)).map((upload) => upload.epoch)).toEqual([2]);
    expect(await unsent(b)).toEqual([]);
  });

  test('[SYNC-124.1] the order of the records in a snapshot does not change what the phone holds', async () => {
    const setup = await twoPhones({ expenses: ['Dinner', 'Lunch', 'Taxi'] });
    const { a, key } = setup;
    await addCategory(a, 'Flights');
    await addExpense(a, { title: 'Airfare', category: 'Flights' });
    await moveToTrash(a, 'Taxi');
    await sync(a);
    await sync(a);
    const c = await newcomer(setup);
    const content = await realContent(setup, c);
    expect(await takeSnapshot(c)).toEqual(IMPORTED);
    const d = await newcomer(setup, { name: 'second' });
    const reversed = [...content.records].reverse();
    const expensesFirst = [
      ...reversed.filter((record) => record.type === 'expense'),
      ...reversed.filter((record) => record.type !== 'expense'),
    ];

    await plant(a, d, key, { ...content, records: expensesFirst });
    expect(await takeSnapshot(d)).toEqual(IMPORTED);

    expect(await ledgerOf(d)).toEqual(await ledgerOf(c));
    expect(await ledgerOf(d)).toEqual(await ledgerOf(a));
    const order = async (phone: Phone) =>
      (await phone.expenses.listExpenses(phone.database, phone.brisbane)).map(
        (expense) => expense.title,
      );
    expect(await order(d)).toEqual(await order(c));
  });
});

describe('SYNC-125.1', () => {
  test('[SYNC-125.1] a phone that did not have the group has it as a shared ledger, as the events would have left it', async () => {
    const setup = await twoPhones({ expenses: ['Dinner'] });
    const { a } = setup;
    await renameGroup(a, 'Brissie');
    await a.groups.removeGroupMember(
      a.database,
      a.brisbane,
      (await memberIds(a)).Blake,
    );
    await addMember(a, 'Dana');
    await addCategory(a, 'Flights');
    await archiveCategory(a, 'Shopping');
    await deleteCategory(a, 'Other');
    await addExpense(a, { title: 'Lunch', sharers: ['Taylor', 'Casey'] });
    await addExpense(a, { title: 'Taxi', payer: 'Taylor', sharers: ['Dana'] });
    await moveToTrash(a, 'Taxi');
    await sync(a);
    await sync(a);
    const c = await newcomer(setup);
    await addPersonalExpense(c, 'Coffee run');
    await withOsaka(c);
    const mine = await personal(c);
    const osaka = await groupNamed(c, 'Osaka');
    await sentSnapshot(a, c);

    expect(await takeSnapshot(c)).toEqual(IMPORTED);

    expect(await groupNames(c)).toEqual(['Osaka', 'Brissie']);
    const brissie = await groupNamed(c, 'Brissie');
    expect(brissie).toMatchObject({
      id: a.brisbane,
      archived: false,
      shared: true,
    });
    expect(brissie.members.map(({ name, userId }) => [name, userId])).toEqual([
      ['Taylor', null],
      ['Casey', null],
      ['Dana', null],
    ]);
    const ledger = await ledgerOf(c);
    expect(ledger).toEqual(await ledgerOf(a));
    expect(ledger.formerMembers.map(({ name }) => name)).toEqual(['Blake']);
    expect(ledger.categories.map(({ name }) => name)).not.toContain('Other');
    expect(
      ledger.categories.find(({ name }) => name === 'Shopping')?.archived,
    ).toBe(true);
    expect(
      ledger.expenses.map(({ title, trashed }) => [title, trashed]).sort(),
    ).toEqual([
      ['Dinner', false],
      ['Lunch', false],
      ['Taxi', true],
    ]);

    expect(await personal(c)).toEqual(mine);
    expect(await groupNamed(c, 'Osaka')).toEqual(osaka);
  });

  test('[SYNC-125.1] the category the snapshot names is the group’s Uncategorized', async () => {
    const setup = await twoPhones();
    const { a, b, key } = setup;
    await addExpense(a, { title: 'Lunch', category: 'Other' });
    await sync(a);
    await sync(a);
    const other = await categoryOf(a, 'Other');
    await uploadAs(b, key, [
      deleted('category', other.id, await stampOf(b, NOW + 1)),
    ]);
    await sync(a);
    const uncategorized = await categoryOf(a, 'Uncategorized');
    expect((await expenseOf(a, 'Lunch')).category).toEqual(uncategorized);
    const c = await newcomer(setup);
    await sentSnapshot(a, c);

    expect(await takeSnapshot(c)).toEqual(IMPORTED);

    expect(uncategorized).toMatchObject({
      name: 'Uncategorized',
      color: '#757575',
    });
    expect(await categoryOf(c, 'Uncategorized')).toEqual(uncategorized);
    expect((await expenseOf(c, 'Lunch')).category).toEqual(uncategorized);
    const hotels = { id: randomId(), name: 'Hotels', color: '#00ACC1' };
    const taxi = await created(b, 'Taxi', await stampOf(b, NOW + 2));
    await apply(c, [
      {
        ...taxi,
        units: { ...taxi.units, category: { value: hotels } },
      },
    ]);
    expect((await expenseOf(c, 'Taxi')).category).toEqual(uncategorized);
  });

  test('[SYNC-125.1] records that are incomplete or deleted for good stay out of sight, and complete later as events arrive', async () => {
    const setup = await twoPhones();
    const { a, b, key } = setup;
    const [brunch, evan] = [randomId(), randomId()];
    const fuel = await created(b, 'Fuel', await stampOf(b, NOW, 2));
    await uploadAs(b, key, [
      changed('expense', brunch, await stampOf(b, NOW), { title: 'Brunch' }),
      changed('member', evan, await stampOf(b, NOW, 1), { name: 'Evan' }),
      fuel,
      deleted('expense', fuel.id, await stampOf(b, NOW, 3)),
    ]);
    await sync(a);
    const c = await newcomer(setup);
    await sentSnapshot(a, c);

    expect(await takeSnapshot(c)).toEqual(IMPORTED);

    expect(await titles(c)).toEqual([]);
    expect(Object.keys(await memberIds(c))).not.toContain('Evan');

    const rest = Object.fromEntries(
      Object.entries(
        (await created(b, 'Brunch', await stampOf(b, NOW + 1))).units,
      ).filter(([unit]) => unit !== 'title'),
    );
    await apply(c, [
      {
        ...changed('expense', brunch, await stampOf(b, NOW + 1), {}),
        units: rest,
      },
      changed('member', evan, await stampOf(b, NOW + 1, 1), { removed: false }),
      { ...fuel, stamp: await stampOf(b, NOW + 1, 2) },
    ]);
    expect(await titles(c)).toEqual(['Brunch']);
    expect(Object.keys(await memberIds(c))).toContain('Evan');
  });

  test('[SYNC-125.1] expenses of one date and the trash are in the order of their stamps', async () => {
    const setup = await twoPhones();
    const { a, key } = setup;
    for (const title of ['Dinner', 'Lunch', 'Coffee', 'Taxi', 'Snack']) {
      await addExpense(a, { title });
    }
    await moveToTrash(a, 'Taxi');
    await moveToTrash(a, 'Snack');
    await sync(a);
    await sync(a);
    const c = await newcomer(setup);
    await addPersonalExpense(c, 'Old receipt');
    const [receipt] = await personal(c);
    await c.trash.moveExpenseToTrash(
      c.database,
      c.identity.personalSpaceId,
      receipt.id,
    );
    const content = await realContent(setup, c);
    // In no order the phone could rely on.
    await plant(a, c, key, {
      ...content,
      records: sorted(content.records).reverse(),
    });

    expect(await takeSnapshot(c)).toEqual(IMPORTED);

    const all = await c.expenses.listExpenses(c.database);
    expect(
      all
        .filter((expense) => expense.trashOrder === undefined)
        .map((expense) => expense.title),
    ).toEqual(['Coffee', 'Lunch', 'Dinner']);
    expect(
      all
        .filter((expense) => expense.trashOrder !== undefined)
        .sort((x, y) => y.trashOrder! - x.trashOrder!)
        .map((expense) => expense.title),
    ).toEqual(['Snack', 'Taxi', 'Old receipt']);
  });

  test('[SYNC-125.1] an expense was last edited at its latest stamp', async () => {
    const setup = await twoPhones({ expenses: ['Dinner', 'Lunch'] });
    const { a } = setup;
    setApiTime(T + 3 * MINUTE);
    setClock(a, T + 3 * MINUTE);
    await editExpense(a, 'Dinner', { title: 'Supper' });
    await sync(a);
    await sync(a);
    const c = await newcomer(setup);
    setClock(c, T + 3 * MINUTE);
    await sentSnapshot(a, c);

    expect(await takeSnapshot(c)).toEqual(IMPORTED);

    const cards = await c.expenses.listExpensesForCards(c.database);
    expect(cards.find((card) => card.title === 'Supper')?.changedAt).toBe(
      T + 3 * MINUTE,
    );
    expect(cards.find((card) => card.title === 'Lunch')?.changedAt).toBe(T);
  });
});

describe('SYNC-126.1', () => {
  test('[SYNC-126.1] syncs on from the event after the snapshot, and ends up as the phone that got every event', async () => {
    const setup = await twoPhones({ expenses: ['Dinner'] });
    const { a, b, key } = setup;
    await fiveEvents(setup);
    const c = await newcomer(setup);
    expect(await sendSnapshot(a, c)).toMatchObject({ sequence: 5 });
    await addExpense(a, { title: 'Taxi' });
    await sync(a);
    const dinner = await expenseOf(a, 'Dinner');
    await uploadAs(b, key, [
      changed('expense', dinner.id, await stampOf(b, NOW + 1), {
        title: 'Supper',
      }),
    ]);
    expect(await takeSnapshot(c)).toEqual(IMPORTED);
    const from = mark();

    await sync(c);
    await sync(c);
    await sync(a);

    expect(await downloads(c, from)).toEqual(['after=5', 'after=7']);
    const ledger = await ledgerOf(c);
    expect(ledger).toEqual(await ledgerOf(a));
    const found = ledger.expenses.map(({ title }) => title).sort();
    expect(found).toEqual(
      ['Five', 'Four', 'One', 'Supper', 'Taxi', 'Three', 'Two'].sort(),
    );
    expect(await refusals(c)).toEqual([]);
  });

  test('[SYNC-126.1] an event the snapshot already holds changes nothing when it arrives', async () => {
    const setup = await twoPhones();
    const { a } = setup;
    await addExpense(a);
    await sync(a);
    const c = await newcomer(setup);
    expect(await sendSnapshot(a, c)).toMatchObject({ sequence: 0 });
    expect(await takeSnapshot(c)).toEqual(IMPORTED);
    const before = await ledgerOf(c);
    const from = mark();

    await sync(c);

    expect(await downloads(c, from)).toEqual(['after=0']);
    expect(await ledgerOf(c)).toEqual(before);
    expect(await titles(c)).toEqual(['Dinner']);
    expect(await refusals(c)).toEqual([]);
  });

  test('[SYNC-126.1] the two phones then make snapshots with the same records, stamp for stamp', async () => {
    const setup = await twoPhones({ expenses: ['Dinner', 'Lunch'] });
    const { a, b, key } = setup;
    const fuel = await created(b, 'Fuel', await stampOf(b, NOW, 1));
    await uploadAs(b, key, [
      await created(b, 'Taxi', await stampOf(b, NOW)),
      fuel,
      deleted('expense', fuel.id, await stampOf(b, NOW, 2)),
      changed('expense', randomId(), await stampOf(b, NOW, 3), {
        title: 'Brunch',
      }),
      changed('category', randomId(), await stampOf(b, NOW, 4), {
        name: 'Hotels',
        color: '#00ACC1',
        archived: false,
      }),
    ]);
    await editExpense(a, 'Dinner', { title: 'Supper', note: 'Window seat' });
    await deleteCategory(a, 'Other');
    await sync(a);
    await sync(a);
    const c = await newcomer(setup);
    await sentSnapshot(a, c);
    expect(await takeSnapshot(c)).toEqual(IMPORTED);
    await addMember(a, 'Dana');
    await moveToTrash(a, 'Lunch');
    await sync(a);
    await sync(a);
    await sync(c);
    await sync(c);

    await sentSnapshot(a, c);
    const fromTaylor = await contentFor(c, key);
    await sentSnapshot(c, a);
    const fromNewcomer = await contentFor(a, key);

    expect(fromNewcomer.sequence).toBe(fromTaylor.sequence);
    expect(fromNewcomer.uncategorized).toBe(fromTaylor.uncategorized);
    expect(sorted(fromNewcomer.records)).toEqual(sorted(fromTaylor.records));
    expect(fromTaylor.records.some((record) => record.seeded)).toBe(true);
    expect(fromTaylor.records.some((record) => !record.seeded)).toBe(true);
    expect(fromTaylor.records.some((record) => record.deleted)).toBe(true);
  });

  test('[SYNC-126.1] its own changes are events of its device, which the other phones apply', async () => {
    const setup = await twoPhones({ expenses: ['Dinner'] });
    const { a } = setup;
    const c = await newcomer(setup);
    const content = await realContent(setup, c);
    expect(await takeSnapshot(c)).toEqual(IMPORTED);

    await addExpense(c, { title: 'Coffee' });
    await renameGroup(c, 'Brissie');

    const C = await deviceId(c);
    const written = (await unsent(c)).map((event) => event.content);
    expect(written.map((event) => event.stamp.device)).toEqual([C, C]);
    const named = recordWith(content, 'group', 'name', 'Brisbane');
    expect(written[1]).toMatchObject({
      type: 'group',
      units: {
        name: {
          value: 'Brissie',
          base: (named!.units as { name: { stamp: SyncStamp } }).name.stamp,
        },
      },
    });

    await sync(c);
    await sync(a);
    const ledger = await ledgerOf(a);
    expect(ledger).toEqual(await ledgerOf(c));
    expect(ledger.name).toBe('Brissie');
    expect(ledger.expenses.map(({ title }) => title).sort()).toEqual([
      'Coffee',
      'Dinner',
    ]);
  });

  test('[SYNC-126.1] its first sync lets the API delete the snapshot', async () => {
    const setup = await twoPhones({ expenses: ['Dinner'] });
    const c = await newcomer(setup);
    await sentSnapshot(setup.a, c);
    expect(await takeSnapshot(c)).toEqual(IMPORTED);

    await sync(c);

    expect(await fetched(c)).toBeUndefined();
    const before = everythingIn(c);
    expect(await takeSnapshot(c)).toEqual({ outcome: 'none' });
    expect(everythingIn(c)).toEqual(before);
  });
});

describe('SYNC-127.1', () => {
  test('[SYNC-127.1] a phone that has the ledger merges the snapshot, and keeps its unsent events', async () => {
    const setup = await twoPhones({ expenses: ['Dinner'] });
    const { a, b } = setup;
    await sync(a);
    await sync(b);
    // Casey's phone, with no network, at T + 1 minute.
    await editExpense(b, 'Dinner', { title: 'Supper' });
    await addExpense(b, { title: 'Coffee' });
    // Taylor's phone, a minute later.
    setApiTime(NOW + MINUTE);
    setClock(a, NOW + MINUTE);
    await editExpense(a, 'Dinner', { title: 'Brunch', note: 'Window seat' });
    await addExpense(a, { title: 'Lunch' });
    await renameGroup(a, 'Brissie');
    await sync(a);
    await sync(a);
    expect(await sendSnapshot(a, b)).toMatchObject({ sequence: 3 });
    const waiting = await unsent(b);
    expect(waiting).toHaveLength(2);
    // The unsent events as the phone keeps them, with whether each stamp is checked.
    const kept = everythingIn(b).sync_outbox;
    expect(kept).toHaveLength(2);
    setClock(b, NOW + MINUTE);

    expect(await takeSnapshot(b)).toEqual(IMPORTED);

    expect(everythingIn(b).sync_outbox).toEqual(kept);

    const merged = await ledgerOf(b);
    expect(merged.name).toBe('Brissie');
    expect(
      merged.expenses.map(({ title, note }) => [title, note]).sort(),
    ).toEqual([
      ['Brunch', 'Window seat'],
      ['Coffee', null],
      ['Lunch', null],
    ]);
    expect(await unsent(b)).toEqual(waiting);

    const from = mark();
    await sync(b);
    await sync(a);
    expect(await downloads(b, from)).toEqual(['after=3']);
    expect(await unsent(b)).toEqual([]);
    const ledger = await ledgerOf(a);
    expect(ledger).toEqual(await ledgerOf(b));
    expect(ledger.expenses.map(({ title }) => title).sort()).toEqual([
      'Brunch',
      'Coffee',
      'Lunch',
    ]);
  });

  test('[SYNC-127.1] keeps a change of its own that is later than the snapshot’s', async () => {
    const setup = await twoPhones({ expenses: ['Dinner'] });
    const { a, b } = setup;
    await sync(a);
    await sync(b);
    await editExpense(a, 'Dinner', { title: 'Brunch' });
    await sync(a);
    await sync(a);
    await sentSnapshot(a, b);
    setClock(b, NOW + MINUTE);
    await editExpense(b, 'Dinner', { title: 'Supper' });

    expect(await takeSnapshot(b)).toEqual(IMPORTED);

    expect(await titles(b)).toEqual(['Supper']);
    setApiTime(NOW + MINUTE);
    setClock(a, NOW + MINUTE);
    await sync(b);
    await sync(a);
    expect(await titles(a)).toEqual(['Supper']);
    expect(await ledgerOf(a)).toEqual(await ledgerOf(b));
  });

  test('[SYNC-127.1] never takes the cursor back', async () => {
    const setup = await twoPhones();
    const { a, b } = setup;
    for (const title of ['One', 'Two', 'Three']) await addExpense(a, { title });
    await sync(a);
    await sync(a);
    await sync(b);
    await addExpense(b, { title: 'Four' });
    await addExpense(b, { title: 'Five' });
    await sync(b);
    await sync(b);
    expect(await sendSnapshot(a, b)).toMatchObject({ sequence: 3 });
    const before = await ledgerOf(b);

    expect(await takeSnapshot(b)).toEqual(IMPORTED);

    expect(await ledgerOf(b)).toEqual(before);
    const from = mark();
    await sync(b);
    expect(await downloads(b, from)).toEqual(['after=5']);
  });

  test('[SYNC-127.1] leaves what the phone keeps to itself as it was', async () => {
    const setup = await twoPhones({ expenses: ['Dinner'] });
    const { a, b, B, key, brisbane } = setup;
    // An event Taylor's phone uploads under Casey's device ID: Casey's phone refuses it.
    await uploadAs(a, key, [
      await created(a, 'Hacked', { ms: NOW, counter: 9, device: B }),
    ]);
    await sync(b);
    await b.groups.setGroupArchived(b.database, brisbane, true);
    const refused = await refusals(b);
    expect(refused).toHaveLength(1);
    const members = (await groupNamed(b, 'Brisbane')).members;
    await renameGroup(a, 'Brissie');
    await sync(a);
    await sync(a);
    await sentSnapshot(a, b);

    expect(await takeSnapshot(b)).toEqual(IMPORTED);

    const group = await groupNamed(b, 'Brissie');
    expect(group.archived).toBe(true);
    expect(group.members).toEqual(members);
    expect(members.some((member) => member.userId !== null)).toBe(true);
    expect(await refusals(b)).toEqual(refused);
    await b.groups.setGroupArchived(b.database, brisbane, false);
    await renameGroup(b, 'Brisbane 2026');
    const [event] = await unsent(b);
    expect(event.content.stamp.device).toBe(B);
  });
});

describe('SYNC-128.2', () => {
  test('[SYNC-128.2] leaves out an expense and a member whose IDs this phone holds elsewhere, and takes the rest', async () => {
    const setup = await twoPhones({ expenses: ['Dinner'] });
    const { a, b, key } = setup;
    const c = await newcomer(setup);
    await addPersonalExpense(c, 'Coffee run');
    const osaka = await withOsaka(c);
    await c.groups.addGroupMember(c.database, osaka, 'Dana');
    const [coffee] = await personal(c);
    const dana = (await groupNamed(c, 'Osaka')).members.find(
      (member) => member.name === 'Dana',
    )!;
    await uploadAs(b, key, [
      { ...(await created(b, 'Hacked', await stampOf(b, NOW))), id: coffee.id },
      changed('member', dana.id, await stampOf(b, NOW, 1), {
        name: 'Mallory',
        removed: false,
      }),
    ]);
    await sync(a);
    expect(await titles(a)).toEqual(['Dinner', 'Hacked']);
    await sentSnapshot(a, c);
    const group = await groupNamed(c, 'Osaka');

    expect(await takeSnapshot(c)).toEqual(IMPORTED);

    expect(await personal(c)).toEqual([coffee]);
    expect(await groupNamed(c, 'Osaka')).toEqual(group);
    expect(await titles(c)).toEqual(['Dinner']);
    expect(Object.keys(await memberIds(c)).sort()).toEqual([
      'Blake',
      'Casey',
      'Taylor',
    ]);
  });

  test('[SYNC-128.2] leaves out a category whose ID is a personal category’s, and shows its expenses as Uncategorized', async () => {
    const setup = await twoPhones();
    const { a, b, key } = setup;
    const c = await newcomer(setup);
    const [mine] = await c.categories.listCategories(
      c.database,
      c.identity.personalSpaceId,
    );
    const stolen = { id: mine.id, name: 'Stolen', color: '#00ACC1' };
    const lunch = await created(b, 'Lunch', await stampOf(b, NOW, 1));
    await uploadAs(b, key, [
      changed('category', mine.id, await stampOf(b, NOW), {
        name: 'Stolen',
        color: '#00ACC1',
        archived: false,
      }),
      { ...lunch, units: { ...lunch.units, category: { value: stolen } } },
    ]);
    await sync(a);
    expect((await expenseOf(a, 'Lunch')).category).toEqual(stolen);
    await sentSnapshot(a, c);

    expect(await takeSnapshot(c)).toEqual(IMPORTED);

    expect(
      await c.categories.listCategories(c.database, c.identity.personalSpaceId),
    ).toContainEqual(mine);
    const ledger = await ledgerOf(c);
    expect(ledger.categories.map(({ name }) => name)).not.toContain('Stolen');
    expect(ledger.categories).toHaveLength(9);
    expect((await expenseOf(c, 'Lunch')).category).toEqual(
      await categoryOf(a, 'Uncategorized'),
    );
  });

  test('[SYNC-128.2] takes nothing when the snapshot’s Uncategorized is another space’s category on this phone', async () => {
    const setup = await twoPhones({ expenses: ['Dinner'] });
    const { a } = setup;
    const c = await newcomer(setup);
    const osaka = await withOsaka(c);
    await c.sync.shareGroup(c.database, {
      groupId: osaka,
      device: await deviceId(c),
    });
    const uncategorized = await categoryOf(a, 'Uncategorized');
    await apply(
      c,
      [
        changed(
          'category',
          uncategorized.id,
          { ms: NOW, counter: 0, device: 'phone-x' },
          { name: 'Shadow', color: '#00ACC1', archived: false },
        ),
      ],
      osaka,
    );
    expect(
      (await c.categories.listCategories(c.database, osaka)).map(
        (category) => category.name,
      ),
    ).toContain('Shadow');
    await sentSnapshot(a, c);
    const before = everythingIn(c);

    expect(await takeSnapshot(c)).toEqual(UNUSABLE);

    expect(everythingIn(c)).toEqual(before);
    expect(await groupNames(c)).toEqual(['Osaka']);
  });

  test('[SYNC-128.2] takes nothing when the phone holds the group as one that is no shared ledger', async () => {
    const setup = await twoPhones();
    const { a, b, A, tokyo } = setup;
    await send(a, 'PUT', `/groups/${tokyo}`);
    const tokyoKey = randomKey();
    giveKey(a, tokyo, 1, tokyoKey);
    setClock(a, NOW);
    await a.sync.shareGroup(a.database, { groupId: tokyo, device: A });
    await join(b, tokyo);
    giveKey(b, tokyo, 1, tokyoKey);
    await sentSnapshot(a, b, tokyo);
    const before = everythingIn(b);

    expect(await takeSnapshot(b, tokyo)).toEqual(UNUSABLE);

    expect(everythingIn(b)).toEqual(before);
    expect((await groupNamed(b, 'Tokyo')).shared).toBe(false);
  });

  test('[SYNC-128.2] takes nothing when the snapshot’s group ID is the ID of the phone’s personal space', async () => {
    const setup = await twoPhones({ expenses: ['Dinner'] });
    const { a } = setup;
    const c = await newcomer(setup);
    await addPersonalExpense(c, 'Coffee run');
    const content = await realContent(setup, c);
    // Brisbane's snapshot as one of a group with another ID, stored for the phone under a key
    // the phone has.
    const plantAs = async (groupId: string) => {
      const groupKey = randomKey();
      await send(a, 'PUT', `/groups/${groupId}`);
      await join(c, groupId);
      giveKey(c, groupId, 1, groupKey);
      const moved: SyncSnapshot = {
        ...content,
        groupId,
        records: content.records.map((record) =>
          record.type === 'group' ? { ...record, id: groupId } : record,
        ),
      };
      await plant(a, c, groupKey, moved, { groupId });
    };
    const mine = c.identity.personalSpaceId;
    await plantAs(mine);
    const coffee = await personal(c);
    const before = everythingIn(c);

    expect(await takeSnapshot(c, mine)).toEqual(UNUSABLE);

    expect(everythingIn(c)).toEqual(before);
    expect(await personal(c)).toEqual(coffee);
    expect(await groupNames(c)).toEqual([]);

    // Under an ID the phone holds nowhere, the same snapshot is taken in.
    const other = randomId();
    await plantAs(other);
    expect(await takeSnapshot(c, other)).toEqual(IMPORTED);
    expect(await personal(c)).toEqual(coffee);
    expect(await groupNames(c)).toEqual(['Brisbane']);
  });

  test('[SYNC-128.2] takes nothing when a phone that has the ledger holds another category as its Uncategorized', async () => {
    const setup = await twoPhones({ expenses: ['Dinner'] });
    const { a, b, key } = setup;
    await sentSnapshot(a, b);
    const content = await contentFor(b, key);
    const other = randomId();
    const renamed: SyncSnapshot = {
      ...content,
      uncategorized: other,
      records: content.records.map((record) =>
        record.id === content.uncategorized ? { ...record, id: other } : record,
      ),
    };
    const before = everythingIn(b);

    await plant(a, b, key, renamed);
    expect(await takeSnapshot(b)).toEqual(UNUSABLE);

    expect(everythingIn(b)).toEqual(before);
    // The snapshot as Taylor's phone made it names the category the phone holds.
    await plant(a, b, key, content);
    expect(await takeSnapshot(b)).toEqual(IMPORTED);
  });
});
