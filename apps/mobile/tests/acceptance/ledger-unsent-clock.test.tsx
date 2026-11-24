import { waitFor } from '@testing-library/react-native';
import {
  addExpense,
  editExpense,
  inTreeOrder,
  restart,
} from './ledger-expense-app';
import {
  card,
  drawnTexts,
  linesIn,
  readOut,
  shownInOrder,
} from './ledger-expense-list-app';
import { leaveAndComeBack } from './ledger-list-period-app';
import {
  addGroupExpense,
  addToGroup,
  groupCard,
} from './ledger-group-expense-app';
import {
  deleteByAction,
  openTrash,
  restoreFromTrash,
  trashCard,
} from './ledger-trash-app';
import { showGroup } from './group-balances-app';
import { goBackFrom, textsOn } from './group-details-app';
import { openGroupInsights, openInsights } from './insights-app';
import { categoryCard, openCategory } from './insights-category-app';
import {
  goOffline,
  goOnline,
  mistakes,
  removeWorld,
  resetWorld,
} from './sharing-app';
import { iconNames, iconsIn } from './shell-actions-app';
import { tapTab } from './shell-tabs-app';
import {
  LATER,
  YOU,
  eachTestGetsAPhone,
  expenseTitled,
  groupId,
  renameGroupTo,
  unsent,
} from './sync-app';
import { DUPLICATE as POSSIBLE_DUPLICATE } from './sync-duplicate-app';
import {
  apiDropsThisPhone,
  holdAnswers,
  lunchCreated,
  otherPhoneUploads,
  otherStamp,
  releaseAnswers,
  setBuiltApiUrl,
  startEventApi,
  startSynced,
} from './sync-screens-app';
import {
  CLOCK_ICON,
  NOT_SENT,
  hasClock,
  startHolding,
} from './sync-status-app';

// Runs on iOS. Each test starts the whole app as the sync screen tests do (sync-screens-app):
// Taylor is your name, Brisbane is a shared ledger of Taylor, Casey and Blake, and the phone
// syncs with an event API a test can take offline or hold back. The tests save changes
// while nothing can be uploaded, and read the cards of the expenses those changes are of.

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

jest.mock(
  'expo-secure-store',
  () =>
    jest.requireActual<typeof import('./sharing-app')>('./sharing-app')
      .secureStore,
  { virtual: true },
);

jest.mock(
  'expo-crypto',
  () =>
    jest.requireActual<typeof import('./sharing-app')>('./sharing-app')
      .randomSource,
  { virtual: true },
);

jest.mock('../../src/sharing/api-address', () => ({
  apiUrl: () =>
    jest
      .requireActual<typeof import('./sync-screens-app')>('./sync-screens-app')
      .builtApiUrl(),
}));

eachTestGetsAPhone('ledger-unsent-clock-');

beforeEach(() => {
  resetWorld();
  startEventApi();
  startHolding();
});

afterEach(async () => {
  const wrong = mistakes();
  await removeWorld();
  expect(wrong).toEqual([]);
});

const WITH_TOKYO = { Brisbane: ['Casey', 'Blake'], Tokyo: ['Dana'] };

/** Adds Brisbane's Dinner for 100.01: Casey pays, split between Blake, Taylor and Casey. */
const addDinner = (title = 'Dinner') =>
  addGroupExpense({
    group: 'Brisbane',
    title,
    payer: 'Casey',
    sharers: ['Blake', YOU, 'Casey'],
  });

/** Waits until the phone has no unsent event left. */
const expectAllUploaded = () =>
  waitFor(async () => expect(await unsent()).toEqual([]));

/** Brisbane has Dinner, and its event is uploaded: its card on the expense list shows no clock. */
async function dinnerUploaded() {
  const app = await startSynced();
  await addDinner();
  await expectAllUploaded();
  await waitFor(() => expect(hasClock(card('Dinner'))).toBe(false));
  return app;
}

/** With no network, adds Dinner to Brisbane: its event stays unsent. */
async function dinnerUnsent() {
  const app = await startSynced();
  goOffline();
  await addDinner();
  expect(await unsent()).toHaveLength(1);
  return app;
}

