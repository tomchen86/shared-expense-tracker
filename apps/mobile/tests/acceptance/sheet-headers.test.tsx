import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fireEvent, screen, within } from '@testing-library/react-native';
import { barTitled, pressOnBar } from './group-details-app';
import {
  openNewExpense,
  phoneDatabase,
  resetPhone,
  watchAlerts,
} from './ledger-expense-app';
import {
  categorySheet,
  chooseGroup,
  openCategorySheet,
  openNewCategory,
  startWithGroups,
  storedGroup,
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
  icon?: { name?: string };
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
        icon: item.icon?.name,
        variant: item.variant ?? 'plain',
        disabled: item.disabled === true,
      }));
  expect(buttons('Left')).toEqual(
    left.map((name) => ({
      name,
      icon: 'xmark',
      variant: 'plain',
      disabled: false,
    })),
  );
  expect(buttons('Right')).toEqual(
    right.map((name) => ({
      name,
      icon: 'checkmark',
      variant: 'prominent',
      disabled: confirmDisabled,
    })),
  );
  // The title belongs to the native bar, not a second header in the content.
  expect(screen.queryAllByRole('header', { name: title })).toHaveLength(0);
}

test.each(['personal', 'group'] as const)(
  '[SHELL-65.2] gives New Category over the %s expense form native Cancel and Add',
  async (scope) => {
    await startWithGroups({ Brisbane: [] });
    await openNewExpense();
    if (scope === 'group') await chooseGroup('Brisbane');
    await openNewCategory();
    const field = await screen.findByLabelText('Category name');
    await settle();
    expectToolbar('New Category', ['Cancel'], ['Add'], true);
    await fireEvent.changeText(field, 'Gym');
    await settle();
    expectToolbar('New Category', ['Cancel'], ['Add']);
    await pressOnBar('New Category', 'Cancel');
    expect(screen.queryByLabelText('Category name')).toBeNull();
    expect(barTitled('New Expense')).toBeDefined();
  },
);

test.each(['personal', 'group'] as const)(
  '[SHELL-65.2] gives Edit Category over the categories screen of a %s expense form native Cancel and Save',
  async (scope) => {
    await startWithGroups({ Brisbane: [] });
    const brisbane = await storedGroup(
      path.join(directory, 'app.db'),
      'Brisbane',
    );
    await openNewExpense();
    if (scope === 'group') await chooseGroup('Brisbane');
    await openCategorySheet(scope === 'group' ? brisbane.id : undefined);
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
