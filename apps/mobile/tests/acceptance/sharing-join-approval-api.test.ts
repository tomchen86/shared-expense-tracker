import { randomBytes } from 'node:crypto';
import {
  HANDOVER,
  approvalsBy,
  asks,
  boxFor,
  boxKeyOf,
  endApprovalWorld,
  eventsOf,
  handoverContext,
  handoverSalt,
  hasGroup,
  isMemberDevice,
  linesBy,
  membersOn,
  on,
  openedBox,
  phoneOf,
  registered,
  requestOnApi,
  sealedRequest,
  sendAs,
  sha256Of,
  startApprovalWorld,
  taylorInvites,
  type Inviting,
} from './sharing-approval-app';
import {
  HOUR,
  MINUTE,
  NOW,
  addExpense,
  answerNext,
  copyOfData,
  deviceId,
  drewFromTheRandomSource,
  everythingIn,
  fromHex,
  goOffline,
  goOnline,
  keyEntry,
  ledgerOf,
  localDataHolds,
  mark,
  memberIds,
  noAnswerTo,
  randomId,
  refusals,
  renameGroup,
  requestHolds,
  restoreData,
  sealed,
  secureStoreEntry,
  send,
  sentBy,
  setApiTime,
  setClock,
  storedEvents,
  sync,
  titles,
  toHex,
  unsent,
  uploadAs,
  utf8,
  whenAnswered,
  type Phone,
} from './sync-loop-app';
import { contentFor, fetched, sentSnapshot } from './sync-snapshot-app';

// Runs in Node against the real API (sharing-approval-app): a member's phone lists the
// requests to join its shared ledger, approves or rejects one, and the phone that asked
// learns the answer and joins (ADR-0015, ADR-0039). No test here adds a member device by
// hand: a phone is in a group because another approved it.

jest.mock(
  'expo-secure-store',
  () =>
    jest
      .requireActual<typeof import('./sync-loop-app')>('./sync-loop-app')
      .secureStoreOfStartingPhone(),
  { virtual: true },
);

jest.mock(
  'expo-crypto',
  () =>
    jest.requireActual<typeof import('./sync-loop-app')>('./sync-loop-app')
      .randomSource,
  { virtual: true },
);

jest.mock('../../src/storage/expo', () => ({}));
jest.mock('../../src/storage/expo-files', () => ({}));

beforeEach(startApprovalWorld);
afterEach(endApprovalWorld);

const LATER = NOW + MINUTE;

/** From now on the API's time and these phones' clocks are a minute after NOW. */
function aMinuteOn(...phones: Phone[]) {
  setApiTime(LATER);
  for (const phone of phones) setClock(phone, LATER);
}

const requestPath = (code: string) => `/invites/${code}/request`;
const decisionPath = (invite: Inviting, device: string) =>
  `/groups/${invite.brisbane}/requests/${device}`;

const list = ({ taylor, brisbane }: Inviting) =>
  on(taylor, () =>
    taylor.sharing.listReceivedJoinRequests(taylor.database, brisbane),
  );
type Listed = Awaited<ReturnType<typeof list>>[number];

/** The request Taylor's phone lists for the device now: the row its Members would show. */
async function listed(invite: Inviting, device: string): Promise<Listed> {
  const found = (await list(invite)).find(({ deviceId: by }) => by === device);
  if (!found) throw new Error('The phone lists no request of that device');
  return found;
}

const approve = ({ taylor, brisbane }: Inviting, request: Listed) =>
  on(taylor, () =>
    taylor.sharing.approveJoinRequest(taylor.database, brisbane, request),
  );
const reject = ({ taylor, brisbane }: Inviting, request: Listed) =>
  on(taylor, () =>
    taylor.sharing.rejectJoinRequest(taylor.database, brisbane, request),
  );
const ask = (phone: Phone, { code }: Inviting) =>
  on(phone, () => phone.sharing.askJoinResult(phone.database, code));

const APPROVED = { outcome: 'approved' };

/** Taylor's phone with Brisbane and its invite, and Dana's phone with its request for it. */
async function danaAsked(choice: { name?: string; memberId?: string } = {}) {
  const invite = await taylorInvites();
  const dana = await phoneOf('Dana', invite);
  const ids = await memberIds(invite.taylor);
  const D = await asks(dana, invite, {
    name: choice.name,
    memberId: choice.memberId ? ids[choice.memberId] : null,
  });
  // The invite's event is uploaded and downloaded again: nothing is unsent, and the
  // phone's cursor is the group's last sequence number.
  await sync(invite.taylor);
  await sync(invite.taylor);
  aMinuteOn(invite.taylor, dana);
  return { invite, ...invite, dana, D, ids };
}

/** The same, once Taylor's phone has listed Dana's request: `request` is what it listed. */
async function danaListed(choice: { name?: string; memberId?: string } = {}) {
  const world = await danaAsked(choice);
  return { ...world, request: await listed(world.invite, world.D) };
}

/** The same, once Taylor's phone has approved Dana's request. */
async function danaApproved(choice: { name?: string; memberId?: string } = {}) {
  const world = await danaListed(choice);
  const from = mark();
  expect(await approve(world.invite, world.request)).toEqual(APPROVED);
  const [approval] = await approvalsBy(world.taylor, from);
  return { ...world, approval };
}

describe('SHARING-191.2', () => {
  test("[SHARING-191.2] reads a request made with the invite's secret: the name and the choice", async () => {
    const { invite, code, D } = await danaAsked();

    expect(await list(invite)).toEqual([
      {
        code,
        deviceId: D,
        name: 'Dana',
        memberId: null,
        request: sha256Of((await requestOnApi(code, D))!),
      },
    ]);
  });

  test('[SHARING-191.2] reads the member a request picks, trims its name, and ignores other fields', async () => {
    const invite = await taylorInvites();
    const dana = await phoneOf('Dana', invite);
    const { Casey } = await memberIds(invite.taylor);
    const D = await registered(dana);
    const answer = await send(dana, 'PUT', requestPath(invite.code), {
      request: sealedRequest(invite, D, {
        name: ' Dana K. ',
        memberId: Casey,
        userId: dana.identity.userId,
        boxKey: await boxKeyOf(dana),
        note: 'hi',
      }),
    });
    expect(answer.status).toBe(200);

    expect(await list(invite)).toEqual([
      {
        code: invite.code,
        deviceId: D,
        name: 'Dana K.',
        memberId: Casey,
        request: sha256Of((await requestOnApi(invite.code, D))!),
      },
    ]);
  });
});

