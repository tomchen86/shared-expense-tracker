import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { AccessibilityInfo, Alert, Text } from 'react-native';
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react-native';
import {
  nativeViews,
  navigationBarTitles,
  push,
  selectedTab,
  startApp,
  tab,
} from './shell-tabs-app';
import { useLocalIdentity } from '../../src/shell';
import type { Database, SqlExecutor } from '../../src/storage';

// Runs on iOS. The phone database is a file each test chooses (ADR-0006). After
// the app has started, a test can hold or fail its writes, as a slow or full disk
// would.

let mockFile = '';
let mockBeforeWrite = (): Promise<void> => Promise.resolve();

/** Puts every write, in a transaction or not, behind `mockBeforeWrite`. */
function mockGatedWrites(database: Database): Database {
  const gated =
    <A extends unknown[], R>(write: (...args: A) => Promise<R>) =>
    async (...args: A): Promise<R> => {
      await mockBeforeWrite();
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

jest.mock('../../src/storage/expo', () => ({
  openPhoneDatabase: async () => {
    const { openNodeDatabase } = jest.requireActual<
      typeof import('../../src/storage/node')
    >('../../src/storage/node');
    return mockGatedWrites(openNodeDatabase(mockFile));
  },
}));

const LAYOUT = [
  'PROFILE',
  'Your Name',
  'Used to identify you in shared expenses and balances.',
  'APP',
  'Manage Categories',
  'Archived Groups',
];
const ASK_FOR_NAME = 'Please enter your name';
const SAVE_FAILED = [
  'Unable to Save Settings',
  'Your settings could not be saved. Please try again.',
];
// Compares the field's text as typed, spaces included.
const AS_TYPED = { normalizer: (text: string) => text };

let directory: string;
let alert: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-'));
  mockFile = path.join(directory, 'app.db');
  allowWrites();
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
  fs.rmSync(directory, { recursive: true, force: true });
});

/** A test-only screen that shows the name the rest of the app uses now. */
function NameInUse() {
  return <Text testID="name-in-use">{useLocalIdentity().name}</Text>;
}

const startSettings = () =>
  startApp('/settings', { './name-in-use.tsx': NameInUse });

async function expectNameInUse(name: string) {
  await push('/name-in-use');
  await waitFor(() =>
    expect(screen.getByTestId('name-in-use')).toHaveTextContent(name),
  );
}

const nameField = () => screen.getByLabelText('Your name');

/** Losing focus: the native field reports the end of editing and a blur together. */
function leaveNameField() {
  const field = nameField();
  act(() => {
    fireEvent(field, 'endEditing', { nativeEvent: {} });
    fireEvent(field, 'blur', { nativeEvent: {} });
  });
}

/** Return also takes the focus from a single-line field unless it keeps it. */
function pressReturn() {
  const field = nameField();
  const keepsFocus =
    field.props.submitBehavior === 'submit' ||
    field.props.blurOnSubmit === false;
  act(() => {
    fireEvent(field, 'submitEditing', { nativeEvent: {} });
    if (keepsFocus) return;
    fireEvent(field, 'endEditing', { nativeEvent: {} });
    fireEvent(field, 'blur', { nativeEvent: {} });
  });
}

// renderRouter fakes the global timers; Node's own module keeps the real ones.
const { setImmediate: nextTurn } =
  jest.requireActual<typeof import('node:timers')>('node:timers');

/** The test database answers within one turn of the event loop. */
const settle = () =>
  act(() => new Promise<void>((resolve) => nextTurn(resolve)));

async function enterName(text: string, finish = leaveNameField) {
  fireEvent.changeText(nameField(), text);
  finish();
  await settle();
}

function allowWrites() {
  mockBeforeWrite = () => Promise.resolve();
}

function failWrites() {
  mockBeforeWrite = () => Promise.reject(new Error('disk full'));
}

/** Holds every write until the test lets the writes through or fails them. */
function holdWrites() {
  let release!: () => void;
  let fail!: (error: Error) => void;
  const held = new Promise<void>((resolve, reject) => {
    release = resolve;
    fail = reject;
  });
  held.catch(() => undefined);
  mockBeforeWrite = () => held;
  return {
    release: () => act(async () => release()),
    fail: () => act(async () => fail(new Error('disk full'))),
  };
}

