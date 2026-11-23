import { fireEvent, waitFor } from '@testing-library/react-native';
import {
  SAVE_FAILED,
  addExpense,
  editExpense,
  inTreeOrder,
  restart,
} from './ledger-expense-app';
import {
  card,
  cardTitles,
  detailLines,
  drawnTexts,
  linesIn,
  openDetails,
  readOut,
  shownInOrder,
} from './ledger-expense-list-app';
import {
  addGroupExpense,
  archiveGroup,
  detailBarsOn,
  detailLinesOn,
  editOn,
  expectDetailsOn,
  groupCard,
  groupCardTitles,
  isDisabled,
  renameInGroup,
  restoreGroup,
  startWithGroups,
} from './ledger-group-expense-app';
import {
  IN_TRASH,
  chooseExpenseAction,
  deleteByAction,
  expectTrash,
  expenseLines,
  hasExpenseActions,
  noticeShown,
  openTrash,
  openTrashed,
  pressUndo,
  restoreFromTrash,
  trashCard,
} from './ledger-trash-app';
import { openArchivedGroup, openArchivedGroups } from './group-archive-app';
import { showGroup } from './group-balances-app';
import { alertsShown, goBackFrom, screenOf } from './group-details-app';
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
  YOU,
  at,
  changed,
  deleted,
  eachTestGetsAPhone,
  eventsOf,
  everything,
  expectUnsentAreValid,
  expenseTitled,
  groupId,
  receive,
  receiveEvents,
  refused,
  relayed,
  setClock,
  share,
  stamped,
  startShared,
  unsent,
} from './sync-app';
import {
  KEEP_CURRENT,
  MARK,
  MARK_ICON,
  USE_MINE,
  addDinner,
  blockButtonOn,
  expectBlockOn,
  expectToReview,
  moneyOf,
  needsReview,
  openFromGroup,
  pressInBlockOn,
  reviewButton,
  reviewCount,
} from './sync-conflict-app';
import {
  DELETE_THIS,
  DUPLICATE,
  NOT_A_DUPLICATE,
  OTHER_EXPENSE,
  T120,
  T150,
  T180,
  T30,
  VIEW_OTHER,
  alikeCreated,
  distinctCreated,
  duplicateBlock,
  duplicatesOn,
  expectDetailsStackedOn,
  expectDuplicateBlockOn,
  expectDuplicates,
  expectNoDuplicateBlockOn,
  goBackFromDetailsOn,
  otherOn,
} from './sync-duplicate-app';

// Runs on iOS. Each test starts the app as the other sync tests do (sync-app): Taylor is
// your name, Brisbane's members are Taylor, Casey and Blake, Brisbane becomes a shared
// ledger at 2026-10-30T04:00:00Z with phone-a as this phone's device ID, and the clock
// stands a minute later, so this phone's events are stamped LATER/0, LATER/1 and so on.
// The tests add Dinner through its form (100.01 USD on 2026-10-30), and hand the app the
// first event of Supper, an expense of the same date, amount and currency that phone-b
// added, as its sync will (applySyncEvents).

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

eachTestGetsAPhone('sync-duplicate-');

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
/** A third phone. */
const THIRD = 'phone-c';

/** How the block names who shares Dinner, and who shares Supper. */
const DINNER_SHARERS = ['Blake', YOU, 'Casey'];
const SUPPER_SHARERS = ['Blake', YOU];

type Alike = NonNullable<Parameters<typeof alikeCreated>[0]>;

/** Brisbane is a shared ledger with Dinner, which this phone added at LATER/0. */
async function withDinner() {
  const app = await startShared();
  const brisbane = await groupId('Brisbane');
  await addDinner();
  const dinner = await expenseTitled('Dinner');
  return { app, brisbane, dinner };
}

/**
 * As withDinner, and phone-b's Supper has arrived since, stamped T+120000 unless `alike`
 * says otherwise: Supper is a possible duplicate, and Dinner is the expense it is
 * compared with.
 */
async function withSupper(alike: Alike = {}) {
  const setup = await withDinner();
  const created = await alikeCreated(alike);
  await receive(setup.brisbane, created);
  const supper = await expenseTitled(alike.title ?? 'Supper');
  return { ...setup, supper, created };
}

/** As withSupper, with Supper stamped T+30000, before Dinner: Dinner is the possible duplicate. */
const withEarlierSupper = () => withSupper({ stamp: at(T30) });

/**
 * Dinner both needs review and is a possible duplicate: you changed its amount to 120.00,
 * phone-b's Supper of 90.00, stamped before Dinner, arrived, and then phone-b's change of
 * Dinner to 90.00, written without having seen yours.
 */
async function withBothMarks() {
  const setup = await withDinner();
  await editExpense(setup.dinner.id, { amount: '120.00' });
  await receive(
    setup.brisbane,
    await alikeCreated({ stamp: at(T30), amountMinor: 9000 }),
  );
  await receive(
    setup.brisbane,
    changed(
      'expense',
      setup.dinner.id,
      at(T120),
      { money: await moneyOf(9000) },
      { money: stamped(0) },
    ),
  );
  return setup;
}

/** Opens the details of the expense titled `title` from Brisbane's screen and waits for the block. */
async function openDuplicate(title = 'Supper') {
  await openFromGroup('Brisbane', title);
  await expectDuplicateBlockOn('Groups');
}

/** Presses Not a Duplicate on the details of the expense titled `title`, opened from Brisbane's screen, and goes back. */
async function sayNotADuplicate(title = 'Supper') {
  await openDuplicate(title);
  await pressInBlockOn('Groups', NOT_A_DUPLICATE);
  await goBackFrom('Expense');
}

const isTrashed = async (title: string) =>
  (await expenseTitled(title)).trashOrder !== undefined;

// Which expenses are possible duplicates

test('[SYNC-202.1] marks an alike expense another phone added after yours, and not your own', async () => {
  await withSupper();

  await expectDuplicates('Brisbane', ['Supper']);
  expect(linesIn(groupCard('Brisbane', 'Dinner'))).not.toContain(DUPLICATE);
});

test('[SYNC-202.1] marks your own expense when the alike one another phone added was recorded before it', async () => {
  await withEarlierSupper();

  await expectDuplicates('Brisbane', ['Dinner']);
  expect(linesIn(groupCard('Brisbane', 'Supper'))).not.toContain(DUPLICATE);
});

test('[SYNC-202.1] marks an expense you add that is alike to one another phone had added, as soon as it is saved', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  await receive(brisbane, await alikeCreated({ stamp: at(T30) }));
  await showGroup('Brisbane');
  await waitFor(() => expect(groupCardTitles('Brisbane')).toEqual(['Supper']));
  expect(reviewCount('Brisbane')).toBeUndefined();

  await addDinner();

  await expectDuplicates('Brisbane', ['Dinner']);
});

