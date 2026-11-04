import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  AccessibilityInfo,
  Alert,
  StyleSheet,
  processColor,
  type AlertButton,
} from 'react-native';
import {
  act,
  fireEvent,
  screen,
  userEvent,
  waitFor,
  within,
} from '@testing-library/react-native';
import {
  nativeViews,
  navigationBarTitles,
  navigationBars,
  push,
  startApp,
  tab,
  tapTab,
} from './shell-tabs-app';
import {
  addExpense,
  categoryOptions,
  doAction as doActionIn,
  editExpense,
  nameOf,
  namesWithAction as namesWithActionIn,
  openCategoryList,
  openNewExpense,
  resetPhone,
} from './ledger-expense-app';
import {
  backgroundBehind,
  colorsInBoth,
  fakePhoneAppearance,
  fixedColors,
  sectionOf,
  switchPhoneTo,
  textsWithoutColor,
} from './shell-appearance-app';
import {
  CREATE_FAILED,
  alertsShown,
  cardNames,
  createGroup,
  expectNewGroupOpen,
  localData,
  newGroupIsOpen,
  press as pressNewGroupButton,
  pressAddGroup,
  readIdentity,
  saveName,
  startGroupsApp,
  storedGroups,
  typeName,
} from './groups-app';
import { expectOpen, textsOn } from './group-details-app';
import {
  READ_ONLY as GROUP_READ_ONLY,
  archiveByAction,
  openArchivedGroups,
  pressRestore,
  pressRestoreGroup,
} from './group-archive-app';
import { listCategories, type Category } from '../../src/categories';
import { listExpenses, type Expense } from '../../src/ledger';
import type { LocalIdentity } from '../../src/shell';
import type { Database, SqlExecutor, SqlValue } from '../../src/storage';
import { openNodeDatabase } from '../../src/storage/node';

// Runs on iOS. The phone database is a file each test chooses (ADR-0006), so a
// test can restart the app on the same data. A test can hold or fail writes, as
// a slow or full disk would, or fail only the writes that store a given value.
// The category form may be a sheet on Manage Categories or a screen of its own,
// and its buttons views or native navigation bar items; the helpers find them
// either way. Group Categories is Manage Categories opened with a group's ID in
// its URL, which is how these tests open it; they read stored categories back
// through listCategories, the categories capability's reader.

let mockFile = '';
let mockBeforeWrite: (
  sql: string,
  parameters?: readonly SqlValue[],
) => Promise<void> = () => Promise.resolve();

/** Puts every write, in a transaction or not, behind `mockBeforeWrite`. */
function mockGatedWrites(database: Database): Database {
  const gate = <T extends SqlExecutor>(executor: T): T => ({
    ...executor,
    exec: async (sql: string) => {
      await mockBeforeWrite(sql);
      return executor.exec(sql);
    },
    run: async (sql: string, parameters?: readonly SqlValue[]) => {
      await mockBeforeWrite(sql, parameters);
      return executor.run(sql, parameters);
    },
  });
  return {
    ...gate(database),
    transaction: <T,>(work: (transaction: SqlExecutor) => Promise<T>) =>
      database.transaction((transaction) => work(gate(transaction))),
  };
}

jest.mock('../../src/storage/expo', () => ({
  openPhoneDatabase: async () => {
    const { openNodeDatabase } = jest.requireActual<
      typeof import('../../src/storage/node')
    >('../../src/storage/node');
    return mockGatedWrites(openNodeDatabase(mockFile));
  },
}));

// The tests that need expenses add them through New Expense, which reads the
// phone's locale and calendar from expo-localization; ledger-expense-app stands in
// for the phone, as in the expense form tests. Not virtual: Jest caches how a
// module name resolves across the test files of a worker.
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

jest.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: {
    Light: 'light',
    Medium: 'medium',
    Heavy: 'heavy',
    Soft: 'soft',
    Rigid: 'rigid',
  },
  NotificationFeedbackType: {
    Success: 'success',
    Warning: 'warning',
    Error: 'error',
  },
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  selectionAsync: jest.fn(async () => undefined),
}));

const PALETTE = [
  '#D81B60',
  '#1E88E5',
  '#FBC02D',
  '#00897B',
  '#8E24AA',
  '#F4511E',
  '#3949AB',
  '#6D4C41',
  '#757575',
  '#43A047',
  '#00ACC1',
  '#C62828',
  '#9E9D24',
  '#A66F5B',
  '#D99E77',
  '#A66A11',
  '#6C733F',
  '#8BD916',
  '#0B733C',
  '#36D9B8',
  '#1D6273',
  '#85BFF2',
  '#8861F2',
  '#DC85F2',
  '#F218B8',
  '#8C4D6F',
  '#F2858D',
];
/** The default categories as [name, color], in order. */
const DEFAULTS = [
  ['Food & Dining', '#D81B60'],
  ['Transportation', '#1E88E5'],
  ['Shopping', '#FBC02D'],
  ['Entertainment', '#00897B'],
  ['Bills & Utilities', '#8E24AA'],
  ['Health', '#F4511E'],
  ['Travel', '#3949AB'],
  ['Other', '#6D4C41'],
  ['Uncategorized', '#757575'],
];
const DEFAULT_COLORS = DEFAULTS.map(([, color]) => color);
const DEFAULT_NAMES = DEFAULTS.map(([name]) => name);
const MANAGE_CATEGORIES = 'Manage Categories';
const GROUP_CATEGORIES = 'Group Categories';
const GROUP_NOT_FOUND = 'Group not found.';
const ALREADY_EXISTS = 'A category with this name already exists.';
const ALL_COLORS_USED = 'All category colors are already in use.';
const SAVE_FAILED = [
  'Unable to Save Category',
  'Your category could not be saved. Please try again.',
];
// Compares the field's text as typed, spaces included.
const AS_TYPED = { normalizer: (text: string) => text };

let directory: string;
let alert: jest.SpyInstance;
/** The app the scope helpers started last; restarting ends it first. */
let running: { unmount: () => Promise<void> } | undefined;

beforeEach(() => {
  jest.clearAllMocks();
  running = undefined;
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'categories-'));
  mockFile = path.join(directory, 'app.db');
  allowWrites();
  resetPhone();
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
  fs.rmSync(directory, { recursive: true, force: true });
});

// renderRouter fakes the global timers; Node's own module keeps the real ones.
const { setImmediate: nextTurn } =
  jest.requireActual<typeof import('node:timers')>('node:timers');

/** The test database answers within one turn of the event loop. */
const settle = () =>
  act(() => new Promise<void>((resolve) => nextTurn(resolve)));

function allowWrites() {
  mockBeforeWrite = () => Promise.resolve();
}

function failWrites() {
  mockBeforeWrite = () => Promise.reject(new Error('disk full'));
}

/** Fails each write that stores the name of Uncategorized, the last default category. */
function failWritesOfUncategorized() {
  mockBeforeWrite = (sql, parameters = []) =>
    [sql, ...parameters].some(
      (value) => typeof value === 'string' && value.includes('Uncategorized'),
    )
      ? Promise.reject(new Error('disk full'))
      : Promise.resolve();
}

/** Holds every write until the test lets the writes through. */
function holdWrites() {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  mockBeforeWrite = () => held;
  return { release: () => act(async () => release()) };
}

const alerts = () => alert.mock.calls.map((call) => call.slice(0, 2));

const announcements = () =>
  [
    ...jest.mocked(AccessibilityInfo.announceForAccessibility).mock.calls,
    ...jest.mocked(AccessibilityInfo.announceForAccessibilityWithOptions).mock
      .calls,
  ].map(([message]) => message);

/** The given texts as the screen shows them, top to bottom. */
function inOrder(texts: string[]) {
  const escaped = texts.map((text) =>
    text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
  );
  return screen
    .getAllByText(new RegExp(`^(${escaped.join('|')})$`))
    .map((element) => element.props.children);
}

type NativeView = ReturnType<typeof nativeViews>[number];

/** Whether the views come in this order in the rendered tree. */
function inTreeOrder(...views: NativeView[]) {
  const all = screen.container.queryAll(() => true);
  const indexes = views.map((view) => all.indexOf(view));
  return indexes.every(
    (index, position) =>
      index >= 0 && (position === 0 || index > indexes[position - 1]),
  );
}

/** Starts the app and opens Manage Categories from the Settings root. */
async function openManageCategories() {
  const app = await startApp('/settings');
  await fireEvent.press(screen.getByText('Manage Categories'));
  await waitFor(() =>
    expect(navigationBarTitles(tab('Settings'))).toEqual([
      'Settings',
      'Manage Categories',
    ]),
  );
  await settle();
  return app;
}

const isCategoriesTitle = (title: unknown) =>
  title === MANAGE_CATEGORIES || title === GROUP_CATEGORIES;

/** Manage Categories or Group Categories in the Settings tab's stack. */
function categoriesScreen(): NativeView {
  const found = nativeViews(/^RNSScreen$/, tab('Settings')).find((view) =>
    navigationBars(view).some((bar) => isCategoriesTitle(bar.props.title)),
  );
  if (found === undefined) throw new Error('No categories screen is open');
  return found;
}

/** The titles of the categories screens in the Settings tab's stack, bottom first. */
const categoriesTitles = () =>
  navigationBarTitles(tab('Settings')).filter(isCategoriesTitle);

/** A view's background color in capitals, if it has one. */
function backgroundOf(view: NativeView): string | undefined {
  const color = StyleSheet.flatten(view.props.style)?.backgroundColor;
  return typeof color === 'string' ? color.toUpperCase() : undefined;
}

const textOf = (node: NativeView | string): string =>
  typeof node === 'string' ? node : node.children.map(textOf).join('');

/** The text of the first Text inside `view`, if there is one. */
function firstText(view: NativeView): string | undefined {
  const [text] = nativeViews(/^Text$/, view);
  return text === undefined ? undefined : textOf(text);
}

/**
 * What Manage Categories or Group Categories lists, top to bottom, as [name,
 * color]: every view filled with a palette color is a dot, named by the first
 * text of the nearest view around it. The form's colors would count too, so the
 * form must be closed.
 */
function categoryList() {
  return categoryRows().map(({ category }) => category);
}

/** Each dot of the categories screen, top to bottom, with its row as [name, color]. */
function categoryRows() {
  return nativeViews(/./, categoriesScreen())
    .filter((view) => PALETTE.includes(backgroundOf(view) ?? ''))
    .map((dot) => {
      let row = dot.parent;
      while (row !== null && firstText(row) === undefined) row = row.parent;
      return {
        dot,
        category: [
          row === null ? undefined : firstText(row),
          backgroundOf(dot),
        ],
      };
    });
}

/** The default categories with the one at `index` replaced by `category`. */
const replacing = (index: number, category: string[]) =>
  DEFAULTS.map((row, position) => (position === index ? category : row));

