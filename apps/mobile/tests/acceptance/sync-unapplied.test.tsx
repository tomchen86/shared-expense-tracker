import { fireEvent, waitFor } from '@testing-library/react-native';
import {
  editExpense,
  inTreeOrder,
  restart,
  storedExpenses,
} from './ledger-expense-app';
import { drawnTexts, linesIn, shownInOrder } from './ledger-expense-list-app';
import { chooseSort, typeSearch } from './ledger-list-find-app';
import {
  addGroupExpense,
  addToGroup,
  archiveGroup,
  groupCardTitles,
  removeFromGroup,
  renameInGroup,
} from './ledger-group-expense-app';
import {
  NO_DELETED,
  deleteByAction,
  expectCards,
  openTrash,
  restoreFromTrash,
  trashLines,
  undoButton,
} from './ledger-trash-app';
import {
  READ_ONLY,
  openArchivedGroup,
  openArchivedGroups,
} from './group-archive-app';
import { showGroup } from './group-balances-app';
import {
  NO_EXPENSES,
  alertsShown,
  expectClosed,
  expectOpen,
  barItems,
  goBackFrom,
  isOpen,
  largeTitle,
  screenOf,
  swipeDown,
  textsOn,
} from './group-details-app';
import { iconNames } from './shell-actions-app';
import {
  allowWrites,
  failWrites,
  failWritesAfter,
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
  OTHER,
  PHONE,
  START,
  YOU,
  at,
  baseOf,
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
  groupId,
  groupNamed,
  members,
  openGroupCategories,
  receive,
  receiveEvents,
  refused,
  relayed,
  removeGroupCategory,
  renameGroupTo,
  share,
  stamped,
  startShared,
  unsent,
} from './sync-app';
import {
  MARK_ICON,
  addDinner,
  expectToReview,
  moneyOf,
  needsReview,
  openFromGroup,
  pressInBlockOn,
  reviewCount,
} from './sync-conflict-app';
import {
  NOT_A_DUPLICATE,
  alikeCreated,
  expectDuplicates,
} from './sync-duplicate-app';
import {
  CLOCK_TEXT,
  DISMISS,
  DISMISS_FAILED,
  EXPENSE_CHANGE,
  GROUP_CHANGE,
  HOUR,
  LIST_HINT,
  LUNCH,
  LUNCH_STAMP,
  NOT_ADDED,
  OTHER_TEXT,
  SHEET,
  TAXI,
  UNREADABLE_CHANGE,
  asRefused,
  blocks,
  closeSheet,
  contentOf,
  dismissButtons,
  expectBlocks,
  expectNotApplied,
  haveLunch,
  lastUnsent,
  lunchUnits,
  notApplied,
  notAppliedButton,
  notAppliedCount,
  openSheet,
  pressDismiss,
  receiveOwn,
  refuseOwn,
  taxiCreated,
  unapplied,
  uploadedHere,
} from './sync-unapplied-app';

// Runs on iOS. Each test starts the app as the other sync tests do (sync-app): Taylor is
// your name, Brisbane's members are Taylor, Casey and Blake, Brisbane becomes a shared
// ledger at 2026-10-30T04:00:00Z with phone-a as this phone's device ID, and the clock
// stands a minute later, so this phone's events are stamped LATER/0, LATER/1 and so on.
// The tests change Brisbane through the app's screens and hand the app the event that
// change wrote as a download would bring it back, refused by every phone
// (sync-unapplied-app).

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

eachTestGetsAPhone('sync-unapplied-');

/** How a sheet is presented, as in group-details.test.tsx. */
const SHEETS = ['formSheet', 'pageSheet', 'modal'];

/** T+120000 of the sync spec's scenarios: LATER is T+60000. */
const T120 = LATER + MINUTE;
/** A stamp of this phone an hour ahead of LATER: an event that holds it and is received at LATER is refused for its clock. */
const ahead = (counter = 0) => stamped(counter, LATER + HOUR);

/** Starts the app with Brisbane as a shared ledger. */
async function start() {
  const app = await startShared();
  return { app, brisbane: await groupId('Brisbane') };
}

/** Starts it, and hands it phone-b's Lunch. */
async function startWithLunch(overrides: Record<string, unknown> = {}) {
  const started = await start();
  await haveLunch(started.brisbane, overrides);
  return started;
}

/** Lunch as the phone stores it now. */
async function lunch() {
  const found = (await storedExpenses()).find(({ id }) => id === LUNCH);
  if (found === undefined) throw new Error('The phone has no Lunch');
  return found;
}

/** Another phone's change of Lunch's title, written by a phone that had seen Lunch as it was added. */
const retitled = (title: string, ms: number) =>
  changed('expense', LUNCH, at(ms), { title }, { title: LUNCH_STAMP });

/** Shows Brisbane's screen and opens Changes Not Applied from its button. */
async function showSheet(group = 'Brisbane') {
  await showGroup(group);
  await openSheet(group);
}

/** The block of a new Dinner that was refused for its clock (LEDGER-230.1). */
const DINNER_BLOCK = [
  NOT_ADDED,
  CLOCK_TEXT,
  'YOU ENTERED',
  'Dinner',
  '$100.01',
  'Paid by Casey',
  `Split between Blake, ${YOU}, Casey`,
  'Oct 30, 2026',
  'Food & Dining',
  'No note',
  DISMISS,
];

