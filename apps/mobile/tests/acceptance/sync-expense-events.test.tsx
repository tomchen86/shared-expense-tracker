import { fireEvent, waitFor } from '@testing-library/react-native';
import {
  SAVE_FAILED,
  addCategory,
  addExpense,
  editCategory,
  editExpense,
  expectFormClosed,
  fillForm,
  formTitle,
  noteField,
  openEditExpense,
  openNewExpense,
  press,
  restart,
  storedExpenses,
} from './ledger-expense-app';
import {
  addGroupExpense,
  chooseGroup,
  choosePayer,
  chooseSharers,
  deleteFromGroup,
  fillGroupExpense,
  startWithGroups,
} from './ledger-group-expense-app';
import {
  TRASH_FAILED,
  deleteByAction,
  expectCards,
  expectTrash,
  openTrash,
  pressEmptyTrash,
  pressUndo,
  restoreFromTrash,
} from './ledger-trash-app';
import { showGroup } from './group-balances-app';
import { alertsShown, pressAlertButton, screenOf } from './group-details-app';
import { chooseSort, sortName } from './ledger-list-find-app';
import {
  SAVE_FILTER,
  capsuleTexts,
  choose,
  pressDeleteSaved,
  pressInFilters,
  savedFilterNames,
  watchPrompts,
} from './ledger-list-filter-app';
import { closeFilters, openFilters } from './ledger-list-period-app';
import { allowWrites, failWritesAfter } from './shell-appearance-app';
import { tapTab } from './shell-tabs-app';
import {
  EXPENSE_TOO_LARGE,
  LATER,
  MINUTE,
  SHARED_STAMP,
  YOU,
  categoryOf,
  closeGroupCategories,
  deletePermanently,
  eachTestGetsAPhone,
  editWith,
  encryptedSize,
  eventsOf,
  everything,
  expectUnsentAreValid,
  expenseTitled,
  groupId,
  members,
  moveGroupCategoryExpenses,
  openGroupCategories,
  setClock,
  share,
  stamped,
  startShared,
  unsent,
} from './sync-app';

// Runs on iOS. Each test starts the app as the group expense tests do, with Taylor
// saved as your name and Brisbane's members Taylor, Casey and Blake, makes Brisbane a
// shared ledger at 2026-10-30T04:00:00Z with phone-a as this phone's device ID, and
// leaves the clock a minute later (sync-app). It then changes expenses as a person
// would, through the expense form, the cards and Trash, and reads the events the phone
// wrote for upload through the sync capability's listUnsentSyncEvents.

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

eachTestGetsAPhone('sync-expenses-');

const DINNER = {
  group: 'Brisbane',
  payer: 'Casey',
  sharers: ['Blake', YOU, 'Casey'],
};

/** Adds Brisbane's Dinner for 100.01: Casey pays, split between Blake, Taylor and Casey in that order. */
const addDinner = () => addGroupExpense(DINNER);

/** Dinner's first event, with `note` as its note. */
async function dinnerCreated(
  id: string,
  stamp = stamped(0),
  note: string | null = null,
) {
  const ids = await members('Brisbane');
  return {
    version: 1,
    stamp,
    type: 'expense',
    id,
    units: {
      title: { value: 'Dinner' },
      date: { value: '2026-10-30' },
      note: { value: note },
      category: { value: await categoryOf('Brisbane', 'Food & Dining') },
      money: {
        value: {
          amountMinor: 10001,
          currency: 'USD',
          payments: [{ participant: ids.Casey, amountMinor: 10001 }],
          shares: [
            { participant: ids.Blake, amountMinor: 3334 },
            { participant: ids.Taylor, amountMinor: 3334 },
            { participant: ids.Casey, amountMinor: 3333 },
          ],
        },
      },
      trashed: { value: false },
    },
  };
}

/** An event that changes units of an expense. */
const expenseChanged = (
  id: string,
  stamp: object,
  units: Record<string, { value: unknown; base: object }>,
) => ({ version: 1, stamp, type: 'expense', id, units });

