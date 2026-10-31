import { ActionSheetIOS, Alert, type AlertButton } from 'react-native';
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react-native';
import type { GroupMember } from '../../src/groups';
import { nativeViews, navigationBars } from './shell-tabs-app';
import { groupsRoot, storedGroups } from './groups-app';
import { settle } from './shell-appearance-app';

// The group details tests open a group's screen from its card and the sheets it
// opens, as a person would, and read the groups back through listGroups. They find
// each screen or sheet by the title of its navigation bar, wherever the app shows
// it, and press its title bar actions as the native bar reports a press on iOS, or
// as React Native buttons on Android. A member's menu is an action sheet on iOS and
// a dialog on Android: the test files spy on both, and the tests read whichever
// opened.

type HostView = ReturnType<typeof nativeViews>[number];

export const NO_EXPENSES = 'No expenses in this group yet.';
export const NOT_FOUND = 'Group not found.';
export const ALREADY_EXISTS = 'A member with this name already exists.';
export const RETAINED =
  'If removed, their historical payments and shares will be retained.';
export const REMOVE_FAILED = [
  'Unable to Remove Member',
  'The member could not be removed. Please try again.',
];
export const ADD_FAILED = [
  'Unable to Add Member',
  'The member could not be saved. Please try again.',
];
export const RENAME_MEMBER_FAILED = [
  'Unable to Rename Member',
  'The member could not be saved. Please try again.',
];
export const RENAME_GROUP_FAILED = [
  'Unable to Rename Group',
  'Your group could not be saved. Please try again.',
];
export const SETTINGS_FAILED = [
  'Unable to Save Settings',
  'Your settings could not be saved. Please try again.',
];

/** The title and message of the alert that asks to add the former member `name` back. */
export const addBackAlert = (name: string) => [
  `Add ${name} Back?`,
  `${name} was removed from this group before. Adding them back reconnects their past payments and shares.`,
];

// Navigation bars and sheets

/** The navigation bar titled `title`, wherever the app shows it. */
export const barTitled = (title: string) =>
  navigationBars().find((bar) => bar.props.title === title);

export const isOpen = (title: string) => barTitled(title) !== undefined;

export async function expectOpen(title: string) {
  await waitFor(() => expect(isOpen(title)).toBe(true));
}

export async function expectClosed(title: string) {
  await waitFor(() => expect(isOpen(title)).toBe(false));
}

const isScreen = (view: HostView) =>
  /^RNS(Modal)?Screen$/.test(String(view.type));

const presentedOtherThanByPush = (view: HostView) => {
  const presentation: unknown = view.props.stackPresentation;
  return presentation !== undefined && presentation !== 'push';
};

/**
 * The native screen that shows the bar titled `title`. On iOS a modal screen holds
 * a stack of its own for its navigation bar, so this is the nearest screen out from
 * the bar that is presented other than by a push, if there is one.
 */
export function screenOf(title: string): HostView {
  const bar = barTitled(title);
  if (bar === undefined) throw new Error(`${title} is not open`);
  let nearest: HostView | undefined;
  for (let view = bar.parent; view; view = view.parent) {
    if (!isScreen(view)) continue;
    nearest ??= view;
    if (presentedOtherThanByPush(view)) return view;
  }
  if (nearest === undefined) throw new Error(`${title} is on no screen`);
  return nearest;
}

/** Whether `view` is part of what `owner` shows, not of its title bar or of a sheet over it. */
function inContentOf(owner: HostView, view: HostView) {
  for (let node = view.parent; node; node = node.parent) {
    if (node === owner) return true;
    if (String(node.type) === 'RNSScreenStackHeaderConfig') return false;
    if (isScreen(node) && presentedOtherThanByPush(node)) return false;
  }
  return false;
}

/** Whether the native screen refuses to be swiped down, as a native sheet is otherwise. */
export const refusesSwipeDown = (view: HostView) =>
  view.props.gestureEnabled === false ||
  view.props.preventNativeDismiss === true;

/** Swipes the sheet titled `title` down, which the native sheet reports as dismissed. */
export async function swipeDown(title: string) {
  const sheet = screenOf(title);
  if (refusesSwipeDown(sheet)) return;
  act(() => {
    fireEvent(sheet, 'dismissed', { nativeEvent: { dismissCount: 1 } });
  });
  await settle();
}