/** A phone that is registered and sends `request` as its join request, sealed or not. */
async function sends(
  invite: Inviting,
  name: string,
  request: (device: string, phone: Phone) => Promise<string> | string,
) {
  const phone = await phoneOf(name, invite);
  const device = await registered(phone);
  const answer = await send(phone, 'PUT', requestPath(invite.code), {
    request: await request(device, phone),
  });
  expect(answer.status).toBe(200);
  return device;
}

describe('SHARING-192.1', () => {
  test('[SHARING-192.1] rejects requests it cannot open, each by the content it listed, and lists only the one it can', async () => {
    const { invite, taylor, brisbane, code, D } = await danaAsked();
    // Random bytes behind the format version the phone knows: a ciphertext that does not open.
    const random = await sends(
      invite,
      'Random',
      () => `01${toHex(new Uint8Array(randomBytes(296)))}`,
    );
    const otherSecret = await sends(invite, 'Other', async (device, phone) =>
      sealedRequest(
        { code, secret: 'ICEiIyQlJicoKSorLC0uLzAxMjM0NTY3ODk6Ozw9Pj8' },
        device,
        {
          name: 'Other',
          memberId: null,
          userId: phone.identity.userId,
          boxKey: await boxKeyOf(phone),
        },
      ),
    );
    const moved = await sends(invite, 'Moved', async (_device, phone) =>
      // Sealed for Dana's device, and stored under this one.
      sealedRequest(invite, D, {
        name: 'Moved',
        memberId: null,
        userId: phone.identity.userId,
        boxKey: await boxKeyOf(phone),
      }),
    );

    const unreadable = [random, otherSecret, moved];
    const rejections: string[] = [];
    for (const device of unreadable) {
      const hash = sha256Of((await requestOnApi(code, device))!);
      rejections.push(`/groups/${brisbane}/requests/${device}?request=${hash}`);
    }
    const from = mark();

    expect(await list(invite)).toEqual([
      expect.objectContaining({ deviceId: D, name: 'Dana', memberId: null }),
    ]);

    expect(
      (await sentBy(taylor, from))
        .filter(({ method }) => method === 'DELETE')
        .map(({ path }) => path)
        .sort(),
    ).toEqual(rejections.sort());
    for (const device of unreadable) {
      expect(await requestOnApi(code, device)).toBeUndefined();
    }
    expect(await requestOnApi(code, D)).toBeDefined();
  });

  test.each<[string, (userId: string, boxKey: string) => unknown]>([
    ['text that is no JSON', () => 'join me'],
    [
      'a name of spaces',
      (userId, boxKey) => ({ name: '   ', memberId: null, userId, boxKey }),
    ],
    [
      'a member ID that is no UUID',
      (userId, boxKey) => ({ name: 'Evan', memberId: 'casey', userId, boxKey }),
    ],
    [
      'no user ID',
      (_userId, boxKey) => ({ name: 'Evan', memberId: null, boxKey }),
    ],
    [
      'a box key of 63 characters',
      (userId, boxKey) => ({
        name: 'Evan',
        memberId: null,
        userId,
        boxKey: boxKey.slice(1),
      }),
    ],
    [
      'a box key that agrees to nothing with any key',
      (userId) => ({
        name: 'Evan',
        memberId: null,
        userId,
        boxKey: '0'.repeat(64),
      }),
    ],
  ])(
    '[SHARING-192.1] rejects a request that opens and holds %s',
    async (_case, content) => {
      const invite = await taylorInvites();
      const device = await sends(invite, 'Evan', async (id, phone) =>
        sealedRequest(
          invite,
          id,
          content(phone.identity.userId, await boxKeyOf(phone)),
        ),
      );

      expect(await list(invite)).toEqual([]);

      expect(await requestOnApi(invite.code, device)).toBeUndefined();
    },
  );

  test('[SHARING-192.1] leaves alone a request in a ciphertext version it does not know', async () => {
    const invite = await taylorInvites();
    const device = await sends(
      invite,
      'Newer',
      () => `02${toHex(new Uint8Array(randomBytes(296)))}`,
    );

    expect(await list(invite)).toEqual([]);

    expect(await requestOnApi(invite.code, device)).toBeDefined();
  });
});

describe('SHARING-193.1', () => {
  test('[SHARING-193.1] writes nothing of a request it lists into the local data', async () => {
    const { invite, taylor, dana } = await danaAsked({ name: 'Dana K.' });
    const before = everythingIn(taylor);

    expect(await list(invite)).toHaveLength(1);

    expect(everythingIn(taylor)).toEqual(before);
    expect(localDataHolds(taylor, utf8('Dana K.'))).toBe(false);
    expect(localDataHolds(taylor, utf8(dana.identity.userId))).toBe(false);
  });
});

describe('SHARING-194.2', () => {
  test('[SHARING-194.2] does not approve a request for a member that has a phone by now', async () => {
    const { invite, taylor } = await danaApproved({ memberId: 'Casey' });
    const evan = await phoneOf('Evan', invite);
    const { Casey } = await memberIds(taylor);
    const E = await asks(evan, invite, { memberId: Casey });
    const asked = await listed(invite, E);
    const from = mark();

    expect(await approve(invite, asked)).toEqual({
      outcome: 'cannot-approve',
      reason: 'has-a-phone',
    });

    expect(await approvalsBy(taylor, from)).toEqual([]);
    expect(await requestOnApi(invite.code, E)).toBeDefined();
  });

  test('[SHARING-194.2] does not approve a request for its own member, which no roster entry names yet', async () => {
    const invite = await taylorInvites();
    const { taylor, brisbane } = invite;
    const { Taylor } = await memberIds(taylor);
    const evan = await phoneOf('Evan', invite);
    const E = await asks(evan, invite, { memberId: Taylor });
    await sync(taylor);
    await sync(taylor);
    aMinuteOn(taylor);
    const asked = await listed(invite, E);
    const from = mark();

    expect(await approve(invite, asked)).toEqual({
      outcome: 'cannot-approve',
      reason: 'is-you',
    });

    expect(await approvalsBy(taylor, from)).toEqual([]);
    expect(await isMemberDevice(brisbane, E)).toBe(false);
    expect(everythingIn(taylor).sync_records.join('\n')).not.toContain(
      '"device"',
    );
  });

  test.each<[string, string | undefined, string]>([
    ["a new member whose name is a member's", undefined, 'same-name'],
    ['a member that was removed', 'Blake', 'not-a-member'],
  ])(
    '[SHARING-194.2] does not approve a request for %s',
    async (_case, member, reason) => {
      const invite = await taylorInvites();
      const { taylor, brisbane } = invite;
      const ids = await memberIds(taylor);
      const evan = await phoneOf('Evan', invite);
      const E = await asks(evan, invite, {
        name: member ? 'Evan' : ' casey ',
        memberId: member ? ids[member] : null,
      });
      if (member) {
        await on(taylor, () =>
          taylor.groups.removeGroupMember(
            taylor.database,
            brisbane,
            ids[member],
          ),
        );
      }
      aMinuteOn(taylor);

      expect(await approve(invite, await listed(invite, E))).toEqual({
        outcome: 'cannot-approve',
        reason,
      });
      expect(await isMemberDevice(brisbane, E)).toBe(false);
    },
  );
});