// Which events become changes that were not applied

test('[SYNC-350.1] keeps an event this phone uploaded and every phone refuses, with its ID, its content and the reason', async () => {
  const { brisbane } = await start();
  await addDinner();
  const [added] = await unsent();

  const handed = await refuseOwn(brisbane);

  expect(await unapplied()).toEqual([
    {
      groupId: brisbane,
      id: added.id,
      reason: 'clock',
      content: added.content,
    },
  ]);
  expect(await refused()).toEqual([
    { ...handed, groupId: brisbane, reason: 'clock' },
  ]);
  expect(handed.device).toBe(PHONE);
});

test('[SYNC-350.1] keeps one for each reason, in the order they were refused, also for events the phone does not remember writing', async () => {
  const { brisbane } = await startWithLunch();
  const { money } = await lunchUnits();
  const stored = await lunch();
  const events = [
    uploadedHere(
      changed('expense', LUNCH, stamped(0), {
        money: { ...money, amountMinor: 3100 },
      }),
    ),
    uploadedHere(changed('expense', LUNCH, stamped(1), { title: '' })),
    uploadedHere(
      changed('expense', LUNCH, stamped(2), {
        money: { ...money, currency: 'XYZ' },
      }),
    ),
    uploadedHere(
      changed('expense', LUNCH, ahead(), { title: 'Brunch' }),
      LATER,
    ),
    uploadedHere(changed('expense', LUNCH, at(LATER, 3), { title: 'Brunch' })),
  ];

  await receiveEvents(brisbane, ...events);

  expect(await unapplied()).toEqual(
    events.map(({ id, content }, index) => ({
      groupId: brisbane,
      id,
      reason: ['sum', 'structure', 'currency', 'clock', 'device'][index],
      content,
    })),
  );
  expect(await lunch()).toEqual(stored);
});

test('[SYNC-350.1] keeps none for an event another device uploaded, though it is stamped as this phone', async () => {
  const { brisbane } = await start();
  const units = await lunchUnits();

  await receiveEvents(
    brisbane,
    relayed(created('expense', TAXI, at(LATER), { ...units, title: '' })),
    relayed(created('expense', TAXI, stamped(0, LATER + 2000), units), {
      device: OTHER,
    }),
  );

  expect((await refused()).map(({ reason }) => reason)).toEqual([
    'structure',
    'device',
  ]);
  expect(await unapplied()).toEqual([]);
});

test('[SYNC-350.1] keeps none for an event of this phone that applies', async () => {
  const { brisbane } = await start();
  await addDinner();

  await receiveOwn(brisbane);

  expect(await unapplied()).toEqual([]);
  await expectCards(['Dinner']);
});

test('[SYNC-350.1] keeps one for an event refused twice, and keeps it after a restart', async () => {
  const { app, brisbane } = await start();
  await addDinner();
  const handed = await refuseOwn(brisbane);

  await receiveEvents(brisbane, handed);
  await restart(app);

  expect((await unapplied()).map(({ id }) => id)).toEqual([handed.id]);
});

test('[SYNC-350.1] [GROUPS-170.1] keeps it for the shared ledger the event belongs to, and counts each group by itself', async () => {
  await startShared({ ...BRISBANE, Tokyo: ['Dana'] });
  const tokyo = await share('Tokyo');
  await addGroupExpense({
    group: 'Tokyo',
    title: 'Sushi',
    payer: 'Dana',
    sharers: [YOU],
  });

  await refuseOwn(tokyo);

  expect((await unapplied()).map((change) => change.groupId)).toEqual([tokyo]);
  await expectNotApplied('Tokyo', 1);
  await goBackFrom('Tokyo');
  await expectNotApplied('Brisbane', 0);
});

// Taking the change back

test('[SYNC-351.1] puts a title back when the event that changed it is refused, on the open screens and without a restart', async () => {
  const { brisbane } = await startWithLunch();
  await editExpense(LUNCH, { title: 'Brunch' });
  await showGroup('Brisbane');
  await waitFor(() => expect(groupCardTitles('Brisbane')).toEqual(['Brunch']));

  await refuseOwn(brisbane);

  await waitFor(() => expect(groupCardTitles('Brisbane')).toEqual(['Lunch']));
  expect((await lunch()).title).toBe('Lunch');
  expect(await unsent()).toEqual([]);
  await tapTab('Expenses');
  await expectCards(['Lunch']);
});

test("[SYNC-351.1] shows what a phone shows that never had the event: another phone's earlier change that had lost to it, with that change's stamp", async () => {
  const { brisbane } = await startWithLunch();
  await editExpense(LUNCH, { title: 'Brunch' });
  await receive(brisbane, retitled('Late lunch', START + 30_000));
  expect((await lunch()).title).toBe('Brunch');

  await refuseOwn(brisbane);

  expect((await lunch()).title).toBe('Late lunch');
  const [next] = await eventsOf(() => editExpense(LUNCH, { title: 'Noodles' }));
  expect(baseOf(next, 'title')).toEqual(at(START + 30_000));
  // The phone's latest stamp did not go back with the title.
  expect(next.stamp).toEqual(stamped(1));
});

