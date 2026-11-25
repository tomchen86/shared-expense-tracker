import { Buffer } from 'node:buffer';
import { deriveKey, openBox } from '@shared-expense/domain/crypto';
import {
  approvalsBy,
  asks,
  boxKeyOf,
  boxSecretOf,
  endApprovalWorld,
  hasGroup,
  isMemberDevice,
  membersOn,
  on,
  openedBox,
  phoneOf,
  requestOnApi,
  sealedRequest,
  sendAs,
  startApprovalWorld,
  taylorInvites,
  type Inviting,
} from './sharing-approval-app';
import { DAY, cleanUpAt } from './sync-catch-up-app';
import {
  MINUTE,
  NOW,
  addExpense,
  addPersonalExpense,
  answerNext,
  copyOfData,
  deviceId,
  drewFromTheRandomSource,
  fromHex,
  goOffline,
  goOnline,
  importData,
  keyEntry,
  keyOf,
  ledgerOf,
  loseAnswerTo,
  mark,
  memberIds,
  noAnswerTo,
  opened,
  requestHolds,
  secureStoreEntry,
  sent,
  sentBy,
  setApiTime,
  storedEvents,
  restart,
  setClock,
  sync,
  takeKey,
  titles,
  toHex,
  unsent,
  uploads,
  utf8,
  whenAnswered,
  type Phone,
  type Sent,
} from './sync-loop-app';
import { contentFor } from './sync-snapshot-app';

// Runs in Node against the real API (sharing-approval-app): a member's new phone asks to
// take the member over, another member's phone approves, and one request removes the old
// phone, lets the new one in and rotates the group key (ADR-0015, ADR-0047). Taylor's
// phone approves, Dana's phone is the one that is replaced, and the new phone is the one
// that asks. No test here adds or removes a member device by hand.

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

const ROTATION = 'shared-expense/group-key/rotation/v1';
const REPLACED = 'x-replaced';
const LATER = NOW + MINUTE;
const APPROVED = { outcome: 'approved' };
const NOT_A_MEMBER = { error: 'not-a-member' };

interface Joined {
  invite: Inviting;
  taylor: Phone;
  /** Taylor's device ID. */
  A: string;
  dana: Phone;
  /** Dana's device ID. */
  D: string;
  brisbane: string;
  /** Brisbane's group key of key epoch 1. */
  key: Uint8Array;
  /** The members' IDs by name, Dana's among them. */
  ids: Record<string, string>;
}

const list = ({ taylor, brisbane }: Pick<Inviting, 'taylor' | 'brisbane'>) =>
  on(taylor, () =>
    taylor.sharing.listReceivedJoinRequests(taylor.database, brisbane),
  );
type Listed = Awaited<ReturnType<typeof list>>[number];

/** The request of `device` as Taylor's phone lists it, once that phone can approve. */
async function listedFor(invite: Inviting, device: string): Promise<Listed> {
  // Nothing unsent, and the cursor at the group's last number: an approval needs both.
  await sync(invite.taylor);
  await sync(invite.taylor);
  const request = (await list(invite)).find(
    ({ deviceId: by }) => by === device,
  );
  if (!request) throw new Error('Taylor’s phone lists no such request');
  return request;
}

const approve = ({ taylor, brisbane }: Inviting, request: Listed) =>
  on(taylor, () =>
    taylor.sharing.approveJoinRequest(taylor.database, brisbane, request),
  );
const ask = (phone: Phone, { code }: Pick<Inviting, 'code'>) =>
  on(phone, () => phone.sharing.askJoinResult(phone.database, code));
const copyOn = (phone: Phone, brisbane: string) =>
  phone.sync.readOnlyCopyOf(phone.database, brisbane);

/**
 * Asks to join through Taylor's invite as `name`, a new member unless `memberId` names
 * one, has Taylor's phone approve it, and joins.
 */
async function joins(
  invite: Inviting,
  name: string,
  memberId: string | null = null,
) {
  const phone = await phoneOf(name, invite);
  const device = await asks(phone, invite, { memberId });
  expect(await approve(invite, await listedFor(invite, device))).toEqual(
    APPROVED,
  );
  expect(await ask(phone, invite)).toMatchObject({ outcome: 'joined' });
  await sync(phone);
  await sync(invite.taylor);
  return { phone, device };
}

/** Taylor's phone with Brisbane, and Dana's phone, which joined it as a new member. Every clock is at LATER. */
async function danaIn(): Promise<Joined> {
  const invite = await taylorInvites();
  setApiTime(LATER);
  setClock(invite.taylor, LATER);
  const { phone: dana, device: D } = await joins(invite, 'Dana');
  setClock(dana, LATER);
  return {
    invite,
    taylor: invite.taylor,
    A: invite.A,
    dana,
    D,
    brisbane: invite.brisbane,
    key: invite.key,
    ids: await memberIds(invite.taylor),
  };
}

/** A new invite of Taylor's phone: the one from before a device left is revoked by then (SHARING-284.1). */
async function invitesAgain({ invite, taylor, brisbane }: Joined) {
  const again = await on(taylor, () =>
    taylor.sharing.prepareInvite(taylor.database, brisbane),
  );
  if (typeof again === 'string') throw new Error(`No invite: ${again}`);
  return { ...invite, code: again.code, secret: again.secret };
}

/** The user ID the phone's local data holds now. */
async function userIdOf(phone: Phone): Promise<string> {
  const [{ userId }] = await phone.database.all<{ userId: string }>(
    'SELECT userId FROM local_identity',
  );
  return userId;
}

/**
 * The phone sends, through the app as Send Request does, a request to take `memberId`
 * over, under `name`. Resolves with what the app says of it.
 */
async function sendsTakeover(
  phone: Phone,
  invite: Pick<Inviting, 'code' | 'secret'>,
  memberId: string,
  { name = 'Dana K.', copyGroupId = null as string | null } = {},
) {
  const userId = await userIdOf(phone);
  return on(phone, () =>
    phone.sharing.sendJoinRequest(
      phone.database,
      {
        code: invite.code,
        secret: invite.secret,
        groupName: 'Brisbane',
        name,
        memberId,
        takeover: true,
        sent: 0,
        copyGroupId,
      },
      userId,
      true,
      () => undefined,
    ),
  );
}

