import { waitFor } from '@testing-library/react-native';
import {
  addCategory,
  addExpense,
  editExpense,
  fillForm,
  restart,
  storedExpenses,
} from './ledger-expense-app';
import {
  NOT_FOUND,
  card,
  cardTitles,
  detailLines,
  expensesRoot,
  linesIn,
  openDetails,
  shownInOrder,
  listTotal,
} from './ledger-expense-list-app';
import { chooseSort } from './ledger-list-find-app';
import { capsuleOf, setAmounts } from './ledger-list-filter-app';
import {
  expectPeriod,
  periodName,
  pressPreviousPeriod,
} from './ledger-list-period-app';
import {
  addGroupExpense,
  groupCard,
  groupCardTitles,
} from './ledger-group-expense-app';
import {
  NO_DELETED,
  deleteByAction,
  expectCards,
  expectTrash,
  noticeShown,
  openTrash,
  trashLines,
  undoButton,
} from './ledger-trash-app';
import {
  balancesLines,
  groupTotals,
  openBalances,
  showGroup,
} from './group-balances-app';
import { screenOf } from './group-details-app';
import { expectTotals, openInsights } from './insights-app';
import { allowWrites, failWritesAfter } from './shell-appearance-app';
import { tapTab } from './shell-tabs-app';
import {
  LATER,
  MINUTE,
  OTHER,
  PHONE,
  YOU,
  at,
  categoryOf,
  changed,
  closeGroupCategories,
  created,
  deleted,
  eachTestGetsAPhone,
  editWith,
  eventsOf,
  everything,
  expenseTitled,
  groupId,
  groupNamed,
  members,
  openGroupCategories,
  receive,
  receiveEvents,
  refused,
  relayed,
  removalAlert,
  setClock,
  stamped,
  startShared,
  tryReceive,
  unsent,
} from './sync-app';

// Runs on iOS. Each test starts the app as the group expense tests do, with Taylor
// saved as your name and Brisbane's members Taylor, Casey and Blake, makes Brisbane a
// shared ledger at 2026-10-30T04:00:00Z with phone-a as this phone's device ID, and
// leaves the clock a minute later (sync-app). It hands the app events another phone,
// phone-b, wrote, as its sync will: through the sync capability's applySyncEvents, on
// the app's own database connection, each received at the moment it was stamped.

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

eachTestGetsAPhone('sync-apply-');

/** The ID of Lunch, an expense another phone adds. */
const LUNCH = 'b0000000-0000-4000-8000-000000000001';
const TAXI = 'b0000000-0000-4000-8000-000000000002';

/** Adds Brisbane's Dinner for 100.01: Casey pays, split between Blake, Taylor and Casey in that order. */
const addDinner = () =>
  addGroupExpense({
    group: 'Brisbane',
    payer: 'Casey',
    sharers: ['Blake', YOU, 'Casey'],
  });

/** Lunch for 30.00 as another phone adds it: Casey pays, split between Taylor and Casey. */
async function lunchUnits(overrides: Record<string, unknown> = {}) {
  const ids = await members('Brisbane');
  return {
    title: 'Lunch',
    date: '2026-10-30',
    note: null,
    category: await categoryOf('Brisbane', 'Food & Dining'),
    money: {
      amountMinor: 3000,
      currency: 'USD',
      payments: [{ participant: ids.Casey, amountMinor: 3000 }],
      shares: [
        { participant: ids.Taylor, amountMinor: 1500 },
        { participant: ids.Casey, amountMinor: 1500 },
      ],
    },
    trashed: false,
    ...overrides,
  };
}

const lunchCreated = async (stamp = at(LATER)) =>
  created('expense', LUNCH, stamp, await lunchUnits());

/** Taxi for 25.00 as another phone adds it: Casey pays for Blake alone, so you have no part in it. */
async function taxiCreated(stamp = at(LATER, 1)) {
  const ids = await members('Brisbane');
  return created('expense', TAXI, stamp, {
    title: 'Taxi',
    date: '2026-10-30',
    note: 'Airport',
    category: await categoryOf('Brisbane', 'Transportation'),
    money: {
      amountMinor: 2500,
      currency: 'USD',
      payments: [{ participant: ids.Casey, amountMinor: 2500 }],
      shares: [{ participant: ids.Blake, amountMinor: 2500 }],
    },
    trashed: false,
  });
}