test("[SYNC-351.1] keeps the phone's own later change of the same unit, and takes that back in turn", async () => {
  const { brisbane } = await startWithLunch();
  await editExpense(LUNCH, { title: 'Brunch' });
  await editExpense(LUNCH, { title: 'Late lunch' });
  const [first, second] = await unsent();

  await refuseOwn(brisbane, first);

  expect((await lunch()).title).toBe('Late lunch');
  expect((await unsent()).map(({ id }) => id)).toEqual([second.id]);

  await refuseOwn(brisbane, second);

  expect((await lunch()).title).toBe('Lunch');
  expect(await unsent()).toEqual([]);
});

test("[SYNC-351.1] keeps what the phone's own earlier event holds while that event is still unsent: an expense stays when the change of its title is refused first", async () => {
  const { brisbane } = await start();
  await addDinner();
  const dinner = (await storedExpenses())[0];
  await editExpense(dinner.id, { title: 'Supper' });
  const [added, retitled] = await unsent();

  await refuseOwn(brisbane, retitled);

  await expectCards(['Dinner']);
  expect((await storedExpenses()).map(({ id, title }) => [id, title])).toEqual([
    [dinner.id, 'Dinner'],
  ]);
  expect((await unsent()).map(({ id }) => id)).toEqual([added.id]);
});

test('[SYNC-351.1] takes back only the units the refused event changed', async () => {
  const { brisbane } = await startWithLunch();
  await editExpense(LUNCH, { title: 'Brunch' });
  await editExpense(LUNCH, { note: 'Window seat' });
  const [retitle, renote] = await unsent();

  await refuseOwn(brisbane, retitle);

  expect(await lunch()).toMatchObject({ title: 'Lunch', note: 'Window seat' });
  expect((await unsent()).map(({ id }) => id)).toEqual([renote.id]);
});

test("[SYNC-351.1] leaves a unit that another phone's later change has replaced since", async () => {
  const { brisbane } = await startWithLunch();
  await editExpense(LUNCH, { title: 'Brunch' });
  await receive(brisbane, retitled('Late lunch', T120));

  await refuseOwn(brisbane);

  expect((await lunch()).title).toBe('Late lunch');
  expect(await unsent()).toEqual([]);
  expect(await unapplied()).toHaveLength(1);
});

test("[SYNC-351.1] goes back to the phone's own earlier change once that one has come back and applied", async () => {
  const { brisbane } = await startWithLunch();
  await editExpense(LUNCH, { title: 'Brunch' });
  await receiveOwn(brisbane);
  await editExpense(LUNCH, { title: 'Late lunch' });

  await refuseOwn(brisbane);

  expect((await lunch()).title).toBe('Brunch');
});

test('[SYNC-351.1] removes an expense whose first event is refused from every screen, and does not upload the event', async () => {
  const { brisbane } = await start();
  await addDinner();

  await refuseOwn(brisbane);

  await expectCards([]);
  expect(await storedExpenses()).toEqual([]);
  expect(await unsent()).toEqual([]);
  await showGroup('Brisbane');
  await waitFor(() => expect(textsOn('Brisbane')).toContain(NO_EXPENSES));
  await openTrash();
  await waitFor(() => expect(trashLines()).toEqual([NO_DELETED]));

  await receive(
    brisbane,
    created('expense', LUNCH, at(T120), await lunchUnits()),
  );

  await tapTab('Expenses');
  await expectCards(['Lunch']);
});

test('[SYNC-351.1] takes an expense back out of the trash, with no Undo notice left', async () => {
  const { brisbane } = await startWithLunch();
  await expectCards(['Lunch']);
  await deleteByAction('Lunch');
  await expectCards([]);

  await refuseOwn(brisbane);

  await expectCards(['Lunch']);
  expect(undoButton('Lunch')).toBeNull();
  await openTrash();
  await waitFor(() => expect(trashLines()).toEqual([NO_DELETED]));
});

test("[SYNC-351.1] puts the amount group back, and forgets it as the phone's own amount change", async () => {
  const { brisbane } = await startWithLunch();
  const { money } = await lunchUnits();
  await editExpense(LUNCH, { amount: '45.00' });

  await refuseOwn(brisbane);

  expect(await lunch()).toMatchObject({
    amountMinor: 3000,
    currency: 'USD',
    payments: money.payments,
    shares: money.shares,
  });

  await receive(
    brisbane,
    changed(
      'expense',
      LUNCH,
      at(T120),
      { money: await moneyOf(9000, { sharers: ['Taylor', 'Casey'] }) },
      { money: LUNCH_STAMP },
    ),
  );

  expect((await lunch()).amountMinor).toBe(9000);
  await expectToReview('Brisbane', []);
});

test('[SYNC-351.1] no longer asks to review an expense when the amount change that was overridden is refused', async () => {
  const { brisbane } = await start();
  await addDinner();
  const dinner = (await storedExpenses())[0];
  await editExpense(dinner.id, { amount: '120.00' });
  const [, changedAmount] = await unsent();
  await receive(
    brisbane,
    changed(
      'expense',
      dinner.id,
      at(T120),
      { money: await moneyOf(9000) },
      { money: stamped(0) },
    ),
  );
  await expectToReview('Brisbane', ['Dinner']);

  await refuseOwn(brisbane, changedAmount);

  await expectToReview('Brisbane', []);
  expect((await storedExpenses())[0].amountMinor).toBe(9000);
});