test.each<[string, Alike]>([
  ['another amount', { amountMinor: 10000 }],
  ['another currency', { currency: 'JPY' }],
  ['another date', { date: '2026-10-29' }],
])(
  '[SYNC-202.1] does not mark an expense with %s, though it marks one that is alike',
  async (_case, difference) => {
    const { brisbane } = await withDinner();

    await receive(
      brisbane,
      await alikeCreated({ title: 'Lunch', ...difference }),
      await alikeCreated({ stamp: at(T150) }),
    );

    await showGroup('Brisbane');
    await waitFor(() => expect(groupCardTitles('Brisbane')).toContain('Lunch'));
    await expectDuplicates('Brisbane', ['Supper']);
  },
);

test('[SYNC-202.1] does not pair two alike expenses that other phones recorded, and pairs each with the one you then add', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  await receive(
    brisbane,
    await alikeCreated(),
    await alikeCreated({ title: 'Snack', stamp: at(T150, 0, THIRD) }),
  );
  await showGroup('Brisbane');
  await waitFor(() => expect(groupCardTitles('Brisbane')).toHaveLength(2));
  expect(duplicatesOn('Brisbane')).toEqual([]);
  expect(reviewCount('Brisbane')).toBeUndefined();

  await addDinner();

  await expectDuplicates('Brisbane', ['Dinner']);
});

test('[SYNC-202.1] does not pair two alike expenses you added yourself', async () => {
  const { brisbane } = await withDinner();
  await addDinner('Brunch');

  await receive(brisbane, await alikeCreated());

  await showGroup('Brisbane');
  await waitFor(() => expect(groupCardTitles('Brisbane')).toHaveLength(3));
  await expectDuplicates('Brisbane', ['Supper']);
});

test('[SYNC-202.1] counts an expense that was there when the group became a shared ledger as recorded by this phone', async () => {
  await startWithGroups(BRISBANE);
  await addDinner();
  await addDinner('Brunch');
  const brisbane = await share('Brisbane');
  setClock(LATER);

  await showGroup('Brisbane');
  await waitFor(() => expect(groupCardTitles('Brisbane')).toHaveLength(2));
  expect(duplicatesOn('Brisbane')).toEqual([]);
  await receive(brisbane, await alikeCreated());

  // Dinner and Brunch are no pair of each other; Supper is one with each of them.
  await expectDuplicates('Brisbane', ['Supper']);
});

test('[SYNC-202.1] takes the mark off when you change the amount or the date of one of the two, and puts it back when they are alike again', async () => {
  const { dinner } = await withSupper();
  await expectDuplicates('Brisbane', ['Supper']);

  await editExpense(dinner.id, { amount: '120.00' });
  await expectDuplicates('Brisbane', []);

  await editExpense(dinner.id, { amount: '100.01' });
  await expectDuplicates('Brisbane', ['Supper']);

  await editExpense(dinner.id, { date: '2026-10-29' });
  await expectDuplicates('Brisbane', []);
});

test("[SYNC-202.1] follows the events it applies: another phone's change makes two expenses alike, and a later one makes them differ", async () => {
  const { brisbane, dinner, supper } = await withSupper({ amountMinor: 9000 });
  await showGroup('Brisbane');
  await waitFor(() => expect(groupCardTitles('Brisbane')).toHaveLength(2));
  expect(duplicatesOn('Brisbane')).toEqual([]);

  // phone-b had seen Dinner as you added it, so this needs no review of its own.
  await receive(
    brisbane,
    changed(
      'expense',
      dinner.id,
      at(T150),
      { money: await moneyOf(9000) },
      { money: stamped(0) },
    ),
  );

  await expectDuplicates('Brisbane', ['Supper']);

  await receive(
    brisbane,
    changed(
      'expense',
      supper.id,
      at(T180),
      { date: '2026-10-29' },
      { date: at(T120) },
    ),
  );

  await expectDuplicates('Brisbane', []);
});

test('[SYNC-202.1] leaves no pair while one of the two is in the trash, and pairs them again once it is back', async () => {
  await withSupper();
  await expectDuplicates('Brisbane', ['Supper']);
  await tapTab('Expenses');

  await deleteByAction('Dinner');
  await expectDuplicates('Brisbane', []);
  await pressUndo('Dinner');
  await expectDuplicates('Brisbane', ['Supper']);

  await tapTab('Expenses');
  await deleteByAction('Supper');
  await expectDuplicates('Brisbane', []);
  await openTrash();
  await restoreFromTrash('Supper');
  await expectDuplicates('Brisbane', ['Supper']);
});

test.each<[string, 'trash' | 'supper' | 'dinner']>([
  ['moves the later one to the trash', 'trash'],
  ['deletes the later one for good', 'supper'],
  ['deletes the earlier one for good', 'dinner'],
])('[SYNC-202.1] leaves no pair once another phone %s', async (_case, what) => {
  const { brisbane, dinner, supper } = await withSupper();
  await expectDuplicates('Brisbane', ['Supper']);

  await receive(
    brisbane,
    what === 'trash'
      ? changed(
          'expense',
          supper.id,
          at(T180),
          { trashed: true },
          { trashed: at(T120) },
        )
      : deleted('expense', what === 'supper' ? supper.id : dinner.id, at(T180)),
  );

  await expectDuplicates('Brisbane', []);
  expect(groupCardTitles('Brisbane')).toEqual([
    what === 'dinner' ? 'Supper' : 'Dinner',
  ]);
});

test('[SYNC-202.1] [LEDGER-157.1] of three alike expenses from three phones, marks the two that others added, each compared with yours', async () => {
  const { brisbane } = await withSupper();
  await receive(
    brisbane,
    await alikeCreated({ title: 'Snack', stamp: at(T150, 0, THIRD) }),
  );

  await showGroup('Brisbane');
  await waitFor(() =>
    expect([...duplicatesOn('Brisbane')].sort()).toEqual(['Snack', 'Supper']),
  );
  expect(reviewCount('Brisbane')).toBe(needsReview(2));

  // Snack is alike to Supper too, but this phone recorded neither of those two.
  await openDuplicate('Snack');
  expect(otherOn('Groups')?.[0]).toBe('Dinner');
});

test('[SYNC-202.1] pairs no expense of a shared ledger with an expense of another ledger or with a personal expense', async () => {
  await startShared({ ...BRISBANE, Tokyo: ['Dana'] });
  const brisbane = await groupId('Brisbane');
  await share('Tokyo');
  await addGroupExpense({
    group: 'Tokyo',
    title: 'Sushi',
    payer: 'Dana',
    sharers: [YOU],
  });
  await addExpense({ amount: '100.01', title: 'Solo' });

  await receive(brisbane, await alikeCreated());

  await showGroup('Brisbane');
  await waitFor(() => expect(groupCardTitles('Brisbane')).toEqual(['Supper']));
  expect(duplicatesOn('Brisbane')).toEqual([]);
  expect(reviewCount('Brisbane')).toBeUndefined();

  // An alike expense you then add to Brisbane is one, and Tokyo still shows none.
  await addDinner();
  await expectDuplicates('Brisbane', ['Dinner']);
  await goBackFrom('Brisbane');
  await showGroup('Tokyo');
  await waitFor(() => expect(groupCardTitles('Tokyo')).toEqual(['Sushi']));
  expect(reviewCount('Tokyo')).toBeUndefined();
  await tapTab('Expenses');
  expect(linesIn(card('Solo'))).not.toContain(DUPLICATE);
});