interface Asked extends Joined {
  /** The new phone, and its device ID. */
  newer: Phone;
  N: string;
  /** What Taylor's phone lists for the new phone. */
  request: Listed;
}

/** Dana is in, and a new phone has asked to take her over: Taylor's phone lists its request. */
async function newPhoneAsks(world?: Joined): Promise<Asked> {
  const joined = world ?? (await danaIn());
  const newer = await phoneOf('Newer', joined.invite);
  setClock(newer, LATER);
  expect(
    await sendsTakeover(newer, joined.invite, joined.ids.Dana),
  ).toMatchObject({ kind: 'request', request: { sent: 1 } });
  const N = await deviceId(newer);
  const request = await listedFor(joined.invite, N);
  return { ...joined, newer, N, request };
}

interface SentTakeover {
  path: string;
  request: string;
  cursor: number;
  snapshotId: string;
  senderKey: string;
  epoch: number;
  box: string;
  remove: string[];
  boxes: { deviceId: string; box: string }[];
  events: { id: string; content: string }[];
}

const pathOf = ({ path }: Sent) => path.split('?')[0];
const lines = async (phone: Phone, from: number) =>
  (await sentBy(phone, from)).map(
    (request) => `${request.method} ${pathOf(request)}`,
  );

/** The takeovers a phone has sent since `from`, each as its body reads. */
const takeoversBy = async (phone: Phone, from = 0): Promise<SentTakeover[]> =>
  (await sentBy(phone, from))
    .filter(
      (request) =>
        request.method === 'POST' && pathOf(request).endsWith('/takeover'),
    )
    .map(({ path, body }) => ({
      path,
      ...(JSON.parse(Buffer.from(body).toString('utf8')) as Omit<
        SentTakeover,
        'path'
      >),
    }));

/** How many requests a phone sent since `from` that upload a snapshot's chunk. */
const chunksBy = async (phone: Phone, from: number) =>
  (await lines(phone, from)).filter(
    (line) => line.startsWith('PUT ') && line.includes('/snapshots/'),
  ).length;

/** What a takeover's events hold, opened with `key` as Taylor's upload under `epoch`; undefined where one does not open. */
const eventsOf = (
  takeover: SentTakeover,
  { brisbane, A }: Pick<Joined, 'brisbane' | 'A'>,
  key: Uint8Array,
  epoch = takeover.epoch,
) =>
  takeover.events.map(({ id, content }) => {
    const plaintext = opened(
      key,
      { groupId: brisbane, eventId: id, deviceId: A, epoch },
      fromHex(content),
    );
    return plaintext === undefined
      ? undefined
      : (JSON.parse(Buffer.from(plaintext).toString('utf8')) as {
          version: number;
          stamp: { ms: number; counter: number; device: string };
          type: string;
          id: string;
          units: Record<string, { value: unknown; base?: unknown }>;
        });
  });

/** What a rotation's box holds once `recipient` opens it as SHARING-272.1 says; undefined when it does not open. */
async function openedRotationBox(
  recipient: Phone,
  takeover: SentTakeover,
  device: string,
  with_: { groupId: string; previous: Uint8Array; epoch?: number },
): Promise<unknown> {
  const entry = takeover.boxes.find(({ deviceId: to }) => to === device);
  if (!entry) return undefined;
  const result = openBox({
    recipientSecretKey: await boxSecretOf(recipient),
    senderPublicKey: fromHex(takeover.senderKey),
    context: utf8(
      [
        ROTATION,
        with_.groupId,
        device,
        String(with_.epoch ?? takeover.epoch),
      ].join('\n'),
    ),
    salt: deriveKey({ secret: with_.previous, purpose: ROTATION }),
    box: fromHex(entry.box),
  });
  return result.ok
    ? (JSON.parse(Buffer.from(result.plaintext).toString('utf8')) as unknown)
    : undefined;
}

const namesOf = (people: { name: string }[]) => people.map(({ name }) => name);

/** The user ID Taylor's phone holds for a member: the one of the phone that represents them. */
const userOf = async (phone: Phone, name: string) =>
  (await membersOn(phone)).find((member) => member.name === name)?.userId;

describe('SHARING-191.2', () => {
  test('[SHARING-191.2] reads from a request that it asks to take a member over', async () => {
    const { request, ids, N } = await newPhoneAsks();

    expect(request).toMatchObject({
      deviceId: N,
      name: 'Dana K.',
      memberId: ids.Dana,
      takeover: true,
    });
  });

  test('[SHARING-191.2] reads a request without the field as one that takes nobody over', async () => {
    const world = await danaIn();
    const evan = await phoneOf('Evan', world.invite);
    const E = await asks(evan, world.invite, { memberId: world.ids.Casey });

    const request = await listedFor(world.invite, E);

    expect(request.memberId).toBe(world.ids.Casey);
    expect(request.takeover ?? false).toBe(false);
    // The control: the same phone's request to take Dana over says so.
    expect((await newPhoneAsks(world)).request.takeover).toBe(true);
  });

  test.each([
    ['false', { takeover: false }],
    ['a text', { takeover: 'yes' }],
    ['a number', { takeover: 1 }],
    ['null', { takeover: null }],
    ['true for a new member', { takeover: true, memberId: null }],
  ])(
    '[SHARING-191.2] does not list a request whose takeover is %s, and rejects it',
    async (_, written) => {
      const world = await danaIn();
      const { invite, ids } = world;
      const evan = await phoneOf('Evan', invite);
      const E = await asks(evan, invite, { memberId: ids.Casey });
      const content = sealedRequest(invite, E, {
        name: 'Evan',
        memberId: ids.Casey,
        userId: evan.identity.userId,
        boxKey: await boxKeyOf(evan),
        ...written,
      });
      expect(
        (
          await sendAs(evan, 'PUT', `/invites/${invite.code}/request`, {
            request: content,
          })
        ).status,
      ).toBe(200);
      await sync(invite.taylor);
      await sync(invite.taylor);

      const listed = await list(invite);

      expect(listed.map(({ deviceId: by }) => by)).not.toContain(E);
      expect(await requestOnApi(invite.code, E)).toBeUndefined();
    },
  );
});