test("[SYNC-351.1] finds the units by the stamp the unsent event has now, when the API's copy of it holds another", async () => {
  const { brisbane } = await startWithLunch();
  await editExpense(LUNCH, { title: 'Brunch' });
  const { id, content } = await lastUnsent();

  await receiveEvents(
    brisbane,
    relayed(
      { ...content, stamp: ahead() },
      { id, device: PHONE, receivedAtMs: LATER },
    ),
  );

  expect((await unapplied()).map((change) => change.reason)).toEqual(['clock']);
  expect((await lunch()).title).toBe('Lunch');
  expect(await unsent()).toEqual([]);
});

test('[SYNC-351.1] leaves the time an expense was last changed, seen in the Recently Edited order', async () => {
  const { brisbane } = await startWithLunch();
  await receive(brisbane, await taxiCreated());
  await showGroup('Brisbane');
  await chooseSort(screenOf('Brisbane'), 'Recently Edited');
  await waitFor(() =>
    expect(groupCardTitles('Brisbane')).toEqual(['Taxi', 'Lunch']),
  );
  await tapTab('Expenses');
  await editExpense(LUNCH, { title: 'Brunch' });
  await showGroup('Brisbane');
  await waitFor(() =>
    expect(groupCardTitles('Brisbane')).toEqual(['Brunch', 'Taxi']),
  );

  await refuseOwn(brisbane);

  await waitFor(() =>
    expect(groupCardTitles('Brisbane')).toEqual(['Lunch', 'Taxi']),
  );
});

test("[SYNC-351.1] puts back a group's name, and removes a member whose first event is refused", async () => {
  const { brisbane } = await start();
  await renameGroupTo('Brisbane', 'Brissie');

  await refuseOwn(brisbane);

  expect((await groupNamed('Brisbane')).id).toBe(brisbane);

  await addToGroup('Brisbane', 'Dana');
  await refuseOwn(brisbane);

  expect(Object.keys(await members('Brisbane'))).toEqual([
    'Taylor',
    'Casey',
    'Blake',
  ]);
});

test('[SYNC-351.1] brings back a category whose permanent deletion is refused, in its place', async () => {
  const { brisbane } = await start();
  await openGroupCategories(brisbane);
  const before = categoriesShown();
  await removeGroupCategory('Shopping', 'Delete');
  await waitFor(() => expect(categoryNames()).not.toContain('Shopping'));

  await refuseOwn(brisbane);

  await waitFor(() => expect(categoriesShown()).toEqual(before));
  await closeGroupCategories();
});

test('[SYNC-351.1] takes back a "not a duplicate" record, so the pair it settled is a possible duplicate again', async () => {
  const { brisbane } = await start();
  await addDinner();
  await receive(brisbane, await alikeCreated());
  await expectDuplicates('Brisbane', ['Supper']);
  await openFromGroup('Brisbane', 'Supper');
  await pressInBlockOn('Groups', NOT_A_DUPLICATE);
  await goBackFrom('Expense');
  await expectDuplicates('Brisbane', []);

  await refuseOwn(brisbane);

  await expectDuplicates('Brisbane', ['Supper']);
  expect(await unsent()).toHaveLength(1);
});

test('[SYNC-351.1] changes no record for a refused event whose stamp the phone holds nowhere', async () => {
  const { brisbane } = await startWithLunch();
  const stored = await lunch();
  const written = await unsent();

  await receiveEvents(
    brisbane,
    uploadedHere(
      changed(
        'expense',
        LUNCH,
        ahead(),
        { title: 'Brunch' },
        { title: LUNCH_STAMP },
      ),
      LATER,
    ),
  );

  expect(await lunch()).toEqual(stored);
  expect(await unsent()).toEqual(written);
  expect(await unapplied()).toHaveLength(1);
});

test('[SYNC-351.1] takes nothing back and keeps nothing when a write fails, whichever it is', async () => {
  const { brisbane } = await startWithLunch();
  await editExpense(LUNCH, { title: 'Brunch' });
  const own = asRefused(await lastUnsent());
  const taxi = relayed(await taxiCreated(at(T120)));
  const before = everything();

  let applied = false;
  let writesThrough = 0;
  for (; writesThrough < 200 && !applied; writesThrough += 1) {
    failWritesAfter(writesThrough);
    try {
      await receiveEvents(brisbane, own, taxi);
      applied = true;
    } catch {
      await settle();
      expect(everything()).toEqual(before);
    }
  }
  allowWrites();

  expect(applied).toBe(true);
  expect(writesThrough).toBeGreaterThan(1);
  expect((await lunch()).title).toBe('Lunch');
  expect((await storedExpenses()).map(({ id }) => id).sort()).toEqual([
    LUNCH,
    TAXI,
  ]);
  expect(await unapplied()).toHaveLength(1);
});

test('[SYNC-351.1] still shows the record as it was taken back after a restart', async () => {
  const { app, brisbane } = await startWithLunch();
  await editExpense(LUNCH, { title: 'Brunch' });
  await refuseOwn(brisbane);

  await restart(app);

  await expectCards(['Lunch']);
});

// Dismissing

