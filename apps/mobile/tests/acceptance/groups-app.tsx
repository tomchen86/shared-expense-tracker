import {
  nativeViews,
  navigationBars,
  push,
  startApp,
  tab,
  tapTab,
} from './shell-tabs-app';
import { DatabaseSync } from 'node:sqlite';
import { Text, type AlertButton } from 'react-native';
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react-native';
import { listGroups, type Group } from '../../src/groups';
import { useLocalIdentity, type LocalIdentity } from '../../src/shell';
import { openNodeDatabase } from '../../src/storage/node';
import { AddButton } from '../../src/ui/add-button';
import { settle } from './shell-appearance-app';

// The groups tests start the whole app on a phone database in a file of their own
// (ADR-0006), so a test can restart the app on the same data, and they read the
// groups back through listGroups, the groups capability's reader. They find New
// Group by its title, wherever the app shows it, and press its title bar actions
// as the native bar reports a press on iOS, or as React Native buttons on Android.

type HostView = ReturnType<typeof nativeViews>[number];

export const EMPTY_LIST = 'No groups yet. Tap + to create a group.';
export const USERNAME_REQUIRED = [
  'Username Required',
  'Please set your username in Settings before creating a group.',
];
export const CREATE_FAILED = [
  'Unable to Create Group',
  'Your group could not be saved. Please try again.',
];

/** A test-only screen that shows the local identity the app uses. */
function IdentityProbe() {
  return <Text testID="identity">{JSON.stringify(useLocalIdentity())}</Text>;
}

/** Starts the app at `url`, with a test-only screen that shows the local identity. */
export const startGroupsApp = (url = '/groups') =>
  startApp(url, { './identity-probe.tsx': IdentityProbe });

/** The local identity, read on its test-only screen, which stays open. */
export async function readIdentity(): Promise<LocalIdentity> {
  await push('/identity-probe');
  const shown = await screen.findByTestId('identity');
  return JSON.parse(String(shown.props.children)) as LocalIdentity;
}

/** Saves `name` from the Settings root, as SHELL-18.1 does on leaving the field, then selects Groups. */
export async function saveName(name: string) {
  await tapTab('Settings');
  const field = screen.getByLabelText('Your name');
  fireEvent.changeText(field, name);
  act(() => {
    fireEvent(field, 'endEditing', { nativeEvent: {} });
    fireEvent(field, 'blur', { nativeEvent: {} });
  });
  await settle();
  await tapTab('Groups');
}

/** Whether the views come in this order in the rendered tree. */
export function inTreeOrder(...views: HostView[]) {
  const all = screen.UNSAFE_root.findAll(() => true);
  const indexes = views.map((view) => all.indexOf(view));
  return indexes.every(
    (index, position) =>
      index >= 0 && (position === 0 || index > indexes[position - 1]),
  );
}

// The Groups root

/** The bottom screen of the Groups tab's stack. */
export const groupsRoot = () => nativeViews(/^RNSScreen$/, tab('Groups'))[0];

const accessibleName = (view: HostView) =>
  view.props.accessibilityLabel ?? view.props['aria-label'];

/** The group cards on the Groups root, top to bottom. */
export const cards = () =>
  within(groupsRoot()).queryAllByRole('button', { name: /^Open / });

/** The accessible names of the group cards, top to bottom. */
export const cardNames = () => cards().map(accessibleName);

export const addGroupButton = () =>
  within(groupsRoot()).getByRole('button', { name: 'Add group' });

/** The + buttons the Groups root shows through the shared component, by their names. */
export const sharedAddButtons = () =>
  within(groupsRoot())
    .UNSAFE_queryAllByType(AddButton)
    .map((button) => button.props.label);

export async function pressAddGroup() {
  fireEvent.press(addGroupButton());
  await settle();
}

/** The first native subview of `view`; components that render nothing add none. */
function firstSubview(view: HostView): HostView | undefined {
  for (const child of view.children) {
    if (typeof child === 'string') return undefined;
    if (typeof child.type === 'string') return child;
    const subview = firstSubview(child);
    if (subview) return subview;
  }
  return undefined;
}

/** UIKit ties a large title to the scroll view it reaches through first subviews. */
export function scrollViewTheTitleFollows() {
  let view = firstSubview(groupsRoot());
  while (view !== undefined && String(view.type) !== 'RCTScrollView') {
    view = firstSubview(view);
  }
  return view;
}

// New Group

/** New Group's navigation bar, wherever the app shows New Group. */
export const newGroupBar = () =>
  navigationBars().find((bar) => bar.props.title === 'New Group');

export const newGroupIsOpen = () => newGroupBar() !== undefined;

export async function expectNewGroupOpen() {
  await waitFor(() => expect(newGroupIsOpen()).toBe(true));
}

export async function expectNewGroupClosed() {
  await waitFor(() => expect(newGroupIsOpen()).toBe(false));
  expect(screen.queryByLabelText('Group name')).toBeNull();
}

