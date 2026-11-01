import { Alert, type AlertButton, type AlertOptions } from 'react-native';
import {
  fireEvent,
  renderHook,
  waitFor,
  within,
} from '@testing-library/react-native';
import type { HeaderActionsProps } from '../../src/ui/header-actions';
import { useThemeColors } from '../../src/ui/theme';
import {
  IN_A_TAB,
  OUTSIDE_THE_TABS,
  addButtonBox,
  headerButton,
  headerButtons,
  iconNames,
  iconOpacity,
  iconsIn,
  probeButton,
  probeColors,
  reportBottomInsets,
  ripplesOn,
  showAddButton,
  showAddButtonAndHeaderActions,
  showHeaderActions,
  touchSize,
} from './shell-actions-app';
import {
  colorsInBoth,
  fakePhoneAppearance,
  switchPhoneTo,
  translucentViews,
} from './shell-appearance-app';

// Runs on Android only (apps/mobile/jest.config.cjs).

jest.mock('../../src/storage/expo', () => ({
  openPhoneDatabase: async () =>
    jest
      .requireActual<typeof import('../../src/storage/node')>(
        '../../src/storage/node',
      )
      .openNodeDatabase(':memory:'),
}));
// Material Symbols drawn as images come from the symbol font on the phone. Here
// each image is named after its symbol instead, as in the tab bar's tests.
jest.mock('expo-symbols', () => ({
  ...jest.requireActual('expo-symbols'),
  unstable_getMaterialSymbolSourceAsync: async (symbol: string) => ({
    uri: `material-symbol:${symbol}`,
  }),
}));
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

const haptics = jest.requireMock('expo-haptics');

// The menu's dialog is the platform's alert dialog, which React Native shows
// through Alert.alert.
let alert: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  fakePhoneAppearance('light');
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

/** The last dialog the app showed: its title, the texts of its buttons, and how it closes. */
function lastDialog() {
  const [title, , buttons = [], options] = (alert.mock.calls.at(-1) ?? []) as [
    string?,
    string?,
    AlertButton[]?,
    AlertOptions?,
  ];
  const texts = buttons.map((button) => button.text);
  return {
    title,
    actions: texts.filter((text) => text !== 'Cancel'),
    cancels: texts.filter((text) => text === 'Cancel').length,
    press: (text: string) =>
      buttons.find((button) => button.text === text)?.onPress?.(),
    /** Whether the back button and a tap outside close the dialog. */
    cancelable: options?.cancelable === true,
    /** Closes the dialog as the back button or a tap outside does. */
    dismiss: () => options?.onDismiss?.(),
  };
}

/** The icons of the Android header buttons, once their images have loaded. */
async function expectIcons(icons: Record<string, string>) {
  await waitFor(() =>
    expect(
      Object.fromEntries(
        Object.keys(icons).map((name) => [
          name,
          iconNames(headerButton(name), 'android').join(' '),
        ]),
      ),
    ).toEqual(icons),
  );
}

const groupActions = (
  members: { disabled?: boolean; onPress?: () => void } = {},
  remove: { disabled?: boolean; onPress?: () => void } = {},
): HeaderActionsProps['menu'] => ({
  label: 'Group actions',
  actions: [
    { label: 'Members', onPress: jest.fn(), ...members },
    { label: 'Delete', onPress: jest.fn(), ...remove },
  ],
});

test('[SHELL-41.1] floats the + button at the bottom center as a 60×60 circle with the name the screen gives', async () => {
  await showAddButton(IN_A_TAB, { label: 'Add group', onPress: jest.fn() });

  expect(addButtonBox('Add group')).toMatchObject({
    floats: true,
    size: '60×60',
    round: true,
    centered: true,
  });
});

test('[SHELL-41.1] names the + button Add expense when the screen gives no name', async () => {
  await showAddButton(IN_A_TAB, { onPress: jest.fn() });

  expect(probeButton('Add expense')).toBeOnTheScreen();
});

test('[SHELL-42.1] keeps the + button 16 above the bottom of a tab, which ends above the tab bar', async () => {
  await showAddButton(IN_A_TAB, { onPress: jest.fn() });
  await reportBottomInsets(24);

  expect(addButtonBox('Add expense').bottom).toBe(16);
});

test('[SHELL-42.1] keeps the + button 16 above the bottom safe area outside the tabs', async () => {
  await showAddButton(OUTSIDE_THE_TABS, { onPress: jest.fn() });
  await reportBottomInsets(24);

  expect(addButtonBox('Add expense').bottom).toBe(40);
});

test('[SHELL-43.1] runs the action of the + button once for each press', async () => {
  const onPress = jest.fn();
  await showAddButton(IN_A_TAB, { label: 'Add group', onPress });
  const button = probeButton('Add group');

  fireEvent.press(button);
  fireEvent.press(button);

  expect(onPress).toHaveBeenCalledTimes(2);
});