test('[SYNC-352.1] [GROUPS-171.1] dismisses a change without writing an event: the sheet closes on the last one, the button goes, and it stays gone after a restart and when the event arrives again', async () => {
  const { app, brisbane } = await start();
  await addDinner();
  const handed = await refuseOwn(brisbane);
  await showSheet();

  await pressDismiss();

  await expectClosed(SHEET);
  expect(notAppliedCount('Brisbane')).toBeUndefined();
  expect(await unapplied()).toEqual([]);
  expect(await unsent()).toEqual([]);
  expect((await refused()).map(({ id }) => id)).toEqual([handed.id]);

  await restart(app);

  expect(await unapplied()).toEqual([]);
  await expectNotApplied('Brisbane', 0);

  await receiveEvents(brisbane, handed);

  expect(await unapplied()).toEqual([]);
  await expectNotApplied('Brisbane', 0);
});

test('[SYNC-352.1] [GROUPS-171.1] dismisses one change and leaves the others: the sheet stays open and the button counts one fewer', async () => {
  const { brisbane } = await start();
  await addDinner();
  await addDinner('Taxi');
  const [dinner, taxi] = await unsent();
  await refuseOwn(brisbane, taxi);
  await refuseOwn(brisbane, dinner);
  await showSheet();
  await waitFor(() =>
    expect(blocks().map((block) => block[3])).toEqual(['Taxi', 'Dinner']),
  );
  expect(dismissButtons()).toHaveLength(2);

  await pressDismiss(0);

  await expectBlocks([DINNER_BLOCK]);
  expect(isOpen(SHEET)).toBe(true);
  expect((await unapplied()).map(({ id }) => id)).toEqual([dinner.id]);

  await closeSheet();

  expect(notAppliedCount('Brisbane')).toBe(notApplied(1));
});

// The button under a group's title

test("[GROUPS-170.1] counts the changes that were not applied in a button under the group's title, with the mark's icon and a chevron", async () => {
  const { brisbane } = await start();
  await addDinner();
  await refuseOwn(brisbane);

  await showGroup('Brisbane');

  await waitFor(() => expect(notAppliedCount('Brisbane')).toBe(notApplied(1)));
  const button = notAppliedButton('Brisbane')!;
  expect(button.props.accessibilityHint).toBe(LIST_HINT);
  expect(iconNames(button, 'ios')).toEqual([MARK_ICON.ios]);
  const shown = [notApplied(1), '›'];
  expect(shownInOrder(linesIn(button), shown)).toEqual(shown);
  // Right under the large title, above the period row; the expense itself is gone.
  expect(textsOn('Brisbane')[0]).toBe(notApplied(1));
  expect(groupCardTitles('Brisbane')).toEqual([]);
  const [period] = drawnTexts(screenOf('Brisbane'), 'Group Total');
  expect(inTreeOrder(largeTitle('Brisbane')!, button, period)).toBe(true);
});

test("[GROUPS-170.1] follows the changes while the group's screen stays open: one, then two", async () => {
  const { brisbane } = await start();
  await showGroup('Brisbane');
  expect(notAppliedCount('Brisbane')).toBeUndefined();

  await addDinner();
  await refuseOwn(brisbane);
  await tapTab('Groups');

  await waitFor(() => expect(notAppliedCount('Brisbane')).toBe(notApplied(1)));

  await addDinner('Taxi');
  await refuseOwn(brisbane);
  await tapTab('Groups');

  await waitFor(() => expect(notAppliedCount('Brisbane')).toBe(notApplied(2)));
});

test('[GROUPS-170.1] sits under the number of expenses to review, which does not count it', async () => {
  const { brisbane } = await start();
  await addDinner();
  const dinner = (await storedExpenses())[0];
  await editExpense(dinner.id, { amount: '120.00' });
  await receive(
    brisbane,
    changed(
      'expense',
      dinner.id,
      at(T120),
      { money: await moneyOf(9000) },
      { money: stamped(0) },
    ),
  );
  await addDinner('Taxi');

  await refuseOwn(brisbane);

  await showGroup('Brisbane');
  await waitFor(() =>
    expect(
      textsOn('Brisbane')
        .filter((text) => text !== '›')
        .slice(0, 2),
    ).toEqual([needsReview(1), notApplied(1)]),
  );
  expect(reviewCount('Brisbane')).toBe(needsReview(1));
});

test('[GROUPS-170.1] stays while the screen is searched', async () => {
  const { brisbane } = await startWithLunch();
  await addDinner();
  await refuseOwn(brisbane);
  await expectNotApplied('Brisbane', 1);

  await typeSearch('Brisbane', 'taxi');

  await waitFor(() => expect(textsOn('Brisbane')).not.toContain('Lunch'));
  expect(notAppliedCount('Brisbane')).toBe(notApplied(1));
});

test('[GROUPS-170.1] opens one Changes Not Applied when pressed twice', async () => {
  const { brisbane } = await start();
  await addDinner();
  await refuseOwn(brisbane);
  await expectNotApplied('Brisbane', 1);
  const button = notAppliedButton('Brisbane')!;

  await fireEvent.press(button);
  await fireEvent.press(button);
  await expectOpen(SHEET);
  await settle();

  expect(navigationBarTitles(tab('Groups'))).toEqual([
    'Groups',
    'Brisbane',
    SHEET,
  ]);

  await closeSheet();

  expect(navigationBarTitles(tab('Groups'))).toEqual(['Groups', 'Brisbane']);
});

