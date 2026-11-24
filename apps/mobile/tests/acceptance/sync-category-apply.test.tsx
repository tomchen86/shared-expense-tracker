import { waitFor } from '@testing-library/react-native';
import {
  addCategory,
  categoryOptions,
  editExpense,
  openNewExpense,
  restart,
  storedExpenses,
} from './ledger-expense-app';
import { card, linesIn, shownInOrder } from './ledger-expense-list-app';
import { addGroupExpense, chooseGroup } from './ledger-group-expense-app';
import {
  deleteByAction,
  expectCards,
  openTrash,
  trashCard,
} from './ledger-trash-app';
import {
  LATER,
  MINUTE,
  YOU,
  allCategories,
  at,
  categoriesShown,
  categoryNames,
  categoryOf,
  changed,
  closeGroupCategories,
  created,
  deleted,
  eachTestGetsAPhone,
  eventsOf,
  everything,
  expenseTitled,
  groupId,
  members,
  openGroupCategories,
  receive,
  receiveEvents,
  relayed,
  removeGroupCategory,
  setClock,
  stamped,
  startShared,
} from './sync-app';

// Runs on iOS. Each test starts the app as the group expense tests do, with Taylor
// saved as your name and Brisbane's members Taylor, Casey and Blake, makes Brisbane a
// shared ledger at 2026-10-30T04:00:00Z with phone-a as this phone's device ID, and
// leaves the clock a minute later (sync-app). It hands the app category events that
// other phones wrote, as its sync will: through the sync capability's
// applySyncEvents, on the app's own database connection.

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

eachTestGetsAPhone('sync-category-apply-');

/** The IDs of categories that other phones add, and of an expense one of them adds. */
const HOTELS = 'd0000000-0000-4000-8000-000000000001';
const ZOO = 'd0000000-0000-4000-8000-000000000002';
const NEVER = 'd0000000-0000-4000-8000-000000000003';
const LUNCH = 'b0000000-0000-4000-8000-000000000001';

/** The default categories as Group Categories lists them (CATEGORIES-2.1). */
const DEFAULTS = [
  ['Food & Dining', '#D81B60'],
  ['Transportation', '#1E88E5'],
  ['Shopping', '#FBC02D'],
  ['Entertainment', '#00897B'],
  ['Bills & Utilities', '#8E24AA'],
  ['Health', '#F4511E'],
  ['Travel', '#3949AB'],
  ['Other', '#6D4C41'],
  ['Uncategorized', '#757575'],
];
const DEFAULT_NAMES = DEFAULTS.map(([name]) => name);

/** A category's first event. */
const categoryCreated = (
  id: string,
  name: string,
  color: string,
  stamp = at(LATER),
) => created('category', id, stamp, { name, color, archived: false });

/** Adds a Brisbane expense of yours alone under `category`. */
const spendOn = (category: string, title: string) =>
  addGroupExpense({
    group: 'Brisbane',
    title,
    payer: YOU,
    sharers: [YOU],
    category,
  });

/** Lunch as another phone adds it under `category`: Casey pays, for you alone. */
async function lunchUnder(category: object, stamp = at(LATER + 1000)) {
  const ids = await members('Brisbane');
  return created('expense', LUNCH, stamp, {
    title: 'Lunch',
    date: '2026-10-30',
    note: null,
    category,
    money: {
      amountMinor: 3000,
      currency: 'USD',
      payments: [{ participant: ids.Casey, amountMinor: 3000 }],
      shares: [{ participant: ids.Taylor, amountMinor: 3000 }],
    },
    trashed: false,
  });
}

// Categories on screen

test('[SYNC-39.1] lists a category another phone added in Group Categories that is open, and in the expense form', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  await openGroupCategories(brisbane);

  await receive(brisbane, categoryCreated(HOTELS, 'Hotels', '#00ACC1'));

  await waitFor(() =>
    expect(categoriesShown().active).toEqual([
      ...DEFAULTS,
      ['Hotels', '#00ACC1'],
    ]),
  );
  expect(await categoryOf('Brisbane', 'Hotels')).toEqual({
    id: HOTELS,
    name: 'Hotels',
    color: '#00ACC1',
  });
  await closeGroupCategories();
  await openNewExpense();
  await chooseGroup('Brisbane');
  expect(categoryOptions(['Hotels'])).toEqual([['Hotels', false]]);
});