// Applying events

test('[SYNC-28.1] stores what an applied event holds: the expense another phone added, in this shared ledger', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  const units = await lunchUnits();

  await receive(brisbane, await lunchCreated());

  expect(await storedExpenses()).toEqual([
    {
      id: LUNCH,
      spaceId: brisbane,
      title: 'Lunch',
      date: '2026-10-30',
      category: units.category,
      amountMinor: 3000,
      currency: 'USD',
      payments: units.money.payments,
      shares: units.money.shares,
    },
  ]);
});

test('[SYNC-28.1] leaves the local data as it is when the same events arrive again', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  const events = [
    relayed(await lunchCreated()),
    relayed(changed('expense', LUNCH, at(LATER + 1), { title: 'Brunch' })),
    relayed(await taxiCreated()),
    relayed(deleted('expense', TAXI, at(LATER + 2))),
  ];
  await receiveEvents(brisbane, ...events);
  const before = everything();

  await receiveEvents(brisbane, ...events);
  await receiveEvents(brisbane, events[1], events[0], events[3]);

  expect(everything()).toEqual(before);
  await expectCards(['Brunch']);
});

test('[SYNC-28.1] keeps the later change whichever order two changes of one unit arrive in', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');

  await receive(
    brisbane,
    await lunchCreated(),
    changed('expense', LUNCH, at(LATER + 2000), { title: 'Late lunch' }),
    changed('expense', LUNCH, at(LATER + 1000), { title: 'Brunch' }),
  );

  await expectCards(['Late lunch']);
  expect((await expenseTitled('Late lunch')).id).toBe(LUNCH);
});

test('[SYNC-28.1] changes nothing when an event the phone wrote itself comes back', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  await addDinner();
  await editExpense((await expenseTitled('Dinner')).id, { title: 'Supper' });
  const written = await unsent();
  const before = everything();

  await receiveEvents(
    brisbane,
    ...written.map(({ id, content }) =>
      relayed(content, { id, device: PHONE }),
    ),
  );

  expect(everything()).toEqual(before);
  await expectCards(['Supper']);
});

test("[SYNC-28.1] stamps the phone's next change after an event it applied, though its own clock is behind that event", async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  const ahead = LATER + 5 * MINUTE;
  await receive(brisbane, await lunchCreated(at(ahead)));

  const events = await eventsOf(addDinner);

  expect(events.map((event) => event.stamp)).toEqual([stamped(1, ahead)]);
});

test('[SYNC-28.1] applies none of the events handed over together when a write fails, whichever it is', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  const contents = [await lunchCreated(), await taxiCreated()];
  const before = everything();

  let applied = false;
  let writesThrough = 0;
  for (; writesThrough < 200 && !applied; writesThrough += 1) {
    failWritesAfter(writesThrough);
    applied = (await tryReceive(brisbane, ...contents)) === undefined;
    if (!applied) expect(everything()).toEqual(before);
  }
  allowWrites();

  expect(applied).toBe(true);
  expect(writesThrough).toBeGreaterThan(1);
  expect((await storedExpenses()).map((expense) => expense.id).sort()).toEqual([
    LUNCH,
    TAXI,
  ]);
});

// Expenses on screen

test("[SYNC-29.2] shows an expense another phone added on the expense list, first among its day's, without a restart", async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  await addDinner();

  await receive(brisbane, await lunchCreated());

  await expectCards(['Lunch', 'Dinner']);
  const shown = ['Lunch', '$15.00', 'Food & Dining', 'Brisbane'];
  expect(shownInOrder(linesIn(card('Lunch')), shown)).toEqual(shown);
  expect(listTotal()).toEqual(['$48.34']);
});

test('[LEDGER-117.2] leaves the expense list on its period when another phone adds an expense dated outside it', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  await addDinner();

  await receive(
    brisbane,
    created(
      'expense',
      LUNCH,
      at(LATER),
      await lunchUnits({ date: '2026-09-15' }),
    ),
  );

  await expectCards(['Dinner']);
  expect(periodName(expensesRoot())).toBe('October 2026');
  await pressPreviousPeriod(expensesRoot());
  await expectPeriod(expensesRoot, 'September 2026');
  await expectCards(['Lunch']);
});

