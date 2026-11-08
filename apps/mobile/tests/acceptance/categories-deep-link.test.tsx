import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { act, waitFor } from '@testing-library/react-native';
import type { Database } from '../../src/storage';
import { navigationBarTitles, tab } from './shell-tabs-app';
import {
  createGroup,
  saveName,
  startGroupsApp,
  storedGroups,
  testDatabaseWithReads,
} from './groups-app';
import {
  allowWrites,
  fakePhoneAppearance,
  fakeReduceTransparency,
  settle,
} from './shell-appearance-app';
import { textsOn } from './group-details-app';

// Runs on iOS. The app opens a deep link that the system hands it while it runs,
// such as one tapped in another app, through expo-linking's url event; these
// tests deliver the link there, as the system would, and read the categories
// screen that it opens on the Settings tab. A path such as the other categories
// tests open never goes through the decoding a deep link's query does.

let mockOpen: () => Promise<Database>;

jest.mock('../../src/storage/expo', () => ({
  openPhoneDatabase: () => mockOpen(),
}));

const LINK = 'shared-expense-tracker://settings/manage-categories';

let directory: string;
let file: string;
let deliver: ((event: { url: string }) => void) | undefined;

beforeEach(() => {
  jest.clearAllMocks();
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'deep-link-'));
  file = path.join(directory, 'app.db');
  mockOpen = async () => testDatabaseWithReads(file);
  allowWrites();
  fakePhoneAppearance('light');
  fakeReduceTransparency(false);
  deliver = undefined;
  jest
    .spyOn(
      jest.requireMock<typeof import('expo-linking')>('expo-linking'),
      'addEventListener',
    )
    .mockImplementation((type, listener) => {
      if (type === 'url') deliver = listener;
      return { remove: () => undefined };
    });
});

afterEach(() => {
  jest.restoreAllMocks();
  fs.rmSync(directory, { recursive: true, force: true });
});

/** Starts the app with Taylor saved as your name and Brisbane created; returns Brisbane's ID. */
async function startWithBrisbane() {
  await startGroupsApp();
  await saveName('Taylor');
  await createGroup('Brisbane');
  const [brisbane] = await storedGroups(file);
  return brisbane.id;
}

/** Hands the app `url` as the system hands it a deep link, and waits for its screen. */
async function openDeepLink(url: string, title: string) {
  if (deliver === undefined)
    throw new Error('The app listens for no deep links');
  const listener = deliver;
  await act(async () => listener({ url }));
  await settle();
  await waitFor(() =>
    expect(navigationBarTitles(tab('Settings')).at(-1)).toBe(title),
  );
}

test.each([
  `${LINK}?scopeKind=group&spaceId=%20`,
  `${LINK}?spaceId=%20&scopeKind=group`,
])(
  '[CATEGORIES-25.1] shows only Group not found. for the deep link %s, whose spaceId is a space',
  async (url) => {
    await startWithBrisbane();

    await openDeepLink(url, 'Group Categories');

    expect(textsOn('Group Categories')).toEqual(['Group not found.']);
  },
);

test('[CATEGORIES-25.1] shows only Group not found. for a deep link whose spaceId holds an encoded #, with scopeKind after it', async () => {
  await startWithBrisbane();

  await openDeepLink(
    `${LINK}?spaceId=a%23b&scopeKind=group`,
    'Group Categories',
  );

  expect(textsOn('Group Categories')).toEqual(['Group not found.']);
});

test('[CATEGORIES-24.1] opens the personal scope for a deep link whose spaceId is empty', async () => {
  await startWithBrisbane();

  await openDeepLink(`${LINK}?scopeKind=group&spaceId=`, 'Manage Categories');

  expect(textsOn('Manage Categories')).toContain('Shopping');
  expect(textsOn('Manage Categories')).not.toContain('Group not found.');
});

test("[CATEGORIES-23.4] opens a group's Group Categories for a deep link with its ID", async () => {
  const brisbane = await startWithBrisbane();

  await openDeepLink(
    `${LINK}?scopeKind=group&spaceId=${brisbane}`,
    'Group Categories',
  );

  expect(textsOn('Group Categories')).toContain('Shopping');
  expect(textsOn('Group Categories')).not.toContain('Group not found.');
});
