import { act, fireEvent, waitFor } from '@testing-library/react-native';
import { makeReadOnlyCopy, readOnlyCopyOf } from '../../src/sync';
import {
  addMember,
  alertsShown,
  expectMembers,
  expectOpen,
  isOpen,
  pressAlertButton,
} from './group-details-app';
import { cardNames, createGroup } from './groups-app';
import { restart } from './ledger-expense-app';
import { linesIn } from './ledger-expense-list-app';
import {
  T,
  apiAnswersNext,
  apiLosesNextAnswer,
  failSecureStoreWrites,
  goOffline,
  goOnline,
  removeSecureStoreEntry,
  requestsReceived,
  secureStoreEntries,
  secureStoreWorks,
  toHex,
} from './sharing-app';
import {
  afterTheAnswerTo,
  keepAnswersBack,
  requestsOnApi,
  revokedByAnotherPhone,
  closeInvite,
  invited,
  secondsPass,
} from './sharing-invite-app';
import {
  ALREADY_JOINED,
  APPROVAL,
  BLAKE_ID,
  BRISBANE_CARD,
  BRISBANE_ID,
  BRISBANE_LINK,
  CANCEL,
  CASEY_ID,
  CODE_A,
  CODE_B,
  JOIN_AS,
  NEW_MEMBER,
  NOT_SENT,
  NOT_SENT_OFFLINE,
  OFFLINE,
  ONLY_MEMBERS,
  REPLACE_THIS_COPY,
  REPLACE_YOUR_COPY,
  S,
  S2,
  SEND,
  TAYLORS_PHONE,
  TAYLOR_ID,
  TITLE,
  TWO_PHONES_CARD,
  brisbaneInvitesWithTwoPhones,
  canSend,
  joined,
  TOKYO_LINK,
  WAITING,
  WAITING_TEXT,
  WENT_WRONG,
  brisbaneInvites,
  cancellations,
  cardOf,
  chosen,
  eachTestGetsAJoiningPhone,
  hasSignedFields,
  invites,
  isSending,
  joinButton,
  joinLines,
  joinSettles,
  lastRequest,
  nameField,
  openLink,
  openRequest,
  pressInJoin,
  reads,
  replaceThisCopy,
  replaceYourCopy,
  requestCard,
  requested,
  rowsWith,
  send,
  sendings,
  startAs,
  tokyoInvites,
} from './sharing-join-app';
import {
  ALREADY_IN,
  APPROVED,
  APPROVED_CARD,
  CHOOSE_AGAIN,
  CHOOSE_CARD,
  DECLINED,
  DECLINED_CARD,
  FINISHING,
  FINISH_OFFLINE,
  FINISH_UPDATE,
  GROUP_KEY,
  INVALID,
  INVALID_CARD,
  NOT_SENT_CARD,
  WAITING_CARD,
  asked,
  cardBecomes,
  closeJoin,
  comesBack,
  memberApproves,
  memberRejects,
  memberRemovesThePhone,
  phoneDevice,
} from './sharing-outcome-app';
import { allowWrites, failWrites, settle } from './shell-appearance-app';
import { navigationBarTitles, tab, tapTab } from './shell-tabs-app';
import {
  appDatabase,
  everything,
  groupId,
  leaveMembers,
  members,
  setClock,
  showMembers,
  unsent as unsentEvents,
} from './sync-app';

// Runs on iOS. Each test starts the whole app on Dana's phone, which has sent a request to
// join Brisbane, another phone's shared ledger (sharing-join-app). A member's phone answers
// on the API behind `fetch` (sharing-outcome-app); the tests open the app again or the
// request, and read Join Group, the request's card and the phone's local data.

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

eachTestGetsAJoiningPhone('sharing-outcome-');

type Sent = { method: string; path: string };
const isAsking = ({ method, path }: Sent) =>
  method === 'GET' && /^\/invites\/[^/?]+\/request$/.test(path);
const isRead = ({ method, path }: Sent) =>
  method === 'GET' && /^\/invites\/[^/?]+$/.test(path);
const isChunk = ({ method, path }: Sent) =>
  method === 'GET' && /\/snapshots\/[^/]+\/chunks\/\d+$/.test(path);

const WAITING_FOR_BRISBANE = [WAITING, 'Brisbane', WAITING_TEXT, CANCEL];
const UNSENT = [NOT_SENT, 'Try Again', CANCEL];
const json = (body: unknown) => JSON.stringify(body);

const isSnapshotQuestion = ({ method, path }: Sent) =>
  method === 'GET' && /^\/groups\/[^/]+\/snapshot$/.test(path);

/** The lines of the request's card on the Groups root as they are now, with no waiting. */
async function shownCard(group = 'Brisbane') {
  await tapTab('Groups');
  await settle();
  const card = requestCard(group);
  return card ? linesIn(card) : undefined;
}

/** Waits until Join Group says that the phone was approved and is finishing. */
const expectFinishing = () =>
  waitFor(() => expect(joinLines()).toEqual([APPROVED, 'Brisbane', FINISHING]));

/** Waits until Join Group shows exactly these lines. */
const expectJoinLines = (lines: string[]) =>
  waitFor(() => expect(joinLines()).toEqual(lines));

/** Waits until the request's card on the Groups root reads so: no card at all for undefined. */
async function expectCard(lines: string[] | undefined, group = 'Brisbane') {
  await tapTab('Groups');
  await waitFor(() => {
    const card = requestCard(group);
    expect(card ? linesIn(card) : undefined).toEqual(lines);
  });
}

/** Waits until the phone has asked about its requests `count` times in all. */
const expectAsked = (count: number) =>
  waitFor(() => expect(asked()).toHaveLength(count));

/** Lets a few seconds pass with the app open: what it was going to do with an answer, it has done. */
const aMomentPasses = () => secondsPass(5);

/** Dana's phone has sent its request for Brisbane, and Join Group is closed. */
async function waiting(choose?: string) {
  brisbaneInvites();
  const app = await startAs();
  await openLink(BRISBANE_LINK);
  if (choose) await pressInJoin(choose);
  await send();
  await closeJoin();
  return app;
}

