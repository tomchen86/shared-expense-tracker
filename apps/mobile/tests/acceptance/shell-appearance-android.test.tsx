import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Alert, StyleSheet } from 'react-native';
import { fireEvent, screen } from '@testing-library/react-native';
import type { Database } from '../../src/storage';
import { push, startApp } from './shell-tabs-app';
import {
  AppearanceProbe,
  allowWrites,
  appAppearance,
  appearanceOption,
  appearanceOptions,
  chooseAppearance,
  endAppProcess,
  failWrites,
  fakePhoneAppearance,
  fakeReduceTransparency,
  holdWrites,
  inOrder,
  sectionsNotOpaque,
  settle,
  switchPhoneTo,
  testColorsFollowTheAppearance,
  testDatabase,
  translucentViews,
} from './shell-appearance-app';

// Runs on Android, whose Appearance picker is made of React Native buttons. Both
// platforms share the code behind the picker (ADR-0002), so choosing an option is
// tested here. The phone database is a file each test chooses (ADR-0006).

let mockOpen: () => Promise<Database>;

jest.mock('../../src/storage/expo', () => ({
  openPhoneDatabase: () => mockOpen(),
}));

const SAVE_FAILED = [
  'Unable to Save Settings',
  'Your settings could not be saved. Please try again.',
];

let directory: string;
let alert: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'appearance-'));
  const file = path.join(directory, 'app.db');
  mockOpen = async () => testDatabase(file);
  allowWrites();
  fakePhoneAppearance('light');
  fakeReduceTransparency(false);
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
  fs.rmSync(directory, { recursive: true, force: true });
});

const alerts = () => alert.mock.calls.map((call) => call.slice(0, 2));

const startSettings = () => startApp('/settings');

/** Starts the app again on the same database, as after closing it on the phone. */
async function restart(app: { unmount: () => void }, url = '/settings') {
  endAppProcess(app);
  return startApp(url, { './appearance-probe.tsx': AppearanceProbe });
}

function expectChecked(name: string) {
  for (const option of ['System', 'Light', 'Dark']) {
    if (option === name) expect(appearanceOption(option)).toBeChecked();
    else expect(appearanceOption(option)).not.toBeChecked();
  }
}

/** The nearest native view that holds all of `views`. */
function commonParent(views: ReturnType<typeof appearanceOptions>) {
  const holdsAll = (parent: (typeof views)[number]) =>
    views.every((view) => {
      for (let inner: typeof parent | null = view; inner; inner = inner.parent)
        if (inner === parent) return true;
      return false;
    });
  let parent = views[0].parent;
  while (parent && (typeof parent.type !== 'string' || !holdsAll(parent)))
    parent = parent.parent;
  return parent;
}

test('[SHELL-1.2] shows the app on Android without waiting for Reduce Transparency', async () => {
  fakeReduceTransparency('later');
  await startSettings();

  expect(screen.getByText('PROFILE')).toBeOnTheScreen();
});

test('[SHELL-26.1] shows System, Light and Dark between PROFILE and APP', async () => {
  await startSettings();

  expect(
    inOrder(['PROFILE', 'APPEARANCE', 'System', 'Light', 'Dark', 'APP']),
  ).toEqual(['PROFILE', 'APPEARANCE', 'System', 'Light', 'Dark', 'APP']);
  expect(appearanceOptions()).toEqual([
    appearanceOption('System'),
    appearanceOption('Light'),
    appearanceOption('Dark'),
  ]);
});

test('[SHELL-26.1] marks System before an option is chosen', async () => {
  await startSettings();

  expectChecked('System');
});

test('[SHELL-28.1] shows the three options as buttons side by side, the current one checked', async () => {
  await startSettings();

  const row = commonParent(appearanceOptions());
  expect(StyleSheet.flatten(row?.props.style)?.flexDirection).toBe('row');
  expectChecked('System');
});