describe('SHARING-194.2', () => {
  test('[SHARING-194.2] approves a request to take over a member another phone represents', async () => {
    const world = await newPhoneAsks();

    expect(await approve(world.invite, world.request)).toEqual(APPROVED);

    expect(await isMemberDevice(world.brisbane, world.N)).toBe(true);
    expect(await isMemberDevice(world.brisbane, world.D)).toBe(false);
  });

  test('[SHARING-194.2] does not approve a request to take over the approving phone’s own member', async () => {
    const world = await danaIn();
    const { invite, taylor, brisbane, ids, A } = world;
    const newer = await phoneOf('Newer', invite);
    expect(await sendsTakeover(newer, invite, ids.Taylor)).toMatchObject({
      kind: 'request',
    });
    const request = await listedFor(invite, await deviceId(newer));
    expect(request.takeover).toBe(true);
    const from = mark();

    expect(await approve(invite, request)).toMatchObject({
      outcome: 'cannot-approve',
    });

    expect(await takeoversBy(taylor, from)).toEqual([]);
    expect(await approvalsBy(taylor, from)).toEqual([]);
    expect(await isMemberDevice(brisbane, A)).toBe(true);
  });

  test('[SHARING-194.2] does not approve a request to take over a member no phone represents', async () => {
    const world = await danaIn();
    const { invite, taylor, brisbane, ids } = world;
    const newer = await phoneOf('Newer', invite);
    expect(await sendsTakeover(newer, invite, ids.Casey)).toMatchObject({
      kind: 'request',
    });
    const N = await deviceId(newer);
    const request = await listedFor(invite, N);
    const from = mark();

    expect(await approve(invite, request)).toMatchObject({
      outcome: 'cannot-approve',
    });

    expect(await takeoversBy(taylor, from)).toEqual([]);
    expect(await approvalsBy(taylor, from)).toEqual([]);
    expect(await isMemberDevice(brisbane, N)).toBe(false);
  });

  test('[SHARING-194.2] does not turn a request for a member into a takeover when that member has a phone by now', async () => {
    const world = await danaIn();
    const { invite, taylor, brisbane, ids } = world;
    const evan = await phoneOf('Evan', invite);
    const E = await asks(evan, invite, { memberId: ids.Casey });
    // Another phone is approved as Casey meanwhile.
    const { device: F } = await joins(invite, 'Finn', ids.Casey);
    const request = await listedFor(invite, E);
    const from = mark();

    expect(await approve(invite, request)).toMatchObject({
      outcome: 'cannot-approve',
    });

    expect(await takeoversBy(taylor, from)).toEqual([]);
    expect(await isMemberDevice(brisbane, F)).toBe(true);
    expect(await isMemberDevice(brisbane, E)).toBe(false);
    // The control: asked as a takeover, the same choice is approved, and takes Finn's phone out.
    const newer = await phoneOf('Newer', invite);
    expect(await sendsTakeover(newer, invite, ids.Casey)).toMatchObject({
      kind: 'request',
    });
    const N = await deviceId(newer);
    expect(await approve(invite, await listedFor(invite, N))).toEqual(APPROVED);
    expect(await isMemberDevice(brisbane, F)).toBe(false);
  });
});

describe('SHARING-322.1', () => {
  test('[SHARING-322.1] syncs, uploads the snapshot, and sends one takeover: no approval and no rotation', async () => {
    const world = await newPhoneAsks();
    const { invite, taylor, brisbane, A, D, N, request } = world;
    const from = mark();

    expect(await approve(invite, request)).toEqual(APPROVED);

    const sentLines = await lines(taylor, from);
    expect(sentLines[0]).toBe(`GET /groups/${brisbane}/events`);
    const takeoverAt = sentLines.indexOf(
      `POST /groups/${brisbane}/requests/${N}/takeover`,
    );
    const lastChunkAt = sentLines
      .map((line) => line.startsWith('PUT ') && line.includes('/snapshots/'))
      .lastIndexOf(true);
    expect(lastChunkAt).toBeGreaterThan(0);
    expect(takeoverAt).toBeGreaterThan(lastChunkAt);
    expect(
      sentLines.filter(
        (line) => line.endsWith('/approval') || line.endsWith('/rotation'),
      ),
    ).toEqual([]);
    const [takeover] = await takeoversBy(taylor, from);
    expect(takeover).toMatchObject({
      request: request.request,
      epoch: 2,
      remove: [D],
      senderKey: await boxKeyOf(taylor),
    });
    expect(takeover.boxes.map(({ deviceId: to }) => to)).toEqual([A]);
    const snapshot = await contentFor(world.newer, world.key);
    expect(takeover.cursor).toBe(snapshot.sequence);
    expect(sentLines[lastChunkAt]).toContain(takeover.snapshotId);
  });

  test('[SHARING-322.1] changes nothing on the phone before the API has answered', async () => {
    const world = await newPhoneAsks();
    const { invite, taylor, brisbane, request, dana } = world;
    const before = {
      members: await membersOn(taylor),
      unsent: await unsent(taylor),
    };
    let during: typeof before | undefined;
    let keyDuring: unknown = 'not read';
    whenAnswered('POST', async () => {
      during = {
        members: await membersOn(taylor),
        unsent: await unsent(taylor),
      };
      keyDuring = secureStoreEntry(taylor, keyEntry(brisbane, 2));
    });

    expect(await approve(invite, request)).toEqual(APPROVED);

    expect(during).toEqual(before);
    expect(keyDuring).toBeUndefined();
    expect(await userOf(taylor, 'Dana')).not.toBe(dana.identity.userId);
  });

  test('[SHARING-322.1] removes only the member’s phone and seals a box for every other phone that stays', async () => {
    const world = await danaIn();
    const { invite, taylor, A, D, ids } = world;
    const { device: E } = await joins(invite, 'Evan', ids.Casey);
    const asked = await newPhoneAsks(world);
    const from = mark();

    expect(await approve(invite, asked.request)).toEqual(APPROVED);

    const [takeover] = await takeoversBy(taylor, from);
    expect(takeover.remove).toEqual([D]);
    expect(takeover.boxes.map(({ deviceId: to }) => to).sort()).toEqual(
      [A, E].sort(),
    );
  });

  test('[SHARING-322.1] uploads its own unsent changes before it takes the cursor and the snapshot', async () => {
    const world = await newPhoneAsks();
    const { invite, taylor, request, newer, key } = world;
    goOffline();
    await addExpense(taylor, { title: 'Supper' });
    goOnline();
    const from = mark();

    expect(await approve(invite, request)).toEqual(APPROVED);

    const [takeover] = await takeoversBy(taylor, from);
    const [upload] = await uploads(taylor, from);
    expect(upload).toMatchObject({ status: 200 });
    const snapshot = await contentFor(newer, key);
    expect(takeover.cursor).toBe(snapshot.sequence);
    expect(await unsent(taylor)).toEqual([]);
    expect(await ask(newer, invite)).toMatchObject({ outcome: 'joined' });
    expect(await titles(newer)).toContain('Supper');
  });

  test('[SHARING-322.1] approves a takeover from a phone that went on after the API told it to continue', async () => {
    const world = await danaIn();
    const { taylor, dana, brisbane, D } = world;
    // Taylor's phone uploads Supper and does not get its own event back; Dana's never syncs.
    await addExpense(taylor, { title: 'Supper' });
    whenAnswered('POST', async () => noAnswerTo('GET'));
    await sync(taylor);
    const away = LATER + 31 * DAY;
    setApiTime(away);
    setClock(taylor, away);
    setClock(dana, away);
    await cleanUpAt(away);
    // Dana's phone is told it needs a snapshot; then Taylor's, the one further on, is told to go on.
    await sync(dana);
    const from = mark();
    await sync(taylor);
    const answers = (await sentBy(taylor, from))
      .filter(
        ({ method, path }) => method === 'GET' && path.includes('/events'),
      )
      .map(({ status }) => status);
    expect(answers[0]).toBe(410);
    expect(answers).toContain(200);
    expect(
      await taylor.sync.isWaitingForSnapshot(taylor.database, brisbane),
    ).toBe(false);
    // The invite of a month ago has expired: Taylor's phone makes another, and the new phone asks.
    const again = await invitesAgain(world);
    const newer = await phoneOf('Newer', again);
    setClock(newer, away);
    expect(await sendsTakeover(newer, again, world.ids.Dana)).toMatchObject({
      kind: 'request',
    });
    const N = await deviceId(newer);

    expect(await approve(again, await listedFor(again, N))).toEqual(APPROVED);

    expect(await isMemberDevice(brisbane, D)).toBe(false);
    expect(await isMemberDevice(brisbane, N)).toBe(true);
  });
});

