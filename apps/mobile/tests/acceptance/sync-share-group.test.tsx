import { addCategory, editCategory, editExpense } from './ledger-expense-app';
import {
  addGroupExpense,
  addToGroup,
  archiveGroupCategory,
  removeFromGroup,
  renameInGroup,
  startWithGroups,
} from './ledger-group-expense-app';
import { deleteByAction, restoreFromTrash } from './ledger-trash-app';
import { allowWrites, failWritesAfter } from './shell-appearance-app';
import { tapTab } from './shell-tabs-app';
import {
  BRISBANE,
  LATER,
  SHARED_STAMP,
  YOU,
  baseOf,
  categoryOf,
  closeGroupCategories,
  eachTestGetsAPhone,
  eventsOf,
  everything,
  expenseTitled,
  groupId,
  inStampOrder,
  openGroupCategories,
  renameGroupTo,
  restoreGroupCategory,
  setClock,
  share,
  stamped,
  startShared,
  tryShare,
  unsent,
} from './sync-app';

// Runs on iOS. Each test starts the app as the group expense tests do: its own phone
// database file, in Taipei on 2026-10-30, with Taylor saved as your name and
// Brisbane's members added through Members. It makes Brisbane a shared ledger the way
// its first Invite will, through the sync capability's shareGroup (sync-app), with
// phone-a as this phone's device ID. The stamps the group's records get then show in
// the bases of the events that later changes write.

jest.mock('../../src/storage/expo', () => ({
  openPhoneDatabase: async () =>
    jest.requireActual<typeof import('./sync-app')>('./sync-app').openPhone(),
}));

// Not virtual, as in ledger-expense-form.test.tsx.
jest.mock('expo-localization', () => {
  const phone = () =>
    jest.requireActual<typeof import('./ledger-expense-app')>(
      './ledger-expense-app',
    );
  return {
    ...jest.requireActual<object>('expo-localization'),
    getLocales: () => phone().phoneLocales(),
    getCalendars: () => phone().phoneCalendars(),
    useLocales: () => phone().phoneLocales(),
    useCalendars: () => phone().phoneCalendars(),
  };
});

eachTestGetsAPhone('sync-share-');

/** Adds Brisbane's Dinner for 100.01: Casey pays, split between Blake, Taylor and Casey in that order. */
const addDinner = () =>
  addGroupExpense({
    group: 'Brisbane',
    payer: 'Casey',
    sharers: ['Blake', YOU, 'Casey'],
  });

test('[SYNC-20.1] writes no event when a group with members, categories and an expense becomes a shared ledger', async () => {
  await startWithGroups(BRISBANE);
  await addDinner();

  await share('Brisbane');

  expect(await unsent()).toEqual([]);
});

test('[SYNC-20.1] stamps the group and its expenses when it becomes a shared ledger, so a later change names that stamp as its base', async () => {
  await startWithGroups(BRISBANE);
  await addDinner();
  const brisbane = await share('Brisbane');
  setClock(LATER);
  const dinner = await expenseTitled('Dinner');

  const events = await eventsOf(async () => {
    await editExpense(dinner.id, { title: 'Supper' });
    await renameGroupTo('Brisbane', 'Brissie');
  });

  expect(events).toEqual([
    {
      version: 1,
      stamp: stamped(0),
      type: 'expense',
      id: dinner.id,
      units: { title: { value: 'Supper', base: SHARED_STAMP } },
    },
    {
      version: 1,
      stamp: stamped(1),
      type: 'group',
      id: brisbane,
      units: { name: { value: 'Brissie', base: SHARED_STAMP } },
    },
  ]);
});

test('[SYNC-20.1] stamps the members in the order Members lists them, each with one stamp for both of its units', async () => {
  await startWithGroups({ Brisbane: ['Casey', 'Blake', 'Dana'] });
  await share('Brisbane');
  setClock(LATER);

  const renames = await eventsOf(async () => {
    await renameInGroup('Brisbane', 'Dana', 'Dana D.');
    await renameInGroup('Brisbane', 'Casey', 'Casey Lee');
    await renameInGroup('Brisbane', 'Blake', 'Blake K.');
  });
  const removal = await eventsOf(() =>
    removeFromGroup('Brisbane', 'Casey Lee'),
  );

  const [dana, casey, blake] = renames.map((event) => baseOf(event, 'name'));
  for (const base of [casey, blake, dana]) expect(base).toEqual(SHARED_STAMP);
  expect(inStampOrder([casey, blake, dana])).toBe(true);
  expect(baseOf(removal[0], 'removed')).toEqual(casey);
});

