import { fireEvent, waitFor } from '@testing-library/react-native';
import { overridesSyncMoney, type SyncStamp } from '@shared-expense/domain';
import {
  SAVE_FAILED,
  addCategory,
  editExpense,
  expectFormClosed,
  fillForm,
  formCurrency,
  inTreeOrder,
  openEditExpense,
  press,
  restart,
} from './ledger-expense-app';
import {
  card,
  detailLines,
  drawnTexts,
  linesIn,
  openDetails,
  readOut,
  shownInOrder,
} from './ledger-expense-list-app';
import { chooseSort, typeSearch } from './ledger-list-find-app';
import { setAmounts } from './ledger-list-filter-app';
import { choosePeriod } from './ledger-list-period-app';
import {
  addGroupExpense,
  archiveGroup,
  choosePayer,
  detailBarsOn,
  detailLinesOn,
  expectDetailsOn,
  groupCard,
  groupCardTitles,
  isDisabled,
  isRowDisabled,
  removeFromGroup,
  renameInGroup,
  restoreGroup,
  startWithGroups,
} from './ledger-group-expense-app';
import {
  IN_TRASH,
  deleteByAction,
  expectCards,
  expenseLines,
  openTrash,
  openTrashed,
  pressUndo,
  restoreFromTrash,
  trashCard,
} from './ledger-trash-app';
import {
  READ_ONLY,
  openArchivedGroup,
  openArchivedGroups,
} from './group-archive-app';
import { groupTotals, showGroup } from './group-balances-app';
import {
  NO_EXPENSES,
  alertsShown,
  goBackFrom,
  largeTitle,
  screenOf,
  textsOn,
} from './group-details-app';
import { openGroupInsights, openInsights } from './insights-app';
import { categoryCard, openCategory } from './insights-category-app';
import { iconNames, iconsIn } from './shell-actions-app';
import {
  allowWrites,
  failWrites,
  failWritesAfter,
  holdWrites,
  settle,
} from './shell-appearance-app';
import {
  navigationBarTitles,
  selectedTab,
  tab,
  tapTab,
} from './shell-tabs-app';
import {
  BRISBANE,
  LATER,
  MINUTE,
  PHONE,
  YOU,
  at,
  baseOf,
  categoryOf,
  changed,
  deleted,
  eachTestGetsAPhone,
  eventsOf,
  everything,
  expectUnsentAreValid,
  expenseTitled,
  groupId,
  merged,
  receive,
  receiveEvents,
  refused,
  relayed,
  setClock,
  share,
  stamped,
  startShared,
  tryReceive,
  unsent,
} from './sync-app';
import {
  KEEP_CURRENT,
  MARK,
  MARK_ICON,
  MARK_TEXT,
  REVIEW_HINT,
  SHARERS,
  USE_MINE,
  addDinner,
  blockButtonOn,
  blockOf,
  expectBlockOn,
  expectToReview,
  moneyOf,
  needsReview,
  openFromGroup,
  pressInBlockOn,
  reviewButton,
  reviewCount,
  sideOf,
  sidesIn,
  sidesOf,
} from './sync-conflict-app';

// Runs on iOS. Each test starts the app as the other sync tests do (sync-app): Taylor is
// your name, Brisbane's members are Taylor, Casey and Blake, Brisbane becomes a shared
// ledger at 2026-10-30T04:00:00Z with phone-a as this phone's device ID, and the clock
// stands a minute later, so this phone's events are stamped LATER/0, LATER/1 and so on.
// The tests change Dinner's amount through its form, and hand the app what phone-b wrote
// without having seen that change, as its sync will (applySyncEvents).

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

eachTestGetsAPhone('sync-conflict-');

/** T+120000, T+150000 and T+180000 of the sync spec's scenarios: LATER is T+60000. */
const T120 = LATER + MINUTE;
const T150 = LATER + 90_000;
const T180 = LATER + 2 * MINUTE;
/** A third phone. */
const THIRD = 'phone-c';

/** The two sides of the mark's block once phone-b's 90.00 has overridden your 120.00. */
const CURRENT_90 = sideOf('$90.00', 'Casey', SHARERS);
const YOURS_120 = sideOf('$120.00', 'Casey', SHARERS);

type Money = Awaited<ReturnType<typeof moneyOf>>;

/** What a stored expense holds of an amount group. */
const stored = ({ amountMinor, currency, payments, shares }: Money) => ({
  amountMinor,
  currency,
  payments,
  shares,
});

/**
 * Another phone's change of an expense's amount group: phone-b's 90.00, stamped T+120000
 * and based on the expense's first event, LATER/0, unless said otherwise. With `base`
 * null it names no base.
 */
async function theirChange(
  id: string,
  {
    stamp = at(T120),
    base = stamped(0),
    money,
  }: { stamp?: SyncStamp; base?: SyncStamp | null; money?: Money } = {},
) {
  return changed(
    'expense',
    id,
    stamp,
    { money: money ?? (await moneyOf(9000)) },
    base === null ? {} : { money: base },
  );
}

/** Brisbane is a shared ledger with Dinner, added at LATER/0, whose amount you changed to 120.00 at LATER/1. */
async function withYourChange() {
  const app = await startShared();
  const brisbane = await groupId('Brisbane');
  await addDinner();
  const dinner = await expenseTitled('Dinner');
  await editExpense(dinner.id, { amount: '120.00' });
  return { app, brisbane, dinner };
}

/** As withYourChange, and phone-b's 90.00 has arrived since, as `theirs`: Dinner needs review. */
async function overridden() {
  const setup = await withYourChange();
  const theirs = relayed(await theirChange(setup.dinner.id));
  await receiveEvents(setup.brisbane, theirs);
  return { ...setup, theirs };
}

/** Presses `name` in the mark's block of Dinner's details, opened from Brisbane's screen, waits until the block is gone, and goes back. */
async function choose(name: string, title = 'Dinner') {
  await openFromGroup('Brisbane', title);
  await pressInBlockOn('Groups', name);
  await waitFor(() => expect(detailLinesOn('Groups')).not.toContain(MARK));
  await goBackFrom('Expense');
}

// Saving a change made on a form that was open while events were applied

test('[SYNC-23.2] [LEDGER-56.2] writes only the unit changed on the form, and leaves what another phone changed while the form was open', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  await addDinner();
  const dinner = await expenseTitled('Dinner');
  const theirs = await moneyOf(9000);
  await openEditExpense(dinner.id);
  await receive(
    brisbane,
    changed(
      'expense',
      dinner.id,
      at(T120),
      { note: 'Window seat', money: theirs },
      { note: stamped(0), money: stamped(0) },
    ),
  );

  const events = await eventsOf(async () => {
    await fillForm({ title: 'Supper' });
    await press('Save');
    await expectFormClosed();
  });

  expect(events).toEqual([
    {
      version: 1,
      stamp: stamped(1, T120),
      type: 'expense',
      id: dinner.id,
      units: { title: { value: 'Supper', base: stamped(0) } },
    },
  ]);
  expect(await expenseTitled('Supper')).toMatchObject({
    note: 'Window seat',
    ...stored(theirs),
  });
});

