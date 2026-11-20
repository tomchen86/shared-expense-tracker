import { act, fireEvent, within } from '@testing-library/react-native';
import { restart, setPhoneClock } from './ledger-expense-app';
import { linesIn } from './ledger-expense-list-app';
import { addGroupExpense } from './ledger-group-expense-app';
import {
  addMember,
  alertsShown,
  barItems,
  expectClosed,
  expectOpen,
  isOpen,
  lastAlertButtons,
  membersButton,
  expectMembers,
  memberNameField,
  membersShown,
  openRenameMember,
  pressAlertButton,
  pressOnBar,
  removeMember,
  renameMember,
  screenOf,
  swipeDown,
} from './group-details-app';
import {
  API,
  T,
  apiAnswersNext,
  apiIsAhead,
  apiLosesNextAnswer,
  apiRefusesNext,
  drewFromTheRandomSource,
  failSecureStoreWrites,
  fetchCalls,
  forbiddenDraws,
  fromHex,
  goOffline,
  goOnline,
  received,
  registrationsReceived,
  removeSecureStoreEntry,
  requestsReceived,
  secureStoreEntries,
  secureStoreWorks,
  utf8,
  writeSecureStoreEntry,
} from './sharing-app';
import {
  CANNOT_SHARE,
  CREATING,
  EXPLANATION,
  INVITE_EXISTS,
  LINK,
  NAMES_TOO_LONG,
  OFFLINE,
  TOO_MANY_MEMBERS,
  WEEK,
  WENT_WRONG,
  afterTheAnswerTo,
  apiRequests,
  asked,
  cardKeyOf,
  closeInvite,
  codeIn,
  eachTestGetsAnInvitingPhone,
  groupKeys,
  groupOnApi,
  holdTheApi,
  invite,
  inviteButton,
  inviteByAnotherPhone,
  inviteLines,
  inviteOnApi,
  inviteRequests,
  invited,
  isCreateGroup,
  isPutInvite,
  isRegistering,
  isRevoke,
  keepAnswersBack,
  localDataHolds,
  openedCard,
  partsOf,
  pressInInvite,
  pressInvite,
  qrCodes,
  requestLines,
  requestsHold,
  secondsPass,
  sentCard,
  shared,
  shownLink,
  startAt,
  tryAgain,
  until,
} from './sharing-invite-app';
import { allowWrites, failWrites, settle } from './shell-appearance-app';
import { selectedTab } from './shell-tabs-app';
import {
  at,
  baseOf,
  created,
  eventsOf,
  groupId,
  leaveMembers,
  members,
  receive,
  renameGroupTo,
  setClock,
  showMembers,
  unsent,
} from './sync-app';

// Runs on iOS. Each test starts the whole app with Taylor saved as your name and the
// groups it names, none of them a shared ledger, on a phone with no device identity, at
// 2026-11-18T06:32:00Z (sharing-invite-app). The API behind `fetch` registers devices,
// creates groups and keeps invites as the specs say the real one does, and the tests read
// what it received.

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

eachTestGetsAnInvitingPhone('sharing-invite-');

const BRISBANE = { Brisbane: ['Casey', 'Blake'] };
const ALONE = { Brisbane: [] };
const TWO_GROUPS = { Brisbane: [], Tokyo: [] };

/** Another phone's invite: its code, its secret and the link they make. */
const CODE_B = 'AAECAwQFBgcICQoLDA0ODw';
const SECRET_B = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8';
const LINK_B = `${API}/i/${CODE_B}#${SECRET_B}`;

/** The first event of an invite another phone created. */
const inviteCreated = (
  code = CODE_B,
  expiresAtMs = T + WEEK,
  secret = SECRET_B,
  stamp = at(T + 1_000),
) => ({
  version: 1,
  stamp,
  type: 'invite',
  id: code,
  units: { link: { value: { secret, expiresAtMs } } },
});

/** The event with which another phone revokes an invite. */
const inviteRevoked = (code: string, stamp = at(T + 2_000)) => ({
  version: 1,
  stamp,
  type: 'invite',
  id: code,
  deleted: true,
});

/** This phone's device ID, as its requests name it. */
const deviceId = () => received()[0].deviceId!;

/** Closes Invite and Members, back on the Groups root. */
async function leaveInvite(group: string) {
  await closeInvite();
  await leaveMembers(group);
}

/** Invites to the group, and leaves for the Groups root; the link Invite showed. */
async function invitedAndLeft(group: string) {
  const link = await invited(group);
  await leaveInvite(group);
  return link;
}

/** What the last request that created an invite or replaced its card says, opened with `link`'s secret. */
const lastCard = (link: string) =>
  JSON.parse(openedCard(inviteRequests().at(-1)!, partsOf(link).secret)) as {
    name: string;
    members: { id: string; name: string; hasDevice: boolean }[];
  };

/** Renames your member, whose name is `from`, to `to` in the Members that is open. */
async function renameYouTo(to: string, from: string) {
  await openRenameMember(`${from} (You)`, from);
  await fireEvent.changeText(memberNameField(), to);
  await pressOnBar('Rename Member', 'Save');
  await expectClosed('Rename Member');
  await until(() => membersShown().includes(`${to} (You)`), 'the new name');
}

const waitForCards = (count: number) =>
  until(() => inviteRequests().length === count, `${count} cards to be sent`);

// Members

test('[GROUPS-106.1] shows Invite with Link above the member list of a group that is not archived, as a button with a chevron', async () => {
  await startAt(ALONE);

  await showMembers('Brisbane');

  expect(linesIn(screenOf('Members')).filter((line) => line !== '›')).toEqual([
    'Invite with Link',
    'Taylor (You)',
    'Add Member',
  ]);
  expect(
    within(membersButton('Invite with Link')).getByText('›'),
  ).toBeOnTheScreen();
  // It is no row of the member list.
  expect(membersShown()).toEqual(['Taylor (You)', 'Add Member']);
});

test('[GROUPS-106.1] keeps Invite with Link on top in a shared ledger that has 20 members', async () => {
  const others = Array.from(
    { length: 19 },
    (_, index) => `Member ${index + 1}`,
  );
  await startAt({ Brisbane: others });
  await invited('Brisbane');
  await closeInvite();

  const lines = linesIn(screenOf('Members')).filter((line) => line !== '›');

  expect(lines).toEqual([
    'Invite with Link',
    'Taylor (You)',
    ...others,
    'A shared group can have up to 20 members.',
  ]);
  expect(membersButton('Invite with Link')).toBeOnTheScreen();
});

// A group that never invited

