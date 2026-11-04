import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Alert } from 'react-native';
import { fireEvent, waitFor, within } from '@testing-library/react-native';
import {
  addExpense,
  inTreeOrder,
  nameOf,
  pressBack,
  resetPhone,
} from './ledger-expense-app';
import {
  allowReads,
  linesIn,
  phoneDatabaseWithReads,
  startExpensesAt,
} from './ledger-expense-list-app';
import {
  aggregationOptions,
  chartButton,
  chartKinds,
  chartViews,
  checkedAggregation,
  chooseAggregation,
  expectPeriod,
  insightsLines,
  insightsScreen,
  nextButton,
  openInsights,
  periodButton,
  pickerButtonLines,
  pickerButtons,
  pickerLines,
  pickerSelected,
  pickerTitle,
  pressBackOnPicker,
  pressInPicker,
  pressPeriod,
  pressPrevious,
  previousButton,
  selectedPeriod,
  totalCards,
} from './insights-app';
import {
  alertsShown,
  lastAlertButtons,
  lastAlertCancelable,
  pressAlertButton,
} from './group-details-app';
import { iconNames, ripplesOn } from './shell-actions-app';
import { allowWrites, settle } from './shell-appearance-app';
import { navigationBarTitles, selectedTab, tab } from './shell-tabs-app';
import type { Database } from '../../src/storage';

// Runs on Android only (apps/mobile/jest.config.cjs). insights.test.tsx checks
// Insights' rules on iOS; this file checks what Android shows differently: the
// chart menu's dialog, the Month and Year buttons, which only Android draws with
// React Native, and the period picker dialog.

let mockOpen: () => Promise<Database>;

jest.mock('../../src/storage/expo', () => ({
  openPhoneDatabase: () => mockOpen(),
}));

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

// Material Symbols drawn as images come from the symbol font on the phone. Here
// each image is named after its symbol instead, as in the tab bar's tests.
jest.mock('expo-symbols', () => ({
  ...jest.requireActual('expo-symbols'),
  unstable_getMaterialSymbolSourceAsync: async (symbol: string) => ({
    uri: `material-symbol:${symbol}`,
  }),
}));

let directory: string;

beforeEach(() => {
  jest.clearAllMocks();
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'insights-android-'));
  const file = path.join(directory, 'app.db');
  mockOpen = async () => phoneDatabaseWithReads(file);
  allowWrites();
  allowReads();
  resetPhone();
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
  fs.rmSync(directory, { recursive: true, force: true });
});

/** Starts the app, adds a personal expense on each date and opens the personal Insights. */
async function insightsOn(...dates: string[]) {
  await startExpensesAt('/');
  for (const [index, date] of dates.entries())
    await addExpense({ date, amount: `${index + 1}.00`, title: date });
  await openInsights();
}

test('[INSIGHTS-13.1] goes back to the expense list on the back button', async () => {
  await insightsOn('2025-01-10');

  await pressBack();

  await waitFor(() =>
    expect(navigationBarTitles(tab('Expenses'))).toEqual(['Expenses']),
  );
  expect(selectedTab()).toBe('Expenses');
});

// The chart menu

test('[INSIGHTS-26.1] puts a bar_chart button named for the chart type in the header on Android, with a dialog of the three types', async () => {
  await insightsOn('2025-01-10');

  const button = await waitFor(() => {
    const found = chartButton();
    expect(found).toBeDefined();
    return found!;
  });
  expect(nameOf(button)).toBe('Chart visualization, Auto selected');
  await waitFor(() =>
    expect(iconNames(button, 'android')).toEqual(['bar_chart']),
  );
  await fireEvent.press(button);
  await settle();

  expect(alertsShown().at(-1)?.[0]).toBe('Chart visualization');
  expect(lastAlertButtons()).toEqual(['Auto, selected', 'Donut', 'Bar']);
  expect(lastAlertCancelable()).toBe(true);
});

