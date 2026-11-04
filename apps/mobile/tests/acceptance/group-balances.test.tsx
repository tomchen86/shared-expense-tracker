import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ActionSheetIOS } from 'react-native';
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react-native';
import {
  expectForm,
  expectFormClosed,
  fillForm,
  nameOf,
  phoneDatabase,
  press,
  resetPhone,
  setRegionCurrency,
  watchAlerts,
} from './ledger-expense-app';
import {
  asRead,
  linesIn,
  shownInOrder,
  startExpensesAt,
} from './ledger-expense-list-app';
import { allowWrites, settle } from './shell-appearance-app';
import {
  navigationBarTitles,
  selectedTab,
  tab,
  tapTab,
} from './shell-tabs-app';
import {
  NO_EXPENSES,
  barItems,
  expectClosed,
  goBackFrom,
  refusesSwipeDown,
  screenOf,
  swipeDown,
} from './group-details-app';
import { openArchivedGroup, openArchivedGroups } from './group-archive-app';
import {
  addGroupExpense,
  addToGroup,
  archiveGroup,
  deleteFromGroup,
  editOn,
  expectDetailsOn,
  groupCard,
  groupCardTitles,
  groupLines,
  removeFromGroup,
  renameInGroup,
  startWithGroups,
} from './ledger-group-expense-app';
import { pressUndo, restoreFromTrash } from './ledger-trash-app';
import {
  NO_SPENDING,
  balanceButtons,
  balanceLines,
  balancesLines,
  closeBalances,
  groupRootCard,
  groupRootCardLines,
  groupTotals,
  openBalances,
  readAfterName,
  showGroup,
} from './group-balances-app';
import type { Database, SqlValue } from '../../src/storage';

// Runs on iOS; group-balances-android.test.tsx checks the Android back button. Each
// test starts the app as the group expense tests do: its own phone database file,
// in Taipei on 2026-10-30, in a region whose currency is USD unless a test adds an
// expense in another currency, with Taylor saved as your name. Its reads go through
// a gate the test can hold and let through one read at a time, as a slow disk would.
// It adds group expenses through New Expense and reads the group's amounts on the
// group's screen, in Balances and on the group's card on the Groups root.

let mockOpen: () => Promise<Database>;

