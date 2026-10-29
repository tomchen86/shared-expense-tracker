import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Appearance } from 'react-native';
import { screen } from '@testing-library/react-native';
import type { Database } from '../../src/storage';
import { openApp, startApp } from './shell-tabs-app';
import {
  allowWrites,
  answerReduceTransparency,
  appAppearance,
  changeReduceTransparency,
  fakePhoneAppearance,
  fakeReduceTransparency,
  inOrder,
  reduceTransparencyQuestions,
  sectionsNotOpaque,
  sectionsWithoutBlur,
  settle,
  switchPhoneTo,
  testColorsFollowTheAppearance,
  testDatabase,
  translucentViews,
} from './shell-appearance-app';

// Runs on iOS. The iOS Appearance picker is a native segmented control, which
// these tests cannot operate (SHELL-27.1 is checked by hand); choosing an option
// is tested on Android, where both platforms share the same code (ADR-0002).

let mockOpen: () => Promise<Database>;

jest.mock('../../src/storage/expo', () => ({
  openPhoneDatabase: () => mockOpen(),
}));

let directory: string;

beforeEach(() => {
  jest.clearAllMocks();
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'appearance-'));
  const file = path.join(directory, 'app.db');
  mockOpen = async () => testDatabase(file);
  allowWrites();
  fakePhoneAppearance('light');
  fakeReduceTransparency(false);
});

afterEach(() => {
  jest.restoreAllMocks();
  fs.rmSync(directory, { recursive: true, force: true });
});

const showsOnlyTheLoadingIndicator = () => {
  expect(screen.getByLabelText('Restoring local data')).toBeOnTheScreen();
  expect(screen.queryByText('PROFILE')).toBeNull();
};

test('[SHELL-1.2] keeps only the loading indicator until iOS answers whether Reduce Transparency is on', async () => {
  fakeReduceTransparency('later');
  openApp('/settings');
  // The test database opens within these turns; only iOS's answer is missing.
  for (let turn = 0; turn < 5; turn++) await settle();

  showsOnlyTheLoadingIndicator();

  await answerReduceTransparency(false);
  await settle();

  expect(screen.queryByLabelText('Restoring local data')).toBeNull();
  expect(screen.getByText('PROFILE')).toBeOnTheScreen();
});

test('[SHELL-26.1] puts the APPEARANCE section between PROFILE and APP', async () => {
  await startApp('/settings');

  expect(inOrder(['PROFILE', 'APPEARANCE', 'APP'])).toEqual([
    'PROFILE',
    'APPEARANCE',
    'APP',
  ]);
});

test('[SHELL-30.1] lets iOS switch the app between light and dark while the option is System', async () => {
  // Without this, iOS keeps an Expo app in light mode whatever the phone uses.
  const config = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../../app.json'), 'utf8'),
  );
  expect(config.expo.userInterfaceStyle).toBe('automatic');

  await startApp('/settings');
  const chosen = jest
    .mocked(Appearance.setColorScheme)
    .mock.calls.filter(([choice]) => choice === 'light' || choice === 'dark');
  expect(chosen).toEqual([]);

  switchPhoneTo('dark');
  expect(appAppearance()).toBe('dark');
  switchPhoneTo('light');
  expect(appAppearance()).toBe('light');
});

testColorsFollowTheAppearance((open) => {
  mockOpen = open;
});

test('[SHELL-35.1] puts blur behind the PROFILE and APP sections while Reduce Transparency is off', async () => {
  await startApp('/settings');

  expect(sectionsWithoutBlur()).toEqual([]);
});

test('[SHELL-36.1] shows no blur or glass while Reduce Transparency is on', async () => {
  fakeReduceTransparency(true);
  await startApp('/settings');

  expect(translucentViews()).toHaveLength(0);
  expect(sectionsNotOpaque()).toEqual([]);
});

test('[SHELL-36.1] makes the sections opaque as soon as Reduce Transparency is turned on', async () => {
  await startApp('/settings');
  expect(sectionsWithoutBlur()).toEqual([]);

  changeReduceTransparency(true);

  expect(translucentViews()).toHaveLength(0);
  expect(sectionsNotOpaque()).toEqual([]);
});

test('[SHELL-36.1] brings the blur back as soon as Reduce Transparency is turned off', async () => {
  fakeReduceTransparency(true);
  await startApp('/settings');

  changeReduceTransparency(false);

  expect(sectionsWithoutBlur()).toEqual([]);
});

test('[SHELL-36.1] asks iOS about Reduce Transparency only once', async () => {
  await startApp('/settings');
  changeReduceTransparency(true);
  changeReduceTransparency(false);

  expect(sectionsWithoutBlur()).toEqual([]);
  expect(reduceTransparencyQuestions()).toBe(1);
});

test('[SHELL-37.1] treats Reduce Transparency as on when iOS cannot answer', async () => {
  fakeReduceTransparency('error');
  await startApp('/settings');

  expect(screen.getByText('PROFILE')).toBeOnTheScreen();
  expect(translucentViews()).toHaveLength(0);
  expect(sectionsNotOpaque()).toEqual([]);
});

test('[SHELL-37.1] follows iOS once it reports Reduce Transparency is off', async () => {
  fakeReduceTransparency('error');
  await startApp('/settings');

  changeReduceTransparency(false);

  expect(sectionsWithoutBlur()).toEqual([]);
});
