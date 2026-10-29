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

/**
 * Starts the app at `url` and waits until its local data has opened. `routes`
 * adds test-only screens, keyed like `./name.tsx` under `app/`.
 */
export async function startApp(url = '/', routes?: Routes) {
  const app = renderRouter(routes ? { appDir: APP, overrides: routes } : APP, {
    initialUrl: url,
  });
  await waitFor(() =>
    expect(screen.queryByLabelText('Restoring local data')).toBeNull(),
  );
  return app;
}

/** Host views by native component name, in tree order. */
export function nativeViews(name: RegExp, root = screen.UNSAFE_root) {
  return root.findAll(
    (node) => typeof node.type === 'string' && name.test(node.type),
  );
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
    fireEvent(bar, 'tabSelected', {
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
export function navigationBars(root = screen.UNSAFE_root) {
  return nativeViews(/^RNSScreenStackHeaderConfig$/, root).filter(
    (bar) => bar.props.hidden !== true,
  );
}

export function navigationBarTitles(root = screen.UNSAFE_root) {
  return navigationBars(root).map((bar) => bar.props.title);
}