test('[LEDGER-142.1] keeps the filter of the expense list when another phone adds an expense that does not pass it', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  await addDinner();
  await setAmounts('Expenses', '20');
  await expectCards(['Dinner']);

  await receive(brisbane, await lunchCreated());

  expect(capsuleOf(expensesRoot(), 'Amount')).toBe('20 or more');
  await expectCards(['Dinner']);
});

test('[LEDGER-117.2] leaves the expense list on its period when another phone restores an expense dated outside it', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  await addDinner();
  await receive(
    brisbane,
    created(
      'expense',
      LUNCH,
      at(LATER),
      await lunchUnits({ date: '2026-09-15' }),
    ),
    changed('expense', LUNCH, at(LATER + 1000), { trashed: true }),
  );
  await openTrash();
  await expectTrash(['Lunch']);
  await tapTab('Expenses');

  await receive(
    brisbane,
    changed('expense', LUNCH, at(LATER + 2000), { trashed: false }),
  );

  await expectCards(['Dinner']);
  expect(periodName(expensesRoot())).toBe('October 2026');
  await pressPreviousPeriod(expensesRoot());
  await expectPeriod(expensesRoot, 'September 2026');
  await expectCards(['Lunch']);
});

test("[SYNC-29.2] shows it on the group's screen, open at the time, and in the group's total", async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  await addDinner();
  await showGroup('Brisbane');

  await receive(brisbane, await lunchCreated(), await taxiCreated());

  await waitFor(() =>
    expect(groupCardTitles('Brisbane')).toEqual(['Taxi', 'Lunch', 'Dinner']),
  );
  const shown = ['Lunch', '$30.00', 'Food & Dining', 'Paid by Casey'];
  expect(shownInOrder(linesIn(groupCard('Brisbane', 'Lunch')), shown)).toEqual(
    shown,
  );
  expect(groupTotals('Brisbane')).toEqual(['Group Total: $155.01']);
});

test('[SYNC-29.2] leaves an expense you have no part in off the expense list', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');

  await receive(brisbane, await taxiCreated());

  await showGroup('Brisbane');
  await waitFor(() => expect(groupCardTitles('Brisbane')).toEqual(['Taxi']));
  await tapTab('Expenses');
  expect(cardTitles()).toEqual([]);
});

test('[SYNC-29.2] counts it in Balances and in Insights', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  await addDinner();

  await receive(brisbane, await lunchCreated());

  await openInsights();
  await expectTotals(['$48.34']);
  await showGroup('Brisbane');
  await openBalances('Brisbane');
  await waitFor(() =>
    expect(balancesLines()).toEqual([
      'Taylor (You)',
      'Owes $48.34',
      'Paid $0.00 · Share $48.34',
      'Casey',
      'Is Owed $81.68',
      'Paid $130.01 · Share $48.33',
      'Blake',
      'Owes $33.34',
      'Paid $0.00 · Share $33.34',
    ]),
  );
});

test("[SYNC-29.2] shows another phone's changes on details that are open", async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  const ids = await members('Brisbane');
  await receive(brisbane, await lunchCreated());
  await expectCards(['Lunch']);
  await openDetails('Lunch');

  await receive(
    brisbane,
    changed('expense', LUNCH, at(LATER + 1000), {
      title: 'Late lunch',
      note: 'Window seat',
      money: {
        amountMinor: 4000,
        currency: 'USD',
        payments: [{ participant: ids.Taylor, amountMinor: 4000 }],
        shares: [
          { participant: ids.Taylor, amountMinor: 2000 },
          { participant: ids.Blake, amountMinor: 2000 },
        ],
      },
    }),
  );

  await waitFor(() => expect(detailLines()).toContain('Late lunch'));
  const shown = [
    'Late lunch',
    '$40.00',
    'You paid',
    '$40.00',
    'Your share',
    '$20.00',
    'You are owed',
    '$20.00',
    'PAID BY',
    'Taylor (You)',
    'SPLIT',
    'Taylor (You)',
    'Blake',
    'Window seat',
  ];
  expect(shownInOrder(detailLines(), shown)).toEqual(shown);
  expect(detailLines()).not.toContain('Lunch');
  expect(detailLines()).not.toContain('Casey');
});