/** The phone holds a request the API never got, and has a network again. */
async function unsent() {
  brisbaneInvites();
  const app = await startAs();
  await openLink(BRISBANE_LINK);
  goOffline();
  await send();
  await closeJoin();
  goOnline();
  return app;
}

const hasBrisbane = () => rowsWith(BRISBANE_ID).length > 0;
const groupKeys = () =>
  secureStoreEntries().filter(({ key }) => key.startsWith('group-key.'));

describe('SHARING-210.1', () => {
  test('[SHARING-210.1] asks what became of its request when the app starts, and neither sends nor cancels it', async () => {
    const app = await waiting();
    const sent = sendings().length;

    await restart(app);
    setClock(T);
    await settle();

    await expectAsked(1);
    expect(asked().map(({ path }) => path)).toEqual([
      `/invites/${CODE_A}/request`,
    ]);
    expect(hasSignedFields(asked()[0])).toBe(true);
    expect(asked()[0].deviceId).toBe(phoneDevice());
    expect(asked()[0].body).toHaveLength(0);
    expect(sendings()).toHaveLength(sent);
    expect(cancellations()).toEqual([]);
  });

  test('[SHARING-210.1] asks again when the app comes back from the background', async () => {
    await waiting();

    await comesBack();
    await expectAsked(1);
    await comesBack();

    await expectAsked(2);
  });

  test('[SHARING-210.1] asks when the request is opened from its card and from its link, and shows it as it was meanwhile', async () => {
    await waiting();
    const answer = keepAnswersBack(isAsking);

    await tapTab('Groups');
    await openRequest('Brisbane');
    await expectJoinLines(WAITING_FOR_BRISBANE);
    await answer();
    await closeJoin();
    await openLink(BRISBANE_LINK);

    await expectAsked(2);
    await expectJoinLines(WAITING_FOR_BRISBANE);
  });

  test('[SHARING-210.1] asks about each request it holds', async () => {
    brisbaneInvites();
    tokyoInvites();
    await startAs();
    await requested();
    await closeJoin();
    await requested(TOKYO_LINK);
    await closeJoin();

    await comesBack();

    await waitFor(() =>
      expect(
        asked()
          .map(({ path }) => path)
          .sort(),
      ).toEqual([`/invites/${CODE_A}/request`, `/invites/${CODE_B}/request`]),
    );
  });

  test('[SHARING-210.1] asks about a request it holds as not sent, without sending it', async () => {
    await unsent();
    const sent = sendings().length;

    await comesBack();

    await expectAsked(1);
    await aMomentPasses();
    expect(sendings()).toHaveLength(sent);
  });

  test('[SHARING-210.1] does not ask once the phone has lost its authorization', async () => {
    await waiting();
    for (const { key } of secureStoreEntries()) removeSecureStoreEntry(key);

    await comesBack();
    await tapTab('Groups');
    await openRequest('Brisbane');
    await aMomentPasses();

    expect(asked()).toEqual([]);
  });

  test('[SHARING-210.1] does not ask while the request is on its way, or ask twice at once', async () => {
    brisbaneInvites();
    await startAs();
    await openLink(BRISBANE_LINK);
    const sending = keepAnswersBack(isSending);
    await pressInJoin(SEND);
    await closeJoin();

    await comesBack();
    await aMomentPasses();

    expect(asked()).toEqual([]);
    await sending();
    const asking = keepAnswersBack(isAsking);
    await tapTab('Groups');
    await openRequest('Brisbane');
    await closeJoin();
    await openRequest('Brisbane');
    await expectAsked(1);
    await aMomentPasses();
    expect(asked()).toHaveLength(1);
    await asking();
  });
});

describe('SHARING-211.1', () => {
  test('[SHARING-211.1] reads the invite again when the API says the request waits, and shows it as waiting', async () => {
    await waiting();
    const readBefore = reads().length;

    await tapTab('Groups');
    await openRequest('Brisbane');

    await expectAsked(1);
    await waitFor(() => expect(reads()).toHaveLength(readBefore + 1));
    expect(hasSignedFields(reads().at(-1)!)).toBe(false);
    await expectJoinLines(WAITING_FOR_BRISBANE);
    await closeJoin();
    await expectCard(['Brisbane', WAITING_CARD]);
  });

  test('[SHARING-211.1] learns that the API took a request the phone holds as not sent', async () => {
    brisbaneInvites();
    await startAs();
    await openLink(BRISBANE_LINK);
    apiLosesNextAnswer(isSending);
    await send();
    await closeJoin();
    await expectCard(['Brisbane', NOT_SENT_CARD]);
    const sent = sendings().length;

    await comesBack();

    await expectCard(['Brisbane', WAITING_CARD]);
    expect(sendings()).toHaveLength(sent);
  });

  test('[SHARING-211.1] leaves a request the API never got as not sent', async () => {
    await unsent();
    const sent = sendings().length;

    await comesBack();
    await expectAsked(1);
    await aMomentPasses();

    expect(await shownCard()).toEqual(['Brisbane', NOT_SENT_CARD]);
    expect(sendings()).toHaveLength(sent);
    await openRequest('Brisbane');
    await expectJoinLines(UNSENT);
  });

  test.each([
    ['is answered with an error', () => apiAnswersNext(isRead, 500, '')],
    ['gets no answer', () => apiLosesNextAnswer(isRead)],
    [
      'is refused because the invite is gone',
      () => apiAnswersNext(isRead, 404, json({ error: 'no-invite' })),
    ],
  ])(
    '[SHARING-211.1] leaves the request waiting when reading the invite again %s',
    async (_case, fail) => {
      await waiting();
      const readBefore = reads().length;
      fail();

      await comesBack();
      await waitFor(() => expect(reads()).toHaveLength(readBefore + 1));
      await aMomentPasses();

      expect(await shownCard()).toEqual(['Brisbane', WAITING_CARD]);
      expect(rowsWith(S).length).toBeGreaterThan(0);
      expect(alertsShown()).toEqual([]);
    },
  );

  test('[SHARING-211.1] keeps a request that a member approved, and whose invite was revoked, between its two questions: it joins the next time it asks', async () => {
    const app = await waiting();
    // The API has just said that the request waits when a member approves it and turns the link off.
    afterTheAnswerTo(isAsking, () => {
      memberApproves();
      revokedByAnotherPhone(CODE_A);
    });
    const readBefore = reads().length;

    await comesBack();
    await waitFor(() => expect(reads()).toHaveLength(readBefore + 1));
    await aMomentPasses();

    expect(await shownCard()).toEqual(['Brisbane', WAITING_CARD]);
    expect(rowsWith(S).length).toBeGreaterThan(0);

    await restart(app);
    setClock(T);

    await waitFor(() => expect(hasBrisbane()).toBe(true));
    await expectCard(undefined);
  });
});