describe('SHARING-195.3', () => {
  test('[SHARING-195.3] syncs, uploads a snapshot for the device, and then sends one approval that names it', async () => {
    const { invite, taylor, dana, brisbane, code, D, request } =
      await danaListed();
    const content = (await requestOnApi(code, D))!;
    const from = mark();

    expect(await approve(invite, request)).toEqual(APPROVED);

    const lines = await linesBy(taylor, from);
    const approvals = await approvalsBy(taylor, from);
    expect(approvals).toHaveLength(1);
    const [approval] = approvals;
    expect(approval.path).toBe(`/groups/${brisbane}/requests/${D}/approval`);
    expect(approval.request).toBe(sha256Of(content));
    expect(approval.epoch).toBe(1);
    const download = lines.indexOf(`GET /groups/${brisbane}/events`);
    const chunk = lines.findIndex((line) => line.includes('/chunks/0'));
    const sent = lines.findIndex((line) => line.endsWith('/approval'));
    expect(download).toBeGreaterThanOrEqual(0);
    expect(chunk).toBeGreaterThan(download);
    expect(sent).toBeGreaterThan(chunk);
    // The device is in: the API hands it the snapshot the approval named.
    expect(await isMemberDevice(brisbane, D)).toBe(true);
    const snapshot = (await fetched(dana, brisbane))!;
    expect(snapshot.snapshotId).toBe(approval.snapshotId);
    expect(snapshot.sequence).toBe(approval.cursor);
    expect(await requestOnApi(code, D)).toBeUndefined();
  });

  test('[SHARING-195.3] uploads its own unsent changes before it approves, and the snapshot holds them', async () => {
    const { invite, taylor, dana, brisbane, key, request } = await danaListed();
    goOffline();
    await addExpense(taylor, { title: 'Lunch' });
    goOnline();

    expect(await approve(invite, request)).toEqual(APPROVED);

    expect(await unsent(taylor)).toEqual([]);
    const titlesIn = (await contentFor(dana, key, brisbane)).records.flatMap(
      (record) =>
        record.type === 'expense' ? [record.units.title?.value] : [],
    );
    expect(titlesIn.sort()).toEqual(['Dinner', 'Lunch']);
  });

  test('[SHARING-195.3] syncs once more though the download after its upload got no answer, and sends one approval', async () => {
    const { invite, taylor, brisbane, request } = await danaListed();
    goOffline();
    await addExpense(taylor, { title: 'Lunch' });
    goOnline();
    // The API confirms the upload of Lunch; the download that follows it (SYNC-160.2) gets
    // no answer.
    whenAnswered('POST', async () => noAnswerTo('GET'));
    const from = mark();

    expect(await approve(invite, request)).toEqual(APPROVED);

    const sent = await sentBy(taylor, from);
    const approval = sent.findIndex(({ path }) => path.endsWith('/approval'));
    expect(
      sent
        .slice(0, approval)
        .filter(
          ({ path }) => path.split('?')[0] === `/groups/${brisbane}/events`,
        )
        .map(({ method, reached }) => [method, reached]),
    ).toEqual([
      ['GET', true],
      ['POST', true],
      ['GET', false],
      ['GET', true],
    ]);
    // Its cursor is past Lunch, so the API does not call the approval behind.
    expect(await approvalsBy(taylor, from)).toHaveLength(1);
    expect(await unsent(taylor)).toEqual([]);
  });

  test('[SHARING-195.3] changes nothing on the phone until the API has approved', async () => {
    const { invite, taylor, request } = await danaListed();
    const before = await ledgerOf(taylor);
    noAnswerTo('POST');

    expect(await approve(invite, request)).toEqual({ outcome: 'no-answer' });

    expect(await ledgerOf(taylor)).toEqual(before);
    expect(await unsent(taylor)).toEqual([]);
    expect(everythingIn(taylor).sync_records.join('\n')).not.toContain(
      '"device"',
    );
  });

  test('[SHARING-195.3] sends the cursor it checked at though a sync has moved on since, and does not approve what it could not have checked', async () => {
    const { invite, taylor, dana, brisbane, code, key, D, ids } =
      await danaApproved();
    expect((await ask(dana, invite)).outcome).toBe('joined');
    await sync(taylor);
    const evan = await phoneOf('Evan', invite);
    setClock(evan, LATER);
    const E = await asks(evan, invite, { memberId: ids.Casey });
    const asked = await listed(invite, E);
    const last = (await storedEvents(brisbane)).length;
    const from = mark();
    // While the snapshot is on its way, another member's phone writes that a device is
    // Casey, and Taylor's phone syncs, as it does when the app comes back to the front.
    whenAnswered('PUT', async () => {
      await uploadAs(dana, key, [
        {
          version: 1,
          stamp: { ms: LATER + 1_000, counter: 0, device: D },
          type: 'device',
          id: randomId(),
          units: {
            member: {
              value: {
                memberId: ids.Casey,
                userId: randomId(),
                boxKey: await boxKeyOf(evan),
              },
            },
          },
        },
      ]);
      await sync(taylor);
    });

    expect(await approve(invite, asked)).toEqual({
      outcome: 'cannot-approve',
      reason: 'has-a-phone',
    });

    const approvals = await approvalsBy(taylor, from);
    expect(approvals.map(({ cursor }) => cursor)).toEqual([last]);
    expect((await storedEvents(brisbane)).length).toBe(last + 1);
    expect(await isMemberDevice(brisbane, E)).toBe(false);
    expect(await requestOnApi(code, E)).toBeDefined();
  });

  test('[SHARING-195.3] names the content it listed: a request that was replaced since is answered as gone, and stays', async () => {
    const { invite, taylor, dana, brisbane, code, D, ids, request } =
      await danaListed();
    const old = sha256Of((await requestOnApi(code, D))!);
    const replaced = await send(dana, 'PUT', requestPath(code), {
      request: sealedRequest(invite, D, {
        name: 'Dana',
        memberId: ids.Casey,
        userId: dana.identity.userId,
        boxKey: await boxKeyOf(dana),
      }),
    });
    expect(replaced.status).toBe(200);
    const from = mark();

    expect(await approve(invite, request)).toEqual({ outcome: 'answered' });

    expect(request.request).toBe(old);
    expect(
      (await approvalsBy(taylor, from)).map(({ request: named }) => named),
    ).toEqual([old]);
    expect(sha256Of((await requestOnApi(code, D))!)).not.toBe(old);
    expect(await isMemberDevice(brisbane, D)).toBe(false);
  });
});

