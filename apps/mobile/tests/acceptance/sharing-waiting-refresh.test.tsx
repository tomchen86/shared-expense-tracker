import { fireEvent, waitFor } from '@testing-library/react-native';
import { alertsShown, isOpen, pressAlertButton } from './group-details-app';
import {
  goOffline,
  goOnline,
  removeSecureStoreEntry,
  secureStoreEntries,
} from './sharing-app';
import {
  keepAnswersBack,
  revokedByAnotherPhone,
  secondsPass,
} from './sharing-invite-app';
import {
  BRISBANE_ID,
  BRISBANE_LINK,
  CANCEL,
  CODE_A,
  NOT_SENT,
  NOT_SENT_OFFLINE,
  TITLE,
  WAITING,
  WAITING_TEXT,
  WENT_WRONG,
  brisbaneInvites,
  cancellations,
  eachTestGetsAJoiningPhone,
  isCancelling,
  joinLines,
  openLink,
  openRequest,
  pressInJoin,
  requestCard,
  rowsWith,
  send,
  startAs,
} from './sharing-join-app';
import { linesIn } from './ledger-expense-list-app';
import {
  APPROVED,
  DECLINED,
  INVALID,
  WAITING_CARD,
  asked,
  closeJoin,
  memberApproves,
  memberRejects,
} from './sharing-outcome-app';
import { comesToForeground, goesToBackground } from './sharing-refresh-app';
import { navigationBarTitles, tab, tapTab } from './shell-tabs-app';

// Runs on iOS. Each test starts the whole app on Dana's phone, which sends a request to
// join Brisbane and leaves Join Group open on it, as sharing-outcome.test.tsx does with
// Join Group closed. A member's phone answers on the API behind `fetch`
// (sharing-outcome-app) while the screen stays open, and the tests let the phone's clock
// run: no test opens the request again or leaves the app to learn the answer, unless it
// says so.

jest.mock('../../src/storage/expo', () => ({
  openPhoneDatabase: async () =>
    jest.requireActual<typeof import('./sync-app')>('./sync-app').openPhone(),
}));

// Not virtual, as in ledger-expense-form.test.tsx.
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

eachTestGetsAJoiningPhone('sharing-waiting-refresh-');

type Sent = { method: string; path: string };
const isAsking = ({ method, path }: Sent) =>
  method === 'GET' && /^\/invites\/[^/?]+\/request$/.test(path);

const WAITING_FOR_BRISBANE = [WAITING, 'Brisbane', WAITING_TEXT, CANCEL];

const hasBrisbane = () => rowsWith(BRISBANE_ID).length > 0;

/** Waits until Join Group shows exactly these lines. */
const expectJoinLines = (lines: string[]) =>
  waitFor(() => expect(joinLines()).toEqual(lines));

/** Waits until the phone has joined Brisbane, Join Group is closed and Brisbane's screen is open. */
async function expectJoined() {
  await waitFor(() =>
    expect(navigationBarTitles(tab('Groups'))).toEqual(['Groups', 'Brisbane']),
  );
  expect(isOpen(TITLE)).toBe(false);
  expect(hasBrisbane()).toBe(true);
}

/**
 * Dana's phone has sent its request for Brisbane, and Join Group stays open on "Waiting
 * for Approval". Resolves with how many times the phone has asked about it by then.
 */
async function waitingOpen() {
  brisbaneInvites();
  await startAs();
  await openLink(BRISBANE_LINK);
  await send();
  await expectJoinLines(WAITING_FOR_BRISBANE);
  return asked().length;
}

