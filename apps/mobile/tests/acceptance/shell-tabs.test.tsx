import { screen } from '@testing-library/react-native';
import {
  TAB_NAMES,
  navigationBarTitles,
  navigationBars,
  push,
  selectedTab,
  startApp,
  tab,
  tabBar,
  tabs,
  tapTab,
} from './shell-tabs-app';

// Runs on iOS; shell-tabs-android.test.tsx checks Android.

jest.mock('../../src/storage/expo', () => ({
  openPhoneDatabase: async () =>
    jest
      .requireActual<typeof import('../../src/storage/node')>(
        '../../src/storage/node',
      )
      .openNodeDatabase(':memory:'),
}));

const PUSHED_FROM_SETTINGS = [
  ['/settings/archived-groups', 'Archived Groups'],
  ['/settings/manage-categories', 'Manage Categories'],
];

async function pushFromSettings(url: string) {
  await tapTab('Settings');
  await push(url);
}

test('[SHELL-6.1] shows the Groups, Expenses and Settings tabs in that order with Expenses selected', async () => {
  await startApp();

  expect(tabs().map((candidate) => candidate.props.title)).toEqual(TAB_NAMES);
  expect(selectedTab()).toBe('Expenses');
});

test('[SHELL-7.1] uses SF Symbols for the tab icons and their filled versions when selected', async () => {
  await startApp();

  expect(
    tabs().map(({ props }) => [
      props.iconType,
      props.iconResourceName,
      props.selectedIconResourceName,
    ]),
  ).toEqual([
    ['sfSymbol', 'person.3', 'person.3.fill'],
    ['sfSymbol', 'creditcard', 'creditcard.fill'],
    ['sfSymbol', 'gearshape', 'gearshape.fill'],
  ]);
});

test('[SHELL-9.1] titles each tab root only in its native navigation bar', async () => {
  await startApp();

  expect(navigationBarTitles()).toEqual(TAB_NAMES);
  for (const name of TAB_NAMES) {
    expect(
      screen.queryAllByText(name, { includeHiddenElements: true }),
    ).toEqual([]);
  }
});

test('[SHELL-10.1] titles each tab root with a native large title', async () => {
  await startApp();

  for (const name of TAB_NAMES) {
    expect(
      navigationBars(tab(name)).map(({ props }) => [
        props.title,
        props.largeTitle,
      ]),
    ).toEqual([[name, true]]);
  }
});

test.each([
  ['/', 'Expenses'],
  ['/groups', 'Groups'],
  ['/settings', 'Settings'],
])(
  '[SHELL-11.1] opening %s selects the %s tab at its root',
  async (url, name) => {
    const app = await startApp(url);

    expect(selectedTab()).toBe(name);
    expect(navigationBarTitles(tab(name))).toEqual([name]);
    expect(app.getPathname()).toBe(url);
  },
);

test('[SHELL-11.1] selecting the Groups tab changes the URL to /groups', async () => {
  const app = await startApp();

  await tapTab('Groups');

  expect(selectedTab()).toBe('Groups');
  expect(app.getPathname()).toBe('/groups');
});

test.each(PUSHED_FROM_SETTINGS)(
  '[SHELL-12.1] pushes %s from Settings onto the Settings tab',
  async (url, title) => {
    const app = await startApp();

    await pushFromSettings(url);

    expect(selectedTab()).toBe('Settings');
    expect(navigationBarTitles(tab('Settings'))).toEqual(['Settings', title]);
    expect(app.getPathname()).toBe(url);
  },
);

test('[SHELL-13.1] shows only a back arrow named Back on a screen pushed from Settings', async () => {
  await startApp();

  await pushFromSettings('/settings/archived-groups');

  const pushed = navigationBars(tab('Settings')).at(-1)?.props;
  expect(pushed?.title).toBe('Archived Groups');
  // The native stack hides the back title with backButtonDisplayMode on iOS 14
  // and later, and with backTitleVisible when it knows no iOS version, as in Jest.
  expect(pushed).toMatchObject(
    pushed?.backButtonDisplayMode === undefined
      ? { backTitle: 'Back', backTitleVisible: false }
      : { backTitle: 'Back', backButtonDisplayMode: 'minimal' },
  );
});

test('[SHELL-14.1] keeps the tab bar instead of a sidebar on iPad', async () => {
  await startApp();

  expect(tabBar().props.tabBarControllerMode).toBe('tabBar');
});
