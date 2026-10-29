import { useRef, useSyncExternalStore } from 'react';
import {
  AccessibilityInfo,
  Appearance,
  StyleSheet,
  Text,
  processColor,
  useColorScheme,
} from 'react-native';
import { act, fireEvent, screen, within } from '@testing-library/react-native';
import type { Database, SqlExecutor } from '../../src/storage';
import { openNodeDatabase } from '../../src/storage/node';
import { nativeViews, openApp, startApp, tab, tapTab } from './shell-tabs-app';

// The appearance tests stand in for what surrounds the app on the phone: light or
// dark mode and the app's own choice (React Native's Appearance and
// useColorScheme), iOS's Reduce Transparency setting (AccessibilityInfo), and the
// phone database, a file each test chooses (ADR-0006). They read what the app hands
// to the platform: colors, and native blur or glass views.

type Scheme = 'light' | 'dark';
type HostView = ReturnType<typeof nativeViews>[number];

// The phone

const phone = {
  mode: 'light' as Scheme,
  appChoice: undefined as Scheme | undefined,
};
const appearanceListeners = new Set<() => void>();
const notifyAppearance = () =>
  appearanceListeners.forEach((listener) => listener());
const subscribeToAppearance = (listener: () => void) => {
  appearanceListeners.add(listener);
  return () => {
    appearanceListeners.delete(listener);
  };
};

/** The app's appearance as the phone shows it: the app's own choice, else the phone's mode. */
export const appAppearance = (): Scheme => phone.appChoice ?? phone.mode;

/** Puts the phone in light or dark mode, before the app has chosen anything. */
export function fakePhoneAppearance(mode: Scheme) {
  phone.mode = mode;
  phone.appChoice = undefined;
  appearanceListeners.clear();
  jest.spyOn(Appearance, 'setColorScheme').mockImplementation((choice) => {
    phone.appChoice =
      choice === 'light' || choice === 'dark' ? choice : undefined;
    notifyAppearance();
  });
  jest.spyOn(Appearance, 'getColorScheme').mockImplementation(appAppearance);
  jest
    .spyOn(Appearance, 'addChangeListener')
    .mockImplementation((listener) => ({
      remove: subscribeToAppearance(() =>
        listener({ colorScheme: appAppearance() }),
      ),
    }));
  jest
    .mocked(useColorScheme)
    .mockImplementation(() =>
      useSyncExternalStore(subscribeToAppearance, appAppearance),
    );
}

/** The phone switches between light and dark mode, as from Control Center. */
export function switchPhoneTo(mode: Scheme) {
  act(() => {
    phone.mode = mode;
    notifyAppearance();
  });
}

/** The app's process ends, and with it the appearance the app chose for itself. */
export function endAppProcess(app: { unmount: () => void }) {
  app.unmount();
  phone.appChoice = undefined;
}

// iOS's Reduce Transparency setting

const transparencyListeners = new Set<(enabled: boolean) => void>();
let answerLater: ((enabled: boolean) => void) | undefined;

/**
 * How iOS answers when the app asks whether Reduce Transparency is on: with the
 * setting, with an error, or not until `answerReduceTransparency`.
 */
export function fakeReduceTransparency(answer: boolean | 'error' | 'later') {
  transparencyListeners.clear();
  answerLater = undefined;
  jest
    .mocked(AccessibilityInfo.isReduceTransparencyEnabled)
    .mockImplementation(() => {
      if (answer === 'error')
        return Promise.reject(new Error('Reduce Transparency is unavailable'));
      if (answer === 'later')
        return new Promise<boolean>((resolve) => {
          answerLater = resolve;
        });
      return Promise.resolve(answer);
    });
  jest.mocked(AccessibilityInfo.addEventListener).mockImplementation(((
    event: string,
    handler: (enabled: boolean) => void,
  ) => {
    if (event === 'reduceTransparencyChanged')
      transparencyListeners.add(handler);
    return {
      remove: () => {
        transparencyListeners.delete(handler);
      },
    };
  }) as typeof AccessibilityInfo.addEventListener);
}

/** iOS answers the question it left for later. */
export const answerReduceTransparency = (enabled: boolean) =>
  act(async () => answerLater?.(enabled));

/** The user turns Reduce Transparency on or off in iOS Settings while the app runs. */
export function changeReduceTransparency(enabled: boolean) {
  act(() => transparencyListeners.forEach((listener) => listener(enabled)));
}

/** How many times the app has asked whether Reduce Transparency is on. */
export const reduceTransparencyQuestions = () =>
  jest.mocked(AccessibilityInfo.isReduceTransparencyEnabled).mock.calls.length;

// The phone database

let beforeWrite = (): Promise<void> => Promise.resolve();

/** The phone database in `file`, with every write, in a transaction or not, behind `beforeWrite`. */
export function testDatabase(file: string): Database {
  const database = openNodeDatabase(file);
  const gated =
    <A extends unknown[], R>(write: (...args: A) => Promise<R>) =>
    async (...args: A): Promise<R> => {
      await beforeWrite();
      return write(...args);
    };
  const gate = <T extends SqlExecutor>(executor: T): T => ({
    ...executor,
    exec: gated(executor.exec),
    run: gated(executor.run),
  });
  return {
    ...gate(database),
    transaction: <T,>(work: (transaction: SqlExecutor) => Promise<T>) =>
      database.transaction((transaction) => work(gate(transaction))),
  };
}

