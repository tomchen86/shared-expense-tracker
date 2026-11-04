import { Alert, type AlertButton } from 'react-native';
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react-native';
import { router } from 'expo-router';
import {
  navigationBars,
  nativeViews,
  push,
  tab,
  tapTab,
} from './shell-tabs-app';
import { settle } from './shell-appearance-app';
import { createGroup, groupsRoot, saveName, storedGroups } from './groups-app';
import {
  addMember,
  barTitled,
  expectClosed,
  goBackFrom,
  membersShown,
  openGroup,
  openMembers,
  openWithMembers,
  pressOnBar,
  removeMember,
  renameMember,
  screenOf,
} from './group-details-app';
import {
  archiveByAction,
  openArchivedGroups,
  pressRestore,
} from './group-archive-app';
import { listCategories } from '../../src/categories';
import { openNodeDatabase } from '../../src/storage/node';
import {
  categoryListView,
  chooseCategory,
  doAction,
  expectFormClosed,
  fillForm,
  formScreen,
  nameOf,
  openCategoryList,
  openNewExpense,
  press,
  startExpenses,
  type ExpenseInput,
} from './ledger-expense-app';
import { linesIn } from './ledger-expense-list-app';

// The group expense tests start the app as the expense form tests do
// (ledger-expense-app), save Taylor as your name, and create groups and add members
// as a person would, through the Groups tab (groups-app, group-details-app). They
// add group expenses through the expense form, and read them back through the
// ledger's listExpenses and from what the app shows. The form's lists (Select
// Group, Who Paid?, Split Between) may be screens of their own or views in the form,
// as the category list may: the helpers find each by its title, as a navigation bar
// title or a header. The switch may be React Native's Switch or another control
// with the switch role. Group screens and the details pushed from them are found by
// the titles of their navigation bars, on whichever tab shows them.

type HostView = ReturnType<typeof nativeViews>[number];

export const SPLIT = 'Split with others';
export const ADD_NEW_CATEGORY = '+ Add New Category';
export const FORMER_MEMBER_LOCK =
  "Someone in this expense was removed from this group, so its amount and split can't be changed here. Other details can still be saved.";
export const HISTORICAL = [
  'Historical Shared Expense',
  'Restore its group before editing this expense.',
];
export const SHARED_HISTORY = 'Shared history';
export const SHARED_HISTORY_TEXT =
  'Payments and shares are preserved as read-only history. Restore this group before editing.';
export const NO_GROUP_ID = '00000000-0000-4000-8000-000000000000';

// Starting with groups

/**
 * Starts the app as startExpenses does, saves Taylor as your name, and creates each
 * group in `groups` with its members, added in order; ends on the Expenses tab.
 */
export async function startWithGroups(
  groups: Record<string, readonly string[]> = {},
) {
  const app = await startExpenses();
  await saveName('Taylor');
  for (const [group, members] of Object.entries(groups)) {
    await createGroup(group);
    if (members.length === 0) continue;
    await openWithMembers(group, [...members]);
    await pressOnBar('Members', 'Close');
    await expectClosed('Members');
    await goBackFrom(group);
  }
  await tapTab('Expenses');
  return app;
}

/** The stored group named `group`, read through listGroups. */
export async function storedGroup(file: string, group: string) {
  const found = (await storedGroups(file)).find(
    (candidate) => candidate.name === group,
  );
  if (found === undefined) throw new Error(`No group named ${group}`);
  return found;
}

/** The member IDs of the group's current members, by name. */
export async function memberIds(file: string, group: string) {
  const { members } = await storedGroup(file, group);
  return Object.fromEntries(
    members.map((member) => [member.name, member.id]),
  ) as Record<string, string>;
}

/** A stored category of the space `spaceId` as an expense stores it: its ID, name and color. */
export async function categoryIn(file: string, spaceId: string, name: string) {
  const database = openNodeDatabase(file, { readOnly: true });
  try {
    const found = (await listCategories(database, spaceId)).find(
      (candidate) => candidate.name === name,
    );
    if (found === undefined) throw new Error(`No category named ${name}`);
    return { id: found.id, name: found.name, color: found.color };
  } finally {
    await database.close();
  }
}