describe('SHARING-323.1', () => {
  test('[SHARING-323.1] says in events under the new key that the new phone represents the member and the old one nobody, and touches no member', async () => {
    const world = await newPhoneAsks();
    const { invite, taylor, brisbane, A, D, N, key, ids, newer, request } =
      world;
    const from = mark();

    expect(await approve(invite, request)).toEqual(APPROVED);

    const [takeover] = await takeoversBy(taylor, from);
    const newKey = keyOf(taylor, brisbane, 2);
    const events = eventsOf(takeover, world, newKey);
    expect(events).toMatchObject([
      {
        version: 1,
        type: 'device',
        id: N,
        units: {
          member: {
            value: {
              memberId: ids.Dana,
              userId: newer.identity.userId,
              boxKey: await boxKeyOf(newer),
            },
          },
        },
      },
      {
        version: 1,
        type: 'device',
        id: D,
        units: { member: { value: null, base: expect.anything() } },
      },
    ]);
    expect(events[0]!.units.member).not.toHaveProperty('base');
    expect(events.map((event) => event!.stamp)).toEqual([
      { ms: LATER, counter: expect.any(Number), device: A },
      { ms: LATER, counter: expect.any(Number), device: A },
    ]);
    expect(events[1]!.stamp.counter).toBe(events[0]!.stamp.counter + 1);
    expect(eventsOf(takeover, world, key, 1)).toEqual([undefined, undefined]);
    expect(eventsOf(takeover, world, key, 2)).toEqual([undefined, undefined]);
  });

  test('[SHARING-323.1] gives the entry of a phone that was in the group before a base, when it comes back by taking a member over', async () => {
    const world = await danaIn();
    const { invite, taylor, brisbane, ids } = world;
    const { phone: evan, device: E } = await joins(invite, 'Evan');
    expect(
      await on(evan, () =>
        evan.sharing.leaveSharedGroup(evan.database, brisbane),
      ),
    ).toEqual({ outcome: 'left' });
    // Taylor's phone rotates for the group, writes that Evan's phone represents nobody, and revokes the invite.
    await sync(taylor);
    await sync(taylor);
    const again = await invitesAgain(world);
    expect(
      await sendsTakeover(evan, again, ids.Dana, {
        name: 'Evan',
        copyGroupId: brisbane,
      }),
    ).toMatchObject({ kind: 'request' });
    const from = mark();

    expect(await approve(again, await listedFor(again, E))).toEqual(APPROVED);

    const [takeover] = await takeoversBy(taylor, from);
    expect(takeover.epoch).toBe(3);
    const [entry] = eventsOf(takeover, world, keyOf(taylor, brisbane, 3));
    expect(entry).toMatchObject({
      type: 'device',
      id: E,
      units: {
        member: {
          value: { memberId: ids.Dana },
          base: expect.anything(),
        },
      },
    });
  });

  test('[SHARING-323.1] puts the same records into the snapshot, which is under the key of the epoch before', async () => {
    const world = await newPhoneAsks();
    const { invite, taylor, brisbane, D, N, key, ids, newer, request } = world;
    const from = mark();

    expect(await approve(invite, request)).toEqual(APPROVED);

    const [takeover] = await takeoversBy(taylor, from);
    const events = eventsOf(takeover, world, keyOf(taylor, brisbane, 2));
    const snapshot = await contentFor(newer, key);
    const recordOf = (type: string, id: string) =>
      snapshot.records.find(
        (record) => record.type === type && record.id === id,
      );
    expect(recordOf('device', N)).toMatchObject({
      units: {
        member: {
          value: { memberId: ids.Dana, userId: newer.identity.userId },
          stamp: events[0]!.stamp,
        },
      },
    });
    expect(recordOf('device', D)).toMatchObject({
      units: { member: { value: null, stamp: events[1]!.stamp } },
    });
    expect(recordOf('member', ids.Dana)).toMatchObject({
      units: { name: { value: 'Dana' }, removed: { value: false } },
    });
  });
});