test('[SYNC-23.2] bases a unit changed on the form on the stamp it had when the form opened, though another phone changed it meanwhile', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  await addDinner();
  const dinner = await expenseTitled('Dinner');
  const theirs = await moneyOf(9000);
  await openEditExpense(dinner.id);
  await receive(
    brisbane,
    changed(
      'expense',
      dinner.id,
      at(T120),
      { title: 'Brunch', money: theirs },
      { title: stamped(0), money: stamped(0) },
    ),
  );

  const events = await eventsOf(async () => {
    await fillForm({ amount: '120.00' });
    await press('Save');
    await expectFormClosed();
  });

  const yours = await moneyOf(12000);
  expect(events).toEqual([
    {
      version: 1,
      stamp: stamped(1, T120),
      type: 'expense',
      id: dinner.id,
      units: { money: { value: yours, base: stamped(0) } },
    },
  ]);
  expect(await expenseTitled('Brunch')).toMatchObject(stored(yours));
  // phone-b had changed the amount at T+120000, and this event did not see that.
  expect(
    overridesSyncMoney(events[0], {
      id: dinner.id,
      stamp: at(T120),
      money: theirs,
    }),
  ).toBe(true);
});

/**
 * Brisbane is not shared yet and has Dinner, whose Edit Expense is open. Then Brisbane
 * becomes a shared ledger, and phone-b's change of Dinner, `values`, stamped T+120000,
 * arrives: the form is still open (issue 227).
 */
async function sharedWhileTheFormIsOpen(
  values: (theirs: Money) => Record<string, unknown>,
) {
  await startWithGroups(BRISBANE);
  await addDinner();
  const dinner = await expenseTitled('Dinner');
  await openEditExpense(dinner.id);
  const brisbane = await share('Brisbane');
  setClock(LATER);
  const theirs = await moneyOf(9000);
  await receive(
    brisbane,
    changed('expense', dinner.id, at(T120), values(theirs)),
  );
  return { dinner, theirs };
}

test('[SYNC-23.2] writes only the unit changed on a form that opened before the group became a shared ledger, with no base, and leaves what another phone changed since', async () => {
  const { dinner, theirs } = await sharedWhileTheFormIsOpen((money) => ({
    note: 'Window seat',
    money,
  }));

  const events = await eventsOf(async () => {
    await fillForm({ title: 'Supper' });
    await press('Save');
    await expectFormClosed();
  });

  expect(events).toEqual([
    {
      version: 1,
      stamp: stamped(1, T120),
      type: 'expense',
      id: dinner.id,
      units: { title: { value: 'Supper' } },
    },
  ]);
  expect(await expenseTitled('Supper')).toMatchObject({
    note: 'Window seat',
    ...stored(theirs),
  });
});

test('[SYNC-23.2] writes the amount changed on a form that opened before the group became a shared ledger with no base, so the phone that changed it meanwhile is told', async () => {
  const { dinner, theirs } = await sharedWhileTheFormIsOpen((money) => ({
    title: 'Brunch',
    money,
  }));

  const events = await eventsOf(async () => {
    await fillForm({ amount: '120.00' });
    await press('Save');
    await expectFormClosed();
  });

  const yours = await moneyOf(12000);
  expect(events).toEqual([
    {
      version: 1,
      stamp: stamped(1, T120),
      type: 'expense',
      id: dinner.id,
      units: { money: { value: yours } },
    },
  ]);
  expect(await expenseTitled('Brunch')).toMatchObject(stored(yours));
  // phone-b had changed the amount at T+120000, and this event did not see that.
  expect(
    overridesSyncMoney(events[0], {
      id: dinner.id,
      stamp: at(T120),
      money: theirs,
    }),
  ).toBe(true);
});

test('[SYNC-23.2] saves a change of the title though another phone deleted the category of the expense while the form was open', async () => {
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
  const gym = await categoryOf('Brisbane', 'Gym');
  const added = (await unsent()).at(-1)!.content.stamp;
  await openEditExpense(rack.id);
  await receive(brisbane, deleted('category', gym.id, at(T120)));
  const shown = alertsShown().length;

  const events = await eventsOf(async () => {
    await fillForm({ title: 'Bench' });
    await press('Save');
    await expectFormClosed();
  });

  expect(alertsShown()).toHaveLength(shown);
  expect(events).toEqual([
    {
      version: 1,
      stamp: stamped(1, T120),
      type: 'expense',
      id: rack.id,
      units: { title: { value: 'Bench', base: added } },
    },
  ]);
  expect((await expenseTitled('Bench')).category).toEqual(
    await categoryOf('Brisbane', 'Uncategorized'),
  );
});

/** Dinner's Edit Expense is open, and phone-b's change of its amount group to 9000 JPY has been applied since. */
async function yenWhileTheFormIsOpen() {
  await startShared();
  const brisbane = await groupId('Brisbane');
  await addDinner();
  const dinner = await expenseTitled('Dinner');
  const theirs = await moneyOf(9000, { currency: 'JPY' });
  await openEditExpense(dinner.id);
  await receive(brisbane, await theirChange(dinner.id, { money: theirs }));
  return { dinner, theirs };
}

test('[SYNC-23.2] [LEDGER-56.2] saves an amount changed on the form in the currency the form shows, though another phone changed the currency while it was open', async () => {
  const { dinner } = await yenWhileTheFormIsOpen();
  expect(formCurrency()).toBe('USD');

  const events = await eventsOf(async () => {
    await fillForm({ amount: '120.00' });
    await press('Save');
    await expectFormClosed();
  });

  const yours = await moneyOf(12000);
  expect(events).toEqual([
    {
      version: 1,
      stamp: stamped(1, T120),
      type: 'expense',
      id: dinner.id,
      units: { money: { value: yours, base: stamped(0) } },
    },
  ]);
  expect(await expenseTitled('Dinner')).toMatchObject(stored(yours));
});

test('[SYNC-23.2] [LEDGER-56.2] leaves the amount in the currency another phone gave it when the form changed only the title', async () => {
  const { dinner, theirs } = await yenWhileTheFormIsOpen();

  const events = await eventsOf(async () => {
    await fillForm({ title: 'Supper' });
    await press('Save');
    await expectFormClosed();
  });

  expect(events).toEqual([
    {
      version: 1,
      stamp: stamped(1, T120),
      type: 'expense',
      id: dinner.id,
      units: { title: { value: 'Supper', base: stamped(0) } },
    },
  ]);
  expect(await expenseTitled('Supper')).toMatchObject(stored(theirs));
});

test('[SYNC-23.2] writes only the title of an expense with a former member, whose amount is locked, though another phone changed the amount while the form was open', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  await addDinner();
  const dinner = await expenseTitled('Dinner');
  await removeFromGroup('Brisbane', 'Blake');
  const theirs = await moneyOf(9000);
  await openEditExpense(dinner.id);
  // Blake shares Dinner and has left the group, so the form locks its amount (LEDGER-60.1).
  expect(isRowDisabled('Paid by')).toBe(true);
  await receive(
    brisbane,
    changed(
      'expense',
      dinner.id,
      at(T120),
      { money: theirs },
      { money: stamped(0) },
    ),
  );

  const events = await eventsOf(async () => {
    await fillForm({ title: 'Supper' });
    await press('Save');
    await expectFormClosed();
  });

  expect(events).toEqual([
    {
      version: 1,
      stamp: stamped(1, T120),
      type: 'expense',
      id: dinner.id,
      units: { title: { value: 'Supper', base: stamped(0) } },
    },
  ]);
  expect(await expenseTitled('Supper')).toMatchObject(stored(theirs));
});

// This phone's own change of an amount

test("[SYNC-129.1] takes adding an expense for this phone's own change of its amount: an event that names no base overrides it", async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  await addDinner();
  const dinner = await expenseTitled('Dinner');

  await receive(brisbane, await theirChange(dinner.id, { base: null }));

  await expectToReview('Brisbane', ['Dinner']);
  expect(await sidesOf('Brisbane', 'Dinner')).toEqual({
    current: CURRENT_90,
    yours: sideOf('$100.01', 'Casey', SHARERS),
  });
});