const taken = (id: string) =>
  BRISBANE_CARD.members.map((member) =>
    member.id === id ? { ...member, hasDevice: true } : member,
  );

describe('SHARING-212.2', () => {
  test('[SHARING-212.2] asks the person to choose again when the member they picked has a phone by now', async () => {
    await waiting('Casey');
    cardBecomes(taken(CASEY_ID));

    await comesBack();

    await expectCard(['Brisbane', CHOOSE_CARD]);
    await openRequest('Brisbane');
    await expectJoinLines([
      CHOOSE_AGAIN,
      'Brisbane',
      JOIN_AS,
      NEW_MEMBER,
      'Taylor',
      ALREADY_JOINED,
      'Casey',
      ALREADY_JOINED,
      'Blake',
      APPROVAL,
      SEND,
      CANCEL,
    ]);
    expect(nameField().props.value).toBe('Dana');
    expect(chosen()).toEqual([NEW_MEMBER]);
  });

  test('[SHARING-212.2] sends the request again with the new choice, under the same path, and waits', async () => {
    await waiting('Casey');
    cardBecomes(taken(CASEY_ID));
    await comesBack();
    await tapTab('Groups');
    await openRequest('Brisbane');
    const first = sendings()[0].path;
    await waitFor(() => expect(joinLines()[0]).toBe(CHOOSE_AGAIN));

    await pressInJoin('Blake');
    await send();

    expect(sendings()).toHaveLength(2);
    expect(sendings()[1].path).toBe(first);
    expect(lastRequest().memberId).toBe(BLAKE_ID);
    await expectJoinLines(WAITING_FOR_BRISBANE);
    expect(requestsOnApi(CODE_A)).toHaveLength(1);
  });

  test("[SHARING-212.2] asks a new member to choose again when the name is a member's by now, and picks that member", async () => {
    await waiting();
    cardBecomes([
      ...BRISBANE_CARD.members,
      {
        id: '4c9d1e2f-3a4b-4c5d-8e6f-7a8b9c0d1e2f',
        name: 'dana',
        hasDevice: false,
      },
    ]);

    await comesBack();
    await tapTab('Groups');
    await openRequest('Brisbane');

    await waitFor(() => expect(joinLines()[0]).toBe(CHOOSE_AGAIN));
    expect(chosen()).toEqual(['dana']);
  });

  test('[SHARING-212.2] asks a new member to choose again when the group has its 20 members by now, and offers only its members', async () => {
    await waiting();
    cardBecomes(cardOf(20, 18).members);

    await comesBack();
    await expectCard(['Brisbane', CHOOSE_CARD]);
    await openRequest('Brisbane');

    await waitFor(() => expect(joinLines()[0]).toBe(CHOOSE_AGAIN));
    expect(joinLines()).not.toContain(NEW_MEMBER);
    expect(joinLines()).toContain(ONLY_MEMBERS);
    expect(joinLines()).toContain('Member 20');
  });

  test('[SHARING-212.2] has no card to draw the form with after a restart without a network, and shows the form once Try Again reaches the API', async () => {
    const app = await waiting('Casey');
    cardBecomes(taken(CASEY_ID));
    await comesBack();
    await expectCard(['Brisbane', CHOOSE_CARD]);
    goOffline();
    await restart(app);
    setClock(T);
    await expectCard(['Brisbane', CHOOSE_CARD]);

    await openRequest('Brisbane');

    await expectJoinLines([OFFLINE, 'Try Again']);
    goOnline();
    await pressInJoin('Try Again');

    await waitFor(() => expect(joinLines()[0]).toBe(CHOOSE_AGAIN));
    expect(nameField().props.value).toBe('Dana');
    expect(chosen()).toEqual([NEW_MEMBER]);
    await closeJoin();
    await expectCard(['Brisbane', CHOOSE_CARD]);
  });

  test('[SHARING-212.2] keeps the request as it was when the new choice cannot be sent, and sends that choice on Try Again', async () => {
    await waiting('Casey');
    cardBecomes(taken(CASEY_ID));
    await comesBack();
    await tapTab('Groups');
    await openRequest('Brisbane');
    await waitFor(() => expect(joinLines()[0]).toBe(CHOOSE_AGAIN));
    await pressInJoin('Blake');
    goOffline();

    await send();

    await expectJoinLines([NOT_SENT, NOT_SENT_OFFLINE, 'Try Again', CANCEL]);
    // The phone still holds the request it sent: the API may hold nothing newer.
    expect(rowsWith(CODE_A, CASEY_ID)).toHaveLength(1);
    expect(rowsWith(CODE_A, BLAKE_ID)).toEqual([]);
    goOnline();
    const sent = sendings().length;

    await send('Try Again');

    await expectJoinLines(WAITING_FOR_BRISBANE);
    expect(sendings()).toHaveLength(sent + 1);
    expect(lastRequest().memberId).toBe(BLAKE_ID);
    expect(rowsWith(CODE_A, BLAKE_ID)).toHaveLength(1);
    await closeJoin();
    await expectCard(['Brisbane', WAITING_CARD]);
  });

  test('[SHARING-212.2] shows the form again, under the card that still says Choose again, when a new choice that was not sent is closed and opened', async () => {
    await waiting('Casey');
    cardBecomes(taken(CASEY_ID));
    await comesBack();
    await tapTab('Groups');
    await openRequest('Brisbane');
    await waitFor(() => expect(joinLines()[0]).toBe(CHOOSE_AGAIN));
    await pressInJoin('Blake');
    goOffline();
    await send();
    await expectJoinLines([NOT_SENT, NOT_SENT_OFFLINE, 'Try Again', CANCEL]);

    await closeJoin();

    await expectCard(['Brisbane', CHOOSE_CARD]);
    goOnline();
    await openRequest('Brisbane');
    await waitFor(() => expect(joinLines()[0]).toBe(CHOOSE_AGAIN));
    expect(joinLines()).toContain(SEND);
  });

  test('[SHARING-212.2] goes back to waiting when the request fits the card again', async () => {
    await waiting('Casey');
    cardBecomes(taken(CASEY_ID));
    await comesBack();
    await expectCard(['Brisbane', CHOOSE_CARD]);
    cardBecomes(BRISBANE_CARD.members);

    await comesBack();

    await expectCard(['Brisbane', WAITING_CARD]);
  });

  /** Dana's phone has sent a request to take Taylor over, while Casey has a phone too, and Join Group is closed. */
  async function waitingToTakeOverTaylor() {
    brisbaneInvitesWithTwoPhones();
    const app = await startAs();
    await openLink(BRISBANE_LINK);
    await pressInJoin(joined('Taylor'));
    await send();
    await closeJoin();
    expect(lastRequest()).toMatchObject({ memberId: TAYLOR_ID });
    return app;
  }

  test('[SHARING-212.2] leaves a request that takes a member over waiting while that member has a phone and another member has one too', async () => {
    await waitingToTakeOverTaylor();
    expect(lastRequest().takeover).toBe(true);

    await comesBack();

    await expectCard(['Brisbane', WAITING_CARD]);
  });

  test('[SHARING-212.2] asks the person to choose again when the member they wanted to take over has no phone any more', async () => {
    await waitingToTakeOverTaylor();
    expect(lastRequest().takeover).toBe(true);
    cardBecomes(
      TWO_PHONES_CARD.members.map((member) =>
        member.id === TAYLOR_ID ? { ...member, hasDevice: false } : member,
      ),
    );

    await comesBack();

    await expectCard(['Brisbane', CHOOSE_CARD]);
  });

  test('[SHARING-212.2] asks the person to choose again when no other member has a phone any more, and lets nobody send a takeover then', async () => {
    await waitingToTakeOverTaylor();
    expect(lastRequest().takeover).toBe(true);
    cardBecomes(BRISBANE_CARD.members);

    await comesBack();

    await expectCard(['Brisbane', CHOOSE_CARD]);
    await openRequest('Brisbane');
    await waitFor(() => expect(joinLines()[0]).toBe(CHOOSE_AGAIN));
    await pressInJoin(joined('Taylor'));
    expect(canSend()).toBe(false);
  });

  test('[SHARING-212.2] sends a takeover when the person chooses again a member who has a phone by now', async () => {
    await waiting('Casey');
    cardBecomes(TWO_PHONES_CARD.members);
    await comesBack();
    await tapTab('Groups');
    await openRequest('Brisbane');
    const first = sendings()[0].path;
    await waitFor(() => expect(joinLines()[0]).toBe(CHOOSE_AGAIN));

    await pressInJoin(joined('Casey'));
    await send();

    expect(sendings()).toHaveLength(2);
    expect(sendings()[1].path).toBe(first);
    expect(lastRequest()).toMatchObject({
      memberId: CASEY_ID,
      takeover: true,
    });
    await expectJoinLines(WAITING_FOR_BRISBANE);
    // It waits, and is not asked to choose again for a member who has a phone.
    await comesBack();
    await expectCard(['Brisbane', WAITING_CARD]);
  });
});