test('[SYNC-29.2] keeps an expense where it is in its day when a change to it arrives', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  await receive(brisbane, await lunchCreated());
  await addDinner();
  await expectCards(['Dinner', 'Lunch']);

  await receive(
    brisbane,
    changed('expense', LUNCH, at(LATER + 1000), { title: 'Late lunch' }),
  );

  await expectCards(['Dinner', 'Late lunch']);
});

test('[SYNC-29.2] shows nothing of an expense until all six of its units have arrived', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  await showGroup('Brisbane');

  await receive(
    brisbane,
    changed('expense', LUNCH, at(LATER + 1000), { title: 'Brunch' }),
  );
  expect(await storedExpenses()).toEqual([]);
  expect(groupCardTitles('Brisbane')).toEqual([]);

  await receive(brisbane, await lunchCreated());
  await waitFor(() => expect(groupCardTitles('Brisbane')).toEqual(['Brunch']));
});

test('[SYNC-29.2] moves an expense another phone deleted to the top of Trash with no Undo notice, and back to its place when that phone restores it', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  await addExpense();
  await addDinner();
  await addGroupExpense({
    group: 'Brisbane',
    title: 'Taxi',
    amount: '25.00',
    payer: YOU,
    sharers: [YOU],
  });
  const dinner = await expenseTitled('Dinner');
  await deleteByAction('Coffee run');
  await expectCards(['Taxi', 'Dinner']);

  await receive(
    brisbane,
    changed('expense', dinner.id, at(LATER + 1000), { trashed: true }),
  );

  await expectCards(['Taxi']);
  expect(listTotal()).toEqual(['$25.00']);
  expect(undoButton('Dinner')).toBeNull();
  await openTrash();
  await expectTrash(['Dinner', 'Coffee run']);

  await receive(
    brisbane,
    changed('expense', dinner.id, at(LATER + 2000), { trashed: false }),
  );

  await expectTrash(['Coffee run']);
  await tapTab('Expenses');
  await expectCards(['Taxi', 'Dinner']);
});

test('[SYNC-29.2] leaves an expense where it is in Trash when another phone deletes it too', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  await addDinner();
  await addExpense();
  const dinner = await expenseTitled('Dinner');
  await deleteByAction('Dinner');
  await deleteByAction('Coffee run');
  await openTrash();
  await expectTrash(['Coffee run', 'Dinner']);

  await receive(
    brisbane,
    changed('expense', dinner.id, at(LATER + 1000), { trashed: true }),
  );

  await expectTrash(['Coffee run', 'Dinner']);
});

test('[SYNC-29.2] leaves an expense where it is in Trash when another phone changes its title', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  await addDinner();
  await addExpense();
  const dinner = await expenseTitled('Dinner');
  await deleteByAction('Dinner');
  await deleteByAction('Coffee run');
  await openTrash();
  await expectTrash(['Coffee run', 'Dinner']);

  await receive(
    brisbane,
    changed('expense', dinner.id, at(LATER + 1000), { title: 'Supper' }),
  );

  await expectTrash(['Coffee run', 'Supper']);
});

test('[SYNC-29.2] still shows the applied expenses after a restart', async () => {
  const app = await startShared();
  const brisbane = await groupId('Brisbane');
  await receive(
    brisbane,
    await lunchCreated(),
    changed('expense', LUNCH, at(LATER + 1000), { title: 'Late lunch' }),
  );

  await restart(app);

  await expectCards(['Late lunch']);
});

// Permanent deletions

test('[SYNC-30.1] takes an expense another phone deleted for good off every screen, with its payments and shares', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  await addDinner();
  const dinner = await expenseTitled('Dinner');
  await expectCards(['Dinner']);

  await receive(brisbane, deleted('expense', dinner.id, at(LATER + 1000)));

  await expectCards([]);
  expect(listTotal()).toEqual(['—']);
  expect(await storedExpenses()).toEqual([]);
  await showGroup('Brisbane');
  expect(groupCardTitles('Brisbane')).toEqual([]);
  await openTrash();
  await waitFor(() => expect(trashLines()).toEqual([NO_DELETED]));
});