const byId = (one: { id: string }, other: { id: string }) =>
  one.id < other.id ? -1 : 1;

/** An event without its stamp, for events whose order among themselves is not set. */
function withoutStamp(event: object) {
  const rest: Record<string, unknown> = { ...event };
  delete rest.stamp;
  return rest as { id: string };
}

// Every event the phone writes

test("[SYNC-21.1] stamps each event from the phone's clock and device ID, counting up within one millisecond", async () => {
  await startShared();

  const events = await eventsOf(async () => {
    await addDinner();
    await deleteByAction('Dinner');
    await pressUndo('Dinner');
    setClock(LATER + MINUTE);
    await editExpense((await expenseTitled('Dinner')).id, { title: 'Supper' });
  });

  expect(events.map((event) => event.stamp)).toEqual([
    stamped(0),
    stamped(1),
    stamped(2),
    stamped(0, LATER + MINUTE),
  ]);
});

test("[SYNC-21.1] writes events the domain's check accepts, each under an ID of its own, and keeps them in order after a restart", async () => {
  const app = await startShared();
  await addDinner();
  await editExpense((await expenseTitled('Dinner')).id, { amount: '100.00' });
  await deleteByAction('Dinner');
  await pressUndo('Dinner');
  const before = await unsent();

  await restart(app);

  expect(before).toHaveLength(4);
  expect(before.map((event) => event.groupId)).toEqual(
    Array(4).fill(await groupId('Brisbane')),
  );
  await expectUnsentAreValid();
  expect(await unsent()).toEqual(before);
});

test('[SYNC-21.1] stores neither the expense nor its event when a write of the save fails, whichever it is', async () => {
  await startShared();
  await openNewExpense();
  await fillGroupExpense(DINNER);
  const before = everything();

  let written = 0;
  for (; ; written += 1) {
    if (written > 80) throw new Error('The save never went through');
    const shown = alertsShown().length;
    failWritesAfter(written);
    await press('Add');
    await waitFor(() =>
      expect(formTitle() === undefined || alertsShown().length > shown).toBe(
        true,
      ),
    );
    if (formTitle() === undefined) break;
    expect(alertsShown().at(-1)).toEqual(SAVE_FAILED);
    expect(everything()).toEqual(before);
  }
  allowWrites();

  expect(written).toBeGreaterThan(1);
  const dinner = await expenseTitled('Dinner');
  expect((await unsent()).map((event) => event.content)).toEqual([
    await dinnerCreated(dinner.id),
  ]);
});

test('[SYNC-21.1] moves nothing to the trash and writes no event when a write fails, whichever it is', async () => {
  await startShared();
  await addDinner();
  const dinner = await expenseTitled('Dinner');
  const before = everything();

  let writesThrough = 0;
  for (; writesThrough < 20; writesThrough += 1) {
    const shown = alertsShown().length;
    failWritesAfter(writesThrough);
    await deleteByAction('Dinner');
    if (alertsShown().length === shown) break;
    expect(alertsShown().at(-1)).toEqual(TRASH_FAILED);
    expect(everything()).toEqual(before);
  }
  allowWrites();

  expect(writesThrough).toBeGreaterThan(1);
  await expectCards([]);
  expect((await unsent()).map((event) => event.content)).toEqual([
    await dinnerCreated(dinner.id),
    expenseChanged(dinner.id, stamped(1), {
      trashed: { value: true, base: stamped(0) },
    }),
  ]);
});

// Adding

test('[SYNC-22.1] writes a first event with all six units and no base when an expense is added to a shared ledger', async () => {
  await startShared();

  const events = await eventsOf(addDinner);

  const dinner = await expenseTitled('Dinner');
  expect(events).toEqual([await dinnerCreated(dinner.id)]);
});