describe('SHARING-196.2', () => {
  test('[SHARING-196.2] a first approval of a new member carries its own roster entry, the member and the new roster entry, stamped in turn', async () => {
    const { invite, taylor, dana, A, D, approval } = await danaApproved();
    const { Taylor } = await memberIds(taylor);

    const [own, member, entry] = eventsOf(approval, invite);

    expect(approval.events).toHaveLength(3);
    expect(own).toEqual({
      version: 1,
      stamp: { ms: LATER, counter: 0, device: A },
      type: 'device',
      id: A,
      units: {
        member: {
          value: {
            memberId: Taylor,
            userId: taylor.identity.userId,
            boxKey: await boxKeyOf(taylor),
          },
        },
      },
    });
    expect(member).toEqual({
      version: 1,
      stamp: { ms: LATER, counter: 1, device: A },
      type: 'member',
      id: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      ) as string,
      units: { name: { value: 'Dana' }, removed: { value: false } },
    });
    expect(entry).toEqual({
      version: 1,
      stamp: { ms: LATER, counter: 2, device: A },
      type: 'device',
      id: D,
      units: {
        member: {
          value: {
            memberId: member.id,
            userId: dana.identity.userId,
            boxKey: await boxKeyOf(dana),
          },
        },
      },
    });
    expect(new Set(approval.events.map(({ id }) => id)).size).toBe(3);
  });

  test('[SHARING-196.2] an approval for a member the group has carries no member event', async () => {
    const { invite, A, D, ids, approval } = await danaApproved({
      memberId: 'Casey',
    });

    const sent = eventsOf(approval, invite);

    expect(sent.map(({ type, id }) => [type, id])).toEqual([
      ['device', A],
      ['device', D],
    ]);
    expect(sent[1].units.member.value).toMatchObject({ memberId: ids.Casey });
  });

  test('[SHARING-196.2] a later approval carries only the new roster entry', async () => {
    const { invite, taylor, ids } = await danaApproved();
    const evan = await phoneOf('Evan', invite);
    setClock(evan, LATER);
    const E = await asks(evan, invite, { memberId: ids.Blake });
    const asked = await listed(invite, E);
    const from = mark();

    expect(await approve(invite, asked)).toEqual(APPROVED);

    const [approval] = await approvalsBy(taylor, from);
    expect(
      eventsOf(approval, invite).map(({ type, id }) => [type, id]),
    ).toEqual([['device', E]]);
  });

  test('[SHARING-196.2] does not give the stamps of an approval that failed to a later change', async () => {
    const { invite, taylor, request } = await danaListed();
    const from = mark();
    noAnswerTo('POST');
    expect(await approve(invite, request)).toEqual({ outcome: 'no-answer' });
    const [approval] = await approvalsBy(taylor, from);
    const taken = eventsOf(approval, invite).map(({ stamp }) => stamp.counter);
    goOffline();

    await renameGroup(taylor, 'Brissie');

    const [renamed] = await unsent(taylor);
    expect(renamed.content.stamp.ms).toBe(LATER);
    expect(renamed.content.stamp.counter).toBeGreaterThan(Math.max(...taken));
  });

  test('[SHARING-196.2] checks the stamps before they go into the snapshot and the approval: a latest stamp nine minutes ahead that no record holds is not carried on', async () => {
    const { invite, taylor, dana, brisbane, key, A, D, ids } =
      await danaApproved();
    expect((await ask(dana, invite)).outcome).toBe('joined');
    const gone = randomId();
    // An expense deleted for good, and then a change to it stamped 9 minutes ahead: the
    // change merges and changes no unit, so only the phone's latest stamp remembers it.
    await uploadAs(dana, key, [
      {
        version: 1,
        stamp: { ms: LATER, counter: 5, device: D },
        type: 'expense',
        id: gone,
        deleted: true,
      },
      {
        version: 1,
        stamp: { ms: LATER + 9 * MINUTE, counter: 0, device: D },
        type: 'expense',
        id: gone,
        units: { title: { value: 'Late' } },
      },
    ]);
    const evan = await phoneOf('Evan', invite);
    setClock(evan, LATER);
    const E = await asks(evan, invite, { memberId: ids.Blake });
    await sync(taylor);
    expect(await refusals(taylor)).toEqual([]);
    const asked = await listed(invite, E);
    const from = mark();

    expect(await approve(invite, asked)).toEqual(APPROVED);

    const [approval] = await approvalsBy(taylor, from);
    const [entry] = eventsOf(approval, invite);
    // The latest stamp left is in the millisecond of the corrected time, so the new one is the next.
    expect(entry.stamp).toEqual({ ms: LATER + 1, counter: 0, device: A });
    const { records } = await contentFor(evan, key, brisbane);
    expect(records.find(({ id }) => id === E)).toMatchObject({
      type: 'device',
      created: entry.stamp,
      units: { member: { stamp: entry.stamp } },
    });
  });

  test('[SHARING-196.2] does not send events an hour ahead when the phone stored a latest stamp that nothing holds any more: every phone applies them', async () => {
    const invite = await taylorInvites();
    const FAST = NOW + HOUR;
    setClock(invite.taylor, FAST);
    await addExpense(invite.taylor, { title: 'Late' });
    const copy = await copyOfData(invite.taylor);
    await sync(invite.taylor);
    // Three minutes later the phone, still an hour ahead, is back at the copy: Late takes
    // the stamp the API holds (SYNC-96.1), and nothing holds the stamp it had stored.
    const THEN = NOW + 3 * MINUTE;
    setApiTime(THEN);
    const taylor = await restoreData(invite.taylor, copy);
    setClock(taylor, FAST + 3 * MINUTE);
    const restored = { ...invite, taylor };
    await sync(taylor);
    await sync(taylor);
    expect(await unsent(taylor)).toEqual([]);
    const dana = await phoneOf('Dana', restored);
    setClock(dana, THEN);
    const D = await asks(dana, restored);
    const asked = await listed(restored, D);
    const from = mark();

    expect(await approve(restored, asked)).toEqual(APPROVED);

    const [approval] = await approvalsBy(taylor, from);
    const stamps = eventsOf(approval, restored).map(({ stamp }) => stamp.ms);
    expect(stamps).toHaveLength(3);
    for (const ms of stamps) expect(ms - THEN).toBeLessThanOrEqual(5 * MINUTE);
    expect((await ask(dana, restored)).outcome).toBe('joined');
    await sync(taylor);
    await sync(dana);
    expect(await refusals(taylor)).toEqual([]);
    expect(await refusals(dana)).toEqual([]);
    expect((await membersOn(taylor)).map(({ name }) => name)).toEqual([
      'Taylor',
      'Casey',
      'Blake',
      'Dana',
    ]);
    expect(await ledgerOf(dana)).toEqual(await ledgerOf(taylor));
  });
});