export function allowWrites() {
  beforeWrite = () => Promise.resolve();
}

export function failWrites() {
  beforeWrite = () => Promise.reject(new Error('disk full'));
}

/** Holds every write until the test lets the writes through. */
export function holdWrites() {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  beforeWrite = () => held;
  return { release: () => act(async () => release()) };
}

// renderRouter fakes the global timers; Node's own module keeps the real ones.
const { setImmediate: nextTurn } =
  jest.requireActual<typeof import('node:timers')>('node:timers');

/** The test database and the faked phone answer within one turn of the event loop. */
export const settle = () =>
  act(() => new Promise<void>((resolve) => nextTurn(resolve)));

// The screen

/** The given texts as the screen shows them, top to bottom. */
export function inOrder(texts: string[]) {
  const escaped = texts.map((text) =>
    text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
  );
  return screen
    .getAllByText(new RegExp(`^(${escaped.join('|')})$`))
    .map((element) => element.props.children);
}

/**
 * The Appearance radio group. Its options are what screen readers focus, so the
 * group is found by its label rather than as an accessibility element itself.
 */
function appearanceGroup() {
  const group = screen.getByLabelText('Appearance');
  expect(group.props.role ?? group.props.accessibilityRole).toBe('radiogroup');
  return group;
}

/** The Appearance options, in screen order. */
export const appearanceOptions = () =>
  within(appearanceGroup()).getAllByRole('radio');

export const appearanceOption = (name: string) =>
  within(appearanceGroup()).getByRole('radio', { name });

/** Taps an Appearance option and lets the app answer. */
export async function chooseAppearance(name: string) {
  fireEvent.press(appearanceOption(name));
  await settle();
}

/** A test-only screen that shows the appearance the app had when it first appeared. */
export function AppearanceProbe() {
  const first = useRef(useColorScheme()).current;
  return <Text testID="appearance-probe">{first}</Text>;
}

export const nameField = () => screen.getByLabelText('Your name');
export const manageCategoriesRow = () =>
  screen.getByRole('button', { name: 'Manage Categories' });

// Colors

const COLOR_KEY = /colou?r$/i;

type ColorValue = { dynamic?: { light: unknown; dark: unknown } };

/**
 * A color the platform draws as it is in light and dark mode alike, as 0xAARRGGBB;
 * undefined for no color, a transparent one, or one the platform picks per
 * appearance (PlatformColor, or DynamicColorIOS with a color per appearance).
 */
function fixedColor(value: unknown): number | undefined {
  if (value == null) return undefined;
  if (typeof value === 'object') {
    const { dynamic } = value as ColorValue;
    const light = dynamic && fixedColor(dynamic.light);
    return dynamic && light === fixedColor(dynamic.dark) ? light : undefined;
  }
  const color = processColor(value as string | number);
  if (typeof color !== 'number') return undefined;
  return color >>> 24 === 0 ? undefined : color >>> 0;
}

const hex = (color: number) => `#${color.toString(16).padStart(8, '0')}`;

const isText = (view: HostView) =>
  ['Text', 'TextInput'].includes(String(view.type));

function describeView(view: HostView) {
  const shown = isText(view)
    ? (view.props.value ?? view.props.placeholder ?? view.props.children)
    : view.props.accessibilityLabel;
  return [view.type, shown && JSON.stringify(shown)].filter(Boolean).join(' ');
}

const hostViews = (root: HostView) =>
  root.findAll((view) => typeof view.type === 'string');

/**
 * The fixed colors on screen, keyed by where they are used: the view, counted in
 * screen order among views of its kind, and the property.
 */
export function fixedColors(root = screen.UNSAFE_root) {
  const found = new Map<string, { color: number; where: string }>();
  const counts = new Map<unknown, number>();
  for (const view of hostViews(root)) {
    const count = counts.get(view.type) ?? 0;
    counts.set(view.type, count + 1);
    const style = StyleSheet.flatten(view.props.style) ?? {};
    for (const [key, value] of [
      ...Object.entries(style),
      ...Object.entries(view.props),
    ]) {
      if (!COLOR_KEY.test(key) || key === 'shadowColor') continue;
      const color = fixedColor(value);
      if (color === undefined) continue;
      found.set(`${String(view.type)}#${count} ${key}`, {
        color,
        where: `${describeView(view)} ${key}`,
      });
    }
  }
  return found;
}

/** Places that use the same fixed color in light and dark mode. */
export const colorsInBoth = (
  light: ReturnType<typeof fixedColors>,
  dark: typeof light,
) =>
  [...light]
    .filter(([place, { color }]) => dark.get(place)?.color === color)
    .map(([, { color, where }]) => `${where} ${hex(color)}`);

function insideText(view: HostView) {
  for (let parent = view.parent; parent; parent = parent.parent)
    if (String(parent.type) === 'Text') return true;
  return false;
}

