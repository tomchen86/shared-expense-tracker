import {
  addCategory,
  editCategory,
  expectFormClosed,
  fillForm,
  openNewExpense,
  press,
} from './ledger-expense-app';
import {
  addGroupExpense,
  addNewCategoryFromForm,
  archiveGroupCategory,
  chooseGroup,
  choosePayer,
  chooseSharers,
} from './ledger-group-expense-app';
import { deleteByAction } from './ledger-trash-app';
import { alertsShown } from './group-details-app';
import { allowWrites, failWritesAfter } from './shell-appearance-app';
import {
  CATEGORY_UPDATE_FAILED,
  SHARED_STAMP,
  YOU,
  allCategories,
  categoryNames,
  categoryOf,
  closeGroupCategories,
  eachTestGetsAPhone,
  eventsOf,
  everything,
  expenseTitled,
  groupId,
  members,
  moveGroupCategoryExpenses,
  moveListIsOpen,
  openGroupCategories,
  openMoveList,
  pressMoveTarget,
  removeGroupCategory,
  restoreGroupCategory,
  stamped,
  startShared,
  unsent,
} from './sync-app';

// Runs on iOS. Each test starts the app as the group expense tests do, with Taylor
// saved as your name and Brisbane's members Taylor, Casey and Blake, makes Brisbane a
// shared ledger at 2026-10-30T04:00:00Z with phone-a as this phone's device ID, and
// leaves the clock a minute later (sync-app). It changes Brisbane's categories as a
// person would, in its Group Categories and from the expense form, and reads the
// events the phone wrote for upload through the sync capability's
// listUnsentSyncEvents.

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

eachTestGetsAPhone('sync-categories-');

/** An event that changes units of a category. */
const categoryChanged = (
  id: string,
  stamp: object,
  units: Record<string, { value: unknown; base?: object }>,
) => ({ version: 1, stamp, type: 'category', id, units });

/** Adds a Brisbane expense of yours alone under `category`. */
const spendOn = (category: string, title: string) =>
  addGroupExpense({
    group: 'Brisbane',
    title,
    payer: YOU,
    sharers: [YOU],
    category,
  });

// Adding

test('[SYNC-38.1] writes a first event with the name, the color, not archived and no base, when a category is added to a shared ledger', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');

  const events = await eventsOf(() => addCategory(' Flights ', brisbane));

  const flights = await categoryOf('Brisbane', 'Flights');
  expect(flights.color).toBe('#43A047');
  expect(events).toEqual([
    categoryChanged(flights.id, stamped(0), {
      name: { value: 'Flights' },
      color: { value: '#43A047' },
      archived: { value: false },
    }),
  ]);
});

test('[SYNC-38.1] writes it before the expense when the category is added from the expense form', async () => {
  await startShared();
  const ids = await members('Brisbane');

  const events = await eventsOf(async () => {
    await openNewExpense();
    await fillForm({ amount: '100.01', title: 'Dinner' });
    await chooseGroup('Brisbane');
    await choosePayer('Casey');
    await chooseSharers(YOU);
    await addNewCategoryFromForm('Flights');
    await press('Add');
    await expectFormClosed();
  });

  const flights = await categoryOf('Brisbane', 'Flights');
  expect(events).toEqual([
    categoryChanged(flights.id, stamped(0), {
      name: { value: 'Flights' },
      color: { value: flights.color },
      archived: { value: false },
    }),
    {
      version: 1,
      stamp: stamped(1),
      type: 'expense',
      id: (await expenseTitled('Dinner')).id,
      units: {
        title: { value: 'Dinner' },
        date: { value: '2026-10-30' },
        note: { value: null },
        category: { value: flights },
        money: {
          value: {
            amountMinor: 10001,
            currency: 'USD',
            payments: [{ participant: ids.Casey, amountMinor: 10001 }],
            shares: [{ participant: ids.Taylor, amountMinor: 10001 }],
          },
        },
        trashed: { value: false },
      },
    },
  ]);
});

// Changing

test('[SYNC-38.1] writes only the name or the color that changed, each with the stamp it replaces as its base', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  const shopping = await categoryOf('Brisbane', 'Shopping');

  const events = await eventsOf(async () => {
    await editCategory('Shopping', ' Groceries ', undefined, brisbane);
    await editCategory('Groceries', 'Groceries', '#00ACC1', brisbane);
    await editCategory('Groceries', 'Food shop', '#C62828', brisbane);
  });

  expect(events).toEqual([
    categoryChanged(shopping.id, stamped(0), {
      name: { value: 'Groceries', base: SHARED_STAMP },
    }),
    categoryChanged(shopping.id, stamped(1), {
      color: { value: '#00ACC1', base: SHARED_STAMP },
    }),
    categoryChanged(shopping.id, stamped(2), {
      name: { value: 'Food shop', base: stamped(0) },
      color: { value: '#C62828', base: stamped(1) },
    }),
  ]);
});