describe('SHARING-213.1', () => {
  test("[SHARING-213.1] marks a request a member rejected, and keeps none of the invite's secret or code", async () => {
    await waiting();
    memberRejects();

    await comesBack();

    await expectCard(['Brisbane', DECLINED_CARD]);
    expect(rowsWith(S)).toEqual([]);
    expect(rowsWith(CODE_A)).toEqual([]);
    expect(hasBrisbane()).toBe(false);
    expect(groupKeys()).toEqual([]);
  });

  test('[SHARING-213.1] says it was declined, and forgets it on OK without asking the API', async () => {
    await waiting();
    memberRejects();
    await comesBack();
    await tapTab('Groups');

    await openRequest('Brisbane');

    await expectJoinLines(DECLINED);
    const before = asked().length;
    await pressInJoin('OK');
    await waitFor(() => expect(isOpen(TITLE)).toBe(false));
    await expectCard(undefined);
    expect(rowsWith('Brisbane')).toEqual([]);
    expect(asked()).toHaveLength(before);
    expect(cancellations()).toEqual([]);
  });

  test('[SHARING-213.1] opens the form again when the link is opened after a rejection', async () => {
    await waiting();
    memberRejects();
    await comesBack();

    await openLink(BRISBANE_LINK);

    await waitFor(() => expect(joinLines()).toContain(SEND));
    expect(joinLines()).not.toContain(DECLINED[0]);
  });
});

describe('SHARING-214.1', () => {
  test('[SHARING-214.1] says the invite is no longer valid once it was revoked, and forgets the request on OK', async () => {
    await waiting();
    revokedByAnotherPhone(CODE_A);

    await comesBack();

    await expectCard(['Brisbane', INVALID_CARD]);
    expect(rowsWith(S)).toEqual([]);
    await openRequest('Brisbane');
    await expectJoinLines(INVALID);
    await pressInJoin('OK');
    await waitFor(() => expect(isOpen(TITLE)).toBe(false));
    await expectCard(undefined);
  });

  test('[SHARING-214.1] says the same of a request that was never sent', async () => {
    await unsent();
    revokedByAnotherPhone(CODE_A);

    await tapTab('Groups');
    await openRequest('Brisbane');

    await expectJoinLines(INVALID);
  });
});

describe('SHARING-215.1', () => {
  test.each<[string, () => void]>([
    ['there is no network', () => goOffline()],
    ['the API answers with an error', () => apiAnswersNext(isAsking, 500, '')],
    [
      'the API answers "not found" with no reason',
      () => apiAnswersNext(isAsking, 404, '404 Not Found'),
    ],
    [
      'the API names a state the app does not know',
      () => apiAnswersNext(isAsking, 200, json({ state: 'maybe' })),
    ],
  ])(
    '[SHARING-215.1] leaves the request as it was, and says nothing, when %s',
    async (_case, fail) => {
      await waiting();
      const before = everything();
      fail();

      await comesBack();
      await aMomentPasses();
      await tapTab('Groups');
      await openRequest('Brisbane');
      await aMomentPasses();

      await expectJoinLines(WAITING_FOR_BRISBANE);
      expect(alertsShown()).toEqual([]);
      goOnline();
      await closeJoin();
      expect(everything()).toEqual(before);
    },
  );
});