test('[SYNC-202.1] changes nothing when the same events arrive again, its own among them', async () => {
  const { brisbane, created } = await withSupper();
  await expectDuplicates('Brisbane', ['Supper']);
  const before = everything();
  const own = await unsent();

  await receiveEvents(
    brisbane,
    relayed(created),
    ...own.map((event) => relayed(event.content, { id: event.id })),
  );

  expect(everything()).toEqual(before);
  await expectDuplicates('Brisbane', ['Supper']);
});

test('[SYNC-202.1] [LEDGER-156.1] still marks it after a restart, on the expense list and on the group', async () => {
  const { app } = await withSupper();

  await restart(app);

  await waitFor(() => expect(linesIn(card('Supper'))).toContain(DUPLICATE));
  await expectDuplicates('Brisbane', ['Supper']);
  await openDuplicate();
  expect(otherOn('Groups')?.[0]).toBe('Dinner');
});

// Not a Duplicate: the event it writes

test('[SYNC-203.1] writes the first event of a "not a duplicate" record that names the other expense and this one', async () => {
  const { dinner, supper } = await withSupper();
  await openDuplicate();

  const events = await eventsOf(() =>
    pressInBlockOn('Groups', NOT_A_DUPLICATE),
  );

  expect(events).toEqual([
    {
      version: 1,
      stamp: stamped(1, T120),
      type: 'distinct',
      id: expect.stringMatching(UUID_V4),
      units: { expenses: { value: [dinner.id, supper.id] } },
    },
  ]);
  await expectUnsentAreValid();
  await goBackFrom('Expense');
  await expectDuplicates('Brisbane', []);
});

test('[SYNC-203.1] changes neither expense: what is stored of each stays as it was', async () => {
  await withSupper();
  await expectDuplicates('Brisbane', ['Supper']);
  const before = [await expenseTitled('Dinner'), await expenseTitled('Supper')];

  const events = await eventsOf(() => sayNotADuplicate());

  expect(events.map((event) => event.type)).toEqual(['distinct']);
  expect([
    await expenseTitled('Dinner'),
    await expenseTitled('Supper'),
  ]).toEqual(before);
  expect(groupCardTitles('Brisbane')).toHaveLength(2);
});

test('[SYNC-203.1] names the earlier expense first, also when this phone recorded the later one', async () => {
  const { dinner, supper } = await withEarlierSupper();
  await openDuplicate('Dinner');

  const events = await eventsOf(() =>
    pressInBlockOn('Groups', NOT_A_DUPLICATE),
  );

  expect(events).toEqual([
    {
      version: 1,
      stamp: stamped(1),
      type: 'distinct',
      id: expect.stringMatching(UUID_V4),
      units: { expenses: { value: [supper.id, dinner.id] } },
    },
  ]);
});

test('[SYNC-203.1] [LEDGER-159.1] settles one pair at a time: an expense alike to two of yours shows the next one until both are settled', async () => {
  const { brisbane, dinner } = await withDinner();
  await addDinner('Brunch');
  const brunch = await expenseTitled('Brunch');
  await receive(brisbane, await alikeCreated());
  const supper = await expenseTitled('Supper');
  await openDuplicate();
  expect(otherOn('Groups')?.[0]).toBe('Dinner');

  const first = await eventsOf(() => pressInBlockOn('Groups', NOT_A_DUPLICATE));

  await waitFor(() => expect(otherOn('Groups')?.[0]).toBe('Brunch'));
  await expectDuplicateBlockOn('Groups');
  expect(first).toMatchObject([
    {
      type: 'distinct',
      units: { expenses: { value: [dinner.id, supper.id] } },
    },
  ]);

  const second = await eventsOf(() =>
    pressInBlockOn('Groups', NOT_A_DUPLICATE),
  );

  await expectNoDuplicateBlockOn('Groups');
  expect(second).toMatchObject([
    {
      type: 'distinct',
      units: { expenses: { value: [brunch.id, supper.id] } },
    },
  ]);
  expect(second[0].id).not.toBe(first[0].id);
  await goBackFrom('Expense');
  await expectDuplicates('Brisbane', []);
});

test('[SYNC-203.1] [LEDGER-159.1] shows no mark after Not a Duplicate and a restart', async () => {
  const { app } = await withSupper();
  await sayNotADuplicate();
  await expectDuplicates('Brisbane', []);

  await restart(app);

  await waitFor(() => expect(cardTitles()).toContain('Supper'));
  expect(linesIn(card('Supper'))).not.toContain(DUPLICATE);
  await expectDuplicates('Brisbane', []);
  await openFromGroup('Brisbane', 'Supper');
  expect(detailLinesOn('Groups')[0]).toBe('Supper');
});

test('[SYNC-203.1] keeps a settled pair settled when the two differ and then are alike again', async () => {
  const { dinner } = await withSupper();
  await expectDuplicates('Brisbane', ['Supper']);
  const events = await eventsOf(() => sayNotADuplicate());
  expect(events.map((event) => event.type)).toEqual(['distinct']);

  await editExpense(dinner.id, { amount: '120.00' });
  await editExpense(dinner.id, { amount: '100.01' });

  await expectDuplicates('Brisbane', []);
});

test('[SYNC-203.1] [LEDGER-159.1] writes nothing when a write of Not a Duplicate fails, whichever it is, says so, and writes one event once it works', async () => {
  await withSupper();
  await openDuplicate();
  const before = everything();
  const events = (await unsent()).length;

  let written = 0;
  for (; ; written += 1) {
    if (written > 80) throw new Error('The save never went through');
    const shown = alertsShown().length;
    failWritesAfter(written);
    await pressInBlockOn('Groups', NOT_A_DUPLICATE);
    await waitFor(async () =>
      expect(
        (await unsent()).length > events || alertsShown().length > shown,
      ).toBe(true),
    );
    if ((await unsent()).length > events) break;
    expect(alertsShown().at(-1)).toEqual(SAVE_FAILED);
    expect(everything()).toEqual(before);
    expect(detailLinesOn('Groups')).toContain(DUPLICATE);
  }
  allowWrites();

  expect(written).toBeGreaterThan(0);
  expect(await unsent()).toHaveLength(events + 1);
  await expectNoDuplicateBlockOn('Groups');
});

// "Not a duplicate" from another phone

test('[SYNC-204.1] takes the mark off when another phone says the two are not duplicates, and changes neither expense', async () => {
  const { brisbane, dinner, supper } = await withSupper();
  await expectDuplicates('Brisbane', ['Supper']);
  const before = [await expenseTitled('Dinner'), await expenseTitled('Supper')];

  await receive(brisbane, distinctCreated(dinner.id, supper.id));

  await expectDuplicates('Brisbane', []);
  expect(await refused()).toEqual([]);
  expect([
    await expenseTitled('Dinner'),
    await expenseTitled('Supper'),
  ]).toEqual(before);
  expect(groupCardTitles('Brisbane')).toHaveLength(2);
});