test('[SHELL-43.1] runs a header action once for each press', async () => {
  const add = jest.fn();
  const members = jest.fn();
  await showHeaderActions({
    confirm: { label: 'Add', onPress: add },
    menu: {
      label: 'Group actions',
      actions: [{ label: 'Members', onPress: members }],
    },
  });

  fireEvent.press(headerButton('Add'));
  fireEvent.press(headerButton('Group actions'));
  lastDialog().press('Members');

  expect(add).toHaveBeenCalledTimes(1);
  expect(members).toHaveBeenCalledTimes(1);
});

test('[SHELL-46.1] draws the + as the text +, which the screen reader skips', async () => {
  await showAddButton(IN_A_TAB, { label: 'Add group', onPress: jest.fn() });
  const button = probeButton('Add group');

  expect(
    within(button).getByText('+', { includeHiddenElements: true }),
  ).toBeTruthy();
  expect(within(button).queryAllByText(/./)).toEqual([]);
});

test('[SHELL-46.1] shows a ripple and gives no haptic when the + button is pressed', async () => {
  await showAddButton(IN_A_TAB, { label: 'Add group', onPress: jest.fn() });

  expect(addButtonBox('Add group').ripple).toBe(true);
  fireEvent.press(probeButton('Add group'));
  expect(haptics.impactAsync).not.toHaveBeenCalled();
  expect(haptics.notificationAsync).not.toHaveBeenCalled();
  expect(haptics.selectionAsync).not.toHaveBeenCalled();
});

test('[SHELL-38.1] adds no glass to the + button', async () => {
  await showAddButton(IN_A_TAB, { label: 'Add group', onPress: jest.fn() });
  const box = addButtonBox('Add group');

  expect(translucentViews(box.placed ?? box.button)).toEqual([]);
});

test('[SHELL-41.1] gives the + button an opaque surface', async () => {
  await showAddButton(IN_A_TAB, { label: 'Add group', onPress: jest.fn() });

  expect(addButtonBox('Add group').opaque).toBe(true);
});

test('[SHELL-34.1] colors the + button and the header icons with colors that follow the appearance', async () => {
  await showAddButtonAndHeaderActions(
    { label: 'Add group', onPress: jest.fn() },
    {
      cancel: { label: 'Cancel', onPress: jest.fn() },
      confirm: { label: 'Add', onPress: jest.fn() },
      menu: groupActions(),
    },
  );
  await expectIcons({
    Cancel: 'close',
    Add: 'check',
    'Group actions': 'more_vert',
  });
  expect(probeButton('Add group')).toBeOnTheScreen();
  const light = probeColors();
  switchPhoneTo('dark');
  const dark = probeColors();

  expect(colorsInBoth(light.colors, dark.colors)).toEqual([]);
  expect([...light.uncolored, ...dark.uncolored]).toEqual([]);
});

test('[SHELL-48.1] shows Cancel as close on the left and the confirm action as check on the right', async () => {
  await showHeaderActions({
    cancel: { label: 'Cancel', onPress: jest.fn() },
    confirm: { label: 'Add', onPress: jest.fn() },
  });

  expect(headerButtons()).toEqual({ left: ['Cancel'], right: ['Add'] });
  await expectIcons({ Cancel: 'close', Add: 'check' });
});

test('[SHELL-48.1] draws the confirm action in the accent color', async () => {
  // Before the app starts: a hook's render becomes what `screen` queries.
  const { accent } = renderHook(() => useThemeColors()).result.current;
  await showHeaderActions({
    cancel: { label: 'Cancel', onPress: jest.fn() },
    confirm: { label: 'Add', onPress: jest.fn() },
  });
  await expectIcons({ Cancel: 'close', Add: 'check' });

  expect(iconsIn(headerButton('Add'), 'android')[0].color).toEqual(accent);
  expect(iconsIn(headerButton('Cancel'), 'android')[0].color).not.toEqual(
    accent,
  );
});

test('[SHELL-48.1] gives each header button a touch area of at least 48×48 dp', async () => {
  await showHeaderActions({
    cancel: { label: 'Cancel', onPress: jest.fn() },
    confirm: { label: 'Add', onPress: jest.fn() },
    menu: groupActions(),
  });

  for (const name of ['Cancel', 'Add', 'Group actions']) {
    const { width, height } = touchSize(headerButton(name));
    expect({ name, wide: width >= 48, tall: height >= 48 }).toEqual({
      name,
      wide: true,
      tall: true,
    });
  }
});