test('[GROUPS-170.1] [GROUPS-171.1] shows the button above the read-only line of an archived shared ledger, opens the sheet on the Settings tab, and dismisses there', async () => {
  const { brisbane } = await start();
  await addDinner();
  await refuseOwn(brisbane);
  await archiveGroup('Brisbane');

  await openArchivedGroups();
  await openArchivedGroup('Brisbane');

  await waitFor(() =>
    expect(
      textsOn('Brisbane')
        .filter((text) => text !== '›')
        .slice(0, 3),
    ).toEqual([notApplied(1), READ_ONLY, 'Restore Group']),
  );

  await openSheet('Brisbane');

  expect(selectedTab()).toBe('Settings');
  await expectBlocks([DINNER_BLOCK]);

  await pressDismiss();

  await expectClosed(SHEET);
  expect(notAppliedCount('Brisbane')).toBeUndefined();
  expect(textsOn('Brisbane')).toContain(READ_ONLY);
  expect(await unapplied()).toEqual([]);
});

test('[GROUPS-170.1] shows no button on a group with no such change', async () => {
  await startShared({ ...BRISBANE, Tokyo: ['Dana'] });
  const brisbane = await groupId('Brisbane');
  await showGroup('Brisbane');
  expect(notAppliedCount('Brisbane')).toBeUndefined();
  await goBackFrom('Brisbane');
  await showGroup('Tokyo');
  expect(notAppliedCount('Tokyo')).toBeUndefined();
  await goBackFrom('Tokyo');
  await addDinner();

  await refuseOwn(brisbane);

  await expectNotApplied('Brisbane', 1);
  await goBackFrom('Brisbane');
  await expectNotApplied('Tokyo', 0);
});

test('[GROUPS-170.1] still counts it after a restart', async () => {
  const { app, brisbane } = await start();
  await addDinner();
  await refuseOwn(brisbane);

  await restart(app);

  await expectNotApplied('Brisbane', 1);
});

// Changes Not Applied

test("[GROUPS-171.1] opens Changes Not Applied over the group's screen with Close alone, and closes it with Close", async () => {
  const { brisbane } = await start();
  await addDinner();
  await refuseOwn(brisbane);

  await showSheet();

  expect(selectedTab()).toBe('Groups');
  expect(navigationBarTitles(tab('Groups'))).toEqual([
    'Groups',
    'Brisbane',
    SHEET,
  ]);
  expect(SHEETS).toContain(screenOf(SHEET).props.stackPresentation);
  expect(barItems(SHEET)).toEqual({ left: ['Close (plain)'], right: [] });

  await closeSheet();

  expect(navigationBarTitles(tab('Groups'))).toEqual(['Groups', 'Brisbane']);
  expect(notAppliedCount('Brisbane')).toBe(notApplied(1));
});

test('[GROUPS-171.1] closes Changes Not Applied when it is swiped down', async () => {
  const { brisbane } = await start();
  await addDinner();
  await refuseOwn(brisbane);
  await showSheet();

  await swipeDown(SHEET);

  await expectClosed(SHEET);
  expect(navigationBarTitles(tab('Groups'))).toEqual(['Groups', 'Brisbane']);
});

test('[GROUPS-171.1] [LEDGER-230.1] shows one block for a new expense refused for its clock: the icon and heading, the clock sentence, what you entered, and Dismiss', async () => {
  const { brisbane } = await start();
  await addDinner();
  await refuseOwn(brisbane);

  await showSheet();

  await expectBlocks([DINNER_BLOCK]);
  expect(iconNames(screenOf(SHEET), 'ios')).toEqual([MARK_ICON.ios]);
  expect(dismissButtons()).toHaveLength(1);
});

test('[GROUPS-171.1] says the other sentence for a reason other than the clock', async () => {
  const { brisbane } = await startWithLunch();
  await receiveEvents(
    brisbane,
    uploadedHere(changed('expense', LUNCH, at(LATER), { title: 'Brunch' })),
  );
  expect((await unapplied()).map(({ reason }) => reason)).toEqual(['device']);

  await showSheet();

  await expectBlocks([
    [
      EXPENSE_CHANGE,
      OTHER_TEXT,
      'EXPENSE',
      'Lunch',
      'YOU ENTERED',
      'Brunch',
      DISMISS,
    ],
  ]);
});

test('[GROUPS-171.1] dismisses a change once when Dismiss is pressed twice', async () => {
  const { brisbane } = await start();
  await addDinner();
  await addDinner('Taxi');
  const [dinner, taxi] = await unsent();
  await refuseOwn(brisbane, dinner);
  await refuseOwn(brisbane, taxi);
  await showSheet();
  await waitFor(() => expect(dismissButtons()).toHaveLength(2));
  const [first] = dismissButtons();

  await fireEvent.press(first);
  await fireEvent.press(first);
  await settle();

  await waitFor(() => expect(blocks()).toHaveLength(1));
  expect((await unapplied()).map(({ id }) => id)).toEqual([taxi.id]);
});

test('[GROUPS-171.1] says so when a dismissal cannot be saved, and keeps the block', async () => {
  const { brisbane } = await start();
  await addDinner();
  await refuseOwn(brisbane);
  await showSheet();
  await expectBlocks([DINNER_BLOCK]);
  failWrites();

  await pressDismiss();

  await waitFor(() => expect(alertsShown()).toContainEqual(DISMISS_FAILED));
  expect(blocks()).toEqual([DINNER_BLOCK]);
  expect(await unapplied()).toHaveLength(1);

  allowWrites();
  await pressDismiss();

  await expectClosed(SHEET);
  expect(await unapplied()).toEqual([]);
});