test('[SHARING-90.1] sends nothing and makes no identity or key for a group nobody was invited to', async () => {
  let app = await startAt(BRISBANE);
  await addGroupExpense({
    group: 'Brisbane',
    title: 'Dinner',
    amount: '100.01',
    date: '2026-10-30',
    category: 'Food & Dining',
    payer: 'Casey',
    sharers: ['Blake', 'Taylor (You)', 'Casey'],
  });
  await renameGroupTo('Brisbane', 'Brissie');
  await showMembers('Brissie');
  await leaveMembers('Brissie');

  app = await restart(app);

  expect(app).toBeDefined();
  expect(fetchCalls()).toBe(0);
  expect(secureStoreEntries()).toEqual([]);
  expect(await unsent()).toEqual([]);
  // The control that would connect it is there.
  await showMembers('Brissie');
  expect(membersButton('Invite with Link')).toBeOnTheScreen();
});

test('[SHARING-90.1] sends nothing for a second group while only the first is a shared ledger', async () => {
  await startAt(TWO_GROUPS);
  await invitedAndLeft('Brisbane');
  const sent = asked();

  await showMembers('Tokyo');
  await addMember('Casey');
  await leaveMembers('Tokyo');
  await renameGroupTo('Tokyo', 'Kyoto');

  expect(asked()).toBe(sent);
  const tokyo = await groupId('Kyoto');
  expect(received().filter(({ path }) => path.includes(tokyo))).toEqual([]);
  expect(groupKeys()).toHaveLength(1);
  expect(groupKeys()[0].key).toBe(`group-key.${await groupId('Brisbane')}.1`);
  expect((await unsent()).filter((event) => event.groupId === tokyo)).toEqual(
    [],
  );
});

// Invite

test('[SHARING-91.1] opens Invite rising from the bottom over Members, with only Close', async () => {
  await startAt(ALONE);

  await invite('Brisbane');

  expect(['formSheet', 'pageSheet', 'modal']).toContain(
    screenOf('Invite').props.stackPresentation,
  );
  expect(barItems('Invite')).toEqual({ left: ['Close (plain)'], right: [] });
  expect(isOpen('Members')).toBe(true);
  expect(selectedTab()).toBe('Groups');
});

test('[SHARING-91.1] shows only Creating link… until the invite is ready, and can be closed meanwhile', async () => {
  await startAt(ALONE);
  const answer = holdTheApi();
  await showMembers('Brisbane');

  await fireEvent.press(membersButton('Invite with Link'));
  await expectOpen('Invite');

  expect(inviteLines()).toEqual([CREATING]);
  await closeInvite();
  expect(isOpen('Members')).toBe(true);
  // Let the request the app was waiting for end before the test does.
  await act(async () => answer());
});

test('[SHARING-91.1] prepares one invite when Invite with Link is pressed again before the first has a result', async () => {
  await startAt(ALONE);
  const answer = holdTheApi();
  await showMembers('Brisbane');
  await fireEvent.press(membersButton('Invite with Link'));
  await expectOpen('Invite');
  await closeInvite();

  await fireEvent.press(membersButton('Invite with Link'));
  await expectOpen('Invite');
  expect(inviteLines()).toEqual([CREATING]);
  await act(async () => answer());
  await until(() => shownLink() !== undefined, 'the link');

  expect(registrationsReceived()).toHaveLength(1);
  expect(requestsReceived().filter(isCreateGroup)).toHaveLength(1);
  expect(inviteRequests()).toHaveLength(1);
  expect(partsOf(shownLink()!).code).toBe(codeIn(inviteRequests()[0]));
  expect(await unsent()).toHaveLength(1);
});

test('[SHARING-91.1] closes Invite with Close or a swipe down, back on Members', async () => {
  await startAt(ALONE);
  await invite('Brisbane');

  await closeInvite();
  expect(isOpen('Members')).toBe(true);

  await pressInvite();
  await swipeDown('Invite');
  await expectClosed('Invite');
  expect(isOpen('Members')).toBe(true);
});

// The first invite

test("[SHARING-92.1] registers the device, creates the group under its own ID, then creates the invite, on a new phone's first invite", async () => {
  await startAt(ALONE);
  const id = await groupId('Brisbane');

  const link = await invited('Brisbane');

  expect(apiRequests().map(({ method, path }) => `${method} ${path}`)).toEqual([
    'POST /devices',
    `PUT /groups/${id}`,
    `PUT /groups/${id}/invites/${partsOf(link).code}`,
  ]);
  expect(new Set(received().map((request) => request.deviceId)).size).toBe(1);
  expect(requestsReceived()[0].body).toHaveLength(0);
});

test('[SHARING-92.1] writes an event for every change to the group from then on, stamped by this device from the time of the invite', async () => {
  await startAt(ALONE);
  await invitedAndLeft('Brisbane');

  setClock(T + 60_000);
  const [renamed] = await eventsOf(() => renameGroupTo('Brisbane', 'Brissie'));

  expect(renamed).toMatchObject({
    type: 'group',
    stamp: { ms: T + 60_000, device: deviceId() },
  });
  expect(baseOf(renamed, 'name')).toMatchObject({ ms: T, device: deviceId() });
});

test('[SHARING-92.1] writes no event for what the group already held, only for the invite', async () => {
  await startAt(BRISBANE);
  await addGroupExpense({
    group: 'Brisbane',
    title: 'Dinner',
    amount: '100.01',
    date: '2026-10-30',
    category: 'Food & Dining',
    payer: 'Casey',
    sharers: ['Blake', 'Taylor (You)', 'Casey'],
  });

  await invitedAndLeft('Brisbane');

  expect((await unsent()).map((event) => event.content.type)).toEqual([
    'invite',
  ]);
});

test('[SHARING-92.1] stamps with the corrected time when the API is ten minutes ahead', async () => {
  await startAt(ALONE);
  apiIsAhead(600_000);
  await invitedAndLeft('Brisbane');

  const [renamed] = await eventsOf(() => renameGroupTo('Brisbane', 'Brissie'));

  expect(baseOf(renamed, 'name')).toMatchObject({ ms: T + 600_000 });
});

test('[SHARING-92.1] does not make a group a shared ledger while the API has not answered that it is created', async () => {
  await startAt(ALONE);
  goOffline();
  await invite('Brisbane');
  await leaveInvite('Brisbane');

  const written = await eventsOf(() => renameGroupTo('Brisbane', 'Brissie'));

  expect(written).toEqual([]);
});

test('[SHARING-92.1] registers once: a second group asks only for its own group and invite', async () => {
  await startAt(TWO_GROUPS);
  await invitedAndLeft('Brisbane');
  const before = requestLines().length;
  const tokyo = await groupId('Tokyo');

  const link = await invited('Tokyo');

  expect(registrationsReceived()).toHaveLength(1);
  expect(requestLines().slice(before)).toEqual([
    `PUT /groups/${tokyo}`,
    `PUT /groups/${tokyo}/invites/${partsOf(link).code}`,
  ]);
});

test('[SHARING-92.1] does not ask for the group again once it is a shared ledger', async () => {
  await startAt(ALONE);
  await invited('Brisbane');
  await pressInInvite('Revoke Link');
  await pressAlertButton('Revoke');
  await expectClosed('Invite');

  await pressInvite();

  expect(shownLink()).toMatch(LINK);
  expect(inviteRequests()).toHaveLength(2);
  expect(requestsReceived().filter(isCreateGroup)).toHaveLength(1);
});

