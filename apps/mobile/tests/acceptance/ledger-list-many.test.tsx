import {
  newPhone,
  removePhones,
  resetPhones,
  startOn,
  writeData,
} from './backup-app';
import { balanceLines, groupTotals } from './group-balances-app';
import { openGroup } from './group-details-app';
import { resetPhone } from './ledger-expense-app';
import { cardTitles, listTotal } from './ledger-expense-list-app';
import { groupCardTitles } from './ledger-group-expense-app';
import { choosePeriod } from './ledger-list-period-app';
import {
  fakePhoneAppearance,
  fakeReduceTransparency,
} from './shell-appearance-app';
import { tapTab } from './shell-tabs-app';

// Runs on iOS. Each test starts the app on a phone that already holds 300 expenses, written as
// the screens would write them (backup-app), in Taipei on 2026-11-18, in a region whose
// currency is USD. Jest has no screen, so "on and near the screen" is checked as fewer cards
// than expenses, in order from the top.

jest.mock('../../src/storage/expo', () => ({
  openPhoneDatabase: () =>
    jest
      .requireActual<typeof import('./backup-app')>('./backup-app')
      .openPhoneDatabase(),
}));

jest.mock(
  '../../src/storage/expo-files',
  () =>
    jest.requireActual<typeof import('./backup-app')>('./backup-app')
      .phoneFiles,
);

// Not virtual, as in the expense form tests.
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

beforeEach(() => {
  jest.clearAllMocks();
  resetPhones();
  resetPhone();
  fakePhoneAppearance('light');
  fakeReduceTransparency(false);
});

afterEach(async () => {
  jest.restoreAllMocks();
  await removePhones();
});

const COUNT = 300;

/** Expense 1 to Expense 300 of $1.00 each, dated today, in the order they are added. */
const manyExpenses = (group?: string) =>
  Array.from({ length: COUNT }, (_, index) => ({
    title: `Expense ${index + 1}`,
    amount: '1',
    date: '2026-11-18',
    group,
  }));

/** The titles a list of all 300 shows from the top: the one added last first (LEDGER-28.1). */
const FROM_THE_TOP = Array.from(
  { length: COUNT },
  (_, index) => `Expense ${COUNT - index}`,
);

/** Fewer cards than expenses are drawn, and they are the first ones from the top. */
function expectOnlyTheFirstCards(titles: string[]) {
  expect(titles.length).toBeGreaterThan(0);
  expect(titles.length).toBeLessThan(COUNT);
  expect(titles).toEqual(FROM_THE_TOP.slice(0, titles.length));
}

test('[LEDGER-118.1] draws only the first cards of a month of 300 expenses and of All Time, and counts them all', async () => {
  const phone = newPhone();
  await writeData(phone, { expenses: manyExpenses() });
  await startOn(phone, { url: '/' });

  expectOnlyTheFirstCards(cardTitles());
  expect(listTotal()).toEqual(['$300.00']);

  await choosePeriod('Expenses', 'All Time');

  expectOnlyTheFirstCards(cardTitles());
  expect(listTotal()).toEqual(['300 expenses']);
});

test("[LEDGER-118.1] draws only the first cards of a group's 300 expenses, and counts them all in its total and your net balance", async () => {
  const phone = newPhone();
  await writeData(phone, {
    name: 'Taylor',
    groups: [{ name: 'Brisbane', members: ['Casey'] }],
    expenses: manyExpenses('Brisbane'),
  });
  await startOn(phone, { url: '/' });
  await tapTab('Groups');
  await openGroup('Brisbane');

  expectOnlyTheFirstCards(groupCardTitles('Brisbane'));
  expect(groupTotals('Brisbane')).toEqual(['Group Total: $300.00']);
  expect(balanceLines('Brisbane')).toEqual(["You're owed: $150.00"]);
});
