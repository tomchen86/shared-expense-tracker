import { fireEvent, waitFor } from '@testing-library/react-native';
import {
  alertsShown,
  expectMembers,
  expectOpen,
  isOpen,
} from './group-details-app';
import { cardNames } from './groups-app';
import { restart } from './ledger-expense-app';
import { linesIn } from './ledger-expense-list-app';
import {
  T,
  apiAnswersNext,
  apiLosesNextAnswer,
  goOffline,
  goOnline,
  removeSecureStoreEntry,
  secureStoreEntries,
} from './sharing-app';
import {
  keepAnswersBack,
  requestsOnApi,
  revokedByAnotherPhone,
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
  S,
  S2,
  SEND,
  TAYLORS_PHONE,
  TITLE,
  TOKYO_LINK,
  WAITING,
  WAITING_TEXT,
  WENT_WRONG,
  brisbaneInvites,
  cancellations,
  chosen,
  eachTestGetsAJoiningPhone,
  hasSignedFields,
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
  phoneDevice,
} from './sharing-outcome-app';
import { settle } from './shell-appearance-app';
import { navigationBarTitles, tab, tapTab } from './shell-tabs-app';
import { everything, setClock, showMembers } from './sync-app';

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

/** The two lines of the request's card on the Groups root. */
async function cardLines(group = 'Brisbane') {
  await tapTab('Groups');
  await settle();
  const card = requestCard(group);
  return card ? linesIn(card) : undefined;
}

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
    await comesBack();

    expect(asked()).toHaveLength(2);
  });

  test('[SHARING-210.1] asks when the request is opened from its card and from its link, and shows it as it was meanwhile', async () => {
    await waiting();
    const answer = keepAnswersBack(isAsking);

    await tapTab('Groups');
    await openRequest('Brisbane');
    expect(joinLines()).toEqual(WAITING_FOR_BRISBANE);
    await answer();
    await closeJoin();
    await openLink(BRISBANE_LINK);

    expect(asked()).toHaveLength(2);
    expect(joinLines()).toEqual(WAITING_FOR_BRISBANE);
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

    expect(
      asked()
        .map(({ path }) => path)
        .sort(),
    ).toEqual([`/invites/${CODE_B}/request`, `/invites/${CODE_A}/request`]);
  });

  test('[SHARING-210.1] asks about a request it holds as not sent, without sending it', async () => {
    await unsent();
    const sent = sendings().length;

    await comesBack();

    expect(asked()).toHaveLength(1);
    expect(sendings()).toHaveLength(sent);
  });

  test('[SHARING-210.1] does not ask once the phone has lost its authorization', async () => {
    await waiting();
    for (const { key } of secureStoreEntries()) removeSecureStoreEntry(key);

    await comesBack();
    await tapTab('Groups');
    await openRequest('Brisbane');

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

    expect(asked()).toEqual([]);
    await sending();
    const asking = keepAnswersBack(isAsking);
    await tapTab('Groups');
    await openRequest('Brisbane');
    await closeJoin();
    await openRequest('Brisbane');
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

    expect(asked()).toHaveLength(1);
    expect(reads()).toHaveLength(readBefore + 1);
    expect(hasSignedFields(reads().at(-1)!)).toBe(false);
    expect(joinLines()).toEqual(WAITING_FOR_BRISBANE);
    await closeJoin();
    expect(await cardLines()).toEqual(['Brisbane', WAITING_CARD]);
  });

  test('[SHARING-211.1] learns that the API took a request the phone holds as not sent', async () => {
    brisbaneInvites();
    await startAs();
    await openLink(BRISBANE_LINK);
    apiLosesNextAnswer(isSending);
    await send();
    await closeJoin();
    expect(await cardLines()).toEqual(['Brisbane', NOT_SENT_CARD]);
    const sent = sendings().length;

    await comesBack();

    expect(await cardLines()).toEqual(['Brisbane', WAITING_CARD]);
    expect(sendings()).toHaveLength(sent);
  });

  test('[SHARING-211.1] leaves a request the API never got as not sent', async () => {
    await unsent();
    const sent = sendings().length;

    await comesBack();

    expect(await cardLines()).toEqual(['Brisbane', NOT_SENT_CARD]);
    expect(sendings()).toHaveLength(sent);
    await openRequest('Brisbane');
    expect(joinLines()).toEqual(UNSENT);
  });

  test.each([
    ['is answered with an error', () => apiAnswersNext(isRead, 500, '')],
    ['gets no answer', () => apiLosesNextAnswer(isRead)],
  ])(
    '[SHARING-211.1] leaves the request waiting when reading the invite again %s',
    async (_case, fail) => {
      await waiting();
      fail();

      await comesBack();

      expect(await cardLines()).toEqual(['Brisbane', WAITING_CARD]);
      expect(alertsShown()).toEqual([]);
    },
  );
});