// Changing groups as a person would, from the Groups tab

/** Opens the group's Members from the Groups root, does `change`, then goes back to the Groups root. */
async function inMembers(group: string, change: () => Promise<void>) {
  await tapTab('Groups');
  await openGroup(group);
  await openMembers(group);
  await change();
  await pressOnBar('Members', 'Close');
  await expectClosed('Members');
  await goBackFrom(group);
}

/** Removes `member` from the group. The test file spies on the iOS action sheet. */
export const removeFromGroup = (group: string, member: string) =>
  inMembers(group, async () => {
    await removeMember(member);
    await waitFor(() => expect(membersShown()).not.toContain(member));
  });

/** Adds `member` to the group, saying yes if the app asks to add a former member back. */
export const addToGroup = (group: string, member: string) =>
  inMembers(group, () => addMember(member));

/** Renames the member `from` of the group to `to`. */
export const renameInGroup = (group: string, from: string, to: string) =>
  inMembers(group, () => renameMember(from, to));

/** Archives the group through its card on the Groups root. */
export async function archiveGroup(group: string) {
  await tapTab('Groups');
  await archiveByAction(group);
  await waitFor(() =>
    expect(
      within(groupsRoot()).queryByRole('button', { name: `Open ${group}` }),
    ).toBeNull(),
  );
}

/** Restores the group from Archived Groups, then goes back to the Settings root. */
export async function restoreGroup(group: string) {
  await openArchivedGroups();
  await pressRestore(group);
  await goBackFrom('Archived Groups');
}

/** Archives the group category `name`: Remove on its row in the group's Group Categories, then Archive. */
export async function archiveGroupCategory(groupId: string, name: string) {
  await tapTab('Settings');
  await push(`/settings/manage-categories?scopeKind=group&spaceId=${groupId}`);
  await waitFor(() =>
    expect(navigationBars(tab('Settings')).at(-1)?.props.title).toBe(
      'Group Categories',
    ),
  );
  await settle();
  await doAction(tab('Settings'), name, 'Remove');
  await chooseInAlert('Archive');
  await act(async () => router.back());
  await waitFor(() =>
    expect(navigationBars(tab('Settings')).at(-1)?.props.title).toBe(
      'Settings',
    ),
  );
  await tapTab('Expenses');
  await settle();
}

// Names and states

const textOf = (node: HostView | string): string =>
  typeof node === 'string' ? node : node.children.map(textOf).join('');

export const isSelected = (view: HostView) =>
  view.props.accessibilityState?.selected === true ||
  view.props['aria-selected'] === true;

/** Whether a control is disabled: through its accessibility state, or as a native switch is. */
export const isDisabled = (view: HostView) =>
  view.props.accessibilityState?.disabled === true ||
  view.props['aria-disabled'] === true ||
  view.props.disabled === true ||
  view.props.enabled === false ||
  view.props.editable === false;

const isOn = (view: HostView) =>
  view.props.value === true ||
  view.props.on === true ||
  view.props.accessibilityState?.checked === true ||
  view.props['aria-checked'] === true;

const inForm = () => within(formScreen());

// The switch and the rows under it

/**
 * The switch, found by its role and name among the form's native views: React
 * Native's Switch on Android is a native view that the testing library's role
 * queries do not take for an accessibility element.
 */
export function splitSwitch() {
  const found = formScreen().queryAll(
    (view) =>
      typeof view.type === 'string' &&
      (view.props.accessibilityRole === 'switch' ||
        view.props.role === 'switch') &&
      nameOf(view) === SPLIT,
  );
  if (found.length !== 1)
    throw new Error(`Expected one ${SPLIT} switch, found ${found.length}`);
  return found[0];
}

export const isSplitOn = () => isOn(splitSwitch());

/** Turns the switch on or off, as the native switch reports a change, else with a press. */
export async function setSplit(on: boolean) {
  const control = splitSwitch();
  if (isOn(control) !== on) {
    if (typeof control.props.onChange === 'function')
      await fireEvent(control, 'change', { nativeEvent: { value: on } });
    else await fireEvent.press(control);
  }
  await settle();
}