test('[SYNC-204.1] ends the same when both phones said so, in records of their own that name the two in either order', async () => {
  const { brisbane, dinner, supper } = await withSupper();
  await sayNotADuplicate();
  const theirs = relayed(distinctCreated(supper.id, dinner.id));

  await receiveEvents(brisbane, theirs);

  await expectDuplicates('Brisbane', []);
  expect(await refused()).toEqual([]);
  const before = everything();
  const own = await unsent();
  await receiveEvents(
    brisbane,
    theirs,
    ...own.map((event) => relayed(event.content, { id: event.id })),
  );
  expect(everything()).toEqual(before);
  await expectDuplicates('Brisbane', []);
});

test('[SYNC-204.1] keeps a record that names an expense it does not hold yet, and never marks that expense once it arrives', async () => {
  const { brisbane, dinner } = await withDinner();
  const supper = await alikeCreated();

  await receive(brisbane, distinctCreated(dinner.id, supper.id, at(T150)));

  expect(await refused()).toEqual([]);

  await receive(brisbane, supper);

  await showGroup('Brisbane');
  await waitFor(() => expect(groupCardTitles('Brisbane')).toHaveLength(2));
  await expectDuplicates('Brisbane', []);
});

test('[SYNC-204.1] keeps both a move to the trash and a "not a duplicate" made at the same time: restored, the expense is not marked', async () => {
  const { brisbane, dinner, supper } = await withSupper();
  await expectDuplicates('Brisbane', ['Supper']);
  await tapTab('Expenses');
  await deleteByAction('Supper');

  await receive(brisbane, distinctCreated(dinner.id, supper.id));

  expect(await refused()).toEqual([]);
  expect(await isTrashed('Supper')).toBe(true);
  await openTrash();
  await restoreFromTrash('Supper');
  await showGroup('Brisbane');
  await waitFor(() => expect(groupCardTitles('Brisbane')).toHaveLength(2));
  await expectDuplicates('Brisbane', []);
});

test('[SYNC-204.1] settles the pair the record names, and no other', async () => {
  const { brisbane, dinner, supper } = await withSupper();
  await receive(
    brisbane,
    await alikeCreated({ title: 'Snack', stamp: at(T150, 0, THIRD) }),
  );
  await showGroup('Brisbane');
  await waitFor(() => expect(duplicatesOn('Brisbane')).toHaveLength(2));

  await receive(brisbane, distinctCreated(dinner.id, supper.id));

  await expectDuplicates('Brisbane', ['Snack']);
});

test('[SYNC-204.1] a record of another shared ledger settles nothing in this one', async () => {
  await startShared({ ...BRISBANE, Tokyo: ['Dana'] });
  const brisbane = await groupId('Brisbane');
  const tokyo = await share('Tokyo');
  await addDinner();
  const dinner = await expenseTitled('Dinner');
  await receive(brisbane, await alikeCreated());
  const supper = await expenseTitled('Supper');
  await expectDuplicates('Brisbane', ['Supper']);

  await receive(tokyo, distinctCreated(dinner.id, supper.id));

  expect(await refused()).toEqual([]);
  await expectDuplicates('Brisbane', ['Supper']);
});

test('[SYNC-204.1] does not apply a record that names one expense twice, and keeps the mark', async () => {
  const { brisbane, supper } = await withSupper();
  await expectDuplicates('Brisbane', ['Supper']);
  // A record that names the two is applied; otherwise every such record is refused.
  const sound = distinctCreated(supper.id, 'some-other-expense', at(T150));
  await receive(brisbane, sound);
  expect(await refused()).toEqual([]);

  await receive(brisbane, distinctCreated(supper.id, supper.id));

  expect(await refused()).toMatchObject([{ reason: 'structure' }]);
  await expectDuplicates('Brisbane', ['Supper']);
});

test("[SYNC-204.1] still shows no mark after another phone's record and a restart", async () => {
  const { app, brisbane, dinner, supper } = await withSupper();
  await expectDuplicates('Brisbane', ['Supper']);
  await receive(brisbane, distinctCreated(dinner.id, supper.id));
  await expectDuplicates('Brisbane', []);

  await restart(app);

  await waitFor(() => expect(cardTitles()).toContain('Supper'));
  await expectDuplicates('Brisbane', []);
  expect(await refused()).toEqual([]);
});

// The mark on cards

test("[LEDGER-156.1] shows the mark under the category on the card of a possible duplicate, on the group's screen and on the expense list, and reads it after the date", async () => {
  await withSupper();

  await showGroup('Brisbane');
  const onGroup = [
    'Supper',
    '$100.01',
    'Food & Dining',
    'Paid by Blake',
    DUPLICATE,
  ];
  await waitFor(() =>
    expect(
      shownInOrder(linesIn(groupCard('Brisbane', 'Supper')), onGroup),
    ).toEqual(onGroup),
  );
  const readOnGroup = [...onGroup.slice(0, 4), 'Oct 30, 2026', DUPLICATE];
  expect(
    shownInOrder([readOut(groupCard('Brisbane', 'Supper'))], readOnGroup),
  ).toEqual(readOnGroup);
  expect(linesIn(groupCard('Brisbane', 'Dinner'))).not.toContain(DUPLICATE);
  expect(readOut(groupCard('Brisbane', 'Dinner'))).not.toContain(DUPLICATE);

  await tapTab('Expenses');
  const onList = ['Supper', '$50.00', 'Food & Dining', 'Brisbane', DUPLICATE];
  await waitFor(() =>
    expect(shownInOrder(linesIn(card('Supper')), onList)).toEqual(onList),
  );
  const readOnList = [...onList.slice(0, 4), 'Oct 30, 2026', DUPLICATE];
  expect(shownInOrder([readOut(card('Supper'))], readOnList)).toEqual(
    readOnList,
  );
  expect(linesIn(card('Dinner'))).not.toContain(DUPLICATE);
});

test('[LEDGER-156.1] draws the warning icon before the text of the mark, reads no icon, and draws none on the card of the other expense', async () => {
  await withSupper();
  await tapTab('Expenses');
  await waitFor(() => expect(linesIn(card('Supper'))).toContain(DUPLICATE));

  expect(iconNames(card('Supper'), 'ios')).toEqual([MARK_ICON.ios]);
  const [icon] = iconsIn(card('Supper'), 'ios');
  const [text] = drawnTexts(card('Supper'), DUPLICATE);
  // After the category, and before the words of the mark.
  expect(
    inTreeOrder(
      drawnTexts(card('Supper'), 'Food & Dining')[0],
      icon.view,
      text,
    ),
  ).toBe(true);
  expect(readOut(card('Supper'))).not.toContain('exclamationmark');
  expect(iconNames(card('Dinner'), 'ios')).toEqual([]);
});