describe('SHARING-324.1', () => {
  test('[SHARING-324.1] seals for the new phone a box with the key of the snapshot’s epoch and the new key, under the new epoch', async () => {
    const world = await newPhoneAsks();
    const { invite, taylor, brisbane, key, newer, dana, request } = world;
    const from = mark();

    expect(await approve(invite, request)).toEqual(APPROVED);

    const [takeover] = await takeoversBy(taylor, from);
    const handover = {
      groupId: brisbane,
      epoch: 2,
      senderKey: takeover.senderKey,
      box: takeover.box,
    };
    const newKey = toHex(keyOf(taylor, brisbane, 2));
    expect(await openedBox(newer, invite, handover)).toEqual({
      keys: [
        { epoch: 1, key: toHex(key) },
        { epoch: 2, key: newKey },
      ],
    });
    expect(newKey).not.toBe(toHex(key));
    expect(drewFromTheRandomSource(fromHex(newKey))).toBe(true);
    // Not under the epoch before, and not for the phone that is replaced.
    expect(
      await openedBox(newer, invite, { ...handover, epoch: 1 }),
    ).toBeUndefined();
    expect(await openedBox(dana, invite, handover)).toBeUndefined();
  });

  test('[SHARING-324.1] seals the new key for every phone that stays as a rotation does, and for neither the old phone nor the new one', async () => {
    const world = await danaIn();
    const { invite, taylor, brisbane, A, D, key, ids, dana } = world;
    const { phone: evan, device: E } = await joins(invite, 'Evan', ids.Casey);
    const asked = await newPhoneAsks(world);
    const from = mark();

    expect(await approve(invite, asked.request)).toEqual(APPROVED);

    const [takeover] = await takeoversBy(taylor, from);
    const newKey = toHex(keyOf(taylor, brisbane, 2));
    const right = { groupId: brisbane, previous: key };
    expect(await openedRotationBox(evan, takeover, E, right)).toEqual({
      keys: [{ epoch: 2, key: newKey }],
    });
    expect(await openedRotationBox(taylor, takeover, A, right)).toEqual({
      keys: [{ epoch: 2, key: newKey }],
    });
    expect(
      await openedRotationBox(evan, takeover, E, { ...right, epoch: 3 }),
    ).toBeUndefined();
    const receivers = takeover.boxes.map(({ deviceId: to }) => to);
    expect(receivers).not.toContain(D);
    expect(receivers).not.toContain(asked.N);
    for (const device of [A, E]) {
      expect(
        await openedRotationBox(dana, takeover, device, right),
      ).toBeUndefined();
    }
  });

  test('[SHARING-324.1] makes another key when Approve is pressed again', async () => {
    const world = await newPhoneAsks();
    const { invite, taylor, brisbane, newer, request } = world;
    const from = mark();
    answerNext('POST', 500, {});
    expect(await approve(invite, request)).toMatchObject({ outcome: 'failed' });

    expect(await approve(invite, request)).toEqual(APPROVED);

    const [first, second] = await takeoversBy(taylor, from);
    const keysIn = async (takeover: SentTakeover) =>
      (await openedBox(newer, invite, {
        groupId: brisbane,
        epoch: 2,
        senderKey: takeover.senderKey,
        box: takeover.box,
      })) as { keys: { epoch: number; key: string }[] };
    const [, firstKey] = (await keysIn(first)).keys;
    const [, secondKey] = (await keysIn(second)).keys;
    expect(firstKey.epoch).toBe(2);
    expect(secondKey.key).not.toBe(firstKey.key);
    expect(secondKey.key).toBe(toHex(keyOf(taylor, brisbane, 2)));
  });
});

describe('SHARING-325.1', () => {
  test('[SHARING-325.1] saves the new key and gets the roster from its own events: the member stays, now on the new phone', async () => {
    const world = await newPhoneAsks();
    const { invite, taylor, brisbane, newer, dana, request } = world;
    expect(await userOf(taylor, 'Dana')).toBe(dana.identity.userId);
    const from = mark();

    expect(await approve(invite, request)).toEqual(APPROVED);

    const ledger = await ledgerOf(taylor);
    expect(namesOf(ledger.members)).toEqual([
      'Taylor',
      'Casey',
      'Blake',
      'Dana',
    ]);
    expect(namesOf(ledger.formerMembers)).not.toContain('Dana');
    expect(await userOf(taylor, 'Dana')).toBe(newer.identity.userId);
    expect(secureStoreEntry(taylor, keyEntry(brisbane, 2))).toBeDefined();
    // The invite was made before the old phone stopped representing anybody: it is revoked (SHARING-284.1).
    await sync(taylor);
    expect(await lines(taylor, from)).toContain(
      `DELETE /groups/${brisbane}/invites/${invite.code}`,
    );
  });

  test('[SHARING-325.1] uploads under the new key from then on', async () => {
    const world = await newPhoneAsks();
    const { invite, taylor, request } = world;
    expect(await approve(invite, request)).toEqual(APPROVED);
    await sync(taylor);
    await sync(taylor);
    const from = mark();

    await addExpense(taylor, { title: 'Lunch' });
    await sync(taylor);

    expect((await uploads(taylor, from)).at(-1)).toMatchObject({
      epoch: 2,
      status: 200,
    });
  });

  test('[SHARING-325.1] finds the key in its own box, and the roster changed, after a takeover whose answer was lost', async () => {
    const world = await newPhoneAsks();
    const { invite, taylor, brisbane, D, N, newer, request } = world;
    expect(request.takeover).toBe(true);
    loseAnswerTo('POST');

    expect(await approve(invite, request)).toEqual({ outcome: 'no-answer' });
    expect(await isMemberDevice(brisbane, D)).toBe(false);
    expect(await isMemberDevice(brisbane, N)).toBe(true);
    expect(secureStoreEntry(taylor, keyEntry(brisbane, 2))).toBeUndefined();

    await sync(taylor);

    expect(secureStoreEntry(taylor, keyEntry(brisbane, 2))).toBeDefined();
    expect(await userOf(taylor, 'Dana')).toBe(newer.identity.userId);
  });
});

