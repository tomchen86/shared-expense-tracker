import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { waitFor, within } from '@testing-library/react-native';
import { buildInsights } from '@shared-expense/domain';
import { addExpense, resetPhone } from './ledger-expense-app';
import {
  allowReads,
  phoneDatabaseWithReads,
  startExpensesAt,
} from './ledger-expense-list-app';
import {
  TOO_LARGE,
  chartMenu,
  headings,
  insightsLines,
  insightsScreen,
  openInsights,
} from './insights-app';
import { allowWrites } from './shell-appearance-app';
import type { Database } from '../../src/storage';

// Runs on iOS. The domain package refuses totals above the largest safe integer
// (INSIGHTS-12.1), which takes some 9,008 expenses of the largest amount in one
// year. Instead of adding them, this file has the domain package refuse the
// totals of the expenses it gets, as it does for those.

jest.mock('@shared-expense/domain', () => {
  const actual = jest.requireActual<typeof import('@shared-expense/domain')>(
    '@shared-expense/domain',
  );
  return { ...actual, buildInsights: jest.fn(actual.buildInsights) };
});

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

let directory: string;

beforeEach(() => {
  jest.clearAllMocks();
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'insights-overflow-'));
  const file = path.join(directory, 'app.db');
  mockOpen = async () => phoneDatabaseWithReads(file);
  allowWrites();
  allowReads();
  resetPhone();
});

afterEach(() => {
  jest.restoreAllMocks();
  fs.rmSync(directory, { recursive: true, force: true });
});

test('[INSIGHTS-20.1] shows only Totals Too Large and its hint when the domain package refuses the totals', async () => {
  await startExpensesAt('/');
  await addExpense({ amount: '9999999999.99' });
  jest.mocked(buildInsights).mockReturnValue(undefined);

  await openInsights();

  await waitFor(() => expect(insightsLines()).toEqual(TOO_LARGE));
  expect(jest.mocked(buildInsights)).toHaveBeenCalled();
  expect(headings()).toEqual(['Totals Too Large']);
  expect(chartMenu()).toBeUndefined();
  expect(within(insightsScreen()).queryAllByRole('button')).toEqual([]);
});