describe('SHARING-197.1', () => {
  test("[SHARING-197.1] the snapshot holds the approval's records beside every record the phone had", async () => {
    const { invite, taylor, dana, brisbane, key, request } = await danaListed();
    const had = everythingIn(taylor).sync_records.length;
    const from = mark();
    expect(await approve(invite, request)).toEqual(APPROVED);
    const [approval] = await approvalsBy(taylor, from);
    const sent = eventsOf(approval, invite);

    const { records } = await contentFor(dana, key, brisbane);

    expect(records).toHaveLength(had + sent.length);
    for (const event of sent) {
      expect(records).toContainEqual({
        type: event.type,
        id: event.id,
        units: Object.fromEntries(
          Object.entries(event.units).map(([unit, { value }]) => [
            unit,
            { value, stamp: event.stamp },
          ]),
        ),
        created: event.stamp,
        seeded: false,
      });
    }
  });

  test('[SHARING-197.1] sends no approval when the snapshot cannot be uploaded', async () => {
    const { invite, taylor, request } = await danaListed();
    const from = mark();
    answerNext('PUT', 413, { error: 'snapshots-full' });

    expect(await approve(invite, request)).toEqual({ outcome: 'failed' });

    expect(await approvalsBy(taylor, from)).toEqual([]);
  });
});

describe('SHARING-198.1', () => {
  test("[SHARING-198.1] the box opens for the device that asked, with the invite's salt, and holds the group key", async () => {
    const { invite, taylor, dana, brisbane, key, approval } =
      await danaApproved();
    const handover = { groupId: brisbane, ...approval };

    expect(await openedBox(dana, invite, handover)).toEqual({
      keys: [{ epoch: 1, key: toHex(key) }],
    });
    expect(approval.senderKey).toBe(await boxKeyOf(taylor));
    expect(drewFromTheRandomSource(fromHex(approval.box).subarray(1, 25))).toBe(
      true,
    );
  });

  test('[SHARING-198.1] the box does not open without the salt, the code, the group or the sender', async () => {
    const { invite, taylor, dana, brisbane, code, approval } =
      await danaApproved();
    const handover = { groupId: brisbane, ...approval };
    expect(await openedBox(dana, invite, handover)).toBeDefined();

    expect(
      await openedBox(dana, invite, handover, { salt: null }),
    ).toBeUndefined();
    expect(
      await openedBox(dana, invite, handover, {
        salt: handoverSalt('ICEiIyQlJicoKSorLC0uLzAxMjM0NTY3ODk6Ozw9Pj8'),
      }),
    ).toBeUndefined();
    expect(
      await openedBox(dana, invite, handover, {
        context: handoverContext('AAECAwQFBgcICQoLDA0ODw', brisbane, 1),
      }),
    ).toBeUndefined();
    expect(
      await openedBox(dana, invite, handover, {
        context: handoverContext(code, randomId(), 1),
      }),
    ).toBeUndefined();
    expect(
      await openedBox(dana, invite, {
        ...handover,
        senderKey: await boxKeyOf(dana),
      }),
    ).toBeUndefined();
    // The phone that sealed it is not the one it is for.
    expect(await openedBox(taylor, invite, handover)).toBeUndefined();
    expect(utf8(HANDOVER)).toHaveLength(33);
  });
});

describe('SHARING-199.1', () => {
  test('[SHARING-199.1] has the new member and the roster once the API has approved, with nothing left to upload', async () => {
    const { taylor, dana } = await danaApproved();

    expect(await membersOn(taylor)).toEqual([
      expect.objectContaining({
        name: 'Taylor',
        userId: taylor.identity.userId,
      }),
      expect.objectContaining({ name: 'Casey', userId: null }),
      expect.objectContaining({ name: 'Blake', userId: null }),
      expect.objectContaining({ name: 'Dana', userId: dana.identity.userId }),
    ]);
    expect(await unsent(taylor)).toEqual([]);
  });

  test('[SHARING-199.1] marks the member a device was approved as', async () => {
    const { taylor, dana } = await danaApproved({ memberId: 'Casey' });

    expect(
      (await membersOn(taylor)).map(({ name, userId }) => [name, userId]),
    ).toEqual([
      ['Taylor', taylor.identity.userId],
      ['Casey', dana.identity.userId],
      ['Blake', null],
    ]);
  });
});