test('[SYNC-129.1] keeps the last change of the amount when a later save changes only another unit', async () => {
  const { brisbane, dinner } = await withYourChange();
  await editExpense(dinner.id, { title: 'Supper' });

  // phone-b had seen the 120.00 of LATER/1: the title's save at LATER/2 did not take its place.
  await receive(brisbane, await theirChange(dinner.id, { base: stamped(1) }));

  await showGroup('Brisbane');
  await waitFor(() =>
    expect(linesIn(groupCard('Brisbane', 'Supper'))).toContain('$90.00'),
  );
  await expectToReview('Brisbane', []);

  // phone-c had seen neither amount.
  await receive(
    brisbane,
    await theirChange(dinner.id, {
      stamp: at(T180, 0, THIRD),
      money: await moneyOf(8000),
    }),
  );

  await expectToReview('Brisbane', ['Supper']);
  expect(await sidesOf('Brisbane', 'Supper')).toEqual({
    current: sideOf('$80.00', 'Casey', SHARERS),
    yours: YOURS_120,
  });
});

test('[SYNC-129.1] holds no own change for an expense the group had when it became a shared ledger, until this phone changes its amount', async () => {
  await startWithGroups(BRISBANE);
  await addDinner();
  await share('Brisbane');
  setClock(LATER);
  const brisbane = await groupId('Brisbane');
  const dinner = await expenseTitled('Dinner');
  // The stamp the expense got when Brisbane was shared is the base of its first change.
  const [renamed] = await eventsOf(() =>
    editExpense(dinner.id, { title: 'Supper' }),
  );
  const seeded = baseOf(renamed, 'title')!;

  await receive(
    brisbane,
    await theirChange(dinner.id, { base: seeded }),
    await theirChange(dinner.id, {
      stamp: at(T150),
      base: null,
      money: await moneyOf(8000),
    }),
  );

  await showGroup('Brisbane');
  await waitFor(() =>
    expect(linesIn(groupCard('Brisbane', 'Supper'))).toContain('$80.00'),
  );
  await expectToReview('Brisbane', []);

  // Once this phone has changed the amount, a change that had not seen that overrides it.
  await tapTab('Expenses');
  await editExpense(dinner.id, { amount: '120.00' });
  await receive(
    brisbane,
    await theirChange(dinner.id, {
      stamp: at(T180, 0, THIRD),
      base: at(T150),
      money: await moneyOf(7000),
    }),
  );

  await expectToReview('Brisbane', ['Supper']);
  expect(await sidesOf('Brisbane', 'Supper')).toEqual({
    current: sideOf('$70.00', 'Casey', SHARERS),
    yours: YOURS_120,
  });
});

test('[SYNC-129.1] still holds the own change after a restart', async () => {
  const { app, brisbane, dinner } = await withYourChange();

  await restart(app);
  await receive(brisbane, await theirChange(dinner.id));

  await expectToReview('Brisbane', ['Dinner']);
  expect(await sidesOf('Brisbane', 'Dinner')).toEqual({
    current: CURRENT_90,
    yours: YOURS_120,
  });
});

test("[SYNC-129.1] [SYNC-28.3] changes nothing when the phone's own events come back with the overriding one after Keep Current", async () => {
  const { brisbane, theirs } = await overridden();
  await choose(KEEP_CURRENT);
  const written = await unsent();
  const before = await merged();

  await receiveEvents(
    brisbane,
    ...written.map(({ id, content }) =>
      relayed(content, { id, device: PHONE }),
    ),
    theirs,
  );

  expect(await merged()).toEqual(before);
  await expectToReview('Brisbane', []);
});

test('[SYNC-129.1] settles an override when the amount is changed again: an event that had seen the new amount does not mark the expense', async () => {
  const { brisbane, dinner } = await overridden();
  await expectToReview('Brisbane', ['Dinner']);
  await tapTab('Expenses');

  const [change] = await eventsOf(() =>
    editExpense(dinner.id, { amount: '70.00' }),
  );

  expect(change.stamp).toEqual(stamped(1, T120));
  await showGroup('Brisbane');
  await waitFor(() =>
    expect(linesIn(groupCard('Brisbane', 'Dinner'))).toContain('$70.00'),
  );
  await expectToReview('Brisbane', []);

  // phone-c had seen the 70.00. Were the expense still held as overridden, it would need
  // review again as soon as its amount differs from yours.
  await receive(
    brisbane,
    await theirChange(dinner.id, {
      stamp: at(T180, 0, THIRD),
      base: stamped(1, T120),
      money: await moneyOf(8000),
    }),
  );

  await waitFor(() =>
    expect(linesIn(groupCard('Brisbane', 'Dinner'))).toContain('$80.00'),
  );
  await expectToReview('Brisbane', []);
});

// Events that override it

test("[SYNC-130.1] marks an expense whose amount another phone changed without having seen this phone's change", async () => {
  await overridden();

  expect(await expenseTitled('Dinner')).toMatchObject(
    stored(await moneyOf(9000)),
  );
  await expectToReview('Brisbane', ['Dinner']);
  expect(await sidesOf('Brisbane', 'Dinner')).toEqual({
    current: CURRENT_90,
    yours: YOURS_120,
  });
});

test('[SYNC-130.1] marks only that expense: not one whose change the other phone had seen, one it changed earlier, or one it set to the same amount group', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  /** Adds an expense and changes its amount to 120.00; its ID, and the stamps of the two events. */
  async function yours(title: string) {
    const [added] = await eventsOf(() => addDinner(title));
    const { id } = await expenseTitled(title);
    const [change] = await eventsOf(() =>
      editExpense(id, { amount: '120.00' }),
    );
    return { id, added: added.stamp, change: change.stamp };
  }
  const dinner = await yours('Dinner');
  const taxi = await yours('Taxi');
  const hotel = await yours('Hotel');
  const lunch = await yours('Lunch');

  await receive(
    brisbane,
    // Had not seen the 120.00.
    await theirChange(dinner.id, { base: dinner.added }),
    // Had seen it.
    await theirChange(taxi.id, { stamp: at(T120, 1), base: taxi.change }),
    // Stamped before it, and after the event that added Hotel: that event's counter,
    // from phone-b. An earlier stamp would become Hotel's creation stamp, and Hotel
    // would count as recorded by phone-b (SYNC-202.1).
    await theirChange(hotel.id, {
      stamp: at(hotel.added.ms, hotel.added.counter),
      base: null,
    }),
    // The same amount group as yours.
    await theirChange(lunch.id, {
      stamp: at(T120, 2),
      base: lunch.added,
      money: await moneyOf(12000),
    }),
  );

  await expectToReview('Brisbane', ['Dinner']);
  expect(groupCardTitles('Brisbane')).toEqual([
    'Lunch',
    'Hotel',
    'Taxi',
    'Dinner',
  ]);
  expect((await expenseTitled('Taxi')).amountMinor).toBe(9000);
  expect((await expenseTitled('Hotel')).amountMinor).toBe(12000);
  expect((await expenseTitled('Lunch')).amountMinor).toBe(12000);
});

test('[SYNC-130.1] merges concurrent changes of other units without a mark, and marks the expense once its amount group is overridden', async () => {
  const { brisbane, dinner } = await withYourChange();

  await receive(
    brisbane,
    changed(
      'expense',
      dinner.id,
      at(T120),
      { title: 'Supper', note: 'Window seat' },
      { title: stamped(0), note: stamped(0) },
    ),
  );

  await showGroup('Brisbane');
  await waitFor(() => expect(groupCardTitles('Brisbane')).toEqual(['Supper']));
  expect(await expenseTitled('Supper')).toMatchObject({
    note: 'Window seat',
    ...stored(await moneyOf(12000)),
  });
  await expectToReview('Brisbane', []);

  await receive(brisbane, await theirChange(dinner.id, { stamp: at(T150) }));

  await expectToReview('Brisbane', ['Supper']);
});