describe('SHARING-326.1', () => {
  test('[SHARING-326.1] reports no answer when the network is gone, and keeps the roster and the old key', async () => {
    const world = await newPhoneAsks();
    const { invite, taylor, brisbane, D, dana, request } = world;
    expect(request.takeover).toBe(true);
    goOffline();

    expect(await approve(invite, request)).toEqual({ outcome: 'no-answer' });

    goOnline();
    expect(await isMemberDevice(brisbane, D)).toBe(true);
    expect(await userOf(taylor, 'Dana')).toBe(dana.identity.userId);
    expect(await unsent(taylor)).toEqual([]);
    expect(secureStoreEntry(taylor, keyEntry(brisbane, 2))).toBeUndefined();
  });

  test('[SHARING-326.1] sends neither a snapshot nor a takeover while its own ledger waits for a snapshot', async () => {
    const world = await newPhoneAsks();
    const { invite, taylor, brisbane, D, N, request } = world;
    expect(request.takeover).toBe(true);
    answerNext('GET', 410, { error: 'snapshot-needed' });
    const from = mark();

    const result = await approve(invite, request);

    expect(result.outcome).not.toBe('approved');
    expect(
      await taylor.sync.isWaitingForSnapshot(taylor.database, brisbane),
    ).toBe(true);
    expect(await chunksBy(taylor, from)).toBe(0);
    expect(await takeoversBy(taylor, from)).toEqual([]);
    expect(await isMemberDevice(brisbane, D)).toBe(true);
    expect(await isMemberDevice(brisbane, N)).toBe(false);
    // Once it gets a page again, it approves.
    expect(await approve(invite, request)).toEqual(APPROVED);
  });

  test('[SHARING-326.1] reports that the request was answered when the API holds it no more', async () => {
    const world = await newPhoneAsks();
    const { invite, taylor, brisbane, D, N, request } = world;
    expect(request.takeover).toBe(true);
    expect(
      (
        await sendAs(
          taylor,
          'DELETE',
          `/groups/${brisbane}/requests/${N}?request=${request.request}`,
        )
      ).status,
    ).toBe(200);
    const from = mark();

    expect(await approve(invite, request)).toEqual({ outcome: 'answered' });

    expect(await takeoversBy(taylor, from)).toHaveLength(1);
    expect(await isMemberDevice(brisbane, D)).toBe(true);
  });

  test('[SHARING-326.1] syncs and sends the same takeover again, with its new cursor, when the API says the phone is behind', async () => {
    const world = await newPhoneAsks();
    const { invite, taylor, dana, brisbane, D, N, request } = world;
    const from = mark();
    // Once the snapshot's last chunk is stored, Dana's phone uploads an expense: the takeover's cursor is behind by then.
    whenAnswered('PUT', async () => {
      await addExpense(dana, { title: 'Taxi' });
      await sync(dana);
    });

    expect(await approve(invite, request)).toEqual(APPROVED);

    const takeovers = await takeoversBy(taylor, from);
    expect(takeovers).toHaveLength(2);
    const [first, second] = takeovers;
    expect(second.cursor).toBeGreaterThan(first.cursor);
    expect({ ...second, cursor: first.cursor }).toEqual(first);
    expect(await isMemberDevice(brisbane, D)).toBe(false);
    expect(await isMemberDevice(brisbane, N)).toBe(true);
    expect(await titles(taylor)).toContain('Taxi');
  });

  test('[SHARING-326.1] does not send the takeover again when the phones that stay have changed since it was prepared', async () => {
    const world = await danaIn();
    const { invite, taylor, dana, brisbane, D, ids } = world;
    const evan = await phoneOf('Evan', invite);
    const E = await asks(evan, invite, { memberId: ids.Casey });
    const asked = await newPhoneAsks(world);
    const from = mark();
    // While Taylor's phone uploads the snapshot, Dana's phone approves Evan's as Casey.
    whenAnswered('PUT', async () => {
      await sync(dana);
      const evans = (
        await on(dana, () =>
          dana.sharing.listReceivedJoinRequests(dana.database, brisbane),
        )
      ).find(({ deviceId: by }) => by === E)!;
      expect(
        await on(dana, () =>
          dana.sharing.approveJoinRequest(dana.database, brisbane, evans),
        ),
      ).toEqual(APPROVED);
    });

    expect(await approve(invite, asked.request)).toMatchObject({
      outcome: 'failed',
    });

    expect(await takeoversBy(taylor, from)).toHaveLength(1);
    expect(await isMemberDevice(brisbane, D)).toBe(true);
    expect(await isMemberDevice(brisbane, asked.N)).toBe(false);
    // Pressed again, it is prepared anew, with a box for Evan's phone.
    const again = mark();
    expect(await approve(invite, await listedFor(invite, asked.N))).toEqual(
      APPROVED,
    );
    const [takeover] = await takeoversBy(taylor, again);
    expect(takeover.boxes.map(({ deviceId: to }) => to)).toContain(E);
  });

  test('[SHARING-326.1] gives up after the API said three times that the phone is behind', async () => {
    const world = await newPhoneAsks();
    const { invite, taylor, brisbane, D, request } = world;
    expect(request.takeover).toBe(true);
    const from = mark();
    for (let times = 0; times < 3; times += 1) {
      answerNext('POST', 409, { error: 'behind' });
    }

    expect(await approve(invite, request)).toEqual({ outcome: 'failed' });

    expect(await takeoversBy(taylor, from)).toHaveLength(3);
    expect(await isMemberDevice(brisbane, D)).toBe(true);
  });

  test.each([
    [
      'other devices',
      409,
      (world: Asked) => ({
        error: 'devices',
        devices: [world.A, world.D].sort(),
      }),
    ],
    ['another key epoch', 409, () => ({ error: 'epoch', epoch: 1 })],
    ['an error of its own', 500, () => ({})],
  ])(
    '[SHARING-326.1] fails, and does not try again, when the API answers a takeover with %s',
    async (_, status, body) => {
      const world = await newPhoneAsks();
      const { invite, taylor, brisbane, D, N, request } = world;
      const from = mark();
      answerNext('POST', status, body(world));

      expect(await approve(invite, request)).toEqual({ outcome: 'failed' });

      expect(await takeoversBy(taylor, from)).toHaveLength(1);
      expect(await isMemberDevice(brisbane, D)).toBe(true);
      expect(await isMemberDevice(brisbane, N)).toBe(false);
      expect(secureStoreEntry(taylor, keyEntry(brisbane, 2))).toBeUndefined();
    },
  );

  test('[SHARING-326.1] sends nothing when the phone lacks the group key of its epoch', async () => {
    const world = await newPhoneAsks();
    const { invite, taylor, brisbane, D, request } = world;
    expect(request.takeover).toBe(true);
    takeKey(taylor, brisbane, 1);
    const from = mark();

    expect(await approve(invite, request)).toEqual({ outcome: 'failed' });

    expect(await chunksBy(taylor, from)).toBe(0);
    expect(await takeoversBy(taylor, from)).toEqual([]);
    expect(await isMemberDevice(brisbane, D)).toBe(true);
  });
});