test('[GROUPS-171.1] adds a block while it is open when another change is refused', async () => {
  const { brisbane } = await start();
  await addDinner();
  await refuseOwn(brisbane);
  await showSheet();
  await expectBlocks([DINNER_BLOCK]);

  await receiveEvents(
    brisbane,
    uploadedHere(await taxiCreated(ahead()), LATER),
  );

  await waitFor(() =>
    expect(blocks().map((block) => block[3])).toEqual(['Dinner', 'Taxi']),
  );
});

// Blocks of changes that are not expenses, and of changes that cannot be read

test("[GROUPS-172.1] names the group's name that was entered, and the screen shows the name the group has", async () => {
  const { brisbane } = await start();
  await renameGroupTo('Brisbane', 'Brissie');
  await refuseOwn(brisbane);

  await showSheet();

  await expectBlocks([
    [GROUP_CHANGE, CLOCK_TEXT, 'Group name: Brissie', DISMISS],
  ]);
  expect(navigationBarTitles(tab('Groups')).slice(0, 2)).toEqual([
    'Groups',
    'Brisbane',
  ]);
});

test('[GROUPS-172.1] names the member: the name the event holds, or the name the member has now', async () => {
  const { brisbane } = await start();
  await addToGroup('Brisbane', 'Dana');
  await refuseOwn(brisbane);
  await removeFromGroup('Brisbane', 'Blake');
  await refuseOwn(brisbane);
  await renameInGroup('Brisbane', 'Blake', 'Blake Chen');
  await refuseOwn(brisbane);

  await showSheet();

  await waitFor(() =>
    expect(blocks().map(contentOf)).toEqual([
      ['Member: Dana'],
      ['Member: Blake'],
      ['Member: Blake Chen'],
    ]),
  );
  expect(blocks().map((block) => block[0])).toEqual([
    GROUP_CHANGE,
    GROUP_CHANGE,
    GROUP_CHANGE,
  ]);
  expect(
    (await groupNamed('Brisbane')).members.map(({ name }) => name),
  ).toEqual(['Taylor', 'Casey', 'Blake']);
});

test('[GROUPS-172.1] names the category: the one whose deletion was refused, and one an event archived', async () => {
  const { brisbane } = await start();
  const other = await categoryOf('Brisbane', 'Other');
  await openGroupCategories(brisbane);
  const before = categoriesShown();
  await removeGroupCategory('Shopping', 'Delete');
  await waitFor(() => expect(categoryNames()).not.toContain('Shopping'));
  await refuseOwn(brisbane);
  await receiveEvents(
    brisbane,
    uploadedHere(
      changed('category', other.id, ahead(), { archived: true }),
      LATER,
    ),
  );
  await waitFor(() => expect(categoriesShown()).toEqual(before));
  await closeGroupCategories();

  await showSheet();

  await waitFor(() =>
    expect(blocks().map(contentOf)).toEqual([
      ['Category: Shopping'],
      ['Category: Other'],
    ]),
  );
});

test('[GROUPS-172.1] names an invite and a "not a duplicate" record by their kind', async () => {
  const { brisbane } = await start();

  await receiveEvents(
    brisbane,
    uploadedHere(
      created('invite', 'A'.repeat(22), ahead(0), {
        link: { secret: 'A'.repeat(43), expiresAtMs: LATER + 7 * 24 * HOUR },
      }),
      LATER,
    ),
    uploadedHere(
      created('distinct', 'd0000000-0000-4000-8000-000000000001', ahead(1), {
        expenses: [LUNCH, TAXI],
      }),
      LATER,
    ),
  );
  expect((await unapplied()).map(({ reason }) => reason)).toEqual([
    'clock',
    'clock',
  ]);

  await showSheet();

  await expectBlocks([
    [GROUP_CHANGE, CLOCK_TEXT, 'Invite link', DISMISS],
    [GROUP_CHANGE, CLOCK_TEXT, 'Not a Duplicate', DISMISS],
  ]);
});

test('[GROUPS-172.1] says Member alone for a member the phone does not have', async () => {
  const { brisbane } = await start();

  await receiveEvents(
    brisbane,
    uploadedHere(
      changed('member', 'c0000000-0000-4000-8000-00000000000c', ahead(), {
        removed: true,
      }),
      LATER,
    ),
  );

  await showSheet();

  await expectBlocks([[GROUP_CHANGE, CLOCK_TEXT, 'Member', DISMISS]]);
});

test('[GROUPS-172.1] shows a change refused for its structure with a heading, the sentence and Dismiss alone', async () => {
  const { brisbane } = await startWithLunch();

  await receiveEvents(
    brisbane,
    uploadedHere(changed('expense', LUNCH, stamped(0), { title: '' })),
    uploadedHere(null),
  );
  expect((await unapplied()).map(({ reason }) => reason)).toEqual([
    'structure',
    'structure',
  ]);

  await showSheet();

  await expectBlocks([
    [UNREADABLE_CHANGE, OTHER_TEXT, DISMISS],
    [UNREADABLE_CHANGE, OTHER_TEXT, DISMISS],
  ]);
});

// Blocks of expense changes

