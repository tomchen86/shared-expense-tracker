import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { act, fireEvent, screen, within } from '@testing-library/react-native';
import { AddButton, type AddButtonProps } from '../../src/ui/add-button';
import {
  HeaderActions,
  type HeaderAction,
  type HeaderActionsProps,
} from '../../src/ui/header-actions';
import { nativeViews, navigationBars, startApp, tab } from './shell-tabs-app';
import {
  fixedColors,
  isOpaque,
  textsWithoutColor,
} from './shell-appearance-app';

// The + button and the header actions are what other capabilities' screens show.
// These tests show them on a test-only screen, either pushed onto the Groups tab's
// stack, so in a tab, or on the root stack, outside the tabs. As the tab tests do,
// they read what the app hands to the platform: native views and their styles,
// bar items, haptics through expo-haptics, and icons through expo-symbols, which
// also draws the tab bar's icons.

type HostView = ReturnType<typeof nativeViews>[number];
type Style = Record<string, unknown>;
type Platform = 'ios' | 'android';

export const IN_A_TAB = '/groups/actions-probe';
export const OUTSIDE_THE_TABS = '/actions-probe';

function openProbe(url: string, content: ReactNode) {
  const Probe = () => (
    <View testID="actions-probe" style={{ flex: 1 }}>
      {content}
    </View>
  );
  return startApp(url, {
    './(tabs)/groups/actions-probe.tsx': Probe,
    './actions-probe.tsx': Probe,
  });
}

/** Starts the app on a test screen at `url` that shows the + button. */
export const showAddButton = (url: string, props: AddButtonProps) =>
  openProbe(url, <AddButton {...props} />);

/** Starts the app on a test screen in the Groups tab whose header has `actions`. */
export const showHeaderActions = (actions: HeaderActionsProps) =>
  openProbe(IN_A_TAB, <HeaderActions {...actions} />);

/** Starts the app on a test screen in the Groups tab that shows both. */
export const showAddButtonAndHeaderActions = (
  button: AddButtonProps,
  actions: HeaderActionsProps,
) =>
  openProbe(
    IN_A_TAB,
    <>
      <HeaderActions {...actions} />
      <AddButton {...button} />
    </>,
  );

const probe = () => screen.getByTestId('actions-probe');

// The safe area

/**
 * Reports bottom safe area insets as the phone does, to the safe area providers
 * around the test screen from the nearest outward. On iOS, the screens of a tab
 * have a provider of their own, whose inset includes the tab bar.
 */
export async function reportBottomInsets(...bottoms: number[]) {
  const providers: HostView[] = [];
  for (let outer = probe().parent; outer; outer = outer.parent)
    if (String(outer.type) === 'RNCSafeAreaProvider') providers.push(outer);
  expect(providers).toHaveLength(bottoms.length);
  await act(async () => {
    providers.forEach((provider, index) =>
      fireEvent(provider, 'insetsChange', {
        nativeEvent: {
          insets: { top: 0, left: 0, right: 0, bottom: bottoms[index] },
          frame: { x: 0, y: 0, width: 390, height: 844 },
        },
      }),
    );
  });
}

// The + button

const styleOf = (view: HostView): Style =>
  StyleSheet.flatten(view.props.style) ?? {};

const hostViews = (root: HostView) =>
  root.findAll((view) => typeof view.type === 'string');

function scaleOf(transform: unknown) {
  if (!Array.isArray(transform)) return 1;
  return transform.reduce(
    (product: number, step: { scale?: number }) => product * (step.scale ?? 1),
    1,
  );
}

const isRipple = (background: unknown) =>
  (background as { type?: string } | undefined)?.type === 'RippleAndroid';

interface Ripple {
  color?: unknown;
  borderless?: boolean;
  rippleRadius?: number;
}

/** Whether `ripple`, drawn by `view`, is a circle of radius 24 around the view's center. */
function isRound24(view: HostView, ripple: Ripple) {
  if (ripple.borderless === true) return ripple.rippleRadius === 24;
  // A bounded ripple fills its view, which then has to be a 48 dp circle.
  const style = styleOf(view);
  return (
    style.overflow === 'hidden' &&
    Number(style.borderRadius ?? 0) >= 24 &&
    style.width === 48 &&
    style.height === 48
  );
}

/**
 * A ripple's color as React Native hands it to Android, already processed: a
 * number is one fixed color; null leaves it to the system's default and an object
 * to the platform, both of which follow the appearance.
 */
const fixedRippleColor = (color: unknown) =>
  typeof color === 'number' && color >>> 24 !== 0 ? color >>> 0 : undefined;

