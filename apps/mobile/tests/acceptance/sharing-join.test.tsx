import { Buffer } from 'node:buffer';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { makeReadOnlyCopy } from '../../src/sync';
import {
  addMember,
  alertsShown,
  expectClosed,
  expectOpen,
  isOpen,
  lastAlertButtonStyles,
  lastAlertButtons,
  pressAlertButton,
  pressOnBar,
} from './group-details-app';
import { createGroup, inTreeOrder } from './groups-app';
import { addExpense, restart } from './ledger-expense-app';
import {
  addGroupExpense,
  archiveGroup,
  removeFromGroup,
} from './ledger-group-expense-app';
import {
  API,
  T,
  apiAnswersNext,
  apiLosesNextAnswer,
  apiRefusesNext,
  drewFromTheRandomSource,
  failSecureStoreReads,
  failSecureStoreWrites,
  fetchCalls,
  fromHex,
  goOffline,
  goOnline,
  mistakes,
  nextSeedIs,
  received,
  registrationsReceived,
  removeSecureStoreEntry,
  secureStoreEntries,
  secureStoreWorks,
} from './sharing-app';
import {
  WEEK,
  afterTheAnswerTo,
  asked,
  cardKeyOf,
  closeInvite,
  holdTheApi,
  inviteWithCard,
  invited,
  isRegistering,
  keepAnswersBack,
  localDataHolds,
  partsOf,
  pressInInvite,
  requestsFromOthers,
  requestsHold,
  requestsOnApi,
  revokedByAnotherPhone,
  secondsPass,
  startAt,
  until,
} from './sharing-invite-app';
import { receiveLink, startAppFromLink } from './sharing-invite-link-app';
import {
  ALREADY_IN,
  ALREADY_JOINED,
  APPROVAL,
  BLAKE_ID,
  BRISBANE_CARD,
  BRISBANE_ID,
  BRISBANE_LINK,
  CANCEL,
  CANCEL_ALERT,
  CANNOT_JOIN,
  CANNOT_USE,
  CASEY_ID,
  CODE_A,
  CODE_B,
  FULL,
  JOIN_AS,
  LOADING,
  NEW_MEMBER,
  NOT_SENT,
  NOT_SENT_OFFLINE,
  OFFLINE,
  ONLY_MEMBERS,
  REPLACE_THIS_COPY,
  REPLACE_YOUR_COPY,
  S,
  S2,
  SAME_NAME,
  SEND,
  SENDING,
  TAYLORS_PHONE,
  TAYLOR_ID,
  TITLE,
  TOKYO_LINK,
  TOO_MANY,
  UNABLE_TO_CANCEL,
  UNABLE_TO_SEND,
  UPDATE_APP,
  WAITING,
  WAITING_TEXT,
  WENT_WRONG,
  announcements,
  brisbaneInvites,
  canSend,
  cancellations,
  cardOf,
  cardsAmong,
  choices,
  chosen,
  eachTestGetsAJoiningPhone,
  hasSignedFields,
  invites,
  isCancelling,
  isRead,
  isSending,
  joinButton,
  joinLines,
  joinSettles,
  lastRequest,
  linkOf,
  nameField,
  openLink,
  openRequest,
  openedRequest,
  pressInJoin,
  reads,
  replaceThisCopy,
  replaceYourCopy,
  requestCard,
  requestKeyOf,
  requested,
  rowsWith,
  sealedCard,
  send,
  sendings,
  sentRequest,
  startAs,
  tokyoInvites,
  typeName,
} from './sharing-join-app';
import { iconNames } from './shell-actions-app';
import { allowWrites, failWrites, settle } from './shell-appearance-app';
import { selectedTab, tapTab } from './shell-tabs-app';
import {
  appDatabase,
  everything,
  groupId,
  leaveMembers,
  members,
  setClock,
  share,
  showMembers,
} from './sync-app';

// Runs on iOS. Each test starts the whole app on Dana's phone: Dana saved as your name, no
// group, no device identity, at 2026-11-18T06:32:00Z (sharing-join-app). Brisbane and
// Tokyo are another phone's shared ledgers, whose invites and cards the tests put on the
// API behind `fetch`. The tests hand the app an invite link as the system does and read
// Join Group, the phone's local data and what the API received.

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

eachTestGetsAJoiningPhone('sharing-join-');

const FORM = [
  'Brisbane',
  JOIN_AS,
  NEW_MEMBER,
  'Taylor',
  ALREADY_JOINED,
  'Casey',
  'Blake',
  APPROVAL,
  SEND,
];
const WAITING_FOR_BRISBANE = [WAITING, 'Brisbane', WAITING_TEXT, CANCEL];
const UNSENT = [NOT_SENT, 'Try Again', CANCEL];

const json = (body: unknown) => JSON.stringify(body);

/** A request that asks what became of a join request (SHARING-183.1). */
const isAsking = ({ method, path }: { method: string; path: string }) =>
  method === 'GET' && /^\/invites\/[^/?]+\/request$/.test(path);

/** Closes Join Group with Close. */
async function closeJoin() {
  await pressOnBar(TITLE, 'Close');
  await expectClosed(TITLE);
}

/** Presses Cancel Request, then the alert's own Cancel Request. */
async function cancelRequest() {
  await pressInJoin(CANCEL);
  await pressAlertButton(CANCEL);
}

/** The phone has neither made a device identity nor kept anything since `before`. */
function expectNothingLeft(before: ReturnType<typeof everything>) {
  expect(secureStoreEntries()).toEqual([]);
  expect(registrationsReceived()).toEqual([]);
  expect(everything()).toEqual(before);
}

/** Takes the seed of the phone's identity out of the secure store, so that the phone has lost its authorization. */
function loseTheSeed() {
  for (const { key } of secureStoreEntries()) removeSecureStoreEntry(key);
}

// Opening a link

test('[SHARING-19.2] sends one request with no signature, and makes no identity, when an invite link is opened and closed', async () => {
  brisbaneInvites();
  await startAs();

  await openLink(BRISBANE_LINK);
  expect(joinLines()).toEqual(FORM);
  await closeJoin();

  expect(received()).toHaveLength(1);
  expect(isRead(received()[0])).toBe(true);
  expect(hasSignedFields(received()[0])).toBe(false);
  expect(secureStoreEntries()).toEqual([]);
});

describe('SHARING-123.1', () => {
  const HALF = `${API}/i/${CODE_A}`;
  const NOT_USABLE = [
    ['with nothing after the code', HALF],
    ['that ends in a #', `${HALF}#`],
    ['whose secret lacks its last character', BRISBANE_LINK.slice(0, -1)],
    ['whose secret has one character more', `${BRISBANE_LINK}A`],
    [
      'whose secret ends in a character 32 bytes cannot end in',
      `${BRISBANE_LINK.slice(0, -1)}9`,
    ],
    ['whose code is too short', linkOf('abc', S)],
    ['with no code', linkOf('', S)],
    ['with a segment after the code', `${HALF}/x#${S}`],
  ];

  test.each(NOT_USABLE)(
    '[SHARING-123.1] says a link %s cannot be used, sends nothing and leaves nothing behind',
    async (_, link) => {
      brisbaneInvites();
      await startAs();
      const before = everything();

      await openLink(link);

      expect(joinLines()).toEqual([CANNOT_USE]);
      expect(fetchCalls()).toBe(0);
      expectNothingLeft(before);
    },
  );

  test.each([
    `${HALF}?openExternalBrowser=1#${S}`,
    `shared-expense-tracker://i/${CODE_A}#${S}`,
  ])('[SHARING-123.1] takes %s as a link that can be used', async (link) => {
    brisbaneInvites();
    await startAs();

    await openLink(link);

    expect(joinLines()).toEqual(FORM);
  });
});

describe('SHARING-124.1', () => {
  test('[SHARING-124.1] reads the invite with one GET that carries no signature and no body, and makes no identity', async () => {
    brisbaneInvites();
    await startAs();

    await openLink(BRISBANE_LINK);

    expect(received()).toHaveLength(1);
    const [read] = received();
    expect(`${read.method} ${read.path}`).toBe(`GET /invites/${CODE_A}`);
    expect(hasSignedFields(read)).toBe(false);
    expect(read.body).toHaveLength(0);
    expect(joinLines()).toEqual(FORM);
    expect(secureStoreEntries()).toEqual([]);
  });

  test('[SHARING-124.1] shows only Loading invite… until the API has answered', async () => {
    brisbaneInvites();
    await startAs();
    const answer = holdTheApi();

    await receiveLink(BRISBANE_LINK);
    await expectOpen(TITLE);

    expect(joinLines()).toEqual([LOADING]);

    await act(async () => answer());
    await joinSettles();
    expect(joinLines()).toEqual(FORM);
  });

  test('[SHARING-124.1] does not open Join Group again, or keep anything, for an answer that comes after it was closed', async () => {
    brisbaneInvites();
    await startAs();
    const before = everything();
    const answer = keepAnswersBack(isRead);
    await receiveLink(BRISBANE_LINK);
    await expectOpen(TITLE);
    await until(() => reads().length === 1, 'the read');

    await closeJoin();
    await answer();
    await settle();

    expect(isOpen(TITLE)).toBe(false);
    expectNothingLeft(before);
  });

  test("[SHARING-124.1] reads from the build's API whatever host the link has", async () => {
    brisbaneInvites();
    await startAs();

    await openLink(linkOf(CODE_A, S, 'https://other.example.org/i/'));

    expect(mistakes()).toEqual([]);
    expect(reads().map(({ url }) => url)).toEqual([`${API}/invites/${CODE_A}`]);
    expect(joinLines()).toEqual(FORM);
  });
});

