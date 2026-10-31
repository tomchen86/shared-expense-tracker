// Expo Router looks for Expo Go once, when it loads, so this comes first.
import './expo-go';
import { Linking } from 'react-native';
import {
  launchApp,
  navigationBarTitles,
  selectedTab,
  tab,
} from './shell-tabs-app';

// Runs on Android only (apps/mobile/jest.config.cjs), in Expo Go, which serves the
// app from Metro at 127.0.0.1:8093.

jest.mock('../../src/storage/expo', () => ({
  openPhoneDatabase: async () =>
    jest
      .requireActual<typeof import('../../src/storage/node')>(
        '../../src/storage/node',
      )
      .openNodeDatabase(':memory:'),
}));

beforeEach(() => {
  // Expo Go makes the app's own URLs Expo Go URLs, which put the path of a
  // screen after `/--`. Expo Router gets them from the expo-linking mock that
  // expo-router/testing-library installs.
  jest
    .spyOn(
      jest.requireMock<typeof import('expo-linking')>('expo-linking'),
      'createURL',
    )
    .mockImplementation((path) => `exp://127.0.0.1:8093/--${path}`);
});

/** Launches the app as Expo Go does when it reports opening the app from `url`. */
async function launchFrom(url: string | null) {
  jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(url);
  await launchApp();
}

test.each([
  ['from its root entry', 'exp://127.0.0.1:8093/--/'],
  ['from the project URL', 'exp://127.0.0.1:8093'],
  // Expo Router stops waiting for the URL after 150 ms and goes on without one.
  ['without reporting a URL', null],
])(
  '[SHELL-6.1] selects Expenses when Expo Go opens the app %s',
  async (_, url) => {
    await launchFrom(url);

    expect(selectedTab()).toBe('Expenses');
  },
);

test('[SHELL-11.1] selects the Groups tab at its root when Expo Go opens the app from /groups', async () => {
  await launchFrom('exp://127.0.0.1:8093/--/groups');

  expect(selectedTab()).toBe('Groups');
  expect(navigationBarTitles(tab('Groups'))).toEqual(['Groups']);
});