describe('SHARING-200.2', () => {
  test('[SHARING-200.2] reports no answer when the network is gone, and keeps the request', async () => {
    const { invite, code, D, request } = await danaListed();
    goOffline();

    expect(await approve(invite, request)).toEqual({ outcome: 'no-answer' });

    goOnline();
    expect(await requestOnApi(code, D)).toBeDefined();
  });

  test('[SHARING-200.2] reports no answer when the second sync uploads too, and the download after that upload gets none', async () => {
    const { invite, taylor, code, D, request } = await danaListed();
    goOffline();
    await addExpense(taylor, { title: 'Lunch' });
    goOnline();
    // A change is saved while the first sync downloads again, so the second sync uploads
    // as well. The API confirms that upload, and the download that follows it gets no answer.
    whenAnswered('POST', async () =>
      whenAnswered('GET', async () => {
        await addExpense(taylor, { title: 'Supper' });
        whenAnswered('POST', async () => noAnswerTo('GET'));
      }),
    );
    const from = mark();

    expect(await approve(invite, request)).toEqual({ outcome: 'no-answer' });

    const sent = await sentBy(taylor, from);
    expect(sent.map(({ method, reached }) => [method, reached])).toEqual([
      ['GET', true],
      ['POST', true],
      ['GET', true],
      ['GET', true],
      ['POST', true],
      ['GET', false],
    ]);
    expect(await approvalsBy(taylor, from)).toEqual([]);
    expect(await requestOnApi(code, D)).toBeDefined();
  });

  test("[SHARING-200.2] goes on to approve when the download after the second sync's upload is answered with no page: the API calls it behind, and it syncs and sends again", async () => {
    const { invite, taylor, brisbane, D, request } = await danaListed();
    goOffline();
    await addExpense(taylor, { title: 'Lunch' });
    goOnline();
    // A change is saved while the first sync downloads again, so the second sync uploads
    // as well. The API confirms that upload, and the download that follows it is answered
    // with an error: the sync ends there, with the cursor short of the phone's own event.
    whenAnswered('POST', async () =>
      whenAnswered('GET', async () => {
        await addExpense(taylor, { title: 'Supper' });
        whenAnswered('POST', async () => answerNext('GET', 500, {}));
      }),
    );
    const from = mark();

    expect(await approve(invite, request)).toEqual(APPROVED);

    const approvals = await approvalsBy(taylor, from);
    expect(approvals).toHaveLength(2);
    expect(approvals[1].cursor).toBeGreaterThan(approvals[0].cursor);
    expect(approvals[1].snapshotId).toBe(approvals[0].snapshotId);
    expect(await isMemberDevice(brisbane, D)).toBe(true);
  });

  test('[SHARING-200.2] says it failed, not that there is no answer, when a later upload of the second sync got none and the download after it was answered', async () => {
    const { invite, taylor, code, D, request } = await danaListed();
    goOffline();
    await addExpense(taylor, { title: 'Lunch' });
    goOnline();
    // 101 changes are saved while the first sync downloads again, so the second sync
    // uploads them in two requests (SYNC-76.1). The API confirms the first; the second
    // gets no answer, and the download that follows the uploads is answered.
    whenAnswered('POST', async () =>
      whenAnswered('GET', async () => {
        for (let each = 0; each < 101; each += 1) {
          await addExpense(taylor, { title: `Snack ${each}` });
        }
        whenAnswered('POST', async () => noAnswerTo('POST'));
      }),
    );
    const from = mark();

    expect(await approve(invite, request)).toEqual({ outcome: 'failed' });

    const sent = await sentBy(taylor, from);
    expect(sent.map(({ method, reached }) => [method, reached])).toEqual([
      ['GET', true],
      ['POST', true],
      ['GET', true],
      ['GET', true],
      ['POST', true],
      ['POST', false],
      ['GET', true],
    ]);
    expect(await approvalsBy(taylor, from)).toEqual([]);
    expect(await unsent(taylor)).toHaveLength(1);
    expect(await requestOnApi(code, D)).toBeDefined();
  });

  test('[SHARING-200.2] approves though the snapshot it uploads for another member device at the end of the sync gets no answer', async () => {
    const { invite, taylor, dana, brisbane } = await danaApproved();
    expect((await ask(dana, invite)).outcome).toBe('joined');
    // Taylor's phone asks for a snapshot and the API has none for it: from now on a page
    // names it to the other member devices (SYNC-108.2, SYNC-162.1).
    expect(await fetched(taylor, brisbane)).toBeUndefined();
    const evan = await phoneOf('Evan', invite);
    const E = await asks(evan, invite);
    // Dana's phone approves: it is a member, and holds the invite.
    const asDana = { ...invite, taylor: dana };
    const request = await listed(asDana, E);
    // The first snapshot it uploads is the one for Taylor's phone, when its sync ends.
    noAnswerTo('PUT');
    const from = mark();

    expect(await approve(asDana, request)).toEqual(APPROVED);

    const sent = await sentBy(dana, from);
    const approval = sent.findIndex(({ path }) => path.endsWith('/approval'));
    const puts = sent
      .slice(0, approval)
      .filter(({ method }) => method === 'PUT');
    expect(puts[0].reached).toBe(false);
    expect(puts.slice(1).every(({ reached }) => reached)).toBe(true);
    const [sentApproval] = await approvalsBy(dana, from);
    expect((await fetched(evan, brisbane))!.snapshotId).toBe(
      sentApproval.snapshotId,
    );
    expect(await isMemberDevice(brisbane, E)).toBe(true);
  });

  test('[SHARING-200.2] reports a request another member has answered', async () => {
    const { invite, taylor, D, request } = await danaListed();
    expect(
      (
        await sendAs(
          taylor,
          'DELETE',
          `${decisionPath(invite, D)}?request=${request.request}`,
        )
      ).status,
    ).toBe(200);

    expect(await approve(invite, request)).toEqual({ outcome: 'answered' });
  });

  test('[SHARING-200.2] syncs and sends the approval again when the API says it is behind', async () => {
    const { invite, taylor, brisbane, request } = await danaListed();
    const from = mark();
    answerNext('POST', 409, { error: 'behind' });

    expect(await approve(invite, request)).toEqual(APPROVED);

    const [first, second] = await approvalsBy(taylor, from);
    expect(second.snapshotId).toBe(first.snapshotId);
    expect(second.events).toEqual(first.events);
    const lines = await linesBy(taylor, from);
    const approvals = lines.flatMap((line, index) =>
      line.endsWith('/approval') ? [index] : [],
    );
    expect(approvals).toHaveLength(2);
    expect(
      lines
        .slice(approvals[0], approvals[1])
        .includes(`GET /groups/${brisbane}/events`),
    ).toBe(true);
  });

  test('[SHARING-200.2] gives up after three approvals that the API calls behind', async () => {
    const { invite, taylor, code, D, request } = await danaListed();
    const from = mark();
    for (let each = 0; each < 3; each += 1) {
      answerNext('POST', 409, { error: 'behind' });
    }

    expect(await approve(invite, request)).toEqual({ outcome: 'failed' });

    expect(await approvalsBy(taylor, from)).toHaveLength(3);
    expect(await requestOnApi(code, D)).toBeDefined();
  });

  test('[SHARING-200.2] uploads another snapshot once when the API has none for the approval', async () => {
    const { invite, taylor, dana, brisbane, request } = await danaListed();
    const from = mark();
    answerNext('POST', 404, { error: 'no-snapshot' });

    expect(await approve(invite, request)).toEqual(APPROVED);

    const [first, second] = await approvalsBy(taylor, from);
    expect(second.snapshotId).not.toBe(first.snapshotId);
    expect((await fetched(dana, brisbane))!.snapshotId).toBe(second.snapshotId);
  });

  test('[SHARING-200.2] fails when the API has no snapshot a second time, or refuses in another way', async () => {
    const { invite, request } = await danaListed();
    answerNext('POST', 404, { error: 'no-snapshot' });
    answerNext('POST', 404, { error: 'no-snapshot' });

    expect(await approve(invite, request)).toEqual({ outcome: 'failed' });

    answerNext('POST', 409, { error: 'epoch', epoch: 2 });
    expect(await approve(invite, request)).toEqual({ outcome: 'failed' });
    answerNext('POST', 409, { error: 'members-full' });
    expect(await approve(invite, request)).toEqual({ outcome: 'members-full' });
  });
});