/** Whether a screen or sheet titled `title` shows, in a navigation bar or as a header. */
const showsTitle = (title: string) =>
  navigationBarTitles().includes(title) ||
  screen.queryByRole('header', { name: title }) !== null;

async function expectForm(title: 'New Category' | 'Edit Category') {
  await waitFor(() => expect(showsTitle(title)).toBe(true));
}

async function expectFormClosed() {
  await waitFor(() => {
    expect(showsTitle('New Category')).toBe(false);
    expect(showsTitle('Edit Category')).toBe(false);
  });
  expect(screen.queryByLabelText('Category name')).toBeNull();
}

interface Control {
  disabled: boolean;
  press: () => Promise<void>;
}

interface BarItem {
  type: string;
  buttonId?: string;
  accessibilityLabel?: string;
  title?: string;
  disabled?: boolean;
}

/** A native bar button item in `bars`, by its accessibility label or title. */
function barItem(name: string, bars: NativeView[]): Control | undefined {
  for (const bar of bars) {
    const items: BarItem[] = [
      ...(bar.props.headerLeftBarButtonItems ?? []),
      ...(bar.props.headerRightBarButtonItems ?? []),
    ];
    const item = items.find(
      (candidate) =>
        candidate.type === 'button' &&
        (candidate.accessibilityLabel || candidate.title) === name,
    );
    if (item === undefined) continue;
    const disabled = item.disabled === true;
    return {
      disabled,
      // A native bar item reports a press by its button ID, unless disabled.
      press: async () => {
        if (!disabled)
          await fireEvent(bar, 'pressHeaderBarButtonItem', {
            nativeEvent: { buttonId: item.buttonId },
          });
      },
    };
  }
  return undefined;
}

/** A button view inside `root`, by its accessible name. */
function viewButton(
  name: string,
  root = screen.container,
): Control | undefined {
  const button = within(root).queryByRole('button', { name });
  if (button === null) return undefined;
  const state = button.props.accessibilityState ?? {};
  return {
    disabled: state.disabled === true || button.props['aria-disabled'] === true,
    press: () => fireEvent.press(button),
  };
}

/** The Add category button in the navigation bar of the categories screen. */
function addCategoryButton(): Control {
  const bars = navigationBars(categoriesScreen());
  const control =
    barItem('Add category', bars) ??
    bars
      .map((bar) => viewButton('Add category', bar))
      .find((found) => found !== undefined);
  if (control === undefined)
    throw new Error('No Add category button in the navigation bar');
  return control;
}

/** A button of the category form, in a navigation bar or on screen. */
function formButton(name: 'Cancel' | 'Add' | 'Save'): Control {
  const control = barItem(name, navigationBars()) ?? viewButton(name);
  if (control === undefined) throw new Error(`No ${name} button`);
  return control;
}

/** Presses a form button and lets the save, if any, finish. */
async function press(name: 'Cancel' | 'Add' | 'Save') {
  await formButton(name).press();
  await settle();
}

const nameField = () => screen.getByLabelText('Category name');

const COLOR_BUTTON = /^(Select color|Color) #[0-9A-F]{6}( already in use)?$/;

/** The form's color buttons in order, as [accessible name, state]. */
function colorButtons() {
  return screen.getAllByRole('button', { name: COLOR_BUTTON }).map((button) => {
    const state = button.props.accessibilityState ?? {};
    return [
      button.props.accessibilityLabel ?? button.props['aria-label'],
      state.selected === true
        ? 'selected'
        : state.disabled === true
          ? 'disabled'
          : 'free',
    ];
  });
}

/** The color buttons when other categories use `used` and `selected` is chosen. */
const expectedColors = (used: string[], selected?: string) =>
  PALETTE.map((color) =>
    used.includes(color)
      ? [`Color ${color} already in use`, 'disabled']
      : [`Select color ${color}`, color === selected ? 'selected' : 'free'],
  );

const selectedColor = () =>
  colorButtons()
    .find(([, state]) => state === 'selected')?.[0]
    ?.replace('Select color ', '');

const pressColor = (name: string) =>
  fireEvent.press(screen.getByRole('button', { name }));

async function openNewCategory() {
  await addCategoryButton().press();
  await expectForm('New Category');
}

async function openCategory(name: string) {
  await fireEvent.press(within(categoriesScreen()).getByText(name));
  await expectForm('Edit Category');
}

/** Adds a category, in the first available color unless `color` is given. */
async function addCategory(name: string, color?: string) {
  await openNewCategory();
  await fireEvent.changeText(nameField(), name);
  if (color !== undefined) await pressColor(`Select color ${color}`);
  await press('Add');
  await expectFormClosed();
}

async function editCategory(name: string, newName: string, color?: string) {
  await openCategory(name);
  await fireEvent.changeText(nameField(), newName);
  if (color !== undefined) await pressColor(`Select color ${color}`);
  await press('Save');
  await expectFormClosed();
}

/** Adds four categories, which take the last four colors. */
/** Adds Gym and 17 more categories, which take the 18 colors the defaults leave. */
async function useAllColors() {
  const names = [
    'Gym',
    ...Array.from({ length: 17 }, (_, index) => `Extra ${index + 1}`),
  ];
  for (const name of names) await addCategory(name);
}

// Scopes

/** The names the open categories screen lists, top to bottom. */
const listedNames = () => categoryList().map(([name]) => name);

/** Ends the running app, if any, and starts it at `url` on the categories screen titled `title`. */
async function restartAt(url: string, title: string) {
  await running?.unmount();
  running = await startApp(url);
  await waitFor(() => expect(categoriesTitles()).toEqual([title]));
  await settle();
}

const groupCategoriesUrl = (spaceId: string) =>
  `/settings/manage-categories?scopeKind=group&spaceId=${spaceId}`;

/** Restarts the app on the group's Group Categories. */
const openGroupCategories = (groupId: string) =>
  restartAt(groupCategoriesUrl(groupId), GROUP_CATEGORIES);

/** Restarts the app and opens Manage Categories from the Settings root. */
async function reopenManageCategories() {
  await running?.unmount();
  running = await openManageCategories();
}

/** Starts the app, saves your name and creates the groups; returns each group's ID by its name. */
async function createGroups(...names: string[]) {
  await running?.unmount();
  running = await startGroupsApp('/groups');
  await saveName('Taylor');
  for (const name of names) await createGroup(name);
  const groups = await storedGroups(mockFile);
  return Object.fromEntries(groups.map((group) => [group.name, group.id]));
}

/** Brisbane and Tokyo, with Gym added in Manage Categories, then Flights in Brisbane's Group Categories. */
async function setUpScopes() {
  const groups = await createGroups('Brisbane', 'Tokyo');
  await reopenManageCategories();
  await addCategory('Gym');
  await openGroupCategories(groups.Brisbane);
  await addCategory('Flights');
  return groups;
}

/** The categories in the database file, read through the categories capability. */
async function storedCategories(): Promise<Category[]> {
  const database = openNodeDatabase(mockFile);
  try {
    return await listCategories(database);
  } finally {
    await database.close();
  }
}

const storedCategory = async (name: string) =>
  (await storedCategories()).find((category) => category.name === name);

/** The stored categories of a scope, by its space ID, as [name, color] in their stored order. */
const namesAndColorsIn = async (spaceId: string) =>
  (await storedCategories())
    .filter((category) => category.spaceId === spaceId)
    .map(({ name, color }) => [name, color]);

test('[CATEGORIES-6.2] lists the nine default categories in order with their colors on first start', async () => {
  await openManageCategories();

  expect(categoryList()).toEqual(DEFAULTS);
});

test('[CATEGORIES-6.2] does not create the default categories again when the app restarts', async () => {
  const app = await openManageCategories();
  await app.unmount();

  await openManageCategories();

  expect(categoryList()).toEqual(DEFAULTS);
});

test('[CATEGORIES-6.2] gives the nine default categories your personal space on first start', async () => {
  running = await startGroupsApp('/groups');
  const identity = await readIdentity();

  expect(await namesAndColorsIn(identity.personalSpaceId)).toEqual(DEFAULTS);
  expect(await storedCategories()).toHaveLength(DEFAULTS.length);
});

test('[CATEGORIES-7.4] lists the categories under CATEGORIES, with Add category in the navigation bar', async () => {
  await openManageCategories();

  const texts = ['CATEGORIES', ...DEFAULTS.map(([name]) => name)];
  expect(inOrder(texts)).toEqual(texts);
  expect(addCategoryButton().disabled).toBe(false);
});

test('[CATEGORIES-7.4] lists a new category after Uncategorized', async () => {
  await openManageCategories();

  await addCategory('Gym');

  expect(categoryList()).toEqual([...DEFAULTS, ['Gym', '#43A047']]);
});

test('[CATEGORIES-7.4] keeps a renamed category in its place', async () => {
  await openManageCategories();

  await editCategory('Shopping', 'Groceries');

  expect(categoryList()).toEqual(replacing(2, ['Groceries', '#FBC02D']));
});

test('[CATEGORIES-7.4] keeps the stored order in each scope when categories of other scopes come between', async () => {
  const groups = await createGroups('Brisbane');
  await reopenManageCategories();
  await addCategory('Gym');
  await openGroupCategories(groups.Brisbane);
  await addCategory('Flights');
  await reopenManageCategories();

  await addCategory('Pets');

  expect(listedNames()).toEqual([...DEFAULT_NAMES, 'Gym', 'Pets']);
  await openGroupCategories(groups.Brisbane);
  expect(listedNames()).toEqual([...DEFAULT_NAMES, 'Flights']);
});

test('[CATEGORIES-8.3] opens New Category with an empty name and the first unused color selected', async () => {
  await openManageCategories();

  await openNewCategory();

  expect(nameField()).toHaveDisplayValue('', AS_TYPED);
  expect(selectedColor()).toBe('#43A047');
});

test('[CATEGORIES-8.3] selects the next unused color once a new category takes the first', async () => {
  await openManageCategories();
  await addCategory('Gym');

  await openNewCategory();

  expect(selectedColor()).toBe('#00ACC1');
});

test('[CATEGORIES-8.3] opens Edit Category with the name and color of the category pressed', async () => {
  await openManageCategories();

  await openCategory('Shopping');

  expect(nameField()).toHaveDisplayValue('Shopping', AS_TYPED);
  expect(selectedColor()).toBe('#FBC02D');
});

test("[CATEGORIES-8.3] selects the first color this scope leaves unused, whatever another scope's categories use", async () => {
  const groups = await createGroups('Brisbane');
  await reopenManageCategories();
  await addCategory('Gym', '#43A047');
  await openGroupCategories(groups.Brisbane);

  await openNewCategory();

  expect(selectedColor()).toBe('#43A047');
});

