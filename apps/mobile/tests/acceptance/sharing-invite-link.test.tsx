import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Alert } from 'react-native';
import { screen, waitFor } from '@testing-library/react-native';
import type { Database } from '../../src/storage';
import {
  navigationBarTitles,
  openApp,
  push,
  selectedTab,
  startApp,
  tab,
  tapTab,
} from './shell-tabs-app';
import {
  allowReads,
  expectNewGroupOpen,
  nameField,
  newGroupIsOpen,
  pressAddGroup,
  saveName,
  startGroupsApp,
  testDatabaseWithReads,
  typeName,
} from './groups-app';
import {
  allowWrites,
  endAppProcess,
  fakePhoneAppearance,
  fakeReduceTransparency,
  settle,
} from './shell-appearance-app';
import {
  barItems,
  barTitled,
  expectClosed,
  expectOpen,
  isOpen,
  pressOnBar,
  screenOf,
  swipeDown,
  textsOn,
} from './group-details-app';
import {
  APP_SCHEME_HALF_LINK,
  APP_SCHEME_LINK,
  CANNOT_USE,
  CONNECT,
  HALF_LINK,
  NOT_INVITE_LINKS,
  OTHER_SPELLINGS,
  TITLE,
  WHOLE_LINK,
  forgetLinks,
  inviteLinksOpen,
  launchAppFromLink,
  receiveLink,
  startAppFromLink,
} from './sharing-invite-link-app';

// Runs on iOS; sharing-invite-link-android.test.tsx checks what Android shows
// differently, its back button, and how it learns which link started the app.

let mockOpen: () => Promise<Database>;

jest.mock('../../src/storage/expo', () => ({
  openPhoneDatabase: () => mockOpen(),
}));

/** The ways iOS presents a screen as a sheet that rises from the bottom. */
const SHEETS = ['formSheet', 'pageSheet', 'modal'];

let directory: string;
let file: string;

beforeEach(() => {
  jest.clearAllMocks();
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'invite-link-'));
  file = path.join(directory, 'app.db');
  mockOpen = async () => testDatabaseWithReads(file);
  allowWrites();
  allowReads();
  fakePhoneAppearance('light');
  fakeReduceTransparency(false);
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  forgetLinks();
});

afterEach(() => {
  jest.restoreAllMocks();
  fs.rmSync(directory, { recursive: true, force: true });
});

/** Starts the app on the Settings root and hands it `link`. */
async function receiveOnSettings(link: string) {
  await startApp('/settings');
  await receiveLink(link);
  await expectOpen(TITLE);
}

/** Keeps the local data from opening until the returned function is called. */
function holdOpening() {
  let finish!: () => void;
  const opening = new Promise<void>((resolve) => {
    finish = resolve;
  });
  mockOpen = async () => {
    await opening;
    return testDatabaseWithReads(file);
  };
  return async () => {
    finish();
    await settle();
  };
}

function expectOnlyLoading() {
  expect(screen.getByLabelText('Restoring local data')).toBeOnTheScreen();
  expect(inviteLinksOpen()).toBe(0);
  expect(screen.queryByText(CONNECT[0])).toBeNull();
  expect(screen.queryByText(CANNOT_USE[0])).toBeNull();
}

async function expectOnlyLoadError() {
  expect(
    await screen.findByText('Unable to Load Local Data'),
  ).toBeOnTheScreen();
  expect(screen.getByText('Your data was not changed.')).toBeOnTheScreen();
  expect(inviteLinksOpen()).toBe(0);
  expect(screen.queryByText(CONNECT[0])).toBeNull();
  expect(screen.queryByText(CANNOT_USE[0])).toBeNull();
}

async function expectOnSettingsRoot() {
  await expectClosed(TITLE);
  expect(selectedTab()).toBe('Settings');
  expect(navigationBarTitles(tab('Settings'))).toEqual(['Settings']);
}

test('[SHARING-71.2] opens Join Group over Settings, with only Close, when the link arrives while the app runs', async () => {
  await startApp('/settings');

  await receiveLink(WHOLE_LINK);

  await expectOpen(TITLE);
  expect(SHEETS).toContain(screenOf(TITLE).props.stackPresentation);
  expect(textsOn(TITLE)).toEqual(CONNECT);
  expect(barItems(TITLE)).toEqual({ left: ['Close (plain)'], right: [] });
  expect(barTitled(TITLE)?.props.headerLeftBarButtonItems[0].icon?.name).toBe(
    'xmark',
  );
  expect(selectedTab()).toBe('Settings');
  expect(isOpen('Settings')).toBe(true);
});

test("[SHARING-71.2] opens Join Group for a link on the app's own scheme, with what follows its # taken in", async () => {
  await receiveOnSettings(APP_SCHEME_LINK);

  expect(textsOn(TITLE)).toEqual(CONNECT);

  await receiveLink(APP_SCHEME_HALF_LINK);

  await waitFor(() => expect(textsOn(TITLE)).toEqual(CANNOT_USE));
});