test('[SYNC-130.1] marks it when the other phone set the same amount with another payer', async () => {
  const { brisbane, dinner } = await withYourChange();

  await receive(
    brisbane,
    await theirChange(dinner.id, {
      money: await moneyOf(12000, { payer: 'Taylor' }),
    }),
  );

  await expectToReview('Brisbane', ['Dinner']);
  expect(await sidesOf('Brisbane', 'Dinner')).toEqual({
    current: sideOf('$120.00', YOU, SHARERS),
    yours: YOURS_120,
  });
});

test.each([
  ['the overriding event last', false],
  ['the overriding event first', true],
])(
  '[SYNC-130.1] marks it whichever order the events arrive in, also when the amount kept is not the overriding one: %s',
  async (_order, overridingFirst) => {
    const { brisbane, dinner } = await withYourChange();
    const eighty = await moneyOf(8000);
    // phone-c had seen the 120.00, and phone-b had not.
    const seen = await theirChange(dinner.id, {
      stamp: at(T180, 0, THIRD),
      base: stamped(1),
      money: eighty,
    });
    const unseen = await theirChange(dinner.id);

    await receive(
      brisbane,
      ...(overridingFirst ? [unseen, seen] : [seen, unseen]),
    );

    expect(await expenseTitled('Dinner')).toMatchObject(stored(eighty));
    await expectToReview('Brisbane', ['Dinner']);
    expect(await sidesOf('Brisbane', 'Dinner')).toEqual({
      current: sideOf('$80.00', 'Casey', SHARERS),
      yours: YOURS_120,
    });
  },
);

test('[SYNC-130.1] does not mark it for an event that is not applied, and does for the next one that is', async () => {
  const { brisbane, dinner } = await withYourChange();
  const wrongSum = { ...(await moneyOf(8000)), amountMinor: 9000 };
  wrongSum.payments = [{ ...wrongSum.payments[0], amountMinor: 9000 }];

  await receive(
    brisbane,
    await theirChange(dinner.id, { base: null, money: wrongSum }),
  );

  expect((await refused()).map((event) => event.reason)).toEqual(['sum']);
  expect((await expenseTitled('Dinner')).amountMinor).toBe(12000);
  await expectToReview('Brisbane', []);

  await receive(brisbane, await theirChange(dinner.id, { stamp: at(T150) }));

  await expectToReview('Brisbane', ['Dinner']);
});

test('[SYNC-130.1] [SYNC-28.3] leaves the local data as it is when the overriding event arrives again', async () => {
  const { brisbane, theirs } = await overridden();
  await expectToReview('Brisbane', ['Dinner']);
  const before = everything();

  await receiveEvents(brisbane, theirs);

  expect(everything()).toEqual(before);
  await expectToReview('Brisbane', ['Dinner']);
});

test('[SYNC-130.1] neither applies the event nor marks the expense when a write fails, whichever it is', async () => {
  const { brisbane, dinner } = await withYourChange();
  const theirs = await theirChange(dinner.id);
  const before = everything();

  let applied = false;
  let writesThrough = 0;
  for (; writesThrough < 200 && !applied; writesThrough += 1) {
    failWritesAfter(writesThrough);
    applied = (await tryReceive(brisbane, theirs)) === undefined;
    if (!applied) expect(everything()).toEqual(before);
  }
  allowWrites();

  expect(applied).toBe(true);
  expect(writesThrough).toBeGreaterThan(1);
  expect((await expenseTitled('Dinner')).amountMinor).toBe(9000);
  await expectToReview('Brisbane', ['Dinner']);
});

test('[SYNC-130.1] still marks it after a restart', async () => {
  const { app } = await overridden();
  await expectToReview('Brisbane', ['Dinner']);

  await restart(app);

  await expectToReview('Brisbane', ['Dinner']);
});

test('[SYNC-130.1] forgets the mark of an expense that an event deletes for good', async () => {
  const { brisbane, dinner } = await overridden();
  await expectToReview('Brisbane', ['Dinner']);

  await receive(brisbane, deleted('expense', dinner.id, at(T180)));

  await waitFor(() => expect(textsOn('Brisbane')).toContain(NO_EXPENSES));
  expect(reviewCount('Brisbane')).toBeUndefined();
});

// Keep Current

test('[SYNC-131.1] writes no event and takes no stamp for Keep Current, and leaves the amount the other phone set', async () => {
  const { dinner } = await overridden();
  await openFromGroup('Brisbane', 'Dinner');

  const events = await eventsOf(() => pressInBlockOn('Groups', KEEP_CURRENT));

  await waitFor(() => expect(detailLinesOn('Groups')).not.toContain(MARK));
  expect(events).toEqual([]);
  await goBackFrom('Expense');
  expect(await expenseTitled('Dinner')).toMatchObject(
    stored(await moneyOf(9000)),
  );
  await expectToReview('Brisbane', []);

  // The next event takes the stamp right after phone-b's: Keep Current took none.
  await tapTab('Expenses');
  const [next] = await eventsOf(() =>
    editExpense(dinner.id, { title: 'Supper' }),
  );
  expect(next.stamp).toEqual(stamped(1, T120));
});

test('[SYNC-131.1] does not mark it again when the same event arrives again, or when another that had not seen the change arrives later', async () => {
  const { brisbane, dinner, theirs } = await overridden();
  await choose(KEEP_CURRENT);

  await receiveEvents(brisbane, theirs);
  await receive(
    brisbane,
    await theirChange(dinner.id, {
      stamp: at(T180, 0, THIRD),
      money: await moneyOf(8000),
    }),
  );

  await showGroup('Brisbane');
  await waitFor(() =>
    expect(linesIn(groupCard('Brisbane', 'Dinner'))).toContain('$80.00'),
  );
  await expectToReview('Brisbane', []);
});

test("[SYNC-131.1] takes the next change of the amount for the phone's own again", async () => {
  const { brisbane, dinner } = await overridden();
  await choose(KEEP_CURRENT);
  await tapTab('Expenses');

  const [change] = await eventsOf(() =>
    editExpense(dinner.id, { amount: '70.00' }),
  );
  // phone-c had seen phone-b's 90.00, and not this 70.00.
  await receive(
    brisbane,
    await theirChange(dinner.id, {
      stamp: at(T180, 0, THIRD),
      base: at(T120),
      money: await moneyOf(8000),
    }),
  );

  expect(change.stamp).toEqual(stamped(1, T120));
  await expectToReview('Brisbane', ['Dinner']);
  expect(await sidesOf('Brisbane', 'Dinner')).toEqual({
    current: sideOf('$80.00', 'Casey', SHARERS),
    yours: sideOf('$70.00', 'Casey', SHARERS),
  });
});

test('[SYNC-131.1] stays settled after a restart', async () => {
  const { app } = await overridden();
  await choose(KEEP_CURRENT);

  await restart(app);

  await showGroup('Brisbane');
  await waitFor(() =>
    expect(linesIn(groupCard('Brisbane', 'Dinner'))).toContain('$90.00'),
  );
  await expectToReview('Brisbane', []);
});

// Use Mine