test("[LEDGER-240.1] draws a clock after the title on the cards of an expense that is not uploaded, on the group's screen and on the expense list, and reads Not sent yet after the date", async () => {
  await dinnerUnsent();

  await showGroup('Brisbane');
  const onGroup = ['Dinner', '$100.01', 'Food & Dining', 'Paid by Casey'];
  await waitFor(() =>
    expect(hasClock(groupCard('Brisbane', 'Dinner'))).toBe(true),
  );
  expect(
    shownInOrder(linesIn(groupCard('Brisbane', 'Dinner')), onGroup),
  ).toEqual(onGroup);
  const readOnGroup = [...onGroup, 'Oct 30, 2026', NOT_SENT];
  expect(
    shownInOrder([readOut(groupCard('Brisbane', 'Dinner'))], readOnGroup),
  ).toEqual(readOnGroup);

  await tapTab('Expenses');
  const onList = ['Dinner', '$33.34', 'Food & Dining', 'Brisbane'];
  await waitFor(() => expect(hasClock(card('Dinner'))).toBe(true));
  expect(shownInOrder(linesIn(card('Dinner')), onList)).toEqual(onList);
  const readOnList = [...onList, 'Oct 30, 2026', NOT_SENT];
  expect(shownInOrder([readOut(card('Dinner'))], readOnList)).toEqual(
    readOnList,
  );
  // The words are read, not shown.
  expect(linesIn(card('Dinner'))).not.toContain(NOT_SENT);
});

test('[LEDGER-240.1] draws the clock symbol between the title and the amount, and reads no icon', async () => {
  await dinnerUnsent();
  await waitFor(() => expect(hasClock(card('Dinner'))).toBe(true));

  expect(iconNames(card('Dinner'), 'ios')).toEqual([CLOCK_ICON.ios]);
  expect(CLOCK_ICON.ios).toBe('clock');
  const [icon] = iconsIn(card('Dinner'), 'ios');
  expect(
    inTreeOrder(
      drawnTexts(card('Dinner'), 'Dinner')[0],
      icon.view,
      drawnTexts(card('Dinner'), '$33.34')[0],
    ),
  ).toBe(true);
  expect(readOut(card('Dinner'))).not.toContain('clock');
});

test('[LEDGER-240.1] takes the clock away once the upload is confirmed, on the screen that is open', async () => {
  await startSynced();
  await showGroup('Brisbane');
  holdAnswers('POST');

  await addDinner();
  await tapTab('Groups');

  await waitFor(() =>
    expect(hasClock(groupCard('Brisbane', 'Dinner'))).toBe(true),
  );
  expect(readOut(groupCard('Brisbane', 'Dinner'))).toContain(NOT_SENT);

  await releaseAnswers();
  await expectAllUploaded();

  await waitFor(() =>
    expect(hasClock(groupCard('Brisbane', 'Dinner'))).toBe(false),
  );
  expect(readOut(groupCard('Brisbane', 'Dinner'))).not.toContain(NOT_SENT);
});

test('[LEDGER-240.1] draws the clock again after a change to an uploaded expense that is not uploaded, and takes it away once it is', async () => {
  await dinnerUploaded();
  goOffline();

  await editExpense((await expenseTitled('Dinner')).id, { title: 'Supper' });

  await waitFor(() => expect(hasClock(card('Supper'))).toBe(true));

  goOnline();
  await leaveAndComeBack();
  await expectAllUploaded();

  await waitFor(() => expect(hasClock(card('Supper'))).toBe(false));
});

test('[LEDGER-240.1] draws the clock on the Trash card of an expense whose move to the trash is not uploaded, and on its card once it is restored', async () => {
  await dinnerUploaded();
  goOffline();

  await deleteByAction('Dinner');
  await openTrash();

  await waitFor(() => expect(hasClock(trashCard('Dinner'))).toBe(true));
  expect(readOut(trashCard('Dinner'))).toContain(NOT_SENT);

  await restoreFromTrash('Dinner');
  await tapTab('Expenses');

  await waitFor(() => expect(hasClock(card('Dinner'))).toBe(true));
});

test("[LEDGER-240.1] draws the clock on the cards of a category's expenses, opened from the group's Insights and from your own", async () => {
  await dinnerUnsent();
  const brisbane = await groupId('Brisbane');

  await openGroupInsights(brisbane);
  await openCategory('Food & Dining', 'Groups');

  await waitFor(() =>
    expect(hasClock(categoryCard('Food & Dining', 'Dinner', 'Groups'))).toBe(
      true,
    ),
  );
  expect(readOut(categoryCard('Food & Dining', 'Dinner', 'Groups'))).toContain(
    NOT_SENT,
  );

  await openInsights();
  await openCategory('Food & Dining');

  await waitFor(() =>
    expect(hasClock(categoryCard('Food & Dining', 'Dinner'))).toBe(true),
  );
  expect(readOut(categoryCard('Food & Dining', 'Dinner'))).toContain(NOT_SENT);
});