test('[CATEGORIES-9.3] shows Cancel, Add, the name field and the 27 colors, with used colors disabled', async () => {
  await openManageCategories();

  await openNewCategory();

  expect(formButton('Cancel').disabled).toBe(false);
  expect(formButton('Add')).toBeDefined();
  const colors = screen.getAllByRole('button', { name: COLOR_BUTTON });
  expect(
    inTreeOrder(
      screen.getByText('NAME'),
      nameField(),
      screen.getByText('COLOR'),
      ...colors,
    ),
  ).toBe(true);
  expect(colorButtons()).toEqual(expectedColors(DEFAULT_COLORS, '#43A047'));
});

test("[CATEGORIES-9.3] shows Save and leaves the category's own color available when editing", async () => {
  await openManageCategories();

  await openCategory('Shopping');

  expect(formButton('Save')).toBeDefined();
  expect(colorButtons()).toEqual(
    expectedColors(
      DEFAULT_COLORS.filter((color) => color !== '#FBC02D'),
      '#FBC02D',
    ),
  );
});

test('[CATEGORIES-9.3] selects a color when it is pressed, but not a used one', async () => {
  await openManageCategories();
  await openNewCategory();

  await pressColor('Select color #C62828');
  await pressColor('Color #D81B60 already in use');

  expect(colorButtons()).toEqual(expectedColors(DEFAULT_COLORS, '#C62828'));
});

test("[CATEGORIES-9.3] leaves the color of another scope's category free", async () => {
  const groups = await createGroups('Brisbane');
  await openGroupCategories(groups.Brisbane);
  await addCategory('Flights', '#C62828');
  await reopenManageCategories();

  await openNewCategory();

  expect(colorButtons()).toEqual(expectedColors(DEFAULT_COLORS, '#43A047'));
});

test("[CATEGORIES-9.3] leaves the color of another scope's category free when editing", async () => {
  const groups = await createGroups('Brisbane');
  await reopenManageCategories();
  await addCategory('Gym', '#43A047');
  await openGroupCategories(groups.Brisbane);
  await openCategory('Shopping');

  await pressColor('Select color #43A047');

  expect(colorButtons()).toEqual(
    expectedColors(
      DEFAULT_COLORS.filter((color) => color !== '#FBC02D'),
      '#43A047',
    ),
  );
});

test('[CATEGORIES-10.1] disables Add until the name has more than spaces', async () => {
  await openManageCategories();
  await openNewCategory();

  expect(formButton('Add').disabled).toBe(true);
  await fireEvent.changeText(nameField(), '   ');
  expect(formButton('Add').disabled).toBe(true);
  await fireEvent.changeText(nameField(), 'Gym');
  expect(formButton('Add').disabled).toBe(false);
});

test('[CATEGORIES-10.1] disables Save when the name is cleared', async () => {
  await openManageCategories();
  await openCategory('Shopping');

  await fireEvent.changeText(nameField(), '');

  expect(formButton('Save').disabled).toBe(true);
});

test('[CATEGORIES-10.1] keeps 50 characters when 51 are typed into the name', async () => {
  await openManageCategories();
  await openNewCategory();
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

  await user.type(nameField(), 'a'.repeat(51));

  expect(nameField()).toHaveDisplayValue('a'.repeat(50), AS_TYPED);
});

test('[CATEGORIES-11.2] adds the trimmed name in the selected color and closes the form', async () => {
  await openManageCategories();
  await openNewCategory();
  await fireEvent.changeText(nameField(), ' Gym ');
  await pressColor('Select color #C62828');

  await press('Add');

  await expectFormClosed();
  expect(categoryList()).toEqual([...DEFAULTS, ['Gym', '#C62828']]);
});

test('[CATEGORIES-11.2] renames and recolors a default category', async () => {
  await openManageCategories();

  await editCategory('Shopping', 'Groceries', '#43A047');

  expect(categoryList()).toEqual(replacing(2, ['Groceries', '#43A047']));
});

test("[CATEGORIES-11.2] saves a change of letter case to the category's own name", async () => {
  await openManageCategories();
  await openCategory('Shopping');
  await fireEvent.changeText(nameField(), 'SHOPPING');

  await press('Save');

  await expectFormClosed();
  expect(categoryList()).toEqual(replacing(2, ['SHOPPING', '#FBC02D']));
});

test('[CATEGORIES-11.2] adds one category when Add is pressed twice before the save finishes', async () => {
  await openManageCategories();
  await openNewCategory();
  await fireEvent.changeText(nameField(), 'Gym');
  const writes = holdWrites();
  const add = formButton('Add');

  await act(async () => {
    await add.press();
    await add.press();
  });
  await writes.release();
  await settle();

  await expectFormClosed();
  expect(categoryList()).toEqual([...DEFAULTS, ['Gym', '#43A047']]);
});

test.each(["Tokyo's Group Categories", MANAGE_CATEGORIES])(
  "[CATEGORIES-11.2] adds a category in %s with the name of Brisbane's category",
  async (where) => {
    const groups = await createGroups('Brisbane', 'Tokyo');
    await openGroupCategories(groups.Brisbane);
    await addCategory('Flights');
    if (where === MANAGE_CATEGORIES) await reopenManageCategories();
    else await openGroupCategories(groups.Tokyo);
    await openNewCategory();
    await fireEvent.changeText(nameField(), 'flights');

    await press('Add');

    await expectFormClosed();
    expect(listedNames()).toEqual([...DEFAULT_NAMES, 'flights']);
  },
);

test("[CATEGORIES-11.2] renames Brisbane's Shopping to the name of a personal category", async () => {
  const groups = await createGroups('Brisbane');
  await reopenManageCategories();
  await addCategory('Gym', '#43A047');
  await openGroupCategories(groups.Brisbane);

  await editCategory('Shopping', 'gym');

  expect(categoryList()).toEqual(replacing(2, ['gym', '#FBC02D']));
});

test('[CATEGORIES-12.2] keeps New Category open and says below the name that the name exists', async () => {
  await openManageCategories();
  await openNewCategory();
  await fireEvent.changeText(nameField(), 'food & dining');

  await press('Add');

  expect(showsTitle('New Category')).toBe(true);
  expect(
    inTreeOrder(
      nameField(),
      screen.getByText(ALREADY_EXISTS),
      screen.getByText('COLOR'),
    ),
  ).toBe(true);
  expect(announcements()).toContain(ALREADY_EXISTS);
  expect(alerts()).toEqual([]);
  await press('Cancel');
  await expectFormClosed();
  expect(categoryList()).toEqual(DEFAULTS);
});

test("[CATEGORIES-12.2] keeps Edit Category open when the name is another category's", async () => {
  await openManageCategories();
  await openCategory('Shopping');
  await fireEvent.changeText(nameField(), ' travel ');

  await press('Save');

  expect(showsTitle('Edit Category')).toBe(true);
  expect(screen.getByText(ALREADY_EXISTS)).toBeOnTheScreen();
  expect(alerts()).toEqual([]);
  await press('Cancel');
  await expectFormClosed();
  expect(categoryList()).toEqual(DEFAULTS);
});

test('[CATEGORIES-12.2] stops saying the name exists once the name is edited', async () => {
  await openManageCategories();
  await openNewCategory();
  await fireEvent.changeText(nameField(), 'food & dining');
  await press('Add');
  expect(screen.getByText(ALREADY_EXISTS)).toBeOnTheScreen();

  await fireEvent.changeText(nameField(), 'food');

  expect(screen.queryByText(ALREADY_EXISTS)).toBeNull();
});

test('[CATEGORIES-13.3] selects no color, disables Add and says so once all 27 colors are used', async () => {
  await openManageCategories();
  await useAllColors();

  await openNewCategory();

  expect(colorButtons()).toEqual(expectedColors(PALETTE));
  expect(screen.getByText(ALL_COLORS_USED)).toBeOnTheScreen();
  await fireEvent.changeText(nameField(), 'Garden');
  expect(formButton('Add').disabled).toBe(true);
});

test('[CATEGORIES-13.3] lets a category keep its own color once all 27 colors are used', async () => {
  await openManageCategories();
  await useAllColors();

  await openCategory('Travel');

  expect(colorButtons()).toEqual(
    expectedColors(
      PALETTE.filter((color) => color !== '#3949AB'),
      '#3949AB',
    ),
  );
  expect(formButton('Save').disabled).toBe(false);
  expect(screen.queryByText(ALL_COLORS_USED)).toBeNull();
});

test("[CATEGORIES-13.3] leaves a group's colors free once Manage Categories uses all 27", async () => {
  const groups = await createGroups('Brisbane');
  await reopenManageCategories();
  await useAllColors();
  await openGroupCategories(groups.Brisbane);

  await openNewCategory();

  expect(selectedColor()).toBe('#43A047');
  expect(screen.queryByText(ALL_COLORS_USED)).toBeNull();
  await fireEvent.changeText(nameField(), 'Garden');
  expect(formButton('Add').disabled).toBe(false);
});

test('[CATEGORIES-14.2] opens no form when Uncategorized is pressed', async () => {
  await openManageCategories();

  await fireEvent.press(screen.getByText('Uncategorized'));
  await settle();

  expect(showsTitle('Edit Category')).toBe(false);
  expect(screen.queryByLabelText('Category name')).toBeNull();
  expect(
    screen.queryByRole('button', { name: /Uncategorized/, disabled: false }),
  ).toBeNull();
});

test('[CATEGORIES-14.2] opens Edit Category for each of the other default categories', async () => {
  await openManageCategories();

  for (const [name, color] of DEFAULTS.slice(0, 8)) {
    await openCategory(name);
    expect(nameField()).toHaveDisplayValue(name, AS_TYPED);
    expect(selectedColor()).toBe(color);
    await press('Cancel');
    await expectFormClosed();
  }
});

test('[CATEGORIES-14.2] opens no form when Uncategorized is pressed in Group Categories', async () => {
  const groups = await createGroups('Brisbane');
  await openGroupCategories(groups.Brisbane);

  await fireEvent.press(screen.getByText('Uncategorized'));
  await settle();

  expect(showsTitle('Edit Category')).toBe(false);
  expect(screen.queryByLabelText('Category name')).toBeNull();
});

test('[CATEGORIES-15.1] closes New Category without adding anything', async () => {
  await openManageCategories();
  await openNewCategory();
  await fireEvent.changeText(nameField(), 'Gym');

  await press('Cancel');

  await expectFormClosed();
  expect(categoryList()).toEqual(DEFAULTS);
  await openNewCategory();
  expect(nameField()).toHaveDisplayValue('', AS_TYPED);
});

test('[CATEGORIES-15.1] closes Edit Category without changing the category', async () => {
  await openManageCategories();
  await openCategory('Shopping');
  await fireEvent.changeText(nameField(), 'Groceries');
  await pressColor('Select color #43A047');

  await press('Cancel');

  await expectFormClosed();
  expect(categoryList()).toEqual(DEFAULTS);
});