describe('SHARING-220.1', () => {
  test('[SHARING-220.1] closes Join Group and opens the group once the phone has joined', async () => {
    await waiting();
    memberApproves();

    await tapTab('Groups');
    await fireEvent.press(requestCard('Brisbane')!);
    await waitFor(() =>
      expect(navigationBarTitles(tab('Groups'))).toEqual([
        'Groups',
        'Brisbane',
      ]),
    );

    expect(isOpen(TITLE)).toBe(false);
    expect(hasBrisbane()).toBe(true);
  });

  test('[SHARING-220.1] opens nothing when the phone joins with Join Group closed: the card becomes the group', async () => {
    await waiting();
    await tapTab('Expenses');
    memberApproves();

    await comesBack();
    await waitFor(() => expect(hasBrisbane()).toBe(true));
    await aMomentPasses();

    expect(isOpen(TITLE)).toBe(false);
    expect(navigationBarTitles(tab('Groups'))).toEqual(['Groups']);
    await expectCard(undefined);
    expect(cardNames()).toEqual(['Open Brisbane']);
  });
});

describe('SHARING-219.2', () => {
  test('[SHARING-219.2] is the new member in the group it joined, and sees who else has a phone', async () => {
    await waiting();
    memberApproves();
    await comesBack();

    await tapTab('Groups');
    await waitFor(() => expect(cardNames()).toEqual(['Open Brisbane']));
    await showMembers('Brisbane');

    await expectMembers([
      'Taylor, Joined',
      'Casey',
      'Blake',
      'Dana (You)',
      'Add Member',
    ]);
    expect(rowsWith(CODE_A, S)).toEqual([]);
    expect(groupKeys().map(({ key }) => key)).toEqual([
      `group-key.${BRISBANE_ID}.1`,
    ]);
  });

  test("[SHARING-219.2] is the member it picked, under that member's name", async () => {
    await waiting('Casey');
    memberApproves();
    await comesBack();

    await tapTab('Groups');
    await waitFor(() => expect(cardNames()).toEqual(['Open Brisbane']));
    await showMembers('Brisbane');

    await expectMembers([
      'Taylor, Joined',
      'Casey (You)',
      'Blake',
      'Add Member',
    ]);
  });
});

describe('SHARING-219.2', () => {
  test('[SHARING-219.2] keeps the request and no group when the snapshot cannot be written, and joins on Try Again once it can', async () => {
    await waiting();
    memberApproves();
    afterTheAnswerTo(isChunk, failWrites);

    await tapTab('Groups');
    await openRequest('Brisbane');

    await expectJoinLines([APPROVED, 'Brisbane', WENT_WRONG, 'Try Again']);
    allowWrites();
    expect(hasBrisbane()).toBe(false);
    expect(rowsWith(CODE_A).length).toBeGreaterThan(0);

    await pressInJoin('Try Again');

    await waitFor(() => expect(hasBrisbane()).toBe(true));
    await waitFor(() => expect(rowsWith(CODE_A, S)).toEqual([]));
  });
});

describe('SHARING-221.1', () => {
  test('[SHARING-221.1] says it is finishing while the snapshot is on its way', async () => {
    await waiting();
    memberApproves();
    const chunk = keepAnswersBack(isChunk);

    await tapTab('Groups');
    await fireEvent.press(requestCard('Brisbane')!);
    await expectOpen(TITLE);
    await expectFinishing();

    expect(joinButton(CANCEL)).toBeUndefined();
    await chunk();
    await waitFor(() => expect(isOpen(TITLE)).toBe(false));
  });

  test('[SHARING-221.1] keeps the request as approved when the snapshot does not arrive, also after a restart, and joins when it is opened again', async () => {
    const app = await waiting();
    memberApproves();
    apiLosesNextAnswer(isChunk);

    await tapTab('Groups');
    await openRequest('Brisbane');

    await expectJoinLines([APPROVED, 'Brisbane', FINISH_OFFLINE, 'Try Again']);
    expect(hasBrisbane()).toBe(false);
    await closeJoin();
    await expectCard(['Brisbane', APPROVED_CARD]);
    goOffline();
    await restart(app);
    setClock(T);
    await expectCard(['Brisbane', APPROVED_CARD]);
    goOnline();

    // Opening it asks again and joins: Join Group may open and close within the press.
    await fireEvent.press(requestCard('Brisbane')!);
    await waitFor(() => expect(hasBrisbane()).toBe(true));
  });

  test('[SHARING-221.1] asks again and joins when Try Again is pressed', async () => {
    await waiting();
    memberApproves();
    apiLosesNextAnswer(isChunk);
    await tapTab('Groups');
    await openRequest('Brisbane');
    await expectJoinLines([APPROVED, 'Brisbane', FINISH_OFFLINE, 'Try Again']);
    const before = asked().length;

    await pressInJoin('Try Again');

    await waitFor(() => expect(hasBrisbane()).toBe(true));
    expect(asked()).toHaveLength(before + 1);
  });

  test('[SHARING-221.1] says something went wrong when the API has no snapshot for it', async () => {
    await waiting();
    memberApproves({ snapshot: false });

    await tapTab('Groups');
    await openRequest('Brisbane');

    await expectJoinLines([APPROVED, 'Brisbane', WENT_WRONG, 'Try Again']);
    expect(hasBrisbane()).toBe(false);
  });

  test.each<[string, Parameters<typeof memberApproves>[0]]>([
    ['the snapshot', { snapshotVersion: '02' }],
    ['the box', { boxVersion: '02' }],
  ])(
    '[SHARING-221.1] asks for an update when %s is in a version it does not know',
    async (_case, changes) => {
      await waiting();
      memberApproves(changes);

      await tapTab('Groups');
      await openRequest('Brisbane');

      await expectJoinLines([APPROVED, 'Brisbane', FINISH_UPDATE]);
      expect(hasBrisbane()).toBe(false);
    },
  );
});