// The group key

test('[SHARING-93.1] keeps the group key in the secure store: 32 random bytes in an entry named after the group and epoch 1', async () => {
  await startAt(ALONE);

  await invited('Brisbane');

  expect(secureStoreEntries()).toHaveLength(2);
  const [entry] = groupKeys();
  expect(entry.key).toBe(`group-key.${await groupId('Brisbane')}.1`);
  expect(entry.value).toMatch(/^[0-9a-f]{64}$/);
  expect(drewFromTheRandomSource(fromHex(entry.value))).toBe(true);
  expect(forbiddenDraws()).toEqual([]);
  expect(entry.options).toEqual({ keychainAccessible: 1 });
});

test('[SHARING-93.1] puts the group key in no request and in no row of the local data', async () => {
  await startAt(ALONE);

  await invited('Brisbane');

  const key = fromHex(groupKeys()[0].value);
  expect(key).toHaveLength(32);
  expect(requestsHold(key)).toBe(false);
  expect(received().some(({ body }) => body.length > 0)).toBe(true);
  expect(localDataHolds(key)).toBe(false);
  // The same search finds what the local data does hold.
  expect(localDataHolds(utf8(deviceId()))).toBe(true);
});

test('[SHARING-93.1] gives each group a key of its own', async () => {
  await startAt(TWO_GROUPS);
  await invitedAndLeft('Brisbane');

  await invited('Tokyo');

  expect(groupKeys().map((entry) => entry.key)).toEqual([
    `group-key.${await groupId('Brisbane')}.1`,
    `group-key.${await groupId('Tokyo')}.1`,
  ]);
  expect(groupKeys()[0].value).not.toBe(groupKeys()[1].value);
});

test('[SHARING-93.1] keeps a key the secure store already has for the group', async () => {
  await startAt(ALONE);
  const entry = `group-key.${await groupId('Brisbane')}.1`;
  const key =
    '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f';
  writeSecureStoreEntry(entry, key);

  await invited('Brisbane');

  expect(groupKeys()).toHaveLength(1);
  expect(groupKeys()[0]).toMatchObject({ key: entry, value: key });
});

test('[SHARING-93.1] does not make the group a shared ledger when the key cannot be stored, and does once it can', async () => {
  await startAt(TWO_GROUPS);
  await invitedAndLeft('Tokyo');
  failSecureStoreWrites();

  await invite('Brisbane');

  expect(inviteLines()).toEqual([WENT_WRONG, 'Try Again']);
  await leaveInvite('Brisbane');
  expect(await eventsOf(() => renameGroupTo('Brisbane', 'Brissie'))).toEqual(
    [],
  );

  secureStoreWorks();
  expect(await invited('Brissie')).toMatch(LINK);
});

// The code, the secret and the card

test('[SHARING-94.1] makes the link of the API address, a 16-byte code and a 32-byte secret, both from the random source', async () => {
  await startAt(ALONE);

  const link = await invited('Brisbane');

  expect(link).toMatch(LINK);
  const { code, codeBytes, secretBytes } = partsOf(link);
  expect(codeIn(inviteRequests()[0])).toBe(code);
  expect(codeBytes).toHaveLength(16);
  expect(secretBytes).toHaveLength(32);
  expect(drewFromTheRandomSource(codeBytes)).toBe(true);
  expect(drewFromTheRandomSource(secretBytes)).toBe(true);
  expect(forbiddenDraws()).toEqual([]);
});

test('[SHARING-94.1] gives every invite a code and a secret of its own', async () => {
  await startAt(TWO_GROUPS);
  const first = await invited('Brisbane');
  await pressInInvite('Revoke Link');
  await pressAlertButton('Revoke');
  await expectClosed('Invite');
  await pressInvite();
  const second = shownLink()!;
  await leaveInvite('Brisbane');

  const third = await invited('Tokyo');

  const links = [first, second, third].map(partsOf);
  expect(new Set(links.map(({ code }) => code)).size).toBe(3);
  expect(new Set(links.map(({ secret }) => secret)).size).toBe(3);
});

test('[SHARING-95.1] sends the group name and the members, in order, as a card only the secret opens', async () => {
  await startAt(BRISBANE);
  const ids = await members('Brisbane');

  const link = await invited('Brisbane');

  const [request] = inviteRequests();
  expect(JSON.parse(Buffer.from(request.body).toString('utf8'))).toEqual({
    cursor: 0,
    card: expect.stringMatching(/^[0-9a-f]+$/),
  });
  expect(openedCard(request, partsOf(link).secret)).toBe(
    JSON.stringify({
      name: 'Brisbane',
      members: [
        { id: ids.Taylor, name: 'Taylor', hasDevice: true },
        { id: ids.Casey, name: 'Casey', hasDevice: false },
        { id: ids.Blake, name: 'Blake', hasDevice: false },
      ],
    }),
  );
  const { card } = sentCard(request);
  expect(card[0]).toBe(1);
  expect(drewFromTheRandomSource(card.slice(1, 25))).toBe(true);
});

test('[SHARING-95.1] leaves a former member out of the card', async () => {
  await startAt(BRISBANE);
  await showMembers('Brisbane');
  await removeMember('Blake');

  await pressInvite();

  expect(lastCard(shownLink()!).members.map(({ name }) => name)).toEqual([
    'Taylor',
    'Casey',
  ]);
});

test('[SHARING-95.1] names you in the card as the group names you', async () => {
  await startAt(BRISBANE);
  await showMembers('Brisbane');
  await openRenameMember('Taylor (You)', 'Taylor');
  await fireEvent.changeText(memberNameField(), 'Tay');
  await pressOnBar('Rename Member', 'Save');
  await expectClosed('Rename Member');
  await expectMembers(['Tay (You)', 'Casey', 'Blake', 'Add Member']);

  await pressInvite();

  expect(lastCard(shownLink()!).members[0]).toMatchObject({
    name: 'Tay',
    hasDevice: true,
  });
});

test('[SHARING-96.1] puts neither the secret, the card key nor a name in any request', async () => {
  await startAt({ Brisbane: ['Casey'] });
  const link = await invitedAndLeft('Brisbane');
  await renameGroupTo('Brisbane', 'Brissie');
  await waitForCards(2);
  await showMembers('Brissie');
  await pressInvite();
  await pressInInvite('Revoke Link');
  await pressAlertButton('Revoke');
  await expectClosed('Invite');

  const { secret, secretBytes } = partsOf(link);
  expect(requestsReceived().filter(isRevoke)).toHaveLength(1);
  expect(requestsHold(secretBytes)).toBe(false);
  expect(requestsHold(cardKeyOf(secret))).toBe(false);
  for (const name of ['Brisbane', 'Brissie', 'Casey', 'Taylor']) {
    expect(requestsHold(name)).toBe(false);
  }
  // The same search finds what the requests do hold.
  expect(requestsHold(partsOf(link).codeBytes)).toBe(true);
});