test('[CATEGORIES-16.1] reports a category that cannot be added and keeps the form as it was', async () => {
  await openManageCategories();
  await openNewCategory();
  await fireEvent.changeText(nameField(), 'Gym');
  failWrites();

  await press('Add');

  expect(alerts()).toEqual([SAVE_FAILED]);
  expect(showsTitle('New Category')).toBe(true);
  expect(nameField()).toHaveDisplayValue('Gym', AS_TYPED);
  expect(formButton('Add').disabled).toBe(false);
  await press('Cancel');
  await expectFormClosed();
  expect(categoryList()).toEqual(DEFAULTS);
});

test('[CATEGORIES-16.1] adds the category when Add is pressed again after writes recover', async () => {
  await openManageCategories();
  await openNewCategory();
  await fireEvent.changeText(nameField(), 'Gym');
  failWrites();
  await press('Add');
  allowWrites();

  await press('Add');

  await expectFormClosed();
  expect(categoryList()).toEqual([...DEFAULTS, ['Gym', '#43A047']]);
});

test('[CATEGORIES-16.1] reports a category that cannot be saved and leaves it unchanged', async () => {
  await openManageCategories();
  await openCategory('Shopping');
  await fireEvent.changeText(nameField(), 'Groceries');
  failWrites();

  await press('Save');

  expect(alerts()).toEqual([SAVE_FAILED]);
  expect(showsTitle('Edit Category')).toBe(true);
  await press('Cancel');
  await expectFormClosed();
  expect(categoryList()).toEqual(DEFAULTS);
});

test('[CATEGORIES-17.2] keeps added, renamed and recolored categories after the app restarts', async () => {
  const app = await openManageCategories();
  await addCategory('Gym', '#C62828');
  await editCategory('Shopping', 'Groceries', '#43A047');
  await app.unmount();

  await openManageCategories();

  expect(categoryList()).toEqual([
    ...replacing(2, ['Groceries', '#43A047']),
    ['Gym', '#C62828'],
  ]);
});

test('[CATEGORIES-18.1] disables Cancel and Add until a new category is saved', async () => {
  await openManageCategories();
  await openNewCategory();
  await fireEvent.changeText(nameField(), 'Gym');
  const writes = holdWrites();

  await press('Add');

  expect(formButton('Cancel').disabled).toBe(true);
  expect(formButton('Add').disabled).toBe(true);
  await press('Cancel');
  expect(showsTitle('New Category')).toBe(true);
  await writes.release();
  await settle();
  await expectFormClosed();
  expect(categoryList()).toEqual([...DEFAULTS, ['Gym', '#43A047']]);
});

test('[CATEGORIES-18.1] disables Cancel and Save until an edit is saved', async () => {
  await openManageCategories();
  await openCategory('Shopping');
  await fireEvent.changeText(nameField(), 'Groceries');
  const writes = holdWrites();

  await press('Save');

  expect(formButton('Cancel').disabled).toBe(true);
  expect(formButton('Save').disabled).toBe(true);
  await writes.release();
  await settle();
  await expectFormClosed();
  expect(categoryList()).toEqual(replacing(2, ['Groceries', '#FBC02D']));
});

test('[CATEGORIES-18.1] enables Cancel and Add again once the save fails', async () => {
  await openManageCategories();
  await openNewCategory();
  await fireEvent.changeText(nameField(), 'Gym');
  failWrites();

  await press('Add');

  expect(formButton('Cancel').disabled).toBe(false);
  expect(formButton('Add').disabled).toBe(false);
});

test('[CATEGORIES-21.1] locks the name and the colors until a new category is saved', async () => {
  await openManageCategories();
  await openNewCategory();
  await fireEvent.changeText(nameField(), 'Gym');
  const writes = holdWrites();

  await press('Add');

  expect(nameField()).toBeDisabled();
  await pressColor('Select color #C62828');
  expect(selectedColor()).toBe('#43A047');
  await writes.release();
  await settle();
  await expectFormClosed();
  expect(categoryList()).toEqual([...DEFAULTS, ['Gym', '#43A047']]);
});

test('[CATEGORIES-21.1] unlocks the name and the colors once the save fails', async () => {
  await openManageCategories();
  await openNewCategory();
  await fireEvent.changeText(nameField(), 'Gym');
  failWrites();

  await press('Add');

  expect(nameField()).toBeEnabled();
  await pressColor('Select color #C62828');
  expect(selectedColor()).toBe('#C62828');
});

test('[CATEGORIES-19.1] shows the load error and leaves the data as it was when a default category cannot be created', async () => {
  fs.writeFileSync(mockFile, ''); // An empty file is an empty SQLite database.
  const before = fs.readFileSync(mockFile);
  failWritesOfUncategorized();

  const app = await startApp('/settings');

  expect(
    await screen.findByText('Unable to Load Local Data'),
  ).toBeOnTheScreen();
  expect(screen.getByText('Your data was not changed.')).toBeOnTheScreen();
  expect(nativeViews(/^RNSTabsHost/)).toEqual([]);
  await app.unmount();
  await settle();
  expect(fs.readFileSync(mockFile)).toEqual(before);
});

test('[CATEGORIES-19.1] creates all nine default categories on the next start once writes recover', async () => {
  failWritesOfUncategorized();
  const app = await startApp('/settings');
  expect(
    await screen.findByText('Unable to Load Local Data'),
  ).toBeOnTheScreen();
  await app.unmount();
  allowWrites();

  await openManageCategories();

  expect(categoryList()).toEqual(DEFAULTS);
});

test('[CATEGORIES-22.2] lists the default and personal categories, without group categories, when opened from Settings', async () => {
  await setUpScopes();

  await reopenManageCategories();

  expect(categoriesTitles()).toEqual([MANAGE_CATEGORIES]);
  expect(listedNames()).toEqual([...DEFAULT_NAMES, 'Gym']);
});

test('[CATEGORIES-22.2] opens the personal scope when the URL has a group ID but not scopeKind=group', async () => {
  const groups = await setUpScopes();

  await restartAt(
    `/settings/manage-categories?spaceId=${groups.Brisbane}`,
    MANAGE_CATEGORIES,
  );

  expect(listedNames()).toEqual([...DEFAULT_NAMES, 'Gym']);
});

test('[CATEGORIES-22.2] adds a personal category when the URL has a group ID but not scopeKind=group', async () => {
  const groups = await setUpScopes();
  await restartAt(
    `/settings/manage-categories?spaceId=${groups.Brisbane}`,
    MANAGE_CATEGORIES,
  );

  await addCategory('Pets');

  await reopenManageCategories();
  expect(listedNames()).toEqual([...DEFAULT_NAMES, 'Gym', 'Pets']);
});

test("[CATEGORIES-23.3] lists only the group's own nine default categories in a new group's Group Categories", async () => {
  const groups = await createGroups('Brisbane');
  await reopenManageCategories();
  await addCategory('Gym');

  await openGroupCategories(groups.Brisbane);

  expect(categoriesTitles()).toEqual([GROUP_CATEGORIES]);
  expect(categoryList()).toEqual(DEFAULTS);
});

test("[CATEGORIES-23.3] leaves another group's categories out of Group Categories", async () => {
  const groups = await setUpScopes();

  await openGroupCategories(groups.Tokyo);

  expect(listedNames()).toEqual(DEFAULT_NAMES);
});

test.each(['?scopeKind=group', '?scopeKind=group&spaceId='])(
  '[CATEGORIES-24.1] opens the personal scope for %s',
  async (query) => {
    await setUpScopes();

    await restartAt(`/settings/manage-categories${query}`, MANAGE_CATEGORIES);

    expect(listedNames()).toEqual([...DEFAULT_NAMES, 'Gym']);
  },
);

test.each(['?scopeKind=group', '?scopeKind=group&spaceId='])(
  '[CATEGORIES-24.1] adds a personal category when opened with %s',
  async (query) => {
    await setUpScopes();
    await restartAt(`/settings/manage-categories${query}`, MANAGE_CATEGORIES);

    await addCategory('Pets');

    await reopenManageCategories();
    expect(listedNames()).toEqual([...DEFAULT_NAMES, 'Gym', 'Pets']);
  },
);

const NOT_A_GROUP: [
  string,
  (identity: LocalIdentity, shopping: Category) => string,
][] = [
  ['an ID no group has', () => '3f0d6c1e-8b2a-4d5e-9f7a-1c2b3d4e5f60'],
  ['your personal space ID', (identity) => identity.personalSpaceId],
  ['the ID of Shopping', (_identity, shopping) => shopping.id],
];

test.each(NOT_A_GROUP)(
  '[CATEGORIES-25.1] shows only Group not found. when spaceId is %s',
  async (_kind, idOf) => {
    await createGroups('Brisbane');
    const identity = await readIdentity();
    const shopping = await storedCategory('Shopping');
    if (shopping === undefined) throw new Error('No Shopping');

    await restartAt(
      groupCategoriesUrl(idOf(identity, shopping)),
      GROUP_CATEGORIES,
    );

    expect(await screen.findByText(GROUP_NOT_FOUND)).toBeOnTheScreen();
    expect(screen.queryByText('CATEGORIES')).toBeNull();
    expect(categoryList()).toEqual([]);
    expect(barItem('Add category', navigationBars())).toBeUndefined();
    expect(screen.queryByRole('button', { name: 'Add category' })).toBeNull();
  },
);

test('[CATEGORIES-26.1] lists a category added in Group Categories last there', async () => {
  const groups = await createGroups('Brisbane');
  await openGroupCategories(groups.Brisbane);
  await openNewCategory();
  await fireEvent.changeText(nameField(), 'Flights');

  await press('Add');

  await expectFormClosed();
  expect(categoryList()).toEqual([...DEFAULTS, ['Flights', '#43A047']]);
});

test("[CATEGORIES-26.1] keeps a group's category to that group after the app restarts", async () => {
  const groups = await createGroups('Brisbane', 'Tokyo');
  await openGroupCategories(groups.Brisbane);
  await addCategory('Flights');

  await openGroupCategories(groups.Brisbane);

  expect(listedNames()).toEqual([...DEFAULT_NAMES, 'Flights']);
  await reopenManageCategories();
  expect(listedNames()).toEqual(DEFAULT_NAMES);
  await openGroupCategories(groups.Tokyo);
  expect(listedNames()).toEqual(DEFAULT_NAMES);
});

test('[CATEGORIES-27.1] records you as the creator and your personal space as the space of a personal category', async () => {
  await createGroups();
  const identity = await readIdentity();
  await reopenManageCategories();

  await addCategory('Gym');

  expect(await storedCategory('Gym')).toMatchObject({
    createdByUserId: identity.userId,
    spaceId: identity.personalSpaceId,
  });
});

test("[CATEGORIES-27.1] records you as the creator and the group as the space of a group's category", async () => {
  const groups = await createGroups('Brisbane');
  const identity = await readIdentity();
  await openGroupCategories(groups.Brisbane);

  await addCategory('Flights');

  expect(await storedCategory('Flights')).toMatchObject({
    createdByUserId: identity.userId,
    spaceId: groups.Brisbane,
  });
});