test('[SYNC-22.1] writes the note, the date and the category the expense was added with', async () => {
  await startShared();
  const ids = await members('Brisbane');

  const events = await eventsOf(() =>
    addGroupExpense({
      group: 'Brisbane',
      title: 'Taxi',
      amount: '25.00',
      note: ' Airport ',
      date: '2026-10-29',
      category: 'Transportation',
      payer: YOU,
      sharers: ['Casey'],
    }),
  );

  expect(events).toEqual([
    {
      version: 1,
      stamp: stamped(0),
      type: 'expense',
      id: (await expenseTitled('Taxi')).id,
      units: {
        title: { value: 'Taxi' },
        date: { value: '2026-10-29' },
        note: { value: 'Airport' },
        category: { value: await categoryOf('Brisbane', 'Transportation') },
        money: {
          value: {
            amountMinor: 2500,
            currency: 'USD',
            payments: [{ participant: ids.Taylor, amountMinor: 2500 }],
            shares: [{ participant: ids.Casey, amountMinor: 2500 }],
          },
        },
        trashed: { value: false },
      },
    },
  ]);
});

test("[SYNC-22.1] writes a first event under the expense's own ID when a personal expense becomes the shared ledger's", async () => {
  await startShared();
  const ids = await members('Brisbane');
  await addExpense();
  const coffee = await expenseTitled('Coffee run');

  const events = await eventsOf(() =>
    editWith(coffee.id, async () => {
      await chooseGroup('Brisbane');
      await choosePayer(YOU);
      await chooseSharers(YOU, 'Casey');
    }),
  );

  expect(events).toEqual([
    {
      version: 1,
      stamp: stamped(0),
      type: 'expense',
      id: coffee.id,
      units: {
        title: { value: 'Coffee run' },
        date: { value: '2026-10-30' },
        note: { value: null },
        category: { value: await categoryOf('Brisbane', 'Food & Dining') },
        money: {
          value: {
            amountMinor: 875,
            currency: 'USD',
            payments: [{ participant: ids.Taylor, amountMinor: 875 }],
            shares: [
              { participant: ids.Taylor, amountMinor: 438 },
              { participant: ids.Casey, amountMinor: 437 },
            ],
          },
        },
        trashed: { value: false },
      },
    },
  ]);
});

// Editing

test('[SYNC-23.2] writes only the title, with the stamp it replaces as its base, when only the title changes', async () => {
  await startShared();
  await addDinner();
  const dinner = await expenseTitled('Dinner');

  const events = await eventsOf(() =>
    editExpense(dinner.id, { title: 'Supper' }),
  );

  expect(events).toEqual([
    expenseChanged(dinner.id, stamped(1), {
      title: { value: 'Supper', base: stamped(0) },
    }),
  ]);
});

test('[SYNC-23.2] writes no event, and takes no stamp, for a save that leaves every unit as it was', async () => {
  await startShared();
  await addDinner();
  const dinner = await expenseTitled('Dinner');

  // 100,01 reads as the amount the expense already has, and the form still lets it be saved.
  const none = await eventsOf(() =>
    editExpense(dinner.id, { amount: '100,01' }),
  );
  const next = await eventsOf(() =>
    editExpense(dinner.id, { title: 'Supper' }),
  );

  expect(none).toEqual([]);
  expect(next).toEqual([
    expenseChanged(dinner.id, stamped(1), {
      title: { value: 'Supper', base: stamped(0) },
    }),
  ]);
});

test('[SYNC-23.2] writes the whole money unit when the amount changes', async () => {
  await startShared();
  const ids = await members('Brisbane');
  await addDinner();
  const dinner = await expenseTitled('Dinner');

  const events = await eventsOf(() =>
    editExpense(dinner.id, { amount: '100.00' }),
  );

  expect(events).toEqual([
    expenseChanged(dinner.id, stamped(1), {
      money: {
        value: {
          amountMinor: 10000,
          currency: 'USD',
          payments: [{ participant: ids.Casey, amountMinor: 10000 }],
          shares: [
            { participant: ids.Blake, amountMinor: 3334 },
            { participant: ids.Taylor, amountMinor: 3333 },
            { participant: ids.Casey, amountMinor: 3333 },
          ],
        },
        base: stamped(0),
      },
    }),
  ]);
});