test("[SHARING-97.1] stores the invite and writes its first event once the API has created it, with the API's expiry", async () => {
  await startAt(ALONE);

  const link = await invited('Brisbane');

  const { code, secret } = partsOf(link);
  const events = await unsent();
  expect(events).toHaveLength(1);
  expect(events[0].groupId).toBe(await groupId('Brisbane'));
  expect(events[0].content).toEqual({
    version: 1,
    stamp: { ms: T, counter: expect.any(Number), device: deviceId() },
    type: 'invite',
    id: code,
    units: { link: { value: { secret, expiresAtMs: T + WEEK } } },
  });
  expect(inviteOnApi(code)?.expiresAtMs).toBe(T + WEEK);
});

test('[SHARING-97.1] writes no event while the API has not answered that the invite is created', async () => {
  await startAt(ALONE);
  apiLosesNextAnswer(isPutInvite);

  await invite('Brisbane');

  expect(shownLink()).toBeUndefined();
  expect(await unsent()).toEqual([]);
});

// What Invite shows

test('[SHARING-98.1] shows the QR code, the link, Share Link, who can join, the expiry date and Revoke Link', async () => {
  await startAt(ALONE);

  const link = await invited('Brisbane');

  expect(inviteLines()).toEqual([
    link,
    'Share Link',
    EXPLANATION,
    'Expires Nov 25, 2026',
    'Revoke Link',
  ]);
  expect(qrCodes()).toEqual([
    { value: link, accessibilityLabel: 'Invite link QR code' },
  ]);
  expect(inviteButton('Share Link')).toBeOnTheScreen();
  expect(inviteButton('Revoke Link')).toBeOnTheScreen();
});

test("[SHARING-98.1] shows the expiry as a date in the phone's time zone", async () => {
  setPhoneClock('America/Los_Angeles', new Date(T).toISOString());
  await startAt(ALONE);

  await invited('Brisbane');

  // 2026-11-25T06:32:00Z is still the 24th in Los Angeles.
  expect(inviteLines()).toContain('Expires Nov 24, 2026');
});

test("[SHARING-99.1] hands the system's share sheet the whole link and nothing else", async () => {
  await startAt(ALONE);
  const link = await invited('Brisbane');

  await pressInInvite('Share Link');

  expect(shared()).toHaveLength(1);
  const texts = Object.values(shared()[0] as object);
  expect(texts.length).toBeGreaterThan(0);
  for (const text of texts) expect(text).toBe(link);
});

test('[SHARING-100.1] shows the invite it has without asking the API, when Invite is opened again', async () => {
  await startAt(ALONE);
  const link = await invited('Brisbane');
  await closeInvite();
  const sent = asked();

  await pressInvite();

  expect(shownLink()).toBe(link);
  expect(asked()).toBe(sent);
});

test('[SHARING-100.1] shows the invite it has with no network, after the app is started again', async () => {
  let app = await startAt(ALONE);
  const link = await invitedAndLeft('Brisbane');
  goOffline();

  app = await restart(app);
  setClock(T);

  expect(app).toBeDefined();
  expect(await invited('Brisbane')).toBe(link);
});

test('[SHARING-100.1] shows the invite that expires last when it holds two that are active', async () => {
  await startAt(ALONE);
  await invitedAndLeft('Brisbane');
  await receive(
    await groupId('Brisbane'),
    inviteCreated(CODE_B, T + WEEK + 60_000),
  );

  expect(await invited('Brisbane')).toBe(LINK_B);
});

test('[SHARING-101.1] shows the invite it has until a millisecond before it expires', async () => {
  await startAt(ALONE);
  const link = await invitedAndLeft('Brisbane');
  const sent = asked();

  setClock(T + WEEK - 1);

  expect(await invited('Brisbane')).toBe(link);
  expect(asked()).toBe(sent);
});

test('[SHARING-101.1] creates a new invite once the one it has expired', async () => {
  await startAt(ALONE);
  const old = await invitedAndLeft('Brisbane');

  setClock(T + WEEK);
  const link = await invited('Brisbane');

  expect(partsOf(link).code).not.toBe(partsOf(old).code);
  expect(partsOf(link).secret).not.toBe(partsOf(old).secret);
  expect(inviteRequests().map(codeIn)).toEqual([
    partsOf(old).code,
    partsOf(link).code,
  ]);
  expect(inviteLines()).toContain('Expires Dec 2, 2026');
  expect((await unsent()).map(({ content }) => content.id)).toEqual([
    partsOf(old).code,
    partsOf(link).code,
  ]);
});

// Revoking

test('[SHARING-102.1] asks before revoking, then revokes on the API, deletes the invite with an event, and closes Invite', async () => {
  await startAt(ALONE);
  const { code } = partsOf(await invited('Brisbane'));
  const id = await groupId('Brisbane');

  await pressInInvite('Revoke Link');

  expect(alertsShown()).toEqual([
    [
      'Revoke Link?',
      "People who haven't joined yet won't be able to use this link.",
    ],
  ]);
  expect(lastAlertButtons()).toEqual([
    expect.objectContaining({ text: 'Cancel' }),
    expect.objectContaining({ text: 'Revoke', style: 'destructive' }),
  ]);
  expect(requestsReceived().filter(isRevoke)).toEqual([]);

  await pressAlertButton('Revoke');
  await expectClosed('Invite');

  expect(isOpen('Members')).toBe(true);
  const [revocation] = requestsReceived().filter(isRevoke);
  expect(`${revocation.method} ${revocation.path}`).toBe(
    `DELETE /groups/${id}/invites/${code}`,
  );
  expect(revocation.body).toHaveLength(0);
  expect(inviteOnApi(code)?.revoked).toBe(true);
  expect((await unsent()).at(-1)?.content).toEqual({
    version: 1,
    stamp: { ms: T, counter: expect.any(Number), device: deviceId() },
    type: 'invite',
    id: code,
    deleted: true,
  });
});

test('[SHARING-102.1] creates a new invite when Invite with Link is pressed after a revocation', async () => {
  await startAt(ALONE);
  const old = await invited('Brisbane');
  await pressInInvite('Revoke Link');
  await pressAlertButton('Revoke');
  await expectClosed('Invite');

  await pressInvite();

  const link = shownLink()!;
  expect(partsOf(link).code).not.toBe(partsOf(old).code);
  expect(inviteOnApi(partsOf(link).code)?.revoked).toBe(false);
});

test('[SHARING-102.1] does nothing when the question is answered with Cancel', async () => {
  await startAt(ALONE);
  const link = await invited('Brisbane');
  await pressInInvite('Revoke Link');

  await pressAlertButton('Cancel');

  expect(requestsReceived().filter(isRevoke)).toEqual([]);
  expect(shownLink()).toBe(link);
  expect(await unsent()).toHaveLength(1);
});