test('[SYNC-20.1] stamps former members too, in the order they were removed', async () => {
  await startWithGroups(BRISBANE);
  await removeFromGroup('Brisbane', 'Blake');
  await removeFromGroup('Brisbane', 'Casey');
  await share('Brisbane');
  setClock(LATER);

  const events = await eventsOf(async () => {
    await addToGroup('Brisbane', 'Casey');
    await addToGroup('Brisbane', 'Blake');
  });

  const [casey, blake] = events.map((event) => baseOf(event, 'removed'));
  expect(casey).toEqual(SHARED_STAMP);
  expect(blake).toEqual(SHARED_STAMP);
  expect(inStampOrder([blake, casey])).toBe(true);
});

test('[SYNC-20.1] stamps the categories in the order they are stored', async () => {
  await startWithGroups(BRISBANE);
  const brisbane = await groupId('Brisbane');
  await addCategory('Flights', brisbane);
  await share('Brisbane');
  setClock(LATER);

  const events = await eventsOf(async () => {
    await editCategory('Flights', 'Trains', undefined, brisbane);
    await editCategory('Other', 'Misc', undefined, brisbane);
    await editCategory('Food & Dining', 'Meals', undefined, brisbane);
  });

  const [flights, other, food] = events.map((event) => baseOf(event, 'name'));
  for (const base of [food, other, flights]) expect(base).toEqual(SHARED_STAMP);
  expect(inStampOrder([food, other, flights])).toBe(true);
});

test('[SYNC-20.1] stamps expenses in the trash and archived categories too', async () => {
  await startWithGroups(BRISBANE);
  const brisbane = await groupId('Brisbane');
  await addGroupExpense({
    group: 'Brisbane',
    title: 'Pharmacy',
    payer: 'Casey',
    sharers: [YOU],
    category: 'Health',
  });
  await archiveGroupCategory(brisbane, 'Health');
  await tapTab('Expenses');
  await deleteByAction('Pharmacy');
  await share('Brisbane');
  setClock(LATER);
  const pharmacy = await expenseTitled('Pharmacy');
  const health = await categoryOf('Brisbane', 'Health');

  const events = await eventsOf(async () => {
    await restoreFromTrash('Pharmacy');
    await openGroupCategories(brisbane);
    await restoreGroupCategory('Health');
    await closeGroupCategories();
  });

  expect(events).toEqual([
    {
      version: 1,
      stamp: stamped(0),
      type: 'expense',
      id: pharmacy.id,
      units: { trashed: { value: false, base: SHARED_STAMP } },
    },
    {
      version: 1,
      stamp: stamped(1),
      type: 'category',
      id: health.id,
      units: { archived: { value: false, base: SHARED_STAMP } },
    },
  ]);
});

test('[SYNC-20.1] leaves the local data as it was, and the group no shared ledger, whichever write fails', async () => {
  await startWithGroups(BRISBANE);
  await addDinner();
  const before = everything();

  let shared = false;
  let writesThrough = 0;
  for (; writesThrough < 500 && !shared; writesThrough += 1) {
    failWritesAfter(writesThrough);
    shared = (await tryShare('Brisbane')) === undefined;
    if (!shared) expect(everything()).toEqual(before);
  }
  allowWrites();

  expect(shared).toBe(true);
  expect(writesThrough).toBeGreaterThan(1);
  setClock(LATER);
  const events = await eventsOf(() => renameGroupTo('Brisbane', 'Brissie'));
  expect(events).toHaveLength(1);
});

test('[SYNC-20.1] changes nothing when the group is already a shared ledger', async () => {
  await startShared();
  const before = everything();

  await share('Brisbane');

  expect(everything()).toEqual(before);
  const events = await eventsOf(() => renameGroupTo('Brisbane', 'Brissie'));
  expect(events).toEqual([
    expect.objectContaining({
      stamp: stamped(0),
      units: { name: { value: 'Brissie', base: SHARED_STAMP } },
    }),
  ]);
});