test("[LEDGER-156.1] shows the mark on the cards of a category's expenses, opened from the group's Insights and from your own", async () => {
  const { brisbane } = await withSupper();

  await openGroupInsights(brisbane);
  await openCategory('Food & Dining', 'Groups');

  const ofGroup = [
    'Supper',
    '$100.01',
    'Food & Dining',
    'Paid by Blake',
    DUPLICATE,
  ];
  await waitFor(() =>
    expect(
      shownInOrder(
        linesIn(categoryCard('Food & Dining', 'Supper', 'Groups')),
        ofGroup,
      ),
    ).toEqual(ofGroup),
  );

  await openInsights();
  await openCategory('Food & Dining');

  const ofYours = ['Supper', '$50.00', 'Food & Dining', 'Brisbane', DUPLICATE];
  await waitFor(() =>
    expect(
      shownInOrder(linesIn(categoryCard('Food & Dining', 'Supper')), ofYours),
    ).toEqual(ofYours),
  );
  expect(linesIn(categoryCard('Food & Dining', 'Dinner'))).not.toContain(
    DUPLICATE,
  );
});

test('[LEDGER-156.1] marks your own card, and not the other, when yours was recorded later', async () => {
  await withEarlierSupper();
  await tapTab('Expenses');

  await waitFor(() => expect(linesIn(card('Dinner'))).toContain(DUPLICATE));
  expect(linesIn(card('Supper'))).not.toContain(DUPLICATE);
});

test('[LEDGER-156.1] shows both lines on the card of an expense that needs review and is a possible duplicate, the replaced amount first', async () => {
  await withBothMarks();

  await showGroup('Brisbane');
  const onGroup = [
    'Dinner',
    '$90.00',
    'Food & Dining',
    'Paid by Casey',
    MARK,
    DUPLICATE,
  ];
  await waitFor(() =>
    expect(
      shownInOrder(linesIn(groupCard('Brisbane', 'Dinner')), onGroup),
    ).toEqual(onGroup),
  );
  const read = ['Oct 30, 2026', MARK, DUPLICATE];
  expect(
    shownInOrder([readOut(groupCard('Brisbane', 'Dinner'))], read),
  ).toEqual(read);
  expect(linesIn(groupCard('Brisbane', 'Supper'))).not.toContain(DUPLICATE);
});

test('[LEDGER-156.1] shows no mark on Trash, and shows it again once the expense is restored', async () => {
  await withSupper();
  await tapTab('Expenses');
  await waitFor(() => expect(linesIn(card('Supper'))).toContain(DUPLICATE));

  await deleteByAction('Supper');
  await openTrash();

  await waitFor(() => expect(linesIn(trashCard('Supper'))).toContain('Supper'));
  expect(linesIn(trashCard('Supper'))).not.toContain(DUPLICATE);

  await restoreFromTrash('Supper');
  await tapTab('Expenses');

  await waitFor(() => expect(linesIn(card('Supper'))).toContain(DUPLICATE));
});

// The block on the details

test('[LEDGER-157.1] names the other expense above the title of the details, with its payer and sharers and three buttons', async () => {
  await withSupper();
  await tapTab('Expenses');
  await waitFor(() => expect(linesIn(card('Supper'))).toContain(DUPLICATE));

  await openDetails('Supper');

  const block = duplicateBlock('Dinner', 'Casey', DINNER_SHARERS);
  await waitFor(() =>
    expect(detailLines().slice(0, detailLines().indexOf('Supper'))).toEqual(
      block,
    ),
  );
  // Under it, the details as they are without it.
  const under = ['Supper', '$100.01', 'Oct 30, 2026', 'Food & Dining'];
  expect(shownInOrder(detailLines().slice(block.length), under)).toEqual(under);
  expect(iconNames(screenOf('Expense'), 'ios')).toContain(MARK_ICON.ios);
  for (const name of [VIEW_OTHER, NOT_A_DUPLICATE, DELETE_THIS]) {
    const button = blockButtonOn('Expenses', name);
    expect(button).toBeDefined();
    expect(isDisabled(button!)).toBe(false);
  }
});

test('[LEDGER-157.1] shows no block on the details of the other expense', async () => {
  await withSupper();
  await tapTab('Expenses');
  await waitFor(() => expect(linesIn(card('Supper'))).toContain(DUPLICATE));

  await openDetails('Dinner');

  expect(detailLines()[0]).toBe('Dinner');
  expect(detailLines()).not.toContain(DUPLICATE);
  expect(blockButtonOn('Expenses', NOT_A_DUPLICATE) === undefined).toBe(true);
});

test('[LEDGER-157.1] names the expense another phone added on the details of yours, when yours was recorded later', async () => {
  await withEarlierSupper();

  await openDuplicate('Dinner');

  const block = duplicateBlock('Supper', 'Blake', SUPPER_SHARERS);
  expect(
    detailLinesOn('Groups').slice(0, detailLinesOn('Groups').indexOf('Dinner')),
  ).toEqual(block);
});

test('[LEDGER-157.1] follows the other expense while the details are open: its new title, and a member by the new name', async () => {
  const { brisbane, dinner } = await withSupper();
  await tapTab('Expenses');
  await waitFor(() => expect(linesIn(card('Supper'))).toContain(DUPLICATE));
  await openDetails('Supper');
  await expectDuplicateBlockOn('Expenses');

  await renameInGroup('Brisbane', 'Casey', 'Cass');
  await receive(
    brisbane,
    changed(
      'expense',
      dinner.id,
      at(T150),
      { title: 'Team dinner' },
      { title: stamped(0) },
    ),
  );
  await tapTab('Expenses');

  await waitFor(() =>
    expect(otherOn('Expenses')).toEqual([
      'Team dinner',
      'Paid by Cass',
      `Split between Blake, ${YOU}, Cass`,
    ]),
  );
});

test('[LEDGER-157.1] shows the block on details that are open when the expense becomes a possible duplicate', async () => {
  const { brisbane, dinner } = await withSupper({ amountMinor: 9000 });
  await tapTab('Expenses');
  await waitFor(() => expect(cardTitles()).toContain('Supper'));
  await openDetails('Supper');
  expect(detailLines()).not.toContain(DUPLICATE);

  await receive(
    brisbane,
    changed(
      'expense',
      dinner.id,
      at(T150),
      { money: await moneyOf(9000) },
      { money: stamped(0) },
    ),
  );

  await expectDuplicateBlockOn('Expenses');
  expect(otherOn('Expenses')?.[0]).toBe('Dinner');
});

test.each<[string, 'distinct' | 'deleted']>([
  ['another phone says the two are not duplicates', 'distinct'],
  ['another phone deletes the other expense for good', 'deleted'],
])(
  '[LEDGER-157.1] takes the block off details that are open when %s',
  async (_case, what) => {
    const { brisbane, dinner, supper } = await withSupper();
    await openDuplicate();

    await receive(
      brisbane,
      what === 'distinct'
        ? distinctCreated(dinner.id, supper.id)
        : deleted('expense', dinner.id, at(T180)),
    );

    await expectNoDuplicateBlockOn('Groups');
    expect(detailLinesOn('Groups')[0]).toBe('Supper');
    expect(blockButtonOn('Groups', DELETE_THIS) === undefined).toBe(true);
  },
);