/** The Android ripples on `button` and the views inside it, as React Native hands them to the platform. */
export const ripplesOn = (button: HostView) =>
  hostViews(button).flatMap((view) =>
    [view.props.nativeBackgroundAndroid, view.props.nativeForegroundAndroid]
      .filter(isRipple)
      .map((ripple: Ripple) => ({
        fixedColor: fixedRippleColor(ripple.color),
        round24: isRound24(view, ripple),
      })),
  );

/**
 * How the + button named `name` sits on the test screen: the views from the button
 * out to the one placed over the screen with position absolute, and the views
 * inside the button.
 */
export function addButtonBox(name: string) {
  const button = screen.getByRole('button', { name });
  const screenRoot = probe();
  const outward: HostView[] = [];
  for (
    let view: HostView | null = button;
    view && view !== screenRoot;
    view = view.parent
  )
    if (typeof view.type === 'string') outward.push(view);
  const end = outward.findIndex(
    (view) => styleOf(view).position === 'absolute',
  );
  const chain = end < 0 ? [] : outward.slice(0, end + 1);
  const placed = chain.at(-1);
  const views = [
    ...chain,
    ...hostViews(button).filter((view) => view !== button),
  ];
  const outer = placed ? styleOf(placed) : {};
  const sized = views.some(
    (view) => styleOf(view).width === 60 && styleOf(view).height === 60,
  );
  return {
    button,
    placed,
    floats: placed !== undefined,
    bottom: outer.bottom,
    size: sized ? '60×60' : undefined,
    round: views.some((view) => Number(styleOf(view).borderRadius ?? 0) >= 30),
    centered:
      chain.some((view) => styleOf(view).alignSelf === 'center') ||
      (outer.left === 0 &&
        outer.right === 0 &&
        chain.some((view) => styleOf(view).alignItems === 'center')),
    scale: views.reduce(
      (product, view) => product * scaleOf(styleOf(view).transform),
      1,
    ),
    opaque: views.some((view) => isOpaque(styleOf(view).backgroundColor)),
    ripple: views.some(
      (view) =>
        isRipple(view.props.nativeBackgroundAndroid) ||
        isRipple(view.props.nativeForegroundAndroid),
    ),
  };
}

/** A touch as React Native's responder system reports it. */
const touch = () => ({
  persist() {},
  currentTarget: { measure() {} },
  nativeEvent: {
    changedTouches: [],
    identifier: 0,
    locationX: 0,
    locationY: 0,
    pageX: 0,
    pageY: 0,
    target: 0,
    timestamp: Date.now(),
    touches: [],
  },
});

/** Puts a finger on `view` and keeps it there. */
export function holdDown(view: HostView) {
  fireEvent(view, 'responderGrant', touch());
}

/** Lifts the finger, once React Native's shortest press has passed. */
export async function liftFinger(view: HostView) {
  fireEvent(view, 'responderRelease', touch());
  // renderRouter fakes the timers and Date, so this runs the press-out that
  // React Native holds back until its shortest press has passed.
  await act(async () => {
    jest.advanceTimersByTime(500);
  });
}

// Icons

interface Icon {
  name: string | undefined;
  color: unknown;
  view: HostView;
}

const uriOf = (view: HostView) => {
  const source = view.props.source as
    { uri?: string } | { uri?: string }[] | undefined;
  return String((Array.isArray(source) ? source[0] : source)?.uri ?? '');
};

/**
 * The icons drawn through expo-symbols inside `root`, by their name on `platform`:
 * symbol views, and on Android also images from unstable_getMaterialSymbolSourceAsync,
 * which the Android tests name after their symbol.
 */
export function iconsIn(root: HostView, platform: Platform): Icon[] {
  const symbolViews = root
    .findAll(
      (node) =>
        typeof node.type === 'function' && node.type.name === 'SymbolView',
    )
    .map((view) => {
      const { name, tintColor } = view.props;
      return {
        name: typeof name === 'string' ? name : name?.[platform],
        color: tintColor,
        view,
      };
    });
  const images = root
    .findAll(
      (node) =>
        typeof node.type === 'string' &&
        uriOf(node).startsWith('material-symbol:'),
    )
    .map((view) => ({
      name: uriOf(view).replace('material-symbol:', ''),
      color: styleOf(view).tintColor ?? view.props.tintColor,
      view,
    }));
  return [...symbolViews, ...images];
}

export const iconNames = (root: HostView, platform: Platform) =>
  iconsIn(root, platform).map(({ name }) => name);

// The header