test('[SYNC-30.1] takes it out of Trash too', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  await addDinner();
  const dinner = await expenseTitled('Dinner');
  await deleteByAction('Dinner');
  await openTrash();
  await expectTrash(['Dinner']);

  await receive(brisbane, deleted('expense', dinner.id, at(LATER + 1000)));

  await waitFor(() => expect(trashLines()).toEqual([NO_DELETED]));
  expect(await storedExpenses()).toEqual([]);
});

test('[SYNC-30.1] shows only Expense not found. on its details that are open', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  await addDinner();
  const dinner = await expenseTitled('Dinner');
  await openDetails('Dinner');

  await receive(brisbane, deleted('expense', dinner.id, at(LATER + 1000)));

  await waitFor(() => expect(detailLines()).toEqual([NOT_FOUND]));
});

test('[SYNC-30.1] keeps it deleted whatever arrives afterwards, and when the deletion arrives before its first event', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  await addDinner();
  const dinner = await expenseTitled('Dinner');
  await receive(brisbane, deleted('expense', dinner.id, at(LATER + 1000)));

  await receive(
    brisbane,
    changed('expense', dinner.id, at(LATER + 2000), {
      title: 'Supper',
      trashed: false,
    }),
    created('expense', dinner.id, at(LATER + 3000), await lunchUnits()),
    deleted('expense', LUNCH, at(LATER + 1000)),
    await lunchCreated(at(LATER + 2000)),
  );

  expect(await storedExpenses()).toEqual([]);
  await expectCards([]);
});

test('[SYNC-30.1] no longer counts it as using its category', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  await addCategory('Gym', brisbane);
  await addGroupExpense({
    group: 'Brisbane',
    title: 'Squat rack',
    payer: YOU,
    sharers: [YOU],
    category: 'Gym',
  });
  const rack = await expenseTitled('Squat rack');

  await receive(brisbane, deleted('expense', rack.id, at(LATER + 1000)));

  await openGroupCategories(brisbane);
  expect(await removalAlert('Gym')).toEqual([
    'Delete Category?',
    'This permanently removes the category.',
  ]);
  await closeGroupCategories();
});

// The Undo notice of an expense another phone takes out of the trash

test('[SYNC-44.1] hides the Undo notice of an expense once another phone restores it', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  await addDinner();
  const dinner = await expenseTitled('Dinner');
  await deleteByAction('Dinner');
  expect(undoButton('Dinner')).not.toBeNull();

  await receive(
    brisbane,
    changed('expense', dinner.id, at(LATER + 1000), { trashed: false }),
  );

  expect(noticeShown()).toBe(false);
  await expectCards(['Dinner']);
});

test('[SYNC-44.1] hides the Undo notice of an expense once another phone deletes it for good', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  await addDinner();
  const dinner = await expenseTitled('Dinner');
  await deleteByAction('Dinner');
  expect(undoButton('Dinner')).not.toBeNull();

  await receive(brisbane, deleted('expense', dinner.id, at(LATER + 1000)));

  expect(noticeShown()).toBe(false);
});

test('[SYNC-44.1] keeps the Undo notice of an expense when another phone restores another one', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  await addDinner();
  await addGroupExpense({
    group: 'Brisbane',
    title: 'Taxi',
    amount: '25.00',
    payer: YOU,
    sharers: [YOU],
  });
  const taxi = await expenseTitled('Taxi');
  await deleteByAction('Taxi');
  await deleteByAction('Dinner');

  await receive(
    brisbane,
    changed('expense', taxi.id, at(LATER + 1000), { trashed: false }),
  );

  await expectCards(['Taxi']);
  expect(undoButton('Dinner')).not.toBeNull();
});

// Events that do not apply