describe('SHARING-291.1', () => {
  test('[SHARING-291.1] asks 3 seconds after Join Group shows the waiting request, and joins when a member approved meanwhile', async () => {
    const before = await waitingOpen();
    memberApproves();

    await secondsPass(2);

    expect(asked()).toHaveLength(before);

    await secondsPass(1);

    await waitFor(() => expect(asked()).toHaveLength(before + 1));
    expect(asked().at(-1)!.path).toBe(`/invites/${CODE_A}/request`);
    await expectJoined();
  });

  test('[SHARING-291.1] shows that the request was declined while Join Group stays open', async () => {
    await waitingOpen();
    memberRejects();

    await secondsPass(3);

    await expectJoinLines(DECLINED);
  });

  test('[SHARING-291.1] shows that the invite is no longer valid while Join Group stays open', async () => {
    await waitingOpen();
    revokedByAnotherPhone(CODE_A);

    await secondsPass(3);

    await expectJoinLines(INVALID);
  });

  test('[SHARING-291.1] asks every 3 seconds at first', async () => {
    const before = await waitingOpen();

    await secondsPass(9);

    expect(asked()).toHaveLength(before + 3);
    expect(joinLines()).toEqual(WAITING_FOR_BRISBANE);
  });

  test('[SHARING-291.1] asks every 30 seconds once Join Group has shown the waiting request for 2 minutes', async () => {
    await waitingOpen();
    // Without a network the API receives none of the first 2 minutes' questions.
    goOffline();
    await secondsPass(120);
    goOnline();
    const before = asked().length;

    await secondsPass(25);

    expect(asked()).toHaveLength(before);

    await secondsPass(5);

    expect(asked()).toHaveLength(before + 1);

    await secondsPass(30);

    expect(asked()).toHaveLength(before + 2);
  });

  test('[SHARING-291.1] asks no second time while a question has no answer, and the next time 3 seconds after the answer', async () => {
    const before = await waitingOpen();
    const answer = keepAnswersBack(isAsking);
    await secondsPass(3);
    await waitFor(() => expect(asked()).toHaveLength(before + 1));

    await secondsPass(31);

    expect(asked()).toHaveLength(before + 1);

    await answer();
    await secondsPass(2);

    expect(asked()).toHaveLength(before + 1);

    await secondsPass(1);

    await waitFor(() => expect(asked()).toHaveLength(before + 2));
  });

  test('[SHARING-291.1] says nothing and shows the same when a question gets no answer, and asks again the next time', async () => {
    await waitingOpen();
    const shown = alertsShown().length;
    goOffline();

    await secondsPass(6);

    expect(alertsShown()).toHaveLength(shown);
    expect(joinLines()).toEqual(WAITING_FOR_BRISBANE);

    goOnline();
    memberApproves();
    await secondsPass(3);

    await expectJoined();
  });

  test('[SHARING-291.1] stops asking once Join Group is closed: the card waits until the request is opened again', async () => {
    await waitingOpen();
    await closeJoin();
    await tapTab('Groups');
    memberApproves();
    const before = asked().length;

    await secondsPass(60);

    expect(asked()).toHaveLength(before);
    expect(linesIn(requestCard('Brisbane')!)).toContain(WAITING_CARD);

    // Pressed here and not with openRequest, which waits for a Join Group that this
    // answer closes at once.
    await fireEvent.press(requestCard('Brisbane')!);

    await expectJoined();
  });

  test('[SHARING-291.1] stops asking in the background, and starts anew when the app comes back', async () => {
    await waitingOpen();
    await goesToBackground();
    const before = asked().length;

    await secondsPass(60);

    expect(asked()).toHaveLength(before);

    await comesToForeground();
    // The question the app asks as it comes back (SHARING-210.1).
    await waitFor(() => expect(asked()).toHaveLength(before + 1));
    await secondsPass(2);

    expect(asked()).toHaveLength(before + 1);

    await secondsPass(1);

    await waitFor(() => expect(asked()).toHaveLength(before + 2));
  });

  test('[SHARING-291.1] counts the 2 minutes anew when the app comes back', async () => {
    await waitingOpen();
    // As above: the API receives none of the questions of these 2 minutes, nor the one
    // the app asks as it comes back.
    goOffline();
    await secondsPass(120);
    await goesToBackground();
    await comesToForeground();
    goOnline();
    const before = asked().length;

    await secondsPass(9);

    expect(asked()).toHaveLength(before + 3);
  });

  test('[SHARING-291.1] does not ask while the request is being cancelled', async () => {
    await waitingOpen();
    keepAnswersBack(isCancelling);
    await pressInJoin(CANCEL);
    await pressAlertButton(CANCEL);
    await waitFor(() => expect(cancellations()).toHaveLength(1));
    const before = asked().length;

    await secondsPass(30);

    expect(asked()).toHaveLength(before);
  });

  test('[SHARING-291.1] does not ask on a timer about a request that was not sent', async () => {
    brisbaneInvites();
    await startAs();
    await openLink(BRISBANE_LINK);
    goOffline();
    await send();
    await expectJoinLines([NOT_SENT, NOT_SENT_OFFLINE, 'Try Again', CANCEL]);
    goOnline();
    const before = asked().length;

    await secondsPass(60);

    expect(asked()).toHaveLength(before);
  });

  test('[SHARING-291.1] does not ask on a timer about a request that was approved and has not finished joining', async () => {
    await waitingOpen();
    memberApproves({ snapshot: false });
    await closeJoin();
    await tapTab('Groups');
    await openRequest('Brisbane');
    await expectJoinLines([APPROVED, 'Brisbane', WENT_WRONG, 'Try Again']);
    const before = asked().length;

    await secondsPass(60);

    expect(asked()).toHaveLength(before);
    expect(hasBrisbane()).toBe(false);
  });

  test('[SHARING-291.1] does not ask while Join Group shows the form', async () => {
    brisbaneInvites();
    await startAs();
    await openLink(BRISBANE_LINK);

    await secondsPass(60);

    expect(asked()).toEqual([]);
  });

  test('[SHARING-291.1] does not ask once the phone has lost its authorization', async () => {
    await waitingOpen();
    await closeJoin();
    for (const { key } of secureStoreEntries()) removeSecureStoreEntry(key);
    const before = asked().length;
    await tapTab('Groups');
    await openRequest('Brisbane');

    await secondsPass(60);

    expect(asked()).toHaveLength(before);
  });
});
