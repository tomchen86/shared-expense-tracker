import { Buffer } from 'node:buffer';
import { randomBytes } from 'node:crypto';
import { deriveKey, openBox, sealBox } from '@shared-expense/domain/crypto';
import {
  approvalsBy,
  asks,
  boxKeyOf,
  boxSecretOf,
  endApprovalWorld,
  hasGroup,
  isMemberDevice,
  on,
  phoneOf,
  requestOnApi,
  sendAs,
  startApprovalWorld,
  taylorInvites,
  type Inviting,
} from './sharing-approval-app';
import { DAY, cleanUpAt, requestsOf, waits } from './sync-catch-up-app';
import {
  MINUTE,
  NOW,
  addExpense,
  answerNext,
  copyOfData,
  created,
  drewFromTheRandomSource,
  fromHex,
  goOffline,
  goOnline,
  keyEntry,
  keyOf,
  ledgerOf,
  loseAnswerTo,
  loseSeed,
  mark,
  memberIds,
  opened,
  refusals,
  requestHolds,
  restoreData,
  saveKey,
  secureStoreEntry,
  sentBy,
  setApiTime,
  setClock,
  setEpoch,
  sync,
  titles,
  toHex,
  twoPhones,
  unsent,
  uploadAs,
  uploads,
  utf8,
  whenAnswered,
  type Phone,
  type Sent,
} from './sync-loop-app';

// Runs in Node against the real API (sharing-approval-app): the phones of a shared ledger,
// each in the group because another approved it, remove one another, leave, rotate the
// group key and fetch the new one (ADR-0015, ADR-0041).

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
const LATER = NOW + MINUTE;

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

/** The request of `device` as Taylor's phone lists it, once that phone can approve. */
async function listedFor({ taylor, brisbane }: Inviting, device: string) {
  // Nothing unsent, and the cursor at the group's last number: an approval needs both.
  await sync(taylor);
  await sync(taylor);
  const request = (
    await on(taylor, () =>
      taylor.sharing.listReceivedJoinRequests(taylor.database, brisbane),
    )
  ).find(({ deviceId }) => deviceId === device);
  if (!request) throw new Error('Taylor’s phone lists no such request');
  return request;
}

/**
 * Asks to join through Taylor's invite as `name`, a new member unless `memberId` names one,
 * and has Taylor's phone approve it. With `join` false the phone does not ask for the
 * answer, so it has not joined yet.
 */