test('[INSIGHTS-26.1] redraws with the chart type chosen in the dialog and names the button after it', async () => {
  await insightsOn('2025-01-10');
  await fireEvent.press(chartButton()!);
  await settle();

  await pressAlertButton('Bar');

  await waitFor(() =>
    expect(nameOf(chartButton()!)).toBe('Chart visualization, Bar selected'),
  );
  expect(chartKinds()).toEqual(['bar']);
  await fireEvent.press(chartButton()!);
  await settle();
  expect(lastAlertButtons()).toEqual(['Auto', 'Donut', 'Bar, selected']);
});

test('[SHELL-50.1] shows a round ripple of radius 24 on the chart button', async () => {
  await insightsOn('2025-01-10');

  await waitFor(() => expect(chartButton()).toBeDefined());
  expect(ripplesOn(chartButton()!)).toContainEqual(
    expect.objectContaining({ round24: true }),
  );
});

test('[INSIGHTS-24.1] hides each chart from screen readers on Android', async () => {
  await insightsOn('2025-01-10');

  const views = chartViews();
  expect(views).toHaveLength(1);
  for (const view of views)
    expect(
      view?.props['aria-hidden'] === true ||
        view?.props.importantForAccessibility === 'no-hide-descendants',
    ).toBe(true);
});

// Month and Year

test('[INSIGHTS-31.1] shows Month and Year side by side, Month checked', async () => {
  await insightsOn('2025-01-20', '2025-03-10');

  expect(aggregationOptions().map(nameOf)).toEqual(['Month', 'Year']);
  expect(checkedAggregation()).toEqual(['Month']);
});

test('[INSIGHTS-28.1] puts Period aggregation above Previous period, the period name and Next period', async () => {
  await insightsOn('2025-01-20', '2025-03-10');

  const [month] = aggregationOptions();
  const [card] = within(insightsScreen()).queryAllByLabelText(/^Total spent /);
  expect(
    inTreeOrder(month, previousButton()!, periodButton()!, nextButton()!, card),
  ).toBe(true);
  expect(nameOf(periodButton()!)).toBe('Choose period. March 2025');
});

test('[INSIGHTS-29.1] shows the year of the selected month on Year, and the latest month of that year on Month', async () => {
  await insightsOn('2024-11-10', '2025-01-20', '2025-03-10');
  await pressPrevious();
  await expectPeriod('January 2025');

  await chooseAggregation('Year');

  expect(checkedAggregation()).toEqual(['Year']);
  await expectPeriod('2025');
  await chooseAggregation('Month');
  expect(checkedAggregation()).toEqual(['Month']);
  await expectPeriod('March 2025');
});

test('[INSIGHTS-29.1] shows the latest month of an earlier year on Month', async () => {
  await insightsOn('2024-11-10', '2025-01-20', '2025-03-10');
  await chooseAggregation('Year');
  await pressPrevious();
  await expectPeriod('2024');

  await chooseAggregation('Month');

  await expectPeriod('November 2024');
});

test('[INSIGHTS-29.1] compares a year with the previous year', async () => {
  await startExpensesAt('/');
  await addExpense({ date: '2024-06-10', amount: '10.00' });
  await addExpense({ date: '2025-02-10', amount: '15.00' });
  await openInsights();

  await chooseAggregation('Year');

  await expectPeriod('2025');
  expect(totalCards()).toEqual([
    ['TOTAL SPENT', '$15.00', '$5.00 more than 2024, 50.0 percent.'],
  ]);
});

test('[INSIGHTS-34.1] shows the only year as text, without arrows or a button', async () => {
  await insightsOn('2025-01-20', '2025-03-10');

  await chooseAggregation('Year');

  await waitFor(() => expect(insightsLines()).toContain('2025'));
  expect(previousButton()).toBeNull();
  expect(nextButton()).toBeNull();
  expect(periodButton()).toBeNull();
  const buttons = within(insightsScreen()).queryAllByRole('button');
  expect(buttons.filter((button) => linesIn(button).includes('2025'))).toEqual(
    [],
  );
});

// The period picker