test('[SYNC-31.1] changes nothing for an event that does not apply, and keeps it with the reason', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  const units = await lunchUnits();
  const wrongSum = created('expense', LUNCH, at(LATER), {
    ...units,
    money: { ...units.money, amountMinor: 3100 },
  });
  const noTitle = created('expense', LUNCH, at(LATER, 1), {
    ...units,
    title: '',
  });
  const unknownCurrency = created('expense', LUNCH, at(LATER, 2), {
    ...units,
    money: { ...units.money, currency: 'XYZ' },
  });
  const fastClock = relayed(await lunchCreated(at(LATER + 60 * MINUTE)), {
    receivedAtMs: LATER,
  });
  const events = [
    relayed(wrongSum),
    relayed(noTitle),
    relayed(unknownCurrency),
    fastClock,
    relayed(null),
  ];
  await addDinner();
  const stored = await storedExpenses();
  const written = await unsent();

  await receiveEvents(brisbane, ...events);

  expect(await storedExpenses()).toEqual(stored);
  expect(await unsent()).toEqual(written);
  await expectCards(['Dinner']);
  expect(await refused()).toEqual(
    events.map((event, index) => ({
      ...event,
      groupId: brisbane,
      reason: ['sum', 'structure', 'currency', 'clock', 'structure'][index],
    })),
  );
  expect(events[4].device).toBe(OTHER);
});

test("[SYNC-31.1] does not move the phone's own stamps on for an event stamped too far ahead", async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  await receiveEvents(
    brisbane,
    relayed(await lunchCreated(at(LATER + 60 * MINUTE)), {
      receivedAtMs: LATER,
    }),
  );

  const events = await eventsOf(addDinner);

  expect(events.map((event) => event.stamp)).toEqual([stamped(0)]);
});

test('[SYNC-31.1] applies the events that follow one that does not apply', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');

  await receive(
    brisbane,
    created('expense', TAXI, at(LATER), { ...(await lunchUnits()), title: '' }),
    await lunchCreated(),
  );

  await expectCards(['Lunch']);
  expect(await refused()).toHaveLength(1);
});

test('[SYNC-31.1] keeps one record of an event that arrives twice, and keeps it after a restart', async () => {
  const app = await startShared();
  const brisbane = await groupId('Brisbane');
  const event = relayed(
    created('expense', LUNCH, at(LATER), {
      ...(await lunchUnits()),
      title: '',
    }),
  );
  await receiveEvents(brisbane, event);
  await receiveEvents(brisbane, event);

  await restart(app);

  expect(await refused()).toEqual([
    { ...event, groupId: brisbane, reason: 'structure' },
  ]);
});

// What cannot be applied at all

test('[SYNC-43.1] applies none of the events handed over together when one is of a format version it does not know', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  const before = everything();

  const error = await tryReceive(brisbane, await lunchCreated(), {
    ...(await taxiCreated()),
    version: 2,
  });

  expect(error).toBeInstanceOf(Error);
  expect(everything()).toEqual(before);
  await receive(brisbane, await lunchCreated());
  await expectCards(['Lunch']);
});

test('[SYNC-43.1] applies nothing to a group that is not a shared ledger', async () => {
  await startShared({ Brisbane: ['Casey', 'Blake'], Tokyo: ['Dana'] });
  const brisbane = await groupId('Brisbane');
  const tokyo = await groupId('Tokyo');
  const before = everything();

  const error = await tryReceive(tokyo, await lunchCreated());

  expect(error).toBeInstanceOf(Error);
  expect(everything()).toEqual(before);
  await receive(brisbane, await lunchCreated());
  await expectCards(['Lunch']);
});

// Other spaces

test("[SYNC-32.1] leaves a personal expense and another group's expense as they are when a shared ledger's event names their IDs", async () => {
  await startShared({ Brisbane: ['Casey', 'Blake'], Tokyo: ['Dana'] });
  const brisbane = await groupId('Brisbane');
  await addExpense();
  await addGroupExpense({
    group: 'Tokyo',
    title: 'Sushi',
    payer: 'Dana',
    sharers: [YOU],
  });
  const coffee = await expenseTitled('Coffee run');
  const sushi = await expenseTitled('Sushi');
  const stored = await storedExpenses();

  await receive(
    brisbane,
    created('expense', coffee.id, at(LATER), await lunchUnits()),
    changed('expense', sushi.id, at(LATER, 1), { title: 'Hacked' }),
    deleted('expense', sushi.id, at(LATER, 2)),
    created('expense', sushi.id, at(LATER, 3), await lunchUnits()),
    await taxiCreated(at(LATER, 4)),
  );

  expect((await storedExpenses()).filter(({ id }) => id !== TAXI)).toEqual(
    stored,
  );
  await expectCards(['Sushi', 'Coffee run']);
  await showGroup('Brisbane');
  await waitFor(() => expect(groupCardTitles('Brisbane')).toEqual(['Taxi']));
});