test('[SYNC-39.1] renames, recolors, archives and restores a category as another phone did', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  const shopping = await categoryOf('Brisbane', 'Shopping');
  await openGroupCategories(brisbane);

  await receive(
    brisbane,
    changed('category', shopping.id, at(LATER + 1000), {
      name: 'Groceries',
      color: '#00ACC1',
    }),
  );
  await waitFor(() =>
    expect(categoriesShown().active[2]).toEqual(['Groceries', '#00ACC1']),
  );

  await receive(
    brisbane,
    changed('category', shopping.id, at(LATER + 2000), { archived: true }),
  );
  await waitFor(() =>
    expect(categoriesShown()).toEqual({
      active: DEFAULTS.filter(([name]) => name !== 'Shopping'),
      archived: [['Groceries', '#00ACC1']],
    }),
  );

  await receive(
    brisbane,
    changed('category', shopping.id, at(LATER + 3000), { archived: false }),
  );
  await waitFor(() =>
    expect(categoryNames()).toEqual(
      DEFAULT_NAMES.map((name) => (name === 'Shopping' ? 'Groceries' : name)),
    ),
  );
});

test("[SYNC-39.1] keeps a category another phone added under a name and a color that one of the group's has", async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  await addCategory('Flights', brisbane);

  await receive(brisbane, categoryCreated(HOTELS, 'flights', '#43A047'));

  await openGroupCategories(brisbane);
  await waitFor(() =>
    expect(categoriesShown().active).toEqual([
      ...DEFAULTS,
      ['Flights', '#43A047'],
      ['flights', '#43A047'],
    ]),
  );
});

test("[SYNC-39.1] leaves the group's Uncategorized as it is, whatever an event says of it", async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  const uncategorized = await categoryOf('Brisbane', 'Uncategorized');
  await spendOn('Uncategorized', 'Misc');
  const stored = await storedExpenses();

  await receive(
    brisbane,
    changed('category', uncategorized.id, at(LATER + 1000), {
      name: 'Hacked',
      color: '#C62828',
      archived: true,
    }),
    deleted('category', uncategorized.id, at(LATER + 2000)),
  );

  expect(await categoryOf('Brisbane', 'Uncategorized')).toEqual(uncategorized);
  expect(await storedExpenses()).toEqual(stored);
  await openGroupCategories(brisbane);
  await waitFor(() =>
    expect(categoriesShown()).toEqual({ active: DEFAULTS, archived: [] }),
  );
});

test('[SYNC-39.1] lists nothing of a category until all three of its units have arrived', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  await openGroupCategories(brisbane);

  await receive(
    brisbane,
    changed('category', HOTELS, at(LATER + 1000), { name: 'Stays' }),
  );
  expect(categoryNames()).toEqual(DEFAULT_NAMES);

  await receive(brisbane, categoryCreated(HOTELS, 'Hotels', '#00ACC1'));
  await waitFor(() =>
    expect(categoryNames()).toEqual([...DEFAULT_NAMES, 'Stays']),
  );
});

test('[SYNC-39.1] still lists the categories as merged after a restart', async () => {
  const app = await startShared();
  const brisbane = await groupId('Brisbane');
  const other = await categoryOf('Brisbane', 'Other');
  await receive(
    brisbane,
    categoryCreated(HOTELS, 'Hotels', '#00ACC1'),
    changed('category', other.id, at(LATER + 1000), { name: 'Misc' }),
  );

  await restart(app);

  await openGroupCategories(brisbane);
  await waitFor(() =>
    expect(categoryNames()).toEqual([
      ...DEFAULT_NAMES.map((name) => (name === 'Other' ? 'Misc' : name)),
      'Hotels',
    ]),
  );
});

test('[SYNC-28.3] leaves the local data as it is when the same category events arrive again', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  const other = await categoryOf('Brisbane', 'Other');
  const events = [
    relayed(categoryCreated(HOTELS, 'Hotels', '#00ACC1')),
    relayed(changed('category', HOTELS, at(LATER + 1), { name: 'Stays' })),
    relayed(changed('category', other.id, at(LATER + 2), { archived: true })),
  ];
  await receiveEvents(brisbane, ...events);
  const before = everything();

  await receiveEvents(brisbane, ...events);
  await receiveEvents(brisbane, events[2], events[1], events[0]);

  expect(everything()).toEqual(before);
});