const ROWS = /^(Group|Paid by|Split between), /;

/** The form's Group, Paid by and Split between buttons, top to bottom, by their names. */
export const splitRows = () =>
  inForm()
    .queryAllByRole('button')
    .map(nameOf)
    .filter((name) => ROWS.test(name));

/** The form's button whose name starts with `row`, such as Group. */
export function splitRow(row: 'Group' | 'Paid by' | 'Split between') {
  const found = inForm()
    .queryAllByRole('button')
    .find((button) => nameOf(button).startsWith(`${row}, `));
  if (found === undefined) throw new Error(`No ${row} on the form`);
  return found;
}

/** What the row says after its label, such as Brisbane for Group, Brisbane. */
export const rowValue = (row: 'Group' | 'Paid by' | 'Split between') =>
  nameOf(splitRow(row)).slice(row.length + 2);

// The lists the form opens

export type ListTitle = 'Select Group' | 'Who Paid?' | 'Split Between';

const CLOSERS: Record<ListTitle, string> = {
  'Select Group': 'Cancel',
  'Who Paid?': 'Cancel',
  'Split Between': 'Done',
};

const SCREEN = /^RNS(Modal)?Screen$/;

function screenAround(view: HostView): HostView | undefined {
  for (let outer = view.parent; outer; outer = outer.parent)
    if (SCREEN.test(String(outer.type))) return outer;
  return undefined;
}

/**
 * The open list titled `title`: a screen with that title; else the React Native
 * Modal around a header with that title; else, drawn as a view in the form, the
 * nearest view around the header that holds the list's Cancel or Done and another
 * button, or failing that just its Cancel or Done, as an empty list does.
 */
function listView(title: ListTitle): HostView | undefined {
  const bar = navigationBars()
    .filter((candidate) => candidate.props.title === title)
    .at(-1);
  if (bar !== undefined) return screenAround(bar) ?? bar;
  const header = screen.queryAllByRole('header', { name: title }).at(-1);
  if (header === undefined) return undefined;
  let withCloser: HostView | undefined;
  for (let outer = header.parent; outer; outer = outer.parent) {
    if (String(outer.type) === 'Modal') return outer;
    if (SCREEN.test(String(outer.type))) break;
    const names = within(outer).queryAllByRole('button').map(nameOf);
    if (!names.includes(CLOSERS[title])) continue;
    if (names.some((name) => name !== CLOSERS[title])) return outer;
    withCloser ??= outer;
  }
  return withCloser;
}

export const isListOpen = (title: ListTitle) => listView(title) !== undefined;

function openList(title: ListTitle) {
  const view = listView(title);
  if (view === undefined) throw new Error(`${title} is not open`);
  return view;
}

/** The names of the buttons that the list's navigation bar holds as iOS bar items. */
function barItemNames(title: ListTitle): string[] {
  const bar = barTitled(title);
  if (bar === undefined) return [];
  return (['Left', 'Right'] as const).flatMap((side) =>
    ((bar.props[`header${side}BarButtonItems`] as BarItem[] | undefined) ?? [])
      .filter((item) => item.type === 'button')
      .map((item) => item.accessibilityLabel || item.title || ''),
  );
}

/**
 * The buttons of the open list by name: those its navigation bar holds as iOS bar
 * items, then its views top to bottom, so its rows and, as a view, its Cancel or Done.
 */
export const listButtons = (title: ListTitle) => [
  ...barItemNames(title),
  ...within(openList(title)).queryAllByRole('button').map(nameOf),
];

/** The rows of the open list, top to bottom, as [name, selected]. */
export const listOptions = (title: ListTitle) =>
  within(openList(title))
    .queryAllByRole('button')
    .filter((button) => nameOf(button) !== CLOSERS[title])
    .map((button) => [nameOf(button), isSelected(button)] as const);

/** Presses the button named `name` in the open list. */
export async function pressInList(title: ListTitle, name: string) {
  const button = within(openList(title))
    .getAllByRole('button')
    .find((candidate) => nameOf(candidate) === name);
  if (button === undefined) throw new Error(`${title} has no ${name}`);
  await fireEvent.press(button);
  await settle();
}