type Menu = NonNullable<HeaderActionsProps['menu']>;
type Expect<T extends true> = T;

/** A menu holds at most two actions, so its props type refuses a third. */
export type MenuRefusesAThirdAction = Expect<
  [HeaderAction, HeaderAction, HeaderAction] extends Menu['actions']
    ? false
    : true
>;

/** The test screen's navigation bar, the top one in the Groups tab. */
export function probeBar() {
  const bars = navigationBars(tab('Groups'));
  return bars[bars.length - 1];
}

interface BarMenuItem {
  type: string;
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

const barItemsOn = (side: 'Left' | 'Right'): BarItem[] =>
  probeBar().props[`header${side}BarButtonItems`] ?? [];

function describeBarItem(item: BarItem) {
  if (item.type === 'menu')
    return {
      menu: item.accessibilityLabel,
      icon: item.icon?.type === 'sfSymbol' ? item.icon.name : item.icon,
      disabled: item.disabled === true,
      items: (item.menu?.items ?? []).map((entry) =>
        entry.disabled ? `${entry.title} (disabled)` : entry.title,
      ),
    };
  return {
    button: item.title,
    variant: item.variant ?? 'plain',
    disabled: item.disabled === true,
  };
}

/**
 * The iOS bar items on each side of the test screen's navigation bar. The right
 * side starts from the trailing edge, as UIKit lays it out.
 */
export const barItems = () => ({
  left: barItemsOn('Left').map(describeBarItem),
  right: barItemsOn('Right').map(describeBarItem),
});

/** Presses an iOS bar button by its text, as the native bar reports a press. */
export function pressBarButton(title: string) {
  const item = [...barItemsOn('Left'), ...barItemsOn('Right')].find(
    (candidate) => candidate.type === 'button' && candidate.title === title,
  );
  if (item === undefined) throw new Error(`No ${title} in the navigation bar`);
  // The native bar sends no press for a disabled item.
  if (!item.disabled)
    fireEvent(probeBar(), 'pressHeaderBarButtonItem', {
      nativeEvent: { buttonId: item.buttonId },
    });
}

/** Chooses an item of the iOS menu by its text, as the native menu reports it. */
export function chooseFromMenu(title: string) {
  const entry = barItemsOn('Right')
    .flatMap((item) => item.menu?.items ?? [])
    .find((candidate) => candidate.title === title);
  if (entry === undefined) throw new Error(`No ${title} in the menu`);
  if (!entry.disabled)
    fireEvent(probeBar(), 'pressHeaderBarButtonMenuItem', {
      nativeEvent: { menuId: entry.menuId },
    });
}

const accessibleName = (view: HostView) =>
  view.props.accessibilityLabel ?? view.props['aria-label'];

/** An Android header button of the test screen, by its accessible name. */
export const headerButton = (name: string) =>
  within(probeBar()).getByRole('button', { name });

/** The Android header buttons on each side of the test screen's bar, left to right. */
export function headerButtons() {
  const sides: Record<'left' | 'right', string[]> = { left: [], right: [] };
  for (const subview of nativeViews(
    /^RNSScreenStackHeaderSubview$/,
    probeBar(),
  )) {
    const side: unknown = subview.props.type;
    if (side === 'left' || side === 'right')
      sides[side].push(
        ...within(subview).queryAllByRole('button').map(accessibleName),
      );
  }
  return sides;
}

/** The touch area of a header button, in dp. */
export function touchSize(button: HostView) {
  const style = styleOf(button);
  return {
    width: Number(style.width ?? style.minWidth ?? 0),
    height: Number(style.height ?? style.minHeight ?? 0),
  };
}

/** How opaque the icon of `button` is drawn, through every view out to the bar. */
export function iconOpacity(button: HostView) {
  const icon = iconsIn(button, 'android')[0]?.view ?? button;
  const bar = probeBar();
  let opacity = 1;
  for (
    let view: HostView | null = icon;
    view && view !== bar;
    view = view.parent
  )
    if (typeof view.type === 'string')
      opacity *= Number(styleOf(view).opacity ?? 1);
  return opacity;
}

// Colors

/** The fixed colors and uncolored texts of the test screen and its navigation bar. */
export function probeColors() {
  const colors = new Map<string, { color: number; where: string }>();
  for (const [part, root] of [
    ['screen', probe()],
    ['bar', probeBar()],
  ] as const)
    for (const [place, found] of fixedColors(root))
      colors.set(`${part} ${place}`, found);
  return {
    colors,
    uncolored: [
      ...textsWithoutColor(probe()),
      ...textsWithoutColor(probeBar()),
    ],
  };
}