test('[CATEGORIES-30.1] gives a new group nine default categories of its own', async () => {
  const groups = await createGroups('Brisbane');
  const identity = await readIdentity();

  await openGroupCategories(groups.Brisbane);

  expect(categoryList()).toEqual(DEFAULTS);
  expect(await namesAndColorsIn(groups.Brisbane)).toEqual(DEFAULTS);
  expect(await namesAndColorsIn(identity.personalSpaceId)).toEqual(DEFAULTS);
  const ids = (await storedCategories()).map(({ id }) => id);
  expect(new Set(ids).size).toBe(ids.length);
});

test('[CATEGORIES-30.1] gives a new group the default categories, not the personal ones as you changed them', async () => {
  await reopenManageCategories();
  await editCategory('Shopping', 'Groceries', '#43A047');

  const groups = await createGroups('Brisbane');

  expect(await namesAndColorsIn(groups.Brisbane)).toEqual(DEFAULTS);
});

test('[CATEGORIES-30.1] creates no group and no categories when a category of the new group cannot be written', async () => {
  running = await startGroupsApp('/groups');
  await saveName('Taylor');
  await pressAddGroup();
  await expectNewGroupOpen();
  await typeName('Brisbane');
  const before = localData(mockFile);
  failWritesOfUncategorized();

  await pressNewGroupButton('Create');

  expect(alertsShown(alert)).toEqual([CREATE_FAILED]);
  expect(newGroupIsOpen()).toBe(true);
  expect(localData(mockFile)).toEqual(before);
});

test('[CATEGORIES-31.1] changes a default category in Group Categories for that group only', async () => {
  const groups = await createGroups('Brisbane', 'Tokyo');
  await openGroupCategories(groups.Brisbane);

  await editCategory('Shopping', 'Groceries', '#43A047');

  expect(categoryList()).toEqual(replacing(2, ['Groceries', '#43A047']));
  await reopenManageCategories();
  expect(categoryList()).toEqual(DEFAULTS);
  await openGroupCategories(groups.Tokyo);
  expect(categoryList()).toEqual(DEFAULTS);
});

test('[CATEGORIES-31.1] changes a default category in Manage Categories for the personal scope only', async () => {
  const groups = await createGroups('Brisbane');
  await reopenManageCategories();

  await editCategory('Health', 'Medical', '#00ACC1');

  expect(categoryList()).toEqual(replacing(5, ['Medical', '#00ACC1']));
  await openGroupCategories(groups.Brisbane);
  expect(categoryList()).toEqual(DEFAULTS);
});

// Removing, archiving, restoring and moving expenses. These tests add expenses
// through New Expense on the Expenses tab while Manage Categories stays open on the
// Settings tab, and do Remove and Delete as a screen reader does, through the rows'
// accessibility actions; swiping a row is for the E2E flow (CATEGORIES-32.3). The
// Move list may be a screen of its own or a view, and its Cancel a navigation bar
// item or a view; the helpers find them either way.

const DELETE_CATEGORY = [
  'Delete Category?',
  'This permanently removes the category.',
];
const archiveAlert = (name: string, used: string) => [
  `Archive “${name}”?`,
  `This category is used by ${used}. Existing expenses will keep their category, but it will no longer appear for new expenses.`,
];
const UPDATE_FAILED = [
  'Unable to Update Category',
  'Your change could not be saved. Please try again.',
];
const ARCHIVED_FOOTER =
  'Archived categories remain on historical expenses and in Insights.';
const ABOUT_CATEGORIES = [
  'About Categories',
  'Tap a category to edit it. Swipe left to remove a category. Categories used by expenses can be archived or moved, so historical classifications stay intact. Uncategorized is reserved and cannot be renamed or removed.',
];
const GYM = ['Gym', '#43A047'];
const without = (name: string) => DEFAULTS.filter(([other]) => other !== name);
const namesWithout = (name: string) =>
  DEFAULT_NAMES.filter((other) => other !== name);

/** Lets `count` writes through, then fails every write after them. */
function failWritesAfter(count: number) {
  let left = count;
  mockBeforeWrite = () =>
    left-- > 0 ? Promise.resolve() : Promise.reject(new Error('disk full'));
}

/** The stored expenses, read through the ledger's listExpenses. */
async function storedExpenses(): Promise<Expense[]> {
  const database = openNodeDatabase(mockFile);
  try {
    return await listExpenses(database);
  } finally {
    await database.close();
  }
}

/** Adds an expense in `category` through New Expense, then goes back to the Settings tab. */
async function spendOn(category: string, title = 'Coffee run') {
  await tapTab('Expenses');
  await addExpense({ title, category });
  await tapTab('Settings');
  await settle();
}

/** Changes the category of the expense titled `title` through its Edit Expense, then goes back to the Settings tab. */
async function recategorize(title: string, category: string) {
  const expense = (await storedExpenses()).find(
    (candidate) => candidate.title === title,
  );
  if (expense === undefined) throw new Error(`No expense titled ${title}`);
  await editExpense(expense.id, { category });
  await tapTab('Settings');
  await settle();
}

/** The accessible names of the categories screen's views that offer the screen reader action `label`. */
const namesWithAction = (label: 'Remove' | 'Delete') =>
  namesWithActionIn(categoriesScreen(), label);

/** Does the screen reader action `label` of the categories screen's row named `name`. */
const doAction = (name: string, label: 'Remove' | 'Delete') =>
  doActionIn(categoriesScreen(), name, label);

const lastAlertButtons = (): AlertButton[] =>
  alert.mock.calls.at(-1)?.[2] ?? [];

/** Presses a button of the last alert and lets what it starts finish. */
async function chooseInAlert(text: string) {
  const button = lastAlertButtons().find(
    (candidate) => candidate.text === text,
  );
  if (button === undefined) throw new Error(`The last alert has no ${text}`);
  await act(async () => button.onPress?.());
  await settle();
}

/** Archives a category that expenses use: Remove, then Archive. */
async function archive(name: string) {
  await doAction(name, 'Remove');
  await chooseInAlert('Archive');
}

const archivedHeader = () => within(categoriesScreen()).queryByText('ARCHIVED');

/** What CATEGORIES and ARCHIVED list, top to bottom, as [name, color]. */
function sections() {
  const header = archivedHeader();
  const isArchived = (dot: NativeView) =>
    header !== null && inTreeOrder(header, dot);
  const rows = categoryRows();
  return {
    active: rows
      .filter(({ dot }) => !isArchived(dot))
      .map(({ category }) => category),
    archived: rows
      .filter(({ dot }) => isArchived(dot))
      .map(({ category }) => category),
  };
}

/** The row of an archived category, a button named Restore and its name. */
const restoreButton = (name: string) =>
  within(categoriesScreen()).getByRole('button', { name: `Restore ${name}` });

async function restore(name: string) {
  await fireEvent.press(restoreButton(name));
  await settle();
}

/** The personal category `name` as an expense stores it. */
async function asStored(name: string) {
  const category = (await storedCategories()).find(
    (candidate) => candidate.name === name,
  );
  if (category === undefined) throw new Error(`No category named ${name}`);
  return { id: category.id, name: category.name, color: category.color };
}

// The Move list

const moveTitle = (name: string) => `Move ${name} Expenses`;

const SCREEN = /^RNS(Modal)?Screen$/;

/** The nearest native screen around `view`. */
function screenAround(view: NativeView): NativeView | undefined {
  for (let outer = view.parent; outer; outer = outer.parent)
    if (SCREEN.test(String(outer.type))) return outer;
  return undefined;
}

/**
 * The open Move list of `name`: a screen with its title, or, drawn as a view, the
 * nearest view around a header with its title that holds its Cancel and the
 * categories to move to.
 */
function moveList(name: string): NativeView | undefined {
  const title = moveTitle(name);
  const bar = navigationBars()
    .filter((candidate) => candidate.props.title === title)
    .at(-1);
  if (bar !== undefined) return screenAround(bar) ?? bar;
  const header = screen.queryAllByRole('header', { name: title }).at(-1);
  for (let outer = header?.parent; outer; outer = outer.parent) {
    const buttons = within(outer).queryAllByRole('button').map(nameOf);
    if (buttons.includes('Cancel') && buttons.some((it) => it !== 'Cancel'))
      return outer;
  }
  return undefined;
}

function openMoveListOf(name: string) {
  const list = moveList(name);
  if (list === undefined) throw new Error(`${moveTitle(name)} is not open`);
  return list;
}

/** Remove, then Move Expenses…, on the category `name`. */
async function openMoveList(name: string) {
  await doAction(name, 'Remove');
  await chooseInAlert('Move Expenses…');
  await waitFor(() => expect(moveList(name)).toBeDefined());
  await settle();
}

/** The Move list's buttons named after `names`, in screen order, as [name, selected]. */
function moveOptions(name: string, names: readonly string[]) {
  return within(openMoveListOf(name))
    .getAllByRole('button')
    .map(
      (button) =>
        [
          nameOf(button),
          button.props.accessibilityState?.selected === true ||
            button.props['aria-selected'] === true,
        ] as const,
    )
    .filter(([option]) => names.includes(option));
}

const moveTarget = (name: string, target: string) =>
  within(openMoveListOf(name)).getByRole('button', { name: target });

/** Presses `target` in the Move list of `name` and lets the move finish. */
async function moveTo(name: string, target: string) {
  await fireEvent.press(moveTarget(name, target));
  await settle();
}

async function cancelMoveList(name: string) {
  const bars = navigationBars().filter(
    (bar) => bar.props.title === moveTitle(name),
  );
  const control =
    barItem('Cancel', bars) ?? viewButton('Cancel', openMoveListOf(name));
  if (control === undefined)
    throw new Error(`${moveTitle(name)} has no Cancel`);
  await control.press();
  await waitFor(() => expect(moveList(name)).toBeUndefined());
}

test('[CATEGORIES-7.4] leaves an archived category out of CATEGORIES and the others in their order', async () => {
  running = await openManageCategories();
  await spendOn('Health');

  await archive('Health');

  expect(sections().active).toEqual(without('Health'));
});

test('[CATEGORIES-8.3] skips the color of an archived category when New Category opens', async () => {
  running = await openManageCategories();
  await addCategory('Gym');
  await spendOn('Gym');
  await archive('Gym');

  await openNewCategory();

  expect(selectedColor()).toBe('#00ACC1');
});

test("[CATEGORIES-9.3] keeps an archived category's color in use", async () => {
  running = await openManageCategories();
  await addCategory('Gym');
  await spendOn('Gym');
  await archive('Gym');

  await openNewCategory();

  expect(colorButtons()).toEqual(
    expectedColors([...DEFAULT_COLORS, '#43A047'], '#00ACC1'),
  );
});

test("[CATEGORIES-9.3] keeps an archived category's color in use when editing", async () => {
  running = await openManageCategories();
  await addCategory('Gym');
  await spendOn('Gym');
  await archive('Gym');

  await openCategory('Shopping');

  expect(colorButtons()).toEqual(
    expectedColors(
      [...DEFAULT_COLORS.filter((color) => color !== '#FBC02D'), '#43A047'],
      '#FBC02D',
    ),
  );
});