describe('SHARING-327.1', () => {
  test('[SHARING-327.1] puts neither the keys, the member nor the applicant in the clear in any request', async () => {
    const world = await newPhoneAsks();
    const { invite, taylor, brisbane, key, ids, newer, request } = world;

    expect(await approve(invite, request)).toEqual(APPROVED);

    const newKey = keyOf(taylor, brisbane, 2);
    const secrets = [
      'Dana K.',
      ids.Dana,
      newer.identity.userId,
      await boxKeyOf(newer),
      toHex(key),
      toHex(newKey),
      toHex(deriveKey({ secret: key, purpose: ROTATION })),
      invite.secret,
      Buffer.from(invite.secret, 'base64url').toString('hex'),
    ];
    for (const request of sent()) {
      for (const secret of secrets) {
        expect(requestHolds(request, secret)).toBe(false);
      }
    }
  });
});

describe('SHARING-330.1', () => {
  /** The takeover is approved, the new phone has joined, and both phones have synced. */
  async function takenOver() {
    const world = await newPhoneAsks();
    const { invite, taylor, newer, request } = world;
    expect(await approve(invite, request)).toEqual(APPROVED);
    expect(await ask(newer, invite)).toMatchObject({ outcome: 'joined' });
    await sync(newer);
    await sync(taylor);
    await sync(taylor);
    return world;
  }

  test('[SHARING-330.1] makes the new phone the member it took over: same member, same name, same expenses, on both phones', async () => {
    const world = await danaIn();
    const { taylor, ids } = world;
    await addExpense(taylor, {
      title: 'Supper',
      amountMinor: 8000,
      payer: 'Dana',
      sharers: ['Taylor', 'Casey', 'Blake', 'Dana'],
    });
    await sync(taylor);
    const before = await ledgerOf(taylor);
    const asked = await newPhoneAsks(world);
    const { invite, newer, request } = asked;

    expect(await approve(invite, request)).toEqual(APPROVED);
    expect(await ask(newer, invite)).toMatchObject({ outcome: 'joined' });
    await sync(newer);
    await sync(taylor);
    await sync(taylor);

    expect(await ledgerOf(newer)).toEqual(await ledgerOf(taylor));
    expect(await ledgerOf(taylor)).toEqual(before);
    const mine = await membersOn(newer);
    expect(namesOf(mine)).toEqual(['Taylor', 'Casey', 'Blake', 'Dana']);
    expect(mine.find(({ name }) => name === 'Dana')).toEqual({
      id: ids.Dana,
      name: 'Dana',
      userId: newer.identity.userId,
    });
    expect(await userOf(taylor, 'Dana')).toBe(newer.identity.userId);
    expect((await ledgerOf(newer)).formerMembers).toEqual([]);
  });

  test('[SHARING-330.1] lets both phones record and sync afterwards, the new one under its own device ID and the new key', async () => {
    const { taylor, newer, N, brisbane } = await takenOver();
    const from = mark();

    await addExpense(newer, { title: 'Lunch' });
    await addExpense(taylor, { title: 'Taxi' });
    for (const phone of [newer, taylor, newer, taylor]) await sync(phone);

    expect(await titles(newer)).toEqual(await titles(taylor));
    expect(await titles(taylor)).toEqual(
      expect.arrayContaining(['Lunch', 'Taxi']),
    );
    expect(await ledgerOf(newer)).toEqual(await ledgerOf(taylor));
    const [upload] = await uploads(newer, from);
    expect(upload).toMatchObject({ epoch: 2, status: 200 });
    const stored = await storedEvents(brisbane);
    expect(
      stored.find(({ eventId }) => eventId === upload.events[0].id),
    ).toMatchObject({ deviceId: N, epoch: 2 });
  });

  test('[SHARING-330.1] [SYNC-330.1] leaves the old phone a read-only copy that knows it was taken over, with no key', async () => {
    const { dana, brisbane, taylor } = await takenOver();
    await addExpense(taylor, { title: 'Taxi' });
    await sync(taylor);
    const from = mark();

    await sync(dana);

    const [download] = await sentBy(dana, from);
    expect(download.status).toBe(403);
    expect(await copyOn(dana, brisbane)).toMatchObject({
      reason: 'not-a-member',
      takenOver: true,
    });
    expect(await titles(dana)).not.toContain('Taxi');
    expect(secureStoreEntry(dana, keyEntry(brisbane, 1))).toBeUndefined();
    // It sends nothing more for the group.
    const later = mark();
    await sync(dana);
    expect(await sentBy(dana, later)).toEqual([]);
  });

  test('[SHARING-330.1] [SHARING-321.1] lets a phone that imported the old phone’s export file take the member over, and replaces its copy', async () => {
    const world = await danaIn();
    const { invite, taylor, dana, brisbane, ids, D } = world;
    await addPersonalExpense(dana, 'Coffee');
    goOffline();
    await addExpense(dana, { title: 'Never sent' });
    goOnline();
    const file = await copyOfData(dana);
    const started = await phoneOf('Newer', invite);
    setClock(started, LATER);
    await importData(started, file);
    // The app starts again on what it imported: its name and user ID are the file's now.
    const newer = await restart(started);
    expect(await copyOn(newer, brisbane)).toMatchObject({
      reason: 'lapsed',
      unsent: 1,
    });

    expect(
      await sendsTakeover(newer, invite, ids.Dana, {
        name: 'Dana',
        copyGroupId: brisbane,
      }),
    ).toMatchObject({ kind: 'request', request: { sent: 1 } });
    const N = await deviceId(newer);
    expect(N).not.toBe(D);
    expect(await approve(invite, await listedFor(invite, N))).toEqual(APPROVED);
    expect(await ask(newer, invite)).toMatchObject({ outcome: 'joined' });
    await sync(newer);

    expect(await copyOn(newer, brisbane)).toBeUndefined();
    expect(await hasGroup(newer, brisbane)).toBe(true);
    expect(await titles(newer)).not.toContain('Never sent');
    expect(await unsent(newer)).toEqual([]);
    expect(await userOf(taylor, 'Dana')).toBe(await userIdOf(newer));
    const personal = await newer.database.all<{ title: string }>(
      "SELECT title FROM expenses WHERE title = 'Coffee'",
    );
    expect(personal).toHaveLength(1);
    await addExpense(newer, { title: 'Lunch' });
    await sync(newer);
    await sync(taylor);
    expect(await titles(taylor)).toContain('Lunch');
  });

  test('[SHARING-330.1] lets the old phone take its place back through a new invite', async () => {
    const world = await takenOver();
    const { taylor, dana, newer, brisbane, D, N, ids } = world;
    await sync(dana);
    expect(await copyOn(dana, brisbane)).toMatchObject({ takenOver: true });
    const again = await invitesAgain(world);
    expect(
      await sendsTakeover(dana, again, ids.Dana, {
        name: 'Dana',
        copyGroupId: brisbane,
      }),
    ).toMatchObject({ kind: 'request' });

    expect(await approve(again, await listedFor(again, D))).toEqual(APPROVED);
    expect(await ask(dana, again)).toMatchObject({ outcome: 'joined' });
    await sync(dana);
    await sync(newer);
    await sync(taylor);

    expect(await copyOn(dana, brisbane)).toBeUndefined();
    expect(await copyOn(newer, brisbane)).toMatchObject({
      reason: 'not-a-member',
      takenOver: true,
    });
    expect(await isMemberDevice(brisbane, D)).toBe(true);
    expect(await isMemberDevice(brisbane, N)).toBe(false);
    expect(namesOf((await ledgerOf(taylor)).members)).toEqual([
      'Taylor',
      'Casey',
      'Blake',
      'Dana',
    ]);
    expect(await userOf(taylor, 'Dana')).toBe(dana.identity.userId);
  });
});