jest.mock('../../src/storage/expo', () => ({
  openPhoneDatabase: () => mockOpen(),
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

/** Brisbane, with Casey and Blake added after you. */
const BRISBANE = { Brisbane: ['Casey', 'Blake'] };

/** The ways iOS presents a screen as a sheet that rises from the bottom. */
const SHEETS = ['formSheet', 'pageSheet', 'modal'];

let directory: string;
let file: string;

// The read gate, as in group-expenses.test.tsx: open, or holding every read outside
// a transaction until the test lets them through, all at once or one at a time.

let readsHeld = false;
const heldReads: (() => void)[] = [];

function gatedDatabase(path: string): Database {
  const database = phoneDatabase(path);
  return {
    ...database,
    all: async <T,>(sql: string, parameters?: readonly SqlValue[]) => {
      if (readsHeld)
        await new Promise<void>((resolve) => heldReads.push(resolve));
      return database.all<T>(sql, parameters);
    },
  };
}

function openReads() {
  readsHeld = false;
  for (const release of heldReads.splice(0)) release();
}

/** Lets the oldest held read through, if one waits, and what it starts finish. */
async function letOneReadThrough() {
  const release = heldReads.shift();
  await act(async () => release?.());
  await settle();
}

beforeEach(() => {
  jest.clearAllMocks();
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'group-balances-'));
  file = path.join(directory, 'app.db');
  mockOpen = async () => gatedDatabase(file);
  allowWrites();
  openReads();
  resetPhone();
  watchAlerts();
  jest
    .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
    .mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
  fs.rmSync(directory, { recursive: true, force: true });
});

/**
 * Adds a Brisbane expense through New Expense in a region whose currency is
 * `currency`: `title` for `amount`, paid by `payer`, split between `sharers` in
 * that order, as Who Paid? and Split Between name them.
 */
async function addToBrisbane(
  title: string,
  amount: string,
  payer: string,
  sharers: string[],
  currency = 'USD',
) {
  setRegionCurrency(currency);
  await addGroupExpense({ group: 'Brisbane', title, amount, payer, sharers });
  setRegionCurrency('USD');
}

const YOU = 'Taylor (You)';
const EVERYONE = [YOU, 'Casey', 'Blake'];

/** Taylor pays for Dinner, 100.01 split between all three; Casey pays for Taxi, 25.00 for Blake alone. */
async function addDinnerAndTaxi() {
  await addToBrisbane('Dinner', '100.01', YOU, EVERYONE);
  await addToBrisbane('Taxi', '25.00', 'Casey', ['Blake']);
}

/** Taylor pays for Dinner, 60.00 split between all three; Taxi, 20.00 between Casey and Blake; and Tickets, 20.00 for Blake alone. */
async function addTaylorsThree() {
  await addToBrisbane('Dinner', '60.00', YOU, EVERYONE);
  await addToBrisbane('Taxi', '20.00', YOU, ['Casey', 'Blake']);
  await addToBrisbane('Tickets', '20.00', YOU, ['Blake']);
}

/** Balances for addTaylorsThree: nets of +80.00, -30.00 and -50.00, which sum to 0. */
const USD_ROWS = [
  YOU,
  'Is Owed $80.00',
  'Paid $100.00 · Share $20.00',
  'Casey',
  'Owes $30.00',
  'Paid $0.00 · Share $30.00',
  'Blake',
  'Owes $50.00',
  'Paid $0.00 · Share $50.00',
];

/** Balances for Casey's Sushi, 3000 JPY split between Taylor and Casey, with Blake still a member. */
const JPY_ROWS = [
  YOU,
  'Owes ¥1,500',
  'Paid ¥0 · Share ¥1,500',
  'Casey',
  'Is Owed ¥1,500',
  'Paid ¥3,000 · Share ¥1,500',
  'Blake',
  'Settled up',
  'Paid ¥0 · Share ¥0',
];

const addSushi = (payer = 'Casey') =>
  addToBrisbane('Sushi', '3000', payer, [YOU, 'Casey'], 'JPY');

// The Group Total

test('[GROUPS-68.1] shows the Group Total of one currency above the cards, counting every expense of the group', async () => {
  await startWithGroups(BRISBANE);
  await addDinnerAndTaxi();

  await showGroup('Brisbane');

  await waitFor(() =>
    expect(groupTotals('Brisbane')).toEqual(['Group Total: $125.01']),
  );
  const expected = ['Group Total: $125.01', 'Taxi', 'Dinner'];
  expect(shownInOrder(groupLines('Brisbane'), expected)).toEqual(expected);
});

test('[GROUPS-68.1] shows a Group Total line for each currency, sorted by currency code', async () => {
  await startWithGroups(BRISBANE);
  // The JPY expense comes first, so the cards, newest first, put USD first.
  await addSushi();
  await addDinnerAndTaxi();

  await showGroup('Brisbane');

  await waitFor(() =>
    expect(groupTotals('Brisbane')).toEqual([
      'Group Total: ¥3,000',
      'Group Total: $125.01',
    ]),
  );
});

test("[GROUPS-68.1] shows the Group Total that counts an expense's new amount", async () => {
  await startWithGroups(BRISBANE);
  await addDinnerAndTaxi();
  await showGroup('Brisbane');
  await fireEvent.press(groupCard('Brisbane', 'Dinner'));
  await expectDetailsOn('Groups', 'Dinner');
  await editOn('Groups')!.press();
  await expectForm('Edit Expense');
  await fillForm({ amount: '90.00' });
  await press('Save');
  await expectFormClosed();

  await goBackFrom('Expense');

  await waitFor(() =>
    expect(groupTotals('Brisbane')).toEqual(['Group Total: $115.00']),
  );
});

test('[GROUPS-68.1] shows the Group Total as text that does nothing when pressed', async () => {
  await startWithGroups(BRISBANE);
  await addToBrisbane('Taxi', '25.00', 'Casey', ['Blake']);
  await showGroup('Brisbane');
  await waitFor(() =>
    expect(groupTotals('Brisbane')).toEqual(['Group Total: $25.00']),
  );

  const buttons = within(screenOf('Brisbane')).queryAllByRole('button');
  expect(
    buttons.filter((button) =>
      linesIn(button).some((line) => line.startsWith('Group Total')),
    ),
  ).toEqual([]);
  await fireEvent.press(
    within(screenOf('Brisbane')).getByText('Group Total: $25.00'),
  );
  await settle();
  expect(navigationBarTitles(tab('Groups'))).toEqual(['Groups', 'Brisbane']);
});

test('[GROUPS-68.1] shows no Group Total on a group without expenses', async () => {
  await startWithGroups(BRISBANE);

  await showGroup('Brisbane');

  await waitFor(() => expect(groupLines('Brisbane')).toContain(NO_EXPENSES));
  expect(groupTotals('Brisbane')).toEqual([]);
});

test("[GROUPS-68.1] shows an archived group's Group Total below Restore Group and above the cards", async () => {
  await startWithGroups(BRISBANE);
  await addDinnerAndTaxi();
  await archiveGroup('Brisbane');
  await openArchivedGroups();

  await openArchivedGroup('Brisbane');

  const expected = ['Restore Group', 'Group Total: $125.01', 'Taxi', 'Dinner'];
  await waitFor(() =>
    expect(shownInOrder(groupLines('Brisbane'), expected)).toEqual(expected),
  );
});

// Your net balance on the group's screen

/** Taylor pays for Dinner, 60.00 split between all three, and is owed 40.00. */
const addTaylorsDinner = () => addToBrisbane('Dinner', '60.00', YOU, EVERYONE);

test('[GROUPS-69.1] shows what you are owed below the Group Total, as one button above the cards', async () => {
  await startWithGroups(BRISBANE);
  await addTaylorsDinner();
  await addToBrisbane('Taxi', '25.00', 'Casey', ['Blake']);

  await showGroup('Brisbane');

  await waitFor(() =>
    expect(balanceLines('Brisbane')).toEqual(["You're owed: $40.00"]),
  );
  const expected = ['Group Total: $85.00', "You're owed: $40.00", 'Taxi'];
  expect(shownInOrder(groupLines('Brisbane'), expected)).toEqual(expected);
  const buttons = balanceButtons('Brisbane');
  expect(buttons).toHaveLength(1);
  expect(within(buttons[0]).getByText('›')).toBeOnTheScreen();
  expect(asRead(nameOf(buttons[0]))).toBe("You're owed: $40.00");
  expect(buttons[0].props.accessibilityHint).toBe('Opens Balances');
});

test('[GROUPS-69.1] says what you owe when someone else paid', async () => {
  await startWithGroups(BRISBANE);
  await addToBrisbane('Dinner', '60.00', 'Casey', EVERYONE);

  await showGroup('Brisbane');

  await waitFor(() =>
    expect(balanceLines('Brisbane')).toEqual(['You owe: $20.00']),
  );
});

test('[GROUPS-69.1] says Settled up when your share is what you paid', async () => {
  await startWithGroups(BRISBANE);
  await addToBrisbane('Coffee', '20.00', YOU, [YOU]);

  await showGroup('Brisbane');

  await waitFor(() => expect(balanceLines('Brisbane')).toEqual(['Settled up']));
});

test('[GROUPS-69.1] says Settled up when the group has only expenses you have no part in', async () => {
  await startWithGroups(BRISBANE);
  await addToBrisbane('Taxi', '25.00', 'Casey', ['Blake']);

  await showGroup('Brisbane');

  await waitFor(() => expect(balanceLines('Brisbane')).toEqual(['Settled up']));
});

test('[GROUPS-69.1] puts a line for each currency in which you are owed or owe, sorted by currency code, in one button', async () => {
  await startWithGroups(BRISBANE);
  // The JPY expense comes first, so the cards, newest first, put USD first.
  await addSushi();
  await addTaylorsDinner();

  await showGroup('Brisbane');

  const expected = ['You owe: ¥1,500', "You're owed: $40.00"];
  await waitFor(() => expect(balanceLines('Brisbane')).toEqual(expected));
  const buttons = balanceButtons('Brisbane');
  expect(buttons).toHaveLength(1);
  expect(linesIn(buttons[0]).filter((line) => line !== '›')).toEqual(expected);
  expect(within(buttons[0]).getAllByText('›')).toHaveLength(1);
});

test('[GROUPS-69.1] leaves out a currency in which you are settled up', async () => {
  await startWithGroups(BRISBANE);
  await addSushi();
  await addToBrisbane('Coffee', '20.00', YOU, [YOU]);

  await showGroup('Brisbane');

  await waitFor(() => expect(groupTotals('Brisbane')).toHaveLength(2));
  expect(balanceLines('Brisbane')).toEqual(['You owe: ¥1,500']);
});

test('[GROUPS-69.1] shows no balance on a group without expenses', async () => {
  await startWithGroups(BRISBANE);

  await showGroup('Brisbane');

  await waitFor(() => expect(groupLines('Brisbane')).toContain(NO_EXPENSES));
  expect(balanceLines('Brisbane')).toEqual([]);
  expect(balanceButtons('Brisbane')).toEqual([]);
});

test("[GROUPS-69.1] [GROUPS-70.1] opens Balances rising from the bottom over the group's screen, with only Close, when your balance is pressed, also when you paid nothing", async () => {
  await startWithGroups(BRISBANE);
  await addToBrisbane('Dinner', '60.00', 'Casey', EVERYONE);
  await showGroup('Brisbane');
  await waitFor(() => expect(balanceButtons('Brisbane')).toHaveLength(1));

  await openBalances('Brisbane');

  expect(SHEETS).toContain(screenOf('Balances').props.stackPresentation);
  expect(navigationBarTitles(tab('Groups'))).toEqual([
    'Groups',
    'Brisbane',
    'Balances',
  ]);
  expect(selectedTab()).toBe('Groups');
  expect(barItems('Balances')).toEqual({ left: ['Close (plain)'], right: [] });
});

// Opening and closing Balances

test("[GROUPS-70.1] closes Balances with Close, back on the group's screen", async () => {
  await startWithGroups(BRISBANE);
  await addTaylorsThree();
  await showGroup('Brisbane');
  await openBalances('Brisbane');

  await closeBalances();

  expect(navigationBarTitles(tab('Groups'))).toEqual(['Groups', 'Brisbane']);
});

test("[GROUPS-70.1] lets Balances be swiped down, back on the group's screen", async () => {
  await startWithGroups(BRISBANE);
  await addTaylorsThree();
  await showGroup('Brisbane');
  await openBalances('Brisbane');
  expect(refusesSwipeDown(screenOf('Balances'))).toBe(false);

  await swipeDown('Balances');

  await expectClosed('Balances');
  expect(navigationBarTitles(tab('Groups'))).toEqual(['Groups', 'Brisbane']);
});

test("[GROUPS-70.1] opens an archived group's Balances over its screen on the Settings tab", async () => {
  await startWithGroups(BRISBANE);
  await addTaylorsThree();
  await archiveGroup('Brisbane');
  await openArchivedGroups();
  await openArchivedGroup('Brisbane');

  await openBalances('Brisbane');

  expect(selectedTab()).toBe('Settings');
  expect(navigationBarTitles(tab('Settings'))).toEqual([
    'Settings',
    'Archived Groups',
    'Brisbane',
    'Balances',
  ]);
  await waitFor(() => expect(balancesLines()).toEqual(USD_ROWS));
});

// What Balances lists

test("[GROUPS-71.1] lists each member's net, what they paid and their share, the nets summing to 0", async () => {
  await startWithGroups(BRISBANE);
  await addTaylorsThree();
  await showGroup('Brisbane');

  await openBalances('Brisbane');

  await waitFor(() => expect(balancesLines()).toEqual(USD_ROWS));
});

test('[GROUPS-71.1] lists the rows of each currency, sorted by currency code, with every member in each', async () => {
  await startWithGroups(BRISBANE);
  await addSushi();
  await addTaylorsThree();
  await showGroup('Brisbane');

  await openBalances('Brisbane');

  await waitFor(() =>
    expect(balancesLines()).toEqual(['JPY', ...JPY_ROWS, 'USD', ...USD_ROWS]),
  );
});

test("[GROUPS-71.1] keeps a former member's rows only in the currencies of the expenses they took part in", async () => {
  await startWithGroups(BRISBANE);
  await addTaylorsThree();
  await addSushi();
  await removeFromGroup('Brisbane', 'Blake');
  await showGroup('Brisbane');

  await openBalances('Brisbane');

  await waitFor(() =>
    expect(balancesLines()).toEqual([
      'JPY',
      ...JPY_ROWS.slice(0, 6),
      'USD',
      ...USD_ROWS,
    ]),
  );
});

test('[GROUPS-71.1] lists former members after the members, in the order they were removed', async () => {
  await startWithGroups(BRISBANE);
  await addTaylorsThree();
  // Removed in the other order from the one they joined in, so a list in the
  // order they joined fails.
  await removeFromGroup('Brisbane', 'Blake');
  await removeFromGroup('Brisbane', 'Casey');
  await showGroup('Brisbane');

  await openBalances('Brisbane');

  await waitFor(() =>
    expect(balancesLines()).toEqual([
      ...USD_ROWS.slice(0, 3),
      ...USD_ROWS.slice(6),
      ...USD_ROWS.slice(3, 6),
    ]),
  );
});

test('[GROUPS-71.1] lists a member who joined after the expenses as Settled up, and leaves them out once removed', async () => {
  await startWithGroups(BRISBANE);
  await addTaylorsThree();
  await addToGroup('Brisbane', 'Riley');
  await showGroup('Brisbane');

  await openBalances('Brisbane');

  await waitFor(() =>
    expect(balancesLines()).toEqual([
      ...USD_ROWS,
      'Riley',
      'Settled up',
      'Paid $0.00 · Share $0.00',
    ]),
  );
  await closeBalances();
  await goBackFrom('Brisbane');
  await removeFromGroup('Brisbane', 'Riley');
  await showGroup('Brisbane');
  await openBalances('Brisbane');
  await waitFor(() => expect(balancesLines()).toEqual(USD_ROWS));
});

test("[GROUPS-71.1] shows a member's current name", async () => {
  await startWithGroups(BRISBANE);
  await addTaylorsThree();
  await renameInGroup('Brisbane', 'Casey', 'Cass');
  await showGroup('Brisbane');

  await openBalances('Brisbane');

  await waitFor(() =>
    expect(balancesLines()).toEqual(
      USD_ROWS.map((line) => (line === 'Casey' ? 'Cass' : line)),
    ),
  );
});

test('[GROUPS-71.1] leaves out a former member who is only in expenses in the trash, and lists them again once the expense is back', async () => {
  await startWithGroups(BRISBANE);
  await addToBrisbane('Dinner', '60.00', YOU, [YOU, 'Casey']);
  await addToBrisbane('Taxi', '25.00', 'Casey', ['Blake']);
  await removeFromGroup('Brisbane', 'Blake');
  await showGroup('Brisbane');
  await deleteFromGroup('Brisbane', 'Taxi');

  await openBalances('Brisbane');

  await waitFor(() =>
    expect(balancesLines()).toEqual([
      YOU,
      'Is Owed $30.00',
      'Paid $60.00 · Share $30.00',
      'Casey',
      'Owes $30.00',
      'Paid $0.00 · Share $30.00',
    ]),
  );
  await closeBalances();
  await pressUndo('Taxi');
  await openBalances('Brisbane');
  await waitFor(() =>
    expect(balancesLines().slice(-3)).toEqual([
      'Blake',
      'Owes $25.00',
      'Paid $0.00 · Share $25.00',
    ]),
  );
});

// The member count on the group's card

test("[GROUPS-72.1] shows 1 member under the name on a new group's card", async () => {
  await startWithGroups({ Brisbane: [] });

  await tapTab('Groups');

  await waitFor(() =>
    expect(groupRootCardLines('Brisbane').slice(0, 2)).toEqual([
      'Brisbane',
      '1 member',
    ]),
  );
});

test("[GROUPS-72.1] counts the group's members on its card, but not former members", async () => {
  await startWithGroups(BRISBANE);
  await tapTab('Groups');
  await waitFor(() =>
    expect(groupRootCardLines('Brisbane')).toContain('3 members'),
  );

  await removeFromGroup('Brisbane', 'Blake');
  await waitFor(() =>
    expect(groupRootCardLines('Brisbane')).toContain('2 members'),
  );

  await addToGroup('Brisbane', 'Blake');
  await waitFor(() =>
    expect(groupRootCardLines('Brisbane')).toContain('3 members'),
  );
});

// Your share and net on the group's card

/** Taylor pays for Groceries, 120.00 AUD for Taylor and Casey; Casey pays for Tickets, 60.00 USD for all three. */
async function addGroceriesAndTickets() {
  await addToBrisbane('Groceries', '120.00', YOU, [YOU, 'Casey'], 'AUD');
  await addToBrisbane('Tickets', '60.00', 'Casey', EVERYONE);
}

const CARD_AMOUNTS = [
  'Your share: A$60.00',
  "You're owed: A$60.00",
  'Your share: $20.00',
  'You owe: $20.00',
];

test("[GROUPS-73.1] shows your share and net for each currency on the group's card, sorted by currency code", async () => {
  await startWithGroups(BRISBANE);
  await addGroceriesAndTickets();

  await tapTab('Groups');

  await waitFor(() =>
    expect(groupRootCardLines('Brisbane')).toEqual([
      'Brisbane',
      '3 members',
      ...CARD_AMOUNTS,
    ]),
  );
});

test('[GROUPS-73.1] says Settled up on the card when your share is what you paid', async () => {
  await startWithGroups(BRISBANE);
  await addToBrisbane('Coffee', '20.00', YOU, [YOU]);

  await tapTab('Groups');

  await waitFor(() =>
    expect(groupRootCardLines('Brisbane').slice(2)).toEqual([
      'Your share: $20.00',
      'Settled up',
    ]),
  );
});

test('[GROUPS-73.1] shows a share of $0.00 and Settled up on the card for expenses you have no part in', async () => {
  await startWithGroups(BRISBANE);
  await addToBrisbane('Taxi', '25.00', 'Casey', ['Blake']);

  await tapTab('Groups');

  await waitFor(() =>
    expect(groupRootCardLines('Brisbane').slice(2)).toEqual([
      'Your share: $0.00',
      'Settled up',
    ]),
  );
});

test('[GROUPS-73.1] shows No spending yet on the card of a group without expenses', async () => {
  await startWithGroups({ Brisbane: [] });

  await tapTab('Groups');

  await waitFor(() =>
    expect(groupRootCardLines('Brisbane')).toEqual([
      'Brisbane',
      '1 member',
      NO_SPENDING,
    ]),
  );
});

test('[GROUPS-73.1] reads the card by its name, Open <group>, then its member count and amounts', async () => {
  await startWithGroups(BRISBANE);
  await addGroceriesAndTickets();

  await tapTab('Groups');

  await waitFor(() =>
    expect(groupRootCardLines('Brisbane')).toContain('You owe: $20.00'),
  );
  const shown = groupRootCard('Brisbane');
  expect(nameOf(shown)).toBe('Open Brisbane');
  const expected = ['3 members', ...CARD_AMOUNTS];
  expect(shownInOrder([readAfterName(shown)], expected)).toEqual(expected);
});

test('[GROUPS-73.1] counts an expense added on the Expenses tab once the Groups tab is selected again', async () => {
  await startWithGroups(BRISBANE);
  await tapTab('Groups');
  await waitFor(() =>
    expect(groupRootCardLines('Brisbane')).toContain(NO_SPENDING),
  );

  await addToBrisbane('Taxi', '25.00', 'Casey', [YOU]);
  await tapTab('Groups');

  await waitFor(() =>
    expect(groupRootCardLines('Brisbane').slice(2)).toEqual([
      'Your share: $25.00',
      'You owe: $25.00',
    ]),
  );
});

test('[GROUPS-74.1] never shows No spending yet while the Groups root reads the expenses, one read at a time', async () => {
  const first = await startWithGroups(BRISBANE);
  await addToBrisbane('Dinner', '100.01', 'Casey', ['Blake', YOU, 'Casey']);
  await first.unmount();
  await settle();
  readsHeld = true;

  await startExpensesAt('/groups');

  for (let read = 0; read < 80; read += 1) {
    expect(screen.queryByText(NO_SPENDING)).toBeNull();
    if (screen.queryAllByText(/^Your share: /).length > 0) break;
    await letOneReadThrough();
  }
  openReads();
  await waitFor(() =>
    expect(groupRootCardLines('Brisbane')).toContain('Your share: $33.34'),
  );
  expect(screen.queryByText(NO_SPENDING)).toBeNull();
});

// The trash

/** Taylor pays for Dinner, 60.00, and Casey for Taxi, 30.00, both split between all three. */
async function addSharedDinnerAndTaxi() {
  await addToBrisbane('Dinner', '60.00', YOU, EVERYONE);
  await addToBrisbane('Taxi', '30.00', 'Casey', EVERYONE);
}

test("[GROUPS-61.2] leaves an expense in the trash off the group's screen", async () => {
  await startWithGroups(BRISBANE);
  await addSharedDinnerAndTaxi();
  await showGroup('Brisbane');
  await waitFor(() =>
    expect(groupCardTitles('Brisbane')).toEqual(['Taxi', 'Dinner']),
  );

  await deleteFromGroup('Brisbane', 'Taxi');

  await waitFor(() => expect(groupCardTitles('Brisbane')).toEqual(['Dinner']));
});

test("[GROUPS-75.1] leaves an expense in the trash out of the group's amounts", async () => {
  await startWithGroups(BRISBANE);
  await addSharedDinnerAndTaxi();
  await showGroup('Brisbane');
  await waitFor(() =>
    expect(groupTotals('Brisbane')).toEqual(['Group Total: $90.00']),
  );

  await deleteFromGroup('Brisbane', 'Dinner');

  await waitFor(() =>
    expect(groupTotals('Brisbane')).toEqual(['Group Total: $30.00']),
  );
  expect(balanceLines('Brisbane')).toEqual(['You owe: $10.00']);
  await openBalances('Brisbane');
  await waitFor(() =>
    expect(balancesLines()).toEqual([
      YOU,
      'Owes $10.00',
      'Paid $0.00 · Share $10.00',
      'Casey',
      'Is Owed $20.00',
      'Paid $30.00 · Share $10.00',
      'Blake',
      'Owes $10.00',
      'Paid $0.00 · Share $10.00',
    ]),
  );
  await closeBalances();
  await goBackFrom('Brisbane');
  await waitFor(() =>
    expect(groupRootCardLines('Brisbane').slice(2)).toEqual([
      'Your share: $10.00',
      'You owe: $10.00',
    ]),
  );
});

test('[GROUPS-75.1] counts the expense again once Undo puts it back', async () => {
  await startWithGroups(BRISBANE);
  await addSharedDinnerAndTaxi();
  await showGroup('Brisbane');
  await waitFor(() =>
    expect(groupTotals('Brisbane')).toEqual(['Group Total: $90.00']),
  );
  await deleteFromGroup('Brisbane', 'Dinner');
  await waitFor(() =>
    expect(groupTotals('Brisbane')).toEqual(['Group Total: $30.00']),
  );

  await pressUndo('Dinner');

  await waitFor(() =>
    expect(groupTotals('Brisbane')).toEqual(['Group Total: $90.00']),
  );
  expect(balanceLines('Brisbane')).toEqual(["You're owed: $30.00"]);
  await goBackFrom('Brisbane');
  await waitFor(() =>
    expect(groupRootCardLines('Brisbane').slice(2)).toEqual([
      'Your share: $30.00',
      "You're owed: $30.00",
    ]),
  );
});

test('[GROUPS-75.1] counts the expense again once it is restored from Trash', async () => {
  await startWithGroups(BRISBANE);
  await addSharedDinnerAndTaxi();
  await showGroup('Brisbane');
  await waitFor(() =>
    expect(groupTotals('Brisbane')).toEqual(['Group Total: $90.00']),
  );
  await deleteFromGroup('Brisbane', 'Dinner');

  await restoreFromTrash('Dinner');
  await showGroup('Brisbane');

  await waitFor(() =>
    expect(groupTotals('Brisbane')).toEqual(['Group Total: $90.00']),
  );
  expect(balanceLines('Brisbane')).toEqual(["You're owed: $30.00"]);
});

test('[GROUPS-75.1] [GROUPS-20.2] shows no amounts once every expense of the group is in the trash', async () => {
  await startWithGroups(BRISBANE);
  await addSharedDinnerAndTaxi();
  await showGroup('Brisbane');
  await waitFor(() =>
    expect(groupCardTitles('Brisbane')).toEqual(['Taxi', 'Dinner']),
  );

  await deleteFromGroup('Brisbane', 'Dinner');
  await deleteFromGroup('Brisbane', 'Taxi');

  await waitFor(() => expect(groupLines('Brisbane')).toContain(NO_EXPENSES));
  expect(groupCardTitles('Brisbane')).toEqual([]);
  expect(groupTotals('Brisbane')).toEqual([]);
  expect(balanceLines('Brisbane')).toEqual([]);
  await goBackFrom('Brisbane');
  await waitFor(() =>
    expect(groupRootCardLines('Brisbane')).toEqual([
      'Brisbane',
      '3 members',
      NO_SPENDING,
    ]),
  );
});
