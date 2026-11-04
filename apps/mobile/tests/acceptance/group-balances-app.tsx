import { fireEvent, within } from '@testing-library/react-native';
import { nameOf } from './ledger-expense-app';
import { asRead, linesIn } from './ledger-expense-list-app';
import { settle } from './shell-appearance-app';
import { tapTab } from './shell-tabs-app';
import { cards } from './groups-app';
import {
  expectClosed,
  expectOpen,
  isOpen,
  openGroup,
  pressOnBar,
  screenOf,
} from './group-details-app';
import { groupLines } from './ledger-group-expense-app';

// The group amount tests add group expenses through New Expense, as the group
// expense tests do (ledger-group-expense-app), and read the amounts where the app
// shows them: the lines of text on the group's screen, Balances, found by the title
// of its navigation bar wherever it opens, and the group's card on the Groups root,
// whose name stays Open <group>, so a screen reader reads the rest of the card as
// its accessibility value.

type HostView = ReturnType<typeof screenOf>;

export const NO_SPENDING = 'No spending yet';

/** Selects the Groups tab and shows the group's screen, opening it from its card unless it is open. */
export async function showGroup(group: string) {
  await tapTab('Groups');
  if (!isOpen(group)) await openGroup(group);
  await settle();
}

/** The Group Total lines on the group's screen, top to bottom. */
export const groupTotals = (group: string) =>
  groupLines(group).filter((line) => line.startsWith('Group Total'));

/** The buttons on the group's screen that hold a Group Total line. */
export const groupTotalButtons = (group: string) =>
  within(screenOf(group))
    .queryAllByRole('button')
    .filter((button) =>
      linesIn(button).some((line) => line.startsWith('Group Total')),
    );

/** A line of your net balance on the group's screen (GROUPS-69.1). */
const BALANCE = /^(You're owed: |You owe: |Settled up$)/;

/** The lines of your net balance on the group's screen, top to bottom. */
export const balanceLines = (group: string) =>
  groupLines(group).filter((line) => BALANCE.test(line));

/** The buttons on the group's screen that hold a line of your net balance. */
export const balanceButtons = (group: string) =>
  within(screenOf(group))
    .queryAllByRole('button')
    .filter((button) => linesIn(button).some((line) => BALANCE.test(line)));

/** Opens the group's Balances by pressing your net balance on its screen. */
export async function openBalances(group: string) {
  const [button] = balanceButtons(group);
  if (button === undefined) throw new Error(`${group} shows no balance`);
  await fireEvent.press(button);
  await settle();
  await expectOpen('Balances');
  await settle();
}

/** The lines Balances shows, top to bottom. */
export const balancesLines = () => linesIn(screenOf('Balances'));

export async function closeBalances() {
  await pressOnBar('Balances', 'Close');
  await expectClosed('Balances');
}

/** The group's card on the Groups root. */
export function groupRootCard(group: string): HostView {
  const found = cards().find((card) => nameOf(card) === `Open ${group}`);
  if (found === undefined) throw new Error(`No card for ${group}`);
  return found;
}

/** The lines of text on the group's card on the Groups root, top to bottom. */
export const groupRootCardLines = (group: string) =>
  linesIn(groupRootCard(group));

/** What a screen reader reads for `view` after its name: its accessibility value. */
export const readAfterName = (view: HostView) =>
  asRead(
    String(
      view.props.accessibilityValue?.text ?? view.props['aria-valuetext'] ?? '',
    ),
  );
