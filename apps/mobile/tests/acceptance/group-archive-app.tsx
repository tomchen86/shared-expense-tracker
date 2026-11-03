import {
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react-native';
import { nativeViews, tab, tapTab } from './shell-tabs-app';
import { groupsRoot } from './groups-app';
import { settle } from './shell-appearance-app';
import { expectOpen, screenOf } from './group-details-app';

// The archive tests archive a group through its card's accessibility action, which
// Jest can deliver; swiping a card to show Archive is a gesture only the E2E flow
// makes (ADR-0008). They open Archived Groups from its row on the Settings root,
// find each screen by the title of its navigation bar, as the group details tests
// do, and read the groups back through listGroups, which lists archived groups too.

type HostView = ReturnType<typeof nativeViews>[number];

export const NOTICE = 'Group archived · Find it in Settings';
export const READ_ONLY =
  'Archived group. Expenses and allocations are read-only.';
export const NO_ARCHIVED = 'No archived groups.';
export const ARCHIVED_STATUS = 'Archived group';
export const ARCHIVE_FAILED = [
  'Unable to Archive Group',
  'The group could not be saved as archived. Please try again.',
];
export const RESTORE_FAILED = [
  'Unable to Restore Group',
  'The group could not be restored. Please try again.',
];

const textOf = (view: HostView): string =>
  view.children
    .map((child) => (typeof child === 'string' ? child : textOf(child)))
    .join('');

/** The texts inside `view`, top to bottom. */
export const textsIn = (view: HostView) =>
  within(view).queryAllByText(/./).map(textOf);

export const accessibleName = (view: HostView): string =>
  view.props.accessibilityLabel ?? view.props['aria-label'] ?? textOf(view);

export const isDisabled = (view: HostView) =>
  view.props.accessibilityState?.disabled === true ||
  view.props['aria-disabled'] === true;

const isScreen = (view: HostView) =>
  /^RNS(Modal)?Screen$/.test(String(view.type));

const presentedOtherThanByPush = (view: HostView) => {
  const presentation: unknown = view.props.stackPresentation;
  return presentation !== undefined && presentation !== 'push';
};

/** Whether `view` is part of what `owner` shows, not of its title bar or of a sheet over it. */
function inContentOf(owner: HostView, view: HostView) {
  for (let node = view.parent; node; node = node.parent) {
    if (node === owner) return true;
    if (String(node.type) === 'RNSScreenStackHeaderConfig') return false;
    if (isScreen(node) && presentedOtherThanByPush(node)) return false;
  }
  return false;
}

/** The buttons that the screen or sheet titled `title` shows itself, top to bottom. */
export function contentButtons(title: string) {
  const owner = screenOf(title);
  return within(owner)
    .queryAllByRole('button')
    .filter((view) => inContentOf(owner, view));
}

/** A button that the screen or sheet titled `title` shows itself, by its accessible name. */
export function contentButton(title: string, name: string) {
  const button = contentButtons(title).find(
    (view) => accessibleName(view) === name,
  );
  if (button === undefined) throw new Error(`No ${name} on ${title}`);
  return button;
}

// The Groups root

/** The card of the group named `name` on the Groups root. */
export const card = (name: string) =>
  within(groupsRoot()).getByRole('button', { name: `Open ${name}` });

interface AccessibilityAction {
  name: string;
  label?: string;
}

const actionsOf = (view: HostView): AccessibilityAction[] =>
  view.props.accessibilityActions ?? [];

/** The labels of the accessibility actions on the card of the group named `name`. */
export const cardActionLabels = (name: string) =>
  actionsOf(card(name)).map((action) => action.label);

/**
 * Uses the Archive group action of the card of the group named `name`, as VoiceOver
 * or TalkBack does, and lets the save, if any, finish. With `ifOffered`, a card
 * that offers no such action is left as it is.
 */
export async function archiveByAction(
  name: string,
  { ifOffered = false } = {},
) {
  const view = card(name);
  const action = actionsOf(view).find(
    (candidate) => candidate.label === 'Archive group',
  );
  if (action === undefined) {
    if (ifOffered) return;
    throw new Error(`The card of ${name} has no Archive group action`);
  }
  await fireEvent(view, 'accessibilityAction', {
    nativeEvent: { actionName: action.name },
  });
  await settle();
}

/** Whether the app shows the notice that a group was archived. */
export const noticeShown = () => screen.queryByText(NOTICE) !== null;

// Settings and Archived Groups

/** The bottom screen of the Settings tab's stack. */
export const settingsRoot = () =>
  nativeViews(/^RNSScreen$/, tab('Settings'))[0];

/** The Archived Groups row on the Settings root, found by the text it shows. */
export function archivedGroupsRow() {
  const label = within(settingsRoot()).getByText('Archived Groups');
  for (let view = label.parent; view; view = view.parent)
    if (
      view.props.accessibilityRole === 'button' ||
      view.props.role === 'button'
    )
      return view;
  throw new Error('Archived Groups is not in a button');
}

/** The numbers that the Archived Groups row shows. */
export const rowCounts = () =>
  within(archivedGroupsRow())
    .queryAllByText(/^\d+$/)
    .map((view) => textOf(view));

/** Selects Settings and opens Archived Groups from its row on the Settings root. */
export async function openArchivedGroups() {
  await tapTab('Settings');
  await fireEvent.press(within(settingsRoot()).getByText('Archived Groups'));
  await settle();
  await expectOpen('Archived Groups');
}

/** The accessible names of the archived groups' cards, top to bottom. */
export const archivedCardNames = () =>
  contentButtons('Archived Groups')
    .map(accessibleName)
    .filter((name) => name.startsWith('Open '));

/** The card of the archived group named `name` on Archived Groups. */
export const archivedCard = (name: string) =>
  contentButton('Archived Groups', `Open ${name}`);

/** The Restore button of the archived group named `name` on Archived Groups. */
export const restoreButton = (name: string) =>
  contentButton('Archived Groups', `Restore ${name}`);

/** Waits until Archived Groups lists the group named `name`; its groups are read once it opens. */
const expectListed = (name: string) =>
  waitFor(() => expect(archivedCardNames()).toContain(`Open ${name}`));

/** Presses Restore for the group named `name` and lets the save, if any, finish. */
export async function pressRestore(name: string) {
  await expectListed(name);
  await fireEvent.press(restoreButton(name));
  await settle();
}

/** Opens the screen of the archived group named `name` from its card on Archived Groups. */
export async function openArchivedGroup(name: string) {
  await expectListed(name);
  await fireEvent.press(archivedCard(name));
  await settle();
  await expectOpen(name);
}

/** Presses Restore Group on the screen of the group named `group` and lets the save, if any, finish. */
export async function pressRestoreGroup(group: string) {
  await fireEvent.press(contentButton(group, 'Restore Group'));
  await settle();
}