describe('SHARING-216.1', () => {
  test.each<[string, Parameters<typeof memberApproves>[0]]>([
    ["a box salted from another link's secret", { boxSecret: S2 }],
    [
      'another sender key than the box was sealed with',
      { handover: { senderKey: 'ab'.repeat(32) } },
    ],
    [
      'another group than the box was sealed for',
      { handover: { groupId: '5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b' } },
    ],
    [
      'another key epoch than the box was sealed for',
      { handover: { epoch: 2 } },
    ],
    ['a box with no key', { boxContent: { keys: [] } }],
    ['a box that holds an object with no keys', { boxContent: {} }],
    [
      'a box whose keys go down in epoch',
      {
        boxContent: {
          keys: [
            { epoch: 2, key: toHex(GROUP_KEY) },
            { epoch: 1, key: toHex(GROUP_KEY) },
          ],
        },
      },
    ],
    ['a box with one bit changed', { boxChanged: true }],
  ])(
    '[SHARING-216.1] does not join, and saves no key, when the API hands it %s',
    async (_case, changes) => {
      await waiting();
      memberApproves(changes);

      await tapTab('Groups');
      await openRequest('Brisbane');

      await expectJoinLines([APPROVED, 'Brisbane', WENT_WRONG, 'Try Again']);
      expect(groupKeys()).toEqual([]);
      expect(hasBrisbane()).toBe(false);
    },
  );
});

describe('SHARING-217.2', () => {
  test('[SHARING-217.2] does not take in a snapshot the key of its box does not open', async () => {
    await waiting();
    memberApproves({ snapshotKey: new Uint8Array(32).fill(3) });

    await tapTab('Groups');
    await openRequest('Brisbane');

    await expectJoinLines([APPROVED, 'Brisbane', WENT_WRONG, 'Try Again']);
    expect(hasBrisbane()).toBe(false);
  });
});

describe('SHARING-217.2', () => {
  test('[SHARING-217.2] does not ask for the snapshot when the key cannot be saved, and joins on Try Again once it can', async () => {
    await waiting();
    memberApproves();
    failSecureStoreWrites();

    await tapTab('Groups');
    await openRequest('Brisbane');

    await expectJoinLines([APPROVED, 'Brisbane', WENT_WRONG, 'Try Again']);
    expect(requestsReceived().filter(isSnapshotQuestion)).toEqual([]);
    expect(groupKeys()).toEqual([]);
    expect(hasBrisbane()).toBe(false);
    secureStoreWorks();

    await pressInJoin('Try Again');

    await waitFor(() => expect(hasBrisbane()).toBe(true));
    expect(groupKeys().map(({ key }) => key)).toEqual([
      `group-key.${BRISBANE_ID}.1`,
    ]);
  });
});

/**
 * The phone has its own Brisbane with Casey: a group that is no shared ledger, with the ID
 * and the Casey of the invite's group. It has answered Replace Your Copy? with Send Request,
 * so its request records that copy, and Join Group is closed.
 */
async function ownCopyAsks() {
  await startAs();
  await tapTab('Groups');
  await createGroup('Brisbane');
  await showMembers('Brisbane');
  await addMember('Casey');
  await leaveMembers('Brisbane');
  const own = await groupId('Brisbane');
  const ids = await members('Brisbane');
  invites(
    CODE_A,
    S,
    {
      name: 'Brisbane',
      members: [
        { id: TAYLOR_ID, name: 'Taylor', hasDevice: true },
        { id: ids.Casey, name: 'Casey', hasDevice: false },
      ],
    },
    own,
  );
  await tapTab('Settings');
  await openLink(BRISBANE_LINK);
  await waitFor(() => expect(joinLines()).toContain(JOIN_AS));
  const shown = alertsShown().length;
  await pressInJoin(SEND);
  expect(alertsShown().slice(shown)).toEqual([
    [REPLACE_YOUR_COPY, replaceYourCopy('Brisbane')],
  ]);
  await pressAlertButton(SEND);
  await waitFor(() => expect(joinLines()).toContain(WAITING));
  await closeJoin();
  return { own, ids };
}

describe('SHARING-217.2', () => {
  test('[SHARING-217.2] saves no key when the request records one copy and the approval names another group of the phone', async () => {
    const { ids } = await ownCopyAsks();
    // Tokyo is another group of this phone; the request records its own Brisbane.
    await tapTab('Groups');
    await createGroup('Tokyo');
    const tokyo = await groupId('Tokyo');
    const before = rowsWith(tokyo);
    memberApproves({ groupId: tokyo });

    await openRequest('Brisbane');

    await expectJoinLines([APPROVED, 'Brisbane', WENT_WRONG, 'Try Again']);
    expect(groupKeys()).toEqual([]);
    expect(requestsReceived().filter(isSnapshotQuestion)).toEqual([]);
    expect(rowsWith(tokyo)).toEqual(before);
    expect(await members('Brisbane')).toEqual(ids);
  });

  test('[SHARING-217.2] [SHARING-289.1] saves no key and asks for no snapshot when the approval names a group of the phone that the request was not sent for', async () => {
    await waiting();
    // Tokyo is this phone's own group; the request is for Brisbane and records no copy.
    await tapTab('Groups');
    await createGroup('Tokyo');
    const tokyo = await groupId('Tokyo');
    const before = rowsWith(tokyo);
    memberApproves({ groupId: tokyo });

    await openRequest('Brisbane');

    await expectJoinLines([APPROVED, 'Brisbane', WENT_WRONG, 'Try Again']);
    expect(groupKeys()).toEqual([]);
    expect(requestsReceived().filter(isSnapshotQuestion)).toEqual([]);
    expect(rowsWith(tokyo)).toEqual(before);
  });

  test('[SHARING-217.2] keeps the key of a shared ledger the phone is in when the approval names that ledger, and asks for no snapshot', async () => {
    await waiting();
    // Tokyo is a shared ledger of this phone: its first invite made it one, with a key.
    await tapTab('Groups');
    await createGroup('Tokyo');
    await invited('Tokyo');
    await closeInvite();
    await leaveMembers('Tokyo');
    const tokyo = await groupId('Tokyo');
    const keys = groupKeys();
    expect(keys.map(({ key }) => key)).toEqual([`group-key.${tokyo}.1`]);
    const from = requestsReceived().length;
    memberApproves({
      groupId: tokyo,
      boxContent: { keys: [{ epoch: 1, key: 'ab'.repeat(32) }] },
    });

    await openRequest('Brisbane');

    await expectJoinLines([APPROVED, 'Brisbane', WENT_WRONG, 'Try Again']);
    expect(groupKeys()).toEqual(keys);
    expect(requestsReceived().slice(from).filter(isSnapshotQuestion)).toEqual(
      [],
    );
  });
});