test('[SYNC-23.2] writes the whole money unit when only the payer changes', async () => {
  await startShared();
  const ids = await members('Brisbane');
  await addDinner();
  const dinner = await expenseTitled('Dinner');

  const events = await eventsOf(() =>
    editWith(dinner.id, () => choosePayer(YOU)),
  );

  expect(events).toEqual([
    expenseChanged(dinner.id, stamped(1), {
      money: {
        value: {
          amountMinor: 10001,
          currency: 'USD',
          payments: [{ participant: ids.Taylor, amountMinor: 10001 }],
          shares: [
            { participant: ids.Blake, amountMinor: 3334 },
            { participant: ids.Taylor, amountMinor: 3334 },
            { participant: ids.Casey, amountMinor: 3333 },
          ],
        },
        base: stamped(0),
      },
    }),
  ]);
});

test('[SYNC-23.2] writes the whole money unit when the order of the split changes, beside the title that changed with it', async () => {
  await startShared();
  const ids = await members('Brisbane');
  await addDinner();
  const dinner = await expenseTitled('Dinner');

  const events = await eventsOf(() =>
    editWith(dinner.id, async () => {
      // Taking Blake out and choosing him again puts him last (LEDGER-56.2).
      await chooseSharers('Blake', 'Blake');
      await fillForm({ title: 'Supper' });
    }),
  );

  expect(events).toEqual([
    expenseChanged(dinner.id, stamped(1), {
      title: { value: 'Supper', base: stamped(0) },
      money: {
        value: {
          amountMinor: 10001,
          currency: 'USD',
          payments: [{ participant: ids.Casey, amountMinor: 10001 }],
          shares: [
            { participant: ids.Taylor, amountMinor: 3334 },
            { participant: ids.Casey, amountMinor: 3334 },
            { participant: ids.Blake, amountMinor: 3333 },
          ],
        },
        base: stamped(0),
      },
    }),
  ]);
});

test('[SYNC-23.2] writes the note, the date and the category when they change, and the note as null once it is cleared', async () => {
  await startShared();
  await addDinner();
  const dinner = await expenseTitled('Dinner');

  const events = await eventsOf(async () => {
    await editExpense(dinner.id, {
      note: 'Window seat',
      date: '2026-10-29',
      category: 'Travel',
    });
    await editExpense(dinner.id, { note: '' });
  });

  expect(events).toEqual([
    expenseChanged(dinner.id, stamped(1), {
      date: { value: '2026-10-29', base: stamped(0) },
      note: { value: 'Window seat', base: stamped(0) },
      category: {
        value: await categoryOf('Brisbane', 'Travel'),
        base: stamped(0),
      },
    }),
    expenseChanged(dinner.id, stamped(2), {
      note: { value: null, base: stamped(1) },
    }),
  ]);
});

test('[SYNC-23.2] [LEDGER-27.2] leaves the category out, and the stored name and color as they were, when the category was only renamed and recolored', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  await addDinner();
  const dinner = await expenseTitled('Dinner');
  await editCategory('Food & Dining', 'Meals', '#43A047', brisbane);

  const events = await eventsOf(() =>
    editExpense(dinner.id, { title: 'Supper' }),
  );

  expect(events).toEqual([
    expenseChanged(dinner.id, stamped(2), {
      title: { value: 'Supper', base: stamped(0) },
    }),
  ]);
  expect((await expenseTitled('Supper')).category).toEqual({
    id: dinner.category.id,
    name: 'Food & Dining',
    color: '#D81B60',
  });
});