const alerts = () => alert.mock.calls.map((call) => call.slice(0, 2));

const announcements = () =>
  [
    ...jest.mocked(AccessibilityInfo.announceForAccessibility).mock.calls,
    ...jest.mocked(AccessibilityInfo.announceForAccessibilityWithOptions).mock
      .calls,
  ].map(([message]) => message);

/** The given texts as the screen shows them, top to bottom. */
function inOrder(texts: string[]) {
  const escaped = texts.map((text) =>
    text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
  );
  return screen
    .getAllByText(new RegExp(`^(${escaped.join('|')})$`))
    .map((element) => element.props.children);
}

/** The bottom screen of the Settings tab's stack. */
const settingsRoot = () => nativeViews(/^RNSScreen$/, tab('Settings'))[0];

type NativeView = ReturnType<typeof nativeViews>[number];

/** The first native subview of `view`; components that render nothing add none. */
function firstSubview(view: NativeView): NativeView | undefined {
  for (const child of view.children) {
    if (typeof child === 'string') return undefined;
    if (typeof child.type === 'string') return child;
    const subview = firstSubview(child);
    if (subview) return subview;
  }
  return undefined;
}

/** UIKit ties a large title to the scroll view it reaches through first subviews. */
function scrollViewTheTitleFollows() {
  let view = firstSubview(settingsRoot());
  while (view !== undefined && String(view.type) !== 'RCTScrollView') {
    view = firstSubview(view);
  }
  return view;
}

test('[SHELL-16.1] shows PROFILE with the name field and its note, then APP with two rows', async () => {
  await startSettings();

  expect(inOrder(LAYOUT)).toEqual(LAYOUT);
});

test('[SHELL-17.1] shows an empty name field with Enter your name before a name is saved', async () => {
  await startSettings();

  expect(nameField()).toHaveDisplayValue('', AS_TYPED);
  expect(screen.getByPlaceholderText('Enter your name')).toBe(nameField());
});

test('[SHELL-17.1] shows the saved name after the app restarts', async () => {
  const app = await startSettings();
  await enterName('Taylor');
  app.unmount();

  await startSettings();

  expect(nameField()).toHaveDisplayValue('Taylor', AS_TYPED);
});

test('[SHELL-18.1] saves the trimmed name when the field loses focus, without a Save button or a message', async () => {
  await startSettings();
  expect(screen.queryByRole('button', { name: /save/i })).toBeNull();

  await enterName(' Taylor ');

  expect(nameField()).toHaveDisplayValue('Taylor', AS_TYPED);
  expect(alerts()).toEqual([]);
  expect(screen.queryByText(ASK_FOR_NAME)).toBeNull();
  await expectNameInUse('Taylor');
});

test('[SHELL-18.1] saves the name when Return is pressed', async () => {
  await startSettings();

  await enterName('Sam', pressReturn);

  await expectNameInUse('Sam');
});

test('[SHELL-19.1] does not save a name that only gains surrounding spaces', async () => {
  await startSettings();
  await enterName('Taylor');
  failWrites();

  await enterName(' Taylor ');

  expect(alerts()).toEqual([]);
  expect(screen.queryByText(ASK_FOR_NAME)).toBeNull();
});

test('[SHELL-19.1] does nothing when no name was saved and the field holds only spaces', async () => {
  await startSettings();
  failWrites();

  await enterName('   ');

  expect(alerts()).toEqual([]);
  expect(screen.queryByText(ASK_FOR_NAME)).toBeNull();
});

test('[SHELL-20.1] asks for a name below the field instead of saving an emptied name', async () => {
  await startSettings();
  await enterName('Taylor');

  await enterName('');

  expect(nameField()).toHaveDisplayValue('', AS_TYPED);
  expect(inOrder(['PROFILE', 'Your Name', ASK_FOR_NAME, 'APP'])).toEqual([
    'PROFILE',
    'Your Name',
    ASK_FOR_NAME,
    'APP',
  ]);
  expect(announcements()).toContain(ASK_FOR_NAME);
  expect(alerts()).toEqual([]);
  await expectNameInUse('Taylor');
});

