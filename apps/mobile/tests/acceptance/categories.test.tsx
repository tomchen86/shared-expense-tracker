import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { AccessibilityInfo, Alert, StyleSheet } from 'react-native';
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
  startApp,
  tab,
} from './shell-tabs-app';
import {
  createGroup,
  readIdentity,
  saveName,
  startGroupsApp,
  storedGroups,
} from './groups-app';
import { listCategories, type Category } from '../../src/categories';
import { categoryMigrations } from '../../src/categories/migrations';
import type { LocalIdentity } from '../../src/shell';
import { appMigrations } from '../../src/shell/migrations';
import {
  runMigrations,
  type Database,
  type SqlExecutor,
  type SqlValue,
} from '../../src/storage';
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
let running: { unmount: () => void } | undefined;

beforeEach(() => {
  jest.clearAllMocks();
  running = undefined;
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'categories-'));
  mockFile = path.join(directory, 'app.db');
  allowWrites();
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
  const all = screen.UNSAFE_root.findAll(() => true);
  const indexes = views.map((view) => all.indexOf(view));
  return indexes.every(
    (index, position) =>
      index >= 0 && (position === 0 || index > indexes[position - 1]),
  );
}

/** Starts the app and opens Manage Categories from the Settings root. */
async function openManageCategories() {
  const app = await startApp('/settings');
  fireEvent.press(screen.getByText('Manage Categories'));
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
  return nativeViews(/./, categoriesScreen())
    .filter((view) => PALETTE.includes(backgroundOf(view) ?? ''))
    .map((dot) => {
      let row = dot.parent;
      while (row !== null && firstText(row) === undefined) row = row.parent;
      return [row === null ? undefined : firstText(row), backgroundOf(dot)];
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
  press: () => void;
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
      press: () => {
        if (!disabled)
          fireEvent(bar, 'pressHeaderBarButtonItem', {
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
  root = screen.UNSAFE_root,
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
  formButton(name).press();
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
  addCategoryButton().press();
  await expectForm('New Category');
}

async function openCategory(name: string) {
  fireEvent.press(screen.getByText(name));
  await expectForm('Edit Category');
}

/** Adds a category, in the first available color unless `color` is given. */
async function addCategory(name: string, color?: string) {
  await openNewCategory();
  fireEvent.changeText(nameField(), name);
  if (color !== undefined) pressColor(`Select color ${color}`);
  await press('Add');
  await expectFormClosed();
}

async function editCategory(name: string, newName: string, color?: string) {
  await openCategory(name);
  fireEvent.changeText(nameField(), newName);
  if (color !== undefined) pressColor(`Select color ${color}`);
  await press('Save');
  await expectFormClosed();
}

/** Adds four categories, which take the last four colors. */
async function useAllColors() {
  for (const name of ['Gym', 'Pets', 'Kids', 'Books']) await addCategory(name);
}

// Scopes

/** The names the open categories screen lists, top to bottom. */
const listedNames = () => categoryList().map(([name]) => name);

/** Ends the running app, if any, and starts it at `url` on the categories screen titled `title`. */
async function restartAt(url: string, title: string) {
  running?.unmount();
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
  running?.unmount();
  running = await openManageCategories();
}

/** Starts the app, saves your name and creates the groups; returns each group's ID by its name. */
async function createGroups(...names: string[]) {
  running?.unmount();
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

test('[CATEGORIES-6.1] lists the nine default categories in order with their colors on first start', async () => {
  await openManageCategories();

  expect(categoryList()).toEqual(DEFAULTS);
});

test('[CATEGORIES-6.1] does not create the default categories again when the app restarts', async () => {
  const app = await openManageCategories();
  app.unmount();

  await openManageCategories();

  expect(categoryList()).toEqual(DEFAULTS);
});

test('[CATEGORIES-7.2] lists the categories under CATEGORIES, with Add category in the navigation bar', async () => {
  await openManageCategories();

  const texts = ['CATEGORIES', ...DEFAULTS.map(([name]) => name)];
  expect(inOrder(texts)).toEqual(texts);
  expect(addCategoryButton().disabled).toBe(false);
});

test('[CATEGORIES-7.2] lists a new category after Uncategorized', async () => {
  await openManageCategories();

  await addCategory('Gym');

  expect(categoryList()).toEqual([...DEFAULTS, ['Gym', '#43A047']]);
});

test('[CATEGORIES-7.2] keeps a renamed category in its place', async () => {
  await openManageCategories();

  await editCategory('Shopping', 'Groceries');

  expect(categoryList()).toEqual(replacing(2, ['Groceries', '#FBC02D']));
});

test('[CATEGORIES-7.2] keeps the stored order in each scope when categories of other scopes come between', async () => {
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

test('[CATEGORIES-8.1] opens New Category with an empty name and the first unused color selected', async () => {
  await openManageCategories();

  await openNewCategory();

  expect(nameField()).toHaveDisplayValue('', AS_TYPED);
  expect(selectedColor()).toBe('#43A047');
});

test('[CATEGORIES-8.1] selects the next unused color once a new category takes the first', async () => {
  await openManageCategories();
  await addCategory('Gym');

  await openNewCategory();

  expect(selectedColor()).toBe('#00ACC1');
});

test('[CATEGORIES-8.1] opens Edit Category with the name and color of the category pressed', async () => {
  await openManageCategories();

  await openCategory('Shopping');

  expect(nameField()).toHaveDisplayValue('Shopping', AS_TYPED);
  expect(selectedColor()).toBe('#FBC02D');
});

test('[CATEGORIES-8.1] selects the first color that no category of any scope uses', async () => {
  const groups = await createGroups('Brisbane');
  await reopenManageCategories();
  await addCategory('Gym', '#43A047');
  await openGroupCategories(groups.Brisbane);

  await openNewCategory();

  expect(selectedColor()).toBe('#00ACC1');
});

test('[CATEGORIES-9.1] shows Cancel, Add, the name field and the 13 colors, with used colors disabled', async () => {
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

test("[CATEGORIES-9.1] shows Save and leaves the category's own color available when editing", async () => {
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

test('[CATEGORIES-9.1] selects a color when it is pressed, but not a used one', async () => {
  await openManageCategories();
  await openNewCategory();

  pressColor('Select color #C62828');
  pressColor('Color #D81B60 already in use');

  expect(colorButtons()).toEqual(expectedColors(DEFAULT_COLORS, '#C62828'));
});

test("[CATEGORIES-9.1] disables the color of another scope's category", async () => {
  const groups = await createGroups('Brisbane');
  await openGroupCategories(groups.Brisbane);
  await addCategory('Flights', '#C62828');
  await reopenManageCategories();

  await openNewCategory();

  expect(colorButtons()).toEqual(
    expectedColors([...DEFAULT_COLORS, '#C62828'], '#43A047'),
  );
});

test('[CATEGORIES-10.1] disables Add until the name has more than spaces', async () => {
  await openManageCategories();
  await openNewCategory();

  expect(formButton('Add').disabled).toBe(true);
  fireEvent.changeText(nameField(), '   ');
  expect(formButton('Add').disabled).toBe(true);
  fireEvent.changeText(nameField(), 'Gym');
  expect(formButton('Add').disabled).toBe(false);
});

test('[CATEGORIES-10.1] disables Save when the name is cleared', async () => {
  await openManageCategories();
  await openCategory('Shopping');

  fireEvent.changeText(nameField(), '');

  expect(formButton('Save').disabled).toBe(true);
});

test('[CATEGORIES-10.1] keeps 50 characters when 51 are typed into the name', async () => {
  await openManageCategories();
  await openNewCategory();
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

  await user.type(nameField(), 'a'.repeat(51));

  expect(nameField()).toHaveDisplayValue('a'.repeat(50), AS_TYPED);
});

test('[CATEGORIES-11.1] adds the trimmed name in the selected color and closes the form', async () => {
  await openManageCategories();
  await openNewCategory();
  fireEvent.changeText(nameField(), ' Gym ');
  pressColor('Select color #C62828');

  await press('Add');

  await expectFormClosed();
  expect(categoryList()).toEqual([...DEFAULTS, ['Gym', '#C62828']]);
});

test('[CATEGORIES-11.1] renames and recolors a default category', async () => {
  await openManageCategories();

  await editCategory('Shopping', 'Groceries', '#43A047');

  expect(categoryList()).toEqual(replacing(2, ['Groceries', '#43A047']));
});

test("[CATEGORIES-11.1] saves a change of letter case to the category's own name", async () => {
  await openManageCategories();
  await openCategory('Shopping');
  fireEvent.changeText(nameField(), 'SHOPPING');

  await press('Save');

  await expectFormClosed();
  expect(categoryList()).toEqual(replacing(2, ['SHOPPING', '#FBC02D']));
});

test('[CATEGORIES-11.1] adds one category when Add is pressed twice before the save finishes', async () => {
  await openManageCategories();
  await openNewCategory();
  fireEvent.changeText(nameField(), 'Gym');
  const writes = holdWrites();
  const add = formButton('Add');

  act(() => {
    add.press();
    add.press();
  });
  await writes.release();
  await settle();

  await expectFormClosed();
  expect(categoryList()).toEqual([...DEFAULTS, ['Gym', '#43A047']]);
});

test('[CATEGORIES-12.1] keeps New Category open and says below the name that the name exists', async () => {
  await openManageCategories();
  await openNewCategory();
  fireEvent.changeText(nameField(), 'food & dining');

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

test("[CATEGORIES-12.1] keeps Edit Category open when the name is another category's", async () => {
  await openManageCategories();
  await openCategory('Shopping');
  fireEvent.changeText(nameField(), ' travel ');

  await press('Save');

  expect(showsTitle('Edit Category')).toBe(true);
  expect(screen.getByText(ALREADY_EXISTS)).toBeOnTheScreen();
  expect(alerts()).toEqual([]);
  await press('Cancel');
  await expectFormClosed();
  expect(categoryList()).toEqual(DEFAULTS);
});

test('[CATEGORIES-12.1] stops saying the name exists once the name is edited', async () => {
  await openManageCategories();
  await openNewCategory();
  fireEvent.changeText(nameField(), 'food & dining');
  await press('Add');
  expect(screen.getByText(ALREADY_EXISTS)).toBeOnTheScreen();

  fireEvent.changeText(nameField(), 'food');

  expect(screen.queryByText(ALREADY_EXISTS)).toBeNull();
});

test.each(["Tokyo's Group Categories", MANAGE_CATEGORIES])(
  "[CATEGORIES-12.1] says the name exists in %s when Brisbane's category has it",
  async (where) => {
    const groups = await createGroups('Brisbane', 'Tokyo');
    await openGroupCategories(groups.Brisbane);
    await addCategory('Flights');
    if (where === MANAGE_CATEGORIES) await reopenManageCategories();
    else await openGroupCategories(groups.Tokyo);
    await openNewCategory();
    fireEvent.changeText(nameField(), 'flights');

    await press('Add');

    expect(showsTitle('New Category')).toBe(true);
    expect(screen.getByText(ALREADY_EXISTS)).toBeOnTheScreen();
    await press('Cancel');
    await expectFormClosed();
    expect(categoryList()).toEqual(DEFAULTS);
  },
);

test('[CATEGORIES-13.1] selects no color, disables Add and says so once all 13 colors are used', async () => {
  await openManageCategories();
  await useAllColors();

  await openNewCategory();

  expect(colorButtons()).toEqual(expectedColors(PALETTE));
  expect(screen.getByText(ALL_COLORS_USED)).toBeOnTheScreen();
  fireEvent.changeText(nameField(), 'Garden');
  expect(formButton('Add').disabled).toBe(true);
});

test('[CATEGORIES-13.1] lets a category keep its own color once all 13 colors are used', async () => {
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

test('[CATEGORIES-13.1] counts the colors of every scope toward all 13', async () => {
  const groups = await createGroups('Brisbane', 'Tokyo');
  await reopenManageCategories();
  await addCategory('Gym');
  await addCategory('Pets');
  await openGroupCategories(groups.Brisbane);
  await addCategory('Flights');
  await addCategory('Hotels');
  await openGroupCategories(groups.Tokyo);

  await openNewCategory();

  expect(colorButtons()).toEqual(expectedColors(PALETTE));
  expect(screen.getByText(ALL_COLORS_USED)).toBeOnTheScreen();
});

test('[CATEGORIES-14.1] opens no form when Uncategorized is pressed', async () => {
  await openManageCategories();

  fireEvent.press(screen.getByText('Uncategorized'));
  await settle();

  expect(showsTitle('Edit Category')).toBe(false);
  expect(screen.queryByLabelText('Category name')).toBeNull();
  expect(
    screen.queryByRole('button', { name: /Uncategorized/, disabled: false }),
  ).toBeNull();
});

test('[CATEGORIES-14.1] opens Edit Category for each of the other default categories', async () => {
  await openManageCategories();

  for (const [name, color] of DEFAULTS.slice(0, 8)) {
    await openCategory(name);
    expect(nameField()).toHaveDisplayValue(name, AS_TYPED);
    expect(selectedColor()).toBe(color);
    await press('Cancel');
    await expectFormClosed();
  }
});

test('[CATEGORIES-14.1] opens no form when Uncategorized is pressed in Group Categories', async () => {
  const groups = await createGroups('Brisbane');
  await openGroupCategories(groups.Brisbane);

  fireEvent.press(screen.getByText('Uncategorized'));
  await settle();

  expect(showsTitle('Edit Category')).toBe(false);
  expect(screen.queryByLabelText('Category name')).toBeNull();
});

test('[CATEGORIES-15.1] closes New Category without adding anything', async () => {
  await openManageCategories();
  await openNewCategory();
  fireEvent.changeText(nameField(), 'Gym');

  await press('Cancel');

  await expectFormClosed();
  expect(categoryList()).toEqual(DEFAULTS);
  await openNewCategory();
  expect(nameField()).toHaveDisplayValue('', AS_TYPED);
});

test('[CATEGORIES-15.1] closes Edit Category without changing the category', async () => {
  await openManageCategories();
  await openCategory('Shopping');
  fireEvent.changeText(nameField(), 'Groceries');
  pressColor('Select color #43A047');

  await press('Cancel');

  await expectFormClosed();
  expect(categoryList()).toEqual(DEFAULTS);
});

test('[CATEGORIES-16.1] reports a category that cannot be added and keeps the form as it was', async () => {
  await openManageCategories();
  await openNewCategory();
  fireEvent.changeText(nameField(), 'Gym');
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
  fireEvent.changeText(nameField(), 'Gym');
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
  fireEvent.changeText(nameField(), 'Groceries');
  failWrites();

  await press('Save');

  expect(alerts()).toEqual([SAVE_FAILED]);
  expect(showsTitle('Edit Category')).toBe(true);
  await press('Cancel');
  await expectFormClosed();
  expect(categoryList()).toEqual(DEFAULTS);
});

test('[CATEGORIES-17.1] keeps added, renamed and recolored categories after the app restarts', async () => {
  const app = await openManageCategories();
  await addCategory('Gym', '#C62828');
  await editCategory('Shopping', 'Groceries', '#43A047');
  app.unmount();

  await openManageCategories();

  expect(categoryList()).toEqual([
    ...replacing(2, ['Groceries', '#43A047']),
    ['Gym', '#C62828'],
  ]);
});

test('[CATEGORIES-18.1] disables Cancel and Add until a new category is saved', async () => {
  await openManageCategories();
  await openNewCategory();
  fireEvent.changeText(nameField(), 'Gym');
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
  fireEvent.changeText(nameField(), 'Groceries');
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
  fireEvent.changeText(nameField(), 'Gym');
  failWrites();

  await press('Add');

  expect(formButton('Cancel').disabled).toBe(false);
  expect(formButton('Add').disabled).toBe(false);
});

test('[CATEGORIES-21.1] locks the name and the colors until a new category is saved', async () => {
  await openManageCategories();
  await openNewCategory();
  fireEvent.changeText(nameField(), 'Gym');
  const writes = holdWrites();

  await press('Add');

  expect(nameField()).toBeDisabled();
  pressColor('Select color #C62828');
  expect(selectedColor()).toBe('#43A047');
  await writes.release();
  await settle();
  await expectFormClosed();
  expect(categoryList()).toEqual([...DEFAULTS, ['Gym', '#43A047']]);
});

test('[CATEGORIES-21.1] unlocks the name and the colors once the save fails', async () => {
  await openManageCategories();
  await openNewCategory();
  fireEvent.changeText(nameField(), 'Gym');
  failWrites();

  await press('Add');

  expect(nameField()).toBeEnabled();
  pressColor('Select color #C62828');
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
  app.unmount();
  await settle();
  expect(fs.readFileSync(mockFile)).toEqual(before);
});

test('[CATEGORIES-19.1] creates all nine default categories on the next start once writes recover', async () => {
  failWritesOfUncategorized();
  const app = await startApp('/settings');
  expect(
    await screen.findByText('Unable to Load Local Data'),
  ).toBeOnTheScreen();
  app.unmount();
  allowWrites();

  await openManageCategories();

  expect(categoryList()).toEqual(DEFAULTS);
});

test('[CATEGORIES-22.1] lists the default and personal categories, without group categories, when opened from Settings', async () => {
  await setUpScopes();

  await reopenManageCategories();

  expect(categoriesTitles()).toEqual([MANAGE_CATEGORIES]);
  expect(listedNames()).toEqual([...DEFAULT_NAMES, 'Gym']);
});

test('[CATEGORIES-22.1] opens the personal scope when the URL has a group ID but not scopeKind=group', async () => {
  const groups = await setUpScopes();

  await restartAt(
    `/settings/manage-categories?spaceId=${groups.Brisbane}`,
    MANAGE_CATEGORIES,
  );

  expect(listedNames()).toEqual([...DEFAULT_NAMES, 'Gym']);
});

test("[CATEGORIES-23.1] lists only the default categories in a new group's Group Categories", async () => {
  const groups = await createGroups('Brisbane');
  await reopenManageCategories();
  await addCategory('Gym');

  await openGroupCategories(groups.Brisbane);

  expect(categoriesTitles()).toEqual([GROUP_CATEGORIES]);
  expect(categoryList()).toEqual(DEFAULTS);
});

test("[CATEGORIES-23.1] leaves another group's categories out of Group Categories", async () => {
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

test('[CATEGORIES-24.1] adds a personal category when scopeKind=group comes without spaceId', async () => {
  await setUpScopes();
  await restartAt(
    '/settings/manage-categories?scopeKind=group',
    MANAGE_CATEGORIES,
  );

  await addCategory('Pets');

  await reopenManageCategories();
  expect(listedNames()).toEqual([...DEFAULT_NAMES, 'Gym', 'Pets']);
});

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
  fireEvent.changeText(nameField(), 'Flights');

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

test('[CATEGORIES-28.1] keeps the categories added before categories had scopes as personal categories', async () => {
  // The local data as an app without category scopes left it: the migrations up to
  // the categories table, then your identity, the default categories and Gym in the
  // columns those migrations made.
  const previous = appMigrations.slice(
    0,
    appMigrations.indexOf(categoryMigrations[0]) + 1,
  );
  const database = openNodeDatabase(mockFile);
  try {
    await runMigrations(database, previous);
    await database.run(
      'INSERT INTO local_identity (singleton, userId, personalSpaceId, personalParticipantId, name) VALUES (1, ?, ?, ?, ?)',
      [randomUUID(), randomUUID(), randomUUID(), 'Taylor'],
    );
    for (const [index, [name, color]] of [
      ...DEFAULTS,
      ['Gym', '#43A047'],
    ].entries()) {
      await database.run(
        'INSERT INTO categories (id, name, color, isDefault, position) VALUES (?, ?, ?, ?, ?)',
        [randomUUID(), name, color, index < DEFAULTS.length ? 1 : 0, index + 1],
      );
    }
  } finally {
    await database.close();
  }
  const groups = await createGroups('Brisbane');

  await reopenManageCategories();

  expect(listedNames()).toEqual([...DEFAULT_NAMES, 'Gym']);
  await openGroupCategories(groups.Brisbane);
  expect(listedNames()).toEqual(DEFAULT_NAMES);
});

test('[CATEGORIES-29.1] shows a default category changed in Group Categories the same way in every scope', async () => {
  const groups = await createGroups('Brisbane', 'Tokyo');
  await openGroupCategories(groups.Brisbane);

  await editCategory('Shopping', 'Groceries', '#43A047');

  const changed = replacing(2, ['Groceries', '#43A047']);
  expect(categoryList()).toEqual(changed);
  await reopenManageCategories();
  expect(categoryList()).toEqual(changed);
  await openGroupCategories(groups.Tokyo);
  expect(categoryList()).toEqual(changed);
});