test('[SHELL-48.1] opens a dialog named after the menu that lists its actions in order and Cancel', async () => {
  await showHeaderActions({ menu: groupActions() });

  expect(headerButtons()).toEqual({ left: [], right: ['Group actions'] });
  await expectIcons({ 'Group actions': 'more_vert' });
  fireEvent.press(headerButton('Group actions'));

  expect(lastDialog()).toMatchObject({
    title: 'Group actions',
    actions: ['Members', 'Delete'],
    cancels: 1,
  });
});

test('[SHELL-48.1] puts the menu at the far right, after the confirm action', async () => {
  await showHeaderActions({
    confirm: { label: 'Save', onPress: jest.fn() },
    menu: {
      label: 'Expense actions',
      actions: [{ label: 'Delete', onPress: jest.fn() }],
    },
  });

  expect(headerButtons()).toEqual({
    left: [],
    right: ['Save', 'Expense actions'],
  });
});

test('[SHELL-48.1] runs no action when Cancel is pressed in the dialog', async () => {
  const members = jest.fn();
  const remove = jest.fn();
  await showHeaderActions({
    menu: groupActions({ onPress: members }, { onPress: remove }),
  });

  fireEvent.press(headerButton('Group actions'));
  lastDialog().press('Cancel');

  expect(members).not.toHaveBeenCalled();
  expect(remove).not.toHaveBeenCalled();
});

test('[SHELL-49.1] keeps a disabled confirm action on screen at 38% opacity and ignores it', async () => {
  const add = jest.fn();
  await showHeaderActions({
    cancel: { label: 'Cancel', onPress: jest.fn() },
    confirm: { label: 'Add', onPress: add, disabled: true },
  });
  await expectIcons({ Cancel: 'close', Add: 'check' });
  const button = headerButton('Add');

  expect(button).toBeDisabled();
  expect(iconOpacity(button)).toBeCloseTo(0.38);
  expect(iconOpacity(headerButton('Cancel'))).toBe(1);
  fireEvent.press(button);
  expect(add).not.toHaveBeenCalled();
});

test('[SHELL-49.1] leaves a disabled action out of the dialog', async () => {
  await showHeaderActions({ menu: groupActions({}, { disabled: true }) });

  fireEvent.press(headerButton('Group actions'));

  expect(lastDialog()).toMatchObject({
    title: 'Group actions',
    actions: ['Members'],
    cancels: 1,
  });
});

test('[SHELL-49.1] disables the menu button when every action in it is disabled', async () => {
  await showHeaderActions({
    menu: groupActions({ disabled: true }, { disabled: true }),
  });
  await expectIcons({ 'Group actions': 'more_vert' });
  const button = headerButton('Group actions');

  expect(button).toBeDisabled();
  expect(iconOpacity(button)).toBeCloseTo(0.38);
  fireEvent.press(button);
  expect(alert).not.toHaveBeenCalled();
});

const ALL_HEADER_ACTIONS = () => ({
  cancel: { label: 'Cancel', onPress: jest.fn() },
  confirm: { label: 'Add', onPress: jest.fn() },
  menu: groupActions(),
});
const HEADER_BUTTONS = ['Cancel', 'Add', 'Group actions'];

test('[SHELL-50.1] gives each header button a round ripple of radius 24', async () => {
  await showHeaderActions(ALL_HEADER_ACTIONS());

  for (const name of HEADER_BUTTONS)
    expect({
      name,
      round: ripplesOn(headerButton(name)).map(({ round24 }) => round24),
    }).toEqual({ name, round: [true] });
});

test('[SHELL-50.1] colors the ripples of the header buttons to follow the appearance', async () => {
  await showHeaderActions(ALL_HEADER_ACTIONS());
  const colors = () =>
    HEADER_BUTTONS.map((name) =>
      ripplesOn(headerButton(name)).map(({ fixedColor }) => fixedColor),
    );
  const light = colors();
  switchPhoneTo('dark');
  const dark = colors();

  expect(light.map((ripples) => ripples.length)).toEqual([1, 1, 1]);
  // The same fixed color in both appearances; none means the system picks it.
  expect(
    HEADER_BUTTONS.filter(
      (_, index) =>
        light[index][0] !== undefined && light[index][0] === dark[index][0],
    ),
  ).toEqual([]);
});

test('[SHELL-51.1] lets the back button or a tap outside close the dialog without running an action', async () => {
  const members = jest.fn();
  const remove = jest.fn();
  await showHeaderActions({
    menu: groupActions({ onPress: members }, { onPress: remove }),
  });

  fireEvent.press(headerButton('Group actions'));
  const dialog = lastDialog();
  expect(dialog.cancelable).toBe(true);
  dialog.dismiss();

  expect(members).not.toHaveBeenCalled();
  expect(remove).not.toHaveBeenCalled();
});