test("[CATEGORIES-12.2] says the name exists when it is an archived category's", async () => {
  running = await openManageCategories();
  await addCategory('Gym');
  await spendOn('Gym');
  await archive('Gym');
  await openNewCategory();
  await fireEvent.changeText(nameField(), 'gym');

  await press('Add');

  expect(showsTitle('New Category')).toBe(true);
  expect(screen.getByText(ALREADY_EXISTS)).toBeOnTheScreen();
  await press('Cancel');
  await expectFormClosed();
  expect(sections()).toEqual({ active: DEFAULTS, archived: [GYM] });
});

test("[CATEGORIES-12.2] keeps Edit Category open when the name is an archived category's", async () => {
  running = await openManageCategories();
  await addCategory('Gym');
  await spendOn('Gym');
  await archive('Gym');
  await openCategory('Shopping');
  await fireEvent.changeText(nameField(), 'gym');

  await press('Save');

  expect(showsTitle('Edit Category')).toBe(true);
  expect(screen.getByText(ALREADY_EXISTS)).toBeOnTheScreen();
  await press('Cancel');
  await expectFormClosed();
  expect(sections()).toEqual({ active: DEFAULTS, archived: [GYM] });
});

test('[CATEGORIES-13.3] counts the colors of archived categories among the 27', async () => {
  running = await openManageCategories();
  await useAllColors();
  await spendOn('Gym');
  await archive('Gym');

  await openNewCategory();

  expect(colorButtons()).toEqual(expectedColors(PALETTE));
  expect(selectedColor()).toBeUndefined();
  expect(screen.getByText(ALL_COLORS_USED)).toBeOnTheScreen();
});

test('[CATEGORIES-17.2] keeps deletions, archives and restores after the app restarts', async () => {
  running = await openManageCategories();
  await addCategory('Gym');
  await spendOn('Gym');
  await spendOn('Health');
  await doAction('Other', 'Remove');
  await chooseInAlert('Delete');
  await archive('Gym');
  await archive('Health');
  await restore('Health');

  await reopenManageCategories();

  expect(sections()).toEqual({ active: without('Other'), archived: [GYM] });
});

test('[CATEGORIES-33.3] offers Remove on every category but Uncategorized', async () => {
  running = await openManageCategories();

  expect(namesWithAction('Remove')).toEqual(namesWithout('Uncategorized'));
  expect(namesWithAction('Delete')).toEqual([]);
});

test("[CATEGORIES-33.3] offers Remove on a group's categories but its Uncategorized", async () => {
  const groups = await createGroups('Brisbane');

  await openGroupCategories(groups.Brisbane);

  expect(namesWithAction('Remove')).toEqual(namesWithout('Uncategorized'));
});

test('[CATEGORIES-33.3] offers neither action on an archived category that expenses use', async () => {
  running = await openManageCategories();
  await addCategory('Gym');
  await spendOn('Gym');

  await archive('Gym');

  expect(restoreButton('Gym')).toBeOnTheScreen();
  expect(namesWithAction('Remove')).toEqual(namesWithout('Uncategorized'));
  expect(namesWithAction('Delete')).toEqual([]);
});

test('[CATEGORIES-33.3] offers Delete on an archived category once no expense uses it', async () => {
  running = await openManageCategories();
  await addCategory('Gym');
  await spendOn('Gym', 'Gym session');
  await archive('Gym');

  await recategorize('Gym session', 'Shopping');

  expect(namesWithAction('Delete')).toEqual(['Restore Gym']);
});

test('[CATEGORIES-34.1] asks before deleting a category no expense uses, then deletes it for good', async () => {
  running = await openManageCategories();
  await addCategory('Gym');

  await doAction('Gym', 'Remove');

  expect(alerts()).toEqual([DELETE_CATEGORY]);
  expect(lastAlertButtons().map(({ text }) => text)).toEqual([
    'Cancel',
    'Delete',
  ]);
  expect(lastAlertButtons()[1].style).toBe('destructive');
  await chooseInAlert('Delete');
  expect(sections()).toEqual({ active: DEFAULTS, archived: [] });
  expect((await storedCategories()).map(({ name }) => name)).not.toContain(
    'Gym',
  );
  await openNewCategory();
  expect(selectedColor()).toBe('#43A047');
  await fireEvent.changeText(nameField(), 'Gym');
  await press('Add');
  await expectFormClosed();
  expect(categoryList()).toEqual([...DEFAULTS, GYM]);
});

test('[CATEGORIES-34.1] deletes a default category, which New Expense no longer offers', async () => {
  running = await openManageCategories();

  await doAction('Other', 'Remove');
  await chooseInAlert('Delete');

  expect(sections().active).toEqual(without('Other'));
  await tapTab('Expenses');
  await openNewExpense();
  await openCategoryList();
  expect(categoryOptions(DEFAULT_NAMES).map(([name]) => name)).toEqual(
    namesWithout('Other'),
  );
});

test('[CATEGORIES-34.1] keeps the category when the deletion is cancelled', async () => {
  running = await openManageCategories();
  await doAction('Other', 'Remove');

  await chooseInAlert('Cancel');

  expect(sections()).toEqual({ active: DEFAULTS, archived: [] });
});

test("[CATEGORIES-34.1] deletes a group's category from that group only", async () => {
  const groups = await createGroups('Brisbane', 'Tokyo');
  await openGroupCategories(groups.Brisbane);

  await doAction('Shopping', 'Remove');
  await chooseInAlert('Delete');

  expect(listedNames()).toEqual(namesWithout('Shopping'));
  await reopenManageCategories();
  expect(listedNames()).toEqual(DEFAULT_NAMES);
  await openGroupCategories(groups.Tokyo);
  expect(listedNames()).toEqual(DEFAULT_NAMES);
});

test('[CATEGORIES-34.1] asks to delete a category whose only expense moved away while Manage Categories was open', async () => {
  running = await openManageCategories();
  await addCategory('Gym');
  await spendOn('Gym', 'Gym session');
  await recategorize('Gym session', 'Shopping');

  await doAction('Gym', 'Remove');

  expect(alerts()).toEqual([DELETE_CATEGORY]);
});

test('[CATEGORIES-34.1] deletes an archived category that no expense uses any more', async () => {
  running = await openManageCategories();
  await addCategory('Gym');
  await spendOn('Gym', 'Gym session');
  await archive('Gym');
  await recategorize('Gym session', 'Shopping');
  alert.mockClear();

  await doAction('Restore Gym', 'Delete');

  expect(alerts()).toEqual([DELETE_CATEGORY]);
  await chooseInAlert('Delete');
  expect(sections()).toEqual({ active: DEFAULTS, archived: [] });
  expect(archivedHeader()).toBeNull();
});

test('[CATEGORIES-35.1] asks to archive a category that one expense uses', async () => {
  running = await openManageCategories();
  await addCategory('Gym');
  await spendOn('Gym');
  await reopenManageCategories();

  await doAction('Gym', 'Remove');

  expect(alerts()).toEqual([archiveAlert('Gym', '1 expense')]);
  expect(lastAlertButtons().map(({ text }) => text)).toEqual([
    'Cancel',
    'Move Expenses…',
    'Archive',
  ]);
});

test('[CATEGORIES-35.1] counts two expenses in the plural', async () => {
  running = await openManageCategories();
  await addCategory('Gym');
  await spendOn('Gym');
  await spendOn('Gym');

  await doAction('Gym', 'Remove');

  expect(alerts()).toEqual([archiveAlert('Gym', '2 expenses')]);
});

test('[CATEGORIES-35.1] counts an expense added while Manage Categories was open', async () => {
  running = await openManageCategories();
  await addCategory('Gym');
  expect(namesWithAction('Remove')).toContain('Gym');

  await spendOn('Gym');
  await doAction('Gym', 'Remove');

  expect(alerts()).toEqual([archiveAlert('Gym', '1 expense')]);
});

test('[CATEGORIES-35.1] counts the expenses of a renamed category, which keep its old name', async () => {
  running = await openManageCategories();
  await addCategory('Gym');
  await spendOn('Gym');
  await editCategory('Gym', 'Fitness');

  await doAction('Fitness', 'Remove');

  expect(alerts()).toEqual([archiveAlert('Fitness', '1 expense')]);
});

test('[CATEGORIES-35.1] changes nothing when archiving is cancelled', async () => {
  running = await openManageCategories();
  await addCategory('Gym');
  await spendOn('Gym');
  const before = localData(mockFile);
  await doAction('Gym', 'Remove');

  await chooseInAlert('Cancel');

  expect(sections()).toEqual({ active: [...DEFAULTS, GYM], archived: [] });
  expect(localData(mockFile)).toEqual(before);
});

test('[CATEGORIES-36.1] archives a category and leaves its expenses as they were', async () => {
  running = await openManageCategories();
  await addCategory('Gym');
  await spendOn('Gym', 'Gym session');
  await spendOn('Gym', 'Spin class');
  const before = await storedExpenses();

  await archive('Gym');

  expect(sections()).toEqual({ active: DEFAULTS, archived: [GYM] });
  expect(restoreButton('Gym')).toBeOnTheScreen();
  expect(await storedExpenses()).toEqual(before);
});

test('[CATEGORIES-37.2] shows no ARCHIVED and no footer while nothing is archived', async () => {
  running = await openManageCategories();

  expect(archivedHeader()).toBeNull();
  expect(screen.queryByText(ARCHIVED_FOOTER)).toBeNull();
});

test('[CATEGORIES-37.2] lists archived categories under ARCHIVED in their stored order, each with Restore, then the footer', async () => {
  running = await openManageCategories();
  await addCategory('Gym');
  await spendOn('Gym');
  await spendOn('Health');

  await archive('Gym');
  await archive('Health');

  expect(sections()).toEqual({
    active: without('Health'),
    archived: [
      ['Health', '#F4511E'],
      ['Gym', '#43A047'],
    ],
  });
  const rows = [restoreButton('Health'), restoreButton('Gym')];
  for (const row of rows)
    expect(within(row).getByText('Restore')).toBeOnTheScreen();
  expect(
    inTreeOrder(
      within(categoriesScreen()).getByText('Uncategorized'),
      archivedHeader()!,
      ...rows,
      within(categoriesScreen()).getByText(ARCHIVED_FOOTER),
    ),
  ).toBe(true);
});

test("[CATEGORIES-37.2] shows a scope's archived categories in that scope only", async () => {
  const groups = await createGroups('Brisbane');
  await reopenManageCategories();
  await addCategory('Gym');
  await spendOn('Gym');
  await archive('Gym');

  await openGroupCategories(groups.Brisbane);

  expect(archivedHeader()).toBeNull();
  expect(categoryList()).toEqual(DEFAULTS);
});