test.each([WHOLE_LINK, APP_SCHEME_LINK])(
  '[SHARING-71.2] opens Join Group over the Expenses root when %s starts the app',
  async (link) => {
    await startAppFromLink(link);

    await expectOpen(TITLE);
    expect(SHEETS).toContain(screenOf(TITLE).props.stackPresentation);
    expect(textsOn(TITLE)).toEqual(CONNECT);
    expect(selectedTab()).toBe('Expenses');
    expect(navigationBarTitles(tab('Expenses'))).toEqual(['Expenses']);
  },
);

test.each(OTHER_SPELLINGS)(
  '[SHARING-71.2] opens Join Group for %s while the app runs',
  async (link) => {
    await receiveOnSettings(link);

    expect(inviteLinksOpen()).toBe(1);
  },
);

test.each(OTHER_SPELLINGS)(
  '[SHARING-71.2] opens Join Group when %s starts the app',
  async (link) => {
    await startAppFromLink(link);

    await expectOpen(TITLE);
    expect(inviteLinksOpen()).toBe(1);
    expect(selectedTab()).toBe('Expenses');
  },
);

test('[SHARING-71.2] opens Join Group over a pushed screen', async () => {
  await startApp('/settings');
  await push('/settings/archived-groups');
  await expectOpen('Archived Groups');

  await receiveLink(WHOLE_LINK);

  await expectOpen(TITLE);
  expect(SHEETS).toContain(screenOf(TITLE).props.stackPresentation);
  expect(textsOn(TITLE)).toEqual(CONNECT);
  expect(isOpen('Archived Groups')).toBe(true);
});

test('[SHARING-71.2] opens Join Group over an open form', async () => {
  await startGroupsApp();
  await saveName('Taylor');
  await pressAddGroup();
  await expectNewGroupOpen();

  await receiveLink(WHOLE_LINK);

  await expectOpen(TITLE);
  expect(textsOn(TITLE)).toEqual(CONNECT);
  expect(newGroupIsOpen()).toBe(true);
});

test('[SHARING-71.2] shows only the loading indicator while the local data opens, then Join Group over the Expenses root, when a link starts the app', async () => {
  const finishOpening = holdOpening();

  await launchAppFromLink(WHOLE_LINK);

  expectOnlyLoading();
  await finishOpening();
  await expectOpen(TITLE);
  expect(textsOn(TITLE)).toEqual(CONNECT);
  expect(selectedTab()).toBe('Expenses');
  expect(navigationBarTitles(tab('Expenses'))).toEqual(['Expenses']);
});

test('[SHARING-71.2] opens one Join Group once the local data has opened, with the last of the links that arrived while it was opening', async () => {
  const finishOpening = holdOpening();
  await openApp('/settings');
  expect(screen.getByLabelText('Restoring local data')).toBeOnTheScreen();

  await receiveLink(WHOLE_LINK);
  await receiveLink(HALF_LINK);

  expectOnlyLoading();
  await finishOpening();
  await expectOpen(TITLE);
  expect(textsOn(TITLE)).toEqual(CANNOT_USE);
  expect(inviteLinksOpen()).toBe(1);
  await pressOnBar(TITLE, 'Close');
  await expectOnSettingsRoot();
});

test('[SHARING-71.2] shows only the load error, without Join Group, when a link starts the app and its local data cannot open, and opens Join Group for that link once the data can', async () => {
  mockOpen = async () => {
    throw new Error('disk unavailable');
  };

  const app = await launchAppFromLink(WHOLE_LINK);

  await expectOnlyLoadError();
  await receiveLink(HALF_LINK);
  await expectOnlyLoadError();

  await endAppProcess(app);
  mockOpen = async () => testDatabaseWithReads(file);
  await startAppFromLink(WHOLE_LINK);
  await expectOpen(TITLE);
  expect(textsOn(TITLE)).toEqual(CONNECT);
});

test('[SHARING-72.1] closes Join Group with Close and is back on the Settings root', async () => {
  await receiveOnSettings(WHOLE_LINK);

  await pressOnBar(TITLE, 'Close');

  await expectOnSettingsRoot();
});

test('[SHARING-72.1] closes Join Group when it is swiped down', async () => {
  await receiveOnSettings(WHOLE_LINK);

  await swipeDown(TITLE);

  await expectOnSettingsRoot();
});

test('[SHARING-72.1] is on the Expenses root, with working tabs, after closing the Join Group that a link started the app with', async () => {
  await startAppFromLink(WHOLE_LINK);
  await expectOpen(TITLE);

  await pressOnBar(TITLE, 'Close');

  await expectClosed(TITLE);
  expect(selectedTab()).toBe('Expenses');
  expect(navigationBarTitles(tab('Expenses'))).toEqual(['Expenses']);
  await tapTab('Groups');
  expect(selectedTab()).toBe('Groups');
});