test('[SHARING-103.1] keeps the invite and says to connect when a revocation gets no answer', async () => {
  await startAt(ALONE);
  const link = await invited('Brisbane');
  goOffline();
  await pressInInvite('Revoke Link');

  await pressAlertButton('Revoke');
  await until(() => alertsShown().length === 2, 'the alert');

  expect(alertsShown().at(-1)).toEqual([
    'Unable to Revoke Link',
    'Connect to the internet and try again.',
  ]);
  expect(shownLink()).toBe(link);
  expect(await unsent()).toHaveLength(1);
});

test('[SHARING-103.1] keeps the invite and says something went wrong when the API refuses a revocation', async () => {
  await startAt(ALONE);
  const link = await invited('Brisbane');
  apiAnswersNext(isRevoke, 403, JSON.stringify({ error: 'not-a-member' }));
  await pressInInvite('Revoke Link');

  await pressAlertButton('Revoke');
  await until(() => alertsShown().length === 2, 'the alert');

  expect(alertsShown().at(-1)).toEqual(['Unable to Revoke Link', WENT_WRONG]);
  expect(shownLink()).toBe(link);
  expect(await unsent()).toHaveLength(1);
});

test('[SHARING-103.1] keeps the invite when the API revoked it and the phone could not store that, and can revoke again', async () => {
  await startAt(ALONE);
  const link = await invited('Brisbane');
  afterTheAnswerTo(isRevoke, failWrites);
  await pressInInvite('Revoke Link');

  await pressAlertButton('Revoke');
  await until(() => alertsShown().length === 2, 'the alert');

  expect(alertsShown().at(-1)).toEqual(['Unable to Revoke Link', WENT_WRONG]);
  expect(shownLink()).toBe(link);
  expect(await unsent()).toHaveLength(1);

  allowWrites();
  await pressInInvite('Revoke Link');
  await pressAlertButton('Revoke');
  await expectClosed('Invite');

  expect(requestsReceived().filter(isRevoke)).toHaveLength(2);
  expect((await unsent()).at(-1)?.content).toMatchObject({
    type: 'invite',
    id: partsOf(link).code,
    deleted: true,
  });
});

// No answer

test('[SHARING-104.1] says to connect, with Try Again and no link, when there is no network, and recording goes on', async () => {
  await startAt(BRISBANE);
  goOffline();

  await invite('Brisbane');

  expect(inviteLines()).toEqual([OFFLINE, 'Try Again']);
  expect(inviteButton('Try Again')).toBeOnTheScreen();
  await leaveInvite('Brisbane');
  await addGroupExpense({
    group: 'Brisbane',
    title: 'Dinner',
    amount: '100.01',
    date: '2026-10-30',
    category: 'Food & Dining',
    payer: 'Casey',
    sharers: ['Blake', 'Taylor (You)', 'Casey'],
  });
  expect(await unsent()).toEqual([]);

  goOnline();
  expect(await invited('Brisbane')).toMatch(LINK);
});

test('[SHARING-104.1] asks for the group again after an answer that was lost, and goes on to the invite', async () => {
  await startAt(ALONE);
  const id = await groupId('Brisbane');
  apiLosesNextAnswer(isCreateGroup);

  await invite('Brisbane');

  expect(inviteLines()).toEqual([OFFLINE, 'Try Again']);
  expect(groupOnApi(id)).toBe(true);
  expect(await unsent()).toEqual([]);

  await tryAgain();

  expect(shownLink()).toMatch(LINK);
  expect(requestsReceived().filter(isCreateGroup)).toHaveLength(2);
});

test('[SHARING-104.1] keeps the group a shared ledger when only the answer about the invite was lost', async () => {
  await startAt(ALONE);
  apiLosesNextAnswer(isPutInvite);
  await invite('Brisbane');
  expect(inviteLines()).toEqual([OFFLINE, 'Try Again']);
  await leaveInvite('Brisbane');

  const written = await eventsOf(() => renameGroupTo('Brisbane', 'Brissie'));

  expect(written.map((event) => event.type)).toEqual(['group']);
});

test('[SHARING-104.1] says to connect, and sends nothing, when the app was built without the address of the API', async () => {
  delete process.env.EXPO_PUBLIC_API_URL;
  await startAt(ALONE);

  await invite('Brisbane');

  expect(inviteLines()).toEqual([OFFLINE, 'Try Again']);
  expect(fetchCalls()).toBe(0);
});

test('[SHARING-105.1] sends the same code again after a request for an invite got no answer', async () => {
  await startAt(ALONE);
  apiLosesNextAnswer(isPutInvite);
  await invite('Brisbane');

  await tryAgain();

  const [first, second] = inviteRequests();
  expect(second.path).toBe(first.path);
  expect(partsOf(shownLink()!).code).toBe(codeIn(first));
  expect(openedCard(first, partsOf(shownLink()!).secret)).toContain('Brisbane');
});

test('[SHARING-105.1] sends the same code again after the app was started again', async () => {
  let app = await startAt(ALONE);
  apiLosesNextAnswer(isPutInvite);
  await invite('Brisbane');
  await leaveInvite('Brisbane');

  app = await restart(app);
  setClock(T);
  const link = await invited('Brisbane');

  expect(app).toBeDefined();
  const [first, second] = inviteRequests();
  expect(second.path).toBe(first.path);
  expect(partsOf(link).code).toBe(codeIn(first));
});

test('[SHARING-105.1] keeps the code when the next attempt is refused for too many requests, and sends it again after that', async () => {
  await startAt(ALONE);
  apiLosesNextAnswer(isPutInvite);
  await invite('Brisbane');
  expect(inviteLines()).toEqual([OFFLINE, 'Try Again']);
  const [first] = inviteRequests();
  expect(inviteOnApi(codeIn(first))?.revoked).toBe(false);
  for (let times = 0; times < 2; times += 1) {
    apiRefusesNext(isPutInvite, {
      error: 'too-many-requests',
      retryAfterMs: 1_000,
    });
  }

  await pressInInvite('Try Again');
  await until(() => inviteRequests().length === 2, 'the second request');
  await act(async () => {
    await jest.advanceTimersByTimeAsync(1_000);
  });
  await until(
    () => inviteLines().includes(WENT_WRONG),
    'the refusal to be shown',
  );

  expect(inviteLines()).toEqual([WENT_WRONG, 'Try Again']);
  expect(inviteRequests()).toHaveLength(3);
  expect(await unsent()).toEqual([]);

  await tryAgain();

  expect(inviteRequests()).toHaveLength(4);
  expect(inviteRequests().map((request) => request.path)).toEqual(
    Array.from({ length: 4 }, () => first.path),
  );
  expect(partsOf(shownLink()!).code).toBe(codeIn(first));
  expect(openedCard(first, partsOf(shownLink()!).secret)).toContain('Brisbane');
});

