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
  phoneDatabase,
  resetPhone,
  startExpenses,
  watchAlerts,
} from '../acceptance/ledger-expense-app';
import {
  barAction,
  barTitled,
  expectOpen,
  pressOnBar,
} from '../acceptance/group-details-app';
import { allowWrites, settle } from '../acceptance/shell-appearance-app';
import { tab, tapTab } from '../acceptance/shell-tabs-app';
import { listCategories } from '../../src/categories';
import type { Database } from '../../src/storage';
import { openNodeDatabase } from '../../src/storage/node';

// On a busy phone the keys typed just before a press on the title bar's Add or Save,
// or a press on a color just before it, can reach React in the same batch as the
// press, before React renders what they change. The category form must save the name
// and color it holds at the press, not those of the last render. Each test calls the
// field's change handler, or presses the color, and the bar's press handler inside
// one act(), so React renders neither until both have run; fireEvent on its own would
// wrap each in an act() of its own and render in between.

let mockOpen: () => Promise<Database>;

jest.mock('../../src/storage/expo', () => ({
  openPhoneDatabase: () => mockOpen(),
}));

// Not virtual, as in the expense form's acceptance tests.
jest.mock('expo-localization', () => {
  const phone = () =>
    jest.requireActual<typeof import('../acceptance/ledger-expense-app')>(
      '../acceptance/ledger-expense-app',
    );
  return {
    ...jest.requireActual<object>('expo-localization'),
    getLocales: () => phone().phoneLocales(),
    getCalendars: () => phone().phoneCalendars(),
    useLocales: () => phone().phoneLocales(),
    useCalendars: () => phone().phoneCalendars(),
  };
});

jest.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: {
    Success: 'success',
    Warning: 'warning',
    Error: 'error',
  },
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  selectionAsync: jest.fn(async () => undefined),
}));

const ALREADY_EXISTS = 'A category with this name already exists.';

let directory: string;
let file: string;

beforeEach(() => {
  jest.clearAllMocks();
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'category-form-save-'));
  file = path.join(directory, 'app.db');
  mockOpen = async () => phoneDatabase(file);
  allowWrites();
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

/** The stored categories, as [name, color], in order. */
async function storedCategories() {
  const database = openNodeDatabase(file, { readOnly: true });
  try {
    return (await listCategories(database)).map(
      (category) => [category.name, category.color] as const,
    );
  } finally {
    await database.close();
  }
}

const storedNames = async () =>
  (await storedCategories()).map(([name]) => name);

async function openManageCategories() {
  await startExpenses();
  await tapTab('Settings');
  await fireEvent.press(screen.getByText('Manage Categories'));
  await expectOpen('Manage Categories');
  await settle();
}

async function openNewCategory() {
  await openManageCategories();
  await pressOnBar('Manage Categories', 'Add category');
  await expectOpen('New Category');
  await settle();
}

async function openEditCategory(name: string) {
  await openManageCategories();
  await fireEvent.press(within(tab('Settings')).getByText(name));
  await expectOpen('Edit Category');
  await settle();
}

const nameField = () => screen.getByLabelText('Category name');

interface BarItem {
  type: string;
  title?: string;
  accessibilityLabel?: string;
  buttonId?: string;
}

/**
 * Runs `change`, then presses `button` on the bar titled `title`, before React renders
 * the change, as the native bar reports a press on iOS: by the ID of a button that was
 * enabled at the last render, to the handler the bar holds when the press arrives.
 */
async function changeAndPressInOneBatch(
  change: () => void | Promise<void>,
  title: 'New Category' | 'Edit Category',
  button: 'Add' | 'Save',
) {
  // The native bar reports no press on a disabled button.
  expect(barAction(title, button).disabled).toBe(false);
  await act(async () => {
    await change();
    const bar = barTitled(title)!;
    const items: BarItem[] = [
      ...(bar.props.headerLeftBarButtonItems ?? []),
      ...(bar.props.headerRightBarButtonItems ?? []),
    ];
    const item = items.find(
      (candidate) =>
        candidate.type === 'button' &&
        (candidate.accessibilityLabel || candidate.title) === button,
    )!;
    bar.props.onPressHeaderBarButtonItem({
      nativeEvent: { buttonId: item.buttonId },
    });
  });
  await settle();
}

/** Changes the name field to `text` and presses `button` before React renders the change. */
function typeAndPressInOneBatch(
  text: string,
  title: 'New Category' | 'Edit Category',
  button: 'Add' | 'Save',
) {
  const { onChangeText } = nameField().props;
  return changeAndPressInOneBatch(() => onChangeText(text), title, button);
}

async function expectFormClosed() {
  await waitFor(() =>
    expect(screen.queryByLabelText('Category name')).toBeNull(),
  );
}

test('New Category saves the whole name when its last key comes with Add', async () => {
  await openNewCategory();
  await fireEvent.changeText(nameField(), 'Gy');
  await settle();

  await typeAndPressInOneBatch('Gym', 'New Category', 'Add');

  await expectFormClosed();
  const names = await storedNames();
  expect(names).toContain('Gym');
  expect(names).not.toContain('Gy');
});

test('Edit Category saves the whole name when its last key comes with Save', async () => {
  await openEditCategory('Shopping');
  await fireEvent.changeText(nameField(), 'Grocerie');
  await settle();

  await typeAndPressInOneBatch('Groceries', 'Edit Category', 'Save');

  await expectFormClosed();
  const names = await storedNames();
  expect(names).toContain('Groceries');
  expect(names).not.toContain('Grocerie');
  expect(names).not.toContain('Shopping');
});

test('New Category shows the duplicate name typed in the same batch as Add, and saves nothing', async () => {
  await openNewCategory();
  await fireEvent.changeText(nameField(), 'Foo');
  await settle();
  const before = await storedCategories();

  await typeAndPressInOneBatch('food & dining', 'New Category', 'Add');

  expect(screen.getByText(ALREADY_EXISTS)).toBeTruthy();
  expect(nameField().props.value).toBe('food & dining');
  expect(await storedCategories()).toEqual(before);
});

test('New Category saves the color pressed in the same batch as Add', async () => {
  await openNewCategory();
  await fireEvent.changeText(nameField(), 'Gym');
  await settle();
  const red = screen.getByRole('button', { name: 'Select color #C62828' });

  await changeAndPressInOneBatch(
    () => fireEvent.press(red),
    'New Category',
    'Add',
  );

  await expectFormClosed();
  expect(await storedCategories()).toContainEqual(['Gym', '#C62828']);
});