test('[SHELL-20.1] asks for a name the same way when only spaces are submitted with Return', async () => {
  await startSettings();
  await enterName('Taylor');

  await enterName('   ', pressReturn);

  expect(nameField()).toHaveDisplayValue('   ', AS_TYPED);
  expect(screen.getByText(ASK_FOR_NAME)).toBeOnTheScreen();
  expect(alerts()).toEqual([]);
  await expectNameInUse('Taylor');
});

test('[SHELL-20.1] stops asking once a name is saved', async () => {
  await startSettings();
  await enterName('Taylor');
  await enterName('');
  expect(screen.getByText(ASK_FOR_NAME)).toBeOnTheScreen();

  await enterName('Sam');

  expect(screen.queryByText(ASK_FOR_NAME)).toBeNull();
  await expectNameInUse('Sam');
});

test('[SHELL-21.1] locks the name field until the name is saved', async () => {
  await startSettings();
  const writes = holdWrites();
  fireEvent.changeText(nameField(), 'Taylor');

  pressReturn();
  await waitFor(() => expect(nameField()).toBeDisabled());
  await writes.release();
  await settle();

  expect(nameField()).toBeEnabled();
  expect(nameField()).toHaveDisplayValue('Taylor', AS_TYPED);
});

test('[SHELL-21.1] saves once when Return and losing focus both come during one save', async () => {
  await startSettings();
  const writes = holdWrites();
  fireEvent.changeText(nameField(), 'Taylor');

  act(() => {
    fireEvent(nameField(), 'submitEditing', { nativeEvent: {} });
    fireEvent(nameField(), 'blur', { nativeEvent: {} });
  });
  await writes.fail();
  await settle();

  expect(alerts()).toEqual([SAVE_FAILED]);
});

test('[SHELL-22.1] reports a failed save and keeps the name as it was', async () => {
  await startSettings();
  await enterName('Taylor');
  failWrites();

  await enterName('Sam');

  expect(alerts()).toEqual([SAVE_FAILED]);
  expect(nameField()).toHaveDisplayValue('Sam', AS_TYPED);
  expect(nameField()).toBeEnabled();
  await expectNameInUse('Taylor');
});

test('[SHELL-22.1] saves the typed name when Return is pressed again after a failed save', async () => {
  await startSettings();
  failWrites();
  await enterName('Taylor');
  allowWrites();

  pressReturn();
  await settle();

  await expectNameInUse('Taylor');
});

test.each([
  ['Manage Categories', '/settings/manage-categories'],
  ['Archived Groups', '/settings/archived-groups'],
])(
  '[SHELL-23.1] opens %s in the Settings tab when its row is pressed',
  async (row, url) => {
    const app = await startSettings();

    fireEvent.press(screen.getByText(row));

    await waitFor(() =>
      expect(navigationBarTitles(tab('Settings'))).toEqual(['Settings', row]),
    );
    expect(selectedTab()).toBe('Settings');
    expect(app.getPathname()).toBe(url);
  },
);

test('[SHELL-24.1] keeps every Settings row in a scroll view that clears the keyboard and lets taps through', async () => {
  await startSettings();

  const scrollView = nativeViews(/^RCTScrollView$/, settingsRoot()).find(
    (view) => within(view).queryByText('Archived Groups') !== null,
  );

  expect(scrollView?.props.automaticallyAdjustKeyboardInsets).toBe(true);
  expect(['handled', 'always']).toContain(
    scrollView?.props.keyboardShouldPersistTaps,
  );
  expect(within(scrollView!).getByLabelText('Your name')).toBeOnTheScreen();
  expect(within(scrollView!).getByText('Manage Categories')).toBeOnTheScreen();
});

test('[SHELL-25.1] puts the Settings root content in the scroll view its large title follows', async () => {
  await startSettings();

  const scrollView = scrollViewTheTitleFollows();

  expect(scrollView?.props.contentInsetAdjustmentBehavior).toBe('automatic');
  expect(within(scrollView!).getByText('Archived Groups')).toBeOnTheScreen();
});
