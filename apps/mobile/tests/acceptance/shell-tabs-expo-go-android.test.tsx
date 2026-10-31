// Expo Router looks for Expo Go once, when it loads, so this comes first.
import './expo-go';
import { Linking } from 'react-native';
import { waitFor } from '@testing-library/react-native';
import { launchApp, selectedTab, tabs } from './shell-tabs-app';

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

test.each(['exp://127.0.0.1:8093/--/', 'exp://127.0.0.1:8093'])(
  '[SHELL-6.1] selects Expenses when Expo Go opens the app from %s',
  async (url) => {
    // Expo Go reports the URL it opened the app with.
    jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(url);

    launchApp();
    // The tabs show once local data has opened.
    await waitFor(() => expect(tabs()).toHaveLength(3));

    expect(selectedTab()).toBe('Expenses');
  },
);