describe('SHARING-201.1', () => {
  test('[SHARING-201.1] rejects a request on the API, and changes nothing on the phone', async () => {
    const { invite, taylor, brisbane, code, D, request } = await danaListed();
    const content = (await requestOnApi(code, D))!;
    const before = everythingIn(taylor);
    const from = mark();

    expect(await reject(invite, request)).toEqual({ outcome: 'rejected' });

    expect(
      (await sentBy(taylor, from)).map(
        ({ method, path, body }) => `${method} ${path} ${body.length}`,
      ),
    ).toEqual([
      `DELETE /groups/${brisbane}/requests/${D}?request=${sha256Of(content)} 0`,
    ]);
    expect(await requestOnApi(code, D)).toBeUndefined();
    expect(await isMemberDevice(brisbane, D)).toBe(false);
    expect(everythingIn(taylor)).toEqual(before);
  });

  test('[SHARING-201.1] reports no answer, and a request that was answered', async () => {
    const { invite, request } = await danaListed();
    goOffline();
    expect(await reject(invite, request)).toEqual({ outcome: 'no-answer' });
    goOnline();
    expect(await reject(invite, request)).toEqual({ outcome: 'rejected' });

    expect(await reject(invite, request)).toEqual({ outcome: 'answered' });
  });

  test('[SHARING-201.1] names the content it listed: a request that was replaced since is not rejected', async () => {
    const { invite, dana, code, D, request } = await danaListed({
      memberId: 'Casey',
    });
    const replaced = await send(dana, 'PUT', requestPath(code), {
      request: sealedRequest(invite, D, {
        name: 'Dana',
        memberId: null,
        userId: dana.identity.userId,
        boxKey: await boxKeyOf(dana),
      }),
    });
    expect(replaced.status).toBe(200);
    const now = (await requestOnApi(code, D))!;

    expect(await reject(invite, request)).toEqual({ outcome: 'answered' });

    expect(await requestOnApi(code, D)).toEqual(now);
    expect(await list(invite)).toEqual([
      expect.objectContaining({ deviceId: D, memberId: null }),
    ]);
  });
});

describe('SHARING-203.1', () => {
  test('[SHARING-203.1] sends names, IDs and keys only as ciphertext', async () => {
    const { invite, taylor, dana, key, secret, approval } = await danaApproved({
      name: 'Dana K.',
    });
    const [, member] = eventsOf(approval, invite);
    const secrets = [
      'Dana K.',
      dana.identity.userId,
      await boxKeyOf(dana),
      member.id,
      toHex(key),
      secret,
      toHex(handoverSalt(secret)),
    ];

    for (const request of await sentBy(taylor)) {
      for (const text of secrets) {
        expect(requestHolds(request, text)).toBe(false);
      }
    }
  });
});

describe('SHARING-211.1', () => {
  test('[SHARING-211.1] finds a request that waits still waiting', async () => {
    const { invite, dana } = await danaAsked();

    expect(await ask(dana, invite)).toEqual({ outcome: 'waiting' });

    expect(await hasGroup(dana)).toBe(false);
  });
});

describe('SHARING-213.1', () => {
  test('[SHARING-213.1] learns it was rejected, and keeps nothing of the group but its name', async () => {
    const { invite, dana, brisbane, code, secret, request } =
      await danaListed();
    expect(await reject(invite, request)).toEqual({ outcome: 'rejected' });

    expect(await ask(dana, invite)).toEqual({ outcome: 'declined' });

    expect(await hasGroup(dana)).toBe(false);
    expect(localDataHolds(dana, utf8(secret))).toBe(false);
    expect(localDataHolds(dana, utf8(code))).toBe(false);
    expect(localDataHolds(dana, utf8('Brisbane'))).toBe(true);
    expect(secureStoreEntry(dana, keyEntry(brisbane, 1))).toBeUndefined();
  });
});

describe('SHARING-214.1', () => {
  test('[SHARING-214.1] learns that its invite is gone, and keeps nothing of the group but its name', async () => {
    const { invite, taylor, dana, brisbane, code, secret } = await danaAsked();
    expect(
      (await send(taylor, 'DELETE', `/groups/${brisbane}/invites/${code}`))
        .status,
    ).toBe(200);

    expect(await ask(dana, invite)).toEqual({ outcome: 'invalid' });

    expect(await hasGroup(dana)).toBe(false);
    expect(localDataHolds(dana, utf8(secret))).toBe(false);
    expect(localDataHolds(dana, utf8('Brisbane'))).toBe(true);
  });
});

describe('SHARING-215.1', () => {
  test('[SHARING-215.1] leaves the request as it was when it cannot ask', async () => {
    const { invite, dana, D, code } = await danaAsked();
    const before = everythingIn(dana);
    goOffline();

    expect(await ask(dana, invite)).toEqual({ outcome: 'no-answer' });

    goOnline();
    expect(everythingIn(dana)).toEqual(before);
    expect(await requestOnApi(code, D)).toBeDefined();
  });
});