describe('SHARING-125.1', () => {
  test("[SHARING-125.1] shows the group's name, the name field, every member and Send Request, with New Member picked", async () => {
    brisbaneInvites();
    await startAs();

    await openLink(BRISBANE_LINK);

    expect(joinLines()).toEqual(FORM);
    expect(nameField().props.value).toBe('Dana');
    expect(choices()).toEqual([NEW_MEMBER, 'Casey', 'Blake']);
    expect(chosen()).toEqual([NEW_MEMBER]);
    expect(joinButton('Taylor')).toBeUndefined();
    expect(joinButton(SEND)).toBeOnTheScreen();
  });

  test('[SHARING-125.1] leaves the name field empty, with Enter your name, on a phone with no name', async () => {
    brisbaneInvites();
    await startAs(null);

    await openLink(BRISBANE_LINK);

    expect(nameField().props.value ?? '').toBe('');
    expect(nameField().props.placeholder).toBe('Enter your name');
  });

  test('[SHARING-125.1] lets nobody be picked when every member has a phone, only New Member', async () => {
    tokyoInvites();
    await startAs();

    await openLink(TOKYO_LINK);

    expect(joinLines()).toEqual([
      'Tokyo',
      JOIN_AS,
      NEW_MEMBER,
      'Taylor',
      ALREADY_JOINED,
      APPROVAL,
      SEND,
    ]);
    expect(choices()).toEqual([NEW_MEMBER]);
  });

  test('[SHARING-125.1] picks the row that is pressed, and only that one', async () => {
    brisbaneInvites();
    await startAs();
    await openLink(BRISBANE_LINK);

    const marks = () =>
      [NEW_MEMBER, 'Casey', 'Blake'].map((row) =>
        iconNames(joinButton(row)!, 'ios'),
      );
    expect(marks()).toEqual([['checkmark'], [], []]);

    await pressInJoin('Casey');
    expect(chosen()).toEqual(['Casey']);
    expect(marks()).toEqual([[], ['checkmark'], []]);

    await pressInJoin('Blake');
    expect(chosen()).toEqual(['Blake']);
    expect(marks()).toEqual([[], [], ['checkmark']]);
  });

  test('[SHARING-125.1] does not change your name when the name field is changed and the request is sent', async () => {
    brisbaneInvites();
    await startAs();
    await openLink(BRISBANE_LINK);
    await typeName('Dana K.');
    await send();
    await closeJoin();

    await tapTab('Settings');

    expect(screen.getByLabelText('Your name').props.value).toBe('Dana');
  });
});

describe('SHARING-126.1', () => {
  test('[SHARING-126.1] picks the member without a phone whose name is yours, whatever its case', async () => {
    brisbaneInvites();
    await startAs('casey');

    await openLink(BRISBANE_LINK);

    expect(chosen()).toEqual(['Casey']);
  });

  test('[SHARING-126.1] picks New Member when your name is that of a member who has a phone', async () => {
    brisbaneInvites();
    await startAs('Taylor');

    await openLink(BRISBANE_LINK);

    expect(chosen()).toEqual([NEW_MEMBER]);
  });

  test('[SHARING-126.1] keeps what is picked when the name field changes', async () => {
    brisbaneInvites();
    await startAs();
    await openLink(BRISBANE_LINK);

    await typeName('Casey');

    expect(chosen()).toEqual([NEW_MEMBER]);
  });

  test('[SHARING-126.1] picks the first of two members without a phone who share your name', async () => {
    invites(CODE_A, S, {
      name: 'Brisbane',
      members: [
        { id: TAYLOR_ID, name: 'Taylor', hasDevice: true },
        { id: CASEY_ID, name: 'Sam', hasDevice: false },
        { id: BLAKE_ID, name: 'sam', hasDevice: false },
      ],
    });
    await startAs('Sam');

    await openLink(BRISBANE_LINK);

    expect(chosen()).toEqual(['Sam']);
    await send();
    expect(lastRequest().memberId).toBe(CASEY_ID);
  });
});

describe('SHARING-127.1', () => {
  test('[SHARING-127.1] disables Send Request until the name field holds more than spaces', async () => {
    brisbaneInvites();
    await startAs(null);
    await openLink(BRISBANE_LINK);

    expect(canSend()).toBe(false);

    await typeName('   ');
    expect(canSend()).toBe(false);

    await typeName('Dana');
    expect(canSend()).toBe(true);
  });

  test('[SHARING-127.1] sends nothing when Send Request is pressed with the name cleared', async () => {
    brisbaneInvites();
    await startAs();
    await openLink(BRISBANE_LINK);
    await typeName('');

    await pressInJoin(SEND);

    expect(canSend()).toBe(false);
    expect(received()).toHaveLength(1);
    expect(rowsWith(CODE_A)).toEqual([]);
    expect(joinLines()).toEqual(FORM);
  });
});

describe('SHARING-128.1', () => {
  test('[SHARING-128.1] does not send a new member whose name is that of a member without a phone, and says so under the name field', async () => {
    brisbaneInvites();
    await startAs();
    await openLink(BRISBANE_LINK);
    await typeName(' casey ');
    const before = everything();

    await pressInJoin(SEND);

    expect(joinLines()).toEqual([FORM[0], SAME_NAME, ...FORM.slice(1)]);
    expect(announcements()).toContain(SAME_NAME);
    expect(received()).toHaveLength(1);
    expectNothingLeft(before);
  });

  test('[SHARING-128.1] sends the request once that member is picked instead', async () => {
    brisbaneInvites();
    await startAs();
    await openLink(BRISBANE_LINK);
    await typeName(' casey ');
    await pressInJoin(SEND);

    await pressInJoin('Casey');
    expect(joinLines()).not.toContain(SAME_NAME);
    await send();

    expect(joinLines()[0]).toBe(WAITING);
    expect(lastRequest()).toMatchObject({ name: 'casey', memberId: CASEY_ID });
  });

  test('[SHARING-128.1] does not send a new member whose name is that of a member with a phone', async () => {
    brisbaneInvites();
    await startAs();
    await openLink(BRISBANE_LINK);
    await typeName('TAYLOR');

    await pressInJoin(SEND);

    expect(joinLines()).toContain(SAME_NAME);
    expect(sendings()).toEqual([]);
  });

  test('[SHARING-128.1] drops the sentence when the name changes, and sends the request then', async () => {
    brisbaneInvites();
    await startAs();
    await openLink(BRISBANE_LINK);
    await typeName('TAYLOR');
    await pressInJoin(SEND);

    await typeName('Taylor B.');
    expect(joinLines()).not.toContain(SAME_NAME);
    await send();

    expect(lastRequest()).toMatchObject({ name: 'Taylor B.', memberId: null });
  });

  test("[SHARING-128.1] sends a request for a picked member under a name that is another member's", async () => {
    brisbaneInvites();
    await startAs();
    await openLink(BRISBANE_LINK);
    await typeName('Taylor');
    await pressInJoin('Casey');

    await send();

    expect(joinLines()).not.toContain(SAME_NAME);
    expect(lastRequest()).toMatchObject({ name: 'Taylor', memberId: CASEY_ID });
  });
});

describe('SHARING-129.1', () => {
  /** 18 members with a phone, then Casey and Blake without one. */
  const TWENTY = {
    name: 'Brisbane',
    members: [
      ...cardOf(18, 18).members,
      { id: CASEY_ID, name: 'Casey', hasDevice: false },
      { id: BLAKE_ID, name: 'Blake', hasDevice: false },
    ],
  };

  test('[SHARING-129.1] offers only the members without a phone when the card lists 20, with nobody picked', async () => {
    invites(CODE_A, S, TWENTY);
    await startAs();

    await openLink(BRISBANE_LINK);

    expect(choices()).toEqual(['Casey', 'Blake']);
    expect(chosen()).toEqual([]);
    expect(canSend()).toBe(false);
    const lines = joinLines();
    expect(lines).not.toContain(NEW_MEMBER);
    expect(lines.slice(lines.indexOf('Blake') + 1)).toEqual([
      ONLY_MEMBERS,
      APPROVAL,
      SEND,
    ]);

    await pressInJoin('Casey');
    expect(canSend()).toBe(true);
    await send();
    expect(lastRequest().memberId).toBe(CASEY_ID);
  });

  test('[SHARING-129.1] picks the member without a phone whose name is yours, among 20', async () => {
    invites(CODE_A, S, TWENTY);
    await startAs('casey');

    await openLink(BRISBANE_LINK);

    expect(chosen()).toEqual(['Casey']);
    expect(canSend()).toBe(true);
  });

  test('[SHARING-129.1] says the group is full when all 20 members on the card have a phone', async () => {
    invites(CODE_A, S, cardOf(20, 20));
    await startAs();

    await openLink(BRISBANE_LINK);

    expect(joinLines()).toEqual(['Brisbane', FULL]);
    expect(screen.queryByLabelText('Your name')).toBeNull();
  });

  test('[SHARING-129.1] offers New Member while the card lists 19 members', async () => {
    invites(CODE_A, S, cardOf(19, 19));
    await startAs();

    await openLink(BRISBANE_LINK);

    expect(choices()).toEqual([NEW_MEMBER]);
    expect(chosen()).toEqual([NEW_MEMBER]);
    expect(joinLines()).not.toContain(ONLY_MEMBERS);
    expect(joinLines()).not.toContain(FULL);
  });
});

// A phone that already belongs to the group