/** Goes back from the pushed screen titled `title`, which the native stack reports as dismissed. */
export async function goBackFrom(title: string) {
  act(() => {
    fireEvent(screenOf(title), 'dismissed', {
      nativeEvent: { dismissCount: 1 },
    });
  });
  await settle();
}

const textOf = (view: HostView): string =>
  view.children
    .map((child) => (typeof child === 'string' ? child : textOf(child)))
    .join('');

const accessibleName = (view: HostView): string =>
  view.props.accessibilityLabel ?? view.props['aria-label'] ?? textOf(view);

const isDisabled = (view: HostView) =>
  view.props.accessibilityState?.disabled === true ||
  view.props['aria-disabled'] === true;

/** The texts that `title`'s screen or sheet shows itself, top to bottom. */
export function textsOn(title: string) {
  const owner = screenOf(title);
  return within(owner)
    .queryAllByText(/./)
    .filter((view) => inContentOf(owner, view))
    .map(textOf);
}

// Title bar actions

interface BarMenuItem {
  title?: string;
  menuId?: string;
  disabled?: boolean;
}

interface BarItem {
  type: string;
  title?: string;
  accessibilityLabel?: string;
  variant?: string;
  disabled?: boolean;
  buttonId?: string;
  icon?: { type?: string; name?: string };
  menu?: { items: BarMenuItem[] };
}

const barItemsOn = (bar: HostView, side: 'Left' | 'Right'): BarItem[] =>
  bar.props[`header${side}BarButtonItems`] ?? [];

function describeBarItem(item: BarItem) {
  if (item.type === 'menu')
    return {
      menu: item.accessibilityLabel,
      icon: item.icon?.type === 'sfSymbol' ? item.icon.name : item.icon,
      items: (item.menu?.items ?? []).map((entry) =>
        entry.disabled ? `${entry.title} (disabled)` : entry.title,
      ),
    };
  return `${item.title} (${item.variant ?? 'plain'})`;
}

/** The iOS bar items on each side of the bar titled `title`; the right side starts from the trailing edge. */
export function barItems(title: string) {
  const bar = barTitled(title);
  if (bar === undefined) throw new Error(`${title} is not open`);
  return {
    left: barItemsOn(bar, 'Left').map(describeBarItem),
    right: barItemsOn(bar, 'Right').map(describeBarItem),
  };
}

/** The Android header buttons on each side of the bar titled `title`, left to right. */
export function headerButtons(title: string) {
  const bar = barTitled(title);
  if (bar === undefined) throw new Error(`${title} is not open`);
  const sides: Record<'left' | 'right', string[]> = { left: [], right: [] };
  for (const subview of nativeViews(/^RNSScreenStackHeaderSubview$/, bar)) {
    const side: unknown = subview.props.type;
    if (side === 'left' || side === 'right')
      sides[side].push(
        ...within(subview).queryAllByRole('button').map(accessibleName),
      );
  }
  return sides;
}

interface Control {
  disabled: boolean;
  press: () => void;
}

/** A button on the bar titled `title`: an iOS bar button or an Android header button. */
export function barAction(title: string, name: string): Control {
  const bar = barTitled(title);
  if (bar === undefined) throw new Error(`${title} is not open`);
  const item = [...barItemsOn(bar, 'Left'), ...barItemsOn(bar, 'Right')].find(
    (candidate) =>
      candidate.type === 'button' &&
      (candidate.accessibilityLabel || candidate.title) === name,
  );
  if (item !== undefined) {
    const disabled = item.disabled === true;
    return {
      disabled,
      // The native bar reports a press by the button's ID, and none when disabled.
      press: () => {
        if (!disabled)
          fireEvent(bar, 'pressHeaderBarButtonItem', {
            nativeEvent: { buttonId: item.buttonId },
          });
      },
    };
  }
  const button = within(bar).getByRole('button', { name });
  const disabled = isDisabled(button);
  return {
    disabled,
    press: () => {
      if (!disabled) fireEvent.press(button);
    },
  };
}

/** Presses a button on the bar titled `title` and lets the save, if any, finish. */
export async function pressOnBar(title: string, name: string) {
  barAction(title, name).press();
  await settle();
}

// Alerts

const alerts = () => jest.mocked(Alert.alert).mock.calls;

/** The alerts shown so far, as [title, message]. */
export const alertsShown = () => alerts().map((call) => call.slice(0, 2));

const buttonsOfLastAlert = (): AlertButton[] => alerts().at(-1)?.[2] ?? [];