test('[SHARING-105.1] sends the same code again when the API created the invite and the phone could not store it', async () => {
  await startAt(ALONE);
  afterTheAnswerTo(isPutInvite, failWrites);

  await invite('Brisbane');

  expect(inviteLines()).toEqual([WENT_WRONG, 'Try Again']);
  expect(inviteRequests()).toHaveLength(1);
  expect(inviteOnApi(codeIn(inviteRequests()[0]))?.revoked).toBe(false);
  expect(await unsent()).toEqual([]);

  allowWrites();
  await tryAgain();

  const [first, second] = inviteRequests();
  expect(second.path).toBe(first.path);
  expect(partsOf(shownLink()!).code).toBe(codeIn(first));
  expect(openedCard(first, partsOf(shownLink()!).secret)).toContain('Brisbane');
  expect((await unsent()).map(({ content }) => content.id)).toEqual([
    codeIn(first),
  ]);
});

// An answer that does not come

test('[SHARING-111.1] gives up a registration that has had no answer for 60 seconds, and registers again on Try Again', async () => {
  await startAt(ALONE);
  const answer = keepAnswersBack(isRegistering);
  await showMembers('Brisbane');
  await fireEvent.press(membersButton('Invite with Link'));
  await expectOpen('Invite');
  await until(() => registrationsReceived().length === 1, 'the registration');

  await secondsPass(50);

  expect(inviteLines()).toEqual([CREATING]);

  await secondsPass(15);
  await until(() => !inviteLines().includes(CREATING), 'a result');

  expect(inviteLines()).toEqual([OFFLINE, 'Try Again']);
  expect(requestsReceived()).toEqual([]);
  expect(groupKeys()).toEqual([]);

  await answer();
  await tryAgain();

  expect(registrationsReceived()).toHaveLength(2);
  expect(shownLink()).toMatch(LINK);
});

test('[SHARING-111.1] does not use the answer about an invite that comes after it gave the request up, and sends the same code on Try Again', async () => {
  await startAt(ALONE);
  const answer = keepAnswersBack(isPutInvite);
  await showMembers('Brisbane');
  await fireEvent.press(membersButton('Invite with Link'));
  await expectOpen('Invite');
  await until(() => inviteRequests().length === 1, 'the request for an invite');

  await secondsPass(65);
  await until(() => !inviteLines().includes(CREATING), 'a result');

  expect(inviteLines()).toEqual([OFFLINE, 'Try Again']);

  await answer();
  await settle();

  expect(inviteLines()).toEqual([OFFLINE, 'Try Again']);
  expect(await unsent()).toEqual([]);

  await tryAgain();

  const [first, second] = inviteRequests();
  expect(inviteRequests()).toHaveLength(2);
  expect(second.path).toBe(first.path);
  expect(partsOf(shownLink()!).code).toBe(codeIn(first));
  expect((await unsent()).map(({ content }) => content.id)).toEqual([
    codeIn(first),
  ]);
});

test('[SHARING-111.1] gives up a revocation that has had no answer for 60 seconds, says to connect and keeps the invite', async () => {
  await startAt(ALONE);
  const link = await invited('Brisbane');
  const answer = keepAnswersBack(isRevoke);
  await pressInInvite('Revoke Link');
  await pressAlertButton('Revoke');
  await until(
    () => requestsReceived().filter(isRevoke).length === 1,
    'the revocation',
  );

  await secondsPass(50);

  expect(alertsShown()).toHaveLength(1);

  await secondsPass(15);
  await until(() => alertsShown().length === 2, 'the alert');

  expect(alertsShown().at(-1)).toEqual([
    'Unable to Revoke Link',
    'Connect to the internet and try again.',
  ]);
  expect(shownLink()).toBe(link);
  expect(await unsent()).toHaveLength(1);
  await answer();
});

test('[SHARING-111.1] gives up a new card that has had no answer for 60 seconds, without a word, and sends the next one', async () => {
  await startAt(ALONE);
  const link = await invitedAndLeft('Brisbane');
  const answer = keepAnswersBack(isPutInvite);
  await renameGroupTo('Brisbane', 'Brissie');
  await waitForCards(2);

  await secondsPass(65);
  // The first card still has no answer: the next one does not wait for it.
  await renameGroupTo('Brissie', 'Bris');
  await waitForCards(3);

  const [first, , third] = inviteRequests();
  expect(third.path).toBe(first.path);
  expect(lastCard(link).name).toBe('Bris');
  expect(alertsShown()).toEqual([]);
  await answer();
});

test('[SHARING-111.1] gives each request 60 seconds of its own: a registration and a group that each take 50 seconds end in a link', async () => {
  await startAt(ALONE);
  const registered = keepAnswersBack(isRegistering);
  const created = keepAnswersBack(isCreateGroup);
  await showMembers('Brisbane');
  await fireEvent.press(membersButton('Invite with Link'));
  await expectOpen('Invite');
  await until(() => registrationsReceived().length === 1, 'the registration');

  await secondsPass(50);
  await registered();
  await until(
    () => requestsReceived().filter(isCreateGroup).length === 1,
    'the request for the group',
  );
  await secondsPass(50);

  expect(inviteLines()).toEqual([CREATING]);

  await created();
  await until(() => !inviteLines().includes(CREATING), 'a result');

  expect(shownLink()).toMatch(LINK);
  expect(registrationsReceived()).toHaveLength(1);
  expect(requestsReceived().filter(isCreateGroup)).toHaveLength(1);
});

// Other answers

test('[SHARING-106.1] says the group cannot be shared from this phone when its ID is already a group of another phone', async () => {
  await startAt(ALONE);
  apiAnswersNext(isCreateGroup, 403, JSON.stringify({ error: 'not-a-member' }));

  await invite('Brisbane');

  expect(inviteLines()).toEqual([CANNOT_SHARE]);
  await leaveInvite('Brisbane');
  expect(await eventsOf(() => renameGroupTo('Brisbane', 'Brissie'))).toEqual(
    [],
  );
});

test('[SHARING-106.1] says the group cannot be shared from this phone, and sends nothing, when its authorization is lost', async () => {
  await startAt(TWO_GROUPS);
  await invitedAndLeft('Tokyo');
  const seed = secureStoreEntries().find(({ key }) =>
    key.includes(deviceId()),
  )!;
  removeSecureStoreEntry(seed.key);
  const sent = asked();

  await invite('Brisbane');

  expect(inviteLines()).toEqual([CANNOT_SHARE]);
  expect(asked()).toBe(sent);
});

test('[SHARING-106.1] says another member has an invite when the API has one this phone does not hold, then shows it once its event is applied', async () => {
  await startAt(ALONE);
  await invited('Brisbane');
  await pressInInvite('Revoke Link');
  await pressAlertButton('Revoke');
  await expectClosed('Invite');
  const id = await groupId('Brisbane');
  inviteByAnotherPhone(id, CODE_B);
  const events = (await unsent()).length;

  await pressInvite();

  expect(inviteLines()).toEqual([INVITE_EXISTS, 'Try Again']);
  expect(await unsent()).toHaveLength(events);
  const cards = inviteRequests().length;

  await receive(id, inviteCreated());
  await tryAgain();

  expect(shownLink()).toBe(LINK_B);
  expect(inviteRequests()).toHaveLength(cards);
});

