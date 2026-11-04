import * as fs from 'node:fs';
import * as path from 'node:path';
// Before expo-router itself, so the expo-linking mock it installs takes effect.
import {
  renderRouter,
  type MockContextConfig,
} from 'expo-router/testing-library';
import { router } from 'expo-router';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

// The shell tab tests start the whole app and read what it hands to the native tab
// bar and navigation bars: react-native-screens' host views, the part of them that
// a test renders. The test file replaces `openPhoneDatabase` with a Node database,
// and imports expo-router only through this file.

const APP = path.join(__dirname, '../../app');

export const TAB_NAMES = ['Groups', 'Expenses', 'Settings'];

type Routes = Extract<MockContextConfig, { appDir: string }>['overrides'];

/** A route file's key in an in-memory context: its path under `app/`, without the extension. */
const routeKey = (file: string) =>
  file.replace(/^\.\//, '').replace(/\.tsx?$/, '');

/**
 * Starts the app at `url`. `routes` adds test-only screens, keyed like
 * `./name.tsx` under `app/`. Expo Router's own way to add them drops the files'
 * extensions, and with them how it tells `+native-intent.tsx` from a route, so the
 * app's files and the test screens go in one in-memory context instead.
 */
export function openApp(url = '/', routes?: Routes) {
  if (routes === undefined) return renderRouter(APP, { initialUrl: url });
  const files = fs
    .readdirSync(APP, { recursive: true, encoding: 'utf8' })
    .filter((file) => /\.tsx?$/.test(file));
  return renderRouter(
    {
      ...Object.fromEntries(
        files.map((file) => [
          routeKey(file),
          jest.requireActual<object>(path.join(APP, file)),
        ]),
      ),
      ...Object.fromEntries(
        Object.entries(routes).map(([key, route]) => [routeKey(key), route]),
      ),
    },
    { initialUrl: url },
  );
}

/** Starts the app as `openApp` does and waits until its local data has opened. */
export async function startApp(url = '/', routes?: Routes) {
  const app = await openApp(url, routes);
  await waitFor(() =>
    expect(screen.queryByLabelText('Restoring local data')).toBeNull(),
  );
  return app;
}

/** Host views by native component name, in tree order. */
export function nativeViews(name: RegExp, root = screen.container) {
  return root.queryAll(
    (node) => typeof node.type === 'string' && name.test(node.type),
    { includeSelf: true },
  );
}

type HostView = ReturnType<typeof nativeViews>[number];
type Fiber = NonNullable<HostView['unstable_fiber']>;

function* fibersUnder(fiber: Fiber): Generator<Fiber> {
  for (let child = fiber.child; child; child = child.sibling) {
    yield child;
    yield* fibersUnder(child);
  }
}

/** The fiber React holds for `view` now; the one a view keeps may be from an earlier render. */
function currentFiber(view: HostView) {
  const own = view.unstable_fiber;
  if (own === null) throw new Error('Not a native view');
  let top = own;
  while (top.return) top = top.return;
  // Both versions of the root fiber hold the FiberRoot, which knows the current one.
  for (const fiber of fibersUnder(top.stateNode.current))
    if (fiber.stateNode === own.stateNode) return fiber;
  throw new Error('The view is no longer on screen');
}

/**
 * The components inside `root` whose type `matches`, in tree order: the props each
 * last rendered with, and its outermost native view. RNTL 14 shows native views
 * only, so this reads React's fiber tree, as react-test-renderer did.
 */
export function componentsIn(
  root: HostView,
  matches: (type: unknown) => boolean,
) {
  return [...fibersUnder(currentFiber(root))]
    .filter((fiber) => matches(fiber.type))
    .map((fiber) => {
      let native: Fiber | undefined;
      for (const inner of fibersUnder(fiber))
        if (typeof inner.type === 'string') {
          native = inner;
          break;
        }
      const view = root.queryAll(
        (candidate) =>
          native !== undefined &&
          candidate.unstable_fiber?.stateNode === native.stateNode,
        { includeSelf: true },
      )[0];
      return { props: fiber.memoizedProps, view };
    });
}

export function tabBar() {
  const bars = nativeViews(/^RNSTabsHost/);
  expect(bars).toHaveLength(1);
  return bars[0];
}

/** The tabs, in tab bar order; a tab's `title` is its label. */
export function tabs() {
  tabBar();
  return nativeViews(/^RNSTabsScreen/);
}

export function tab(name: string) {
  const all = tabs();
  expect(all.map((candidate) => candidate.props.title)).toContain(name);
  return all.find((candidate) => candidate.props.title === name)!;
}

export function selectedTab() {
  const key = tabBar().props.navStateRequest.selectedScreenKey;
  return tabs().find((candidate) => candidate.props.screenKey === key)?.props
    .title;
}

/** Taps a tab, reported the way the native tab bar reports a tap. */
export async function tapTab(name: string) {
  const bar = tabBar();
  const selectedScreenKey = tab(name).props.screenKey;
  await act(async () => {
    await fireEvent(bar, 'tabSelected', {
      nativeEvent: {
        selectedScreenKey,
        provenance: bar.props.navStateRequest.baseProvenance + 1,
        isRepeated: false,
        hasTriggeredSpecialEffect: false,
        actionOrigin: 'user',
      },
    });
  });
}

/** Pushes a screen, as a link in the app would. */
export async function push(url: string) {
  await act(async () => router.push(url));
}

/**
 * The navigation bars on screen inside `root`, each stack's bottom screen first.
 * Pass a tab to get its stack.
 */
export function navigationBars(root = screen.container) {
  return nativeViews(/^RNSScreenStackHeaderConfig$/, root).filter(
    (bar) => bar.props.hidden !== true,
  );
}

export function navigationBarTitles(root = screen.container) {
  return navigationBars(root).map((bar) => bar.props.title);
}