test('[SYNC-23.2] [LEDGER-27.2] writes the category, with its name and color at that save, once the expense is moved to it', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  await addDinner();
  const dinner = await expenseTitled('Dinner');
  await editCategory('Food & Dining', 'Meals', '#43A047', brisbane);
  const meals = { id: dinner.category.id, name: 'Meals', color: '#43A047' };

  const events = await eventsOf(async () => {
    await editExpense(dinner.id, { category: 'Travel' });
    await editExpense(dinner.id, { category: 'Meals' });
  });

  expect(events).toEqual([
    expenseChanged(dinner.id, stamped(2), {
      category: {
        value: await categoryOf('Brisbane', 'Travel'),
        base: stamped(0),
      },
    }),
    expenseChanged(dinner.id, stamped(3), {
      category: { value: meals, base: stamped(2) },
    }),
  ]);
  expect((await expenseTitled('Dinner')).category).toEqual(meals);
});

// The trash

test('[SYNC-24.1] writes that the expense is in the trash when it is deleted, and that it is not when Undo is pressed', async () => {
  await startShared();
  await addDinner();
  const dinner = await expenseTitled('Dinner');

  const events = await eventsOf(async () => {
    await deleteByAction('Dinner');
    await pressUndo('Dinner');
  });

  expect(events).toEqual([
    expenseChanged(dinner.id, stamped(1), {
      trashed: { value: true, base: stamped(0) },
    }),
    expenseChanged(dinner.id, stamped(2), {
      trashed: { value: false, base: stamped(1) },
    }),
  ]);
});

test("[SYNC-24.1] writes the same when the expense is deleted on the group's screen and restored from Trash", async () => {
  await startShared();
  await addDinner();
  const dinner = await expenseTitled('Dinner');

  const events = await eventsOf(async () => {
    await showGroup('Brisbane');
    await deleteFromGroup('Brisbane', 'Dinner');
    await restoreFromTrash('Dinner');
  });

  expect(events).toEqual([
    expenseChanged(dinner.id, stamped(1), {
      trashed: { value: true, base: stamped(0) },
    }),
    expenseChanged(dinner.id, stamped(2), {
      trashed: { value: false, base: stamped(1) },
    }),
  ]);
});

// Moving a category's expenses

test('[SYNC-25.1] writes an event for each expense, in the trash or not, that a move gives another category', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  await addCategory('Gym', brisbane);
  for (const title of ['Squat rack', 'Chalk'])
    await addGroupExpense({
      group: 'Brisbane',
      title,
      payer: YOU,
      sharers: [YOU],
      category: 'Gym',
    });
  await addDinner();
  await deleteByAction('Chalk');
  const rack = await expenseTitled('Squat rack');
  const chalk = await expenseTitled('Chalk');
  const shopping = await categoryOf('Brisbane', 'Shopping');

  const events = await eventsOf(async () => {
    await openGroupCategories(brisbane);
    await moveGroupCategoryExpenses('Gym', 'Shopping');
    await closeGroupCategories();
  });

  expect(events.map((event) => event.stamp)).toEqual([
    stamped(5),
    stamped(6),
    stamped(7),
  ]);
  const moved = events.filter((event) => event.type === 'expense');
  expect(moved.map(withoutStamp).sort(byId)).toEqual(
    [
      { id: rack.id, base: stamped(1) },
      { id: chalk.id, base: stamped(2) },
    ]
      .map(({ id, base }) => ({
        version: 1,
        type: 'expense',
        id,
        units: { category: { value: shopping, base } },
      }))
      .sort(byId),
  );
  expect((await expenseTitled('Squat rack')).category).toEqual(shopping);
  expect((await expenseTitled('Chalk')).category).toEqual(shopping);
});

// What is not a shared ledger's