test('[SYNC-132.1] writes one event for Use Mine that sets the amount group to yours, based on the stamp the group has now', async () => {
  const { dinner } = await overridden();
  const before = await expenseTitled('Dinner');
  await openFromGroup('Brisbane', 'Dinner');

  const events = await eventsOf(() => pressInBlockOn('Groups', USE_MINE));

  const yours = await moneyOf(12000);
  expect(events).toEqual([
    {
      version: 1,
      stamp: stamped(1, T120),
      type: 'expense',
      id: dinner.id,
      units: { money: { value: yours, base: at(T120) } },
    },
  ]);
  await expectUnsentAreValid();
  expect(await expenseTitled('Dinner')).toEqual({
    ...before,
    ...stored(yours),
  });
  await waitFor(() => expect(detailLinesOn('Groups')).not.toContain(MARK));
  await goBackFrom('Expense');
  await expectToReview('Brisbane', []);
  // The phone that wrote the 90.00 was seen: this event does not override its change.
  expect(
    overridesSyncMoney(events[0], {
      id: dinner.id,
      stamp: at(T120),
      money: await moneyOf(9000),
    }),
  ).toBe(false);
});

test('[SYNC-132.1] leaves the other units as they were merged', async () => {
  const { brisbane, dinner } = await overridden();
  await receive(
    brisbane,
    changed(
      'expense',
      dinner.id,
      at(T150),
      { title: 'Supper' },
      { title: stamped(0) },
    ),
  );
  await openFromGroup('Brisbane', 'Supper');

  const events = await eventsOf(() => pressInBlockOn('Groups', USE_MINE));

  const yours = await moneyOf(12000);
  expect(events).toEqual([
    {
      version: 1,
      stamp: stamped(1, T150),
      type: 'expense',
      id: dinner.id,
      units: { money: { value: yours, base: at(T120) } },
    },
  ]);
  expect(await expenseTitled('Supper')).toMatchObject(stored(yours));
});

test('[SYNC-132.1] is not undone when the overriding event arrives again, and is marked again for an event that had not seen it', async () => {
  const { brisbane, dinner, theirs } = await overridden();
  await choose(USE_MINE);

  await receiveEvents(brisbane, theirs);

  expect((await expenseTitled('Dinner')).amountMinor).toBe(12000);
  await showGroup('Brisbane');
  await waitFor(() =>
    expect(linesIn(groupCard('Brisbane', 'Dinner'))).toContain('$120.00'),
  );
  await expectToReview('Brisbane', []);

  // phone-c had seen phone-b's 90.00, and not that it was changed back.
  await receive(
    brisbane,
    await theirChange(dinner.id, {
      stamp: at(T180, 0, THIRD),
      base: at(T120),
      money: await moneyOf(8000),
    }),
  );

  await expectToReview('Brisbane', ['Dinner']);
  expect(await sidesOf('Brisbane', 'Dinner')).toEqual({
    current: sideOf('$80.00', 'Casey', SHARERS),
    yours: YOURS_120,
  });
});

test('[SYNC-132.1] does not mark the expense for an event that had seen what Use Mine wrote', async () => {
  const { brisbane, dinner } = await overridden();
  await choose(USE_MINE);

  // phone-c had seen the event of Use Mine, T+120000/1 of this phone. Were the expense
  // still held as overridden, it would need review again now that its amount differs.
  await receive(
    brisbane,
    await theirChange(dinner.id, {
      stamp: at(T180, 0, THIRD),
      base: stamped(1, T120),
      money: await moneyOf(8000),
    }),
  );

  await showGroup('Brisbane');
  await waitFor(() =>
    expect(linesIn(groupCard('Brisbane', 'Dinner'))).toContain('$80.00'),
  );
  await expectToReview('Brisbane', []);
});

test('[SYNC-132.1] [LEDGER-154.1] writes nothing when a write of Use Mine fails, whichever it is, says so, and writes one event once it works', async () => {
  await overridden();
  await openFromGroup('Brisbane', 'Dinner');
  await expectBlockOn('Groups');
  const before = everything();
  const events = (await unsent()).length;

  let written = 0;
  for (; ; written += 1) {
    if (written > 80) throw new Error('The save never went through');
    const shown = alertsShown().length;
    failWritesAfter(written);
    await pressInBlockOn('Groups', USE_MINE);
    await waitFor(async () =>
      expect(
        (await unsent()).length > events || alertsShown().length > shown,
      ).toBe(true),
    );
    if ((await unsent()).length > events) break;
    expect(alertsShown().at(-1)).toEqual(SAVE_FAILED);
    expect(everything()).toEqual(before);
    expect(detailLinesOn('Groups')).toContain(MARK);
  }
  allowWrites();

  expect(written).toBeGreaterThan(1);
  expect(await unsent()).toHaveLength(events + 1);
  await waitFor(() => expect(detailLinesOn('Groups')).not.toContain(MARK));
  expect((await expenseTitled('Dinner')).amountMinor).toBe(12000);
});

// The mark on cards

test("[LEDGER-151.1] shows the mark under the category on the card of an expense that needs review, on the group's screen and on the expense list, and reads it after the date", async () => {
  await overridden();

  await showGroup('Brisbane');
  const onGroup = ['Dinner', '$90.00', 'Food & Dining', 'Paid by Casey', MARK];
  await waitFor(() =>
    expect(
      shownInOrder(linesIn(groupCard('Brisbane', 'Dinner')), onGroup),
    ).toEqual(onGroup),
  );
  const readOnGroup = [...onGroup.slice(0, 4), 'Oct 30, 2026', MARK];
  expect(
    shownInOrder([readOut(groupCard('Brisbane', 'Dinner'))], readOnGroup),
  ).toEqual(readOnGroup);

  await tapTab('Expenses');
  const onList = ['Dinner', '$30.00', 'Food & Dining', 'Brisbane', MARK];
  await waitFor(() =>
    expect(shownInOrder(linesIn(card('Dinner')), onList)).toEqual(onList),
  );
  const readOnList = [...onList.slice(0, 4), 'Oct 30, 2026', MARK];
  expect(shownInOrder([readOut(card('Dinner'))], readOnList)).toEqual(
    readOnList,
  );
});

test('[LEDGER-151.1] draws the warning icon before the text of the mark, and reads no icon', async () => {
  await overridden();
  await tapTab('Expenses');
  await waitFor(() => expect(linesIn(card('Dinner'))).toContain(MARK));

  expect(iconNames(card('Dinner'), 'ios')).toEqual([MARK_ICON.ios]);
  const [icon] = iconsIn(card('Dinner'), 'ios');
  const [text] = drawnTexts(card('Dinner'), MARK);
  // After the category, and before the words of the mark.
  expect(
    inTreeOrder(
      drawnTexts(card('Dinner'), 'Food & Dining')[0],
      icon.view,
      text,
    ),
  ).toBe(true);
  expect(readOut(card('Dinner'))).not.toContain('exclamationmark');
});

test("[LEDGER-151.1] shows the mark on the cards of a category's expenses, opened from the group's Insights and from your own", async () => {
  const { brisbane } = await overridden();

  await openGroupInsights(brisbane);
  await openCategory('Food & Dining', 'Groups');

  const ofGroup = ['Dinner', '$90.00', 'Food & Dining', 'Paid by Casey', MARK];
  await waitFor(() =>
    expect(
      shownInOrder(
        linesIn(categoryCard('Food & Dining', 'Dinner', 'Groups')),
        ofGroup,
      ),
    ).toEqual(ofGroup),
  );

  await openInsights();
  await openCategory('Food & Dining');

  const ofYours = ['Dinner', '$30.00', 'Food & Dining', 'Brisbane', MARK];
  await waitFor(() =>
    expect(
      shownInOrder(linesIn(categoryCard('Food & Dining', 'Dinner')), ofYours),
    ).toEqual(ofYours),
  );
});

