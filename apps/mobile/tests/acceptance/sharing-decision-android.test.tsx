import { alertsShown, expectMembers, tapMember } from './group-details-app';
import { mistakes, removeWorld, resetWorld } from './sharing-app';
import {
  APPROVE,
  CANCEL,
  DECLINE,
  MAY_SEE,
  NEW_MEMBER,
  approvals,
  asks,
  rejections,
  startDecisionApi,
  startWithInvite,
  syncs,
} from './sharing-decision-app';
import { YOU, eachTestGetsAPhone, showMembers } from './sync-app';
import { startEventApi } from './sync-screens-app';

// Runs on Android only (apps/mobile/jest.config.cjs), as sharing-decision.test.tsx does on
// iOS: Brisbane is a shared ledger with an invite, and Dana has asked to join. It checks
// the menu of a request, which Android shows as a dialog.

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

jest.mock('../../src/sharing/api-address', () => ({
  apiUrl: () =>
    jest
      .requireActual<typeof import('./sync-screens-app')>('./sync-screens-app')
      .builtApiUrl(),
}));

// Material Symbols drawn as images come from the symbol font on the phone. Here
// each image is named after its symbol instead, as in the tab bar's tests.
jest.mock('expo-symbols', () => ({
  ...jest.requireActual('expo-symbols'),
  unstable_getMaterialSymbolSourceAsync: async (symbol: string) => ({
    uri: `material-symbol:${symbol}`,
  }),
}));

eachTestGetsAPhone('sharing-decision-android-');

beforeEach(() => {
  resetWorld();
  startEventApi();
  startDecisionApi();
});

afterEach(async () => {
  const wrong = mistakes();
  await removeWorld();
  expect(wrong).toEqual([]);
});

const DANA_ROW = `Dana, ${NEW_MEMBER}`;

async function inMembersWithDana() {
  await startWithInvite();
  await asks();
  await syncs();
  await showMembers('Brisbane');
  await expectMembers([DANA_ROW, YOU, 'Casey', 'Blake', 'Add Member']);
}

test("[GROUPS-132.2] opens a dialog titled with the applicant's name on Android, with Approve, Decline and Cancel", async () => {
  await inMembersWithDana();

  const menu = await tapMember(DANA_ROW);

  expect(menu).toMatchObject({
    title: 'Dana',
    message: MAY_SEE,
    items: [APPROVE, DECLINE, CANCEL],
    cancel: CANCEL,
    cancelable: true,
  });
  // The dialog is an alert, and so was the menu that opened Members.
  expect(alertsShown().at(-1)).toEqual(['Dana', MAY_SEE]);
});

test('[GROUPS-132.2] does nothing when the dialog is closed with Back or a tap outside it on Android', async () => {
  await inMembersWithDana();

  const menu = await tapMember(DANA_ROW);
  await menu!.dismiss();

  expect(approvals()).toEqual([]);
  expect(rejections()).toEqual([]);
  expect(await tapMember(DANA_ROW)).toBeDefined();
});
