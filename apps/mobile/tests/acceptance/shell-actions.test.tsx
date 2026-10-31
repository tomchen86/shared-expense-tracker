import { PlatformColor } from 'react-native';
import { fireEvent, within } from '@testing-library/react-native';
import type { HeaderActionsProps } from '../../src/ui/header-actions';
import {
  IN_A_TAB,
  OUTSIDE_THE_TABS,
  addButtonBox,
  barItems,
  chooseFromMenu,
  holdDown,
  iconsIn,
  liftFinger,
  pressBarButton,
  probeButton,
  probeColors,
  reportBottomInsets,
  showAddButton,
  showHeaderActions,
} from './shell-actions-app';
import {
  colorsInBoth,
  fakePhoneAppearance,
  fakeReduceTransparency,
  switchPhoneTo,
  translucentViews,
} from './shell-appearance-app';

// Runs on iOS; shell-actions-android.test.tsx checks Android.

jest.mock('../../src/storage/expo', () => ({
  openPhoneDatabase: async () =>
    jest
      .requireActual<typeof import('../../src/storage/node')>(
        '../../src/storage/node',
      )
      .openNodeDatabase(':memory:'),
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

beforeEach(() => {
  jest.clearAllMocks();
  fakePhoneAppearance('light');
  fakeReduceTransparency(false);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const MENU: HeaderActionsProps['menu'] = {
  label: 'Group actions',
  actions: [
    { label: 'Members', onPress: jest.fn() },
    { label: 'Delete', onPress: jest.fn() },
  ],
};

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

test('[SHELL-42.1] keeps the + button 16 above the tab bar, which the safe area of a tab includes', async () => {
  await showAddButton(IN_A_TAB, { onPress: jest.fn() });
  await reportBottomInsets(83, 34);

  expect(addButtonBox('Add expense').bottom).toBe(99);
});

test('[SHELL-42.1] keeps the + button 16 above the bottom safe area outside the tabs', async () => {
  await showAddButton(OUTSIDE_THE_TABS, { onPress: jest.fn() });
  await reportBottomInsets(34);

  expect(addButtonBox('Add expense').bottom).toBe(50);
});

test('[SHELL-42.1] moves the + button as soon as the bottom safe area changes', async () => {
  await showAddButton(OUTSIDE_THE_TABS, { onPress: jest.fn() });
  await reportBottomInsets(34);
  await reportBottomInsets(21);

  expect(addButtonBox('Add expense').bottom).toBe(37);
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

  pressBarButton('Add');
  chooseFromMenu('Members');

  expect(add).toHaveBeenCalledTimes(1);
  expect(members).toHaveBeenCalledTimes(1);
});

test('[SHELL-44.1] draws the + as the SF Symbol plus in the text color, which the screen reader skips', async () => {
  await showAddButton(IN_A_TAB, { label: 'Add group', onPress: jest.fn() });
  const button = probeButton('Add group');

  expect(
    iconsIn(button, 'ios').map(({ name, color }) => ({ name, color })),
  ).toEqual([{ name: 'plus', color: PlatformColor('labelColor') }]);
  expect(within(button).queryAllByText(/./)).toEqual([]);
});

test('[SHELL-44.1] shrinks the + button to 0.96 while it is held and restores it on release', async () => {
  await showAddButton(IN_A_TAB, { label: 'Add group', onPress: jest.fn() });
  const button = probeButton('Add group');
  expect(addButtonBox('Add group').scale).toBe(1);

  holdDown(button);
  expect(addButtonBox('Add group').scale).toBeCloseTo(0.96);

  await liftFinger(button);
  expect(addButtonBox('Add group').scale).toBe(1);
});

test('[SHELL-44.1] gives one light haptic when the + button runs its action, not when the finger lands', async () => {
  await showAddButton(IN_A_TAB, { label: 'Add group', onPress: jest.fn() });
  const button = probeButton('Add group');

  holdDown(button);
  expect(haptics.impactAsync).not.toHaveBeenCalled();
  await liftFinger(button);

  expect(haptics.impactAsync.mock.calls).toEqual([
    [haptics.ImpactFeedbackStyle.Light],
  ]);
  expect(haptics.notificationAsync).not.toHaveBeenCalled();
  expect(haptics.selectionAsync).not.toHaveBeenCalled();
});

test('[SHELL-36.1] adds no glass to the + button while Reduce Transparency is on', async () => {
  fakeReduceTransparency(true);
  await showAddButton(IN_A_TAB, { label: 'Add group', onPress: jest.fn() });
  const box = addButtonBox('Add group');

  expect(translucentViews(box.placed ?? box.button)).toEqual([]);
});

test('[SHELL-41.1] gives the + button an opaque surface while Reduce Transparency is on', async () => {
  fakeReduceTransparency(true);
  await showAddButton(IN_A_TAB, { label: 'Add group', onPress: jest.fn() });

  expect(addButtonBox('Add group').opaque).toBe(true);
});

test('[SHELL-34.1] colors the + button with colors that follow the appearance', async () => {
  await showAddButton(IN_A_TAB, { label: 'Add group', onPress: jest.fn() });
  expect(probeButton('Add group')).toBeOnTheScreen();
  const light = probeColors();
  switchPhoneTo('dark');
  const dark = probeColors();

  expect(colorsInBoth(light.colors, dark.colors)).toEqual([]);
  expect([...light.uncolored, ...dark.uncolored]).toEqual([]);
});

test('[SHELL-47.1] puts Cancel on the left as a plain text button and the confirm action on the right as a prominent one', async () => {
  await showHeaderActions({
    cancel: { label: 'Cancel', onPress: jest.fn() },
    confirm: { label: 'Add', onPress: jest.fn() },
  });

  expect(barItems()).toEqual({
    left: [{ button: 'Cancel', variant: 'plain', disabled: false }],
    right: [{ button: 'Add', variant: 'prominent', disabled: false }],
  });
});

test('[SHELL-47.1] gathers the other actions in order in an ellipsis.circle menu with the name the screen gives', async () => {
  await showHeaderActions({ menu: MENU });

  expect(barItems()).toEqual({
    left: [],
    right: [
      {
        menu: 'Group actions',
        icon: 'ellipsis.circle',
        disabled: false,
        items: ['Members', 'Delete'],
      },
    ],
  });
});

test('[SHELL-47.1] keeps the confirm action at the trailing edge, with the menu next to it', async () => {
  await showHeaderActions({
    confirm: { label: 'Save', onPress: jest.fn() },
    menu: {
      label: 'Expense actions',
      actions: [{ label: 'Delete', onPress: jest.fn() }],
    },
  });

  expect(barItems().right).toEqual([
    { button: 'Save', variant: 'prominent', disabled: false },
    {
      menu: 'Expense actions',
      icon: 'ellipsis.circle',
      disabled: false,
      items: ['Delete'],
    },
  ]);
});

test('[SHELL-49.1] shows a disabled confirm action as disabled and ignores it', async () => {
  const add = jest.fn();
  await showHeaderActions({
    cancel: { label: 'Cancel', onPress: jest.fn() },
    confirm: { label: 'Add', onPress: add, disabled: true },
  });

  expect(barItems().right).toEqual([
    { button: 'Add', variant: 'prominent', disabled: true },
  ]);
  pressBarButton('Add');
  expect(add).not.toHaveBeenCalled();
});

test('[SHELL-49.1] keeps the menu usable with a disabled action in it', async () => {
  const members = jest.fn();
  const remove = jest.fn();
  await showHeaderActions({
    menu: {
      label: 'Group actions',
      actions: [
        { label: 'Members', onPress: members },
        { label: 'Delete', onPress: remove, disabled: true },
      ],
    },
  });

  expect(barItems().right).toEqual([
    {
      menu: 'Group actions',
      icon: 'ellipsis.circle',
      disabled: false,
      items: ['Members', 'Delete (disabled)'],
    },
  ]);
  chooseFromMenu('Delete');
  chooseFromMenu('Members');
  expect(remove).not.toHaveBeenCalled();
  expect(members).toHaveBeenCalledTimes(1);
});

test('[SHELL-49.1] keeps the menu usable when every action in it is disabled', async () => {
  await showHeaderActions({
    menu: {
      label: 'Group actions',
      actions: [
        { label: 'Members', onPress: jest.fn(), disabled: true },
        { label: 'Delete', onPress: jest.fn(), disabled: true },
      ],
    },
  });

  expect(barItems().right).toEqual([
    {
      menu: 'Group actions',
      icon: 'ellipsis.circle',
      disabled: false,
      items: ['Members (disabled)', 'Delete (disabled)'],
    },
  ]);
});