export async function expectList(title: ListTitle) {
  await waitFor(() => expect(isListOpen(title)).toBe(true));
  await settle();
}

export async function expectListClosed(title: ListTitle) {
  await waitFor(() => expect(isListOpen(title)).toBe(false));
}

/** Presses the list's Cancel or Done, as its navigation bar or as a button. */
export async function closeList(title: ListTitle) {
  const bar = barTitled(title);
  if (bar !== undefined) await pressOnBar(title, CLOSERS[title]);
  else await pressInList(title, CLOSERS[title]);
  await expectListClosed(title);
}

/** Presses one of the form's rows and waits for the list it opens. */
export async function openRow(row: 'Group' | 'Paid by' | 'Split between') {
  await fireEvent.press(splitRow(row));
  const title: ListTitle =
    row === 'Group'
      ? 'Select Group'
      : row === 'Paid by'
        ? 'Who Paid?'
        : 'Split Between';
  await expectList(title);
}

/** Picks a group in the open Select Group. */
export async function pickGroup(name: string) {
  await pressInList('Select Group', name);
  await expectListClosed('Select Group');
}

/** Turns the switch on if it is off, then chooses the group named `name`. */
export async function chooseGroup(name: string) {
  if (!isSplitOn()) await setSplit(true);
  else await openRow('Group');
  await expectList('Select Group');
  await pickGroup(name);
}

/** Chooses the payer from Who Paid?, by the name the list shows, such as Taylor (You). */
export async function choosePayer(name: string) {
  await openRow('Paid by');
  await pressInList('Who Paid?', name);
  await expectListClosed('Who Paid?');
}

/** Presses each of `names` in Split Between, in order, with the list already open. */
export async function toggleSharers(...names: string[]) {
  for (const name of names) await pressInList('Split Between', name);
}

/** Opens Split Between, presses each of `names` in order, then presses Done. */
export async function chooseSharers(...names: string[]) {
  await openRow('Split between');
  await toggleSharers(...names);
  await closeList('Split Between');
}

// Adding group expenses through the form

export interface GroupExpenseInput extends ExpenseInput {
  group: string;
  /** The payer as Who Paid? shows them, such as Taylor (You). */
  payer: string;
  /** The people to split between, in the order to choose them. */
  sharers: string[];
}

/**
 * Fills the open New Expense: amount, title, note and date first, then the group,
 * the payer, the people to split between and, last, the category, which the
 * group's categories then hold.
 */
export async function fillGroupExpense({
  group,
  payer,
  sharers,
  category,
  ...input
}: GroupExpenseInput) {
  await fillForm({ amount: '100.01', title: 'Dinner', ...input });
  await chooseGroup(group);
  await choosePayer(payer);
  await chooseSharers(...sharers);
  if (category !== undefined) await chooseCategory(category);
}

/** Adds a group expense through New Expense on the Expenses tab: Dinner for 100.01 unless `input` says otherwise. */
export async function addGroupExpense(input: GroupExpenseInput) {
  await tapTab('Expenses');
  await openNewExpense();
  await fillGroupExpense(input);
  await press('Add');
  await expectFormClosed();
}

// The categories screen the form opens

const CATEGORY_SCREENS = ['Manage Categories', 'Group Categories'];

/** The navigation bar of the categories screen presented over the form, if one is open. */
export const categorySheetBar = () =>
  navigationBars()
    .filter((bar) => CATEGORY_SCREENS.includes(bar.props.title))
    .at(-1);

/** The title of the categories screen over the form, if one is open. */
export const categorySheetTitle = (): string | undefined =>
  categorySheetBar()?.props.title;

/** The native screen the categories screen over the form is presented in. */
export function categorySheet(): HostView {
  const title = categorySheetTitle();
  if (title === undefined) throw new Error('No categories screen is open');
  return screenOf(title);
}

export async function expectCategorySheet(title: string) {
  await waitFor(() => expect(categorySheetTitle()).toBe(title));
  await settle();
}

/** Opens the category list and presses + Add New Category. */
export async function openCategorySheet() {
  await openCategoryList();
  await fireEvent.press(
    within(categoryListView()).getByRole('button', { name: ADD_NEW_CATEGORY }),
  );
  await waitFor(() => expect(categorySheetTitle()).toBeDefined());
  await settle();
}