test('[SHELL-29.1] turns the app dark at once when Dark is chosen on a light phone', async () => {
  await startSettings();

  await chooseAppearance('Dark');

  expect(appAppearance()).toBe('dark');
  expectChecked('Dark');
  expect(alerts()).toEqual([]);
});

test('[SHELL-29.1] turns the app light at once when Light is chosen on a dark phone', async () => {
  fakePhoneAppearance('dark');
  await startSettings();

  await chooseAppearance('Light');

  expect(appAppearance()).toBe('light');
  expectChecked('Light');
});

test('[SHELL-30.1] goes back to the phone appearance when System is chosen after Dark', async () => {
  await startSettings();
  await chooseAppearance('Dark');

  await chooseAppearance('System');

  expect(appAppearance()).toBe('light');
  expectChecked('System');
});

test('[SHELL-30.1] follows the phone as it switches while the option is System', async () => {
  await startSettings();
  await chooseAppearance('Dark');
  await chooseAppearance('System');

  switchPhoneTo('dark');
  expect(appAppearance()).toBe('dark');
  switchPhoneTo('light');
  expect(appAppearance()).toBe('light');
});

test('[SHELL-31.1] starts dark after Dark was chosen, from the first screen', async () => {
  const app = await startSettings();
  await chooseAppearance('Dark');

  await restart(app, '/appearance-probe');

  expect(screen.getByTestId('appearance-probe')).toHaveTextContent('dark');
  await push('/settings');
  expectChecked('Dark');
});

test('[SHELL-31.1] starts with the phone appearance and System before an option is chosen', async () => {
  fakePhoneAppearance('dark');
  await startApp('/appearance-probe', {
    './appearance-probe.tsx': AppearanceProbe,
  });

  expect(screen.getByTestId('appearance-probe')).toHaveTextContent('dark');
  await push('/settings');
  expectChecked('System');
});

test('[SHELL-32.1] locks the options while the choice is saved', async () => {
  await startSettings();
  const writes = holdWrites();

  fireEvent.press(appearanceOption('Dark'));
  await settle();

  for (const option of ['System', 'Light', 'Dark'])
    expect(appearanceOption(option)).toBeDisabled();

  await writes.release();
  await settle();

  for (const option of ['System', 'Light', 'Dark'])
    expect(appearanceOption(option)).toBeEnabled();
  expectChecked('Dark');
  expect(appAppearance()).toBe('dark');
});

test('[SHELL-32.1] ignores another option while the choice is saved', async () => {
  const app = await startSettings();
  const writes = holdWrites();

  fireEvent.press(appearanceOption('Dark'));
  await settle();
  fireEvent.press(appearanceOption('Light'));
  await settle();
  await writes.release();
  await settle();

  expectChecked('Dark');
  await restart(app);
  expectChecked('Dark');
});

test('[SHELL-33.1] alerts and keeps the appearance and the option when the choice cannot be saved', async () => {
  await startSettings();
  failWrites();

  await chooseAppearance('Dark');

  expect(alerts()).toEqual([SAVE_FAILED]);
  expect(appAppearance()).toBe('light');
  expectChecked('System');
  for (const option of ['System', 'Light', 'Dark'])
    expect(appearanceOption(option)).toBeEnabled();
});

test('[SHELL-33.1] saves the choice when it is made again after the database recovers', async () => {
  const app = await startSettings();
  failWrites();
  await chooseAppearance('Dark');

  allowWrites();
  await chooseAppearance('Dark');

  expect(appAppearance()).toBe('dark');
  await restart(app);
  expectChecked('Dark');
});

testColorsFollowTheAppearance((open) => {
  mockOpen = open;
});

test('[SHELL-38.1] adds no blur or glass of its own, and keeps the sections opaque, on Android', async () => {
  await startSettings();

  expect(translucentViews()).toHaveLength(0);
  expect(sectionsNotOpaque()).toEqual([]);
});
