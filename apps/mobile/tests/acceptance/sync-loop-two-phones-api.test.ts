import {
  HOUR,
  NOW,
  T,
  addCategory,
  addExpense,
  addMember,
  archiveCategory,
  copyOfData,
  created,
  downloads,
  editExpense,
  endWorld,
  everythingIn,
  failingAtWrite,
  goOffline,
  goOnline,
  importData,
  ledgerOf,
  loseAnswerTo,
  mark,
  moveToTrash,
  noAnswerTo,
  refusals,
  renameCategory,
  renameGroup,
  renameMember,
  restoreData,
  restoreFromTrash,
  setApiTime,
  setClock,
  stampOf,
  startWorld,
  storedContents,
  storedEvents,
  sync,
  titles,
  trySync,
  twoPhones,
  unsent,
  uploadAs,
  uploads,
  whenAnswered,
  type Phone,
} from './sync-loop-app';

// Runs in Node against the real API (sync-loop-app): two phones that change one shared
// ledger while they are offline, and then sync. Both phones run the app's own sync here.

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

// The app's import reaches the phone's files and its database through these two, which
// only a phone has; the import these tests run is handed a database of their own.
jest.mock('../../src/storage/expo', () => ({}));
jest.mock('../../src/storage/expo-files', () => ({}));

beforeEach(startWorld);
afterEach(endWorld);

/** Syncs the phones in turn, twice each: enough for both to hold every event of the two. */
async function syncBoth(first: Phone, second: Phone) {
  await sync(first);
  await sync(second);
  await sync(first);
  await sync(second);
}

const eventIds = async (groupId: string) =>
  (await storedEvents(groupId)).map((event) => event.eventId);