describe('SHARING-218.1', () => {
  test.each<[string, Parameters<typeof memberApproves>[0]]>([
    [
      'no entry for the phone that approved',
      { without: [`device ${TAYLORS_PHONE}`] },
    ],
    [
      "another user's ID in the phone's own entry",
      { ownEntry: { userId: '00000000-0000-4000-8000-000000000001' } },
    ],
    [
      "another box key in the phone's own entry",
      { ownEntry: { boxKey: 'cd'.repeat(32) } },
    ],
    [
      'an entry of its own for a member the snapshot does not hold',
      { ownEntry: { memberId: '00000000-0000-4000-8000-000000000002' } },
    ],
    [
      'another box key for the phone that approved than the box was opened with',
      { approverEntry: { boxKey: 'cd'.repeat(32) } },
    ],
    [
      'an entry of its own for a member that was removed from the group',
      { memberRemoved: true },
    ],
  ])(
    '[SHARING-218.1] does not take in a snapshot whose roster has %s',
    async (_case, changes) => {
      await waiting();
      memberApproves(changes);

      await tapTab('Groups');
      await openRequest('Brisbane');

      await expectJoinLines([APPROVED, 'Brisbane', WENT_WRONG, 'Try Again']);
      expect(hasBrisbane()).toBe(false);
    },
  );
});

describe('SHARING-143.2', () => {
  test('[SHARING-143.2] asks what became of a request the API will not cancel because the phone is a member by now, and joins', async () => {
    await waiting();
    await tapTab('Groups');
    await openRequest('Brisbane');
    await expectAsked(1);
    await expectJoinLines(WAITING_FOR_BRISBANE);
    // A member approves it while the person looks at Join Group, which has asked already.
    memberApproves();

    await pressInJoin(CANCEL);
    await pressAlertButton(CANCEL);

    await waitFor(() =>
      expect(navigationBarTitles(tab('Groups'))).toEqual([
        'Groups',
        'Brisbane',
      ]),
    );
    expect(cancellations()).toHaveLength(1);
    expect(asked()).toHaveLength(2);
    expect(isOpen(TITLE)).toBe(false);
    expect(hasBrisbane()).toBe(true);
    // The only alert is the one that asked whether to cancel.
    expect(alertsShown()).toHaveLength(1);
  });
});

describe('SHARING-204.1', () => {
  test('[SHARING-204.1] gives a question about its request up after 60 seconds without an answer: opening the request asks again, and says nothing', async () => {
    await waiting();
    const answer = keepAnswersBack(isAsking);
    await tapTab('Groups');
    await openRequest('Brisbane');
    await expectAsked(1);

    await secondsPass(65);
    await closeJoin();
    await openRequest('Brisbane');

    await expectAsked(2);
    expect(alertsShown()).toEqual([]);
    await expectJoinLines(WAITING_FOR_BRISBANE);
    await answer();
  });
});

describe('SHARING-222.1', () => {
  test('[SHARING-222.1] says the phone is in the group already, and forgets the request, when the API says so', async () => {
    await waiting();
    apiAnswersNext(isAsking, 409, json({ error: 'already-a-member' }));

    await tapTab('Groups');
    await openRequest('Brisbane');

    await expectJoinLines([ALREADY_IN]);
    await waitFor(() => expect(rowsWith(CODE_A)).toEqual([]));
    await closeJoin();
    await expectCard(undefined);
  });
});

describe('SHARING-225.1', () => {
  test('[SHARING-225.1] changes what Join Group shows when the answer comes while it is open', async () => {
    await waiting();
    await tapTab('Groups');
    await openRequest('Brisbane');
    await expectJoinLines(WAITING_FOR_BRISBANE);
    memberRejects();

    await comesBack();

    await expectJoinLines(DECLINED);
    expect(isOpen(TITLE)).toBe(true);
  });

  test('[SHARING-225.1] shows a request that was not sent as waiting once the API says it has it', async () => {
    brisbaneInvites();
    await startAs();
    await openLink(BRISBANE_LINK);
    apiLosesNextAnswer(isSending);
    await send();
    await waitFor(() => expect(joinLines()[0]).toBe(NOT_SENT));

    await comesBack();

    await expectJoinLines(WAITING_FOR_BRISBANE);
  });
});

describe('GROUPS-108.2', () => {
  test('[GROUPS-108.2] says on the card what became of the request, under the same name for a screen reader', async () => {
    await waiting('Casey');
    cardBecomes(taken(CASEY_ID));
    await comesBack();
    await expectCard(['Brisbane', CHOOSE_CARD]);
    expect(requestCard('Brisbane')).toBeDefined();

    memberRejects();
    await comesBack();

    await expectCard(['Brisbane', DECLINED_CARD]);
    expect(requestCard('Brisbane')).toBeDefined();
  });

  test('[GROUPS-108.2] shows the group in place of the request once the phone has joined', async () => {
    await waiting();
    memberApproves();

    await comesBack();

    await expectCard(undefined);
    await waitFor(() => expect(cardNames()).toEqual(['Open Brisbane']));
  });
});

describe('SHARING-140.2', () => {
  test('[SHARING-140.2] asks what became of the request, and joins, when sending it again finds the phone a member', async () => {
    brisbaneInvites();
    await startAs();
    await openLink(BRISBANE_LINK);
    apiLosesNextAnswer(isSending);
    await send();
    await waitFor(() => expect(joinLines()[0]).toBe(NOT_SENT));
    memberApproves();
    const sent = sendings().length;
    const before = asked().length;

    await pressInJoin('Try Again');
    await joinSettles();
    await waitFor(() => expect(hasBrisbane()).toBe(true));

    // Sending found the phone a member, and the question that followed found the approval.
    expect(sendings()).toHaveLength(sent + 1);
    expect(asked().length).toBeGreaterThan(before);
    expect(rowsWith(CODE_A, S)).toEqual([]);
    await waitFor(() => expect(isOpen(TITLE)).toBe(false));
  });
});