describe('SHARING-130.2', () => {
  /** Taylor's phone with Brisbane and the invite it made; the invite's link. Ends on the Settings root. */
  async function taylorInvited() {
    const app = await startAt({ Brisbane: ['Casey', 'Blake'] });
    const link = await invited('Brisbane');
    await closeInvite();
    await leaveMembers('Brisbane');
    await tapTab('Settings');
    return { app, link };
  }

  test('[SHARING-130.2] opens the group, not Join Group, for the link of an invite the phone holds, and asks the API nothing', async () => {
    const { link } = await taylorInvited();
    const sent = asked();

    await receiveLink(link);

    await expectOpen('Brisbane');
    expect(isOpen(TITLE)).toBe(false);
    expect(selectedTab()).toBe('Groups');
    expect(asked()).toBe(sent);
  });

  test('[SHARING-130.2] opens the group when that link starts the app', async () => {
    const { app, link } = await taylorInvited();
    await app.unmount();
    await settle();

    await startAppFromLink(link);

    await expectOpen('Brisbane');
    expect(isOpen(TITLE)).toBe(false);
    expect(selectedTab()).toBe('Groups');
  });

  test('[SHARING-130.2] opens the group for the link of an invite that has expired on the phone', async () => {
    const { link } = await taylorInvited();
    const sent = asked();
    setClock(T + WEEK);

    await receiveLink(link);

    await expectOpen('Brisbane');
    expect(isOpen(TITLE)).toBe(false);
    expect(asked()).toBe(sent);
  });

  test('[SHARING-130.2] takes a link with the same code and another secret for no invite of its own', async () => {
    const { link } = await taylorInvited();

    await openLink(linkOf(partsOf(link).code, S2));

    expect(joinLines()).toEqual([CANNOT_USE]);
    expect(reads()).toHaveLength(1);
  });

  test("[SHARING-130.2] closes Join Group and opens the group when the card names a member of one of the phone's shared ledgers", async () => {
    await startAt({ Brisbane: ['Casey', 'Blake'] });
    await share('Brisbane');
    const ids = await members('Brisbane');
    invites(
      CODE_B,
      S2,
      {
        name: 'Brisbane',
        members: [
          { id: ids.Taylor, name: 'Taylor', hasDevice: true },
          { id: ids.Casey, name: 'Casey', hasDevice: false },
        ],
      },
      await groupId('Brisbane'),
    );
    await tapTab('Settings');

    await openLink(linkOf(CODE_B, S2));

    await expectOpen('Brisbane');
    expect(isOpen(TITLE)).toBe(false);
    expect(selectedTab()).toBe('Groups');
    expect(reads()).toHaveLength(1);
    expect(sendings()).toEqual([]);
    expect(rowsWith(CODE_B)).toEqual([]);
  });

  test('[SHARING-130.2] opens the group when the only member the phone knows on the card is a former member', async () => {
    await startAt({ Brisbane: ['Casey', 'Blake'] });
    await share('Brisbane');
    await removeFromGroup('Brisbane', 'Blake');
    const ids = await members('Brisbane');
    invites(
      CODE_B,
      S2,
      {
        name: 'Brisbane',
        members: [
          { id: TAYLOR_ID, name: 'Someone', hasDevice: true },
          { id: ids.Blake, name: 'Blake', hasDevice: false },
        ],
      },
      await groupId('Brisbane'),
    );
    await tapTab('Settings');

    await openLink(linkOf(CODE_B, S2));

    await expectOpen('Brisbane');
    expect(isOpen(TITLE)).toBe(false);
    expect(selectedTab()).toBe('Groups');
  });

  test('[SHARING-130.2] says the link cannot be used once the phone has revoked its invite, member or not', async () => {
    await startAt({ Brisbane: ['Casey', 'Blake'] });
    const link = await invited('Brisbane');
    await pressInInvite('Revoke Link');
    await pressAlertButton('Revoke');
    await expectClosed('Invite');
    await leaveMembers('Brisbane');
    await tapTab('Settings');

    await openLink(link);

    expect(joinLines()).toEqual([CANNOT_USE]);
    expect(selectedTab()).toBe('Settings');
  });

  test('[SHARING-130.2] opens an archived group on the Settings tab', async () => {
    const { link } = await taylorInvited();
    await archiveGroup('Brisbane');
    await tapTab('Expenses');

    await receiveLink(link);

    await expectOpen('Brisbane');
    expect(isOpen(TITLE)).toBe(false);
    expect(selectedTab()).toBe('Settings');
    expect(screen.getByText('Restore Group')).toBeOnTheScreen();
  });
});

/** The phone lost its access to the group: from now on it holds a read-only copy of it. */
async function becomesACopy(group: string) {
  const id = await groupId(group);
  await act(async () => {
    await makeReadOnlyCopy(appDatabase(), id, 'not-a-member');
  });
  await settle();
  return id;
}

/** Another phone's invite to the group, whose card names Taylor, who has a phone, and Casey and Blake of this phone's group. */
async function othersInvite(group = 'Brisbane') {
  const ids = await members(group);
  invites(
    CODE_B,
    S2,
    {
      name: 'Brisbane',
      members: [
        { id: ids.Taylor, name: 'Taylor', hasDevice: true },
        { id: ids.Casey, name: 'Casey', hasDevice: false },
        { id: ids.Blake, name: 'Blake', hasDevice: false },
      ],
    },
    await groupId(group),
  );
  return linkOf(CODE_B, S2);
}

describe('SHARING-130.2', () => {
  test('[SHARING-130.2] shows the form, and opens no group, when the card names a member of a read-only copy on the phone', async () => {
    await startAt({ Brisbane: ['Casey', 'Blake'] });
    await share('Brisbane');
    await becomesACopy('Brisbane');
    const link = await othersInvite();
    await tapTab('Settings');

    await openLink(link);

    await waitFor(() => expect(joinLines()).toContain(JOIN_AS));
    expect(isOpen(TITLE)).toBe(true);
    expect(selectedTab()).toBe('Settings');
    expect(choices()).toEqual([NEW_MEMBER, 'Casey', 'Blake']);
  });

  test('[SHARING-130.2] reads the invite, as for any link, when the invite the phone holds belongs to a read-only copy', async () => {
    await startAt({ Brisbane: ['Casey', 'Blake'] });
    const link = await invited('Brisbane');
    await closeInvite();
    await leaveMembers('Brisbane');
    await becomesACopy('Brisbane');
    await tapTab('Settings');
    const before = reads().length;

    await receiveLink(link);

    await waitFor(() => expect(reads()).toHaveLength(before + 1));
    expect(isOpen(TITLE)).toBe(true);
    expect(selectedTab()).toBe('Settings');
  });
});

describe('SHARING-226.2', () => {
  /** The phone has a group of its own that the invite's card knows, and Blake is picked in the form. */
  async function formOverOwnCopy() {
    await startAt({ Brisbane: ['Casey', 'Blake'] });
    const link = await othersInvite();
    await tapTab('Settings');
    await openLink(link);
    await waitFor(() => expect(joinLines()).toContain(JOIN_AS));
    await pressInJoin('Blake');
  }

  test('[SHARING-226.2] shows the form to a phone that has its own copy of the group, and asks before it sends the request', async () => {
    await formOverOwnCopy();
    const before = everything();
    const shown = alertsShown().length;

    await pressInJoin(SEND);

    expect(alertsShown().slice(shown)).toEqual([
      [REPLACE_YOUR_COPY, replaceYourCopy('Brisbane')],
    ]);
    expect(lastAlertButtons()).toEqual(['Cancel', SEND]);
    expect(sendings()).toEqual([]);
    expect(secureStoreEntries()).toEqual([]);
    expect(everything()).toEqual(before);
  });

  test('[SHARING-226.2] sends the request once Send Request is pressed in that alert, and leaves the copy as it was', async () => {
    await formOverOwnCopy();
    const { groups, group_members: groupMembers } = everything();
    const shown = alertsShown().length;
    await pressInJoin(SEND);
    expect(alertsShown()).toHaveLength(shown + 1);

    await pressAlertButton(SEND);

    await waitFor(() => expect(joinLines()).toContain(WAITING));
    expect(sendings()).toHaveLength(1);
    expect(everything().groups).toEqual(groups);
    expect(everything().group_members).toEqual(groupMembers);
  });

  test('[SHARING-226.2] sends nothing, and keeps the form as it was, when Cancel is pressed in that alert', async () => {
    await formOverOwnCopy();
    const before = everything();
    const shown = alertsShown().length;
    await pressInJoin(SEND);
    expect(alertsShown()).toHaveLength(shown + 1);

    await pressAlertButton('Cancel');

    expect(chosen()).toEqual(['Blake']);
    expect(canSend()).toBe(true);
    expect(sendings()).toEqual([]);
    expect(everything()).toEqual(before);
  });

  test('[SHARING-226.2] asks the same when the only member it knows on the card is a former member of that group', async () => {
    await startAt({ Brisbane: ['Casey', 'Blake'] });
    await removeFromGroup('Brisbane', 'Blake');
    const ids = await members('Brisbane');
    invites(
      CODE_B,
      S2,
      {
        name: 'Brisbane',
        members: [
          { id: TAYLOR_ID, name: 'Someone', hasDevice: true },
          { id: ids.Blake, name: 'Blake', hasDevice: false },
        ],
      },
      await groupId('Brisbane'),
    );
    await tapTab('Settings');
    await openLink(linkOf(CODE_B, S2));
    await waitFor(() => expect(joinLines()).toContain(JOIN_AS));
    const shown = alertsShown().length;

    await pressInJoin(SEND);

    expect(alertsShown().slice(shown)).toEqual([
      [REPLACE_YOUR_COPY, replaceYourCopy('Brisbane')],
    ]);
    expect(sendings()).toEqual([]);
  });

  test.each([
    [1, ['Dana']],
    [3, ['Dana', 'Evan', 'Finn']],
  ])(
    '[SHARING-226.2] says how many changes of a read-only copy were never sent, before it sends the request: %s',
    async (count, added) => {
      await startAt({ Brisbane: ['Casey', 'Blake'] });
      await share('Brisbane');
      goOffline();
      await showMembers('Brisbane');
      for (const name of added) await addMember(name);
      await leaveMembers('Brisbane');
      goOnline();
      await becomesACopy('Brisbane');
      const link = await othersInvite();
      await tapTab('Settings');
      await openLink(link);
      await waitFor(() => expect(joinLines()).toContain(JOIN_AS));
      await pressInJoin('Casey');
      const shown = alertsShown().length;

      await pressInJoin(SEND);

      expect(alertsShown().slice(shown)).toEqual([
        [REPLACE_THIS_COPY, replaceThisCopy(count)],
      ]);
      expect(lastAlertButtons()).toEqual(['Cancel', SEND]);
      expect(sendings()).toEqual([]);
    },
  );

  test('[SHARING-226.2] sends the request without asking when the read-only copy has no change that was never sent', async () => {
    await startAt({ Brisbane: ['Casey', 'Blake'] });
    await share('Brisbane');
    await becomesACopy('Brisbane');
    const link = await othersInvite();
    await tapTab('Settings');
    await openLink(link);
    await waitFor(() => expect(joinLines()).toContain(JOIN_AS));
    await pressInJoin('Casey');
    const shown = alertsShown().length;

    await send();

    expect(alertsShown()).toHaveLength(shown);
    expect(sendings()).toHaveLength(1);
    expect(joinLines()).toContain(WAITING);
  });
});