describe('SYNC-330.1', () => {
  /** Taylor's phone and Dana's, and what Dana's phone holds of Brisbane as a copy. */
  const replacedHeader = (value: string) => ({ [REPLACED]: value });

  test('[SYNC-330.1] records with the copy that the phone was taken over when the refusal of its download says so', async () => {
    const { dana, brisbane } = await danaIn();
    answerNext('GET', 403, NOT_A_MEMBER, replacedHeader('takeover'));

    await sync(dana);

    expect(await copyOn(dana, brisbane)).toMatchObject({
      reason: 'not-a-member',
      takenOver: true,
    });
  });

  test('[SYNC-330.1] records it when the refusal of its upload says so, and keeps the change that was not sent', async () => {
    const { dana, brisbane } = await danaIn();
    await addExpense(dana, { title: 'Lunch' });
    answerNext('POST', 403, NOT_A_MEMBER, replacedHeader('takeover'));

    await sync(dana);

    expect(await copyOn(dana, brisbane)).toMatchObject({
      reason: 'not-a-member',
      takenOver: true,
      unsent: 1,
    });
    expect(await titles(dana)).toContain('Lunch');
  });

  test('[SYNC-330.1] records it when the refusal of its leave says so', async () => {
    const { dana, brisbane } = await danaIn();
    noAnswerTo('GET');
    answerNext('POST', 403, NOT_A_MEMBER, replacedHeader('takeover'));

    await on(dana, () =>
      dana.sharing.leaveSharedGroup(dana.database, brisbane),
    );

    expect(await copyOn(dana, brisbane)).toMatchObject({
      reason: 'not-a-member',
      takenOver: true,
    });
  });

  test.each([
    ['no header', undefined],
    ['Takeover', 'Takeover'],
    ['takeover and a space', 'takeover '],
    ['1', '1'],
    ['transfer', 'transfer'],
  ])(
    '[SYNC-330.1] records nothing of a takeover for a refusal with %s, and records it for takeover',
    async (_, value) => {
      const { dana, taylor, brisbane } = await danaIn();
      answerNext(
        'GET',
        403,
        NOT_A_MEMBER,
        value === undefined ? {} : replacedHeader(value),
      );
      answerNext('GET', 403, NOT_A_MEMBER, replacedHeader('takeover'));

      await sync(dana);
      await sync(taylor);

      const copy = await copyOn(dana, brisbane);
      expect(copy).toMatchObject({ reason: 'not-a-member' });
      expect(copy!.takenOver ?? false).toBe(false);
      // The control, on the other phone, with the header as the API writes it.
      expect(await copyOn(taylor, brisbane)).toMatchObject({ takenOver: true });
    },
  );

  test('[SYNC-330.1] keeps what it recorded through a restart, and in an export file that is imported again', async () => {
    const { dana, brisbane } = await danaIn();
    answerNext('GET', 403, NOT_A_MEMBER, replacedHeader('takeover'));
    await sync(dana);
    expect(await copyOn(dana, brisbane)).toMatchObject({ takenOver: true });

    await importData(dana, await copyOfData(dana));

    expect(await copyOn(dana, brisbane)).toMatchObject({
      reason: 'not-a-member',
      takenOver: true,
    });
  });
});