test('[SYNC-38.1] writes no event, and takes no stamp, when Edit Category is saved with nothing changed', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  const shopping = await categoryOf('Brisbane', 'Shopping');

  const none = await eventsOf(() =>
    editCategory('Shopping', 'Shopping', undefined, brisbane),
  );
  const next = await eventsOf(() =>
    editCategory('Shopping', 'Groceries', undefined, brisbane),
  );

  expect(none).toEqual([]);
  expect(next).toEqual([
    categoryChanged(shopping.id, stamped(0), {
      name: { value: 'Groceries', base: SHARED_STAMP },
    }),
  ]);
});

test('[SYNC-38.1] writes that a category is archived when it is archived, and that it is not when it is restored', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  const health = await categoryOf('Brisbane', 'Health');
  await spendOn('Health', 'Pharmacy');

  const events = await eventsOf(async () => {
    await archiveGroupCategory(brisbane, 'Health');
    await openGroupCategories(brisbane);
    await restoreGroupCategory('Health');
    await closeGroupCategories();
  });

  expect(events).toEqual([
    categoryChanged(health.id, stamped(1), {
      archived: { value: true, base: SHARED_STAMP },
    }),
    categoryChanged(health.id, stamped(2), {
      archived: { value: false, base: stamped(1) },
    }),
  ]);
});

// Deleting

test('[SYNC-38.1] writes an event that permanently deletes a category no expense uses', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  const other = await categoryOf('Brisbane', 'Other');

  const events = await eventsOf(async () => {
    await openGroupCategories(brisbane);
    await removeGroupCategory('Other', 'Delete');
  });

  expect(events).toEqual([
    {
      version: 1,
      stamp: stamped(0),
      type: 'category',
      id: other.id,
      deleted: true,
    },
  ]);
  expect(categoryNames()).not.toContain('Other');
});

// Moving its expenses

test("[SYNC-38.1] writes that the category is archived, beside its expenses' events, when its expenses are moved to another", async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  await addCategory('Gym', brisbane);
  await spendOn('Gym', 'Squat rack');
  const gym = await categoryOf('Brisbane', 'Gym');

  const events = await eventsOf(async () => {
    await openGroupCategories(brisbane);
    await moveGroupCategoryExpenses('Gym', 'Shopping');
    await closeGroupCategories();
  });

  expect(events.map((event) => event.stamp)).toEqual([stamped(2), stamped(3)]);
  expect(events.filter((event) => event.type === 'category')).toEqual([
    categoryChanged(gym.id, expect.anything(), {
      archived: { value: true, base: stamped(0) },
    }),
  ]);
});

test('[SYNC-21.1] moves no expense, archives nothing and writes no event when a write of the move fails, whichever it is', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  await addCategory('Gym', brisbane);
  await spendOn('Gym', 'Squat rack');
  await spendOn('Gym', 'Chalk');
  await deleteByAction('Chalk');
  await openGroupCategories(brisbane);
  await openMoveList('Gym');
  const before = everything();

  let writesThrough = 0;
  for (; writesThrough < 60; writesThrough += 1) {
    const shown = alertsShown().length;
    failWritesAfter(writesThrough);
    await pressMoveTarget('Gym', 'Shopping');
    if (alertsShown().length === shown) break;
    expect(alertsShown().at(-1)).toEqual(CATEGORY_UPDATE_FAILED);
    expect(everything()).toEqual(before);
    expect(moveListIsOpen('Gym')).toBe(true);
  }
  allowWrites();

  expect(writesThrough).toBeGreaterThan(1);
  expect(
    (await unsent()).slice(-3).map((event) => event.content.stamp),
  ).toEqual([stamped(4), stamped(5), stamped(6)]);
  expect((await expenseTitled('Chalk')).category).toEqual(
    await categoryOf('Brisbane', 'Shopping'),
  );
});

// What writes no event

test('[SYNC-26.1] writes no event for personal categories, or for those of a group that is not a shared ledger', async () => {
  await startShared({ Brisbane: ['Casey', 'Blake'], Tokyo: [] });
  const tokyo = await groupId('Tokyo');

  await addCategory('Gym');
  await editCategory('Gym', 'Fitness', '#00ACC1');
  await addCategory('Flights', tokyo);
  await editCategory('Flights', 'Trains', undefined, tokyo);
  await openGroupCategories(tokyo);
  await removeGroupCategory('Trains', 'Delete');
  await removeGroupCategory('Other', 'Delete');
  await closeGroupCategories();

  const names = (await allCategories())
    .filter((category) => category.spaceId === tokyo)
    .map((category) => category.name);
  expect(names).not.toContain('Trains');
  expect(names).not.toContain('Other');
  expect(await unsent()).toEqual([]);
});