test('[SHARING-106.1] takes a new code when the API says the one it sent names no invite', async () => {
  await startAt(ALONE);
  apiAnswersNext(isPutInvite, 404, JSON.stringify({ error: 'no-invite' }));

  const link = await invited('Brisbane');

  const [first, second] = inviteRequests().map(codeIn);
  expect(second).not.toBe(first);
  expect(partsOf(link).code).toBe(second);
  expect(await unsent()).toHaveLength(1);
});

test.each<[string, () => void]>([
  [
    'refuses the registration',
    () => apiRefusesNext('registration', { error: 'too-many-registrations' }),
  ],
  [
    'fails on the request for the invite',
    () => apiAnswersNext(isPutInvite, 500, 'Internal Server Error'),
  ],
  [
    'answers the request for the invite with something else',
    () => apiAnswersNext(isPutInvite, 200, '{}'),
  ],
  [
    'refuses a second code as well',
    () => {
      apiAnswersNext(isPutInvite, 404, JSON.stringify({ error: 'no-invite' }));
      apiAnswersNext(isPutInvite, 404, JSON.stringify({ error: 'no-invite' }));
    },
  ],
])(
  '[SHARING-106.1] says something went wrong, with Try Again, when the API %s',
  async (_case, tellTheApi) => {
    await startAt(ALONE);
    tellTheApi();

    await invite('Brisbane');

    expect(inviteLines()).toEqual([WENT_WRONG, 'Try Again']);
    expect(await unsent()).toEqual([]);

    await tryAgain();
    expect(shownLink()).toMatch(LINK);
  },
);

test('[SHARING-106.1] takes a 404 that gives no reason for an answer it cannot read, not for a used code', async () => {
  await startAt(ALONE);
  apiAnswersNext(isPutInvite, 404, '404 Not Found');

  await invite('Brisbane');

  expect(inviteLines()).toEqual([WENT_WRONG, 'Try Again']);
  expect(inviteRequests()).toHaveLength(1);
});

test('[SHARING-106.1] says something went wrong when the API still refuses for too many requests after the wait', async () => {
  await startAt(ALONE);
  for (let times = 0; times < 2; times += 1) {
    apiRefusesNext(isCreateGroup, {
      error: 'too-many-requests',
      retryAfterMs: 1_000,
    });
  }
  await showMembers('Brisbane');

  await fireEvent.press(membersButton('Invite with Link'));
  await expectOpen('Invite');
  await until(
    () => requestsReceived().filter(isCreateGroup).length === 1,
    'the first request',
  );
  await act(async () => {
    await jest.advanceTimersByTimeAsync(1_000);
  });
  await until(() => !inviteLines().includes(CREATING), 'a result');

  expect(inviteLines()).toEqual([WENT_WRONG, 'Try Again']);
  expect(requestsReceived().filter(isCreateGroup)).toHaveLength(2);
});

// Limits

const names = (count: number) =>
  Array.from({ length: count }, (_, index) => `Member ${index + 1}`);

test('[SHARING-107.1] does not make a group of 21 members a shared ledger, and does once it has 20', async () => {
  await startAt({ Brisbane: names(20) });

  await invite('Brisbane');

  expect(inviteLines()).toEqual([TOO_MANY_MEMBERS]);
  expect(fetchCalls()).toBe(0);
  await closeInvite();
  expect(await unsent()).toEqual([]);

  await removeMember('Member 20');
  await pressInvite();

  const link = shownLink()!;
  expect(link).toMatch(LINK);
  expect(lastCard(link).members).toHaveLength(20);
});

/** A group name that makes the card of a group with only Taylor exactly `size` bytes. */
function nameForCardOf(size: number) {
  const fixed = JSON.stringify({
    name: '',
    members: [
      {
        id: '00000000-0000-4000-8000-000000000000',
        name: 'Taylor',
        hasDevice: true,
      },
    ],
  }).length;
  return 'b'.repeat(size - 41 - fixed);
}

test('[SHARING-108.1] invites to a group whose card is exactly 65,536 bytes', async () => {
  const name = nameForCardOf(65_536);
  await startAt({ [name]: [] });

  const link = await invited(name);

  expect(sentCard(inviteRequests()[0]).card).toHaveLength(65_536);
  expect(lastCard(link).name).toBe(name);
});

test('[SHARING-108.1] sends nothing and says the names are too long when the card would be a byte larger', async () => {
  const name = nameForCardOf(65_537);
  await startAt({ [name]: [] });

  await invite(name);

  expect(inviteLines()).toEqual([NAMES_TOO_LONG]);
  expect(fetchCalls()).toBe(0);
  expect(await unsent()).toEqual([]);
});

test('[SHARING-108.1] still shows the invite it has when the names have grown past what a card holds', async () => {
  await startAt(ALONE);
  const link = await invitedAndLeft('Brisbane');
  const group = 'g'.repeat(40_000);
  await renameGroupTo('Brisbane', group);
  await waitForCards(2);
  await showMembers(group);
  await renameYouTo('m'.repeat(40_000), 'Taylor');
  const sent = asked();

  await pressInvite();

  expect(shownLink()).toBe(link);
  expect(inviteLines()).not.toContain(NAMES_TOO_LONG);
  expect(asked()).toBe(sent);
});

// Keeping the card up to date

test('[SHARING-109.1] sends a new card for the same invite when the group is renamed, without a word', async () => {
  await startAt(ALONE);
  const link = await invitedAndLeft('Brisbane');

  await renameGroupTo('Brisbane', 'Brissie');
  await waitForCards(2);

  const [first, second] = inviteRequests();
  expect(second.path).toBe(first.path);
  expect(lastCard(link).name).toBe('Brissie');
  expect(sentCard(second).card.slice(1, 25)).not.toEqual(
    sentCard(first).card.slice(1, 25),
  );
  expect(alertsShown()).toEqual([]);
});

test('[SHARING-109.1] sends a new card when a member is added, renamed or removed', async () => {
  await startAt(BRISBANE);
  const link = await invited('Brisbane');
  await closeInvite();

  await addMember('Dana');
  await waitForCards(2);
  await renameMember('Casey', 'Casey Lee');
  await waitForCards(3);
  await removeMember('Blake');
  await waitForCards(4);

  expect(lastCard(link).members.map(({ name }) => name)).toEqual([
    'Taylor',
    'Casey Lee',
    'Dana',
  ]);
});

test("[SHARING-109.1] sends a new card when another phone's event adds a member", async () => {
  await startAt(ALONE);
  const link = await invitedAndLeft('Brisbane');
  const evan = 'c0000000-0000-4000-8000-000000000001';

  await receive(
    await groupId('Brisbane'),
    created('member', evan, at(T + 1_000), { name: 'Evan', removed: false }),
  );
  await waitForCards(2);

  expect(lastCard(link).members.at(-1)).toEqual({
    id: evan,
    name: 'Evan',
    hasDevice: false,
  });
});