describe('SYNC-91.1', () => {
  test('[SYNC-91.1] two phones that changed different things offline hold the same ledger once both have synced', async () => {
    const { a, b, brisbane } = await twoPhones({ expenses: ['Dinner'] });
    await syncBoth(a, b);

    goOffline();
    await addExpense(a, { title: 'Lunch' });
    await editExpense(a, 'Dinner', { title: 'Supper' });
    await addMember(a, 'Dana');
    await addCategory(a, 'Flights');
    await renameCategory(a, 'Other', 'Misc');
    await addExpense(b, { title: 'Taxi' });
    await editExpense(b, 'Dinner', { note: 'Window seat' });
    await renameMember(b, 'Blake', 'Blake Chen');
    await addCategory(b, 'Hotels', '#00ACC1');
    await archiveCategory(b, 'Shopping');
    await moveToTrash(b, 'Taxi');
    await sync(a);
    await sync(b);
    expect(await storedEvents(brisbane)).toEqual([]);

    goOnline();
    await sync(a);
    await sync(b);
    await sync(a);

    const ledger = await ledgerOf(a);
    expect(await ledgerOf(b)).toEqual(ledger);
    expect(
      ledger.expenses
        .map(({ title, note, trashed }) => ({ title, note, trashed }))
        .sort((one, other) => one.title.localeCompare(other.title)),
    ).toEqual([
      { title: 'Lunch', note: null, trashed: false },
      { title: 'Supper', note: 'Window seat', trashed: false },
      { title: 'Taxi', note: null, trashed: true },
    ]);
    expect(ledger.members.map(({ name }) => name)).toEqual([
      'Taylor',
      'Casey',
      'Blake Chen',
      'Dana',
    ]);
    const categories = Object.fromEntries(
      ledger.categories.map(({ name, archived }) => [name, archived]),
    );
    expect(categories).toMatchObject({
      Misc: false,
      Flights: false,
      Hotels: false,
      Shopping: true,
    });
    expect(categories).not.toHaveProperty('Other');
    expect(ledger.categories).toHaveLength(11);
    expect(await unsent(a)).toEqual([]);
    expect(await unsent(b)).toEqual([]);
    expect(await storedEvents(brisbane)).toHaveLength(11);
    expect(await refusals(a)).toEqual([]);
    expect(await refusals(b)).toEqual([]);
  });

  test.each([
    ['the phone with the earlier changes syncs first', true],
    ['the phone with the later changes syncs first', false],
  ])(
    '[SYNC-91.1] two phones that changed the same things keep the later change on both, when %s',
    async (_case, earlierFirst) => {
      const { a, b } = await twoPhones({ expenses: ['Dinner'] });
      await syncBoth(a, b);

      goOffline();
      await renameGroup(a, 'Brissie');
      await editExpense(a, 'Dinner', { amountMinor: 12000 });
      setClock(b, T + 120_000);
      await renameGroup(b, 'Brisbane 2026');
      await editExpense(b, 'Dinner', { amountMinor: 9000 });
      goOnline();
      await (earlierFirst ? syncBoth(a, b) : syncBoth(b, a));

      const ledger = await ledgerOf(a);
      expect(await ledgerOf(b)).toEqual(ledger);
      expect(ledger.name).toBe('Brisbane 2026');
      expect(ledger.expenses).toHaveLength(1);
      expect(ledger.expenses[0]).toMatchObject({
        title: 'Dinner',
        amountMinor: 9000,
        shares: [
          { amountMinor: 3000 },
          { amountMinor: 3000 },
          { amountMinor: 3000 },
        ],
      });
    },
  );

  /** A dozen changes on each phone, to records both hold and to records of its own. */
  async function changeALot(a: Phone, b: Phone) {
    await addExpense(a, { title: 'Lunch' });
    await addExpense(a, { title: 'Museum', amountMinor: 4200 });
    await editExpense(a, 'Dinner', { title: 'Supper', date: '2026-10-29' });
    await moveToTrash(a, 'Lunch');
    await restoreFromTrash(a, 'Lunch');
    await addMember(a, 'Dana');
    await renameMember(a, 'Casey', 'Casey Lee');
    await addCategory(a, 'Flights');
    await renameGroup(a, 'Brissie');
    await editExpense(a, 'Museum', { category: 'Flights' });
    setClock(b, T + 90_000);
    await addExpense(b, { title: 'Taxi' });
    await addExpense(b, { title: 'Coffee', amountMinor: 450 });
    await editExpense(b, 'Dinner', { note: 'Window seat', amountMinor: 9000 });
    await moveToTrash(b, 'Coffee');
    await addMember(b, 'Evan');
    await renameMember(b, 'Blake', 'Blake Chen');
    await addCategory(b, 'Hotels', '#00ACC1');
    await archiveCategory(b, 'Shopping');
    await renameGroup(b, 'Brisbane 2026');
    await editExpense(b, 'Taxi', { payer: 'Taylor', sharers: ['Casey'] });
  }

  test('[SYNC-91.1] they still end up the same when answers are lost, a download fails and a page fails to store on the way', async () => {
    const { a, b, brisbane } = await twoPhones({ expenses: ['Dinner'] });
    await syncBoth(a, b);
    goOffline();
    await changeALot(a, b);
    const written = [
      ...(await unsent(a)).map((event) => event.id),
      ...(await unsent(b)).map((event) => event.id),
    ];
    expect(written).toHaveLength(20);
    goOnline();

    // Taylor's upload is stored, and its answer lost.
    loseAnswerTo('POST');
    await sync(a);
    // Casey's first download gets no answer; the next one works, and its upload's answer is lost.
    noAnswerTo('GET');
    await sync(b);
    loseAnswerTo('POST');
    await sync(b);
    // Taylor's phone cannot store the page it downloads.
    await trySync(a, failingAtWrite(a.database, 3).database);
    await syncBoth(a, b);

    const ledger = await ledgerOf(a);
    expect(await ledgerOf(b)).toEqual(ledger);
    expect(ledger.name).toBe('Brisbane 2026');
    expect(ledger.expenses.map(({ title }) => title).sort()).toEqual([
      'Coffee',
      'Lunch',
      'Museum',
      'Supper',
      'Taxi',
    ]);
    expect(new Set(ledger.expenses.map(({ id }) => id)).size).toBe(5);
    expect(ledger.members.map(({ name }) => name).sort()).toEqual([
      'Blake Chen',
      'Casey Lee',
      'Dana',
      'Evan',
      'Taylor',
    ]);
    // Every event the phones wrote is on the API once.
    expect((await eventIds(brisbane)).sort()).toEqual([...written].sort());
    expect(await unsent(a)).toEqual([]);
    expect(await unsent(b)).toEqual([]);
  });

  test('[SYNC-91.1] syncing again changes nothing on either phone, and uploads nothing', async () => {
    const { a, b, brisbane } = await twoPhones({ expenses: ['Dinner'] });
    goOffline();
    await changeALot(a, b);
    goOnline();
    await syncBoth(a, b);
    const held = [everythingIn(a), everythingIn(b)];
    const stored = await eventIds(brisbane);
    expect(stored).toHaveLength(20);
    const from = mark();

    await syncBoth(a, b);

    expect([everythingIn(a), everythingIn(b)]).toEqual(held);
    expect(await eventIds(brisbane)).toEqual(stored);
    expect(await uploads(a, from)).toEqual([]);
    expect(await uploads(b, from)).toEqual([]);
  });
});