// Deleted categories

test("[SYNC-40.1] [SYNC-41.1] deletes a category another phone deleted, and shows the group's Uncategorized on the expenses that used it, in the trash too", async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  await addCategory('Gym', brisbane);
  await spendOn('Gym', 'Squat rack');
  await spendOn('Gym', 'Chalk');
  await deleteByAction('Chalk');
  const gym = await categoryOf('Brisbane', 'Gym');
  const uncategorized = await categoryOf('Brisbane', 'Uncategorized');

  await receive(brisbane, deleted('category', gym.id, at(LATER + 5000)));

  expect(
    (await allCategories()).filter((category) => category.id === gym.id),
  ).toEqual([]);
  expect((await expenseTitled('Squat rack')).category).toEqual(uncategorized);
  expect((await expenseTitled('Chalk')).category).toEqual(uncategorized);
  const shown = ['Squat rack', '$100.01', 'Uncategorized'];
  await waitFor(() =>
    expect(shownInOrder(linesIn(card('Squat rack')), shown)).toEqual(shown),
  );
  await openTrash();
  await waitFor(() =>
    expect(linesIn(trashCard('Chalk'))).toContain('Uncategorized'),
  );
  await openGroupCategories(brisbane);
  await waitFor(() => expect(categoryNames()).toEqual(DEFAULT_NAMES));
});

test('[SYNC-41.1] shows Uncategorized on an expense another phone added under a category this phone deleted, and under one the group never had', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  const other = await categoryOf('Brisbane', 'Other');
  const uncategorized = await categoryOf('Brisbane', 'Uncategorized');
  await openGroupCategories(brisbane);
  await removeGroupCategory('Other', 'Delete');
  await closeGroupCategories();

  await receive(brisbane, await lunchUnder(other));

  expect((await expenseTitled('Lunch')).category).toEqual(uncategorized);
  await expectCards(['Lunch']);
  expect(linesIn(card('Lunch'))).toContain('Uncategorized');

  await receive(
    brisbane,
    changed('expense', LUNCH, at(LATER + 2000), {
      category: { id: NEVER, name: 'Hotels', color: '#00ACC1' },
    }),
  );

  expect((await expenseTitled('Lunch')).category).toEqual(uncategorized);
  expect(linesIn(card('Lunch'))).toContain('Uncategorized');
});

test("[SYNC-41.1] shows the expense's own category once that category arrives after the expense", async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  const hotels = { id: HOTELS, name: 'Hotels', color: '#00ACC1' };
  await receive(brisbane, await lunchUnder(hotels));
  await expectCards(['Lunch']);
  expect((await expenseTitled('Lunch')).category).toEqual(
    await categoryOf('Brisbane', 'Uncategorized'),
  );

  await receive(
    brisbane,
    categoryCreated(HOTELS, 'Hotels', '#00ACC1', at(LATER + 2000)),
  );

  await waitFor(() => expect(linesIn(card('Lunch'))).toContain('Hotels'));
  expect((await expenseTitled('Lunch')).category).toEqual(hotels);
});

test('[SYNC-23.2] [SYNC-41.1] writes no category for an edit of an expense that shows Uncategorized, until the expense is moved to a category', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  await addCategory('Gym', brisbane);
  await spendOn('Gym', 'Squat rack');
  const rack = await expenseTitled('Squat rack');
  const gym = await categoryOf('Brisbane', 'Gym');
  const deletedAt = LATER + 5000;
  await receive(brisbane, deleted('category', gym.id, at(deletedAt)));

  const events = await eventsOf(async () => {
    await editExpense(rack.id, { title: 'Bench' });
    await editExpense(rack.id, { category: 'Shopping' });
  });

  expect(events).toEqual([
    {
      version: 1,
      stamp: stamped(1, deletedAt),
      type: 'expense',
      id: rack.id,
      units: { title: { value: 'Bench', base: stamped(1) } },
    },
    {
      version: 1,
      stamp: stamped(2, deletedAt),
      type: 'expense',
      id: rack.id,
      units: {
        category: {
          value: await categoryOf('Brisbane', 'Shopping'),
          base: stamped(1),
        },
      },
    },
  ]);
});