test('[LEDGER-230.1] shows a refused change of the amount under the expense it was made to', async () => {
  const { brisbane } = await startWithLunch();
  await editExpense(LUNCH, { amount: '45.00' });
  await refuseOwn(brisbane);

  await showSheet();

  await expectBlocks([
    [
      EXPENSE_CHANGE,
      CLOCK_TEXT,
      'EXPENSE',
      'Lunch',
      'YOU ENTERED',
      '$45.00',
      'Paid by Casey',
      `Split between ${YOU}, Casey`,
      DISMISS,
    ],
  ]);
});

test('[LEDGER-230.1] lists only the units the event changed, in order: the title before the note, the date before the category', async () => {
  const { brisbane } = await startWithLunch();
  await editExpense(LUNCH, { title: 'Brunch', note: 'Window seat' });
  await refuseOwn(brisbane);
  await editExpense(LUNCH, { date: '2026-10-29', category: 'Shopping' });
  await refuseOwn(brisbane);

  await showSheet();

  await waitFor(() =>
    expect(blocks().map(contentOf)).toEqual([
      ['EXPENSE', 'Lunch', 'YOU ENTERED', 'Brunch', 'Window seat'],
      ['EXPENSE', 'Lunch', 'YOU ENTERED', 'Oct 29, 2026', 'Shopping'],
    ]),
  );
});

test('[LEDGER-230.1] says No note for a note that was cleared', async () => {
  const { brisbane } = await startWithLunch({ note: 'Window seat' });
  await editExpense(LUNCH, { note: '' });
  await refuseOwn(brisbane);

  await showSheet();

  await waitFor(() =>
    expect(blocks().map(contentOf)).toEqual([
      ['EXPENSE', 'Lunch', 'YOU ENTERED', 'No note'],
    ]),
  );
  expect((await lunch()).note).toBe('Window seat');
});

test('[LEDGER-230.1] says Moved to Trash and Restored from Trash, and names the expense though it is in the trash', async () => {
  const { brisbane } = await startWithLunch();
  await expectCards(['Lunch']);
  await deleteByAction('Lunch');
  await refuseOwn(brisbane);
  await receive(
    brisbane,
    changed(
      'expense',
      LUNCH,
      at(T120),
      { trashed: true },
      { trashed: LUNCH_STAMP },
    ),
  );
  await restoreFromTrash('Lunch');
  await refuseOwn(brisbane);
  // Lunch is back in the trash, where the other phone's event put it.
  await tapTab('Expenses');
  await expectCards([]);

  await showSheet();

  await waitFor(() =>
    expect(blocks().map(contentOf)).toEqual([
      ['EXPENSE', 'Lunch', 'YOU ENTERED', 'Moved to Trash'],
      ['EXPENSE', 'Lunch', 'YOU ENTERED', 'Restored from Trash'],
    ]),
  );
});

test('[LEDGER-230.1] names the payer and the sharers as they are called now', async () => {
  const { brisbane } = await start();
  await addDinner();
  await refuseOwn(brisbane);
  await renameInGroup('Brisbane', 'Casey', 'Cass');

  await showSheet();

  const shown = ['Paid by Cass', `Split between Blake, ${YOU}, Cass`];
  await waitFor(() =>
    expect(shownInOrder(blocks()[0] ?? [], shown)).toEqual(shown),
  );
});

test('[LEDGER-230.1] leaves the amount group out for an event refused for its currency or its sums', async () => {
  const { brisbane } = await startWithLunch();
  const { money } = await lunchUnits();

  await receiveEvents(
    brisbane,
    uploadedHere(
      changed('expense', LUNCH, stamped(0), {
        title: 'Brunch',
        money: { ...money, currency: 'XYZ' },
      }),
    ),
    uploadedHere(
      changed('expense', LUNCH, stamped(1), {
        title: 'Late lunch',
        money: { ...money, amountMinor: 3100 },
      }),
    ),
  );
  expect((await unapplied()).map(({ reason }) => reason)).toEqual([
    'currency',
    'sum',
  ]);

  await showSheet();

  await expectBlocks([
    [
      EXPENSE_CHANGE,
      OTHER_TEXT,
      'EXPENSE',
      'Lunch',
      'YOU ENTERED',
      'Brunch',
      DISMISS,
    ],
    [
      EXPENSE_CHANGE,
      OTHER_TEXT,
      'EXPENSE',
      'Lunch',
      'YOU ENTERED',
      'Late lunch',
      DISMISS,
    ],
  ]);
});

test('[LEDGER-230.1] leaves EXPENSE out for an expense the phone does not have', async () => {
  const { brisbane } = await start();

  await receiveEvents(
    brisbane,
    uploadedHere(changed('expense', TAXI, ahead(), { title: 'Brunch' }), LATER),
  );

  await showSheet();

  await expectBlocks([
    [EXPENSE_CHANGE, CLOCK_TEXT, 'YOU ENTERED', 'Brunch', DISMISS],
  ]);
});

test('[LEDGER-230.1] shows a refused permanent deletion with the expense alone, and the expense stays', async () => {
  const { brisbane } = await startWithLunch();

  await receiveEvents(
    brisbane,
    uploadedHere(deleted('expense', LUNCH, ahead()), LATER),
  );

  await expectCards(['Lunch']);
  await showSheet();

  await expectBlocks([
    [EXPENSE_CHANGE, CLOCK_TEXT, 'EXPENSE', 'Lunch', DISMISS],
  ]);
});