test('[LEDGER-151.1] shows no mark on a card of an expense that does not need review', async () => {
  const { brisbane, dinner } = await overridden();
  await addGroupExpense({
    group: 'Brisbane',
    title: 'Taxi',
    payer: 'Casey',
    sharers: [YOU],
  });

  await expectCards(['Taxi', 'Dinner']);
  await waitFor(() => expect(linesIn(card('Dinner'))).toContain(MARK));
  expect(linesIn(card('Taxi'))).not.toContain(MARK);
  expect(iconNames(card('Taxi'), 'ios')).toEqual([]);

  // Someone who had seen the 90.00 sets the amount group back to exactly yours.
  await receive(
    brisbane,
    await theirChange(dinner.id, {
      stamp: at(T180, 0, THIRD),
      base: at(T120),
      money: await moneyOf(12000),
    }),
  );

  await waitFor(() => expect(linesIn(card('Dinner'))).toContain('$40.00'));
  expect(linesIn(card('Dinner'))).not.toContain(MARK);
  await expectToReview('Brisbane', []);
});

test('[LEDGER-151.1] shows no mark on Trash, and shows it again once the expense is restored', async () => {
  await overridden();
  await tapTab('Expenses');
  await waitFor(() => expect(linesIn(card('Dinner'))).toContain(MARK));

  await deleteByAction('Dinner');
  await openTrash();

  await waitFor(() => expect(linesIn(trashCard('Dinner'))).toContain('Dinner'));
  expect(linesIn(trashCard('Dinner'))).not.toContain(MARK);

  await restoreFromTrash('Dinner');
  await tapTab('Expenses');

  await waitFor(() => expect(linesIn(card('Dinner'))).toContain(MARK));
});

test('[LEDGER-151.1] still shows the mark after a restart', async () => {
  const { app } = await overridden();

  await restart(app);

  await waitFor(() => expect(linesIn(card('Dinner'))).toContain(MARK));
  await expectToReview('Brisbane', ['Dinner']);
});

// The mark's block on the details

test('[LEDGER-152.1] lists the current amount group and yours above the title of the details, with Keep Current and Use Mine', async () => {
  await overridden();
  await tapTab('Expenses');
  await waitFor(() => expect(linesIn(card('Dinner'))).toContain(MARK));

  await openDetails('Dinner');

  const block = [
    MARK,
    MARK_TEXT,
    'CURRENT',
    ...CURRENT_90,
    'YOURS',
    ...YOURS_120,
    KEEP_CURRENT,
    USE_MINE,
  ];
  await waitFor(() => expect(blockOf(detailLines(), 'Dinner')).toEqual(block));
  // Under it, the details as they are without it.
  const under = ['Dinner', '$90.00', 'Oct 30, 2026', 'Food & Dining'];
  expect(shownInOrder(detailLines().slice(block.length), under)).toEqual(under);
  expect(iconNames(screenOf('Expense'), 'ios')).toContain(MARK_ICON.ios);
  for (const name of [KEEP_CURRENT, USE_MINE]) {
    const button = blockButtonOn('Expenses', name);
    expect(button).toBeDefined();
    expect(isDisabled(button!)).toBe(false);
  }
});

test('[LEDGER-152.1] names who paid and who shares each amount group when the amounts are the same', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  await addDinner();
  const dinner = await expenseTitled('Dinner');
  await openEditExpense(dinner.id);
  await choosePayer(YOU);
  await press('Save');
  await expectFormClosed();

  await receive(
    brisbane,
    await theirChange(dinner.id, {
      money: await moneyOf(10001, { sharers: ['Blake', 'Casey'] }),
    }),
  );

  expect(await sidesOf('Brisbane', 'Dinner')).toEqual({
    current: sideOf('$100.01', 'Casey', ['Blake', 'Casey']),
    yours: sideOf('$100.01', YOU, SHARERS),
  });
});

test('[LEDGER-152.1] shows each amount in the currency of its own amount group', async () => {
  const { brisbane, dinner } = await withYourChange();

  await receive(
    brisbane,
    await theirChange(dinner.id, {
      money: await moneyOf(9000, { currency: 'JPY' }),
    }),
  );

  expect(await sidesOf('Brisbane', 'Dinner')).toEqual({
    current: sideOf('¥9,000', 'Casey', SHARERS),
    yours: YOURS_120,
  });
});

test('[LEDGER-152.1] names each person as they are called now: a renamed member by the new name, a former member by the stored one', async () => {
  await overridden();

  await renameInGroup('Brisbane', 'Casey', 'Cass');
  await removeFromGroup('Brisbane', 'Blake');

  const renamed = ['Blake', YOU, 'Cass'];
  expect(await sidesOf('Brisbane', 'Dinner')).toEqual({
    current: sideOf('$90.00', 'Cass', renamed),
    yours: sideOf('$120.00', 'Cass', renamed),
  });
});

test('[LEDGER-152.1] shows the block on details that are open when the expense is overridden', async () => {
  const { brisbane, dinner } = await withYourChange();
  await openDetails('Dinner');
  expect(detailLines()).not.toContain(MARK);

  await receive(brisbane, await theirChange(dinner.id));

  await expectBlockOn('Expenses');
  expect(sidesIn(detailLines())).toEqual({
    current: CURRENT_90,
    yours: YOURS_120,
  });
  expect(detailLines()).toContain('$90.00');
});

test('[LEDGER-152.1] shows no block on the details of an expense that does not need review, nor on the read-only details in Trash', async () => {
  await overridden();
  await addGroupExpense({
    group: 'Brisbane',
    title: 'Taxi',
    payer: 'Casey',
    sharers: [YOU],
  });
  await expectCards(['Taxi', 'Dinner']);
  await waitFor(() => expect(linesIn(card('Dinner'))).toContain(MARK));

  await openDetails('Taxi');

  expect(detailLines()[0]).toBe('Taxi');
  expect(detailLines()).not.toContain(MARK);
  expect(blockButtonOn('Expenses', KEEP_CURRENT) === undefined).toBe(true);

  await goBackFrom('Expense');
  await deleteByAction('Dinner');
  await openTrash();
  await openTrashed('Dinner');

  expect(expenseLines('Settings')[0]).toBe(IN_TRASH);
  expect(expenseLines('Settings')).not.toContain(MARK);
  expect(expenseLines('Settings')).not.toContain(KEEP_CURRENT);
  expect(expenseLines('Settings')).not.toContain(USE_MINE);
});

// The two buttons

test('[LEDGER-153.1] takes the mark off the details and every card when Keep Current is pressed, and leaves the expense as it is', async () => {
  await overridden();
  await tapTab('Expenses');
  await waitFor(() => expect(linesIn(card('Dinner'))).toContain(MARK));
  await openDetails('Dinner');

  await pressInBlockOn('Expenses', KEEP_CURRENT);

  await waitFor(() => expect(detailLines()).not.toContain(MARK));
  expect(detailBarsOn('Expenses')).toHaveLength(1);
  const shown = ['Dinner', '$90.00'];
  expect(detailLines().slice(0, 2)).toEqual(shown);
  expect(blockButtonOn('Expenses', USE_MINE) === undefined).toBe(true);

  await goBackFrom('Expense');

  const onList = ['Dinner', '$30.00', 'Food & Dining', 'Brisbane'];
  expect(shownInOrder(linesIn(card('Dinner')), onList)).toEqual(onList);
  expect(linesIn(card('Dinner'))).not.toContain(MARK);
  await expectToReview('Brisbane', []);
  expect(linesIn(groupCard('Brisbane', 'Dinner'))).toContain('$90.00');
});