test('[CATEGORIES-38.2] restores an archived category to its place when it is pressed', async () => {
  running = await openManageCategories();
  await spendOn('Health');
  await archive('Health');
  const before = await storedExpenses();

  await restore('Health');

  expect(showsTitle('Edit Category')).toBe(false);
  expect(sections()).toEqual({ active: DEFAULTS, archived: [] });
  expect(archivedHeader()).toBeNull();
  expect(await storedExpenses()).toEqual(before);
  await tapTab('Expenses');
  await openNewExpense();
  await openCategoryList();
  expect(categoryOptions(DEFAULT_NAMES).map(([name]) => name)).toEqual(
    DEFAULT_NAMES,
  );
});

test('[CATEGORIES-39.1] lists the other categories to move the expenses to, none selected', async () => {
  running = await openManageCategories();
  await addCategory('Gym');
  await spendOn('Gym');

  await openMoveList('Gym');

  expect(moveOptions('Gym', [...DEFAULT_NAMES, 'Gym'])).toEqual(
    DEFAULT_NAMES.map((name) => [name, false]),
  );
});

test("[CATEGORIES-39.1] leaves another scope's categories out of the Move list", async () => {
  await createGroups('Brisbane');
  await reopenManageCategories();
  await addCategory('Gym');
  await spendOn('Gym');

  await openMoveList('Gym');

  expect(
    moveOptions('Gym', [...DEFAULT_NAMES, 'Gym']).map(([name]) => name),
  ).toEqual(DEFAULT_NAMES);
});

test('[CATEGORIES-39.1] leaves archived categories out of the Move list', async () => {
  running = await openManageCategories();
  await addCategory('Gym');
  await spendOn('Gym');
  await spendOn('Health');
  await archive('Health');

  await openMoveList('Gym');

  expect(
    moveOptions('Gym', [...DEFAULT_NAMES, 'Gym']).map(([name]) => name),
  ).toEqual(namesWithout('Health'));
});

test('[CATEGORIES-39.1] closes the Move list and changes nothing when it is cancelled', async () => {
  running = await openManageCategories();
  await addCategory('Gym');
  await spendOn('Gym');
  const before = localData(mockFile);
  await openMoveList('Gym');

  await cancelMoveList('Gym');

  expect(sections()).toEqual({ active: [...DEFAULTS, GYM], archived: [] });
  expect(localData(mockFile)).toEqual(before);
});

test('[CATEGORIES-40.1] moves every expense of the category to the one pressed, then archives it', async () => {
  running = await openManageCategories();
  await addCategory('Gym');
  await spendOn('Gym', 'Gym session');
  await spendOn('Gym', 'Spin class');
  await spendOn('Health', 'Checkup');
  const before = await storedExpenses();
  const shopping = await asStored('Shopping');
  await openMoveList('Gym');

  await moveTo('Gym', 'Shopping');

  expect(moveList('Gym')).toBeUndefined();
  expect(await storedExpenses()).toEqual(
    before.map((expense) =>
      expense.title === 'Checkup'
        ? expense
        : { ...expense, category: shopping },
    ),
  );
  expect(sections()).toEqual({ active: DEFAULTS, archived: [GYM] });
  expect(namesWithAction('Delete')).toEqual(['Restore Gym']);
});

test('[CATEGORIES-40.1] stores the current name and color of the category moved to', async () => {
  running = await openManageCategories();
  await addCategory('Gym');
  await editCategory('Shopping', 'Groceries', '#00ACC1');
  await spendOn('Gym');
  await openMoveList('Gym');

  await moveTo('Gym', 'Groceries');

  expect((await storedExpenses()).map(({ category }) => category)).toEqual([
    await asStored('Groceries'),
  ]);
  expect(await asStored('Groceries')).toMatchObject({
    name: 'Groceries',
    color: '#00ACC1',
  });
});

test('[CATEGORIES-40.1] moves once when a category is pressed twice before the save finishes', async () => {
  running = await openManageCategories();
  await addCategory('Gym');
  await spendOn('Gym');
  await openMoveList('Gym');
  const target = moveTarget('Gym', 'Shopping');
  alert.mockClear();
  const writes = holdWrites();

  await act(async () => {
    await fireEvent.press(target);
    await fireEvent.press(target);
  });
  await writes.release();
  await settle();

  expect(alerts()).toEqual([]);
  expect((await storedExpenses()).map(({ category }) => category.name)).toEqual(
    ['Shopping'],
  );
  expect(sections()).toEqual({ active: DEFAULTS, archived: [GYM] });
});

test('[CATEGORIES-41.1] alerts and keeps the category when deleting cannot be written', async () => {
  running = await openManageCategories();
  await doAction('Other', 'Remove');
  failWrites();

  await chooseInAlert('Delete');

  expect(alerts().at(-1)).toEqual(UPDATE_FAILED);
  expect(sections()).toEqual({ active: DEFAULTS, archived: [] });
});

test('[CATEGORIES-41.1] alerts and keeps the category in CATEGORIES when archiving cannot be written', async () => {
  running = await openManageCategories();
  await addCategory('Gym');
  await spendOn('Gym');
  await doAction('Gym', 'Remove');
  failWrites();

  await chooseInAlert('Archive');

  expect(alerts().at(-1)).toEqual(UPDATE_FAILED);
  expect(sections()).toEqual({ active: [...DEFAULTS, GYM], archived: [] });
  expect(archivedHeader()).toBeNull();
});

test('[CATEGORIES-41.1] alerts and keeps the category archived when restoring cannot be written', async () => {
  running = await openManageCategories();
  await addCategory('Gym');
  await spendOn('Gym');
  await archive('Gym');
  failWrites();

  await restore('Gym');

  expect(alerts().at(-1)).toEqual(UPDATE_FAILED);
  expect(sections()).toEqual({ active: DEFAULTS, archived: [GYM] });
});

test('[CATEGORIES-41.1] moves no expense and archives nothing whichever write of the move fails', async () => {
  running = await openManageCategories();
  await addCategory('Gym');
  await spendOn('Gym', 'Gym session');
  await spendOn('Gym', 'Spin class');
  await openMoveList('Gym');
  const before = localData(mockFile);

  // Each attempt lets one more write through before the disk fills up, until
  // every write of the move gets through.
  let writesThrough = 0;
  for (; writesThrough < 20; writesThrough += 1) {
    alert.mockClear();
    failWritesAfter(writesThrough);
    await moveTo('Gym', 'Shopping');
    if (moveList('Gym') === undefined) break;
    expect(alerts()).toEqual([UPDATE_FAILED]);
    expect(localData(mockFile)).toEqual(before);
  }

  expect(writesThrough).toBeGreaterThan(0);
  expect((await storedExpenses()).map(({ category }) => category.name)).toEqual(
    ['Shopping', 'Shopping'],
  );
  expect(sections()).toEqual({ active: DEFAULTS, archived: [GYM] });
});

test('[CATEGORIES-41.1] moves the expenses when the category is pressed again after writes recover', async () => {
  running = await openManageCategories();
  await addCategory('Gym');
  await spendOn('Gym');
  await openMoveList('Gym');
  failWrites();
  await moveTo('Gym', 'Shopping');
  expect(alerts().at(-1)).toEqual(UPDATE_FAILED);
  expect(moveList('Gym')).toBeDefined();
  allowWrites();

  await moveTo('Gym', 'Shopping');

  expect(moveList('Gym')).toBeUndefined();
  expect((await storedExpenses()).map(({ category }) => category.name)).toEqual(
    ['Shopping'],
  );
  expect(sections()).toEqual({ active: DEFAULTS, archived: [GYM] });
});

test('[CATEGORIES-42.2] explains categories from About categories by the CATEGORIES header', async () => {
  running = await openManageCategories();
  const about = within(categoriesScreen()).getByRole('button', {
    name: 'About categories',
  });
  expect(
    inTreeOrder(
      within(categoriesScreen()).getByText('CATEGORIES'),
      about,
      within(categoriesScreen()).getByText('Food & Dining'),
    ),
  ).toBe(true);

  await fireEvent.press(about);

  expect(alerts()).toEqual([ABOUT_CATEGORIES]);
});

test('[CATEGORIES-42.2] explains categories in Group Categories too', async () => {
  const groups = await createGroups('Brisbane');
  await openGroupCategories(groups.Brisbane);
  alert.mockClear();

  await fireEvent.press(
    within(categoriesScreen()).getByRole('button', {
      name: 'About categories',
    }),
  );

  expect(alerts()).toEqual([ABOUT_CATEGORIES]);
});

test('[CATEGORIES-42.2] has no About categories when the group is not found', async () => {
  await createGroups('Brisbane');

  await restartAt(
    groupCategoriesUrl('3f0d6c1e-8b2a-4d5e-9f7a-1c2b3d4e5f60'),
    GROUP_CATEGORIES,
  );

  expect(screen.getByText(GROUP_NOT_FOUND)).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'About categories' })).toBeNull();
});

// An archived group's Group Categories. These tests archive a group through its
// card's Archive group action on the Groups root, and restore it on Archived
// Groups or with Restore Group on its screen, as the group archive tests do.

const CATEGORIES_READ_ONLY = 'Archived group. Categories are read-only.';
const FLIGHTS = ['Flights', '#43A047'];

/** Whether the categories screen says that its group is archived. */
const saysReadOnly = () =>
  within(categoriesScreen()).queryByText(CATEGORIES_READ_ONLY) !== null;

/** Whether Add category shows, as a navigation bar item or a view. */
const addCategoryShown = () =>
  barItem('Add category', navigationBars()) !== undefined ||
  screen.queryByRole('button', { name: 'Add category' }) !== null;

/** Those of `names` whose rows on the categories screen are buttons, disabled ones too. */
const rowButtons = (names: readonly string[]) =>
  names.filter(
    (name) =>
      within(categoriesScreen()).queryByRole('button', { name }) !== null,
  );

/**
 * Taps the row named `name` on the categories screen as a finger does. fireEvent
 * would also call a press handler that a component only takes as a prop, which a
 * row that is not a button never runs on a phone.
 */
async function tapRow(name: string) {
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  await user.press(within(categoriesScreen()).getByText(name));
  await settle();
}

/** Archives the group named `name` through its card on the Groups root. */
async function archiveGroup(name: string) {
  await tapTab('Groups');
  await waitFor(() => expect(cardNames()).toContain(`Open ${name}`));
  await archiveByAction(name);
}

/** Adds Flights in Brisbane's Group Categories, archives Brisbane and opens its Group Categories again. */
async function openArchivedBrisbane() {
  const groups = await createGroups('Brisbane');
  await openGroupCategories(groups.Brisbane);
  await addCategory('Flights');
  await archiveGroup('Brisbane');
  await openGroupCategories(groups.Brisbane);
}