/**
 * The native screen that presents New Group. On iOS a modal screen holds a stack
 * of its own for its navigation bar, so this is the nearest screen out from the
 * bar that is presented other than by a push.
 */
export function newGroupScreen(): HostView {
  const bar = newGroupBar();
  if (bar === undefined) throw new Error('New Group is not open');
  let nearest: HostView | undefined;
  for (let view = bar.parent; view; view = view.parent) {
    if (!/^RNS(Modal)?Screen$/.test(String(view.type))) continue;
    nearest ??= view;
    const presentation: unknown = view.props.stackPresentation;
    if (presentation !== undefined && presentation !== 'push') return view;
  }
  if (nearest === undefined) throw new Error('New Group is on no screen');
  return nearest;
}

/** Whether the native screen refuses to be swiped down, as a native sheet is otherwise. */
export const refusesSwipeDown = (view: HostView) =>
  view.props.gestureEnabled === false ||
  view.props.preventNativeDismiss === true;

interface BarItem {
  type: string;
  title?: string;
  accessibilityLabel?: string;
  variant?: string;
  disabled?: boolean;
  buttonId?: string;
}

const barItemsOn = (bar: HostView, side: 'Left' | 'Right'): BarItem[] =>
  bar.props[`header${side}BarButtonItems`] ?? [];

/** The iOS bar buttons on each side of New Group's navigation bar, with their styles. */
export function barButtons() {
  const bar = newGroupBar();
  if (bar === undefined) throw new Error('New Group is not open');
  const describe = (item: BarItem) =>
    `${item.title} (${item.variant ?? 'plain'})`;
  return {
    left: barItemsOn(bar, 'Left').map(describe),
    right: barItemsOn(bar, 'Right').map(describe),
  };
}

/** The Android header buttons on each side of New Group's navigation bar, left to right. */
export function headerButtons() {
  const bar = newGroupBar();
  if (bar === undefined) throw new Error('New Group is not open');
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

/** Cancel or Create on New Group's title bar: an iOS bar button or an Android button. */
export function titleBarAction(name: 'Cancel' | 'Create'): Control {
  const bar = newGroupBar();
  if (bar === undefined) throw new Error('New Group is not open');
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
  const disabled =
    button.props.accessibilityState?.disabled === true ||
    button.props['aria-disabled'] === true;
  return {
    disabled,
    press: () => {
      if (!disabled) fireEvent.press(button);
    },
  };
}

/** Presses Cancel or Create and lets the save, if any, finish. */
export async function press(name: 'Cancel' | 'Create') {
  titleBarAction(name).press();
  await settle();
}

export const nameField = () => screen.getByLabelText('Group name');

export const typeName = (text: string) =>
  fireEvent.changeText(nameField(), text);

/** Presses Return in the name field and lets the save, if any, finish. */
export async function pressReturn() {
  const field = nameField();
  act(() => {
    fireEvent(field, 'submitEditing', {
      nativeEvent: { text: field.props.value },
    });
  });
  await settle();
}

/** Creates a group from the Groups root, with your name already saved. */
export async function createGroup(name: string) {
  await pressAddGroup();
  await expectNewGroupOpen();
  typeName(name);
  await press('Create');
  await expectNewGroupClosed();
}

// Alerts

/** The alerts shown so far, as [title, message]. */
export const alertsShown = (alert: jest.SpyInstance) =>
  alert.mock.calls.map((call) => call.slice(0, 2));

const buttonsOfLastAlert = (alert: jest.SpyInstance): AlertButton[] =>
  alert.mock.calls.at(-1)?.[2] ?? [];

export const lastAlertButtons = (alert: jest.SpyInstance) =>
  buttonsOfLastAlert(alert).map((button) => button.text);

/** Taps a button of the last alert, which runs its action, if it has one. */
export async function pressAlertButton(alert: jest.SpyInstance, text: string) {
  const button = buttonsOfLastAlert(alert).find(
    (candidate) => candidate.text === text,
  );
  if (button === undefined) throw new Error(`No ${text} in the last alert`);
  act(() => button.onPress?.());
  await settle();
}

// The local data

/** The groups in the database file, read through the groups capability. */
export async function storedGroups(file: string): Promise<Group[]> {
  const database = openNodeDatabase(file);
  try {
    return await listGroups(database);
  } finally {
    await database.close();
  }
}

/** Every row of every table in the database file, read without the app. */
export function localData(file: string) {
  const database = new DatabaseSync(file, { readOnly: true });
  try {
    const tables = database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
      )
      .all() as { name: string }[];
    return Object.fromEntries(
      tables.map(({ name }) => [
        name,
        database
          .prepare(`SELECT * FROM "${name.replaceAll('"', '""')}"`)
          .all()
          .map((row) => JSON.stringify(row))
          .sort(),
      ]),
    );
  } finally {
    database.close();
  }
}