test('[INSIGHTS-35.1] [INSIGHTS-39.1] lists the years and the months of the selected year in Select Month, only those with expenses', async () => {
  await insightsOn('2024-11-10', '2025-01-20', '2025-03-10');

  await pressPeriod();

  expect(pickerTitle()).toBe('Select Month');
  expect(pickerButtons().filter((name) => /\d{4}$/.test(name))).toEqual([
    'Year 2025',
    'Year 2024',
    'March 2025',
    'January 2025',
  ]);
  expect(pickerSelected()).toEqual(['Year 2025', 'March 2025']);
  expect(pickerButtonLines('March 2025')).toEqual(['March']);
  expect(pickerButtonLines('January 2025')).toEqual(['January']);
  const lines = pickerLines();
  const expected = [
    'Select Month',
    'YEAR',
    '2025',
    '2024',
    'MONTH',
    '2025',
    'March',
    'January',
  ];
  expect(lines.filter((line) => expected.includes(line))).toEqual(expected);
});

test('[INSIGHTS-35.1] [INSIGHTS-39.1] lists the months of another year when its year is pressed, keeping the dialog open', async () => {
  await insightsOn('2024-11-10', '2025-01-20', '2025-03-10');
  await pressPeriod();

  await pressInPicker('Year 2024');

  expect(pickerTitle()).toBe('Select Month');
  expect(pickerSelected()).toEqual(['Year 2024']);
  expect(pickerButtons().filter((name) => /\d{4}$/.test(name))).toEqual([
    'Year 2025',
    'Year 2024',
    'November 2024',
  ]);
  const lines = pickerLines();
  expect(lines.slice(lines.indexOf('MONTH'))).toEqual([
    'MONTH',
    '2024',
    'November',
  ]);
  expect(selectedPeriod()).toBe('March 2025');
});

test('[INSIGHTS-39.1] selects the month pressed and closes Select Month', async () => {
  await insightsOn('2024-11-10', '2025-01-20', '2025-03-10');
  await pressPeriod();
  await pressInPicker('Year 2024');

  await pressInPicker('November 2024');

  expect(pickerTitle()).toBeUndefined();
  await expectPeriod('November 2024');
});

test('[INSIGHTS-39.1] shows no years in Select Month when the months are all in one year', async () => {
  await insightsOn('2025-01-20', '2025-03-10');

  await pressPeriod();

  expect(pickerTitle()).toBe('Select Month');
  expect(pickerLines()).not.toContain('YEAR');
  expect(pickerButtons().filter((name) => name.startsWith('Year '))).toEqual(
    [],
  );
  const lines = pickerLines();
  expect(lines.slice(lines.indexOf('MONTH'))).toEqual([
    'MONTH',
    '2025',
    'March',
    'January',
  ]);
});

test('[INSIGHTS-39.1] lists the years newest first in Select Year and selects the year pressed', async () => {
  await insightsOn('2023-05-10', '2024-11-10', '2025-03-10');
  await chooseAggregation('Year');
  await expectPeriod('2025');

  await pressPeriod();

  expect(pickerTitle()).toBe('Select Year');
  expect(pickerButtons().filter((name) => /^\d{4}$/.test(name))).toEqual([
    '2025',
    '2024',
    '2023',
  ]);
  expect(pickerSelected()).toEqual(['2025']);
  const lines = pickerLines();
  expect(lines.slice(lines.indexOf('YEAR'))).toEqual([
    'YEAR',
    '2025',
    '2024',
    '2023',
  ]);
  await pressInPicker('2024');
  expect(pickerTitle()).toBeUndefined();
  await expectPeriod('2024');
});

test('[INSIGHTS-39.1] closes the dialog without changing the period from its Close button', async () => {
  await insightsOn('2024-11-10', '2025-01-20', '2025-03-10');
  await pressPeriod();
  await pressInPicker('Year 2024');

  await pressInPicker('Close Select Month');

  expect(pickerTitle()).toBeUndefined();
  expect(selectedPeriod()).toBe('March 2025');
});

test('[INSIGHTS-39.1] closes the dialog without changing the period on a back press', async () => {
  await insightsOn('2024-11-10', '2025-01-20', '2025-03-10');
  await pressPeriod();

  await pressBackOnPicker();

  expect(pickerTitle()).toBeUndefined();
  expect(selectedPeriod()).toBe('March 2025');
  expect(insightsLines()).toContain('March 2025');
});