describe('SHARING-131.2', () => {
  test('[SHARING-131.2] shows the request the phone holds, with no form, and asks once what became of it, when its link is opened again', async () => {
    brisbaneInvites();
    await startAs();
    await requested();
    await closeJoin();
    const sent = sendings().length;

    await openLink(BRISBANE_LINK);

    expect(joinLines()).toEqual(WAITING_FOR_BRISBANE);
    expect(sendings()).toHaveLength(sent);
    expect(received().filter(isAsking)).toHaveLength(1);
  });

  test.each(['its link', 'its card'])(
    '[SHARING-131.2] shows only Sending request…, with nothing to press, when a request on its way is opened again from %s',
    async (from) => {
      brisbaneInvites();
      await startAs();
      await openLink(BRISBANE_LINK);
      const answer = keepAnswersBack(isSending);
      await pressInJoin(SEND);
      await until(() => sendings().length === 1, 'the request');
      await closeJoin();

      if (from === 'its link') {
        await receiveLink(BRISBANE_LINK);
      } else {
        await tapTab('Groups');
        await fireEvent.press(requestCard('Brisbane')!);
      }
      await expectOpen(TITLE);
      await settle();

      expect(joinLines()).toEqual([SENDING]);
      expect(joinButton('Try Again')).toBeUndefined();
      expect(joinButton(CANCEL)).toBeUndefined();
      expect(sendings()).toHaveLength(1);
      expect(received().filter(isAsking)).toEqual([]);

      await answer();
      await joinSettles();

      expect(joinLines()).toEqual(WAITING_FOR_BRISBANE);
      expect(sendings()).toHaveLength(1);
    },
  );

  test('[SHARING-131.2] shows it with no network', async () => {
    brisbaneInvites();
    await startAs();
    await requested();
    await closeJoin();
    goOffline();

    await openLink(BRISBANE_LINK);

    expect(joinLines()).toEqual(WAITING_FOR_BRISBANE);
  });
});

// Invites that cannot be used or reached

describe('SHARING-132.1', () => {
  test.each([
    ['has expired', () => setClock(T + WEEK)],
    ['was revoked', () => revokedByAnotherPhone(CODE_A)],
  ])(
    '[SHARING-132.1] says a link cannot be used when its invite %s, and leaves nothing behind',
    async (_, end) => {
      brisbaneInvites();
      await startAs();
      end();
      const before = everything();

      await openLink(BRISBANE_LINK);

      expect(joinLines()).toEqual([CANNOT_USE]);
      expect(reads()).toHaveLength(1);
      expectNothingLeft(before);
    },
  );

  test('[SHARING-132.1] says a link cannot be used when the API has never seen its code', async () => {
    await startAs();
    const before = everything();

    await openLink(BRISBANE_LINK);

    expect(joinLines()).toEqual([CANNOT_USE]);
    expectNothingLeft(before);
  });

  test('[SHARING-132.1] says a link cannot be used when the API refuses the read as written wrongly', async () => {
    brisbaneInvites();
    await startAs();
    apiAnswersNext(isRead, 400, json({ error: 'request' }));

    await openLink(BRISBANE_LINK);

    expect(joinLines()).toEqual([CANNOT_USE]);
  });

  test("[SHARING-132.1] says a link cannot be used when its secret does not open the invite's card", async () => {
    brisbaneInvites();
    await startAs();
    const before = everything();

    await openLink(linkOf(CODE_A, S2));

    expect(joinLines()).toEqual([CANNOT_USE]);
    expectNothingLeft(before);
  });

  const taylor = { id: TAYLOR_ID, name: 'Taylor', hasDevice: true };
  const NOT_CARDS: [string, unknown][] = [
    ['no members', { name: 'Brisbane' }],
    ['an empty list of members', { name: 'Brisbane', members: [] }],
    ['an empty group name', { name: '', members: [taylor] }],
    [
      'a member ID that is no UUID',
      { name: 'Brisbane', members: [{ ...taylor, id: 'taylor' }] },
    ],
    [
      'an empty member name',
      { name: 'Brisbane', members: [{ ...taylor, name: '' }] },
    ],
    [
      'text for whether a member has a phone',
      { name: 'Brisbane', members: [{ ...taylor, hasDevice: 'yes' }] },
    ],
    ['text that is no JSON', 'Brisbane'],
  ];

  test.each(NOT_CARDS)(
    '[SHARING-132.1] says a link cannot be used when its card opens to %s',
    async (_, content) => {
      invites(CODE_A, S, content);
      await startAs();
      const before = everything();

      await openLink(BRISBANE_LINK);

      expect(joinLines()).toEqual([CANNOT_USE]);
      expectNothingLeft(before);
    },
  );

  test('[SHARING-132.1] shows the form for a card with fields it does not know', async () => {
    invites(CODE_A, S, {
      ...BRISBANE_CARD,
      note: 'hi',
      members: BRISBANE_CARD.members.map((member) => ({
        ...member,
        color: '#D81B60',
      })),
    });
    await startAs();

    await openLink(BRISBANE_LINK);

    expect(joinLines()).toEqual(FORM);
  });

  test('[SHARING-132.1] says to update the app when the card has a format version it does not know', async () => {
    const card = sealedCard(CODE_A, S, BRISBANE_CARD);
    card[0] = 0x02;
    inviteWithCard(BRISBANE_ID, TAYLORS_PHONE, CODE_A, card);
    await startAs();
    const before = everything();

    await openLink(BRISBANE_LINK);

    expect(joinLines()).toEqual([UPDATE_APP]);
    expectNothingLeft(before);
  });
});

describe('SHARING-133.1', () => {
  test('[SHARING-133.1] says to connect, with Try Again, when there is no network, and recording goes on', async () => {
    brisbaneInvites();
    await startAs();
    goOffline();
    const before = everything();

    await openLink(BRISBANE_LINK);

    expect(joinLines()).toEqual([OFFLINE, 'Try Again']);
    expect(joinButton('Try Again')).toBeOnTheScreen();
    expectNothingLeft(before);

    await closeJoin();
    await addExpense({ title: 'Coffee run', amount: '8.75' });
    expect(rowsWith('Coffee run')).not.toEqual([]);
  });

  test('[SHARING-133.1] reads the invite again on Try Again, and when the link is opened again', async () => {
    brisbaneInvites();
    await startAs();
    goOffline();
    await openLink(BRISBANE_LINK);
    goOnline();

    await send('Try Again');
    expect(joinLines()).toEqual(FORM);

    await closeJoin();
    goOffline();
    await openLink(BRISBANE_LINK);
    await closeJoin();
    goOnline();
    await openLink(BRISBANE_LINK);
    expect(joinLines()).toEqual(FORM);
  });

  test('[SHARING-133.1] says to connect, and sends nothing, in a build with no address for the API', async () => {
    brisbaneInvites();
    await startAs();
    delete process.env.EXPO_PUBLIC_API_URL;

    await openLink(BRISBANE_LINK);

    expect(joinLines()).toEqual([OFFLINE, 'Try Again']);
    expect(fetchCalls()).toBe(0);
  });

  test.each([
    ['a 500', 500, 'Internal Server Error'],
    ['a 404 with no reason', 404, '404 Not Found'],
    ['a 200 that is no invite', 200, json({ card: 7 })],
  ])(
    '[SHARING-133.1] says something went wrong, with Try Again, when the API answers the read with %s',
    async (_, status, body) => {
      brisbaneInvites();
      await startAs();
      apiAnswersNext(isRead, status, body);

      await openLink(BRISBANE_LINK);

      expect(joinLines()).toEqual([WENT_WRONG, 'Try Again']);

      await send('Try Again');
      expect(joinLines()).toEqual(FORM);
    },
  );
  test('[SHARING-133.1] [SHARING-124.1] does not read again by itself when the API refuses the read for too many requests and says how long to wait', async () => {
    brisbaneInvites();
    await startAs();
    apiAnswersNext(
      isRead,
      429,
      json({ error: 'too-many-requests', retryAfterMs: 1_000 }),
    );

    await openLink(BRISBANE_LINK);
    await secondsPass(5);
    await joinSettles();

    expect(joinLines()).toEqual([WENT_WRONG, 'Try Again']);
    expect(reads()).toHaveLength(1);

    await send('Try Again');
    expect(joinLines()).toEqual(FORM);
  });
});

// Sending the request

