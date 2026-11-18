import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Alert } from 'react-native';
import { waitFor } from '@testing-library/react-native';
import type { Database } from '../../src/storage';
import {
  navigationBarTitles,
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
  fakePhoneAppearance,
  fakeReduceTransparency,
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
  APP_SCHEME_LINK,
  LONG_LINK,
  OTHER_SPELLINGS,
  SECOND_LINK,
  TITLE,
  WHOLE_LINK,
  forgetLinks,
  inviteLinksOpen,
  receiveLink,
  showsEveryLine,
  shownLink,
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

async function expectOnSettingsRoot() {
  await expectClosed(TITLE);
  expect(selectedTab()).toBe('Settings');
  expect(navigationBarTitles(tab('Settings'))).toEqual(['Settings']);
}

test('[SHARING-71.1] opens Invite Link over Settings, with only Close and the whole link, when the link arrives while the app runs', async () => {
  await startApp('/settings');

  await receiveLink(WHOLE_LINK);

  await expectOpen(TITLE);
  expect(SHEETS).toContain(screenOf(TITLE).props.stackPresentation);
  expect(textsOn(TITLE)).toEqual([WHOLE_LINK]);
  expect(barItems(TITLE)).toEqual({ left: ['Close (plain)'], right: [] });
  expect(barTitled(TITLE)?.props.headerLeftBarButtonItems[0].icon?.name).toBe(
    'xmark',
  );
  expect(selectedTab()).toBe('Settings');
  expect(isOpen('Settings')).toBe(true);
});

test("[SHARING-71.1] shows a link on the app's own scheme exactly as it arrived", async () => {
  await receiveOnSettings(APP_SCHEME_LINK);

  expect(textsOn(TITLE)).toEqual([APP_SCHEME_LINK]);
});

test.each([WHOLE_LINK, APP_SCHEME_LINK])(
  '[SHARING-71.1] opens Invite Link over the Expenses root, with that link, when %s starts the app',
  async (link) => {
    await startAppFromLink(link);

    await expectOpen(TITLE);
    expect(SHEETS).toContain(screenOf(TITLE).props.stackPresentation);
    expect(textsOn(TITLE)).toEqual([link]);
    expect(selectedTab()).toBe('Expenses');
    expect(navigationBarTitles(tab('Expenses'))).toEqual(['Expenses']);
  },
);

test.each(OTHER_SPELLINGS)(
  '[SHARING-71.1] shows %s exactly as it arrived while the app runs',
  async (link) => {
    await receiveOnSettings(link);

    expect(textsOn(TITLE)).toEqual([link]);
  },
);

test.each(OTHER_SPELLINGS)(
  '[SHARING-71.1] shows %s exactly as it was when it starts the app',
  async (link) => {
    await startAppFromLink(link);

    await expectOpen(TITLE);
    expect(textsOn(TITLE)).toEqual([link]);
    expect(selectedTab()).toBe('Expenses');
  },
);

test('[SHARING-71.1] shows every line of a link with 2,000 characters after the #', async () => {
  await receiveOnSettings(LONG_LINK);

  expect(textsOn(TITLE)).toEqual([LONG_LINK]);
  expect(showsEveryLine(shownLink(LONG_LINK))).toBe(true);
});

test('[SHARING-71.1] opens Invite Link over a pushed screen', async () => {
  await startApp('/settings');
  await push('/settings/archived-groups');
  await expectOpen('Archived Groups');

  await receiveLink(WHOLE_LINK);

  await expectOpen(TITLE);
  expect(SHEETS).toContain(screenOf(TITLE).props.stackPresentation);
  expect(textsOn(TITLE)).toEqual([WHOLE_LINK]);
  expect(isOpen('Archived Groups')).toBe(true);
});

test('[SHARING-71.1] opens Invite Link over an open form', async () => {
  await startGroupsApp();
  await saveName('Taylor');
  await pressAddGroup();
  await expectNewGroupOpen();

  await receiveLink(WHOLE_LINK);

  await expectOpen(TITLE);
  expect(textsOn(TITLE)).toEqual([WHOLE_LINK]);
  expect(newGroupIsOpen()).toBe(true);
});

test('[SHARING-72.1] closes Invite Link with Close and is back on the Settings root', async () => {
  await receiveOnSettings(WHOLE_LINK);

  await pressOnBar(TITLE, 'Close');

  await expectOnSettingsRoot();
});

test('[SHARING-72.1] closes Invite Link when it is swiped down', async () => {
  await receiveOnSettings(WHOLE_LINK);

  await swipeDown(TITLE);

  await expectOnSettingsRoot();
});

test('[SHARING-72.1] is on the Expenses root, with working tabs, after closing the Invite Link that a link started the app with', async () => {
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

test('[SHARING-73.1] shows the second link in the one Invite Link when another arrives while it is open, and closes with one Close', async () => {
  await receiveOnSettings(WHOLE_LINK);

  await receiveLink(SECOND_LINK);

  await waitFor(() => expect(textsOn(TITLE)).toEqual([SECOND_LINK]));
  expect(inviteLinksOpen()).toBe(1);
  await pressOnBar(TITLE, 'Close');
  await expectOnSettingsRoot();
});

test('[SHARING-73.1] keeps one Invite Link when the same link arrives again, and closes with one Close', async () => {
  await receiveOnSettings(WHOLE_LINK);

  await receiveLink(WHOLE_LINK);

  expect(inviteLinksOpen()).toBe(1);
  expect(textsOn(TITLE)).toEqual([WHOLE_LINK]);
  await pressOnBar(TITLE, 'Close');
  await expectOnSettingsRoot();
});

test('[SHARING-73.1] opens Invite Link again for a link that arrives after it was closed, the same link included', async () => {
  await receiveOnSettings(WHOLE_LINK);
  await pressOnBar(TITLE, 'Close');
  await expectClosed(TITLE);

  await receiveLink(SECOND_LINK);

  await expectOpen(TITLE);
  expect(textsOn(TITLE)).toEqual([SECOND_LINK]);
  await pressOnBar(TITLE, 'Close');
  await expectClosed(TITLE);
  await receiveLink(SECOND_LINK);
  await expectOpen(TITLE);
  expect(textsOn(TITLE)).toEqual([SECOND_LINK]);
  expect(inviteLinksOpen()).toBe(1);
});

test('[SHARING-74.1] opens Insights for shared-expense-tracker://insights, not Invite Link, which an invite link on the same scheme does open', async () => {
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

test('[SHARING-74.1] opens Manage Categories for its deep link, not Invite Link, which an invite link on the same scheme does open', async () => {
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

test('[SHARING-74.1] selects Groups, without Invite Link, when shared-expense-tracker://groups starts the app', async () => {
  await startAppFromLink('shared-expense-tracker://groups');

  await waitFor(() => expect(selectedTab()).toBe('Groups'));
  expect(isOpen(TITLE)).toBe(false);
});
