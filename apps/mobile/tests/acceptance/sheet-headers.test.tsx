import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fireEvent, screen, within } from '@testing-library/react-native';
import { barTitled, pressOnBar } from './group-details-app';
import {
  openCategoryList,
  openNewExpense,
  phoneDatabase,
  resetPhone,
  watchAlerts,
} from './ledger-expense-app';
import {
  categorySheet,
  categorySheetTitle,
  chooseGroup,
  openCategorySheet,
  openRow,
  setSplit,
  startWithGroups,
} from './ledger-group-expense-app';
import { allowWrites, settle } from './shell-appearance-app';
import { navigationBars } from './shell-tabs-app';
import type { Database } from '../../src/storage';

// As in shell-actions.test.tsx, inspect the public native navigation-bar output
// of the rendered app. Geometry and Liquid Glass itself need the native checks
// in the specs; a React test cannot establish their appearance.
let mockOpen: () => Promise<Database>;

jest.mock('../../src/storage/expo', () => ({
  openPhoneDatabase: () => mockOpen(),
}));

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
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sheet-headers-'));
  mockOpen = async () => phoneDatabase(path.join(directory, 'app.db'));
  allowWrites();
  resetPhone();
  watchAlerts();
});

afterEach(() => {
  jest.restoreAllMocks();
  fs.rmSync(directory, { recursive: true, force: true });
});

type BarItem = {
  type: string;
  title?: string;
  accessibilityLabel?: string;
  variant?: string;
  disabled?: boolean;
};

function expectToolbar(
  title: string,
  left: string[],
  right: string[],
  confirmDisabled = false,
) {
  const bars = navigationBars().filter((bar) => bar.props.title === title);
  // Missing native chrome is an assertion failure, not an exception in setup.
  expect(bars).toHaveLength(1);
  const bar = bars[0];
  const buttons = (side: 'Left' | 'Right') =>
    ((bar.props[`header${side}BarButtonItems`] as BarItem[] | undefined) ?? [])
      .filter((item) => item.type === 'button')
      .map((item) => ({
        name: item.accessibilityLabel || item.title,
        variant: item.variant ?? 'plain',
        disabled: item.disabled === true,
      }));
  expect(buttons('Left')).toEqual(
    left.map((name) => ({ name, variant: 'plain', disabled: false })),
  );
  expect(buttons('Right')).toEqual(
    right.map((name) => ({
      name,
      variant: 'prominent',
      disabled: confirmDisabled,
    })),
  );
  // The title belongs to the native bar, not a second header in the content.
  expect(screen.queryAllByRole('header', { name: title })).toHaveLength(0);
}

test.each(['Category', 'Select Group', 'Who Paid?', 'Split Between'] as const)(
  '[SHELL-65.1] gives %s its native title and correctly placed action',
  async (title) => {
    await startWithGroups({ Brisbane: ['Casey', 'Blake'] });
    await openNewExpense();
    await chooseGroup('Brisbane');
    if (title === 'Category') await openCategoryList();
    else
      await openRow(
        title === 'Select Group'
          ? 'Group'
          : title === 'Who Paid?'
            ? 'Paid by'
            : 'Split between',
      );
    expectToolbar(
      title,
      title === 'Split Between' ? [] : ['Cancel'],
      title === 'Split Between' ? ['Done'] : [],
    );
  },
);

test('[SHELL-65.1] keeps a native Cancel when Select Group has no options', async () => {
  await startWithGroups();
  await openNewExpense();
  await setSplit(true);
  expectToolbar('Select Group', ['Cancel'], []);
  await pressOnBar('Select Group', 'Cancel');
  expect(barTitled('Select Group')).toBeUndefined();
  expect(barTitled('New Expense')).toBeDefined();
});

test.each(['personal', 'group'] as const)(
  '[SHELL-65.1] gives New Category over the %s expense form native Cancel and Add',
  async (scope) => {
    await startWithGroups({ Brisbane: [] });
    await openNewExpense();
    if (scope === 'group') await chooseGroup('Brisbane');
    await openCategorySheet();
    await pressOnBar(categorySheetTitle()!, 'Add category');
    const field = await screen.findByLabelText('Category name');
    await settle();
    expectToolbar('New Category', ['Cancel'], ['Add'], true);
    await fireEvent.changeText(field, 'Gym');
    await settle();
    expectToolbar('New Category', ['Cancel'], ['Add']);
    await pressOnBar('New Category', 'Cancel');
    expect(screen.queryByLabelText('Category name')).toBeNull();
    expect(within(categorySheet()).queryByText('Gym')).toBeNull();
  },
);

test.each(['personal', 'group'] as const)(
  '[SHELL-65.1] gives Edit Category over the %s expense form native Cancel and Save',
  async (scope) => {
    await startWithGroups({ Brisbane: [] });
    await openNewExpense();
    if (scope === 'group') await chooseGroup('Brisbane');
    await openCategorySheet();
    await fireEvent.press(
      within(categorySheet()).getByRole('button', { name: 'Shopping' }),
    );
    const field = await screen.findByLabelText('Category name');
    await settle();
    expectToolbar('Edit Category', ['Cancel'], ['Save']);
    await fireEvent.changeText(field, '');
    await settle();
    expectToolbar('Edit Category', ['Cancel'], ['Save'], true);
    await pressOnBar('Edit Category', 'Cancel');
    expect(screen.queryByLabelText('Category name')).toBeNull();
    expect(within(categorySheet()).getByText('Shopping')).toBeDefined();
  },
);