describe('SHARING-134.1', () => {
  test('[SHARING-134.1] makes the identity, registers and sends the request, in that order, on a new phone', async () => {
    brisbaneInvites();
    await startAs();

    await requested();

    expect(received().map(({ method, path }) => `${method} ${path}`)).toEqual([
      `GET /invites/${CODE_A}`,
      'POST /devices',
      `PUT /invites/${CODE_A}/request`,
    ]);
    const [, registration, sending] = received();
    expect(sending.deviceId).toBe(registration.deviceId);
    expect(joinLines()[0]).toBe(WAITING);
    expect(
      secureStoreEntries().filter(({ key }) =>
        key.includes(registration.deviceId!),
      ),
    ).toHaveLength(1);
    expect(requestsOnApi(CODE_A).map(({ deviceId }) => deviceId)).toEqual([
      registration.deviceId,
    ]);
  });

  test('[SHARING-134.1] does not register again on a phone that has an identity', async () => {
    brisbaneInvites();
    tokyoInvites();
    await startAs();
    await requested(TOKYO_LINK);
    await closeJoin();

    await requested();

    expect(registrationsReceived()).toHaveLength(1);
    expect(sendings().map(({ deviceId }) => deviceId)).toEqual([
      registrationsReceived()[0].deviceId,
      registrationsReceived()[0].deviceId,
    ]);
  });

  test('[SHARING-134.1] shows only Sending request…, with the request already in its local data, until the API has answered', async () => {
    brisbaneInvites();
    await startAs();
    await openLink(BRISBANE_LINK);
    const answer = keepAnswersBack(isSending);

    await pressInJoin(SEND);
    await until(() => sendings().length === 1, 'the request');

    expect(joinLines()).toEqual([SENDING]);
    expect(rowsWith(CODE_A)).toHaveLength(1);

    await answer();
    await joinSettles();
    expect(joinLines()).toEqual(WAITING_FOR_BRISBANE);
  });

  test('[SHARING-134.1] stores the request with its secret, group, trimmed name and picked member: after a restart it sends the same one', async () => {
    brisbaneInvites();
    let app = await startAs();
    await openLink(BRISBANE_LINK);
    await typeName(' Dana K. ');
    await pressInJoin('Blake');
    goOffline();
    await send();
    await closeJoin();
    expect(rowsWith(CODE_A)).toHaveLength(1);

    app = await restart(app);
    setClock(T);
    expect(app).toBeDefined();
    goOnline();
    await tapTab('Groups');
    await openRequest('Brisbane');
    await send('Try Again');

    expect(joinLines()).toEqual(WAITING_FOR_BRISBANE);
    expect(sendings()).toHaveLength(1);
    expect(lastRequest(S)).toMatchObject({
      name: 'Dana K.',
      memberId: BLAKE_ID,
    });
    expect(rowsWith(CODE_A)).toHaveLength(1);
  });

  test('[SHARING-134.1] marks the request as sent, without opening Join Group again, when the answer comes after it was closed', async () => {
    brisbaneInvites();
    await startAs();
    await openLink(BRISBANE_LINK);
    const answer = keepAnswersBack(isSending);
    await pressInJoin(SEND);
    await until(() => sendings().length === 1, 'the request');

    await closeJoin();
    await answer();
    await settle();

    expect(isOpen(TITLE)).toBe(false);
    await tapTab('Groups');
    expect(requestCard('Brisbane')).toBeOnTheScreen();
    expect(screen.getByText('Waiting for approval')).toBeOnTheScreen();
    expect(screen.queryByText('Not sent')).toBeNull();
  });

  test("[SHARING-134.1] leaves Join Group on another group's form when the answer comes after its link arrived", async () => {
    brisbaneInvites();
    tokyoInvites();
    await startAs();
    await openLink(BRISBANE_LINK);
    const answer = keepAnswersBack(isSending);
    await pressInJoin(SEND);
    await until(() => sendings().length === 1, 'the request');

    await openLink(TOKYO_LINK);
    expect(joinLines()[0]).toBe('Tokyo');
    await answer();
    await settle();

    expect(joinLines()[0]).toBe('Tokyo');
    expect(joinLines()).toContain(SEND);
    await closeJoin();
    await tapTab('Groups');
    expect(requestCard('Brisbane')).toBeOnTheScreen();
    expect(screen.getByText('Waiting for approval')).toBeOnTheScreen();
  });
});

describe('SHARING-135.1', () => {
  test('[SHARING-135.1] sends the name, no member, the user ID and the box key, encrypted with the key of the secret and a nonce from expo-crypto', async () => {
    brisbaneInvites();
    await startAs();

    await requested();

    const [sending] = sendings();
    expect(
      Object.keys(JSON.parse(Buffer.from(sending.body).toString())),
    ).toEqual(['request']);
    const plaintext = openedRequest(sending, S)!;
    const said = lastRequest();
    const object = `{"name":"Dana","memberId":null,"userId":"${said.userId}","boxKey":"${said.boxKey}"}`;
    expect(plaintext).toBe(object.padEnd(256, ' '));
    expect(sentRequest(sending)).toHaveLength(297);
    expect(said.userId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(rowsWith(said.userId)).not.toEqual([]);
    expect(said.boxKey).toMatch(/^[0-9a-f]{64}$/);
    const ciphertext = sentRequest(sending);
    expect(ciphertext[0]).toBe(0x01);
    expect(drewFromTheRandomSource(ciphertext.subarray(1, 25))).toBe(true);
  });

  test("[SHARING-135.1] names the picked member by its ID, under the applicant's name", async () => {
    brisbaneInvites();
    await startAs();
    await openLink(BRISBANE_LINK);
    await pressInJoin('Casey');

    await send();

    expect(lastRequest()).toMatchObject({ name: 'Dana', memberId: CASEY_ID });
    expect(sentRequest(sendings()[0])).toHaveLength(297);
  });

  test.each([
    [105, 256, false],
    [106, 512, true],
    [500, 768, true],
  ])(
    '[SHARING-135.1] pads the request for a new member named with %i letters to %i bytes',
    async (letters, bytes, padded) => {
      brisbaneInvites();
      await startAs();
      await openLink(BRISBANE_LINK);
      await typeName('a'.repeat(letters));

      await send();

      const plaintext = openedRequest(sendings()[0], S)!;
      expect(Buffer.byteLength(plaintext, 'utf8')).toBe(bytes);
      expect(plaintext.endsWith(' ')).toBe(padded);
      expect(plaintext.trimEnd().endsWith('"}')).toBe(true);
      expect(/^ *$/.test(plaintext.slice(plaintext.trimEnd().length))).toBe(
        true,
      );
      expect(lastRequest().name).toBe('a'.repeat(letters));
    },
  );

  test('[SHARING-135.1] binds the request to the invite and to the device: it opens for no other code or device ID', async () => {
    brisbaneInvites();
    await startAs();

    await requested();

    const [sending] = sendings();
    expect(openedRequest(sending, S)).toBeDefined();
    expect(openedRequest(sending, S, { code: CODE_B })).toBeUndefined();
    expect(
      openedRequest(sending, S, {
        deviceId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      }),
    ).toBeUndefined();
    expect(openedRequest(sending, S2)).toBeUndefined();
  });

  test('[SHARING-135.1] encrypts the same request again with a new nonce when it is sent again', async () => {
    brisbaneInvites();
    await startAs();
    await openLink(BRISBANE_LINK);
    apiLosesNextAnswer(isSending);
    await send();

    await send('Try Again');

    const [first, second] = sendings();
    expect(sendings()).toHaveLength(2);
    expect(openedRequest(second, S)).toBe(openedRequest(first, S));
    expect(sentRequest(second).subarray(1, 25)).not.toEqual(
      sentRequest(first).subarray(1, 25),
    );
  });
});

describe('SHARING-136.1', () => {
  const SEED = Uint8Array.from({ length: 32 }, (_, index) => index);
  const BOX_SECRET = fromHex(
    'e7ae1fd80468c3fe2fb3fd20bbaf65a290e1e910a794db36f1ad02b5442aaa66',
  );

  test('[SHARING-136.1] derives the box key from the seed with a purpose of its own', async () => {
    brisbaneInvites();
    await startAs();
    nextSeedIs(SEED);

    await requested();

    expect(lastRequest().boxKey).toBe(
      'bc908a559c76aef30842db38b5e1844f63847c087cf94b793fe477da10d44e75',
    );
    expect(
      JSON.parse(Buffer.from(registrationsReceived()[0].body).toString()),
    ).toEqual({
      publicKey:
        '6fd0e31e547724487390b224a27934039e75568c032ed392a162b0537e9217f8',
    });
  });

  test('[SHARING-136.1] keeps the box secret key out of its local data and out of every request', async () => {
    brisbaneInvites();
    await startAs();
    nextSeedIs(SEED);

    await requested();

    expect(sendings()).toHaveLength(1);
    expect(localDataHolds(BOX_SECRET)).toBe(false);
    expect(requestsHold(BOX_SECRET)).toBe(false);
  });
});

test('[SHARING-137.1] puts neither the secret, a key derived from it, a name nor an ID in the clear in any request', async () => {
  brisbaneInvites();
  await startAs();
  await openLink(BRISBANE_LINK);
  await typeName('Dana K.');
  await pressInJoin('Casey');
  await send();
  const { userId } = lastRequest();

  await cancelRequest();
  await expectClosed(TITLE);

  expect(cancellations()).toHaveLength(1);
  const secret = new Uint8Array(Buffer.from(S, 'base64url'));
  for (const bytes of [secret, cardKeyOf(S), requestKeyOf(S)]) {
    expect(requestsHold(bytes)).toBe(false);
  }
  for (const text of ['Dana K.', 'Brisbane', 'Casey', CASEY_ID, userId]) {
    expect(requestsHold(text)).toBe(false);
  }
});

test('[SHARING-138.1] shows Waiting for Approval, the group, what happens next and Cancel Request, under the same title bar', async () => {
  brisbaneInvites();
  await startAs();

  await requested();

  expect(joinLines()).toEqual(WAITING_FOR_BRISBANE);
  expect(joinButton(CANCEL)).toBeOnTheScreen();
  expect(isOpen(TITLE)).toBe(true);
});

describe('SHARING-139.2', () => {
  test('[SHARING-139.2] keeps the request as not sent, and says to connect, when there is no network', async () => {
    brisbaneInvites();
    await startAs();
    await openLink(BRISBANE_LINK);
    goOffline();

    await send();

    expect(joinLines()).toEqual([
      NOT_SENT,
      NOT_SENT_OFFLINE,
      'Try Again',
      CANCEL,
    ]);
    expect(rowsWith(CODE_A)).toHaveLength(1);
    expect(requestsOnApi(CODE_A)).toEqual([]);
  });

  test('[SHARING-139.2] sends the same request on Try Again once there is a network', async () => {
    brisbaneInvites();
    await startAs();
    await openLink(BRISBANE_LINK);
    await pressInJoin('Casey');
    goOffline();
    await send();
    goOnline();

    await send('Try Again');

    expect(joinLines()).toEqual(WAITING_FOR_BRISBANE);
    expect(sendings()).toHaveLength(1);
    expect(lastRequest()).toMatchObject({ name: 'Dana', memberId: CASEY_ID });
    expect(rowsWith(CODE_A)).toHaveLength(1);
  });

  test('[SHARING-139.2] sends the request again under the same path when only the answer was lost', async () => {
    brisbaneInvites();
    await startAs();
    await openLink(BRISBANE_LINK);
    apiLosesNextAnswer(isSending);

    await send();

    expect(joinLines()).toEqual([
      NOT_SENT,
      NOT_SENT_OFFLINE,
      'Try Again',
      CANCEL,
    ]);
    expect(requestsOnApi(CODE_A)).toHaveLength(1);

    await send('Try Again');

    expect(sendings()).toHaveLength(2);
    expect(sendings()[1].path).toBe(sendings()[0].path);
    expect(requestsOnApi(CODE_A)).toHaveLength(1);
    expect(joinLines()).toEqual(WAITING_FOR_BRISBANE);
  });

  test('[SHARING-139.2] says something went wrong when the request is refused for too many requests twice', async () => {
    brisbaneInvites();
    await startAs();
    await openLink(BRISBANE_LINK);
    for (let times = 0; times < 2; times += 1) {
      apiRefusesNext(isSending, {
        error: 'too-many-requests',
        retryAfterMs: 1_000,
      });
    }

    await pressInJoin(SEND);
    await until(() => sendings().length === 1, 'the request');
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1_000);
    });
    await joinSettles();

    expect(joinLines()).toEqual([NOT_SENT, WENT_WRONG, 'Try Again', CANCEL]);
    expect(rowsWith(CODE_A)).toHaveLength(1);
  });

  test.each([
    ['a 500', 500, 'Internal Server Error'],
    ['a 404 with no reason', 404, '404 Not Found'],
    ['a 200 that does not name the code', 200, '{}'],
  ])(
    '[SHARING-139.2] says something went wrong, and keeps the request, when the API answers it with %s',
    async (_, status, body) => {
      brisbaneInvites();
      await startAs();
      await openLink(BRISBANE_LINK);
      apiAnswersNext(isSending, status, body);

      await send();

      expect(joinLines()).toEqual([NOT_SENT, WENT_WRONG, 'Try Again', CANCEL]);
      expect(rowsWith(CODE_A)).toHaveLength(1);
    },
  );

  test('[SHARING-139.2] says something went wrong, and keeps the request, when the phone cannot register', async () => {
    brisbaneInvites();
    await startAs();
    await openLink(BRISBANE_LINK);
    apiRefusesNext('registration', { error: 'too-many-registrations' });

    await send();

    expect(joinLines()).toEqual([NOT_SENT, WENT_WRONG, 'Try Again', CANCEL]);
    expect(sendings()).toEqual([]);
    expect(rowsWith(CODE_A)).toHaveLength(1);
  });

  test('[SHARING-139.2] keeps the request as not sent when the secure store cannot be read, and sends it on Try Again once it can', async () => {
    brisbaneInvites();
    tokyoInvites();
    await startAs();
    await requested(TOKYO_LINK);
    await closeJoin();
    await openLink(BRISBANE_LINK);
    failSecureStoreReads();

    await send();

    expect(joinLines()).toEqual([NOT_SENT, WENT_WRONG, 'Try Again', CANCEL]);
    expect(sendings()).toHaveLength(1);
    expect(rowsWith(CODE_A)).toHaveLength(1);

    secureStoreWorks();
    await send('Try Again');

    expect(joinLines()).toEqual(WAITING_FOR_BRISBANE);
    expect(sendings()).toHaveLength(2);
  });

  test('[SHARING-139.2] keeps the request as not sent when the API took it and the phone could not record that, and sends it again on Try Again', async () => {
    brisbaneInvites();
    await startAs();
    await openLink(BRISBANE_LINK);
    afterTheAnswerTo(isSending, failWrites);

    await send();

    allowWrites();
    expect(joinLines()).toEqual([NOT_SENT, WENT_WRONG, 'Try Again', CANCEL]);
    expect(requestsOnApi(CODE_A)).toHaveLength(1);

    await send('Try Again');

    expect(joinLines()).toEqual(WAITING_FOR_BRISBANE);
    expect(sendings()).toHaveLength(2);
    expect(requestsOnApi(CODE_A)).toHaveLength(1);
  });

  test('[SHARING-139.2] shows a request that was not sent without the reason, and does not send it by itself, after a restart', async () => {
    brisbaneInvites();
    let app = await startAs();
    await openLink(BRISBANE_LINK);
    goOffline();
    await send();
    await closeJoin();
    goOnline();
    const sent = sendings().length;

    app = await restart(app);
    setClock(T);
    expect(app).toBeDefined();
    expect(sendings()).toHaveLength(sent);

    await openLink(BRISBANE_LINK);

    expect(joinLines()).toEqual(UNSENT);
    expect(sendings()).toHaveLength(sent);
  });
});