test("[CATEGORIES-43.1] lists an archived group's categories below the read-only notice, without Add category or About categories", async () => {
  await openArchivedBrisbane();

  expect(categoriesTitles()).toEqual([GROUP_CATEGORIES]);
  expect(categoryList()).toEqual([...DEFAULTS, FLIGHTS]);
  const shown = within(categoriesScreen());
  expect(
    inTreeOrder(
      shown.getByText(CATEGORIES_READ_ONLY),
      shown.getByText('CATEGORIES'),
      shown.getByText('Food & Dining'),
    ),
  ).toBe(true);
  expect(addCategoryShown()).toBe(false);
  expect(screen.queryByRole('button', { name: 'About categories' })).toBeNull();
});

test('[CATEGORIES-43.1] opens no form when a category of an archived group is pressed', async () => {
  await openArchivedBrisbane();

  for (const name of ['Shopping', 'Flights', 'Uncategorized']) {
    await tapRow(name);
    expect(showsTitle('Edit Category')).toBe(false);
  }

  expect(screen.queryByLabelText('Category name')).toBeNull();
  expect(rowButtons([...DEFAULT_NAMES, 'Flights'])).toEqual([]);
});

test('[CATEGORIES-43.1] offers Remove on no category of an archived group', async () => {
  await openArchivedBrisbane();

  expect(categoryList()).toEqual([...DEFAULTS, FLIGHTS]);
  expect(namesWithAction('Remove')).toEqual([]);
});

test('[CATEGORIES-43.1] turns read-only when the group is archived on the Groups tab while its Group Categories is open', async () => {
  const groups = await createGroups('Brisbane');
  await openGroupCategories(groups.Brisbane);
  expect(addCategoryShown()).toBe(true);

  await archiveGroup('Brisbane');
  await tapTab('Settings');
  await settle();

  expect(saysReadOnly()).toBe(true);
  expect(addCategoryShown()).toBe(false);
  expect(screen.queryByRole('button', { name: 'About categories' })).toBeNull();
  expect(categoryList()).toEqual(DEFAULTS);
  expect(namesWithAction('Remove')).toEqual([]);
  await tapRow('Shopping');
  expect(showsTitle('Edit Category')).toBe(false);
});

test('[CATEGORIES-43.1] offers every action again once the group is restored on Archived Groups', async () => {
  const groups = await createGroups('Brisbane');
  await archiveGroup('Brisbane');
  await openGroupCategories(groups.Brisbane);
  expect(saysReadOnly()).toBe(true);
  await running?.unmount();
  running = await startApp('/settings');
  await openArchivedGroups();
  await pressRestore('Brisbane');

  await openGroupCategories(groups.Brisbane);

  expect(categoryList()).toEqual(DEFAULTS);
  expect(saysReadOnly()).toBe(false);
  expect(addCategoryButton().disabled).toBe(false);
  expect(
    within(categoriesScreen()).getByRole('button', {
      name: 'About categories',
    }),
  ).toBeOnTheScreen();
  expect(namesWithAction('Remove')).toEqual(namesWithout('Uncategorized'));
  await openCategory('Shopping');
  expect(nameField()).toHaveDisplayValue('Shopping', AS_TYPED);
});

test('[CATEGORIES-43.1] offers the actions again when the group is restored on the Groups tab while its Group Categories is open', async () => {
  const groups = await createGroups('Brisbane');
  await archiveGroup('Brisbane');
  await openGroupCategories(groups.Brisbane);
  expect(saysReadOnly()).toBe(true);

  await push(`/groups/${groups.Brisbane}`);
  await expectOpen('Brisbane');
  await waitFor(() => expect(textsOn('Brisbane')).toContain(GROUP_READ_ONLY));
  await pressRestoreGroup('Brisbane');
  await tapTab('Settings');
  await settle();

  expect(saysReadOnly()).toBe(false);
  expect(addCategoryButton().disabled).toBe(false);
  expect(
    within(categoriesScreen()).getByRole('button', {
      name: 'About categories',
    }),
  ).toBeOnTheScreen();
  expect(namesWithAction('Remove')).toEqual(namesWithout('Uncategorized'));
  await openCategory('Shopping');
  expect(nameField()).toHaveDisplayValue('Shopping', AS_TYPED);
});

test("[CATEGORIES-43.1] says read-only only on an archived group's Group Categories", async () => {
  const groups = await createGroups('Brisbane', 'Tokyo');
  await archiveGroup('Brisbane');
  await openGroupCategories(groups.Brisbane);
  expect(saysReadOnly()).toBe(true);

  await openGroupCategories(groups.Tokyo);
  expect(categoryList()).toEqual(DEFAULTS);
  expect(saysReadOnly()).toBe(false);
  expect(addCategoryButton().disabled).toBe(false);

  await reopenManageCategories();
  expect(categoryList()).toEqual(DEFAULTS);
  expect(saysReadOnly()).toBe(false);
  expect(addCategoryButton().disabled).toBe(false);
});

// SHELL-34.1 leaves out the colors of user data, such as a category's color.
const PALETTE_COLORS = new Set(
  PALETTE.map((color) => (processColor(color) as number) >>> 0),
);

/** The app's own colors inside `view` that stay the same in light and dark mode, and its texts left uncolored. */
function appColors(view: NativeView) {
  return {
    colors: new Map(
      [...fixedColors(view)].filter(
        ([, { color }]) => !PALETTE_COLORS.has(color),
      ),
    ),
    uncolored: textsWithoutColor(view),
  };
}

/** The background behind `view` as 0xAARRGGBB, when the platform draws it the same in both modes. */
function fixedBackgroundBehind(view: NativeView) {
  const color = processColor(backgroundBehind(view) as string);
  return typeof color === 'number' ? color >>> 0 : undefined;
}

/** The parts of the categories screen that archiving and About categories add, with Gym archived. */
const archivedParts = () => [
  archivedHeader()!,
  restoreButton('Gym'),
  within(categoriesScreen()).getByText(ARCHIVED_FOOTER),
  within(categoriesScreen()).getByRole('button', { name: 'About categories' }),
];

/** The Move list of Health: its title when it is a view, and its buttons. */
const moveListParts = () => [
  ...screen.queryAllByRole('header', { name: moveTitle('Health') }),
  ...within(openMoveListOf('Health')).getAllByRole('button'),
];

test("[SHELL-34.1] colors the read-only notice of an archived group's Group Categories with colors that follow the appearance", async () => {
  fakePhoneAppearance('light');
  const groups = await createGroups('Brisbane');
  await archiveGroup('Brisbane');
  await openGroupCategories(groups.Brisbane);
  // The notice with whatever holds it apart from CATEGORIES.
  const notice = () =>
    sectionOf(
      within(categoriesScreen()).getByText(CATEGORIES_READ_ONLY),
      within(categoriesScreen()).getByText('CATEGORIES'),
    );
  const light = appColors(notice());

  await switchPhoneTo('dark');
  const dark = appColors(notice());

  expect(colorsInBoth(light.colors, dark.colors)).toEqual([]);
  expect([...light.uncolored, ...dark.uncolored]).toEqual([]);
});

test('[SHELL-34.1] colors ARCHIVED, About categories and the Move list with colors that follow the appearance', async () => {
  fakePhoneAppearance('light');
  running = await openManageCategories();
  await addCategory('Gym');
  await spendOn('Gym');
  await spendOn('Health');
  await archive('Gym');
  const lightParts = archivedParts().map(appColors);
  const lightBehind = fixedBackgroundBehind(restoreButton('Gym'));
  await openMoveList('Health');
  const lightList = moveListParts().map(appColors);
  const lightListBehind = fixedBackgroundBehind(
    moveTarget('Health', 'Shopping'),
  );

  await switchPhoneTo('dark');
  const darkList = moveListParts().map(appColors);
  const darkListBehind = fixedBackgroundBehind(
    moveTarget('Health', 'Shopping'),
  );
  await cancelMoveList('Health');
  const darkParts = archivedParts().map(appColors);
  const darkBehind = fixedBackgroundBehind(restoreButton('Gym'));

  const inBoth = (light: typeof lightParts, dark: typeof lightParts) =>
    light.flatMap((part, index) =>
      colorsInBoth(part.colors, dark[index].colors),
    );
  expect(inBoth(lightParts, darkParts)).toEqual([]);
  expect(inBoth(lightList, darkList)).toEqual([]);
  expect(
    [lightBehind, lightListBehind].filter(
      (color, index) =>
        color !== undefined && color === [darkBehind, darkListBehind][index],
    ),
  ).toEqual([]);
  expect(
    [...lightParts, ...darkParts, ...lightList, ...darkList].flatMap(
      ({ uncolored }) => uncolored,
    ),
  ).toEqual([]);
});

/** The open category form: the sheet or screen around its name field. */
function categoryForm(): NativeView {
  for (let outer = nameField().parent; outer; outer = outer.parent)
    if (/^(Modal|RNS(Modal)?Screen)$/.test(String(outer.type))) return outer;
  throw new Error('The category form is not a sheet or a screen');
}

/**
 * What `part` shows that does not follow the appearance: the app's colors that stay
 * the same when the phone turns from light to dark mode, and the texts left uncolored.
 */
async function notFollowing(part: () => NativeView) {
  const light = appColors(part());
  await switchPhoneTo('dark');
  const dark = appColors(part());
  return {
    colors: colorsInBoth(light.colors, dark.colors),
    uncolored: [...light.uncolored, ...dark.uncolored],
  };
}

const FOLLOWS = { colors: [], uncolored: [] };

test('[SHELL-34.1] colors Manage Categories, its navigation bar and its categories with colors that follow the appearance', async () => {
  fakePhoneAppearance('light');
  running = await openManageCategories();

  expect(await notFollowing(categoriesScreen)).toEqual(FOLLOWS);
});

test('[SHELL-34.1] colors Group not found. with colors that follow the appearance', async () => {
  fakePhoneAppearance('light');
  await restartAt(
    groupCategoriesUrl('3f0d6c1e-8b2a-4d5e-9f7a-1c2b3d4e5f60'),
    GROUP_CATEGORIES,
  );
  expect(screen.getByText(GROUP_NOT_FOUND)).toBeOnTheScreen();

  expect(await notFollowing(categoriesScreen)).toEqual(FOLLOWS);
});

test('[SHELL-34.1] colors the category form with colors that follow the appearance while it says the name exists', async () => {
  fakePhoneAppearance('light');
  running = await openManageCategories();
  await openNewCategory();
  await fireEvent.changeText(nameField(), 'Shopping');
  await press('Add');
  expect(screen.getByText(ALREADY_EXISTS)).toBeOnTheScreen();

  expect(await notFollowing(categoryForm)).toEqual(FOLLOWS);
});

test('[SHELL-34.1] colors New Category with colors that follow the appearance once all 27 colors are used', async () => {
  fakePhoneAppearance('light');
  running = await openManageCategories();
  await useAllColors();
  await openNewCategory();
  expect(screen.getByText(ALL_COLORS_USED)).toBeOnTheScreen();

  expect(await notFollowing(categoryForm)).toEqual(FOLLOWS);
});
