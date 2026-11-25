import { fireEvent, within } from '@testing-library/react-native';
import { membersButton } from './group-details-app';
import { linesIn } from './ledger-expense-list-app';
import { goOffline, goOnline } from './sharing-app';
import {
  CREATING,
  EXPLANATION,
  LINK,
  OFFLINE,
  eachTestGetsAnInvitingPhone,
  shared,
  startAt,
  until,
} from './sharing-invite-app';
import { settle } from './shell-appearance-app';
import { nativeViews } from './shell-tabs-app';
import { showMembers } from './sync-app';

// Runs on Android only (apps/mobile/jest.config.cjs), as sharing-invite.test.tsx does on
// iOS: Taylor's phone with Brisbane, not a shared ledger, and the API behind `fetch`.
// Both platforms share Invite (ADR-0002); this file checks that the actions Android
// draws in it are still buttons with the names the requirements give them.

jest.mock('../../src/storage/expo', () => ({
  openPhoneDatabase: async () =>
    jest.requireActual<typeof import('./sync-app')>('./sync-app').openPhone(),
}));

// Not virtual, as in the iOS file.
jest.mock('expo-localization', () => {
  const phone = () =>
    jest.requireActual<typeof import('./ledger-expense-app')>(
      './ledger-expense-app',
    );
  return {
    ...jest.requireActual<object>('expo-localization'),
    getLocales: () => phone().phoneLocales(),
    getCalendars: () => phone().phoneCalendars(),
    useLocales: () => phone().phoneLocales(),
    useCalendars: () => phone().phoneCalendars(),
  };
});

jest.mock(
  'expo-secure-store',
  () =>
    jest.requireActual<typeof import('./sharing-app')>('./sharing-app')
      .secureStore,
  { virtual: true },
);

jest.mock(
  'expo-crypto',
  () =>
    jest.requireActual<typeof import('./sharing-app')>('./sharing-app')
      .randomSource,
  { virtual: true },
);

// Material Symbols drawn as images come from the symbol font on the phone. Here
// each image is named after its symbol instead, as in the tab bar's tests.
jest.mock('expo-symbols', () => ({
  ...jest.requireActual('expo-symbols'),
  unstable_getMaterialSymbolSourceAsync: async (symbol: string) => ({
    uri: `material-symbol:${symbol}`,
  }),
}));

eachTestGetsAnInvitingPhone('sharing-invite-android-');

const ALONE = { Brisbane: [] };

/** Invite as Android shows it: the sheet over Members whose heading is Invite. */
const inviteSheet = () =>
  nativeViews(/^Modal$/).find(
    (sheet) =>
      within(sheet).queryAllByRole('header', { name: 'Invite' }).length > 0,
  );

const ACTIONS = ['Share Link', 'Revoke Link', 'Try Again'];

/**
 * The lines of text Invite shows under its title bar, without its actions' labels:
 * Android may draw those outside React Native's text, so the tests find the actions
 * as buttons (buttonsNamed).
 */
const inviteLines = () => {
  const sheet = inviteSheet();
  if (sheet === undefined) throw new Error('Invite is not open');
  return linesIn(nativeViews(/^RCTScrollView$/, sheet)[0]).filter(
    (line) => !ACTIONS.includes(line),
  );
};

/** What a screen reader finds in Invite as a button named `name`. */
const buttonsNamed = (name: string) =>
  within(inviteSheet()!).queryAllByRole('button', { name });

const hasResult = () =>
  inviteSheet() !== undefined &&
  inviteLines().length > 0 &&
  !inviteLines().includes(CREATING);

/** Opens Brisbane's Members, presses Invite with Link, and waits for Invite to show a result. */
async function invite() {
  await showMembers('Brisbane');
  await fireEvent.press(membersButton('Invite with Link'));
  await until(hasResult, 'Invite to show a link or a reason');
}

async function press(name: string) {
  await fireEvent.press(buttonsNamed(name)[0]);
  await settle();
}

const shownLink = () =>
  inviteLines().find((line) => line.startsWith('https://'));

test('[SHARING-98.1] shows Share Link and Revoke Link as one button each on Android', async () => {
  await startAt(ALONE);

  await invite();

  const link = shownLink();
  expect(link).toMatch(LINK);
  expect(inviteLines()).toEqual([link, EXPLANATION, 'Expires Nov 25, 2026']);
  for (const name of ['Share Link', 'Revoke Link']) {
    expect(buttonsNamed(name)).toHaveLength(1);
    expect(buttonsNamed(name)[0]).toBeEnabled();
  }

  // The button is what takes the press.
  await press('Share Link');
  expect(shared()).toHaveLength(1);
  expect(Object.values(shared()[0] as object)).toContain(link);
});

test('[SHARING-104.1] shows Try Again as one button on Android, which prepares the invite again', async () => {
  await startAt(ALONE);
  goOffline();

  await invite();

  expect(inviteLines()).toEqual([OFFLINE]);
  expect(buttonsNamed('Try Again')).toHaveLength(1);
  expect(buttonsNamed('Try Again')[0]).toBeEnabled();
  expect(buttonsNamed('Share Link')).toEqual([]);

  goOnline();
  await press('Try Again');
  await until(hasResult, 'Invite to show a link or a reason');

  expect(shownLink()).toMatch(LINK);
  expect(buttonsNamed('Try Again')).toEqual([]);
});