describe('SHARING-140.2', () => {
  test('[SHARING-140.2] says the link cannot be used, and keeps no request, when the invite was revoked before the request was sent', async () => {
    brisbaneInvites();
    await startAs();
    await openLink(BRISBANE_LINK);
    revokedByAnotherPhone(CODE_A);

    await send();

    expect(joinLines()).toEqual([CANNOT_USE]);
    expect(rowsWith(CODE_A)).toEqual([]);
    await closeJoin();
    await tapTab('Groups');
    expect(requestCard('Brisbane')).toBeUndefined();
  });

  test('[SHARING-140.2] says too many people are waiting, and keeps no request, when the invite is full', async () => {
    brisbaneInvites();
    await startAs();
    await openLink(BRISBANE_LINK);
    requestsFromOthers(CODE_A, 20);

    await send();

    expect(joinLines()).toEqual([TOO_MANY]);
    expect(rowsWith(CODE_A)).toEqual([]);
  });

  test('[SHARING-140.2] asks what became of the request, then says the phone is already in the group and keeps no request, when the API says it is a member both times', async () => {
    brisbaneInvites();
    await startAs();
    await openLink(BRISBANE_LINK);
    apiAnswersNext(isSending, 409, json({ error: 'already-a-member' }));
    apiAnswersNext(isAsking, 409, json({ error: 'already-a-member' }));

    await send();

    expect(received().filter(isAsking)).toHaveLength(1);
    expect(joinLines()).toEqual([ALREADY_IN]);
    expect(rowsWith(CODE_A)).toEqual([]);
  });

  test.each<[string, () => void, string]>([
    ['gets no answer', () => apiLosesNextAnswer(isAsking), NOT_SENT_OFFLINE],
    [
      'is answered with an error',
      () => apiAnswersNext(isAsking, 500, ''),
      WENT_WRONG,
    ],
  ])(
    '[SHARING-140.2] keeps the request as not sent when the question that follows a refusal as a member %s: it may have been approved',
    async (_case, fail, why) => {
      brisbaneInvites();
      await startAs();
      await openLink(BRISBANE_LINK);
      apiAnswersNext(isSending, 409, json({ error: 'already-a-member' }));
      fail();

      await send();

      await waitFor(() =>
        expect(joinLines()).toEqual([NOT_SENT, why, 'Try Again', CANCEL]),
      );
      expect(rowsWith(CODE_A)).toHaveLength(1);
      await closeJoin();
      await tapTab('Groups');
      expect(requestCard('Brisbane')).toBeDefined();
    },
  );

  test.each([
    ['written wrongly', 400, { error: 'request' }],
    ['too large', 413, { error: 'too-large' }],
  ])(
    '[SHARING-140.2] says something went wrong, and keeps no request, when the API refuses it as %s',
    async (_, status, refusal) => {
      brisbaneInvites();
      await startAs();
      await openLink(BRISBANE_LINK);
      apiAnswersNext(isSending, status, json(refusal));

      await send();

      expect(joinLines()).toEqual([WENT_WRONG]);
      expect(rowsWith(CODE_A)).toEqual([]);
    },
  );
});

describe('SHARING-141.1', () => {
  test('[SHARING-141.1] stays on the form and says the phone cannot join when it has lost its authorization', async () => {
    brisbaneInvites();
    tokyoInvites();
    await startAs();
    await requested(TOKYO_LINK);
    await closeJoin();
    loseTheSeed();
    await openLink(BRISBANE_LINK);
    const sent = received().length;

    await pressInJoin(SEND);

    expect(alertsShown().at(-1)).toEqual([UNABLE_TO_SEND, CANNOT_JOIN]);
    expect(received()).toHaveLength(sent);
    expect(rowsWith(CODE_A)).toEqual([]);
    expect(joinLines()).toEqual(FORM);
  });

  test('[SHARING-141.1] stays on the form, as it was filled in, when the secure store cannot take the identity', async () => {
    brisbaneInvites();
    await startAs();
    await openLink(BRISBANE_LINK);
    await typeName('Dana K.');
    await pressInJoin('Casey');
    failSecureStoreWrites();

    await pressInJoin(SEND);

    expect(alertsShown().at(-1)).toEqual([UNABLE_TO_SEND, WENT_WRONG]);
    expect(received()).toHaveLength(1);
    expect(secureStoreEntries()).toEqual([]);
    expect(rowsWith(CODE_A)).toEqual([]);
    expect(nameField().props.value).toBe('Dana K.');
    expect(chosen()).toEqual(['Casey']);

    secureStoreWorks();
    await send();

    expect(joinLines()).toEqual(WAITING_FOR_BRISBANE);
    expect(lastRequest()).toMatchObject({
      name: 'Dana K.',
      memberId: CASEY_ID,
    });
  });

  test('[SHARING-141.1] keeps a request that was not sent, and says the phone cannot join, when Try Again finds the authorization lost', async () => {
    brisbaneInvites();
    await startAs();
    await openLink(BRISBANE_LINK);
    goOffline();
    await send();
    await closeJoin();
    loseTheSeed();
    goOnline();
    await openLink(BRISBANE_LINK);
    expect(joinLines()).toEqual(UNSENT);
    const sent = received().length;

    await pressInJoin('Try Again');
    await joinSettles();

    expect(alertsShown().at(-1)).toEqual([UNABLE_TO_SEND, CANNOT_JOIN]);
    expect(received()).toHaveLength(sent);
    expect(joinLines()).toEqual(UNSENT);
    expect(rowsWith(CODE_A)).toHaveLength(1);
  });

  test('[SHARING-141.1] stays on the form when the request cannot be stored on the phone', async () => {
    brisbaneInvites();
    tokyoInvites();
    await startAs();
    await requested(TOKYO_LINK);
    await closeJoin();
    await openLink(BRISBANE_LINK);
    failWrites();

    await pressInJoin(SEND);

    allowWrites();
    expect(alertsShown().at(-1)).toEqual([UNABLE_TO_SEND, WENT_WRONG]);
    expect(sendings()).toHaveLength(1);
    expect(rowsWith(CODE_A)).toEqual([]);
    expect(joinLines()).toEqual(FORM);
  });
});