test('[LEDGER-153.1] shows no mark after Keep Current and a restart', async () => {
  const { app } = await overridden();
  await choose(KEEP_CURRENT);

  await restart(app);

  await expectCards(['Dinner']);
  expect(linesIn(card('Dinner'))).not.toContain(MARK);
  await openDetails('Dinner');
  expect(detailLines()[0]).toBe('Dinner');
});

test('[LEDGER-153.1] says so when Keep Current cannot be saved, keeps the mark, and takes it off once the save works', async () => {
  await overridden();
  await tapTab('Expenses');
  await waitFor(() => expect(linesIn(card('Dinner'))).toContain(MARK));
  await openDetails('Dinner');
  await expectBlockOn('Expenses');
  const before = everything();
  const shown = alertsShown().length;
  failWrites();

  await pressInBlockOn('Expenses', KEEP_CURRENT);

  await waitFor(() => expect(alertsShown()).toHaveLength(shown + 1));
  expect(alertsShown().at(-1)).toEqual(SAVE_FAILED);
  expect(everything()).toEqual(before);
  await expectBlockOn('Expenses');
  for (const name of [KEEP_CURRENT, USE_MINE])
    expect(isDisabled(blockButtonOn('Expenses', name)!)).toBe(false);

  allowWrites();
  await pressInBlockOn('Expenses', KEEP_CURRENT);

  await waitFor(() => expect(detailLines()).not.toContain(MARK));
  expect(alertsShown()).toHaveLength(shown + 1);
});

test('[LEDGER-153.1] [LEDGER-154.1] offers Keep Current alone in an archived group: Use Mine is disabled and saves nothing', async () => {
  const { dinner } = await overridden();
  await archiveGroup('Brisbane');
  await tapTab('Expenses');
  await waitFor(() => expect(linesIn(card('Dinner'))).toContain(MARK));
  await openDetails('Dinner');
  await expectBlockOn('Expenses');
  const events = (await unsent()).length;

  expect(isDisabled(blockButtonOn('Expenses', USE_MINE)!)).toBe(true);
  expect(isDisabled(blockButtonOn('Expenses', KEEP_CURRENT)!)).toBe(false);
  await pressInBlockOn('Expenses', USE_MINE);

  expect(await unsent()).toHaveLength(events);
  expect((await expenseTitled('Dinner')).amountMinor).toBe(9000);
  await expectBlockOn('Expenses');

  // Restoring the group gives Use Mine back.
  await goBackFrom('Expense');
  await restoreGroup('Brisbane');
  await tapTab('Expenses');
  await openDetails('Dinner');
  await expectBlockOn('Expenses');
  expect(isDisabled(blockButtonOn('Expenses', USE_MINE)!)).toBe(false);

  // Archived again, Keep Current still settles it.
  await goBackFrom('Expense');
  await archiveGroup('Brisbane');
  await tapTab('Expenses');
  await openDetails('Dinner');
  await pressInBlockOn('Expenses', KEEP_CURRENT);

  await waitFor(() => expect(detailLines()).not.toContain(MARK));
  expect((await expenseTitled('Dinner')).id).toBe(dinner.id);
  expect((await expenseTitled('Dinner')).amountMinor).toBe(9000);
});

test('[LEDGER-154.1] shows your amount group everywhere once Use Mine is pressed, and no mark', async () => {
  await overridden();
  await openFromGroup('Brisbane', 'Dinner');

  await pressInBlockOn('Groups', USE_MINE);

  await waitFor(() => expect(detailLinesOn('Groups')).not.toContain(MARK));
  expect(detailBarsOn('Groups')).toHaveLength(1);
  const details = [
    'Dinner',
    '$120.00',
    'Your share',
    '$40.00',
    'PAID BY',
    'Casey',
    '$120.00',
    'SPLIT',
    'Blake',
    '$40.00',
    YOU,
    '$40.00',
    'Casey',
    '$40.00',
  ];
  expect(shownInOrder(detailLinesOn('Groups'), details)).toEqual(details);
  expect(detailLinesOn('Groups')[0]).toBe('Dinner');

  await goBackFrom('Expense');

  await expectToReview('Brisbane', []);
  expect(linesIn(groupCard('Brisbane', 'Dinner'))).toContain('$120.00');
  expect(groupTotals('Brisbane')).toEqual(['Group Total: $120.00']);
  await tapTab('Expenses');
  expect(linesIn(card('Dinner'))).toContain('$40.00');
  expect(linesIn(card('Dinner'))).not.toContain(MARK);
});

test('[LEDGER-154.1] saves once when Use Mine is pressed twice before the save has finished', async () => {
  await overridden();
  await openFromGroup('Brisbane', 'Dinner');
  await expectBlockOn('Groups');
  const events = (await unsent()).length;
  const alerts = alertsShown().length;
  const button = blockButtonOn('Groups', USE_MINE)!;
  const writes = holdWrites();

  await fireEvent.press(button);
  await fireEvent.press(button);
  await writes.release();
  await settle();

  await waitFor(() => expect(detailLinesOn('Groups')).not.toContain(MARK));
  expect(await unsent()).toHaveLength(events + 1);
  // The second press did nothing: it did not try a save that then failed, either.
  expect(alertsShown()).toHaveLength(alerts);
});

test('[LEDGER-153.1] does not save Use Mine when it is pressed before Keep Current has been saved', async () => {
  await overridden();
  await openFromGroup('Brisbane', 'Dinner');
  await expectBlockOn('Groups');
  const events = (await unsent()).length;
  const alerts = alertsShown().length;
  const keep = blockButtonOn('Groups', KEEP_CURRENT)!;
  const mine = blockButtonOn('Groups', USE_MINE)!;
  const writes = holdWrites();

  await fireEvent.press(keep);
  await fireEvent.press(mine);
  await writes.release();
  await settle();

  await waitFor(() => expect(detailLinesOn('Groups')).not.toContain(MARK));
  expect(await unsent()).toHaveLength(events);
  expect((await expenseTitled('Dinner')).amountMinor).toBe(9000);
  // Use Mine did nothing: it did not try a save that then failed, either.
  expect(alertsShown()).toHaveLength(alerts);
});

test('[LEDGER-154.1] counts Use Mine as the last change of the expense', async () => {
  await overridden();
  setClock(T180);
  await addGroupExpense({
    group: 'Brisbane',
    title: 'Taxi',
    payer: 'Casey',
    sharers: [YOU],
  });
  await showGroup('Brisbane');
  await chooseSort(screenOf('Brisbane'), 'Recently Edited');
  await waitFor(() =>
    expect(groupCardTitles('Brisbane')).toEqual(['Taxi', 'Dinner']),
  );

  setClock(T180 + MINUTE);
  await choose(USE_MINE);

  await waitFor(() =>
    expect(groupCardTitles('Brisbane')).toEqual(['Dinner', 'Taxi']),
  );
});

test('[LEDGER-154.1] saves your amount group though one of its sharers has left the group since', async () => {
  await overridden();
  await removeFromGroup('Brisbane', 'Blake');

  await choose(USE_MINE);

  expect(await expenseTitled('Dinner')).toMatchObject(
    stored(await moneyOf(12000)),
  );
  await openFromGroup('Brisbane', 'Dinner');
  const split = ['SPLIT', 'Blake', '$40.00', YOU, '$40.00', 'Casey', '$40.00'];
  expect(shownInOrder(detailLinesOn('Groups'), split)).toEqual(split);
});

// The number of expenses to review on a group's screen