test('[SYNC-26.1] writes no event for a personal expense, whatever is done to it', async () => {
  await startShared();
  await addExpense();
  const coffee = await expenseTitled('Coffee run');

  await editExpense(coffee.id, { title: 'Latte', amount: '9.00' });
  await deleteByAction('Latte');
  await pressUndo('Latte');
  await deleteByAction('Latte');
  await deletePermanently('Latte');

  expect(await storedExpenses()).toEqual([]);
  expect(await unsent()).toEqual([]);
});

test('[SYNC-26.1] writes no event for the expenses of a group that is not a shared ledger', async () => {
  await startShared({ Brisbane: ['Casey', 'Blake'], Tokyo: ['Dana'] });
  await addGroupExpense({
    group: 'Tokyo',
    title: 'Sushi',
    payer: 'Dana',
    sharers: [YOU, 'Dana'],
  });
  const sushi = await expenseTitled('Sushi');

  await editExpense(sushi.id, { title: 'Ramen', amount: '12.00' });
  await deleteByAction('Ramen');
  await restoreFromTrash('Ramen');
  await tapTab('Expenses');
  await deleteByAction('Ramen');

  expect((await expenseTitled('Ramen')).trashOrder).toBeDefined();
  expect(await unsent()).toEqual([]);
});

test("[SYNC-26.1] [LEDGER-81.2] writes no event when the trash is emptied: the personal expenses go, and the groups' stay in the trash", async () => {
  await startShared({ Brisbane: ['Casey', 'Blake'], Tokyo: ['Dana'] });
  await addExpense();
  await addDinner();
  await addGroupExpense({
    group: 'Tokyo',
    title: 'Sushi',
    payer: 'Dana',
    sharers: [YOU],
  });
  for (const title of ['Coffee run', 'Dinner', 'Sushi'])
    await deleteByAction(title);
  await openTrash();

  const events = await eventsOf(async () => {
    await pressEmptyTrash();
    await pressAlertButton('Empty Trash');
  });

  await expectTrash(['Sushi', 'Dinner']);
  expect(events).toEqual([]);
  expect(
    (await storedExpenses()).map((expense) => expense.title).sort(),
  ).toEqual(['Dinner', 'Sushi']);
});

// Changes too large for an event

test('[SYNC-27.1] saves nothing of an expense whose event would be too large, says why, and saves it once the note is shorter', async () => {
  await startShared();
  await openNewExpense();
  await fillGroupExpense({ ...DINNER, note: 'a'.repeat(70_000) });

  await press('Add');

  await waitFor(() => expect(alertsShown()).toEqual([EXPENSE_TOO_LARGE]));
  expect(formTitle()).toBe('New Expense');
  expect(noteField().props.value).toHaveLength(70_000);
  expect(await storedExpenses()).toEqual([]);
  expect(await unsent()).toEqual([]);

  await fireEvent.changeText(noteField(), 'Window seat');
  await press('Add');
  await expectFormClosed();
  expect((await unsent()).map((event) => event.content)).toEqual([
    await dinnerCreated(
      (await expenseTitled('Dinner')).id,
      stamped(0),
      'Window seat',
    ),
  ]);
});

test('[SYNC-27.1] saves an expense whose event is exactly 65,536 bytes once encrypted, and not one a byte larger', async () => {
  await startShared();
  const empty = await dinnerCreated(
    '00000000-0000-4000-8000-000000000000',
    stamped(0),
    '',
  );
  const fits = 65_536 - encryptedSize(empty);
  await openNewExpense();
  await fillGroupExpense({ ...DINNER, note: 'a'.repeat(fits + 1) });

  await press('Add');
  await waitFor(() => expect(alertsShown()).toEqual([EXPENSE_TOO_LARGE]));
  expect(await storedExpenses()).toEqual([]);

  await fireEvent.changeText(noteField(), 'a'.repeat(fits));
  await press('Add');
  await expectFormClosed();
  const [event] = await unsent();
  expect(encryptedSize(event.content)).toBe(65_536);
  expect(alertsShown()).toEqual([EXPENSE_TOO_LARGE]);
});