describe('SHARING-289.1', () => {
  const JOINED = [
    'Taylor, Joined',
    'Casey',
    'Blake',
    'Dana (You)',
    'Add Member',
  ];

  test('[SHARING-289.1] [SHARING-226.2] replaces a read-only copy with the snapshot once the phone is approved again, without the change the copy never sent', async () => {
    await waiting();
    memberApproves();
    await comesBack();
    await waitFor(() => expect(hasBrisbane()).toBe(true));
    // Evan is added while the phone has no network, and then a member removes the phone:
    // the API counts it as a member device no more, and the ledger is a read-only copy.
    goOffline();
    await showMembers('Brisbane');
    await addMember('Evan');
    await leaveMembers('Brisbane');
    goOnline();
    memberRemovesThePhone();
    await act(async () => {
      await makeReadOnlyCopy(appDatabase(), BRISBANE_ID, 'not-a-member');
    });
    await settle();
    await tapTab('Settings');

    await openLink(BRISBANE_LINK);
    await waitFor(() => expect(joinLines()).toContain(JOIN_AS));
    const shown = alertsShown().length;
    await pressInJoin(SEND);
    expect(alertsShown().slice(shown)).toEqual([
      [REPLACE_THIS_COPY, replaceThisCopy(1)],
    ]);
    await pressAlertButton(SEND);
    await waitFor(() => expect(joinLines()).toContain(WAITING));
    // Until a member approves, the copy is as it was.
    expect(await readOnlyCopyOf(appDatabase(), BRISBANE_ID)).toEqual({
      reason: 'not-a-member',
      unsent: 1,
    });
    await closeJoin();
    memberApproves();
    await comesBack();

    await waitFor(() => expect(rowsWith(CODE_A, S)).toEqual([]));
    expect(await readOnlyCopyOf(appDatabase(), BRISBANE_ID)).toBeUndefined();
    expect(await unsentEvents()).toEqual([]);
    await tapTab('Groups');
    await showMembers('Brisbane');
    await expectMembers(JOINED);
  });

  test('[SHARING-289.1] [SHARING-226.2] replaces a read-only copy that has nothing unsent once the phone is approved again, though sending the request asked nothing', async () => {
    await waiting();
    memberApproves();
    await comesBack();
    await waitFor(() => expect(hasBrisbane()).toBe(true));
    // A member has removed the phone: the API takes a new request from it.
    memberRemovesThePhone();
    await act(async () => {
      await makeReadOnlyCopy(appDatabase(), BRISBANE_ID, 'not-a-member');
    });
    await settle();
    await tapTab('Settings');
    await openLink(BRISBANE_LINK);
    await waitFor(() => expect(joinLines()).toContain(JOIN_AS));
    const shown = alertsShown().length;

    await send();

    // Nothing of the copy would be lost, so no alert asked; the request records the copy
    // all the same.
    expect(alertsShown()).toHaveLength(shown);
    await closeJoin();
    memberApproves();
    await comesBack();

    await waitFor(() => expect(rowsWith(CODE_A, S)).toEqual([]));
    expect(await readOnlyCopyOf(appDatabase(), BRISBANE_ID)).toBeUndefined();
    await tapTab('Groups');
    await showMembers('Brisbane');
    await expectMembers(JOINED);
  });

  test("[SHARING-289.1] [SHARING-226.2] replaces the phone's own copy of the group with the snapshot once it is approved, and keeps it until then", async () => {
    const { own, ids } = await ownCopyAsks();
    expect(await members('Brisbane')).toEqual(ids);

    memberApproves({ groupId: own });
    await comesBack();

    await waitFor(() => expect(rowsWith(CODE_A, S)).toEqual([]));
    await tapTab('Groups');
    await waitFor(() => expect(cardNames()).toEqual(['Open Brisbane']));
    await showMembers('Brisbane');
    await expectMembers(JOINED);
    expect(everything().groups).toHaveLength(1);
    expect(JSON.stringify(everything())).not.toContain(ids.Casey);
  });

  test('[SHARING-289.1] keeps the copy and the request when the snapshot cannot be written, and replaces the copy on Try Again once it can', async () => {
    const { own, ids } = await ownCopyAsks();
    memberApproves({ groupId: own });
    afterTheAnswerTo(isChunk, failWrites);

    await tapTab('Groups');
    await openRequest('Brisbane');

    await expectJoinLines([APPROVED, 'Brisbane', WENT_WRONG, 'Try Again']);
    allowWrites();
    expect(await members('Brisbane')).toEqual(ids);
    expect(rowsWith(CODE_A).length).toBeGreaterThan(0);

    await pressInJoin('Try Again');

    await waitFor(() => expect(rowsWith(CODE_A, S)).toEqual([]));
    expect(JSON.stringify(everything())).not.toContain(ids.Casey);
  });

  test('[SHARING-289.1] keeps a read-only copy as it was when the request is declined', async () => {
    await waiting();
    memberApproves();
    await comesBack();
    await waitFor(() => expect(hasBrisbane()).toBe(true));
    // A member has removed the phone: the API takes a new request from it.
    memberRemovesThePhone();
    await act(async () => {
      await makeReadOnlyCopy(appDatabase(), BRISBANE_ID, 'not-a-member');
    });
    await settle();
    const groups = everything().groups;
    const groupMembers = everything().group_members;
    await tapTab('Settings');
    await openLink(BRISBANE_LINK);
    await waitFor(() => expect(joinLines()).toContain(JOIN_AS));
    await send();
    await closeJoin();

    memberRejects();
    await comesBack();

    await waitFor(() => expect(rowsWith(CODE_A, S)).toEqual([]));
    expect(await readOnlyCopyOf(appDatabase(), BRISBANE_ID)).toMatchObject({
      reason: 'not-a-member',
    });
    expect(everything().groups).toEqual(groups);
    expect(everything().group_members).toEqual(groupMembers);
  });
});