describe('SYNC-92.2', () => {
  test('[SYNC-92.2] a phone whose local data went back downloads again from the cursor it now holds, and ends up like the other phone', async () => {
    const setup = await twoPhones({ expenses: ['Dinner'] });
    const { b } = setup;
    await addExpense(b, { title: 'Lunch' });
    await syncBoth(b, setup.a);
    const copy = await copyOfData(setup.a);
    const cursorThen = mark();
    await sync(setup.a);
    const [heldThen] = await downloads(setup.a, cursorThen);

    await addExpense(setup.a, { title: 'Taxi' });
    await addExpense(b, { title: 'Coffee' });
    await syncBoth(setup.a, b);
    expect(await titles(setup.a)).toEqual([
      'Coffee',
      'Dinner',
      'Lunch',
      'Taxi',
    ]);

    const a = await restoreData(setup.a, copy);
    expect(await titles(a)).toEqual(['Dinner', 'Lunch']);
    const from = mark();
    await sync(a);
    await sync(a);

    expect((await downloads(a, from))[0]).toBe(heldThen);
    expect(await ledgerOf(a)).toEqual(await ledgerOf(b));
    expect(await titles(a)).toEqual(['Coffee', 'Dinner', 'Lunch', 'Taxi']);
    expect(await refusals(a)).toEqual([]);
  });

  test('[SYNC-92.2] uploads again the unsent events that came back with the data, and the API stores none twice', async () => {
    const setup = await twoPhones();
    const { brisbane } = setup;
    await addExpense(setup.a, { title: 'Taxi' });
    const [taxi] = await unsent(setup.a);
    const copy = await copyOfData(setup.a);
    await sync(setup.a);
    expect(await eventIds(brisbane)).toEqual([taxi.id]);

    const a = await restoreData(setup.a, copy);
    expect(await unsent(a)).toEqual([taxi]);
    const from = mark();
    await sync(a);

    expect(
      (await uploads(a, from)).map((upload) => [
        upload.events.map((event) => event.id),
        upload.status,
      ]),
    ).toEqual([[[taxi.id], 200]]);
    expect(await eventIds(brisbane)).toEqual([taxi.id]);
    expect(await unsent(a)).toEqual([]);
    expect(await titles(a)).toEqual(['Taxi']);
  });

  test('[SYNC-92.2] after an import the running app syncs from the cursor the imported data holds', async () => {
    const { a, b, brisbane, key } = await twoPhones();
    const copy = await copyOfData(a);
    await uploadAs(b, key, [await created(b, 'Lunch', await stampOf(b, NOW))]);
    await sync(a);
    expect(await titles(a)).toEqual(['Lunch']);

    await importData(a, copy);

    expect(await titles(a)).toEqual([]);
    const groups = await a.groups.listGroups(a.database);
    expect(groups.find((group) => group.id === brisbane)?.shared).toBe(true);
    const from = mark();
    await sync(a);

    expect(await downloads(a, from)).toEqual(['after=0']);
    expect(await titles(a)).toEqual(['Lunch']);
  });
});

describe('SYNC-71.3', () => {
  test('[SYNC-71.3] does not store a page when an import took the cursor back while the page was on its way', async () => {
    const { a, b, key } = await twoPhones();
    const copy = await copyOfData(a);
    await uploadAs(b, key, [await created(b, 'Lunch', await stampOf(b, NOW))]);
    await sync(a);
    expect(await titles(a)).toEqual(['Lunch']);
    await uploadAs(b, key, [
      await created(b, 'Taxi', await stampOf(b, NOW, 1)),
    ]);
    // As the answer to the download arrives, the local data goes back to cursor 0.
    whenAnswered('GET', () => importData(a, copy));
    const from = mark();

    await trySync(a);

    expect(await downloads(a, from)).toEqual(['after=1']);
    expect(await titles(a)).toEqual([]);
    const next = mark();
    await sync(a);
    await sync(a);

    expect((await downloads(a, next))[0]).toBe('after=0');
    expect(await titles(a)).toEqual(['Lunch', 'Taxi']);
  });
});

describe('SYNC-96.1', () => {
  test('[SYNC-96.1] takes the stamp the API holds for an unsent event that came back unchecked with older local data', async () => {
    const setup = await twoPhones({ expenses: ['Dinner'] });
    const { b, A, B, brisbane, key } = setup;
    setClock(setup.a, NOW + HOUR);
    await editExpense(setup.a, 'Dinner', { title: 'Supper' });
    const [supper] = await unsent(setup.a);
    const copy = await copyOfData(setup.a);
    // The first sync checks the event, and uploads it stamped NOW.
    await sync(setup.a);
    setClock(b, NOW + 120_000);
    await editExpense(b, 'Dinner', { title: 'Brunch' });
    await sync(b);
    const stored = [
      { ms: NOW, counter: 0, device: A },
      { ms: NOW + 120_000, counter: 0, device: B },
    ];
    const stamps = async () =>
      (await storedContents(brisbane, key)).map((event) => event?.stamp);
    expect(await stamps()).toEqual(stored);

    // Three minutes later Taylor's phone, its clock still an hour ahead, is back at the copy.
    setApiTime(NOW + 180_000);
    const a = await restoreData(setup.a, copy);
    setClock(a, NOW + HOUR + 180_000);
    expect(await unsent(a)).toEqual([supper]);
    await sync(a);
    setClock(b, NOW + 180_000);
    await sync(b);

    // Supper kept the stamp the API holds, so Brunch, stamped after it, won on both phones.
    expect(await titles(a)).toEqual(['Brunch']);
    expect(await titles(b)).toEqual(['Brunch']);
    expect(await ledgerOf(a)).toEqual(await ledgerOf(b));
    expect(await unsent(a)).toEqual([]);
    expect(await stamps()).toEqual(stored);
  });
});