test("[SYNC-32.1] leaves another group as it is when a group event in a shared ledger names that group's ID", async () => {
  await startShared({ Brisbane: ['Casey', 'Blake'], Tokyo: ['Dana'] });
  const brisbane = await groupId('Brisbane');
  const tokyo = await groupId('Tokyo');
  const before = [await groupNamed('Brisbane'), await groupNamed('Tokyo')];

  await receive(
    brisbane,
    changed('group', tokyo, at(LATER), { name: 'Hacked' }),
  );

  expect([await groupNamed('Brisbane'), await groupNamed('Tokyo')]).toEqual(
    before,
  );
});

// The time an expense was last changed (LEDGER-120.1), seen in the Recently Edited order

/** Adds Brisbane's Taxi for 25.00 on this phone: Casey pays, split between Taylor and Casey. */
const addTaxi = () =>
  addGroupExpense({
    group: 'Brisbane',
    payer: 'Casey',
    sharers: [YOU, 'Casey'],
    title: 'Taxi',
    amount: '25.00',
  });

test('[LEDGER-120.1] [SYNC-29.2] takes the moment an applied event was stamped as the time the expense it adds or changes was last changed, and lists it by that time in Recently Edited', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  await addDinner();
  await addTaxi();
  await showGroup('Brisbane');
  await chooseSort(screenOf('Brisbane'), 'Recently Edited');
  // Both were added at the same moment, so the one added later comes first.
  expect(groupCardTitles('Brisbane')).toEqual(['Taxi', 'Dinner']);

  await receive(brisbane, await lunchCreated(at(LATER + MINUTE)));

  await waitFor(() =>
    expect(groupCardTitles('Brisbane')).toEqual(['Lunch', 'Taxi', 'Dinner']),
  );

  const dinner = await expenseTitled('Dinner');
  await receive(
    brisbane,
    changed('expense', dinner.id, at(LATER + 2 * MINUTE), { title: 'Supper' }),
  );

  await waitFor(() =>
    expect(groupCardTitles('Brisbane')).toEqual(['Supper', 'Lunch', 'Taxi']),
  );
});

test('[LEDGER-120.1] keeps the later time when an applied event was stamped before the expense was last changed on this phone', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  await addDinner();
  await addTaxi();
  setClock(LATER + 2 * MINUTE);
  await editWith((await expenseTitled('Taxi')).id, () =>
    fillForm({ title: 'Cab' }),
  );
  setClock(LATER + 3 * MINUTE);
  const dinner = await expenseTitled('Dinner');
  await editWith(dinner.id, () => fillForm({ title: 'Supper' }));
  await showGroup('Brisbane');
  await chooseSort(screenOf('Brisbane'), 'Recently Edited');
  expect(groupCardTitles('Brisbane')).toEqual(['Supper', 'Cab']);

  await receive(
    brisbane,
    changed('expense', dinner.id, at(LATER + MINUTE), { note: 'Window seat' }),
  );

  expect((await expenseTitled('Supper')).note).toBe('Window seat');
  expect(groupCardTitles('Brisbane')).toEqual(['Supper', 'Cab']);
});

test('[LEDGER-120.1] leaves the time an expense was last changed as it is when the same event arrives again', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  await addDinner();
  const lunch = relayed(await lunchCreated(at(LATER + MINUTE)));
  await receiveEvents(brisbane, lunch);
  setClock(LATER + 2 * MINUTE);
  await editWith((await expenseTitled('Dinner')).id, () =>
    fillForm({ title: 'Supper' }),
  );
  await showGroup('Brisbane');
  await chooseSort(screenOf('Brisbane'), 'Recently Edited');
  expect(groupCardTitles('Brisbane')).toEqual(['Supper', 'Lunch']);

  setClock(LATER + 3 * MINUTE);
  await receiveEvents(brisbane, lunch);

  expect(groupCardTitles('Brisbane')).toEqual(['Supper', 'Lunch']);
});