test('[SYNC-27.1] counts bytes, not characters', async () => {
  await startShared();
  await openNewExpense();
  await fillGroupExpense({ ...DINNER, note: '帳'.repeat(22_000) });

  await press('Add');
  await waitFor(() => expect(alertsShown()).toEqual([EXPENSE_TOO_LARGE]));

  await fireEvent.changeText(noteField(), '帳'.repeat(21_000));
  await press('Add');
  await expectFormClosed();
  expect(await unsent()).toHaveLength(1);
});

test("[SYNC-27.1] keeps a personal expense personal when making it the shared ledger's would write too large an event", async () => {
  await startShared();
  await addExpense({ note: 'a'.repeat(70_000) });
  const before = await storedExpenses();

  await openEditExpense(before[0].id);
  await chooseGroup('Brisbane');
  await choosePayer(YOU);
  await chooseSharers(YOU, 'Casey');
  await press('Save');

  await waitFor(() => expect(alertsShown()).toEqual([EXPENSE_TOO_LARGE]));
  expect(formTitle()).toBe('Edit Expense');
  expect(await storedExpenses()).toEqual(before);
  expect(await unsent()).toEqual([]);
});

test('[SYNC-27.1] puts no limit on what writes no event: personal expenses and groups that are not shared ledgers', async () => {
  await startShared({ Brisbane: ['Casey', 'Blake'], Tokyo: ['Dana'] });

  await addExpense({ note: 'a'.repeat(70_000) });
  await addGroupExpense({
    group: 'Tokyo',
    title: 'Sushi',
    payer: 'Dana',
    sharers: [YOU],
    note: 'a'.repeat(70_000),
  });

  expect(alertsShown()).toEqual([]);
  expect(
    (await storedExpenses()).map((expense) => expense.note?.length),
  ).toEqual([70_000, 70_000]);
});

test('[SYNC-27.1] saves a small change to an expense that has held a long note since before its group was shared', async () => {
  await startWithGroups({ Brisbane: ['Casey', 'Blake'] });
  await addGroupExpense({ ...DINNER, note: 'a'.repeat(70_000) });
  await share('Brisbane');
  setClock(LATER);
  const dinner = await expenseTitled('Dinner');

  const events = await eventsOf(() =>
    editWith(dinner.id, () => fillForm({ title: 'Supper' })),
  );

  expect(alertsShown()).toEqual([]);
  expect(events).toEqual([
    expenseChanged(dinner.id, stamped(0), {
      title: { value: 'Supper', base: SHARED_STAMP },
    }),
  ]);
  expect((await expenseTitled('Supper')).note).toHaveLength(70_000);
});

test("[LEDGER-124.1] writes no event when the order of a shared ledger's screen is changed", async () => {
  await startShared();
  await addDinner();
  const before = await unsent();
  await showGroup('Brisbane');

  await chooseSort(screenOf('Brisbane'), 'Oldest First');

  expect(sortName(screenOf('Brisbane'))).toBe('Sort By, Oldest First');
  expect(await unsent()).toEqual(before);
});

test("[LEDGER-140.1] [LEDGER-143.3] writes no event when the filter of a shared ledger's screen is changed, saved or deleted", async () => {
  await startShared();
  await addDinner();
  const before = await unsent();
  const prompts = watchPrompts();
  await showGroup('Brisbane');

  await choose('Brisbane', 'Paid by', 'Casey');
  expect(capsuleTexts(screenOf('Brisbane'))).toContain('Paid by Casey');
  expect(await unsent()).toEqual(before);

  await openFilters('Brisbane');
  await pressInFilters(SAVE_FILTER);
  await prompts.answer('Save', 'Mine');
  expect(savedFilterNames()).toEqual(['Mine']);
  expect(await unsent()).toEqual(before);

  await pressDeleteSaved('Mine');
  await pressAlertButton('Delete');
  expect(savedFilterNames()).toEqual([]);
  await closeFilters();
  expect(await unsent()).toEqual(before);
});