test('[LEDGER-157.1] shows one block, for the earliest of the expenses it is alike to', async () => {
  const { brisbane } = await withDinner();
  await addDinner('Brunch');
  await receive(brisbane, await alikeCreated());

  await openDuplicate();

  const lines = detailLinesOn('Groups');
  expect(lines.filter((line) => line === DUPLICATE)).toHaveLength(1);
  expect(lines.filter((line) => line === OTHER_EXPENSE)).toHaveLength(1);
  expect(otherOn('Groups')?.[0]).toBe('Dinner');
});

test('[LEDGER-157.1] shows the block of a replaced amount first and this block under it, both above the title', async () => {
  await withBothMarks();

  await openFromGroup('Brisbane', 'Dinner');

  await expectBlockOn('Groups');
  await expectDuplicateBlockOn('Groups');
  const lines = detailLinesOn('Groups');
  const order = [
    MARK,
    KEEP_CURRENT,
    USE_MINE,
    DUPLICATE,
    OTHER_EXPENSE,
    'Supper',
    DELETE_THIS,
    'Dinner',
    '$90.00',
  ];
  expect(shownInOrder(lines, order)).toEqual(order);
  expect(lines.indexOf(USE_MINE)).toBeLessThan(lines.indexOf(DUPLICATE));
  expect(lines.indexOf(DELETE_THIS)).toBeLessThan(lines.indexOf('Dinner'));
});

test('[LEDGER-157.1] shows no block on the read-only details in Trash', async () => {
  await withSupper();
  await tapTab('Expenses');
  await waitFor(() => expect(linesIn(card('Supper'))).toContain(DUPLICATE));
  await deleteByAction('Supper');
  await openTrash();

  await openTrashed('Supper');

  expect(expenseLines('Settings')[0]).toBe(IN_TRASH);
  for (const line of [DUPLICATE, VIEW_OTHER, NOT_A_DUPLICATE, DELETE_THIS])
    expect(expenseLines('Settings')).not.toContain(line);
});

// View Other Expense

test('[LEDGER-158.1] pushes the details of the other expense above these on the Groups tab, as they open from anywhere else', async () => {
  const { app, dinner } = await withSupper();
  await openDuplicate();

  await pressInBlockOn('Groups', VIEW_OTHER);

  await expectDetailsStackedOn('Groups', 2, 'Dinner');
  expect(selectedTab()).toBe('Groups');
  expect(navigationBarTitles(tab('Groups'))).toEqual([
    'Groups',
    'Brisbane',
    'Expense',
    'Expense',
  ]);
  expect(app.getPathname()).toBe(`/groups/expenses/${dinner.id}`);
  expect(detailLinesOn('Groups')[0]).toBe('Dinner');
  expect(detailLinesOn('Groups')).not.toContain(DUPLICATE);
  expect(editOn('Groups')).toMatchObject({ disabled: false });
  expect(hasExpenseActions('Groups')).toBe(true);
});

test('[LEDGER-158.1] pushes them on the Expenses tab when these details are open there', async () => {
  const { app, dinner } = await withSupper();
  await tapTab('Expenses');
  await waitFor(() => expect(linesIn(card('Supper'))).toContain(DUPLICATE));
  await openDetails('Supper');

  await pressInBlockOn('Expenses', VIEW_OTHER);

  await expectDetailsStackedOn('Expenses', 2, 'Dinner');
  expect(selectedTab()).toBe('Expenses');
  expect(app.getPathname()).toBe(`/expenses/${dinner.id}`);
  expect(detailLinesOn('Expenses')[0]).toBe('Dinner');
});

test('[LEDGER-158.1] goes back to these details, which still show the block, and from there to the group', async () => {
  await withSupper();
  await openDuplicate();
  await pressInBlockOn('Groups', VIEW_OTHER);
  await expectDetailsStackedOn('Groups', 2, 'Dinner');

  await goBackFromDetailsOn('Groups');

  await expectDetailsOn('Groups', 'Supper');
  await expectDuplicateBlockOn('Groups');

  await goBackFromDetailsOn('Groups');

  await waitFor(() =>
    expect(navigationBarTitles(tab('Groups'))).toEqual(['Groups', 'Brisbane']),
  );
});

test('[LEDGER-158.1] pushes one details when the button is pressed twice', async () => {
  await withSupper();
  await openDuplicate();
  const button = blockButtonOn('Groups', VIEW_OTHER)!;

  await fireEvent.press(button);
  await fireEvent.press(button);
  await settle();

  await expectDetailsStackedOn('Groups', 2, 'Dinner');
  await goBackFromDetailsOn('Groups');
  await expectDetailsOn('Groups', 'Supper');
});

test('[LEDGER-158.1] deleting the other expense from its details goes back to these, which no longer show the block', async () => {
  await withSupper();
  await openDuplicate();
  await pressInBlockOn('Groups', VIEW_OTHER);
  await expectDetailsStackedOn('Groups', 2, 'Dinner');
  const alerts = alertsShown().length;

  await chooseExpenseAction('Groups', 'Delete');

  await waitFor(() => expect(detailBarsOn('Groups')).toHaveLength(1));
  await expectNoDuplicateBlockOn('Groups');
  expect(detailLinesOn('Groups')[0]).toBe('Supper');
  expect(alertsShown()).toHaveLength(alerts);
  expect(noticeShown()).toBe(true);
  expect(await isTrashed('Dinner')).toBe(true);
  expect(await isTrashed('Supper')).toBe(false);
});

test('[LEDGER-158.1] opens the other expense on the Settings tab for an archived group, read-only like these details', async () => {
  const { app, dinner } = await withSupper();
  await expectDuplicates('Brisbane', ['Supper']);
  await goBackFrom('Brisbane');
  await archiveGroup('Brisbane');
  await openArchivedGroups();
  await openArchivedGroup('Brisbane');
  await fireEvent.press(groupCard('Brisbane', 'Supper'));
  await expectDetailsOn('Settings', 'Supper');
  await expectDuplicateBlockOn('Settings');
  expect(isDisabled(blockButtonOn('Settings', VIEW_OTHER)!)).toBe(false);

  await pressInBlockOn('Settings', VIEW_OTHER);

  await expectDetailsStackedOn('Settings', 2, 'Dinner');
  expect(selectedTab()).toBe('Settings');
  expect(app.getPathname()).toBe(
    `/settings/archived-groups/expenses/${dinner.id}`,
  );
  expect(editOn('Settings')).toMatchObject({ disabled: true });
});

// Not a Duplicate on the screens