describe('SHARING-216.1', () => {
  test('[SHARING-216.1] opens the box of its approval and has the group key', async () => {
    const { invite, dana, brisbane, key } = await danaApproved();

    expect(await ask(dana, invite)).toEqual({
      outcome: 'joined',
      groupId: brisbane,
    });

    expect(secureStoreEntry(dana, keyEntry(brisbane, 1))?.value).toBe(
      toHex(key),
    );
  });

  /** Taylor's phone approves Dana's request as another build would: a plain snapshot, and whatever box and events a test gives. */
  async function approvedByHand(
    world: Awaited<ReturnType<typeof danaAsked>>,
    box: (key: Uint8Array) => Promise<string>,
  ) {
    const { taylor, dana, brisbane, code, key, A, D } = world;
    const content = (await requestOnApi(code, D))!;
    const snapshot = await sentSnapshot(taylor, D, brisbane);
    expect((await storedEvents(brisbane)).length).toBe(snapshot.sequence);
    const eventId = randomId();
    const answer = await sendAs(
      taylor,
      'POST',
      `/groups/${brisbane}/requests/${D}/approval`,
      {
        request: sha256Of(content),
        cursor: snapshot.sequence,
        snapshotId: snapshot.snapshotId,
        senderKey: await boxKeyOf(taylor),
        epoch: 1,
        box: await box(key),
        events: [
          {
            id: eventId,
            content: sealed(
              key,
              { groupId: brisbane, eventId, deviceId: A, epoch: 1 },
              {
                version: 1,
                stamp: { ms: LATER, counter: 0, device: A },
                type: 'device',
                id: D,
                units: {
                  member: {
                    value: {
                      memberId: world.ids.Casey,
                      userId: dana.identity.userId,
                      boxKey: await boxKeyOf(dana),
                    },
                  },
                },
              },
            ),
          },
        ],
      },
    );
    expect(answer.status).toBe(200);
  }

  test.each<
    [
      string,
      (
        world: Awaited<ReturnType<typeof danaAsked>>,
        key: Uint8Array,
      ) => Promise<string>,
    ]
  >([
    [
      "another invite's secret",
      ({ taylor, dana, invite }, key) =>
        boxFor(
          taylor,
          dana,
          invite,
          { keys: [{ epoch: 1, key: toHex(key) }] },
          {
            secret: 'ICEiIyQlJicoKSorLC0uLzAxMjM0NTY3ODk6Ozw9Pj8',
          },
        ),
    ],
    [
      'another group in its context',
      ({ taylor, dana, invite }, key) =>
        boxFor(
          taylor,
          dana,
          invite,
          { keys: [{ epoch: 1, key: toHex(key) }] },
          {
            groupId: randomId(),
          },
        ),
    ],
    [
      'another phone as its sender',
      ({ dana, invite }, key) =>
        boxFor(dana, dana, invite, { keys: [{ epoch: 1, key: toHex(key) }] }),
    ],
    [
      'no key in it',
      ({ taylor, dana, invite }) => boxFor(taylor, dana, invite, { keys: [] }),
    ],
    [
      'a key that is no key',
      ({ taylor, dana, invite }) =>
        boxFor(taylor, dana, invite, { keys: [{ epoch: 1, key: 'abc' }] }),
    ],
    [
      'a key of another epoch than the answer names',
      ({ taylor, dana, invite }, key) =>
        boxFor(taylor, dana, invite, { keys: [{ epoch: 2, key: toHex(key) }] }),
    ],
    [
      'an object with no keys',
      ({ taylor, dana, invite }) => boxFor(taylor, dana, invite, {}),
    ],
    [
      'keys whose epochs go down',
      ({ taylor, dana, invite }, key) =>
        boxFor(taylor, dana, invite, {
          keys: [
            { epoch: 2, key: toHex(key) },
            { epoch: 1, key: toHex(key) },
          ],
        }),
    ],
    [
      'one bit changed',
      async ({ taylor, dana, invite }, key) => {
        const box = fromHex(
          await boxFor(taylor, dana, invite, {
            keys: [{ epoch: 1, key: toHex(key) }],
          }),
        );
        box[box.length - 1] ^= 1;
        return toHex(box);
      },
    ],
  ])(
    '[SHARING-216.1] does not join, and saves no key, when the box has %s',
    async (_case, box) => {
      const world = await danaAsked();
      const { invite, dana, brisbane } = world;
      await approvedByHand(world, (key) => box(world, key));
      const from = mark();

      expect(await ask(dana, invite)).toEqual({
        outcome: 'approved',
        reason: 'failed',
      });

      expect(secureStoreEntry(dana, keyEntry(brisbane, 1))).toBeUndefined();
      expect(await linesBy(dana, from)).not.toContain(
        `GET /groups/${brisbane}/snapshot`,
      );
      expect(await hasGroup(dana)).toBe(false);
    },
  );

  test('[SHARING-218.1] does not take in a snapshot whose roster names neither the approving phone nor itself', async () => {
    const world = await danaAsked();
    const { invite, taylor, dana } = world;
    // The box is right; the snapshot is one that holds no roster entry.
    await approvedByHand(world, (key) =>
      boxFor(taylor, dana, invite, { keys: [{ epoch: 1, key: toHex(key) }] }),
    );
    const before = await titles(taylor);

    expect(await ask(dana, invite)).toEqual({
      outcome: 'approved',
      reason: 'failed',
    });

    expect(await hasGroup(dana)).toBe(false);
    expect(await titles(taylor)).toEqual(before);
  });
});

describe('SHARING-219.2', () => {
  test('[SHARING-219.2] joins as the new member: the ledger is the same on both phones, and the request is gone', async () => {
    const { invite, taylor, dana, brisbane, approval } = await danaApproved();
    const from = mark();

    expect(await ask(dana, invite)).toEqual({
      outcome: 'joined',
      groupId: brisbane,
    });

    expect(await ledgerOf(dana)).toEqual(await ledgerOf(taylor));
    expect(
      (await membersOn(dana)).map(({ name, userId }) => [name, userId]),
    ).toEqual([
      ['Taylor', taylor.identity.userId],
      ['Casey', null],
      ['Blake', null],
      ['Dana', dana.identity.userId],
    ]);
    expect(
      await on(dana, () => dana.sharing.listJoinRequests(dana.database)),
    ).toEqual([]);
    // It went on from the number its snapshot covers.
    expect(
      (await sentBy(dana, from)).map(({ method, path }) => `${method} ${path}`),
    ).toContain(`GET /groups/${brisbane}/events?after=${approval.cursor}`);
  });

  test('[SHARING-219.2] joins as the member it picked, and keeps its own name', async () => {
    const { invite, dana } = await danaApproved({ memberId: 'Casey' });

    expect((await ask(dana, invite)).outcome).toBe('joined');

    expect(
      (await membersOn(dana)).map(({ name, userId }) => [
        name,
        userId === dana.identity.userId,
      ]),
    ).toEqual([
      ['Taylor', false],
      ['Casey', true],
      ['Blake', false],
    ]);
  });

  test('[SHARING-219.2] records in the ledger it joined, and both phones end the same', async () => {
    const { invite, taylor, dana, brisbane } = await danaApproved();
    expect((await ask(dana, invite)).outcome).toBe('joined');

    await addExpense(dana, { title: 'Lunch' });
    await sync(dana);
    await addExpense(taylor, { title: 'Taxi' });
    await sync(taylor);
    await sync(dana);

    expect(await titles(dana)).toEqual(['Dinner', 'Lunch', 'Taxi']);
    expect(await ledgerOf(dana)).toEqual(await ledgerOf(taylor));
    // Dana's events are her device's own: the API stored them under it.
    expect(
      (await storedEvents(brisbane)).map(({ deviceId: by }) => by),
    ).toContain(await deviceId(dana));
  });
});

describe('SHARING-222.1', () => {
  test('[SHARING-222.1] drops its request when the API says the phone is a member already', async () => {
    const world = await danaAsked();
    const { invite, brisbane, D } = world;
    // The phone's data as it is while the request waits.
    const waiting = await copyOfData(world.dana);
    expect(await approve(invite, await listed(invite, D))).toEqual(APPROVED);
    expect((await ask(world.dana, invite)).outcome).toBe('joined');
    // It has downloaded the group's events since, so the API holds no handover for it.
    const dana = await restoreData(world.dana, waiting);
    setClock(dana, LATER);
    const from = mark();

    expect(await ask(dana, invite)).toEqual({ outcome: 'already-a-member' });

    expect(
      await on(dana, () => dana.sharing.listJoinRequests(dana.database)),
    ).toEqual([]);
    expect(await linesBy(dana, from)).not.toContain(
      `GET /groups/${brisbane}/snapshot`,
    );
    expect(await hasGroup(dana)).toBe(false);
  });
});