test('[SHARING-72.1] goes back to an open form with what was typed in it', async () => {
  await startGroupsApp();
  await saveName('Taylor');
  await pressAddGroup();
  await expectNewGroupOpen();
  await typeName('Bris');
  await receiveLink(WHOLE_LINK);
  await expectOpen(TITLE);

  await pressOnBar(TITLE, 'Close');

  await expectClosed(TITLE);
  expect(newGroupIsOpen()).toBe(true);
  expect(nameField().props.value).toBe('Bris');
});

test('[SHARING-72.1] goes back to the pushed screen it covered', async () => {
  await startApp('/settings');
  await push('/settings/archived-groups');
  await expectOpen('Archived Groups');
  await receiveLink(WHOLE_LINK);
  await expectOpen(TITLE);

  await pressOnBar(TITLE, 'Close');

  await expectClosed(TITLE);
  expect(selectedTab()).toBe('Settings');
  expect(navigationBarTitles(tab('Settings'))).toEqual([
    'Settings',
    'Archived Groups',
  ]);
});

test('[SHARING-73.2] shows what the second link gets in the one Join Group when another arrives while it is open, and closes with one Close', async () => {
  await receiveOnSettings(WHOLE_LINK);

  await receiveLink(HALF_LINK);

  await waitFor(() => expect(textsOn(TITLE)).toEqual(CANNOT_USE));
  expect(inviteLinksOpen()).toBe(1);
  await pressOnBar(TITLE, 'Close');
  await expectOnSettingsRoot();
});

test('[SHARING-73.2] keeps one Join Group when the same link arrives again, and closes with one Close', async () => {
  await receiveOnSettings(WHOLE_LINK);

  await receiveLink(WHOLE_LINK);

  expect(inviteLinksOpen()).toBe(1);
  expect(textsOn(TITLE)).toEqual(CONNECT);
  await pressOnBar(TITLE, 'Close');
  await expectOnSettingsRoot();
});

test('[SHARING-73.2] opens Join Group again for a link that arrives after it was closed, the same link included', async () => {
  await receiveOnSettings(WHOLE_LINK);
  await pressOnBar(TITLE, 'Close');
  await expectClosed(TITLE);

  await receiveLink(HALF_LINK);

  await expectOpen(TITLE);
  expect(textsOn(TITLE)).toEqual(CANNOT_USE);
  await pressOnBar(TITLE, 'Close');
  await expectClosed(TITLE);
  await receiveLink(HALF_LINK);
  await expectOpen(TITLE);
  expect(textsOn(TITLE)).toEqual(CANNOT_USE);
  expect(inviteLinksOpen()).toBe(1);
});

test('[SHARING-74.1] opens Insights for shared-expense-tracker://insights, not Join Group, which an invite link on the same scheme does open', async () => {
  await startApp('/');
  await receiveLink(APP_SCHEME_LINK);
  await expectOpen(TITLE);
  await pressOnBar(TITLE, 'Close');
  await expectClosed(TITLE);

  await receiveLink('shared-expense-tracker://insights');

  await waitFor(() =>
    expect(navigationBarTitles(tab('Expenses')).at(-1)).toBe('Insights'),
  );
  expect(isOpen(TITLE)).toBe(false);
  expect(selectedTab()).toBe('Expenses');
});

test('[SHARING-74.1] opens Manage Categories for its deep link, not Join Group, which an invite link on the same scheme does open', async () => {
  await receiveOnSettings(APP_SCHEME_LINK);
  await pressOnBar(TITLE, 'Close');
  await expectClosed(TITLE);

  await receiveLink('shared-expense-tracker://settings/manage-categories');

  await waitFor(() =>
    expect(navigationBarTitles(tab('Settings')).at(-1)).toBe(
      'Manage Categories',
    ),
  );
  expect(isOpen(TITLE)).toBe(false);
});

test('[SHARING-74.1] selects Groups, without Join Group, when shared-expense-tracker://groups starts the app', async () => {
  await startAppFromLink('shared-expense-tracker://groups');

  await waitFor(() => expect(selectedTab()).toBe('Groups'));
  expect(isOpen(TITLE)).toBe(false);
});

test.each(NOT_INVITE_LINKS)(
  '[SHARING-74.1] does not open Join Group again for %s, which is not an invite link, after an invite link opened it',
  async (link) => {
    await receiveOnSettings(APP_SCHEME_LINK);
    await pressOnBar(TITLE, 'Close');
    await expectClosed(TITLE);

    await receiveLink(link);

    expect(inviteLinksOpen()).toBe(0);
  },
);

test.each(NOT_INVITE_LINKS)(
  '[SHARING-74.1] does not open Join Group when %s, which is not an invite link, starts the app',
  async (link) => {
    await startAppFromLink(link);

    expect(inviteLinksOpen()).toBe(0);
  },
);