// Cancelling

describe('SHARING-142.1', () => {
  test('[SHARING-142.1] asks first, then cancels on the API, removes the request and closes Join Group', async () => {
    brisbaneInvites();
    await startAs();
    await requested();

    await pressInJoin(CANCEL);

    expect(alertsShown().at(-1)).toEqual(CANCEL_ALERT);
    expect(lastAlertButtonStyles()).toEqual([
      ['Keep Waiting', 'cancel'],
      [CANCEL, 'destructive'],
    ]);
    expect(cancellations()).toEqual([]);

    await pressAlertButton(CANCEL);
    await expectClosed(TITLE);

    const [cancellation] = cancellations();
    expect(cancellations()).toHaveLength(1);
    expect(cancellation.path).toBe(`/invites/${CODE_A}/request`);
    expect(cancellation.body).toHaveLength(0);
    expect(requestsOnApi(CODE_A)).toEqual([]);
    expect(rowsWith(CODE_A)).toEqual([]);
    await tapTab('Groups');
    expect(requestCard('Brisbane')).toBeUndefined();
  });

  test('[SHARING-142.1] shows the form again for the link of a request that was cancelled', async () => {
    brisbaneInvites();
    await startAs();
    await requested();
    await cancelRequest();
    await expectClosed(TITLE);

    await openLink(BRISBANE_LINK);

    expect(joinLines()).toEqual(FORM);
  });

  test('[SHARING-142.1] does nothing on Keep Waiting', async () => {
    brisbaneInvites();
    await startAs();
    await requested();
    await pressInJoin(CANCEL);

    await pressAlertButton('Keep Waiting');

    expect(cancellations()).toEqual([]);
    expect(joinLines()).toEqual(WAITING_FOR_BRISBANE);
    expect(rowsWith(CODE_A)).toHaveLength(1);
  });

  test('[SHARING-142.1] sends one cancellation when Cancel Request is confirmed again before the first has an answer', async () => {
    brisbaneInvites();
    await startAs();
    await requested();
    const answer = keepAnswersBack(isCancelling);
    await cancelRequest();
    await until(() => cancellations().length === 1, 'the cancellation');

    // A second confirmation is there to press only if the app asks again.
    const shown = alertsShown().length;
    if (joinButton(CANCEL) !== undefined) await pressInJoin(CANCEL);
    if (alertsShown().length > shown) await pressAlertButton(CANCEL);
    await settle();

    expect(cancellations()).toHaveLength(1);

    await answer();
    await expectClosed(TITLE);

    expect(cancellations()).toHaveLength(1);
    expect(rowsWith(CODE_A)).toEqual([]);
  });

  test.each(['its link', 'its card'])(
    '[SHARING-142.1] waits for the same cancellation, and closes Join Group when it succeeds, after the request was closed and opened again from %s',
    async (from) => {
      brisbaneInvites();
      await startAs();
      await requested();
      const answer = keepAnswersBack(isCancelling);
      await cancelRequest();
      await until(() => cancellations().length === 1, 'the cancellation');
      await closeJoin();

      if (from === 'its link') {
        await receiveLink(BRISBANE_LINK);
      } else {
        await tapTab('Groups');
        await fireEvent.press(requestCard('Brisbane')!);
      }
      await expectOpen(TITLE);
      await settle();

      expect(joinLines()).toEqual(WAITING_FOR_BRISBANE);
      expect(cancellations()).toHaveLength(1);

      await answer();
      await expectClosed(TITLE);

      expect(cancellations()).toHaveLength(1);
      expect(rowsWith(CODE_A)).toEqual([]);
      expect(requestsOnApi(CODE_A)).toEqual([]);
      await tapTab('Groups');
      expect(requestCard('Brisbane')).toBeUndefined();
    },
  );

  test('[SHARING-142.1] sends nothing on Try Again while a cancellation has no answer', async () => {
    brisbaneInvites();
    await startAs();
    await openLink(BRISBANE_LINK);
    apiLosesNextAnswer(isSending);
    await send();
    const answer = keepAnswersBack(isCancelling);
    await cancelRequest();
    await until(() => cancellations().length === 1, 'the cancellation');

    if (joinButton('Try Again') !== undefined) await pressInJoin('Try Again');
    await settle();

    expect(sendings()).toHaveLength(1);

    await answer();
    await settle();

    expect(isOpen(TITLE)).toBe(false);
    expect(rowsWith(CODE_A)).toEqual([]);
    expect(requestsOnApi(CODE_A)).toEqual([]);
  });

  test('[SHARING-142.1] asks the API to cancel a request it may have taken, though the phone holds it as not sent', async () => {
    brisbaneInvites();
    await startAs();
    await openLink(BRISBANE_LINK);
    apiLosesNextAnswer(isSending);
    await send();
    expect(requestsOnApi(CODE_A)).toHaveLength(1);

    await cancelRequest();
    await expectClosed(TITLE);

    expect(cancellations()).toHaveLength(1);
    expect(requestsOnApi(CODE_A)).toEqual([]);
    expect(rowsWith(CODE_A)).toEqual([]);
  });
});

describe('SHARING-143.2', () => {
  test('[SHARING-143.2] keeps the request and says to connect when there is no network', async () => {
    brisbaneInvites();
    await startAs();
    await requested();
    goOffline();

    await cancelRequest();

    expect(alertsShown().at(-1)).toEqual([UNABLE_TO_CANCEL, NOT_SENT_OFFLINE]);
    expect(joinLines()).toEqual(WAITING_FOR_BRISBANE);
    expect(rowsWith(CODE_A)).toHaveLength(1);
  });

  test('[SHARING-143.2] keeps the request and says something went wrong when the API answers with a 500', async () => {
    brisbaneInvites();
    await startAs();
    await requested();
    apiAnswersNext(isCancelling, 500, 'Internal Server Error');

    await cancelRequest();

    expect(alertsShown().at(-1)).toEqual([UNABLE_TO_CANCEL, WENT_WRONG]);
    expect(joinLines()).toEqual(WAITING_FOR_BRISBANE);
    expect(rowsWith(CODE_A)).toHaveLength(1);
  });

  test('[SHARING-143.2] keeps the request when the API cancelled it and the phone could not remove it, and removes it on the next try', async () => {
    brisbaneInvites();
    await startAs();
    await requested();
    afterTheAnswerTo(isCancelling, failWrites);

    await cancelRequest();

    allowWrites();
    expect(alertsShown().at(-1)).toEqual([UNABLE_TO_CANCEL, WENT_WRONG]);
    expect(joinLines()).toEqual(WAITING_FOR_BRISBANE);
    expect(rowsWith(CODE_A)).toHaveLength(1);

    await cancelRequest();
    await expectClosed(TITLE);

    expect(rowsWith(CODE_A)).toEqual([]);
  });

  test('[SHARING-143.2] shows no alert, and keeps the request, when a cancellation fails after Join Group was closed', async () => {
    brisbaneInvites();
    await startAs();
    await requested();
    apiAnswersNext(isCancelling, 500, 'Internal Server Error');
    const answer = keepAnswersBack(isCancelling);
    await cancelRequest();
    await until(() => cancellations().length === 1, 'the cancellation');
    await closeJoin();
    const shown = alertsShown().length;

    await answer();
    await settle();

    expect(alertsShown()).toHaveLength(shown);
    expect(isOpen(TITLE)).toBe(false);
    expect(rowsWith(CODE_A)).toHaveLength(1);
    await tapTab('Groups');
    expect(requestCard('Brisbane')).toBeOnTheScreen();
  });

  test('[SHARING-143.2] removes the request, and does not open Join Group again, when a cancellation succeeds after it was closed', async () => {
    brisbaneInvites();
    await startAs();
    await requested();
    const answer = keepAnswersBack(isCancelling);
    await cancelRequest();
    await until(() => cancellations().length === 1, 'the cancellation');
    await closeJoin();
    const shown = alertsShown().length;

    await answer();
    await settle();

    expect(alertsShown()).toHaveLength(shown);
    expect(isOpen(TITLE)).toBe(false);
    expect(rowsWith(CODE_A)).toEqual([]);
    expect(requestsOnApi(CODE_A)).toEqual([]);
  });

  test.each(['its link', 'its card'])(
    '[SHARING-143.2] shows the alert, and keeps the request, when a cancellation fails after the request was closed and opened again from %s',
    async (from) => {
      brisbaneInvites();
      await startAs();
      await requested();
      apiAnswersNext(isCancelling, 500, 'Internal Server Error');
      const answer = keepAnswersBack(isCancelling);
      await cancelRequest();
      await until(() => cancellations().length === 1, 'the cancellation');
      await closeJoin();

      if (from === 'its link') {
        await receiveLink(BRISBANE_LINK);
      } else {
        await tapTab('Groups');
        await fireEvent.press(requestCard('Brisbane')!);
      }
      await expectOpen(TITLE);
      await settle();
      const shown = alertsShown().length;

      await answer();
      await settle();

      expect(alertsShown()).toHaveLength(shown + 1);
      expect(alertsShown().at(-1)).toEqual([UNABLE_TO_CANCEL, WENT_WRONG]);
      expect(joinLines()).toEqual(WAITING_FOR_BRISBANE);
      expect(rowsWith(CODE_A)).toHaveLength(1);
    },
  );

  test.each([
    ['fails', true],
    ['succeeds', false],
  ])(
    "[SHARING-143.2] leaves Join Group on another group's form, with no alert, when a cancellation %s after its link arrived",
    async (_, fails) => {
      brisbaneInvites();
      tokyoInvites();
      await startAs();
      await requested();
      if (fails) apiAnswersNext(isCancelling, 500, 'Internal Server Error');
      const answer = keepAnswersBack(isCancelling);
      await cancelRequest();
      await until(() => cancellations().length === 1, 'the cancellation');
      await openLink(TOKYO_LINK);
      const shown = alertsShown().length;

      await answer();
      await settle();

      expect(alertsShown()).toHaveLength(shown);
      expect(joinLines()[0]).toBe('Tokyo');
      expect(joinLines()).toContain(SEND);
      expect(rowsWith(CODE_A)).toHaveLength(fails ? 1 : 0);
    },
  );

  test('[SHARING-143.2] removes the request without asking the API on a phone that has lost its authorization', async () => {
    brisbaneInvites();
    await startAs();
    await requested();
    loseTheSeed();

    await cancelRequest();
    await expectClosed(TITLE);

    expect(cancellations()).toEqual([]);
    expect(rowsWith(CODE_A)).toEqual([]);
  });
});