async function joins(
  invite: Inviting,
  name: string,
  { memberId = null as string | null, join = true } = {},
) {
  const { taylor, brisbane, code } = invite;
  const phone = await phoneOf(name, invite);
  const device = await asks(phone, invite, { memberId });
  const request = await listedFor(invite, device);
  expect(
    await on(taylor, () =>
      taylor.sharing.approveJoinRequest(taylor.database, brisbane, request),
    ),
  ).toEqual({ outcome: 'approved' });
  if (join) {
    expect(
      await on(phone, () => phone.sharing.askJoinResult(phone.database, code)),
    ).toMatchObject({ outcome: 'joined' });
    await sync(phone);
  }
  await sync(taylor);
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

/** A new invite of Taylor's phone: the one from before a removal is revoked by then (SHARING-284.1). */
async function invitesAgain({
  invite,
  taylor,
  brisbane,
}: Joined): Promise<Inviting> {
  const again = await on(taylor, () =>
    taylor.sharing.prepareInvite(taylor.database, brisbane),
  );
  if (typeof again === 'string') throw new Error(`No invite: ${again}`);
  return { ...invite, code: again.code, secret: again.secret };
}

const remove = ({ taylor, brisbane }: Joined, memberId: string) =>
  on(taylor, () =>
    taylor.sharing.removeMemberDevices(taylor.database, brisbane, memberId),
  );
const leave = (phone: Phone, brisbane: string) =>
  on(phone, () => phone.sharing.leaveSharedGroup(phone.database, brisbane));
const copyOn = (phone: Phone, brisbane: string) =>
  phone.sync.readOnlyCopyOf(phone.database, brisbane);

interface SentRotation {
  epoch: number;
  remove: string[];
  senderKey: string;
  boxes: { deviceId: string; box: string }[];
  events: { id: string; content: string }[];
}

const pathOf = ({ path }: Sent) => path.split('?')[0];
const lines = async (phone: Phone, from: number) =>
  (await sentBy(phone, from)).map(
    (request) => `${request.method} ${pathOf(request)}`,
  );

/** The rotations a phone has sent since `from`, each as its body reads. */
const rotationsBy = async (phone: Phone, from = 0): Promise<SentRotation[]> =>
  (await sentBy(phone, from))
    .filter(
      (request) =>
        request.method === 'POST' && pathOf(request).endsWith('/rotation'),
    )
    .map(
      ({ body }) =>
        JSON.parse(Buffer.from(body).toString('utf8')) as SentRotation,
    );

/** The questions for keys a phone has sent since `from`: what follows the path. */
const keyQuestionsBy = async (phone: Phone, from = 0) =>
  (await sentBy(phone, from))
    .filter(
      (request) =>
        request.method === 'GET' && pathOf(request).endsWith('/keys'),
    )
    .map(({ path }) => path.slice(path.indexOf('?')));

const rotationSalt = (previousKey: Uint8Array) =>
  deriveKey({ secret: previousKey, purpose: ROTATION });
const rotationContext = (groupId: string, device: string, epoch: number) =>
  utf8([ROTATION, groupId, device, String(epoch)].join('\n'));

/** What a rotation's box holds once `recipient` opens it as SHARING-272.1 says; undefined when it does not open. */
async function openedRotationBox(
  recipient: Phone,
  sealedBox: { senderKey: string; box: string },
  with_: {
    groupId: string;
    device: string;
    epoch: number;
    previous: Uint8Array | null;
  },
): Promise<unknown> {
  const result = openBox({
    recipientSecretKey: await boxSecretOf(recipient),
    senderPublicKey: fromHex(sealedBox.senderKey),
    context: rotationContext(with_.groupId, with_.device, with_.epoch),
    ...(with_.previous ? { salt: rotationSalt(with_.previous) } : {}),
    box: fromHex(sealedBox.box),
  });
  return result.ok
    ? (JSON.parse(Buffer.from(result.plaintext).toString('utf8')) as unknown)
    : undefined;
}

/** A box as `sender` would seal a group key for `recipient` at a rotation, with whatever a test changes. */
async function rotationBox(
  sender: Phone,
  recipient: Phone,
  world: {
    groupId: string;
    device: string;
    epoch: number;
    previous: Uint8Array;
  },
  content: unknown,
): Promise<string> {
  return toHex(
    sealBox({
      senderSecretKey: await boxSecretOf(sender),
      recipientPublicKey: fromHex(await boxKeyOf(recipient)),
      context: rotationContext(world.groupId, world.device, world.epoch),
      salt: rotationSalt(world.previous),
      nonce: new Uint8Array(randomBytes(24)),
      plaintext: utf8(JSON.stringify(content)),
    }),
  );
}

const namesOf = (people: { name: string }[]) => people.map(({ name }) => name);

describe('SHARING-270.1', () => {
  test('[SHARING-270.1] syncs, then removes the member’s phone and rotates the key in one request', async () => {
    const world = await danaIn();
    const { taylor, brisbane, A, D, ids } = world;
    const from = mark();

    expect(await remove(world, ids.Dana)).toEqual({ outcome: 'removed' });

    const sentLines = await lines(taylor, from);
    expect(sentLines[0]).toBe(`GET /groups/${brisbane}/events`);
    expect(sentLines).toContain(`POST /groups/${brisbane}/rotation`);
    const [rotation] = await rotationsBy(taylor, from);
    expect(rotation.epoch).toBe(2);
    expect(rotation.remove).toEqual([D]);
    expect(rotation.boxes.map(({ deviceId }) => deviceId)).toEqual([A]);
    expect(await isMemberDevice(brisbane, D)).toBe(false);
    expect(await isMemberDevice(brisbane, A)).toBe(true);
  });

  test('[SHARING-270.1] removes a device though its own sync is told it needs a snapshot', async () => {
    const world = await danaIn();
    const { taylor, brisbane, D, ids } = world;
    answerNext('GET', 410, { error: 'snapshot-needed' });
    const from = mark();

    expect(await remove(world, ids.Dana)).toEqual({ outcome: 'removed' });

    expect(await rotationsBy(taylor, from)).toHaveLength(1);
    expect(await isMemberDevice(brisbane, D)).toBe(false);
  });

  test('[SHARING-270.1] sends no rotation for a member whose phone has left already', async () => {
    const world = await danaIn();
    const { taylor, dana, brisbane, ids } = world;
    expect(await leave(dana, brisbane)).toEqual({ outcome: 'left' });
    const from = mark();

    expect(await remove(world, ids.Dana)).toEqual({ outcome: 'removed' });

    // The one rotation is the one the sync made for the group (SHARING-275.1).
    const rotations = await rotationsBy(taylor, from);
    expect(rotations.map(({ remove: gone }) => gone)).toEqual([[]]);
    expect(namesOf((await ledgerOf(taylor)).members)).not.toContain('Dana');
  });
});

describe('SHARING-271.1', () => {
  test('[SHARING-271.1] says in events under the new key that the member is removed and that the phone represents nobody', async () => {
    const world = await danaIn();
    const { taylor, brisbane, A, D, key, ids } = world;
    const from = mark();

    expect(await remove(world, ids.Dana)).toEqual({ outcome: 'removed' });

    const [rotation] = await rotationsBy(taylor, from);
    const newKey = keyOf(taylor, brisbane, 2);
    const read = (with_: Uint8Array, epoch: number) =>
      rotation.events.map(({ id, content }) => {
        const plaintext = opened(
          with_,
          { groupId: brisbane, eventId: id, deviceId: A, epoch },
          fromHex(content),
        );
        return plaintext === undefined
          ? undefined
          : (JSON.parse(Buffer.from(plaintext).toString('utf8')) as unknown);
      });
    expect(read(newKey, 2)).toMatchObject([
      {
        version: 1,
        type: 'member',
        id: ids.Dana,
        units: { removed: { value: true, base: expect.anything() } },
      },
      {
        version: 1,
        type: 'device',
        id: D,
        units: { member: { value: null, base: expect.anything() } },
      },
    ]);
    expect(read(key, 1)).toEqual([undefined, undefined]);
    expect(read(key, 2)).toEqual([undefined, undefined]);
  });
});

describe('SHARING-272.1', () => {
  test('[SHARING-272.1] seals the new key for every phone that stays, itself among them, so that only a holder of the old key can open it', async () => {
    const world = await danaIn();
    const { invite, taylor, dana, brisbane, A, key, ids } = world;
    const { phone: evan, device: E } = await joins(invite, 'Evan', {
      memberId: ids.Casey,
    });
    const from = mark();

    expect(await remove(world, ids.Dana)).toEqual({ outcome: 'removed' });

    const [rotation] = await rotationsBy(taylor, from);
    expect(rotation.boxes.map(({ deviceId }) => deviceId).sort()).toEqual(
      [A, E].sort(),
    );
    expect(rotation.senderKey).toBe(await boxKeyOf(taylor));
    const boxOf = (device: string) => ({
      senderKey: rotation.senderKey,
      box: rotation.boxes.find(({ deviceId }) => deviceId === device)!.box,
    });
    const newKey = toHex(keyOf(taylor, brisbane, 2));
    const right = { groupId: brisbane, device: E, epoch: 2, previous: key };

    expect(await openedRotationBox(evan, boxOf(E), right)).toEqual({
      keys: [{ epoch: 2, key: newKey }],
    });
    expect(
      await openedRotationBox(taylor, boxOf(A), { ...right, device: A }),
    ).toEqual({ keys: [{ epoch: 2, key: newKey }] });
    expect(newKey).not.toBe(toHex(key));
    expect(drewFromTheRandomSource(fromHex(newKey))).toBe(true);
    for (const { box } of rotation.boxes) {
      expect(drewFromTheRandomSource(fromHex(box).slice(1, 25))).toBe(true);
    }

    // Without the old key, or for another group, device or epoch, it does not open.
    for (const wrong of [
      { ...right, previous: null },
      { ...right, previous: new Uint8Array(randomBytes(32)) },
      { ...right, groupId: '00000000-0000-4000-8000-000000000000' },
      { ...right, device: A },
      { ...right, epoch: 3 },
    ]) {
      expect(await openedRotationBox(evan, boxOf(E), wrong)).toBeUndefined();
    }
    // The removed phone has no box, and opens none.
    for (const device of [A, E]) {
      expect(
        await openedRotationBox(dana, boxOf(device), { ...right, device }),
      ).toBeUndefined();
    }
  });
});

describe('SHARING-273.1', () => {
  test('[SHARING-273.1] saves the new key, makes the member a former member, and uploads under the new key from then on', async () => {
    const world = await danaIn();
    const { taylor, brisbane, ids } = world;
    await addExpense(taylor, { title: 'Supper' });
    await sync(taylor);

    expect(await remove(world, ids.Dana)).toEqual({ outcome: 'removed' });
    await sync(taylor);

    const ledger = await ledgerOf(taylor);
    expect(namesOf(ledger.members)).toEqual(['Taylor', 'Casey', 'Blake']);
    expect(namesOf(ledger.formerMembers)).toContain('Dana');
    expect(secureStoreEntry(taylor, keyEntry(brisbane, 2))).toBeDefined();
    expect(await unsent(taylor)).toEqual([]);

    const from = mark();
    await addExpense(taylor, { title: 'Lunch' });
    await sync(taylor);

    expect((await uploads(taylor, from)).at(-1)).toMatchObject({
      epoch: 2,
      status: 200,
    });
  });

  test('[SHARING-273.1] finds the key in its own box, and the member gone, after a rotation whose answer was lost', async () => {
    const world = await danaIn();
    const { taylor, brisbane, D, ids } = world;
    loseAnswerTo('POST');

    expect(await remove(world, ids.Dana)).toEqual({ outcome: 'no-answer' });
    expect(await isMemberDevice(brisbane, D)).toBe(false);
    expect(secureStoreEntry(taylor, keyEntry(brisbane, 2))).toBeUndefined();

    await sync(taylor);

    expect(secureStoreEntry(taylor, keyEntry(brisbane, 2))).toBeDefined();
    expect(namesOf((await ledgerOf(taylor)).members)).toEqual([
      'Taylor',
      'Casey',
      'Blake',
    ]);
  });
});

describe('SHARING-274.1', () => {
  test('[SHARING-274.1] reports no answer when the network is gone, and keeps the member and the old key', async () => {
    const world = await danaIn();
    const { taylor, brisbane, D, ids } = world;
    goOffline();

    expect(await remove(world, ids.Dana)).toEqual({ outcome: 'no-answer' });

    goOnline();
    expect(namesOf((await ledgerOf(taylor)).members)).toContain('Dana');
    expect(secureStoreEntry(taylor, keyEntry(brisbane, 2))).toBeUndefined();
    expect(await unsent(taylor)).toEqual([]);
    expect(await isMemberDevice(brisbane, D)).toBe(true);
  });

  test('[SHARING-274.1] fails for an answer it cannot read, and saves no new key', async () => {
    const world = await danaIn();
    const { taylor, brisbane, ids } = world;
    // The sync before the rotation uploads nothing, so the rotation is the next POST.
    answerNext('POST', 500, '');

    expect(await remove(world, ids.Dana)).toEqual({ outcome: 'failed' });

    expect(secureStoreEntry(taylor, keyEntry(brisbane, 2))).toBeUndefined();
    expect(namesOf((await ledgerOf(taylor)).members)).toContain('Dana');
  });

  test('[SHARING-274.1] fetches the new key when the API refuses the rotation for its key epoch, and rotates again to the epoch after it with boxes sealed from that key', async () => {
    const world = await danaIn();
    const { taylor, dana, brisbane, A, D, key, ids } = world;
    // Another member's phone has rotated since Taylor's phone last looked: the API is at
    // key epoch 2, and hands Taylor's phone the box that phone sealed for it.
    const key2 = new Uint8Array(randomBytes(32));
    await setEpoch(brisbane, 2);
    const box = await rotationBox(
      dana,
      taylor,
      { groupId: brisbane, device: A, epoch: 2, previous: key },
      { keys: [{ epoch: 2, key: toHex(key2) }] },
    );
    const senderKey = await boxKeyOf(dana);
    whenAnswered('POST', async () =>
      answerNext('GET', 200, {
        keys: [{ epoch: 2, senderKey, box }],
        more: false,
      }),
    );
    const from = mark();

    expect(await remove(world, ids.Dana)).toEqual({ outcome: 'removed' });

    const [first, second, ...more] = await rotationsBy(taylor, from);
    expect(more).toEqual([]);
    expect([first.epoch, second.epoch]).toEqual([2, 3]);
    expect(await keyQuestionsBy(taylor, from)).toEqual(['?after=1']);
    const own = second.boxes.find(({ deviceId }) => deviceId === A);
    const sealed = { senderKey: second.senderKey, box: own?.box ?? '' };
    const made = { groupId: brisbane, device: A, epoch: 3 };
    expect(
      await openedRotationBox(taylor, sealed, { ...made, previous: key2 }),
    ).toMatchObject({ keys: [{ epoch: 3 }] });
    expect(
      await openedRotationBox(taylor, sealed, { ...made, previous: key }),
    ).toBeUndefined();
    expect(await isMemberDevice(brisbane, D)).toBe(false);
  });
});

describe('SHARING-275.1', () => {
  test('[SHARING-275.1] rotates for the group at its next sync after a phone has left, and writes down who left', async () => {
    const world = await danaIn();
    const { taylor, dana, brisbane, A } = world;
    expect(await leave(dana, brisbane)).toEqual({ outcome: 'left' });
    const from = mark();

    await sync(taylor);

    const [rotation, ...more] = await rotationsBy(taylor, from);
    expect(more).toEqual([]);
    expect(rotation).toMatchObject({ epoch: 2, remove: [] });
    expect(rotation.boxes.map(({ deviceId }) => deviceId)).toEqual([A]);
    expect(rotation.events).toHaveLength(2);
    const ledger = await ledgerOf(taylor);
    expect(namesOf(ledger.members)).toEqual(['Taylor', 'Casey', 'Blake']);
    expect(namesOf(ledger.formerMembers)).toContain('Dana');
    expect(secureStoreEntry(taylor, keyEntry(brisbane, 2))).toBeDefined();
  });

  test('[SHARING-275.1] rotates when its upload is refused because the group needs a rotation, and uploads under the new key', async () => {
    const world = await danaIn();
    const { taylor, dana, brisbane } = world;
    // Dana's last change keeps Taylor's cursor behind, so its download gets a page.
    await addExpense(dana, { title: 'Taxi' });
    await sync(dana);
    expect(await leave(dana, brisbane)).toEqual({ outcome: 'left' });
    await addExpense(taylor, { title: 'Lunch' });
    const from = mark();

    await sync(taylor);

    expect(await rotationsBy(taylor, from)).toHaveLength(1);
    const sentUploads = await uploads(taylor, from);
    expect(sentUploads[0]).toMatchObject({ epoch: 1, status: 409 });
    expect(sentUploads.at(-1)).toMatchObject({ epoch: 2, status: 200 });
    expect(await unsent(taylor)).toEqual([]);
    expect(await titles(taylor)).toEqual(
      expect.arrayContaining(['Lunch', 'Taxi']),
    );
  });

  test('[SHARING-275.1] rotates no second time when the API says another phone has rotated: it asks for the key and syncs', async () => {
    const { taylor, dana, brisbane } = await danaIn();
    expect(await leave(dana, brisbane)).toEqual({ outcome: 'left' });
    answerNext('POST', 409, { error: 'epoch', epoch: 2 });
    const from = mark();

    await sync(taylor);

    expect(await rotationsBy(taylor, from)).toHaveLength(1);
    const sentLines = await lines(taylor, from);
    const rotation = sentLines.indexOf(`POST /groups/${brisbane}/rotation`);
    const keys = sentLines.indexOf(`GET /groups/${brisbane}/keys`, rotation);
    expect(rotation).toBeGreaterThan(-1);
    expect(keys).toBeGreaterThan(rotation);
    expect(
      sentLines.indexOf(`GET /groups/${brisbane}/events`, keys),
    ).toBeGreaterThan(keys);
  });
});

describe('SHARING-276.1', () => {
  test('[SHARING-276.1] syncs, leaves on the API with a request that carries nothing, and keeps the group as a copy it left', async () => {
    const world = await danaIn();
    const { dana, brisbane, D } = world;
    const from = mark();

    expect(await leave(dana, brisbane)).toEqual({ outcome: 'left' });

    const sentLines = await lines(dana, from);
    expect(sentLines[0]).toBe(`GET /groups/${brisbane}/events`);
    expect(sentLines.at(-1)).toBe(`POST /groups/${brisbane}/leave`);
    expect((await sentBy(dana, from)).at(-1)!.body).toHaveLength(0);
    expect(await copyOn(dana, brisbane)).toEqual({ reason: 'left', unsent: 0 });
    expect(await isMemberDevice(brisbane, D)).toBe(false);
    expect(await hasGroup(dana)).toBe(true);
  });

  test('[SHARING-276.1] uploads what the phone had not sent before it leaves', async () => {
    const world = await danaIn();
    const { taylor, dana, brisbane } = world;
    goOffline();
    await addExpense(dana, { title: 'Taxi' });
    goOnline();

    expect(await leave(dana, brisbane)).toEqual({ outcome: 'left' });
    await sync(taylor);

    expect(await copyOn(dana, brisbane)).toEqual({ reason: 'left', unsent: 0 });
    expect(await titles(taylor)).toContain('Taxi');
  });

  test('[SHARING-276.1] becomes a copy of a phone that is no member when it was removed before it left', async () => {
    const world = await danaIn();
    const { dana, brisbane, ids } = world;
    expect(await remove(world, ids.Dana)).toEqual({ outcome: 'removed' });

    expect(await leave(dana, brisbane)).toEqual({ outcome: 'left' });

    expect(await copyOn(dana, brisbane)).toMatchObject({
      reason: 'not-a-member',
    });
  });

  test('[SHARING-276.1] lets the phone that stays see the member gone once it has rotated', async () => {
    const world = await danaIn();
    const { taylor, dana, brisbane } = world;
    expect(await leave(taylor, brisbane)).toEqual({ outcome: 'left' });

    await sync(dana);

    const ledger = await ledgerOf(dana);
    expect(namesOf(ledger.members)).toEqual(['Casey', 'Blake', 'Dana']);
    expect(namesOf(ledger.formerMembers)).toContain('Taylor');
  });
});

describe('SHARING-277.1', () => {
  test('[SHARING-277.1] reports no answer when the network is gone, and stays a member', async () => {
    const world = await danaIn();
    const { dana, brisbane, D } = world;
    goOffline();

    expect(await leave(dana, brisbane)).toEqual({ outcome: 'no-answer' });

    goOnline();
    expect(await copyOn(dana, brisbane)).toBeUndefined();
    expect(await isMemberDevice(brisbane, D)).toBe(true);
  });

  test('[SHARING-277.1] fails for an answer it cannot read, and stays a member', async () => {
    const world = await danaIn();
    const { dana, brisbane } = world;
    answerNext('POST', 500, '');

    expect(await leave(dana, brisbane)).toEqual({ outcome: 'failed' });

    expect(await copyOn(dana, brisbane)).toBeUndefined();
  });

  test('[SHARING-277.1] becomes a copy at its next sync when the API took the leave and the answer was lost', async () => {
    const world = await danaIn();
    const { dana, brisbane } = world;
    loseAnswerTo('POST');

    expect(await leave(dana, brisbane)).toEqual({ outcome: 'no-answer' });
    expect(await copyOn(dana, brisbane)).toBeUndefined();

    await sync(dana);

    expect(await copyOn(dana, brisbane)).toMatchObject({
      reason: 'not-a-member',
    });
  });
});

/** Taylor, Dana and Evan in Brisbane; Taylor's phone then removes Evan's, who was Casey. Dana has not synced since. */
async function evanRemoved() {
  const world = await danaIn();
  const { invite, taylor, ids } = world;
  const { phone: evan, device: E } = await joins(invite, 'Evan', {
    memberId: ids.Casey,
  });
  await sync(world.dana);
  expect(await remove(world, ids.Casey)).toEqual({ outcome: 'removed' });
  await sync(taylor);
  return { ...world, evan, E };
}

describe('SHARING-278.1', () => {
  test('[SHARING-278.1] asks for the keys after its own epoch when a download stops at an event under a newer one, and syncs again', async () => {
    const { taylor, dana, brisbane } = await evanRemoved();
    const from = mark();

    await sync(dana);

    const sentLines = await lines(dana, from);
    const keys = sentLines.indexOf(`GET /groups/${brisbane}/keys`);
    expect(keys).toBeGreaterThan(0);
    expect(sentLines[0]).toBe(`GET /groups/${brisbane}/events`);
    expect(sentLines[keys + 1]).toBe(`GET /groups/${brisbane}/events`);
    expect(await keyQuestionsBy(dana, from)).toEqual(['?after=1']);
    expect(secureStoreEntry(dana, keyEntry(brisbane, 2))?.value).toBe(
      toHex(keyOf(taylor, brisbane, 2)),
    );
    expect(namesOf((await ledgerOf(dana)).formerMembers)).toContain('Casey');
  });

  test('[SHARING-278.1] asks for the key when its upload is refused for the key epoch, and sends the upload under it', async () => {
    const { dana } = await evanRemoved();
    // Dana's download stops before the events of epoch 2 and gets no key this time.
    whenAnswered('GET', async () => undefined);
    answerNext('GET', 200, { keys: [], more: false });
    await sync(dana);
    await addExpense(dana, { title: 'Taxi' });
    const from = mark();

    await sync(dana);

    expect(await keyQuestionsBy(dana, from)).toContain('?after=1');
    expect((await uploads(dana, from)).at(-1)).toMatchObject({
      epoch: 2,
      status: 200,
    });
    expect(await unsent(dana)).toEqual([]);
  });

  test('[SHARING-278.1] names the epoch it has reached the next time it asks, which lets the API drop the boxes before it', async () => {
    const world = await evanRemoved();
    const { dana, ids } = world;
    await sync(dana);
    const { phone: finn } = await joins(await invitesAgain(world), 'Finn', {
      memberId: ids.Blake,
    });
    expect(await hasGroup(finn)).toBe(true);
    expect(await remove(world, ids.Blake)).toEqual({ outcome: 'removed' });
    const from = mark();

    await sync(dana);

    expect(await keyQuestionsBy(dana, from)).toEqual(['?after=2']);
    expect(secureStoreEntry(dana, keyEntry(world.brisbane, 3))).toBeDefined();
  });

  test('[SHARING-278.1] asks for the key of the snapshot it waits for, and takes that snapshot in at the sync that follows', async () => {
    const { taylor, dana, brisbane } = await evanRemoved();
    await addExpense(taylor, { title: 'Lunch' });
    await sync(taylor);
    // 31 days on, the cleanup deletes what Dana's phone has not downloaded: it is behind,
    // and holds the key of epoch 1 only.
    const away = LATER + 31 * DAY;
    setApiTime(away);
    setClock(taylor, away);
    setClock(dana, away);
    await cleanUpAt(away);
    await sync(dana);
    expect(await waits(dana)).toBe(true);
    // Taylor's phone, which keeps up, uploads its snapshot under epoch 2.
    await sync(taylor);
    const from = mark();

    await sync(dana);

    const sent = await requestsOf(dana, from);
    const keys = sent.indexOf(`GET /groups/${brisbane}/keys?after=1`);
    expect(sent.indexOf('ask')).toBeGreaterThan(0);
    expect(keys).toBeGreaterThan(sent.indexOf('ask'));
    expect(sent.indexOf('get chunk 0')).toBeGreaterThan(keys);
    expect(await keyQuestionsBy(dana, from)).toEqual(['?after=1']);
    expect(secureStoreEntry(dana, keyEntry(brisbane, 2))?.value).toBe(
      toHex(keyOf(taylor, brisbane, 2)),
    );
    expect(await waits(dana)).toBe(false);
    expect(await titles(dana)).toContain('Lunch');
    expect(namesOf((await ledgerOf(dana)).formerMembers)).toContain('Casey');
  });

  test('[SHARING-278.1] syncs no more when the API holds no box for it', async () => {
    const { dana, brisbane } = await evanRemoved();
    whenAnswered('GET', async () => undefined);
    answerNext('GET', 200, { keys: [], more: false });
    const from = mark();

    await sync(dana);

    expect(await lines(dana, from)).toEqual([
      `GET /groups/${brisbane}/events`,
      `GET /groups/${brisbane}/keys`,
    ]);
    expect(secureStoreEntry(dana, keyEntry(brisbane, 2))).toBeUndefined();
  });

  test('[SHARING-278.1] opens the boxes of two rotations it missed in order, with one question', async () => {
    const world = await evanRemoved();
    const { taylor, dana, brisbane, ids } = world;
    const { phone: finn } = await joins(await invitesAgain(world), 'Finn', {
      memberId: ids.Blake,
    });
    expect(await hasGroup(finn)).toBe(true);
    expect(await remove(world, ids.Blake)).toEqual({ outcome: 'removed' });
    await sync(taylor);
    const from = mark();

    await sync(dana);

    expect(await keyQuestionsBy(dana, from)).toEqual(['?after=1']);
    // The box of epoch 3 opens only with the key of epoch 2, which came in the box before it.
    for (const epoch of [2, 3]) {
      expect(secureStoreEntry(dana, keyEntry(brisbane, epoch))?.value).toBe(
        toHex(keyOf(taylor, brisbane, epoch)),
      );
    }
    expect(namesOf((await ledgerOf(dana)).formerMembers)).toEqual(
      expect.arrayContaining(['Casey', 'Blake']),
    );
  });

  test('[SHARING-278.1] [SYNC-305.1] reads the keys it holds before it asks, once its local data went back and it waits for a snapshot under a newer key', async () => {
    const world = await danaIn();
    const { invite, taylor, brisbane, ids } = world;
    // Dana's phone at key epoch 1.
    const copy = await copyOfData(world.dana);
    // Two rotations, and Dana's phone fetches each key: when it asks after epoch 2, the API
    // drops the box of epoch 2.
    await joins(invite, 'Evan', { memberId: ids.Casey });
    expect(await remove(world, ids.Casey)).toEqual({ outcome: 'removed' });
    await sync(taylor);
    await sync(world.dana);
    await joins(await invitesAgain(world), 'Finn', { memberId: ids.Blake });
    expect(await remove(world, ids.Blake)).toEqual({ outcome: 'removed' });
    await sync(taylor);
    await sync(world.dana);
    expect(secureStoreEntry(world.dana, keyEntry(brisbane, 3))).toBeDefined();
    // Its local data goes back, and the key is rotated once more while it is away.
    const dana = await restoreData(world.dana, copy);
    await joins(await invitesAgain(world), 'Gina');
    expect(await remove(world, (await memberIds(taylor)).Gina)).toEqual({
      outcome: 'removed',
    });
    await addExpense(taylor, { title: 'Lunch' });
    await sync(taylor);
    // 31 days on, the cleanup deletes what Dana's phone would download: it needs a snapshot,
    // and the one Taylor's phone uploads is under key epoch 4.
    const away = LATER + 31 * DAY;
    setApiTime(away);
    setClock(taylor, away);
    setClock(dana, away);
    await cleanUpAt(away);
    await sync(dana);
    expect(await waits(dana)).toBe(true);
    await sync(taylor);
    const from = mark();

    await sync(dana);

    expect(await keyQuestionsBy(dana, from)).toEqual(['?after=3']);
    expect(secureStoreEntry(dana, keyEntry(brisbane, 4))?.value).toBe(
      toHex(keyOf(taylor, brisbane, 4)),
    );
    expect(await waits(dana)).toBe(false);
    expect(await titles(dana)).toContain('Lunch');
  });
});

describe('SHARING-279.1', () => {
  /** Dana's sync gets its page from the API and, for its question for keys, these boxes from the test. */
  async function danaIsHanded(
    world: Awaited<ReturnType<typeof evanRemoved>>,
    keys: { epoch: number; senderKey: string; box: string }[],
  ) {
    whenAnswered('GET', async () => undefined);
    answerNext('GET', 200, { keys, more: false });
    await sync(world.dana);
  }

  test.each([
    ['another sender key', 'senderKey'],
    ['a salt from another key', 'salt'],
    ['the device ID of another phone', 'device'],
    ['one changed bit', 'bit'],
    ['an empty object', 'empty'],
    ['no key at all', 'none'],
    ['the key of another epoch', 'epoch'],
    ['a key that is no key', 'short'],
    ['two keys', 'two'],
  ] as const)(
    '[SHARING-279.1] saves no key from a box with %s, and asks again at the next sync',
    async (_, what) => {
      const world = await evanRemoved();
      const { taylor, dana, brisbane, D, A, key } = world;
      const newKey = toHex(keyOf(taylor, brisbane, 2));
      const right = { groupId: brisbane, device: D, epoch: 2, previous: key };
      const good = { keys: [{ epoch: 2, key: newKey }] };
      const content: Record<string, unknown> = {
        empty: {},
        none: { keys: [] },
        epoch: { keys: [{ epoch: 3, key: newKey }] },
        short: { keys: [{ epoch: 2, key: 'abc' }] },
        two: {
          keys: [
            { epoch: 2, key: newKey },
            { epoch: 3, key: newKey },
          ],
        },
      };
      let box = await rotationBox(
        taylor,
        dana,
        {
          ...right,
          ...(what === 'salt' ? { previous: randomBytes(32) } : {}),
          ...(what === 'device' ? { device: A } : {}),
        },
        content[what] ?? good,
      );
      if (what === 'bit') {
        const bytes = fromHex(box);
        bytes[bytes.length - 1] ^= 1;
        box = toHex(bytes);
      }
      const senderKey =
        what === 'senderKey'
          ? await boxKeyOf(world.evan)
          : await boxKeyOf(taylor);

      await danaIsHanded(world, [{ epoch: 2, senderKey, box }]);

      expect(secureStoreEntry(dana, keyEntry(brisbane, 2))).toBeUndefined();
      const from = mark();
      whenAnswered('GET', async () => undefined);
      answerNext('GET', 200, { keys: [], more: false });
      await sync(dana);
      expect(await keyQuestionsBy(dana, from)).toEqual(['?after=1']);
    },
  );

  test('[SHARING-279.1] saves no key from a box of an epoch that does not follow its own', async () => {
    const world = await evanRemoved();
    const { taylor, dana, brisbane, D, key } = world;
    const box = await rotationBox(
      taylor,
      dana,
      { groupId: brisbane, device: D, epoch: 3, previous: key },
      { keys: [{ epoch: 3, key: toHex(randomBytes(32)) }] },
    );

    await danaIsHanded(world, [
      { epoch: 3, senderKey: await boxKeyOf(taylor), box },
    ]);

    expect(secureStoreEntry(dana, keyEntry(brisbane, 3))).toBeUndefined();
    expect(secureStoreEntry(dana, keyEntry(brisbane, 2))).toBeUndefined();
  });

  test('[SHARING-279.1] saves neither key when the first of two boxes does not open: the second is sealed from the key it then lacks', async () => {
    const { taylor, dana, brisbane, D } = await evanRemoved();
    const senderKey = await boxKeyOf(taylor);
    const third = await rotationBox(
      taylor,
      dana,
      {
        groupId: brisbane,
        device: D,
        epoch: 3,
        previous: keyOf(taylor, brisbane, 2),
      },
      { keys: [{ epoch: 3, key: toHex(randomBytes(32)) }] },
    );
    whenAnswered('GET', async () => undefined);
    answerNext('GET', 200, {
      keys: [
        { epoch: 2, senderKey, box: randomBytes(120).toString('hex') },
        { epoch: 3, senderKey, box: third },
      ],
      more: false,
    });

    await sync(dana);

    expect(secureStoreEntry(dana, keyEntry(brisbane, 2))).toBeUndefined();
    expect(secureStoreEntry(dana, keyEntry(brisbane, 3))).toBeUndefined();
  });
});

describe('SHARING-280.1', () => {
  test('[SHARING-280.1] saves no key that does not open the event the phone stopped at, and passes no event', async () => {
    const world = await evanRemoved();
    const { taylor, dana, brisbane, D, key } = world;
    const wrongKey = toHex(randomBytes(32));
    const box = await rotationBox(
      taylor,
      dana,
      { groupId: brisbane, device: D, epoch: 2, previous: key },
      { keys: [{ epoch: 2, key: wrongKey }] },
    );
    whenAnswered('GET', async () => undefined);
    answerNext('GET', 200, {
      keys: [{ epoch: 2, senderKey: await boxKeyOf(taylor), box }],
      more: false,
    });

    await sync(dana);

    expect(secureStoreEntry(dana, keyEntry(brisbane, 2))).toBeUndefined();
    expect(await refusals(dana)).toEqual([]);
    expect(namesOf((await ledgerOf(dana)).members)).toContain('Casey');

    // The right key, from the API's own box, lets the events in.
    await sync(dana);
    expect(namesOf((await ledgerOf(dana)).formerMembers)).toContain('Casey');
  });
});

describe('SHARING-281.1', () => {
  test('[SHARING-281.1] joins from the snapshot it was approved with, and fetches the newer key when its first sync stops', async () => {
    const world = await danaIn();
    const { invite, taylor, brisbane, ids } = world;
    const { phone: evan } = await joins(invite, 'Evan', {
      memberId: ids.Casey,
      join: false,
    });
    expect(await remove(world, ids.Dana)).toEqual({ outcome: 'removed' });
    await sync(taylor);
    const from = mark();

    expect(
      await on(evan, () =>
        evan.sharing.askJoinResult(evan.database, invite.code),
      ),
    ).toMatchObject({ outcome: 'joined' });
    await sync(evan);

    expect(await keyQuestionsBy(evan, from)).toContain('?after=1');
    expect(secureStoreEntry(evan, keyEntry(brisbane, 2))?.value).toBe(
      toHex(keyOf(taylor, brisbane, 2)),
    );
    expect(namesOf((await ledgerOf(evan)).formerMembers)).toContain('Dana');
  });

  /**
   * Evan's phone was approved and has not joined. Dana is removed since, so Brisbane is at
   * key epoch 2. 31 days on, the cleanup has deleted the snapshot the approval left: Evan's
   * phone asks and is told there is none, and Taylor's phone, which keeps up, uploads
   * another, under key epoch 2. Evan's handover still holds the key of epoch 1 alone.
   */
  async function approvedBeforeARotation() {
    const world = await danaIn();
    const { invite, taylor, ids } = world;
    const { phone: evan } = await joins(invite, 'Evan', {
      memberId: ids.Casey,
      join: false,
    });
    expect(await remove(world, ids.Dana)).toEqual({ outcome: 'removed' });
    await sync(taylor);
    const away = LATER + 31 * DAY;
    setApiTime(away);
    setClock(taylor, away);
    setClock(evan, away);
    await cleanUpAt(away);
    expect(
      await on(evan, () =>
        evan.sharing.askJoinResult(evan.database, invite.code),
      ),
    ).toMatchObject({ outcome: 'approved' });
    await sync(taylor);
    return { ...world, evan };
  }

  test('[SHARING-281.1] fetches the key after the one in its handover when its snapshot is under a newer key epoch, then takes the snapshot in', async () => {
    const { invite, taylor, evan, brisbane } = await approvedBeforeARotation();
    const from = mark();

    expect(
      await on(evan, () =>
        evan.sharing.askJoinResult(evan.database, invite.code),
      ),
    ).toMatchObject({ outcome: 'joined' });

    const sent = await requestsOf(evan, from);
    const keys = sent.indexOf(`GET /groups/${brisbane}/keys?after=1`);
    expect(sent).toContain('ask');
    expect(keys).toBeGreaterThan(sent.indexOf('ask'));
    expect(sent.indexOf('get chunk 0')).toBeGreaterThan(keys);
    expect(secureStoreEntry(evan, keyEntry(brisbane, 2))?.value).toBe(
      toHex(keyOf(taylor, brisbane, 2)),
    );
    expect(namesOf((await ledgerOf(evan)).formerMembers)).toContain('Dana');
  });

  test('[SHARING-281.1] takes no snapshot in, and has not joined, when the API holds no box for it', async () => {
    const { invite, evan, brisbane } = await approvedBeforeARotation();
    // The question for the snapshot gets its answer; the one for the keys gets no box.
    whenAnswered('GET', async () =>
      answerNext('GET', 200, { keys: [], more: false }),
    );
    const from = mark();

    expect(
      await on(evan, () =>
        evan.sharing.askJoinResult(evan.database, invite.code),
      ),
    ).toMatchObject({ outcome: 'approved' });

    const sent = await requestsOf(evan, from);
    expect(sent).toContain(`GET /groups/${brisbane}/keys?after=1`);
    expect(sent.filter((line) => line.startsWith('get chunk'))).toEqual([]);
    expect(secureStoreEntry(evan, keyEntry(brisbane, 2))).toBeUndefined();
    expect(await hasGroup(evan)).toBe(false);
  });
});

describe('SHARING-282.1', () => {
  test('[SHARING-282.1] takes a request that was approved for declined once the API holds no handover for it, and keeps none of its keys', async () => {
    const world = await danaIn();
    const { invite, taylor, brisbane, A, D, ids } = world;
    const { phone: evan, device: E } = await joins(invite, 'Evan', {
      memberId: ids.Casey,
      join: false,
    });
    // Its first try opens the box and stops at the snapshot.
    answerNext('GET', 500, '');
    expect(
      await on(evan, () =>
        evan.sharing.askJoinResult(evan.database, invite.code),
      ),
    ).toMatchObject({ outcome: 'approved' });
    expect(secureStoreEntry(evan, keyEntry(brisbane, 1))).toBeDefined();
    // Another member's phone removes it, and the invite is still active: the test sends
    // that rotation itself, since Taylor's own phone would revoke the invite next.
    const removed = await sendAs(
      taylor,
      'POST',
      `/groups/${brisbane}/rotation`,
      {
        epoch: 2,
        remove: [E],
        senderKey: await boxKeyOf(taylor),
        boxes: [A, D].map((deviceId) => ({
          deviceId,
          box: randomBytes(120).toString('hex'),
        })),
        events: [],
      },
    );
    expect(removed.status).toBe(200);

    expect(
      await on(evan, () =>
        evan.sharing.askJoinResult(evan.database, invite.code),
      ),
    ).toEqual({ outcome: 'declined' });

    expect(secureStoreEntry(evan, keyEntry(brisbane, 1))).toBeUndefined();
    expect(await hasGroup(evan)).toBe(false);
  });
});

describe('SHARING-284.1', () => {
  test('[SHARING-284.1] revokes the invite the removed phone knows, writes its deletion, and makes a new one when asked', async () => {
    const world = await danaIn();
    const { invite, taylor, brisbane, ids } = world;
    const from = mark();

    expect(await remove(world, ids.Dana)).toEqual({ outcome: 'removed' });
    await sync(taylor);

    expect(await lines(taylor, from)).toContain(
      `DELETE /groups/${brisbane}/invites/${invite.code}`,
    );
    expect(
      (await sendAs(taylor, 'GET', `/invites/${invite.code}`)).status,
    ).toBe(404);
    expect(await unsent(taylor)).toEqual([]);

    const again = await on(taylor, () =>
      taylor.sharing.prepareInvite(taylor.database, brisbane),
    );
    expect(again).toMatchObject({ code: expect.any(String) });
    expect((again as { code: string }).code).not.toBe(invite.code);
    const later = mark();
    await sync(taylor);
    await sync(taylor);
    expect(
      (await lines(taylor, later)).filter((line) => line.startsWith('DELETE ')),
    ).toEqual([]);
  });

  test('[SHARING-284.1] leaves no request to approve under the invite it revokes: an approval after a phone has left fails while the phone rotates and revokes, and the next one finds the request answered', async () => {
    const { invite, taylor, dana, brisbane } = await danaIn();
    const evan = await phoneOf('Evan', invite);
    const E = await asks(evan, invite);
    const request = await listedFor(invite, E);
    expect(await leave(dana, brisbane)).toEqual({ outcome: 'left' });
    const from = mark();
    const approve = () =>
      on(taylor, () =>
        taylor.sharing.approveJoinRequest(taylor.database, brisbane, request),
      );

    // The sync before the approval is refused: the group needs a rotation (SHARING-200.2).
    expect(await approve()).toEqual({ outcome: 'failed' });

    const sentLines = await lines(taylor, from);
    const rotation = sentLines.indexOf(`POST /groups/${brisbane}/rotation`);
    expect(sentLines[0]).toBe(`GET /groups/${brisbane}/events`);
    expect(rotation).toBeGreaterThan(0);
    expect(
      sentLines.indexOf(`DELETE /groups/${brisbane}/invites/${invite.code}`),
    ).toBeGreaterThan(rotation);
    expect(await requestOnApi(invite.code, E)).toBeUndefined();

    expect(await approve()).toEqual({ outcome: 'answered' });
    expect(await approvalsBy(taylor, from)).toEqual([]);
    expect(await isMemberDevice(brisbane, E)).toBe(false);
  });
});

describe('SHARING-285.1', () => {
  test('[SHARING-285.1] sends the keys and the member that left only as ciphertext', async () => {
    const world = await danaIn();
    const { taylor, dana, brisbane, key, ids } = world;
    expect(await remove(world, ids.Dana)).toEqual({ outcome: 'removed' });
    await sync(taylor);
    const newKey = keyOf(taylor, brisbane, 2);
    const secrets = [
      toHex(key),
      toHex(newKey),
      toHex(deriveKey({ secret: key, purpose: ROTATION })),
      ids.Dana,
      'Dana',
      dana.identity.userId,
    ];

    for (const request of await sentBy(taylor)) {
      for (const text of secrets) {
        expect(requestHolds(request, text)).toBe(false);
      }
    }
  });
});

describe('SYNC-300.1', () => {
  test('[SYNC-300.1] makes the ledger a read-only copy on a phone that was removed, at its next sync', async () => {
    const world = await danaIn();
    const { dana, brisbane, ids } = world;
    expect(await remove(world, ids.Dana)).toEqual({ outcome: 'removed' });
    expect(await copyOn(dana, brisbane)).toBeUndefined();

    await sync(dana);

    expect(await copyOn(dana, brisbane)).toEqual({
      reason: 'not-a-member',
      unsent: 0,
    });
    expect(await hasGroup(dana)).toBe(true);
  });

  test('[SYNC-300.1] is no copy after an answer that is not that refusal', async () => {
    const world = await danaIn();
    const { dana, brisbane } = world;

    for (const [status, body] of [
      [403, { error: 'something-else' }],
      [404, { error: 'not-a-member' }],
      [500, ''],
    ] as const) {
      answerNext('GET', status, body);
      await sync(dana);
      expect(await copyOn(dana, brisbane)).toBeUndefined();
    }
  });
});

describe('SYNC-302.1', () => {
  test('[SYNC-302.1] keeps what a removed phone had not uploaded, deletes its keys, and sends nothing more for the group', async () => {
    const world = await danaIn();
    const { dana, brisbane, ids } = world;
    goOffline();
    await addExpense(dana, { title: 'Taxi' });
    const waiting = await unsent(dana);
    expect(waiting).toHaveLength(1);
    goOnline();
    expect(await remove(world, ids.Dana)).toEqual({ outcome: 'removed' });
    expect(secureStoreEntry(dana, keyEntry(brisbane, 1))).toBeDefined();

    await sync(dana);

    expect(await copyOn(dana, brisbane)).toEqual({
      reason: 'not-a-member',
      unsent: 1,
    });
    expect(await unsent(dana)).toEqual(waiting);
    expect(await titles(dana)).toContain('Taxi');
    expect(secureStoreEntry(dana, keyEntry(brisbane, 1))).toBeUndefined();

    const from = mark();
    await sync(dana);
    await sync(dana);
    expect(await lines(dana, from)).toEqual([]);
  });
});

describe('SYNC-301.1', () => {
  test('[SYNC-301.1] makes the ledger a read-only copy on a phone whose seed is gone, with no request sent', async () => {
    const world = await danaIn();
    const { dana, brisbane } = world;
    await loseSeed(dana);
    const from = mark();

    await sync(dana);

    expect(await copyOn(dana, brisbane)).toMatchObject({ reason: 'lapsed' });
    expect(await lines(dana, from)).toEqual([]);
  });
});

describe('SYNC-304.1', () => {
  test('[SYNC-304.1] does not apply an event under a key epoch lower than one it has received, records it, and applies what follows', async () => {
    const { a, b, brisbane, key, B } = await twoPhones();
    const key2 = new Uint8Array(randomBytes(32));
    const stamp = (seconds: number) => ({
      ms: NOW + seconds * 1_000,
      counter: 0,
      device: B,
    });
    await uploadAs(b, key, [await created(b, 'Lunch', stamp(1))]);
    await setEpoch(brisbane, 2);
    await saveKey(a, brisbane, 2, key2);
    await uploadAs(b, key2, [await created(b, 'Taxi', stamp(2))], { epoch: 2 });
    // The API takes no upload under an old epoch; the test puts one in as it could not.
    await setEpoch(brisbane, 1);
    const [coffee] = await uploadAs(b, key, [
      await created(b, 'Coffee', stamp(3)),
    ]);
    await setEpoch(brisbane, 2);
    await uploadAs(b, key2, [await created(b, 'Supper', stamp(4))], {
      epoch: 2,
    });

    await sync(a);

    expect(await titles(a)).toEqual(['Lunch', 'Supper', 'Taxi']);
    expect(await refusals(a)).toMatchObject([
      {
        id: coffee,
        device: B,
        groupId: brisbane,
        reason: 'epoch',
        content: null,
      },
    ]);
  });

  test('[SYNC-304.1] keeps such an event out of the changes not applied though the phone itself uploaded it', async () => {
    const { a, brisbane, key, A } = await twoPhones();
    const key2 = new Uint8Array(randomBytes(32));
    const stamp = (seconds: number) => ({
      ms: NOW + seconds * 1_000,
      counter: 0,
      device: A,
    });
    await setEpoch(brisbane, 2);
    await saveKey(a, brisbane, 2, key2);
    await uploadAs(a, key2, [await created(a, 'Taxi', stamp(1))], { epoch: 2 });
    // The API takes no upload under an old epoch; the test puts one in as it could not.
    await setEpoch(brisbane, 1);
    const [coffee] = await uploadAs(a, key, [
      await created(a, 'Coffee', stamp(2)),
    ]);
    await setEpoch(brisbane, 2);

    await sync(a);

    expect(await titles(a)).toEqual(['Taxi']);
    expect(await refusals(a)).toMatchObject([
      { id: coffee, device: A, reason: 'epoch', content: null },
    ]);
    expect(await a.sync.listUnappliedChanges(a.database)).toEqual([]);
  });
});

// Coming back (ADR-0042)

/**
 * Dana's phone was removed and holds a read-only copy; meanwhile Taylor's phone added
 * Lunch. Dana's phone asks to join again under its own name, as a new member, and Taylor's
 * phone approves it by adding Dana back. `from` marks the requests before the approval.
 */
async function danaIsApprovedAgain() {
  const world = await danaIn();
  const { taylor, dana, D, brisbane, ids } = world;
  expect(await remove(world, ids.Dana)).toEqual({ outcome: 'removed' });
  await sync(taylor);
  await sync(dana);
  await addExpense(taylor, { title: 'Lunch' });
  await sync(taylor);
  const invite = await invitesAgain(world);
  await asks(dana, invite);
  const request = await listedFor(invite, D);
  const from = mark();
  expect(
    await on(taylor, () =>
      taylor.sharing.approveJoinRequest(
        taylor.database,
        brisbane,
        request,
        ids.Dana,
      ),
    ),
  ).toEqual({ outcome: 'approved' });
  return { ...world, invite, from };
}

describe('SHARING-196.2', () => {
  test('[SHARING-196.2] [SHARING-288.1] an approval that adds a former member back carries the change to his record and the roster entry that names him, and no new member', async () => {
    const { taylor, A, D, brisbane, ids, from } = await danaIsApprovedAgain();

    const [approval] = await approvalsBy(taylor, from);

    expect(approval.epoch).toBe(2);
    const key = keyOf(taylor, brisbane, 2);
    const sent = approval.events.map(({ id, content }) => {
      const plaintext = opened(
        key,
        { groupId: brisbane, eventId: id, deviceId: A, epoch: 2 },
        fromHex(content),
      );
      if (!plaintext) throw new Error('An event of the approval does not open');
      return JSON.parse(Buffer.from(plaintext).toString('utf8')) as {
        type: string;
        id: string;
        units: Record<string, { value: unknown; base?: unknown }>;
      };
    });
    expect(sent.map(({ type, id }) => [type, id])).toEqual([
      ['member', ids.Dana],
      ['device', D],
    ]);
    expect(sent[0].units).toEqual({
      removed: { value: false, base: expect.objectContaining({ device: A }) },
    });
    expect(sent[1].units.member.value).toMatchObject({ memberId: ids.Dana });
  });
});

describe('SHARING-289.1', () => {
  test('[SHARING-289.1] [SHARING-219.2] a removed phone that is approved again takes the snapshot in place of its copy, and is the member it was', async () => {
    const { taylor, dana, brisbane, ids, invite } = await danaIsApprovedAgain();

    expect(
      await on(dana, () =>
        dana.sharing.askJoinResult(dana.database, invite.code),
      ),
    ).toMatchObject({ outcome: 'joined' });
    await sync(dana);
    await sync(taylor);

    expect(await copyOn(dana, brisbane)).toBeUndefined();
    expect(await titles(dana)).toContain('Lunch');
    const ledger = await ledgerOf(dana);
    expect(namesOf(ledger.members).sort()).toEqual([
      'Blake',
      'Casey',
      'Dana',
      'Taylor',
    ]);
    expect(ledger.members.find(({ name }) => name === 'Dana')?.id).toBe(
      ids.Dana,
    );
    expect(namesOf(ledger.formerMembers)).not.toContain('Dana');
    expect(namesOf((await ledgerOf(taylor)).members).sort()).toEqual(
      namesOf(ledger.members).sort(),
    );
    // What the phone adds from now on reaches the group.
    await addExpense(dana, { title: 'Taxi' });
    await sync(dana);
    await sync(taylor);
    expect(await titles(taylor)).toContain('Taxi');
  });

  test('[SHARING-289.1] keeps the copy, with what it never sent, while its request waits', async () => {
    const world = await danaIn();
    const { taylor, dana, brisbane, ids } = world;
    goOffline();
    await addExpense(dana, { title: 'Snack' });
    goOnline();
    expect(await remove(world, ids.Dana)).toEqual({ outcome: 'removed' });
    await sync(taylor);
    await sync(dana);
    const held = async () => ({
      copy: await copyOn(dana, brisbane),
      titles: await titles(dana),
      unsent: await unsent(dana),
    });
    const before = await held();
    expect(before.copy).toEqual({ reason: 'not-a-member', unsent: 1 });
    const invite = await invitesAgain(world);

    await asks(dana, invite);
    expect(
      await on(dana, () =>
        dana.sharing.askJoinResult(dana.database, invite.code),
      ),
    ).toMatchObject({ outcome: 'waiting' });

    expect(await held()).toEqual(before);
  });
});

describe('SYNC-305.1', () => {
  test('[SYNC-305.1] takes the key epoch of the events it opens once its local data went back to before a rotation, and asks for the next key from there', async () => {
    const world = await danaIn();
    const { invite, taylor, brisbane, ids } = world;
    // Dana's phone at key epoch 1.
    const copy = await copyOfData(world.dana);
    await joins(invite, 'Evan', { memberId: ids.Casey });
    await sync(world.dana);
    expect(await remove(world, ids.Casey)).toEqual({ outcome: 'removed' });
    await sync(taylor);
    await sync(world.dana);
    expect(secureStoreEntry(world.dana, keyEntry(brisbane, 2))?.value).toBe(
      toHex(keyOf(taylor, brisbane, 2)),
    );

    // Its local data goes back; the secure store keeps both keys.
    const dana = await restoreData(world.dana, copy);
    await sync(dana);
    await addExpense(dana, { title: 'Lunch' });
    const from = mark();
    await sync(dana);

    expect(
      (await uploads(dana, from)).map(({ epoch, status }) => [epoch, status]),
    ).toEqual([[2, 200]]);

    // The next rotation: the phone asks for the keys after the epoch it has reached.
    await joins(await invitesAgain(world), 'Finn', { memberId: ids.Blake });
    await sync(dana);
    expect(await remove(world, ids.Blake)).toEqual({ outcome: 'removed' });
    const asked = mark();
    await sync(dana);

    expect(await keyQuestionsBy(dana, asked)).toEqual(['?after=2']);
    expect(secureStoreEntry(dana, keyEntry(brisbane, 3))).toBeDefined();
  });
});