test("[GROUPS-107.2] counts the expenses to review in a button under the group's title, with the mark's icon and a chevron", async () => {
  await overridden();

  await showGroup('Brisbane');

  await waitFor(() => expect(reviewCount('Brisbane')).toBe(needsReview(1)));
  const button = reviewButton('Brisbane')!;
  expect(button.props.accessibilityHint).toBe(REVIEW_HINT);
  expect(iconNames(button, 'ios')).toEqual([MARK_ICON.ios]);
  const shown = [needsReview(1), '›'];
  expect(shownInOrder(linesIn(button), shown)).toEqual(shown);
  // Right under the large title, above the period row, the total and the cards.
  const texts = textsOn('Brisbane');
  expect(texts[0]).toBe(needsReview(1));
  expect(texts.indexOf('$90.00')).toBeGreaterThan(0);
  const [period] = drawnTexts(screenOf('Brisbane'), 'Group Total');
  expect(
    inTreeOrder(
      largeTitle('Brisbane')!,
      button,
      period,
      groupCard('Brisbane', 'Dinner'),
    ),
  ).toBe(true);
});

test('[GROUPS-107.2] counts every expense to review, and opens the first in the order of dates whatever the order of the screen', async () => {
  const { app, brisbane, dinner } = await overridden();
  await addDinner('Taxi', '2026-10-29');
  const taxi = await expenseTitled('Taxi');
  const [added] = (await unsent()).slice(-1);
  await editExpense(taxi.id, { amount: '120.00' });
  await receive(
    brisbane,
    await theirChange(taxi.id, {
      stamp: at(T150),
      base: added.content.stamp,
    }),
  );

  await expectToReview('Brisbane', ['Dinner', 'Taxi']);
  await chooseSort(screenOf('Brisbane'), 'Oldest First');
  await waitFor(() =>
    expect(groupCardTitles('Brisbane')).toEqual(['Taxi', 'Dinner']),
  );

  await fireEvent.press(reviewButton('Brisbane')!);

  await expectDetailsOn('Groups', 'Dinner');
  expect(selectedTab()).toBe('Groups');
  expect(navigationBarTitles(tab('Groups'))).toEqual([
    'Groups',
    'Brisbane',
    'Expense',
  ]);
  expect(app.getPathname()).toBe(`/groups/expenses/${dinner.id}`);
  await expectBlockOn('Groups');
});

test('[GROUPS-107.2] pushes one details when the button is pressed twice', async () => {
  await overridden();
  await expectToReview('Brisbane', ['Dinner']);
  const button = reviewButton('Brisbane')!;

  await fireEvent.press(button);
  await fireEvent.press(button);
  await settle();

  await expectDetailsOn('Groups', 'Dinner');
  await goBackFrom('Expense');
  await waitFor(() =>
    expect(navigationBarTitles(tab('Groups'))).toEqual(['Groups', 'Brisbane']),
  );
});

test('[GROUPS-107.2] counts one fewer after each expense is settled, opens the next one, and goes once none is left', async () => {
  const { brisbane } = await overridden();
  await addDinner('Taxi', '2026-10-29');
  const taxi = await expenseTitled('Taxi');
  const [added] = (await unsent()).slice(-1);
  await editExpense(taxi.id, { amount: '120.00' });
  await receive(
    brisbane,
    await theirChange(taxi.id, {
      stamp: at(T150),
      base: added.content.stamp,
    }),
  );
  await expectToReview('Brisbane', ['Dinner', 'Taxi']);

  await choose(KEEP_CURRENT, 'Dinner');

  await expectToReview('Brisbane', ['Taxi']);
  await fireEvent.press(reviewButton('Brisbane')!);
  await expectDetailsOn('Groups', 'Taxi');

  await pressInBlockOn('Groups', USE_MINE);
  await waitFor(() => expect(detailLinesOn('Groups')).not.toContain(MARK));
  await goBackFrom('Expense');

  await expectToReview('Brisbane', []);
});

test('[GROUPS-107.2] counts an expense the screen does not list: outside its period, kept out by its filter, or not matching its search', async () => {
  const app = await startShared();
  const brisbane = await groupId('Brisbane');
  await addDinner('Hotel', '2026-09-15');
  const hotel = await expenseTitled('Hotel');
  await editExpense(hotel.id, { amount: '120.00' });
  await receive(brisbane, await theirChange(hotel.id));
  await addDinner('Taxi');
  await expectToReview('Brisbane', ['Hotel']);

  await choosePeriod('Brisbane', 'This Month');

  await waitFor(() => expect(groupCardTitles('Brisbane')).toEqual(['Taxi']));
  expect(reviewCount('Brisbane')).toBe(needsReview(1));

  await choosePeriod('Brisbane', 'All Time');
  await setAmounts('Brisbane', '95');

  await waitFor(() => expect(groupCardTitles('Brisbane')).toEqual(['Taxi']));
  expect(reviewCount('Brisbane')).toBe(needsReview(1));

  await typeSearch('Brisbane', 'taxi');

  await waitFor(() => expect(groupCardTitles('Brisbane')).toEqual(['Taxi']));
  expect(reviewCount('Brisbane')).toBe(needsReview(1));

  await fireEvent.press(reviewButton('Brisbane')!);

  await expectDetailsOn('Groups', 'Hotel');
  expect(app.getPathname()).toBe(`/groups/expenses/${hotel.id}`);
});

test('[GROUPS-107.2] does not count an expense in the trash, and counts it again once it is back', async () => {
  await overridden();
  await expectToReview('Brisbane', ['Dinner']);
  await tapTab('Expenses');

  await deleteByAction('Dinner');

  await showGroup('Brisbane');
  await waitFor(() => expect(textsOn('Brisbane')).toContain(NO_EXPENSES));
  expect(reviewCount('Brisbane')).toBeUndefined();

  await pressUndo('Dinner');

  await expectToReview('Brisbane', ['Dinner']);
});

test('[GROUPS-107.2] shows the button above the read-only line of an archived shared ledger, and opens the details on the Settings tab', async () => {
  const { app, dinner } = await overridden();
  await archiveGroup('Brisbane');

  await openArchivedGroups();
  await openArchivedGroup('Brisbane');

  await waitFor(() =>
    expect(
      textsOn('Brisbane')
        .filter((text) => text !== '›')
        .slice(0, 3),
    ).toEqual([needsReview(1), READ_ONLY, 'Restore Group']),
  );

  await fireEvent.press(reviewButton('Brisbane')!);

  await expectDetailsOn('Settings', 'Dinner');
  expect(selectedTab()).toBe('Settings');
  expect(app.getPathname()).toBe(
    `/settings/archived-groups/expenses/${dinner.id}`,
  );
  await expectBlockOn('Settings');
});

test('[GROUPS-107.2] shows no button on a group with nothing to review, and counts each group by itself', async () => {
  await startShared({ ...BRISBANE, Tokyo: ['Dana'] });
  const brisbane = await groupId('Brisbane');
  await addDinner();
  const dinner = await expenseTitled('Dinner');
  await addGroupExpense({
    group: 'Tokyo',
    title: 'Sushi',
    payer: 'Dana',
    sharers: [YOU],
  });
  await editExpense(dinner.id, { amount: '120.00' });

  await showGroup('Brisbane');
  await waitFor(() => expect(groupCardTitles('Brisbane')).toEqual(['Dinner']));
  expect(reviewCount('Brisbane')).toBeUndefined();

  await receive(brisbane, await theirChange(dinner.id));

  await expectToReview('Brisbane', ['Dinner']);
  await goBackFrom('Brisbane');
  await showGroup('Tokyo');
  await waitFor(() => expect(groupCardTitles('Tokyo')).toEqual(['Sushi']));
  expect(reviewCount('Tokyo')).toBeUndefined();
});

test('[GROUPS-107.2] still counts it after a restart', async () => {
  const { app } = await overridden();

  await restart(app);

  await expectToReview('Brisbane', ['Dinner']);
});