const taken = (id: string) =>
  BRISBANE_CARD.members.map((member) =>
    member.id === id ? { ...member, hasDevice: true } : member,
  );

describe('SHARING-212.1', () => {
  test('[SHARING-212.1] asks the person to choose again when the member they picked has a phone by now', async () => {
    await waiting('Casey');
    cardBecomes(taken(CASEY_ID));

    await comesBack();

    expect(await cardLines()).toEqual(['Brisbane', CHOOSE_CARD]);
    await openRequest('Brisbane');
    expect(joinLines()).toEqual([
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

  test('[SHARING-212.1] sends the request again with the new choice, under the same path, and waits', async () => {
    await waiting('Casey');
    cardBecomes(taken(CASEY_ID));
    await comesBack();
    await tapTab('Groups');
    await openRequest('Brisbane');
    const first = sendings()[0].path;
    expect(joinLines()[0]).toBe(CHOOSE_AGAIN);

    await pressInJoin('Blake');
    await send();

    expect(sendings()).toHaveLength(2);
    expect(sendings()[1].path).toBe(first);
    expect(lastRequest().memberId).toBe(BLAKE_ID);
    expect(joinLines()).toEqual(WAITING_FOR_BRISBANE);
    expect(requestsOnApi(CODE_A)).toHaveLength(1);
  });

  test("[SHARING-212.1] asks a new member to choose again when the name is a member's by now, and picks that member", async () => {
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

    expect(joinLines()[0]).toBe(CHOOSE_AGAIN);
    expect(chosen()).toEqual(['dana']);
  });

  test('[SHARING-212.1] goes back to waiting when the request fits the card again', async () => {
    await waiting('Casey');
    cardBecomes(taken(CASEY_ID));
    await comesBack();
    expect(await cardLines()).toEqual(['Brisbane', CHOOSE_CARD]);
    cardBecomes(BRISBANE_CARD.members);

    await comesBack();

    expect(await cardLines()).toEqual(['Brisbane', WAITING_CARD]);
  });
});

describe('SHARING-213.1', () => {
  test("[SHARING-213.1] marks a request a member rejected, and keeps none of the invite's secret or code", async () => {
    await waiting();
    memberRejects();

    await comesBack();

    expect(await cardLines()).toEqual(['Brisbane', DECLINED_CARD]);
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

    expect(joinLines()).toEqual(DECLINED);
    const before = asked().length;
    await pressInJoin('OK');
    expect(isOpen(TITLE)).toBe(false);
    expect(await cardLines()).toBeUndefined();
    expect(rowsWith('Brisbane')).toEqual([]);
    expect(asked()).toHaveLength(before);
    expect(cancellations()).toEqual([]);
  });

  test('[SHARING-213.1] opens the form again when the link is opened after a rejection', async () => {
    await waiting();
    memberRejects();
    await comesBack();

    await openLink(BRISBANE_LINK);

    expect(joinLines()).toContain(SEND);
    expect(joinLines()).not.toContain(DECLINED[0]);
  });
});

describe('SHARING-214.1', () => {
  test('[SHARING-214.1] says the invite is no longer valid once it was revoked, and forgets the request on OK', async () => {
    await waiting();
    revokedByAnotherPhone(CODE_A);

    await comesBack();

    expect(await cardLines()).toEqual(['Brisbane', INVALID_CARD]);
    expect(rowsWith(S)).toEqual([]);
    await openRequest('Brisbane');
    expect(joinLines()).toEqual(INVALID);
    await pressInJoin('OK');
    expect(isOpen(TITLE)).toBe(false);
    expect(await cardLines()).toBeUndefined();
  });

  test('[SHARING-214.1] says the same of a request that was never sent', async () => {
    await unsent();
    revokedByAnotherPhone(CODE_A);

    await tapTab('Groups');
    await openRequest('Brisbane');

    expect(joinLines()).toEqual(INVALID);
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
      await tapTab('Groups');
      await openRequest('Brisbane');

      expect(joinLines()).toEqual(WAITING_FOR_BRISBANE);
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

    expect(isOpen(TITLE)).toBe(false);
    expect(navigationBarTitles(tab('Groups'))).toEqual(['Groups']);
    expect(await cardLines()).toBeUndefined();
    expect(cardNames()).toEqual(['Open Brisbane']);
  });
});

describe('SHARING-219.1', () => {
  test('[SHARING-219.1] is the new member in the group it joined, and sees who else has a phone', async () => {
    await waiting();
    memberApproves();
    await comesBack();

    await tapTab('Groups');
    expect(cardNames()).toEqual(['Open Brisbane']);
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

  test("[SHARING-219.1] is the member it picked, under that member's name", async () => {
    await waiting('Casey');
    memberApproves();
    await comesBack();

    await tapTab('Groups');
    expect(cardNames()).toEqual(['Open Brisbane']);
    await showMembers('Brisbane');

    await expectMembers([
      'Taylor, Joined',
      'Casey (You)',
      'Blake',
      'Add Member',
    ]);
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
    await waitFor(() =>
      expect(joinLines()).toEqual([APPROVED, 'Brisbane', FINISHING]),
    );

    expect(joinButton(CANCEL)).toBeUndefined();
    await chunk();
    await waitFor(() => expect(isOpen(TITLE)).toBe(false));
  });

  test('[SHARING-221.1] keeps the request as approved when the snapshot does not arrive, and finishes on Try Again', async () => {
    const app = await waiting();
    memberApproves();
    apiLosesNextAnswer(isChunk);

    await tapTab('Groups');
    await openRequest('Brisbane');

    expect(joinLines()).toEqual([
      APPROVED,
      'Brisbane',
      FINISH_OFFLINE,
      'Try Again',
    ]);
    expect(hasBrisbane()).toBe(false);
    await closeJoin();
    expect(await cardLines()).toEqual(['Brisbane', APPROVED_CARD]);
    goOffline();
    await restart(app);
    setClock(T);
    expect(await cardLines()).toEqual(['Brisbane', APPROVED_CARD]);
    goOnline();

    await openRequest('Brisbane');
    await waitFor(() => expect(hasBrisbane()).toBe(true));
  });

  test('[SHARING-221.1] says something went wrong when the API has no snapshot for it', async () => {
    await waiting();
    memberApproves({ snapshot: false });

    await tapTab('Groups');
    await openRequest('Brisbane');

    expect(joinLines()).toEqual([
      APPROVED,
      'Brisbane',
      WENT_WRONG,
      'Try Again',
    ]);
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

      expect(joinLines()).toEqual([APPROVED, 'Brisbane', FINISH_UPDATE]);
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
  ])(
    '[SHARING-216.1] does not join, and saves no key, when the API hands it %s',
    async (_case, changes) => {
      await waiting();
      memberApproves(changes);

      await tapTab('Groups');
      await openRequest('Brisbane');

      expect(joinLines()).toEqual([
        APPROVED,
        'Brisbane',
        WENT_WRONG,
        'Try Again',
      ]);
      expect(groupKeys()).toEqual([]);
      expect(hasBrisbane()).toBe(false);
    },
  );
});

describe('SHARING-217.1', () => {
  test('[SHARING-217.1] does not take in a snapshot the key of its box does not open', async () => {
    await waiting();
    memberApproves({ snapshotKey: new Uint8Array(32).fill(3) });

    await tapTab('Groups');
    await openRequest('Brisbane');

    expect(joinLines()).toEqual([
      APPROVED,
      'Brisbane',
      WENT_WRONG,
      'Try Again',
    ]);
    expect(hasBrisbane()).toBe(false);
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
  ])(
    '[SHARING-218.1] does not take in a snapshot whose roster has %s',
    async (_case, changes) => {
      await waiting();
      memberApproves(changes);

      await tapTab('Groups');
      await openRequest('Brisbane');

      expect(joinLines()).toEqual([
        APPROVED,
        'Brisbane',
        WENT_WRONG,
        'Try Again',
      ]);
      expect(hasBrisbane()).toBe(false);
    },
  );
});

describe('SHARING-222.1', () => {
  test('[SHARING-222.1] says the phone is in the group already, and forgets the request, when the API says so', async () => {
    await waiting();
    apiAnswersNext(isAsking, 409, json({ error: 'already-a-member' }));

    await tapTab('Groups');
    await openRequest('Brisbane');

    expect(joinLines()).toEqual([ALREADY_IN]);
    expect(rowsWith(CODE_A)).toEqual([]);
    await closeJoin();
    expect(await cardLines()).toBeUndefined();
  });
});

describe('SHARING-225.1', () => {
  test('[SHARING-225.1] changes what Join Group shows when the answer comes while it is open', async () => {
    await waiting();
    await tapTab('Groups');
    await openRequest('Brisbane');
    expect(joinLines()).toEqual(WAITING_FOR_BRISBANE);
    memberRejects();

    await comesBack();

    expect(joinLines()).toEqual(DECLINED);
    expect(isOpen(TITLE)).toBe(true);
  });

  test('[SHARING-225.1] shows a request that was not sent as waiting once the API says it has it', async () => {
    brisbaneInvites();
    await startAs();
    await openLink(BRISBANE_LINK);
    apiLosesNextAnswer(isSending);
    await send();
    expect(joinLines()[0]).toBe(NOT_SENT);

    await comesBack();

    expect(joinLines()).toEqual(WAITING_FOR_BRISBANE);
  });
});

describe('GROUPS-108.2', () => {
  test('[GROUPS-108.2] says on the card what became of the request, under the same name for a screen reader', async () => {
    await waiting('Casey');
    cardBecomes(taken(CASEY_ID));
    await comesBack();
    expect(await cardLines()).toEqual(['Brisbane', CHOOSE_CARD]);
    expect(requestCard('Brisbane')).toBeDefined();

    memberRejects();
    await comesBack();

    expect(await cardLines()).toEqual(['Brisbane', DECLINED_CARD]);
    expect(requestCard('Brisbane')).toBeDefined();
  });

  test('[GROUPS-108.2] shows the group in place of the request once the phone has joined', async () => {
    await waiting();
    memberApproves();

    await comesBack();

    expect(await cardLines()).toBeUndefined();
    expect(cardNames()).toEqual(['Open Brisbane']);
  });
});

describe('SHARING-140.2', () => {
  test('[SHARING-140.2] asks what became of the request, and joins, when sending it again finds the phone a member', async () => {
    brisbaneInvites();
    await startAs();
    await openLink(BRISBANE_LINK);
    apiLosesNextAnswer(isSending);
    await send();
    expect(joinLines()[0]).toBe(NOT_SENT);
    memberApproves();
    // The answer to this question is held back, so that Try Again is what finds out.
    const before = asked().length;

    await pressInJoin('Try Again');
    await joinSettles();
    await waitFor(() => expect(hasBrisbane()).toBe(true));

    expect(asked().length).toBeGreaterThan(before);
    expect(joinLines).toBeDefined();
  });
});