test('[SHARING-109.1] sends the card of a change made with no network the next time the invite is prepared', async () => {
  await startAt(ALONE);
  const link = await invitedAndLeft('Brisbane');
  goOffline();
  await renameGroupTo('Brisbane', 'Bris');
  expect(alertsShown()).toEqual([]);
  expect(inviteRequests()).toHaveLength(1);

  goOnline();
  expect(await invited('Bris')).toBe(link);
  await waitForCards(2);

  expect(lastCard(link).name).toBe('Bris');
});

test('[SHARING-109.1] sends no card when neither the name nor the members changed', async () => {
  await startAt(BRISBANE);
  await invitedAndLeft('Brisbane');
  const sent = asked();

  await addGroupExpense({
    group: 'Brisbane',
    title: 'Dinner',
    amount: '100.01',
    date: '2026-10-30',
    category: 'Food & Dining',
    payer: 'Casey',
    sharers: ['Blake', 'Taylor (You)', 'Casey'],
  });
  await invite('Brisbane');
  await closeInvite();
  await pressInvite();

  expect(asked()).toBe(sent);
});

test('[SHARING-109.1] sends no card for a group whose invite was revoked, or has expired', async () => {
  await startAt(TWO_GROUPS);
  await invited('Brisbane');
  await pressInInvite('Revoke Link');
  await pressAlertButton('Revoke');
  await expectClosed('Invite');
  await leaveMembers('Brisbane');
  await invitedAndLeft('Tokyo');
  setClock(T + WEEK);
  const sent = asked();

  await renameGroupTo('Brisbane', 'Brissie');
  await renameGroupTo('Tokyo', 'Kyoto');

  expect((await unsent()).map(({ content }) => content.type).slice(-2)).toEqual(
    ['group', 'group'],
  );
  expect(asked()).toBe(sent);
});

test('[SHARING-109.1] says nothing and keeps the invite when the API refuses the new card', async () => {
  await startAt(ALONE);
  const link = await invitedAndLeft('Brisbane');
  apiAnswersNext(isPutInvite, 404, JSON.stringify({ error: 'no-invite' }));

  await renameGroupTo('Brisbane', 'Brissie');
  await waitForCards(2);

  expect(alertsShown()).toEqual([]);
  expect((await unsent()).map(({ content }) => content.type)).toEqual([
    'invite',
    'group',
  ]);
  apiLosesNextAnswer(isPutInvite);
  expect(await invited('Brissie')).toBe(link);
});

test('[SHARING-109.1] sends no card that would be past the limit, and sends one again once it fits', async () => {
  await startAt(ALONE);
  const link = await invitedAndLeft('Brisbane');
  const group = 'g'.repeat(40_000);
  const member = 'm'.repeat(40_000);
  await renameGroupTo('Brisbane', group);
  await waitForCards(2);
  await showMembers(group);

  await renameYouTo(member, 'Taylor');
  for (let turn = 0; turn < 20; turn += 1) await settle();

  expect(inviteRequests()).toHaveLength(2);
  expect(alertsShown()).toEqual([]);

  await renameYouTo('Tay', member);
  await waitForCards(3);

  expect(lastCard(link)).toMatchObject({
    name: group,
    members: [{ name: 'Tay', hasDevice: true }],
  });
});

// Invites from other phones

test('[SYNC-81.1] stores an invite another phone created: Invite shows its link without asking the API, also after a restart', async () => {
  let app = await startAt(ALONE);
  await invited('Brisbane');
  await pressInInvite('Revoke Link');
  await pressAlertButton('Revoke');
  await expectClosed('Invite');
  const id = await groupId('Brisbane');
  const cards = inviteRequests().length;

  await receive(id, inviteCreated());
  await pressInvite();

  expect(inviteLines().slice(0, 1)).toEqual([LINK_B]);
  expect(inviteLines()).toContain('Expires Nov 25, 2026');
  expect(inviteRequests()).toHaveLength(cards);

  await leaveInvite('Brisbane');
  app = await restart(app);
  setClock(T);
  expect(app).toBeDefined();
  expect(await invited('Brisbane')).toBe(LINK_B);
});

test('[SYNC-81.1] forgets an invite another phone revoked: the next Invite with Link creates a new one', async () => {
  await startAt(ALONE);
  const old = await invitedAndLeft('Brisbane');
  const { code } = partsOf(old);

  await receive(await groupId('Brisbane'), inviteRevoked(code));
  const link = await invited('Brisbane');

  expect(partsOf(link).code).not.toBe(code);
  expect(inviteRequests().map(codeIn)).toEqual([code, partsOf(link).code]);
});

test('[SYNC-81.1] closes Invite when the invite it shows is revoked by another phone', async () => {
  await startAt(ALONE);
  const { code } = partsOf(await invited('Brisbane'));
  const sent = asked();

  await receive(await groupId('Brisbane'), inviteRevoked(code));

  await expectClosed('Invite');
  expect(isOpen('Members')).toBe(true);
  expect(asked()).toBe(sent);
});

test('[SYNC-81.1] changes nothing when an invite event arrives twice, or is one this phone wrote', async () => {
  await startAt(ALONE);
  const link = await invitedAndLeft('Brisbane');
  const id = await groupId('Brisbane');
  const [own] = await unsent();
  const sent = asked();

  await receive(id, own.content, own.content);

  expect(await invited('Brisbane')).toBe(link);
  expect(await unsent()).toEqual([own]);
  expect(asked()).toBe(sent);
});

test("[SYNC-81.1] leaves another shared ledger's invite alone when an event names its code, and stores nothing of it", async () => {
  await startAt(TWO_GROUPS);
  const tokyos = await invitedAndLeft('Tokyo');
  await invited('Brisbane');
  await pressInInvite('Revoke Link');
  await pressAlertButton('Revoke');
  await expectClosed('Invite');
  await leaveMembers('Brisbane');
  const { code } = partsOf(tokyos);
  const brisbane = await groupId('Brisbane');
  const cards = inviteRequests().length;

  // Tokyo's code with another secret, expiring later than Tokyo's own invite.
  await receive(brisbane, inviteCreated(code, T + WEEK + 60_000));

  // Brisbane did not take it for an invite of its own: it makes a new one.
  const link = await invitedAndLeft('Brisbane');
  expect(partsOf(link).code).not.toBe(code);
  expect(inviteRequests()).toHaveLength(cards + 1);
  expect(await invitedAndLeft('Tokyo')).toBe(tokyos);

  await receive(brisbane, inviteRevoked(code));

  expect(await invitedAndLeft('Tokyo')).toBe(tokyos);
  expect(await invitedAndLeft('Brisbane')).toBe(link);
  expect(inviteRequests()).toHaveLength(cards + 1);
});