export const lastAlertButtons = () =>
  buttonsOfLastAlert().map((button) => button.text);

/** Taps a button of the last alert, which runs its action, if it has one. */
export async function pressAlertButton(text: string) {
  const button = buttonsOfLastAlert().find(
    (candidate) => candidate.text === text,
  );
  if (button === undefined) throw new Error(`No ${text} in the last alert`);
  act(() => button.onPress?.());
  await settle();
}

// The group's screen

export async function openGroup(name: string) {
  fireEvent.press(
    within(groupsRoot()).getByRole('button', { name: `Open ${name}` }),
  );
  await settle();
  await expectOpen(name);
}

/**
 * Chooses an action of the Group actions menu on the screen of the group named
 * `group`: from the native menu on iOS, or from the dialog of the more_vert button
 * on Android.
 */
export async function chooseGroupAction(group: string, action: string) {
  const bar = barTitled(group);
  if (bar === undefined) throw new Error(`${group} is not open`);
  const entry = barItemsOn(bar, 'Right')
    .flatMap((item) => item.menu?.items ?? [])
    .find((candidate) => candidate.title === action);
  if (entry !== undefined) {
    if (!entry.disabled)
      fireEvent(bar, 'pressHeaderBarButtonMenuItem', {
        nativeEvent: { menuId: entry.menuId },
      });
    await settle();
    return;
  }
  fireEvent.press(within(bar).getByRole('button', { name: 'Group actions' }));
  await settle();
  await pressAlertButton(action);
}

// Members

export async function openMembers(group: string) {
  await chooseGroupAction(group, 'Members');
  await expectOpen('Members');
  // The members are read from the local data once Members opens.
  await waitFor(() =>
    expect(membersShown().some((row) => row.endsWith(' (You)'))).toBe(true),
  );
}

/** The buttons and the row marked (You) that Members shows itself, top to bottom. */
function memberRows() {
  const members = screenOf('Members');
  const all = members.findAll(() => true);
  return [
    ...within(members).queryAllByText(/^.+ \(You\)$/),
    ...within(members).queryAllByRole('button'),
  ]
    .filter((view) => inContentOf(members, view))
    .sort((a, b) => all.indexOf(a) - all.indexOf(b));
}

/** What Members lists, top to bottom: each row by its text, or a button by its accessible name. */
export const membersShown = () =>
  memberRows().map((view) =>
    view.props.accessibilityRole === 'button' || view.props.role === 'button'
      ? accessibleName(view)
      : textOf(view),
  );

/** Waits until Members lists `rows`, top to bottom. */
export async function expectMembers(rows: string[]) {
  await waitFor(() => expect(membersShown()).toEqual(rows));
}

/** A button in Members, by its accessible name. */
export function membersButton(name: string) {
  const members = screenOf('Members');
  const button = within(members)
    .queryAllByRole('button', { name })
    .find((view) => inContentOf(members, view));
  if (button === undefined) throw new Error(`No ${name} in Members`);
  return button;
}

export const isEnabled = (view: HostView) => !isDisabled(view);

/** A member's menu as the app shows it: an iOS action sheet or an Android dialog. */
export interface MemberMenu {
  title?: string;
  message?: string;
  items: string[];
  destructive: string[];
  cancel?: string;
  choose: (item: string) => Promise<void>;
}

interface ActionSheetOptions {
  title?: string;
  message?: string;
  options: string[];
  destructiveButtonIndex?: number | number[];
  cancelButtonIndex?: number;
}

/** The action sheet calls so far, when the test file spies on them. */
const actionSheets = (): [ActionSheetOptions, (index: number) => void][] =>
  (
    ActionSheetIOS.showActionSheetWithOptions as unknown as {
      mock?: { calls: [ActionSheetOptions, (index: number) => void][] };
    }
  ).mock?.calls ?? [];

function sheetMenu([options, callback]: [
  ActionSheetOptions,
  (index: number) => void,
]): MemberMenu {
  const destructive = [options.destructiveButtonIndex ?? []].flat();
  return {
    title: options.title,
    message: options.message,
    items: options.options,
    destructive: destructive.map((index) => options.options[index]),
    cancel:
      options.cancelButtonIndex === undefined
        ? undefined
        : options.options[options.cancelButtonIndex],
    choose: async (item) => {
      const index = options.options.indexOf(item);
      if (index < 0) throw new Error(`No ${item} in the action sheet`);
      act(() => callback(index));
      await settle();
    },
  };
}