test('[LEDGER-159.1] takes the mark off the details and every card when Not a Duplicate is pressed, and leaves both expenses where they are', async () => {
  await withSupper();
  await tapTab('Expenses');
  await waitFor(() => expect(linesIn(card('Supper'))).toContain(DUPLICATE));
  await openDetails('Supper');

  await pressInBlockOn('Expenses', NOT_A_DUPLICATE);

  await waitFor(() => expect(detailLines()).not.toContain(DUPLICATE));
  expect(detailBarsOn('Expenses')).toHaveLength(1);
  expect(detailLines().slice(0, 2)).toEqual(['Supper', '$100.01']);
  for (const name of [VIEW_OTHER, NOT_A_DUPLICATE, DELETE_THIS])
    expect(blockButtonOn('Expenses', name) === undefined).toBe(true);

  await goBackFrom('Expense');

  const onList = ['Supper', '$50.00', 'Food & Dining', 'Brisbane'];
  expect(shownInOrder(linesIn(card('Supper')), onList)).toEqual(onList);
  expect(linesIn(card('Supper'))).not.toContain(DUPLICATE);
  expect(linesIn(card('Dinner'))).toContain('$33.34');
  await expectDuplicates('Brisbane', []);
  expect([...groupCardTitles('Brisbane')].sort()).toEqual(['Dinner', 'Supper']);
  expect(await isTrashed('Dinner')).toBe(false);
  expect(await isTrashed('Supper')).toBe(false);
});

test('[LEDGER-159.1] saves once when Not a Duplicate is pressed twice before the save has finished', async () => {
  await withSupper();
  await openDuplicate();
  const events = (await unsent()).length;
  const alerts = alertsShown().length;
  const button = blockButtonOn('Groups', NOT_A_DUPLICATE)!;
  const writes = holdWrites();

  await fireEvent.press(button);
  await fireEvent.press(button);
  await writes.release();
  await settle();

  await expectNoDuplicateBlockOn('Groups');
  expect(await unsent()).toHaveLength(events + 1);
  // The second press did nothing: it did not try a save that then failed, either.
  expect(alertsShown()).toHaveLength(alerts);
});

test('[LEDGER-159.1] [LEDGER-160.1] does not delete the expense when Delete This Expense is pressed before Not a Duplicate has been saved', async () => {
  await withSupper();
  await openDuplicate();
  const events = (await unsent()).length;
  const alerts = alertsShown().length;
  const not = blockButtonOn('Groups', NOT_A_DUPLICATE)!;
  const remove = blockButtonOn('Groups', DELETE_THIS)!;
  const writes = holdWrites();

  await fireEvent.press(not);
  await fireEvent.press(remove);
  await writes.release();
  await settle();

  await expectNoDuplicateBlockOn('Groups');
  expect(detailBarsOn('Groups')).toHaveLength(1);
  expect(detailLinesOn('Groups')[0]).toBe('Supper');
  expect(await isTrashed('Supper')).toBe(false);
  const written = (await unsent()).slice(events);
  expect(written.map((event) => event.content.type)).toEqual(['distinct']);
  expect(alertsShown()).toHaveLength(alerts);
  expect(noticeShown()).toBe(false);
});

test('[LEDGER-159.1] says so when Not a Duplicate cannot be saved, keeps the block, and takes it off once the save works', async () => {
  await withSupper();
  await tapTab('Expenses');
  await waitFor(() => expect(linesIn(card('Supper'))).toContain(DUPLICATE));
  await openDetails('Supper');
  await expectDuplicateBlockOn('Expenses');
  const before = everything();
  const shown = alertsShown().length;
  failWrites();

  await pressInBlockOn('Expenses', NOT_A_DUPLICATE);

  await waitFor(() => expect(alertsShown()).toHaveLength(shown + 1));
  expect(alertsShown().at(-1)).toEqual(SAVE_FAILED);
  expect(everything()).toEqual(before);
  await expectDuplicateBlockOn('Expenses');
  for (const name of [VIEW_OTHER, NOT_A_DUPLICATE, DELETE_THIS])
    expect(isDisabled(blockButtonOn('Expenses', name)!)).toBe(false);

  allowWrites();
  await pressInBlockOn('Expenses', NOT_A_DUPLICATE);

  await waitFor(() => expect(detailLines()).not.toContain(DUPLICATE));
  expect(alertsShown()).toHaveLength(shown + 1);
});

test('[LEDGER-159.1] [LEDGER-160.1] offers neither Not a Duplicate nor Delete This Expense in an archived group, and both again once it is restored', async () => {
  await withSupper();
  await expectDuplicates('Brisbane', ['Supper']);
  await goBackFrom('Brisbane');
  await archiveGroup('Brisbane');
  await tapTab('Expenses');
  await waitFor(() => expect(linesIn(card('Supper'))).toContain(DUPLICATE));
  await openDetails('Supper');
  await expectDuplicateBlockOn('Expenses');
  const events = (await unsent()).length;

  expect(isDisabled(blockButtonOn('Expenses', NOT_A_DUPLICATE)!)).toBe(true);
  expect(isDisabled(blockButtonOn('Expenses', DELETE_THIS)!)).toBe(true);
  expect(isDisabled(blockButtonOn('Expenses', VIEW_OTHER)!)).toBe(false);
  await pressInBlockOn('Expenses', NOT_A_DUPLICATE);
  await pressInBlockOn('Expenses', DELETE_THIS);

  expect(await unsent()).toHaveLength(events);
  expect(await isTrashed('Supper')).toBe(false);
  expect(detailBarsOn('Expenses')).toHaveLength(1);
  await expectDuplicateBlockOn('Expenses');

  await goBackFrom('Expense');
  await restoreGroup('Brisbane');
  await tapTab('Expenses');
  await openDetails('Supper');
  await expectDuplicateBlockOn('Expenses');

  expect(isDisabled(blockButtonOn('Expenses', NOT_A_DUPLICATE)!)).toBe(false);
  expect(isDisabled(blockButtonOn('Expenses', DELETE_THIS)!)).toBe(false);
});

// Delete This Expense

test('[LEDGER-160.1] moves this expense to the trash without asking and goes back to the group, as Delete in Expense actions does', async () => {
  await withSupper();
  await openDuplicate();
  const alerts = alertsShown().length;

  await pressInBlockOn('Groups', DELETE_THIS);

  await waitFor(() =>
    expect(navigationBarTitles(tab('Groups'))).toEqual(['Groups', 'Brisbane']),
  );
  expect(alertsShown()).toHaveLength(alerts);
  await waitFor(() => expect(groupCardTitles('Brisbane')).toEqual(['Dinner']));
  expect(noticeShown()).toBe(true);
  expect(linesIn(groupCard('Brisbane', 'Dinner'))).not.toContain(DUPLICATE);
  expect(reviewCount('Brisbane')).toBeUndefined();
  expect(await isTrashed('Dinner')).toBe(false);
  await openTrash();
  await expectTrash(['Supper']);
});

test('[LEDGER-160.1] deletes the expense the details are of, and no other: not the one it is compared with, nor another alike one', async () => {
  const { brisbane } = await withDinner();
  await addDinner('Brunch');
  await receive(
    brisbane,
    await alikeCreated(),
    await alikeCreated({ title: 'Snack', stamp: at(T150, 0, THIRD) }),
  );
  await openDuplicate();

  await pressInBlockOn('Groups', DELETE_THIS);

  await waitFor(() =>
    expect([...groupCardTitles('Brisbane')].sort()).toEqual([
      'Brunch',
      'Dinner',
      'Snack',
    ]),
  );
  expect(await isTrashed('Supper')).toBe(true);
  for (const title of ['Dinner', 'Brunch', 'Snack'])
    expect(await isTrashed(title)).toBe(false);
  await waitFor(() => expect(duplicatesOn('Brisbane')).toEqual(['Snack']));
});