test('[LEDGER-240.1] reads Not sent yet after the date and before the mark of an expense that is also a possible duplicate', async () => {
  await dinnerUploaded();
  const brisbane = await groupId('Brisbane');
  // Another phone adds an expense of the same amount, currency and date, later than Dinner.
  const supper = await lunchCreated(otherStamp(LATER + 60_000));
  supper.units.title.value = 'Supper';
  supper.units.money.value.amountMinor = 10001;
  supper.units.money.value.payments[0].amountMinor = 10001;
  supper.units.money.value.shares[0].amountMinor = 5001;
  supper.units.money.value.shares[1].amountMinor = 5000;
  otherPhoneUploads(brisbane, supper);
  await leaveAndComeBack();
  await waitFor(() =>
    expect(linesIn(card('Supper'))).toContain(POSSIBLE_DUPLICATE),
  );
  expect(hasClock(card('Supper'))).toBe(false);
  goOffline();

  await editExpense((await expenseTitled('Supper')).id, { note: 'Late' });

  await waitFor(() => expect(hasClock(card('Supper'))).toBe(true));
  expect(linesIn(card('Supper'))).toContain(POSSIBLE_DUPLICATE);
  const read = ['Oct 30, 2026', NOT_SENT, POSSIBLE_DUPLICATE];
  expect(shownInOrder([readOut(card('Supper'))], read)).toEqual(read);
});

test('[LEDGER-240.1] draws no clock on an uploaded expense while changes to its group and members are not uploaded', async () => {
  await dinnerUploaded();
  goOffline();

  await renameGroupTo('Brisbane', 'Brissie');
  await addToGroup('Brissie', 'Dana');

  expect((await unsent()).length).toBeGreaterThanOrEqual(2);
  await showGroup('Brissie');
  await waitFor(() =>
    expect(linesIn(groupCard('Brissie', 'Dinner'))[0]).toBe('Dinner'),
  );
  expect(hasClock(groupCard('Brissie', 'Dinner'))).toBe(false);
  await tapTab('Expenses');
  await waitFor(() => expect(linesIn(card('Dinner'))).toContain('Brissie'));
  expect(hasClock(card('Dinner'))).toBe(false);
  expect(readOut(card('Dinner'))).not.toContain(NOT_SENT);
});

test('[LEDGER-240.1] draws no clock on a personal expense, nor on an expense of a group that is not shared', async () => {
  await startSynced(WITH_TOKYO);
  goOffline();

  await addExpense();
  await addGroupExpense({
    group: 'Tokyo',
    title: 'Sushi',
    payer: 'Dana',
    sharers: [YOU, 'Dana'],
  });

  await waitFor(() => expect(linesIn(card('Sushi'))[0]).toBe('Sushi'));
  for (const title of ['Coffee run', 'Sushi']) {
    expect(hasClock(card(title))).toBe(false);
    expect(iconNames(card(title), 'ios')).toEqual([]);
    expect(readOut(card(title))).not.toContain(NOT_SENT);
  }
  await showGroup('Tokyo');
  expect(hasClock(groupCard('Tokyo', 'Sushi'))).toBe(false);
});

test('[LEDGER-240.1] draws no clock in a build that names no API, where the event of a new expense stays unsent for good', async () => {
  await startSynced();
  setBuiltApiUrl(undefined);

  await addDinner();

  expect(await unsent()).toHaveLength(1);
  await waitFor(() => expect(linesIn(card('Dinner'))[0]).toBe('Dinner'));
  expect(hasClock(card('Dinner'))).toBe(false);
  expect(readOut(card('Dinner'))).not.toContain(NOT_SENT);
  await showGroup('Brisbane');
  expect(hasClock(groupCard('Brisbane', 'Dinner'))).toBe(false);
});

test('[LEDGER-240.1] draws no clock on an expense of a read-only copy: its banner counts the change that was never sent', async () => {
  await startSynced();
  const brisbane = await groupId('Brisbane');
  goOffline();
  await addDinner('Lunch');
  await waitFor(() => expect(hasClock(card('Lunch'))).toBe(true));
  goOnline();
  apiDropsThisPhone(brisbane);

  await leaveAndComeBack();
  await showGroup('Brisbane');

  await waitFor(() =>
    expect(textsOn('Brisbane')).toContain(
      '1 change made on this phone was never sent to the group.',
    ),
  );
  expect(hasClock(groupCard('Brisbane', 'Lunch'))).toBe(false);
  await goBackFrom('Brisbane');
  await tapTab('Expenses');
  expect(hasClock(card('Lunch'))).toBe(false);
  expect(readOut(card('Lunch'))).not.toContain(NOT_SENT);
});

test("[LEDGER-240.1] still draws the clock after a restart, on the expense list and on the group's screen", async () => {
  const app = await dinnerUnsent();

  await restart(app);

  await waitFor(() => expect(hasClock(card('Dinner'))).toBe(true));
  await showGroup('Brisbane');
  await waitFor(() =>
    expect(hasClock(groupCard('Brisbane', 'Dinner'))).toBe(true),
  );
});
