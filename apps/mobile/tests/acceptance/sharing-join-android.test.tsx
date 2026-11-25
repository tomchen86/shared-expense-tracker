import { iconNames } from './shell-actions-app';
import {
  BRISBANE_LINK,
  NEW_MEMBER,
  brisbaneInvites,
  chosen,
  eachTestGetsAJoiningPhone,
  joinButton,
  openLink,
  pressInJoin,
  startAs,
} from './sharing-join-app';

// Runs on Android only (apps/mobile/jest.config.cjs), as sharing-join.test.tsx does on
// iOS: Dana's phone, with Brisbane's invite on the API behind `fetch`. It checks what
// Android draws differently in Join Group's form.

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

eachTestGetsAJoiningPhone('sharing-join-android-');

test('[SHARING-125.2] marks the picked row with the Material check symbol on Android, and only that row', async () => {
  brisbaneInvites();
  await startAs();
  await openLink(BRISBANE_LINK);
  const marks = () =>
    [NEW_MEMBER, 'Casey', 'Blake'].map((row) =>
      iconNames(joinButton(row)!, 'android'),
    );

  expect(chosen()).toEqual([NEW_MEMBER]);
  expect(marks()).toEqual([['check'], [], []]);

  await pressInJoin('Casey');

  expect(chosen()).toEqual(['Casey']);
  expect(marks()).toEqual([[], ['check'], []]);
});