/** Texts left in the platform's default color, which is the same in light and dark mode. */
export const textsWithoutColor = (root = screen.UNSAFE_root) =>
  hostViews(root)
    .filter((view) => isText(view) && !insideText(view))
    .filter((view) => StyleSheet.flatten(view.props.style)?.color == null)
    .map(describeView);

/** The first background color behind `view`, looking outward. */
export function backgroundBehind(view: HostView) {
  for (let behind: HostView | null = view; behind; behind = behind.parent) {
    if (typeof behind.type !== 'string') continue;
    const background = StyleSheet.flatten(behind.props.style)?.backgroundColor;
    if (background == null) continue;
    if (typeof background === 'object' || fixedColor(background) !== undefined)
      return background as unknown;
  }
  return undefined;
}

/** Whether a background hides what is behind it: a platform color, or one with no transparency. */
export function isOpaque(background: unknown) {
  if (background == null) return false;
  if (typeof background === 'object') return true;
  const color = fixedColor(background);
  return color !== undefined && color >>> 24 === 0xff;
}

// Blur and glass

/** Native views that let blurred content through: expo-blur, expo-glass-effect, UIVisualEffectView. */
export const translucentViews = (root = screen.UNSAFE_root) =>
  nativeViews(/blur|glass|visualeffect/i, root);

function holds(outer: HostView, view: HostView) {
  for (let inner: HostView | null = view; inner; inner = inner.parent)
    if (inner === outer) return true;
  return false;
}

/** The largest part of the screen that holds `view` but not `other`: the section `view` is in. */
export function sectionOf(view: HostView, other: HostView) {
  let section = view;
  while (section.parent && !holds(section.parent, other))
    section = section.parent;
  return section;
}

/** The PROFILE and APP sections of the Settings root. */
export function settingsSections() {
  const name = nameField();
  const row = manageCategoriesRow();
  return [
    { name: 'PROFILE', marker: name, section: sectionOf(name, row) },
    { name: 'APP', marker: row, section: sectionOf(row, name) },
  ];
}

/** Sections without blur behind their content. */
export const sectionsWithoutBlur = () =>
  settingsSections()
    .filter(({ section }) => translucentViews(section).length === 0)
    .map(({ name }) => name);

/** Sections whose content does not sit on an opaque background. */
export const sectionsNotOpaque = () =>
  settingsSections()
    .filter(({ marker }) => !isOpaque(backgroundBehind(marker)))
    .map(({ name }) => name);

// Tests that run on both platforms

const TAB_ROOTS = ['Groups', 'Expenses', 'Settings'];

/** The fixed colors and uncolored texts on screen, with every tab root shown once. */
function tabRootColors() {
  return {
    colors: fixedColors(),
    uncolored: TAB_ROOTS.flatMap((name) => textsWithoutColor(tab(name))),
  };
}

/** The local data screen, in light and then in dark mode, with the database `open` gives. */
async function localDataScreens(
  open: () => Promise<Database>,
  setOpen: (open: () => Promise<Database>) => void,
  find: () => Promise<HostView>,
) {
  const shown = [];
  for (const mode of ['light', 'dark'] as const) {
    fakePhoneAppearance(mode);
    setOpen(open);
    const app = openApp('/');
    const view = await find();
    shown.push({
      colors: fixedColors(),
      uncolored: textsWithoutColor(),
      background: backgroundBehind(view),
    });
    endAppProcess(app);
  }
  return shown;
}

/**
 * The SHELL-34.1 tests, which each platform's file runs. `setOpen` replaces how
 * that file's mock opens the phone database.
 */
export function testColorsFollowTheAppearance(
  setOpen: (open: () => Promise<Database>) => void,
) {
  test('[SHELL-34.1] uses colors that follow the appearance on the tab roots and their title bars', async () => {
    await startApp('/settings');
    for (const name of TAB_ROOTS) await tapTab(name);
    const light = tabRootColors();
    switchPhoneTo('dark');
    const dark = tabRootColors();

    expect(colorsInBoth(light.colors, dark.colors)).toEqual([]);
    expect([...light.uncolored, ...dark.uncolored]).toEqual([]);
  });

  test('[SHELL-34.1] gives the loading screen a background that follows the phone', async () => {
    const [light, dark] = await localDataScreens(
      () => new Promise<Database>(() => undefined),
      setOpen,
      () => screen.findByLabelText('Restoring local data'),
    );

    expect(light.background).toBeDefined();
    expect(dark.background).toBeDefined();
    expect(colorsInBoth(light.colors, dark.colors)).toEqual([]);
  });

  test('[SHELL-34.1] colors the error screen and its two lines for the phone', async () => {
    const [light, dark] = await localDataScreens(
      () => Promise.reject(new Error('cannot open the database')),
      setOpen,
      () => screen.findByText('Unable to Load Local Data'),
    );

    expect(light.background).toBeDefined();
    expect(dark.background).toBeDefined();
    expect(colorsInBoth(light.colors, dark.colors)).toEqual([]);
    expect([...light.uncolored, ...dark.uncolored]).toEqual([]);
  });
}