// Waiting

describe('SHARING-144.2', () => {
  test('[SHARING-144.2] records as usual while a request waits, and asks the API nothing for it', async () => {
    brisbaneInvites();
    await startAs();
    await requested();
    await closeJoin();
    const sent = asked();

    await addExpense({ title: 'Coffee run', amount: '8.75' });
    await tapTab('Groups');
    await createGroup('Paris');
    await addGroupExpense({
      group: 'Paris',
      title: 'Dinner',
      amount: '30.00',
      date: '2026-10-30',
      category: 'Food & Dining',
      payer: 'Dana (You)',
      sharers: ['Dana (You)'],
    });

    expect(rowsWith('Coffee run')).not.toEqual([]);
    expect(rowsWith('Dinner')).not.toEqual([]);
    expect(asked()).toBe(sent);
    expect(rowsWith(CODE_A)).toHaveLength(1);
  });

  test('[SHARING-144.2] still holds the request after a restart, and neither sends nor cancels it as it starts', async () => {
    brisbaneInvites();
    let app = await startAs();
    await requested();
    await closeJoin();
    const sent = sendings().length;

    app = await restart(app);
    setClock(T);
    expect(app).toBeDefined();
    await tapTab('Groups');
    await openRequest('Brisbane');

    expect(joinLines()).toEqual(WAITING_FOR_BRISBANE);
    expect(sendings()).toHaveLength(sent);
    expect(cancellations()).toEqual([]);
  });

  test('[SHARING-144.2] holds a request for each of two groups, and shows each under its own link', async () => {
    brisbaneInvites();
    tokyoInvites();
    await startAs();
    await requested();
    await closeJoin();
    await requested(TOKYO_LINK);
    await closeJoin();

    expect(rowsWith(CODE_A)).toHaveLength(1);
    expect(rowsWith(CODE_B)).toHaveLength(1);

    await openLink(BRISBANE_LINK);

    expect(joinLines()).toEqual(WAITING_FOR_BRISBANE);
  });
});

describe('SHARING-145.1', () => {
  test('[SHARING-145.1] gives up reading an invite that has had no answer for 60 seconds, and reads it again on Try Again', async () => {
    brisbaneInvites();
    await startAs();
    const answer = keepAnswersBack(isRead);
    await receiveLink(BRISBANE_LINK);
    await expectOpen(TITLE);
    await until(() => reads().length === 1, 'the read');

    await secondsPass(50);

    expect(joinLines()).toEqual([LOADING]);

    await secondsPass(15);
    await joinSettles();

    expect(joinLines()).toEqual([OFFLINE, 'Try Again']);

    await answer();
    await settle();
    expect(joinLines()).toEqual([OFFLINE, 'Try Again']);

    await send('Try Again');

    expect(reads()).toHaveLength(2);
    expect(joinLines()).toEqual(FORM);
  });

  test('[SHARING-145.1] does not use the answer about a request that comes after it gave the request up', async () => {
    brisbaneInvites();
    await startAs();
    await openLink(BRISBANE_LINK);
    const answer = keepAnswersBack(isSending);
    await pressInJoin(SEND);
    await until(() => sendings().length === 1, 'the request');

    await secondsPass(65);
    await joinSettles();

    const unsent = [NOT_SENT, NOT_SENT_OFFLINE, 'Try Again', CANCEL];
    expect(joinLines()).toEqual(unsent);

    await answer();
    await settle();

    expect(joinLines()).toEqual(unsent);
    await closeJoin();
    await tapTab('Groups');
    expect(requestCard('Brisbane')).toBeOnTheScreen();
    expect(screen.getByText('Not sent')).toBeOnTheScreen();
  });

  test('[SHARING-145.1] gives up a registration that has had no answer for 60 seconds, and the next try does not wait for it', async () => {
    brisbaneInvites();
    await startAs();
    await openLink(BRISBANE_LINK);
    let registrations = 0;
    // Only the first registration is kept back, and it never gets its answer.
    keepAnswersBack(
      (request) => isRegistering(request) && (registrations += 1) === 1,
    );
    await pressInJoin(SEND);
    await until(() => registrationsReceived().length === 1, 'the registration');

    await secondsPass(65);
    await joinSettles();

    expect(joinLines()).toEqual([
      NOT_SENT,
      NOT_SENT_OFFLINE,
      'Try Again',
      CANCEL,
    ]);
    expect(sendings()).toEqual([]);

    await send('Try Again');

    expect(registrationsReceived()).toHaveLength(2);
    expect(sendings()).toHaveLength(1);
    expect(joinLines()).toEqual(WAITING_FOR_BRISBANE);
  });

  test('[SHARING-145.1] gives up a cancellation that has had no answer for 60 seconds, says to connect and keeps the request', async () => {
    brisbaneInvites();
    await startAs();
    await requested();
    keepAnswersBack(isCancelling);
    await cancelRequest();
    await until(() => cancellations().length === 1, 'the cancellation');
    const shown = alertsShown().length;

    await secondsPass(50);

    expect(alertsShown()).toHaveLength(shown);

    await secondsPass(15);
    await until(() => alertsShown().length > shown, 'the alert');

    expect(alertsShown().at(-1)).toEqual([UNABLE_TO_CANCEL, NOT_SENT_OFFLINE]);
    expect(joinLines()).toEqual(WAITING_FOR_BRISBANE);
    expect(rowsWith(CODE_A)).toHaveLength(1);
  });
});

// Another link while Join Group is open

describe('SHARING-73.2', () => {
  test('[SHARING-73.2] keeps the form as it was filled in, and reads nothing again, when the same link arrives', async () => {
    brisbaneInvites();
    await startAs();
    await openLink(BRISBANE_LINK);
    await typeName('Dana K.');
    await pressInJoin('Casey');

    await openLink(BRISBANE_LINK);

    expect(nameField().props.value).toBe('Dana K.');
    expect(chosen()).toEqual(['Casey']);
    expect(reads()).toHaveLength(1);
  });

  test("[SHARING-73.2] shows the other group's form, as new, when another group's link arrives", async () => {
    brisbaneInvites();
    tokyoInvites();
    await startAs();
    await openLink(BRISBANE_LINK);
    await typeName('Dana K.');

    await openLink(TOKYO_LINK);

    expect(joinLines()[0]).toBe('Tokyo');
    expect(nameField().props.value).toBe('Dana');
    await closeJoin();
    expect(isOpen(TITLE)).toBe(false);
  });
});

// The Groups root

describe('GROUPS-108.2', () => {
  test('[GROUPS-108.2] shows a card for a request that waits, above the sentence about having no groups', async () => {
    brisbaneInvites();
    await startAs();
    await requested();
    await closeJoin();

    await tapTab('Groups');

    const card = requestCard('Brisbane')!;
    const sentence = screen.getByText(
      'No groups yet. Tap + to create a group.',
    );
    expect(card).toBeOnTheScreen();
    expect(screen.getByText('Waiting for approval')).toBeOnTheScreen();
    expect(sentence).toBeOnTheScreen();
    expect(inTreeOrder(card, sentence)).toBe(true);
  });

  test('[GROUPS-108.2] opens Join Group on the request when its card is pressed, over the Groups root', async () => {
    brisbaneInvites();
    await startAs();
    await requested();
    await closeJoin();
    await tapTab('Groups');
    const sent = sendings().length;

    await openRequest('Brisbane');

    expect(joinLines()).toEqual(WAITING_FOR_BRISBANE);
    expect(sendings()).toHaveLength(sent);

    await closeJoin();
    expect(selectedTab()).toBe('Groups');
  });

  test('[GROUPS-108.2] marks a request that was not sent, and opens it with Try Again and Cancel Request', async () => {
    brisbaneInvites();
    await startAs();
    await openLink(BRISBANE_LINK);
    goOffline();
    await send();
    await closeJoin();

    await tapTab('Groups');

    expect(requestCard('Brisbane')).toBeOnTheScreen();
    expect(screen.getByText('Not sent')).toBeOnTheScreen();
    expect(screen.queryByText('Waiting for approval')).toBeNull();

    await openRequest('Brisbane');

    expect(joinLines()).toEqual(UNSENT);
  });

  test('[GROUPS-108.2] lists the requests in the order they were stored, above the groups', async () => {
    brisbaneInvites();
    tokyoInvites();
    await startAs();
    await tapTab('Groups');
    await createGroup('Paris');
    await tapTab('Expenses');
    await requested();
    await closeJoin();
    await requested(TOKYO_LINK);
    await closeJoin();

    await tapTab('Groups');

    const names = [
      'Open request to join Brisbane',
      'Open request to join Tokyo',
      'Open Paris',
    ];
    expect(cardsAmong(names)).toEqual(names);
  });

  test('[GROUPS-108.2] has no card for a request that was cancelled, and none on a phone with no request', async () => {
    brisbaneInvites();
    await startAs();
    await tapTab('Groups');
    expect(requestCard('Brisbane')).toBeUndefined();
    await tapTab('Expenses');
    await requested();

    await cancelRequest();
    await expectClosed(TITLE);
    await tapTab('Groups');

    expect(requestCard('Brisbane')).toBeUndefined();
    expect(screen.queryByText('Waiting for approval')).toBeNull();
  });

  test('[GROUPS-108.2] still shows the card after a restart', async () => {
    brisbaneInvites();
    let app = await startAs();
    await requested();
    await closeJoin();

    app = await restart(app);
    setClock(T);
    expect(app).toBeDefined();
    await tapTab('Groups');

    expect(requestCard('Brisbane')).toBeOnTheScreen();
    expect(screen.getByText('Waiting for approval')).toBeOnTheScreen();
  });
});