test('[SYNC-40.1] keeps a category deleted whatever arrives afterwards', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  const other = await categoryOf('Brisbane', 'Other');
  await receive(brisbane, deleted('category', other.id, at(LATER + 1000)));

  await receive(
    brisbane,
    changed('category', other.id, at(LATER + 2000), {
      name: 'Misc',
      archived: false,
    }),
    categoryCreated(other.id, 'Other', '#6D4C41', at(LATER + 3000)),
  );

  await openGroupCategories(brisbane);
  await waitFor(() =>
    expect(categoryNames()).toEqual(
      DEFAULT_NAMES.filter((name) => name !== 'Other'),
    ),
  );
});

test('[SYNC-38.1] keeps a category this phone deleted deleted when an event with all three of its units arrives', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  await receive(brisbane, categoryCreated(HOTELS, 'Hotels', '#00ACC1'));
  await openGroupCategories(brisbane);
  await waitFor(() =>
    expect(categoryNames()).toEqual([...DEFAULT_NAMES, 'Hotels']),
  );
  await removeGroupCategory('Hotels', 'Delete');
  await waitFor(() => expect(categoryNames()).toEqual(DEFAULT_NAMES));

  await receive(
    brisbane,
    categoryCreated(HOTELS, 'Hotels', '#00ACC1', at(LATER + 5000)),
    changed('category', HOTELS, at(LATER + 6000), { name: 'Stays' }),
  );

  expect(categoryNames()).toEqual(DEFAULT_NAMES);
  expect(
    (await allCategories()).filter((category) => category.id === HOTELS),
  ).toEqual([]);
});

// The order of categories

test('[SYNC-42.1] lists a category another phone added earlier before one added here later, though it arrived afterwards', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  setClock(LATER + 2 * MINUTE);
  await addCategory('Flights', brisbane);

  await receive(
    brisbane,
    categoryCreated(HOTELS, 'Hotels', '#00ACC1', at(LATER + MINUTE)),
  );

  await openGroupCategories(brisbane);
  await waitFor(() =>
    expect(categoryNames()).toEqual([...DEFAULT_NAMES, 'Hotels', 'Flights']),
  );
});

test('[SYNC-42.1] orders categories added in the same millisecond by device ID, and leaves one in place when it is renamed, recolored, archived or restored', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  await addCategory('Flights', brisbane);
  const flights = await categoryOf('Brisbane', 'Flights');

  await receive(
    brisbane,
    categoryCreated(HOTELS, 'Hotels', '#00ACC1', at(LATER, 0, 'phone-b')),
    categoryCreated(ZOO, 'Zoo', '#C62828', at(LATER, 0, 'phone-0')),
  );
  await openGroupCategories(brisbane);
  await waitFor(() =>
    expect(categoryNames()).toEqual([
      ...DEFAULT_NAMES,
      'Zoo',
      'Flights',
      'Hotels',
    ]),
  );

  await receive(
    brisbane,
    changed('category', ZOO, at(LATER + 5000), {
      name: 'Animals',
      color: '#9E9D24',
    }),
    changed('category', flights.id, at(LATER + 6000), { archived: true }),
    changed('category', flights.id, at(LATER + 7000), { archived: false }),
  );
  await waitFor(() =>
    expect(categoryNames()).toEqual([
      ...DEFAULT_NAMES,
      'Animals',
      'Flights',
      'Hotels',
    ]),
  );
});

// Other spaces

test("[SYNC-32.1] leaves a personal category and another group's category as they are when a shared ledger's event names their IDs", async () => {
  await startShared({ Brisbane: ['Casey', 'Blake'], Tokyo: [] });
  const brisbane = await groupId('Brisbane');
  const tokyo = await groupId('Tokyo');
  const before = await allCategories();
  const [personal] = before.filter(
    (category) => category.spaceId !== brisbane && category.spaceId !== tokyo,
  );
  // Not Uncategorized, which no event changes in any group (SYNC-39.1).
  const tokyos = before.find(
    (category) => category.spaceId === tokyo && category.name === 'Shopping',
  )!;

  await receive(
    brisbane,
    changed('category', personal.id, at(LATER), { name: 'Hacked' }),
    deleted('category', tokyos.id, at(LATER, 1)),
    categoryCreated(tokyos.id, 'Hacked', '#C62828', at(LATER, 2)),
  );

  expect(await allCategories()).toEqual(before);
});