test('[LEDGER-160.1] marks the expense again once Undo has brought it back', async () => {
  await withSupper();
  await openDuplicate();
  await pressInBlockOn('Groups', DELETE_THIS);
  await waitFor(() => expect(groupCardTitles('Brisbane')).toEqual(['Dinner']));
  await expectDuplicates('Brisbane', []);

  await pressUndo('Supper');

  await expectDuplicates('Brisbane', ['Supper']);
});

test('[LEDGER-160.1] moves it once and goes back once when the button is pressed twice before the save has finished', async () => {
  await withSupper();
  await openDuplicate();
  const events = (await unsent()).length;
  const button = blockButtonOn('Groups', DELETE_THIS)!;
  const writes = holdWrites();

  await fireEvent.press(button);
  await fireEvent.press(button);
  // Not saved yet: the details are still open.
  expect(detailBarsOn('Groups')).toHaveLength(1);
  await writes.release();
  await settle();

  await waitFor(() =>
    expect(navigationBarTitles(tab('Groups'))).toEqual(['Groups', 'Brisbane']),
  );
  expect(await unsent()).toHaveLength(events + 1);
  expect(await isTrashed('Supper')).toBe(true);
});

test('[LEDGER-160.1] writes one event, which moves this expense to the trash', async () => {
  const { supper } = await withSupper();
  await openDuplicate();

  const events = await eventsOf(() => pressInBlockOn('Groups', DELETE_THIS));

  expect(events).toEqual([
    {
      version: 1,
      stamp: stamped(1, T120),
      type: 'expense',
      id: supper.id,
      units: { trashed: { value: true, base: at(T120) } },
    },
  ]);
});

// The number of expenses to review on a group's screen

test('[GROUPS-107.2] counts a possible duplicate once, not the expense it is compared with, and opens its details with the block', async () => {
  const { app, supper } = await withSupper();

  await showGroup('Brisbane');

  await waitFor(() => expect(reviewCount('Brisbane')).toBe(needsReview(1)));
  expect(iconNames(reviewButton('Brisbane')!, 'ios')).toEqual([MARK_ICON.ios]);

  await fireEvent.press(reviewButton('Brisbane')!);

  await expectDetailsOn('Groups', 'Supper');
  expect(app.getPathname()).toBe(`/groups/expenses/${supper.id}`);
  await expectDuplicateBlockOn('Groups');
});

test('[GROUPS-107.2] counts an expense that needs review and a possible duplicate together, and opens the first in the order of dates', async () => {
  const { app, brisbane, supper } = await withSupper();
  await addDinner('Taxi', '2026-10-29');
  const taxi = await expenseTitled('Taxi');
  const [added] = (await unsent()).slice(-1);
  await editExpense(taxi.id, { amount: '120.00' });
  await receive(
    brisbane,
    changed(
      'expense',
      taxi.id,
      at(T180),
      { money: await moneyOf(9000) },
      { money: added.content.stamp },
    ),
  );

  await showGroup('Brisbane');

  await waitFor(() => expect(reviewCount('Brisbane')).toBe(needsReview(2)));
  expect(duplicatesOn('Brisbane')).toEqual(['Supper']);
  expect(linesIn(groupCard('Brisbane', 'Taxi'))).toContain(MARK);

  await fireEvent.press(reviewButton('Brisbane')!);

  await expectDetailsOn('Groups', 'Supper');
  expect(app.getPathname()).toBe(`/groups/expenses/${supper.id}`);
});

test('[GROUPS-107.2] counts an expense with both marks once, until both are settled', async () => {
  await withBothMarks();

  await showGroup('Brisbane');
  await waitFor(() => expect(reviewCount('Brisbane')).toBe(needsReview(1)));
  expect(duplicatesOn('Brisbane')).toEqual(['Dinner']);
  expect(linesIn(groupCard('Brisbane', 'Dinner'))).toContain(MARK);

  await openFromGroup('Brisbane', 'Dinner');
  await pressInBlockOn('Groups', KEEP_CURRENT);
  await waitFor(() => expect(detailLinesOn('Groups')).not.toContain(MARK));
  await goBackFrom('Expense');

  await waitFor(() => expect(reviewCount('Brisbane')).toBe(needsReview(1)));
  expect(duplicatesOn('Brisbane')).toEqual(['Dinner']);

  await sayNotADuplicate('Dinner');

  await expectToReview('Brisbane', []);
  expect(duplicatesOn('Brisbane')).toEqual([]);
});

test.each([NOT_A_DUPLICATE, DELETE_THIS])(
  '[GROUPS-107.2] shows no button once the only possible duplicate is settled with %s',
  async (name) => {
    await withSupper();
    await expectDuplicates('Brisbane', ['Supper']);
    await openDuplicate();

    await pressInBlockOn('Groups', name);
    if (name === NOT_A_DUPLICATE) await goBackFrom('Expense');

    await waitFor(() =>
      expect(navigationBarTitles(tab('Groups'))).toEqual([
        'Groups',
        'Brisbane',
      ]),
    );
    await waitFor(() => expect(reviewCount('Brisbane')).toBeUndefined());
    expect(duplicatesOn('Brisbane')).toEqual([]);
  },
);

test("[GROUPS-107.2] takes the button off the open screen when another phone's record settles the only possible duplicate", async () => {
  const { brisbane, dinner, supper } = await withSupper();
  await expectDuplicates('Brisbane', ['Supper']);

  await receive(brisbane, distinctCreated(dinner.id, supper.id));

  await waitFor(() => expect(reviewCount('Brisbane')).toBeUndefined());
  expect(groupCardTitles('Brisbane')).toHaveLength(2);
});

test('[GROUPS-107.2] does not count a possible duplicate in the trash, and counts it again once it is back', async () => {
  await withSupper();
  await expectDuplicates('Brisbane', ['Supper']);
  await tapTab('Expenses');

  await deleteByAction('Supper');

  await showGroup('Brisbane');
  await waitFor(() => expect(groupCardTitles('Brisbane')).toEqual(['Dinner']));
  expect(reviewCount('Brisbane')).toBeUndefined();

  await pressUndo('Supper');

  await expectDuplicates('Brisbane', ['Supper']);
});

test('[LEDGER-157.1] [GROUPS-107.2] Use Mine takes both marks off when your amount is not the amount of the other expense', async () => {
  await withBothMarks();
  await openFromGroup('Brisbane', 'Dinner');
  await expectDuplicateBlockOn('Groups');

  await pressInBlockOn('Groups', USE_MINE);

  await waitFor(() => expect(detailLinesOn('Groups')).not.toContain(MARK));
  await expectNoDuplicateBlockOn('Groups');
  expect(detailLinesOn('Groups').slice(0, 2)).toEqual(['Dinner', '$120.00']);
  await goBackFrom('Expense');
  await expectToReview('Brisbane', []);
  expect(duplicatesOn('Brisbane')).toEqual([]);
});