/** Presses Close on the categories screen over the form. */
export async function closeCategorySheet() {
  const title = categorySheetTitle();
  if (title === undefined) throw new Error('No categories screen is open');
  await pressOnBar(title, 'Close');
  await waitFor(() => expect(categorySheetTitle()).toBeUndefined());
  await settle();
}

/** Presses a button of the last alert. */
async function chooseInAlert(text: string) {
  const buttons: AlertButton[] =
    jest.mocked(Alert.alert).mock.calls.at(-1)?.[2] ?? [];
  const button = buttons.find((candidate) => candidate.text === text);
  if (button === undefined) throw new Error(`The last alert has no ${text}`);
  await act(async () => button.onPress?.());
  await settle();
}

/**
 * Presses `name` in the category form and waits for it to close: on its navigation
 * bar when it is a screen of its own, else the nearest button so named around its
 * name field, which is the form's and never the expense form's Add underneath.
 */
async function pressInCategoryForm(name: 'Add' | 'Save') {
  const title = name === 'Add' ? 'New Category' : 'Edit Category';
  if (barTitled(title) !== undefined) await pressOnBar(title, name);
  else {
    const field = screen.getByLabelText('Category name');
    let button: HostView | undefined;
    for (let outer = field.parent; outer && !button; outer = outer.parent)
      button = within(outer)
        .queryAllByRole('button')
        .find((candidate) => nameOf(candidate) === name);
    if (button === undefined)
      throw new Error(`The category form has no ${name}`);
    await fireEvent.press(button);
  }
  await settle();
  await waitFor(() =>
    expect(screen.queryByLabelText('Category name')).toBeNull(),
  );
}

/** Adds a category on the categories screen over the form. */
export async function addCategoryInSheet(name: string) {
  const title = categorySheetTitle();
  if (title === undefined) throw new Error('No categories screen is open');
  await pressOnBar(title, 'Add category');
  await fireEvent.changeText(
    await screen.findByLabelText('Category name'),
    name,
  );
  await pressInCategoryForm('Add');
}

/** Renames a category on the categories screen over the form. */
export async function renameCategoryInSheet(name: string, newName: string) {
  await fireEvent.press(within(categorySheet()).getByText(name));
  await fireEvent.changeText(
    await screen.findByLabelText('Category name'),
    newName,
  );
  await pressInCategoryForm('Save');
}

/** Removes a category on the categories screen over the form, then chooses `choice` in the alert. */
export async function removeCategoryInSheet(
  name: string,
  choice: 'Delete' | 'Archive',
) {
  await doAction(categorySheet(), name, 'Remove');
  await chooseInAlert(choice);
}

/**
 * The open Move list of `name`, found as categories.test.tsx finds it: a screen
 * with its title, or the nearest view around a header with its title that holds
 * its Cancel and the categories to move to.
 */