function dialogMenu(call: Parameters<typeof Alert.alert>): MemberMenu {
  const [title, message, buttons = []] = call;
  return {
    title,
    message,
    items: buttons.map((button) => button.text ?? ''),
    destructive: buttons
      .filter((button) => button.style === 'destructive')
      .map((button) => button.text ?? ''),
    cancel: buttons.find((button) => button.style === 'cancel')?.text,
    choose: async (item) => {
      const button = buttons.find((candidate) => candidate.text === item);
      if (button === undefined) throw new Error(`No ${item} in the dialog`);
      act(() => button.onPress?.());
      await settle();
    },
  };
}

/** Taps a member's row in Members; the menu it opened, if any. */
export async function tapMember(name: string): Promise<MemberMenu | undefined> {
  const sheetsBefore = actionSheets().length;
  const alertsBefore = alerts().length;
  fireEvent.press(membersButton(name));
  await settle();
  const sheet = actionSheets()[sheetsBefore];
  if (sheet !== undefined) return sheetMenu(sheet);
  const dialog = alerts()[alertsBefore];
  return dialog === undefined ? undefined : dialogMenu(dialog);
}

/** Chooses an item of a member's menu. */
export async function chooseForMember(name: string, item: string) {
  const menu = await tapMember(name);
  if (menu === undefined) throw new Error(`Tapping ${name} opened no menu`);
  await menu.choose(item);
}

// The name forms: Add Member, Rename Member and Rename Group

export const memberNameField = () => screen.getByLabelText('Member name');
export const groupNameField = () => screen.getByLabelText('Group name');

/** Presses Return in a name field and lets the save, if any, finish. */
export async function pressReturn(field: HostView) {
  act(() => {
    fireEvent(field, 'submitEditing', {
      nativeEvent: { text: field.props.value },
    });
  });
  await settle();
}

export async function openAddMember() {
  fireEvent.press(membersButton('Add Member'));
  await settle();
  await expectOpen('Add Member');
}

/** Adds `name` from Members, saying yes if the app asks to add a former member back. */
export async function addMember(name: string) {
  const rows = membersShown().length;
  await openAddMember();
  fireEvent.changeText(memberNameField(), name);
  const alertsBefore = alerts().length;
  await pressOnBar('Add Member', 'Add');
  if (alerts().length > alertsBefore && lastAlertButtons().includes('Add Back'))
    await pressAlertButton('Add Back');
  await expectClosed('Add Member');
  await waitFor(() => expect(membersShown()).toHaveLength(rows + 1));
}

export async function openRenameMember(name: string) {
  await chooseForMember(name, 'Rename');
  await expectOpen('Rename Member');
  await waitFor(() => expect(memberNameField().props.value ?? '').toBe(name));
}

/** Renames the member `from` to `to` from Members. */
export async function renameMember(from: string, to: string) {
  await openRenameMember(from);
  fireEvent.changeText(memberNameField(), to);
  await pressOnBar('Rename Member', 'Save');
  await expectClosed('Rename Member');
  await waitFor(() => expect(membersShown()).toContain(to.trim()));
}

export async function removeMember(name: string) {
  await chooseForMember(name, 'Remove from Group');
}

export async function openRenameGroup(group: string) {
  await chooseGroupAction(group, 'Rename Group');
  await expectOpen('Rename Group');
  await waitFor(() => expect(groupNameField().props.value ?? '').toBe(group));
}

/** Opens the group's Members from the Groups root and adds `members` in order. */
export async function openWithMembers(group: string, members: string[]) {
  await openGroup(group);
  await openMembers(group);
  for (const member of members) await addMember(member);
}

// The local data

/** The members of the group named `group`, read through listGroups. */
export async function storedMembers(
  file: string,
  group: string,
): Promise<GroupMember[]> {
  const found = (await storedGroups(file)).find(
    (candidate) => candidate.name === group,
  );
  if (found === undefined) throw new Error(`No group named ${group}`);
  return found.members;
}

export const storedMemberNames = async (file: string, group: string) =>
  (await storedMembers(file, group)).map((member) => member.name);

export async function storedMember(file: string, group: string, name: string) {
  const member = (await storedMembers(file, group)).find(
    (candidate) => candidate.name === name,
  );
  if (member === undefined) throw new Error(`No ${name} in ${group}`);
  return member;
}