function moveListOf(name: string): HostView | undefined {
  const title = `Move ${name} Expenses`;
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

/** Moves a category's expenses to `to` on the categories screen over the form, which archives it. */
export async function moveExpensesInSheet(name: string, to: string) {
  await doAction(categorySheet(), name, 'Remove');
  await chooseInAlert('Move Expenses…');
  await waitFor(() => expect(moveListOf(name)).toBeDefined());
  await settle();
  await fireEvent.press(
    within(moveListOf(name)!).getByRole('button', { name: to }),
  );
  await settle();
}

// Group screens, on the Groups tab or, for archived groups, on the Settings tab

/** Whether `view` is in a title bar, which on iOS sits inside its screen. */
function inTitleBar(view: HostView) {
  for (let node = view.parent; node; node = node.parent)
    if (String(node.type) === 'RNSScreenStackHeaderConfig') return true;
  return false;
}

/** The buttons on the screen of the group named `group`, besides its title bar. */
const groupButtons = (group: string) =>
  within(screenOf(group))
    .queryAllByRole('button')
    .filter((button) => !inTitleBar(button));

/** The expense cards on the group's screen, top to bottom: its buttons besides +, Restore Group and your net balance. */
export const groupCards = (group: string) =>
  groupButtons(group).filter((button) => {
    const name = nameOf(button);
    return (
      name !== 'Add expense' &&
      name !== 'Restore Group' &&
      !/^(You're owed: |You owe: |Settled up)/.test(name)
    );
  });

/** The titles of the cards on the group's screen, top to bottom. */
export const groupCardTitles = (group: string) =>
  groupCards(group).map((shown) => linesIn(shown)[0]);

/** The card on the group's screen whose first line is `title`. */
export function groupCard(group: string, title: string) {
  const found = groupCards(group).find(
    (candidate) => linesIn(candidate)[0] === title,
  );
  if (found === undefined) throw new Error(`No card for ${title} on ${group}`);
  return found;
}

/**
 * Uses the Delete expense action of the card titled `title` on the group's screen,
 * as VoiceOver or TalkBack does; swiping to show Delete is a gesture only the E2E
 * flow makes (ADR-0008).
 */
export async function deleteFromGroup(group: string, title: string) {
  const view = groupCard(group, title);
  const actions: { name: string; label?: string }[] =
    view.props.accessibilityActions ?? [];
  const action = actions.find(
    (candidate) => (candidate.label ?? candidate.name) === 'Delete expense',
  );
  if (action === undefined)
    throw new Error(
      `The card of ${title} on ${group} has no Delete expense action`,
    );
  await fireEvent(view, 'accessibilityAction', {
    nativeEvent: { actionName: action.name },
  });
  await settle();
}

/** The group screen's + button, if it shows one. */
export const groupAddButton = (group: string) =>
  groupButtons(group).find((button) => nameOf(button) === 'Add expense');

/** The lines of text on the group's screen, top to bottom. */
export const groupLines = (group: string) => linesIn(screenOf(group));

// Details on any tab

/** The navigation bars of the expense details open on the tab `tabName`. */
export const detailBarsOn = (tabName: string) =>
  navigationBars(tab(tabName)).filter((bar) => bar.props.title === 'Expense');

function detailBarOn(tabName: string) {
  const bar = detailBarsOn(tabName).at(-1);
  if (bar === undefined) throw new Error(`No expense details on ${tabName}`);
  return bar;
}

/** The native screen of the details open on the tab `tabName`. */
export function detailScreenOn(tabName: string): HostView {
  for (let outer = detailBarOn(tabName).parent; outer; outer = outer.parent)
    if (String(outer.type) === 'RNSScreen') return outer;
  throw new Error('The details are not a screen');
}

/** The lines of text on the details open on the tab `tabName`, top to bottom. */
export const detailLinesOn = (tabName: string) =>
  linesIn(detailScreenOn(tabName));

export async function expectDetailsOn(tabName: string, title: string) {
  await waitFor(() => expect(detailBarsOn(tabName)).toHaveLength(1));
  await waitFor(() => expect(detailLinesOn(tabName)).toContain(title));
  await settle();
}

interface BarItem {
  type: string;
  title?: string;
  accessibilityLabel?: string;
  disabled?: boolean;
  buttonId?: string;
}

/** The details' Edit on the tab `tabName`: whether it shows, and whether it is disabled. */
export function editOn(tabName: string) {
  const bar = detailBarOn(tabName);
  const item = (
    (bar.props.headerRightBarButtonItems as BarItem[] | undefined) ?? []
  ).find(
    (candidate) =>
      candidate.type === 'button' &&
      (candidate.accessibilityLabel || candidate.title) === 'Edit',
  );
  if (item !== undefined)
    return {
      disabled: item.disabled === true,
      press: () =>
        item.disabled === true
          ? Promise.resolve()
          : fireEvent(bar, 'pressHeaderBarButtonItem', {
              nativeEvent: { buttonId: item.buttonId },
            }),
    };
  const button = within(bar).queryByRole('button', { name: 'Edit' });
  if (button === null) return undefined;
  return {
    disabled: isDisabled(button),
    press: () => fireEvent.press(button),
  };
}

/** The text of a view, for the rare check that needs more than its lines. */
export const shownText = (view: HostView) => textOf(view);
