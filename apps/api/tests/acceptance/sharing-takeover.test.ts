import { randomBytes, randomUUID } from 'node:crypto';
import { SNAPSHOT_NEEDED_BY_HEADER } from '@shared-expense/domain/api';
import {
  NO_ROUTE,
  T,
  databaseContents,
  expectRefused,
  newPhone,
  registered,
  send,
  setTime,
  signedBy,
  timesStored,
  type Answer,
  type Phone,
} from './sharing-api';
import {
  BEHIND,
  MOST_MEMBER_DEVICES,
  NO_REQUEST,
  approvalOf,
  approvalRequest,
  approve,
  askResult,
  expectApproved,
  expectHandover,
  expectRejected,
  isMemberDevice,
  listRequests,
  naming,
  reject,
  sha256Of,
} from './sharing-decisions-api';
import {
  CODE_A,
  card,
  expectRequestAnswered,
  joinRequest,
  putInvite,
  readInvite,
  revokeInvite,
  sendRequest,
} from './sharing-invites-api';
import {
  DANA,
  bytesOf,
  box,
  expectKeys,
  expectLeft,
  expectRotated,
  keysAfter,
  leave,
  leaveRequest,
  otherDevices,
  rotate,
  rotationNeeded,
  rotationOf,
  rotationRequest,
} from './sharing-removal-api';
import {
  REPLACED,
  TAKEOVER,
  caseyAsksWithDanaIn,
  caseyForDana,
  expectTakenOver,
  expectTakeoverRefused,
  fillBrisbane,
  replacedOn,
  takeOver,
  takeoverBoxFor,
  takeoverOf,
  takeoverPath,
  takeoverRequest,
  type Takeover,
} from './sharing-takeover-api';
import {
  BRISBANE,
  GROUP_FULL,
  NOT_A_MEMBER,
  REQUEST,
  TOKYO,
  aMinuteLater,
  addMember,
  answerHeaders,
  call,
  callForHeaders,
  callOn,
  createGroup,
  download,
  event,
  eventsPath,
  everyEvent,
  expectCreated,
  expectGroupRefused,
  expectPage,
  expectUploaded,
  leavingGroupsAsTheyWere,
  ownServer,
  relayed,
  rowsHolding,
  upload,
  uploadOf,
  useSyncApi,
  wrongEpoch,
} from './sync-api';
import { DAY, cleanUpAt, reach } from './sync-cleanup-api';
import {
  NO_SNAPSHOT,
  ask,
  chunkBody,
  chunkPath,
  chunksStored,
  expectWaiting,
  snapshotOf,
  snapshotPath,
  uploadAll,
} from './sync-snapshot-api';

// Runs against the real API on PostgreSQL. A member's phone approves a request to take a
// member over: one request removes the old device, admits the new one and moves the group
// to the next key epoch (ADR-0047). Dana's phone is the device that is replaced, Casey's
// the one that asked.

useSyncApi();

/** What the group answers a member device that uploads a new event under an epoch no group reaches. */
const stateOf = async (phone: Phone, groupId = BRISBANE) =>
  (await upload(phone, groupId, [event()], Number.MAX_SAFE_INTEGER)).body;

/** The request that downloads the group's events after `cursor`. */
const downloadOf = (groupId: string, cursor = 0) => ({
  path: `${eventsPath(groupId)}?after=${cursor}`,
});

/** A takeover without one of its fields. */
const without = (takeover: Takeover, field: keyof Takeover) =>
  Object.fromEntries(
    Object.entries(takeover).filter(([name]) => name !== field),
  );

describe('SHARING-300.1', () => {
  test('[SHARING-300.1] removes the old device, admits the new one and moves the group to the next key epoch in one request', async () => {
    const world = await caseyAsksWithDanaIn();
    const { taylor, casey, dana, P } = world;
    const takeover = caseyForDana(world);
    setTime(T + 1_000);

    const answer = await takeOver(taylor, BRISBANE, casey, takeover);

    expectTakenOver(answer, casey, takeover, [1]);
    expect(await isMemberDevice(BRISBANE, taylor)).toBe(true);
    expect(await isMemberDevice(BRISBANE, casey)).toBe(true);
    expect(await isMemberDevice(BRISBANE, dana)).toBe(false);
    expect(await stateOf(taylor)).toEqual(wrongEpoch(2));
    expect(await timesStored(P)).toBe(0);
    expect((await listRequests(taylor, BRISBANE)).body).toEqual({
      requests: [],
      more: false,
    });
  });

  test('[SHARING-300.1] gives the new device its handover under the new epoch, its snapshot, and the events from the number the snapshot covers', async () => {
    const world = await caseyAsksWithDanaIn();
    const { taylor, casey, S } = world;
    const takeover = caseyForDana(world);
    setTime(T + 1_000);
    expectTakenOver(
      await takeOver(taylor, BRISBANE, casey, takeover),
      casey,
      takeover,
      [1],
    );

    expectHandover(await askResult(casey, CODE_A), BRISBANE, taylor, takeover);
    expectWaiting(await ask(casey, BRISBANE), S);
    expectPage(await download(casey, BRISBANE, 0), {
      events: [
        relayed(takeover.events[0], {
          sequence: 1,
          by: taylor,
          at: T + 1_000,
          epoch: 2,
        }),
      ],
      more: false,
    });
  });

  test('[SHARING-300.1] refuses the old device from the same moment: it can neither upload nor download', async () => {
    const world = await caseyAsksWithDanaIn();
    const { taylor, casey, dana } = world;
    const takeover = caseyForDana(world);
    expectTakenOver(
      await takeOver(taylor, BRISBANE, casey, takeover),
      casey,
      takeover,
      [1],
    );

    expectGroupRefused(await upload(dana, BRISBANE, [event()]), NOT_A_MEMBER);
    expectGroupRefused(await download(dana, BRISBANE, 0), NOT_A_MEMBER);
    expect((await everyEvent(taylor, BRISBANE)).map(({ id }) => id)).toEqual([
      takeover.events[0].id,
    ]);
  });

  test('[SHARING-300.1] takes later uploads only under the new key epoch', async () => {
    const world = await caseyAsksWithDanaIn();
    const { taylor, casey } = world;
    const takeover = caseyForDana(world);
    expectTakenOver(
      await takeOver(taylor, BRISBANE, casey, takeover),
      casey,
      takeover,
      [1],
    );
    const next = [event()];

    expectGroupRefused(await upload(taylor, BRISBANE, next, 1), wrongEpoch(2));
    expectUploaded(await upload(taylor, BRISBANE, next, 2), next, [2]);
  });

  test('[SHARING-300.1] keeps a box of the new key for each device that stays, and none for the new device, whose key is in its handover', async () => {
    const world = await caseyAsksWithDanaIn();
    const { taylor, casey } = world;
    const takeover = caseyForDana(world);
    expectTakenOver(
      await takeOver(taylor, BRISBANE, casey, takeover),
      casey,
      takeover,
      [1],
    );

    expectKeys(await keysAfter(taylor, BRISBANE, 1), [
      [2, takeover, takeoverBoxFor(takeover, taylor)],
    ]);
    expectKeys(await keysAfter(casey, BRISBANE, 1), []);
  });

  test("[SHARING-300.1] records the new device's progress at the number the snapshot covers", async () => {
    const world = await caseyAsksWithDanaIn({ events: 3, sequence: 2 });
    const { taylor, casey } = world;
    const takeover = caseyForDana(world, { cursor: 3 });
    setTime(T + 1_000);

    expectTakenOver(
      await takeOver(taylor, BRISBANE, casey, takeover),
      casey,
      takeover,
      [4],
    );

    expect(await rowsHolding(BRISBANE, casey.deviceId, 2, T + 1_000)).toBe(1);
  });

  test('[SHARING-300.1] removes two devices at once', async () => {
    const world = await caseyAsksWithDanaIn();
    const { taylor, casey, dana, P, S } = world;
    const other = await registered();
    await addMember(BRISBANE, other);
    const takeover = takeoverOf(P, S, {
      remove: [DANA, other],
      staying: [taylor],
    });

    expectTakenOver(
      await takeOver(taylor, BRISBANE, casey, takeover),
      casey,
      takeover,
      [1],
    );

    expect(await isMemberDevice(BRISBANE, dana)).toBe(false);
    expect(await isMemberDevice(BRISBANE, other)).toBe(false);
    expect(await isMemberDevice(BRISBANE, casey)).toBe(true);
    expect(await isMemberDevice(BRISBANE, taylor)).toBe(true);
  });

  test('[SHARING-300.1] takes over in a group that has its 20 member devices', async () => {
    const world = await caseyAsksWithDanaIn();
    const { taylor, casey, dana, P, S } = world;
    const others: Phone[] = [];
    for (let have = 2; have < MOST_MEMBER_DEVICES; have += 1) {
      const other = await registered();
      await addMember(BRISBANE, other);
      others.push(other);
    }
    const takeover = takeoverOf(P, S, {
      remove: [DANA],
      staying: [taylor, ...others],
    });
    expect(takeover.boxes).toHaveLength(19);

    expectTakenOver(
      await takeOver(taylor, BRISBANE, casey, takeover),
      casey,
      takeover,
      [1],
    );

    expect(await isMemberDevice(BRISBANE, casey)).toBe(true);
    expect(await isMemberDevice(BRISBANE, dana)).toBe(false);
    expect(await isMemberDevice(BRISBANE, others[17])).toBe(true);
  });

  test('[SHARING-300.1] keeps nothing of the removed device: its snapshot and its boxes go', async () => {
    const world = await caseyAsksWithDanaIn();
    const { taylor, casey, P, S } = world;
    const other = await registered();
    await addMember(BRISBANE, other);
    const first = rotationOf([taylor, DANA], { remove: [other.deviceId] });
    expectRotated(await rotate(taylor, BRISBANE, first), first, [1]);
    const forDana = snapshotOf(taylor, DANA, { epoch: 2, sequence: 1 });
    await uploadAll(BRISBANE, forDana);
    const forCasey = snapshotOf(taylor, casey, { epoch: 2, sequence: 1 });
    await uploadAll(BRISBANE, forCasey);
    expect(await chunksStored(S)).toBe(0);
    const takeover = takeoverOf(
      P,
      forCasey,
      { remove: [DANA], staying: [taylor] },
      { cursor: 1, epoch: 3 },
    );

    expectTakenOver(
      await takeOver(taylor, BRISBANE, casey, takeover),
      casey,
      takeover,
      [2],
    );

    expect(await chunksStored(forDana)).toBe(0);
    expect(
      await timesStored(
        bytesOf(first.boxes.find((each) => each.deviceId === DANA)!.box),
      ),
    ).toBe(0);
    expect(await chunksStored(forCasey)).toBe(3);
    expect(await timesStored(bytesOf(takeoverBoxFor(takeover, taylor)))).toBe(
      1,
    );
  });

  test('[SHARING-300.1] names a removed device that waited for a snapshot on no later page', async () => {
    const neededBy = async (phone: Phone, cursor: number) =>
      (await answerHeaders(phone, downloadOf(BRISBANE, cursor))).get(
        SNAPSHOT_NEEDED_BY_HEADER,
      );
    const world = await caseyAsksWithDanaIn();
    const { taylor, casey, dana } = world;
    // Dana's phone asks for a snapshot the group does not store, so the API marks it (SYNC-162.1).
    expect(await ask(dana, BRISBANE)).toEqual({
      status: 404,
      body: NO_SNAPSHOT,
    });
    expect(await neededBy(taylor, 0)).toBe(DANA);
    const takeover = caseyForDana(world);

    expectTakenOver(
      await takeOver(taylor, BRISBANE, casey, takeover),
      casey,
      takeover,
      [1],
    );

    expect(await neededBy(taylor, 1)).toBeNull();
  });

  test("[SHARING-300.1] leaves the group's invite and its other requests as they were", async () => {
    const world = await caseyAsksWithDanaIn();
    const { taylor, casey } = world;
    const applicant = await registered();
    const Q = joinRequest();
    expectRequestAnswered(await sendRequest(applicant, CODE_A, Q), CODE_A);
    const takeover = caseyForDana(world);

    expectTakenOver(
      await takeOver(taylor, BRISBANE, casey, takeover),
      casey,
      takeover,
      [1],
    );

    expect((await readInvite(applicant, CODE_A)).status).toBe(200);
    expect((await listRequests(taylor, BRISBANE)).body).toEqual({
      requests: [
        {
          code: CODE_A,
          deviceId: applicant.deviceId,
          request: Buffer.from(Q).toString('hex'),
        },
      ],
      more: false,
    });
  });

  test('[SHARING-300.1] lets a device that took over approve the next takeover, which removes the device that let it in', async () => {
    const world = await caseyAsksWithDanaIn();
    const { taylor, casey } = world;
    const first = caseyForDana(world);
    expectTakenOver(
      await takeOver(taylor, BRISBANE, casey, first),
      casey,
      first,
      [1],
    );
    const applicant = await registered();
    const Q = joinRequest();
    expectRequestAnswered(await sendRequest(applicant, CODE_A, Q), CODE_A);
    const S2 = snapshotOf(casey, applicant, { epoch: 2, sequence: 1 });
    await uploadAll(BRISBANE, S2);
    const second = takeoverOf(
      Q,
      S2,
      { remove: [taylor], staying: [casey] },
      { cursor: 1, epoch: 3 },
    );

    expectTakenOver(
      await takeOver(casey, BRISBANE, applicant, second),
      applicant,
      second,
      [2],
    );

    expect(await isMemberDevice(BRISBANE, taylor)).toBe(false);
    expect(await isMemberDevice(BRISBANE, applicant)).toBe(true);
    expect(await stateOf(casey)).toEqual(wrongEpoch(3));
  });
});

describe('SHARING-301.1', () => {
  /** Brisbane with one more member device, X, beside Taylor's and Dana's. */
  async function withX() {
    const world = await caseyAsksWithDanaIn();
    const x = await registered();
    await addMember(BRISBANE, x);
    return { ...world, x };
  }

  /** Nothing of the takeover happened: Dana's phone is in, Casey's is out, and its request waits. */
  async function expectAsBefore(
    { taylor, casey, dana, P }: Awaited<ReturnType<typeof withX>>,
    takeover: Takeover,
  ) {
    expect(await isMemberDevice(BRISBANE, dana)).toBe(true);
    expect(await isMemberDevice(BRISBANE, casey)).toBe(false);
    expect(await stateOf(taylor)).toEqual(wrongEpoch(1));
    expect(await timesStored(bytesOf(takeover.events[0].content))).toBe(0);
    expect(await timesStored(P)).toBe(1);
  }

  test('[SHARING-301.1] refuses a takeover that lacks the box of a device that stays, and lists the member devices', async () => {
    const world = await withX();
    const { taylor, casey, x } = world;
    const takeover = caseyForDana(world);

    const answer = await takeOver(taylor, BRISBANE, casey, takeover);

    expectTakeoverRefused(answer, otherDevices(taylor, DANA, x));
    await expectAsBefore(world, takeover);
  });

  test('[SHARING-301.1] refuses a takeover with no box for the phone that sends it', async () => {
    const world = await withX();
    const { taylor, casey, P, S, x } = world;
    const takeover = takeoverOf(P, S, { remove: [DANA], staying: [x] });

    expectTakeoverRefused(
      await takeOver(taylor, BRISBANE, casey, takeover),
      otherDevices(taylor, DANA, x),
    );
    await expectAsBefore(world, takeover);
  });

  test('[SHARING-301.1] refuses a takeover with a box for the device it lets in', async () => {
    const world = await caseyAsksWithDanaIn();
    const { taylor, casey, P, S } = world;
    const takeover = takeoverOf(P, S, {
      remove: [DANA],
      staying: [taylor, casey],
    });

    expectTakeoverRefused(
      await takeOver(taylor, BRISBANE, casey, takeover),
      otherDevices(taylor, DANA),
    );
    expect(await isMemberDevice(BRISBANE, casey)).toBe(false);
  });

  test.each([
    ['a registered device that is no member device', 'stranger'],
    ['a device ID the API has never seen', 'unknown'],
    ['the device that asked', 'applicant'],
    ['the phone that sends it', 'sender'],
  ])('[SHARING-301.1] refuses a takeover that removes %s', async (_, who) => {
    const world = await caseyAsksWithDanaIn();
    const { taylor, casey, dana, P, S } = world;
    const stranger = await registered();
    const remove = {
      stranger: stranger.deviceId,
      unknown: 'ffffffff-ffff-4fff-bfff-ffffffffffff',
      applicant: casey.deviceId,
      sender: taylor.deviceId,
    }[who]!;
    const takeover = takeoverOf(P, S, {
      remove: [remove],
      staying: who === 'sender' ? [dana] : [taylor, dana],
    });

    const answer = await leavingGroupsAsTheyWere(() =>
      takeOver(taylor, BRISBANE, casey, takeover),
    );

    expectTakeoverRefused(answer, otherDevices(taylor, DANA));
    expect(await isMemberDevice(BRISBANE, dana)).toBe(true);
    expect(await timesStored(P)).toBe(1);
  });
});

describe('SHARING-302.1', () => {
  test('[SHARING-302.1] refuses a takeover for a request that was rejected, was replaced, or lost its invite', async () => {
    const answers: Answer[] = [];
    {
      const world = await caseyAsksWithDanaIn();
      const { taylor, casey, P } = world;
      expect((await reject(taylor, BRISBANE, casey, P)).status).toBe(200);
      answers.push(
        await takeOver(taylor, BRISBANE, casey, caseyForDana(world)),
      );
      // Asked again with other content: the hash of P names nothing.
      expectRequestAnswered(
        await sendRequest(casey, CODE_A, joinRequest()),
        CODE_A,
      );
      answers.push(
        await takeOver(taylor, BRISBANE, casey, caseyForDana(world)),
      );
      expect((await revokeInvite(taylor, BRISBANE, CODE_A)).status).toBe(200);
      answers.push(
        await takeOver(taylor, BRISBANE, casey, caseyForDana(world)),
      );
      expect(await isMemberDevice(BRISBANE, world.dana)).toBe(true);
      expect(await stateOf(taylor)).toEqual(wrongEpoch(1));
    }

    for (const answer of answers) expectTakeoverRefused(answer, NO_REQUEST);
  });

  test('[SHARING-302.1] refuses a takeover from a phone whose cursor is behind the group’s last number, and takes it at that number', async () => {
    const world = await caseyAsksWithDanaIn({ events: 3, sequence: 2 });
    const { taylor, casey, dana, P } = world;

    const behind = await leavingGroupsAsTheyWere(() =>
      takeOver(taylor, BRISBANE, casey, caseyForDana(world, { cursor: 2 })),
    );

    expectTakeoverRefused(behind, BEHIND);
    expect(await timesStored(P)).toBe(1);
    expect(await isMemberDevice(BRISBANE, dana)).toBe(true);

    const takeover = caseyForDana(world, { cursor: 3 });
    expectTakenOver(
      await takeOver(taylor, BRISBANE, casey, takeover),
      casey,
      takeover,
      [4],
    );
  });

  test('[SHARING-302.1] refuses a takeover while the group needs a rotation, and lists the member devices', async () => {
    const world = await caseyAsksWithDanaIn();
    const { taylor, casey, P } = world;
    const x = await registered();
    await addMember(BRISBANE, x);
    expectLeft(await leave(x, BRISBANE), x);

    const answer = await leavingGroupsAsTheyWere(() =>
      takeOver(taylor, BRISBANE, casey, caseyForDana(world)),
    );

    expectTakeoverRefused(answer, rotationNeeded(taylor, DANA));
    expect(await timesStored(P)).toBe(1);
    expect(await isMemberDevice(BRISBANE, casey)).toBe(false);
  });

  test('[SHARING-302.1] refuses a takeover to any key epoch but the next, and says which epoch the group has', async () => {
    const world = await caseyAsksWithDanaIn();
    const { taylor, casey, dana } = world;

    const answer = await leavingGroupsAsTheyWere(() =>
      takeOver(taylor, BRISBANE, casey, caseyForDana(world, { epoch: 3 })),
    );

    expect(answer).toEqual({ status: 409, body: { error: 'epoch', epoch: 1 } });
    expect(await isMemberDevice(BRISBANE, dana)).toBe(true);
  });

  test.each([
    ['was never uploaded', 'none'],
    ['is the complete snapshot for another device', 'other'],
  ])(
    '[SHARING-302.1] refuses a takeover that names a snapshot which %s',
    async (_, which) => {
      const world = await caseyAsksWithDanaIn({ sequence: false });
      const { taylor, casey, dana, P, S } = world;
      const other = await registered();
      const forOther = snapshotOf(taylor, other);
      if (which === 'other') {
        await addMember(BRISBANE, other);
        await uploadAll(BRISBANE, forOther);
      }
      const takeover = takeoverOf(P, which === 'other' ? forOther : S, {
        remove: [DANA],
        staying: which === 'other' ? [taylor, other] : [taylor],
      });

      const answer = await takeOver(taylor, BRISBANE, casey, takeover);

      expectTakeoverRefused(answer, NO_SNAPSHOT);
      expect(await timesStored(P)).toBe(1);
      expect(await isMemberDevice(BRISBANE, dana)).toBe(true);
    },
  );

  test('[SHARING-302.1] refuses a takeover whose events the group has no room for', async () => {
    const world = await caseyAsksWithDanaIn({ sequence: false });
    const { taylor, casey, dana, P } = world;
    const last = await fillBrisbane(taylor, 199);
    const S = snapshotOf(taylor, casey, { sequence: last });
    await uploadAll(BRISBANE, S);
    const takeover = takeoverOf(
      P,
      S,
      { remove: [DANA], staying: [taylor] },
      { cursor: last, events: [event(200)] },
    );

    const answer = await leavingGroupsAsTheyWere(() =>
      takeOver(taylor, BRISBANE, casey, takeover),
    );

    expectTakeoverRefused(answer, GROUP_FULL);
    expect(await timesStored(P)).toBe(1);
    expect(await isMemberDevice(BRISBANE, dana)).toBe(true);
  });
});

describe('SHARING-303.1', () => {
  test.each(['9B2F6C1E-8D47-4F3A-B1C5-2E7D90A4F6B8', 'brisbane'])(
    '[SHARING-303.1] refuses a takeover whose group ID is written %s',
    async (groupId) => {
      const world = await caseyAsksWithDanaIn();

      expectRefused(
        await takeOver(world.taylor, groupId, world.casey, caseyForDana(world)),
        REQUEST,
      );
      expect(await isMemberDevice(BRISBANE, world.dana)).toBe(true);
    },
  );

  test.each(['casey', '7C9E6679-7425-40DE-944B-E07FC1F90AE7'])(
    '[SHARING-303.1] refuses a takeover whose path names the device as %s',
    async (applicant) => {
      const world = await caseyAsksWithDanaIn();

      expectRefused(
        await takeOver(world.taylor, BRISBANE, applicant, caseyForDana(world)),
        REQUEST,
      );
      expect(await timesStored(world.P)).toBe(1);
    },
  );

  test('[SHARING-303.1] refuses a takeover whose URL carries a query', async () => {
    const world = await caseyAsksWithDanaIn();

    expectRefused(
      await call(world.taylor, {
        method: 'POST',
        path: `${takeoverPath(BRISBANE, world.casey)}?x=1`,
        body: JSON.stringify(caseyForDana(world)),
      }),
      REQUEST,
    );
    expect(await isMemberDevice(BRISBANE, world.dana)).toBe(true);
  });

  const hex = (size: number) => randomBytes(size).toString('hex');
  const wrongTakeovers: [string, (takeover: Takeover) => unknown][] = [
    ['no content', () => ''],
    ['an empty object', () => '{}'],
    ['an array', (takeover) => [takeover]],
    ['text that is no JSON', () => 'takeover'],
    ['no request', (takeover) => without(takeover, 'request')],
    ['no cursor', (takeover) => without(takeover, 'cursor')],
    ['no snapshotId', (takeover) => without(takeover, 'snapshotId')],
    ['no senderKey', (takeover) => without(takeover, 'senderKey')],
    ['no epoch', (takeover) => without(takeover, 'epoch')],
    ['no box', (takeover) => without(takeover, 'box')],
    ['no remove', (takeover) => without(takeover, 'remove')],
    ['no boxes', (takeover) => without(takeover, 'boxes')],
    ['no events', (takeover) => without(takeover, 'events')],
    ['a tenth field', (takeover) => ({ ...takeover, name: 'Casey' })],
    [
      'a request of 63 characters',
      (takeover) => ({ ...takeover, request: takeover.request.slice(1) }),
    ],
    [
      'a request of 65 characters',
      (takeover) => ({ ...takeover, request: `${takeover.request}0` }),
    ],
    [
      'a request in uppercase',
      (takeover) => ({ ...takeover, request: 'A'.repeat(64) }),
    ],
    ['a request that is a number', (takeover) => ({ ...takeover, request: 7 })],
    [
      'a senderKey of 31 bytes',
      (takeover) => ({ ...takeover, senderKey: hex(31) }),
    ],
    ['a cursor of -1', (takeover) => ({ ...takeover, cursor: -1 })],
    ['a cursor of 1.5', (takeover) => ({ ...takeover, cursor: 1.5 })],
    ['a cursor written as text', (takeover) => ({ ...takeover, cursor: '0' })],
    [
      'a snapshotId that is no UUID',
      (takeover) => ({ ...takeover, snapshotId: 'snapshot' }),
    ],
    ['epoch 0', (takeover) => ({ ...takeover, epoch: 0 })],
    ['epoch 1', (takeover) => ({ ...takeover, epoch: 1 })],
    ['epoch 1.5', (takeover) => ({ ...takeover, epoch: 1.5 })],
    ['an epoch written as text', (takeover) => ({ ...takeover, epoch: '2' })],
    ['a box of 40 bytes', (takeover) => ({ ...takeover, box: hex(40) })],
    [
      'a box of 65,537 bytes',
      (takeover) => ({ ...takeover, box: hex(65_537) }),
    ],
    ['remove that is no array', (takeover) => ({ ...takeover, remove: DANA })],
    ['nobody to remove', (takeover) => ({ ...takeover, remove: [] })],
    [
      '20 devices to remove',
      (takeover) => ({
        ...takeover,
        remove: Array.from({ length: 20 }, () => randomUUID()),
      }),
    ],
    [
      'the same device twice in remove',
      (takeover) => ({ ...takeover, remove: [DANA, DANA] }),
    ],
    [
      'a device in remove that is no UUID',
      (takeover) => ({ ...takeover, remove: ['dana'] }),
    ],
    ['no box in boxes', (takeover) => ({ ...takeover, boxes: [] })],
    [
      '20 boxes',
      (takeover) => ({
        ...takeover,
        boxes: Array.from({ length: 20 }, () => ({
          deviceId: randomUUID(),
          box: box(),
        })),
      }),
    ],
    [
      'two boxes for one device',
      (takeover) => ({
        ...takeover,
        boxes: [...takeover.boxes, { ...takeover.boxes[0], box: box() }],
      }),
    ],
    [
      'a box entry with a third field',
      (takeover) => ({
        ...takeover,
        boxes: takeover.boxes.map((each) => ({ ...each, epoch: 2 })),
      }),
    ],
    [
      'a box entry of 40 bytes',
      (takeover) => ({
        ...takeover,
        boxes: takeover.boxes.map((each) => ({ ...each, box: box(40) })),
      }),
    ],
    [
      'a box entry of 1,025 bytes',
      (takeover) => ({
        ...takeover,
        boxes: takeover.boxes.map((each) => ({ ...each, box: box(1_025) })),
      }),
    ],
    [
      'the removed device among the boxes',
      (takeover) => ({
        ...takeover,
        boxes: [...takeover.boxes, { deviceId: DANA, box: box() }],
      }),
    ],
    ['no event', (takeover) => ({ ...takeover, events: [] })],
    [
      '101 events',
      (takeover) => ({
        ...takeover,
        events: Array.from({ length: 101 }, () => event()),
      }),
    ],
    [
      'two events with one ID',
      (takeover) => ({
        ...takeover,
        events: [takeover.events[0], event(200, takeover.events[0].id)],
      }),
    ],
    [
      'an event of 40 bytes',
      (takeover) => ({ ...takeover, events: [event(40)] }),
    ],
  ];

  test.each(wrongTakeovers)(
    '[SHARING-303.1] refuses a takeover with %s',
    async (_, written) => {
      const world = await caseyAsksWithDanaIn();
      const { taylor, casey, dana, P } = world;

      const answer = await leavingGroupsAsTheyWere(() =>
        takeOver(taylor, BRISBANE, casey, written(caseyForDana(world))),
      );

      expectRefused(answer, REQUEST);
      expect(await timesStored(P)).toBe(1);
      expect(await isMemberDevice(BRISBANE, dana)).toBe(true);
      expect(await timesStored('Casey')).toBe(0);
    },
  );

  test('[SHARING-303.1] takes a handover box of 65,536 bytes and boxes of 41 and of 1,024 bytes', async () => {
    const world = await caseyAsksWithDanaIn();
    const { taylor, casey, P, S } = world;
    const x = await registered();
    await addMember(BRISBANE, x);
    const takeover = takeoverOf(
      P,
      S,
      { remove: [DANA], staying: [] },
      {
        box: hex(65_536),
        boxes: [
          { deviceId: taylor.deviceId, box: box(41) },
          { deviceId: x.deviceId, box: box(1_024) },
        ],
      },
    );

    expectTakenOver(
      await takeOver(taylor, BRISBANE, casey, takeover),
      casey,
      takeover,
      [1],
    );
  });

  test('[SHARING-303.1] reports a cursor past the group’s last number as a request written wrongly, not as a phone that is behind', async () => {
    const world = await caseyAsksWithDanaIn({ events: 3, sequence: 2 });

    const answer = await leavingGroupsAsTheyWere(() =>
      takeOver(
        world.taylor,
        BRISBANE,
        world.casey,
        caseyForDana(world, { cursor: 4 }),
      ),
    );

    expectRefused(answer, REQUEST);
  });
});

describe('SHARING-304.1', () => {
  test('[SHARING-304.1] refuses an unsigned takeover, and one from a phone that never registered, before anything else, and takes it from a member device', async () => {
    const world = await caseyAsksWithDanaIn();
    const stranger = newPhone();
    const input = takeoverRequest(BRISBANE, world.casey, caseyForDana(world));
    const before = await databaseContents();

    expectRefused(await send({ ...signedBy(stranger, input), headers: {} }), {
      error: 'signature',
    });
    expectRefused(await send(signedBy(stranger, input)), {
      error: 'signature',
    });

    expect(await databaseContents()).toEqual(before);

    // The same request, signed by a member device, is taken.
    const takeover = caseyForDana(world);
    expectTakenOver(
      await takeOver(world.taylor, BRISBANE, world.casey, takeover),
      world.casey,
      takeover,
      [1],
    );
  });

  test('[SHARING-304.1] reports a takeover written wrongly before it looks at membership', async () => {
    const world = await caseyAsksWithDanaIn();
    const stranger = await registered();

    expectRefused(
      await takeOver(stranger, BRISBANE, world.casey, '{}'),
      REQUEST,
    );
  });

  test('[SHARING-304.1] tells a device that is no member device the same about a group that exists and one that does not, and the applicant too', async () => {
    const world = await caseyAsksWithDanaIn();
    const { casey, P } = world;
    const stranger = await registered();
    const takeover = caseyForDana(world, { epoch: 9 });

    const inBrisbane = await takeOver(stranger, BRISBANE, casey, takeover);
    const inTokyo = await takeOver(stranger, TOKYO, casey, takeover);
    const byApplicant = await takeOver(casey, BRISBANE, casey, takeover);

    expect(inBrisbane).toEqual({ status: 403, body: NOT_A_MEMBER });
    expect(inTokyo).toEqual(inBrisbane);
    expect(byApplicant).toEqual(inBrisbane);
    expect(await timesStored(P)).toBe(1);
  });

  test('[SHARING-304.1] reports a cursor past the group’s last number before a request that is gone', async () => {
    const world = await caseyAsksWithDanaIn({ events: 3, sequence: 2 });
    const { taylor, casey, P } = world;
    expect((await reject(taylor, BRISBANE, casey, P)).status).toBe(200);

    expectRefused(
      await takeOver(
        taylor,
        BRISBANE,
        casey,
        caseyForDana(world, { cursor: 4 }),
      ),
      REQUEST,
    );
  });

  test('[SHARING-304.1] reports a request that is gone, then a phone that is behind, then a group that needs a rotation, then other devices', async () => {
    const world = await caseyAsksWithDanaIn({ events: 3, sequence: false });
    const { taylor, casey, dana, P } = world;
    const x = await registered();
    await addMember(BRISBANE, x);
    expectLeft(await leave(x, BRISBANE), x);
    const Q = joinRequest();
    expectRequestAnswered(await sendRequest(casey, CODE_A, Q), CODE_A);
    const never = snapshotOf(taylor, casey, { sequence: 3 });
    const attempt = (content: Uint8Array, cursor: number) =>
      leavingGroupsAsTheyWere(() =>
        takeOver(
          taylor,
          BRISBANE,
          casey,
          takeoverOf(
            content,
            never,
            { remove: [DANA], staying: [x] },
            { cursor, epoch: 9 },
          ),
        ),
      );

    expectTakeoverRefused(await attempt(P, 2), NO_REQUEST);
    expectTakeoverRefused(await attempt(Q, 2), BEHIND);
    expectTakeoverRefused(await attempt(Q, 3), rotationNeeded(taylor, DANA));

    const rotation = rotationOf([taylor, dana]);
    expectRotated(await rotate(taylor, BRISBANE, rotation), rotation, [4]);

    expectTakeoverRefused(await attempt(Q, 4), otherDevices(taylor, DANA));
  });

  test('[SHARING-304.1] reports the key epoch, then that there is no snapshot, then a full group', async () => {
    const world = await caseyAsksWithDanaIn({ sequence: false });
    const { taylor, casey, dana, P } = world;
    const last = await fillBrisbane(taylor, 199);
    const never = snapshotOf(taylor, casey, { sequence: last });
    const sent = [event(200)];
    const attempt = (snapshot: { id: string }, epoch: number) =>
      leavingGroupsAsTheyWere(() =>
        takeOver(
          taylor,
          BRISBANE,
          casey,
          takeoverOf(
            P,
            snapshot,
            { remove: [DANA], staying: [taylor] },
            { cursor: last, epoch, events: sent },
          ),
        ),
      );

    expectTakeoverRefused(await attempt(never, 3), wrongEpoch(1));
    expectTakeoverRefused(await attempt(never, 2), NO_SNAPSHOT);

    const S = snapshotOf(taylor, casey, { sequence: last });
    await uploadAll(BRISBANE, S);

    expectTakeoverRefused(await attempt(S, 2), GROUP_FULL);
    expect(await isMemberDevice(BRISBANE, dana)).toBe(true);
    expect(await stateOf(taylor)).toEqual(wrongEpoch(1));
  });

  test('[SHARING-304.1] counts a refused takeover as a request that passed the checks: sent again as it is, it is a replay', async () => {
    const world = await caseyAsksWithDanaIn();
    const request = signedBy(
      world.taylor,
      takeoverRequest(BRISBANE, world.casey, caseyForDana(world, { epoch: 3 })),
    );

    expectTakeoverRefused(await send(request), wrongEpoch(1));

    expectRefused(await send(request), { error: 'replayed' });
  });
});

describe('SHARING-305.1', () => {
  /** Casey's phone has taken the place of Dana's. */
  async function danaReplaced() {
    const world = await caseyAsksWithDanaIn();
    const takeover = caseyForDana(world);
    expectTakenOver(
      await takeOver(world.taylor, BRISBANE, world.casey, takeover),
      world.casey,
      takeover,
      [1],
    );
    return { ...world, takeover };
  }

  test('[SHARING-305.1] refuses the uploads and downloads of a device that was replaced as it refuses a stranger’s, and says on them that it was replaced', async () => {
    const { dana } = await danaReplaced();
    const stranger = await registered();
    const requests = [uploadOf(BRISBANE, [event()]), downloadOf(BRISBANE)];

    for (const request of requests) {
      const replaced = await callForHeaders(dana, request);
      const never = await callForHeaders(stranger, request);

      expect(replaced.status).toBe(403);
      expect(replaced.body).toEqual(NOT_A_MEMBER);
      expect(replaced.headers.get(REPLACED)).toBe(TAKEOVER);
      expect({ status: never.status, body: never.body }).toEqual({
        status: 403,
        body: NOT_A_MEMBER,
      });
      expect(never.headers.get(REPLACED)).toBeNull();
    }
  });

  test('[SHARING-305.1] refuses every request of a replaced device about the group and changes nothing, with the header on its upload and its download only', async () => {
    const { taylor, dana, P } = await danaReplaced();
    const S = snapshotOf(dana, dana);
    const json = (body: unknown) => JSON.stringify(body);
    const APPLICANT = '11111111-1111-4111-8111-111111111111';
    const requests = [
      {
        method: 'POST',
        path: eventsPath(BRISBANE),
        body: json({ epoch: 2, events: [event()] }),
      },
      downloadOf(BRISBANE),
      { path: snapshotPath(BRISBANE) },
      {
        method: 'PUT',
        path: chunkPath(BRISBANE, S.id, 0),
        body: json(chunkBody(S, 0)),
      },
      { path: chunkPath(BRISBANE, S.id, 0) },
      {
        method: 'PUT',
        path: `/groups/${BRISBANE}/invites/AAECAwQFBgcICQoLDA0ODw`,
        body: json({ cursor: 0, card: Buffer.from(card()).toString('hex') }),
      },
      { method: 'DELETE', path: `/groups/${BRISBANE}/invites/${CODE_A}` },
      { path: `/groups/${BRISBANE}/requests` },
      approvalRequest(BRISBANE, APPLICANT, approvalOf(P, S)),
      {
        method: 'DELETE',
        path: `/groups/${BRISBANE}/requests/${APPLICANT}?request=${sha256Of(P)}`,
      },
      takeoverRequest(
        BRISBANE,
        APPLICANT,
        takeoverOf(P, S, { remove: [taylor], staying: [dana] }, { epoch: 3 }),
      ),
      {
        method: 'POST',
        path: `/groups/${BRISBANE}/rotation`,
        body: json(rotationOf([dana], { epoch: 3 })),
      },
      { path: `/groups/${BRISBANE}/keys?after=1` },
      { path: `/groups/${BRISBANE}/devices` },
      leaveRequest(BRISBANE),
    ];
    expect(requests).toHaveLength(15);
    // The requests of a sync, from which a phone learns that it is out: upload and download.
    const told = [0, 1];
    const marks: (string | null)[] = [];

    for (const request of requests) {
      const answer = await leavingGroupsAsTheyWere(() =>
        callForHeaders(dana, request),
      );

      expect(answer.status).toBe(403);
      expect(answer.body).toEqual(NOT_A_MEMBER);
      marks.push(answer.headers.get(REPLACED));
    }

    expect(marks).toEqual(
      requests.map((_, index) => (told.includes(index) ? TAKEOVER : null)),
    );
  });

  test('[SHARING-305.1] puts no such header on what it answers a device that was removed, or that left', async () => {
    const world = await caseyAsksWithDanaIn();
    const { taylor, dana } = world;
    const x = await registered();
    const y = await registered();
    await addMember(BRISBANE, x);
    await addMember(BRISBANE, y);
    const removal = rotationOf([taylor, dana, y], { remove: [x.deviceId] });
    expectRotated(await rotate(taylor, BRISBANE, removal), removal, [1]);
    expectLeft(await leave(y, BRISBANE), y);

    for (const gone of [x, y]) {
      const answer = await callForHeaders(gone, downloadOf(BRISBANE));

      expect(answer.status).toBe(403);
      expect(answer.body).toEqual(NOT_A_MEMBER);
      expect(answer.headers.get(REPLACED)).toBeNull();
    }
    // The control: a device a takeover removed is told.
    const rotation = rotationOf([taylor, dana], { epoch: 3 });
    expectRotated(await rotate(taylor, BRISBANE, rotation), rotation, [2]);
    const S = snapshotOf(taylor, world.casey, { epoch: 3, sequence: 2 });
    await uploadAll(BRISBANE, S);
    const takeover = takeoverOf(
      world.P,
      S,
      { remove: [DANA], staying: [taylor] },
      { cursor: 2, epoch: 4 },
    );
    expectTakenOver(
      await takeOver(taylor, BRISBANE, world.casey, takeover),
      world.casey,
      takeover,
      [3],
    );
    expect(await replacedOn(dana, downloadOf(BRISBANE))).toBe(TAKEOVER);
  });

  test('[SHARING-305.1] says so only about that group, and only on a refusal for being no member device', async () => {
    const world = await caseyAsksWithDanaIn();
    const { taylor, casey, dana } = world;
    expectCreated(await createGroup(dana, TOKYO), TOKYO);
    const takeover = caseyForDana(world);
    expectTakenOver(
      await takeOver(taylor, BRISBANE, casey, takeover),
      casey,
      takeover,
      [1],
    );
    const sent = [event()];
    const elsewhere = randomUUID();

    expectUploaded(await upload(dana, TOKYO, sent), sent, [1]);
    const noGroup = await callForHeaders(dana, downloadOf(elsewhere));
    const wrong = await callForHeaders(dana, {
      path: `${eventsPath(BRISBANE)}?after=abc`,
    });

    expect(noGroup.status).toBe(403);
    expect(noGroup.headers.get(REPLACED)).toBeNull();
    expect(wrong.status).toBe(400);
    expect(wrong.headers.get(REPLACED)).toBeNull();
    expect(await replacedOn(dana, downloadOf(BRISBANE))).toBe(TAKEOVER);
  });

  test('[SHARING-305.1] still says so after a year of cleanups', async () => {
    const { dana } = await danaReplaced();

    await cleanUpAt(T + 365 * DAY);
    setTime(T + 365 * DAY);

    expect(await replacedOn(dana, downloadOf(BRISBANE))).toBe(TAKEOVER);
  });

  test('[SHARING-305.1] forgets that a device was replaced once it is a member device again: removed later, it is told nothing', async () => {
    const { taylor, casey, dana } = await danaReplaced();
    expect(await replacedOn(dana, downloadOf(BRISBANE))).toBe(TAKEOVER);
    const again = joinRequest();
    expectRequestAnswered(await sendRequest(dana, CODE_A, again), CODE_A);
    const S = snapshotOf(taylor, dana, { epoch: 2, sequence: 1 });
    await uploadAll(BRISBANE, S);
    const approval = approvalOf(again, S, { cursor: 1, epoch: 2 });
    expectApproved(
      await approve(taylor, BRISBANE, dana, approval),
      dana,
      approval,
      [2],
    );
    const removal = rotationOf([taylor, casey], {
      epoch: 3,
      remove: [DANA],
    });
    expectRotated(await rotate(taylor, BRISBANE, removal), removal, [3]);

    const answer = await callForHeaders(dana, downloadOf(BRISBANE));

    expect(answer.status).toBe(403);
    expect(answer.headers.get(REPLACED)).toBeNull();
  });

  test('[SHARING-305.1] lets a replaced device take its place back: the device that replaced it is then the one that is told, and the first is told nothing when it is removed later', async () => {
    const { taylor, casey, dana } = await danaReplaced();
    const again = joinRequest();
    expectRequestAnswered(await sendRequest(dana, CODE_A, again), CODE_A);
    const S = snapshotOf(taylor, dana, { epoch: 2, sequence: 1 });
    await uploadAll(BRISBANE, S);
    const back = takeoverOf(
      again,
      S,
      { remove: [casey], staying: [taylor] },
      { cursor: 1, epoch: 3 },
    );

    expectTakenOver(
      await takeOver(taylor, BRISBANE, dana, back),
      dana,
      back,
      [2],
    );

    const forCasey = await callForHeaders(casey, downloadOf(BRISBANE));
    expect(forCasey.status).toBe(403);
    expect(forCasey.headers.get(REPLACED)).toBe(TAKEOVER);
    const forDana = await callForHeaders(dana, downloadOf(BRISBANE, 1));
    expect(forDana.status).toBe(200);
    expect(forDana.headers.get(REPLACED)).toBeNull();

    // Removed by a rotation this time: the API forgot the takeover when it came back.
    const removal = rotationOf([taylor], { epoch: 4, remove: [DANA] });
    expectRotated(await rotate(taylor, BRISBANE, removal), removal, [3]);
    const removed = await callForHeaders(dana, downloadOf(BRISBANE));
    expect(removed.status).toBe(403);
    expect(removed.body).toEqual(NOT_A_MEMBER);
    expect(removed.headers.get(REPLACED)).toBeNull();
    expect(await replacedOn(casey, downloadOf(BRISBANE))).toBe(TAKEOVER);
  });

  test('[SHARING-305.1] forgets it with the group: no header once the group is deleted, nor for a new group of that ID', async () => {
    const { taylor, casey, dana } = await danaReplaced();
    expect(await replacedOn(dana, downloadOf(BRISBANE))).toBe(TAKEOVER);
    expectLeft(await leave(casey, BRISBANE), casey);
    expectLeft(await leave(taylor, BRISBANE), taylor);

    const deleted = await callForHeaders(dana, downloadOf(BRISBANE));

    expect(deleted.status).toBe(403);
    expect(deleted.headers.get(REPLACED)).toBeNull();

    expectCreated(await createGroup(casey, BRISBANE), BRISBANE);
    const created = await callForHeaders(dana, downloadOf(BRISBANE));

    expect(created.status).toBe(403);
    expect(created.headers.get(REPLACED)).toBeNull();
  });
});

describe('SYNC-49.2', () => {
  test('[SYNC-49.2] answers a device that was replaced as it answers one that never was a member device, and marks only its answers with the header', async () => {
    const world = await caseyAsksWithDanaIn();
    const { taylor, casey, dana } = world;
    const takeover = caseyForDana(world);
    expectTakenOver(
      await takeOver(taylor, BRISBANE, casey, takeover),
      casey,
      takeover,
      [1],
    );
    const stranger = await registered();

    const replaced = [
      await callForHeaders(dana, uploadOf(BRISBANE, [event()])),
      await callForHeaders(dana, downloadOf(BRISBANE)),
    ];
    const never = [
      await callForHeaders(stranger, downloadOf(BRISBANE)),
      await callForHeaders(stranger, downloadOf(TOKYO)),
    ];

    for (const answer of [...replaced, ...never]) {
      expect(answer.status).toBe(403);
      expect(answer.body).toEqual(NOT_A_MEMBER);
    }
    expect(replaced.map(({ headers }) => headers.get(REPLACED))).toEqual([
      TAKEOVER,
      TAKEOVER,
    ]);
    expect(never.map(({ headers }) => headers.get(REPLACED))).toEqual([
      null,
      null,
    ]);
  });
});

describe('SHARING-306.1', () => {
  test('[SHARING-306.1] stores the boxes, the sender’s key and the events of a takeover, and neither the request it approved nor another header', async () => {
    const world = await caseyAsksWithDanaIn();
    const { taylor, casey, P } = world;
    const takeover = caseyForDana(world);

    expectTakenOver(
      await call(taylor, takeoverRequest(BRISBANE, casey, takeover), {
        'User-Agent': 'TaylorsPhone/1.0',
        'X-Member-Name': 'Dana-Kim',
      }),
      casey,
      takeover,
      [1],
    );

    expect(await timesStored(bytesOf(takeover.box))).toBe(1);
    expect(await timesStored(bytesOf(takeoverBoxFor(takeover, taylor)))).toBe(
      1,
    );
    expect(await timesStored(bytesOf(takeover.events[0].content))).toBe(1);
    expect(await timesStored(bytesOf(takeover.senderKey))).toBeGreaterThan(0);
    expect(await timesStored(P)).toBe(0);
    expect(await timesStored(bytesOf(sha256Of(P)))).toBe(0);
    expect(await timesStored(sha256Of(P))).toBe(0);
    expect(await timesStored('TaylorsPhone')).toBe(0);
    expect(await timesStored('Dana-Kim')).toBe(0);
  });

  test('[SHARING-306.1] [SYNC-61.5] keeps one row for the device that was replaced, which names neither the device that replaced it nor the one that approved', async () => {
    const world = await caseyAsksWithDanaIn();
    const { taylor, casey, dana } = world;
    await reach(dana, 0);
    const takeover = caseyForDana(world);

    expectTakenOver(
      await takeOver(taylor, BRISBANE, casey, takeover),
      casey,
      takeover,
      [1],
    );

    expect(await rowsHolding(BRISBANE, DANA)).toBe(1);
    expect(await rowsHolding(BRISBANE, DANA, casey.deviceId)).toBe(0);
    expect(await rowsHolding(BRISBANE, DANA, taylor.deviceId)).toBe(0);
    // The group and the device, and no third value: not a time, not a count.
    const rows = Object.values(await databaseContents())
      .flat()
      .map((row) => Object.values(JSON.parse(row) as Record<string, unknown>))
      .filter((stored) => stored.includes(BRISBANE) && stored.includes(DANA));
    expect(rows.map((stored) => [...stored].sort())).toEqual([
      [BRISBANE, DANA].sort(),
    ]);
  });

  test('[SHARING-306.1] stores nothing a refused takeover carried, and marks no device as replaced', async () => {
    const world = await caseyAsksWithDanaIn();
    const { taylor, casey, dana, P, S } = world;
    const wrongEpochTakeover = caseyForDana(world, { epoch: 3 });
    const boxForApplicant = takeoverOf(P, S, {
      remove: [DANA],
      staying: [taylor, casey],
    });

    for (const takeover of [wrongEpochTakeover, boxForApplicant]) {
      expect((await takeOver(taylor, BRISBANE, casey, takeover)).status).toBe(
        409,
      );
      for (const each of takeover.boxes) {
        expect(await timesStored(bytesOf(each.box))).toBe(0);
      }
      expect(await timesStored(bytesOf(takeover.box))).toBe(0);
      expect(await timesStored(bytesOf(takeover.senderKey))).toBe(0);
      expect(await timesStored(bytesOf(takeover.events[0].content))).toBe(0);
    }
    expect(await replacedOn(dana, downloadOf(BRISBANE))).toBeNull();
    expect((await download(dana, BRISBANE, 0)).status).toBe(200);
  });
});

describe('SHARING-307.1', () => {
  test('[SHARING-307.1] [SHARING-300.1] answers another method on the path of a takeover as it answers a path with no route, and takes a POST', async () => {
    const world = await caseyAsksWithDanaIn();
    const { taylor, casey, dana, P } = world;
    const takeover = caseyForDana(world);
    const path = takeoverPath(BRISBANE, casey);
    const requests = [
      { method: 'GET', path },
      { method: 'HEAD', path },
      { method: 'DELETE', path },
      { method: 'PUT', path, body: JSON.stringify(takeover) },
    ];

    for (const request of requests) {
      const answer = await leavingGroupsAsTheyWere(() => call(taylor, request));
      const noRoute = await call(taylor, { ...request, path: NO_ROUTE });
      expect(noRoute.status).toBe(404);
      expect(answer).toEqual(noRoute);
    }
    expect(await timesStored(P)).toBe(1);
    expect(await isMemberDevice(BRISBANE, dana)).toBe(true);
    expect(await isMemberDevice(BRISBANE, casey)).toBe(false);

    expectTakenOver(
      await takeOver(taylor, BRISBANE, casey, takeover),
      casey,
      takeover,
      [1],
    );
  });
});

describe('SHARING-308.1', () => {
  /**
   * A group of `phones`, the first of which created it, with an invite and a request and a
   * complete snapshot from the first phone for each of `applicants` new devices.
   */
  async function groupWithRequests(phones: Phone[], applicants: number) {
    const groupId = randomUUID();
    const code = randomBytes(16).toString('base64url');
    expectCreated(await createGroup(phones[0], groupId), groupId);
    for (const member of phones.slice(1)) await addMember(groupId, member);
    expect((await putInvite(phones[0], groupId, code, card())).status).toBe(
      200,
    );
    const asked = [];
    for (let each = 0; each < applicants; each += 1) {
      const applicant = await registered();
      const content = joinRequest();
      expectRequestAnswered(await sendRequest(applicant, code, content), code);
      const snapshot = snapshotOf(phones[0], applicant);
      await uploadAll(groupId, snapshot);
      asked.push({ applicant, content, snapshot });
    }
    return { groupId, code, asked };
  }

  test('[SHARING-308.1] lets exactly one of two takeovers that replace the same device at the same moment through', async () => {
    const [first, second, third] = [
      await registered(),
      await registered(),
      await registered(),
    ];
    const servers = [await ownServer(), await ownServer()];

    for (let round = 0; round < 5; round += 1) {
      const { groupId, asked } = await groupWithRequests(
        [first, second, third],
        2,
      );
      const takeovers = asked.map(({ content, snapshot }) =>
        takeoverOf(content, snapshot, {
          remove: [third],
          staying: [first, second],
        }),
      );

      const answers = await Promise.all(
        [first, second].map((phone, index) =>
          callOn(
            servers[index],
            phone,
            takeoverRequest(groupId, asked[index].applicant, takeovers[index]),
          ),
        ),
      );

      expect(answers.map(({ status }) => status).sort()).toEqual([200, 409]);
      const won = answers.findIndex(({ status }) => status === 200);
      expectTakenOver(answers[won], asked[won].applicant, takeovers[won], [1]);
      expectTakeoverRefused(answers[1 - won], BEHIND);
      expect(await stateOf(first, groupId)).toEqual(wrongEpoch(2));
      expect(await isMemberDevice(groupId, third)).toBe(false);
      expect(await isMemberDevice(groupId, asked[won].applicant)).toBe(true);
      expect(await isMemberDevice(groupId, asked[1 - won].applicant)).toBe(
        false,
      );
      expect(await timesStored(asked[1 - won].content)).toBe(1);
      expect((await everyEvent(first, groupId)).map(({ id }) => id)).toEqual([
        takeovers[won].events[0].id,
      ]);
      for (const each of takeovers[1 - won].boxes) {
        expect(await timesStored(bytesOf(each.box))).toBe(0);
      }
      aMinuteLater();
    }
  });

  test('[SHARING-308.1] lets exactly one of a takeover and an approval of the same request through', async () => {
    const [first, second, third] = [
      await registered(),
      await registered(),
      await registered(),
    ];
    const servers = [await ownServer(), await ownServer()];

    for (let round = 0; round < 5; round += 1) {
      const { groupId, code, asked } = await groupWithRequests(
        [first, second, third],
        1,
      );
      const [{ applicant, content, snapshot }] = asked;
      const takeover = takeoverOf(content, snapshot, {
        remove: [third],
        staying: [first, second],
      });
      const approval = approvalOf(content, snapshot);

      const [tookOver, approved] = await Promise.all([
        callOn(
          servers[0],
          first,
          takeoverRequest(groupId, applicant, takeover),
        ),
        callOn(
          servers[1],
          second,
          approvalRequest(groupId, applicant, approval),
        ),
      ]);

      expect([tookOver.status, approved.status].sort()).toEqual([200, 404]);
      expect(await isMemberDevice(groupId, applicant)).toBe(true);
      if (tookOver.status === 200) {
        expectTakenOver(tookOver, applicant, takeover, [1]);
        expect(approved).toEqual({ status: 404, body: NO_REQUEST });
        expect(await isMemberDevice(groupId, third)).toBe(false);
        expect(await stateOf(first, groupId)).toEqual(wrongEpoch(2));
        expectHandover(
          await askResult(applicant, code),
          groupId,
          first,
          takeover,
        );
      } else {
        expectApproved(approved, applicant, approval, [1]);
        expect(tookOver).toEqual({ status: 404, body: NO_REQUEST });
        expect(await isMemberDevice(groupId, third)).toBe(true);
        expect(await stateOf(first, groupId)).toEqual(wrongEpoch(1));
        expectHandover(
          await askResult(applicant, code),
          groupId,
          second,
          approval,
        );
      }
      aMinuteLater();
    }
  });

  test('[SHARING-308.1] stores no event of the replaced device after the takeover: its upload comes first, or is refused', async () => {
    const [first, second] = [await registered(), await registered()];
    const servers = [await ownServer(), await ownServer()];

    for (let round = 0; round < 5; round += 1) {
      const { groupId, asked } = await groupWithRequests([first, second], 1);
      const [{ applicant, content, snapshot }] = asked;
      const takeover = takeoverOf(content, snapshot, {
        remove: [second],
        staying: [first],
      });
      const sent = [event()];

      const [tookOver, uploaded] = await Promise.all([
        callOn(
          servers[0],
          first,
          takeoverRequest(groupId, applicant, takeover),
        ),
        callOn(servers[1], second, uploadOf(groupId, sent)),
      ]);

      const stored = (await everyEvent(first, groupId)).map(({ id }) => id);
      if (tookOver.status === 200) {
        expectTakenOver(tookOver, applicant, takeover, [1]);
        expect(uploaded).toEqual({ status: 403, body: NOT_A_MEMBER });
        expect(stored).toEqual([takeover.events[0].id]);
        expect(await isMemberDevice(groupId, second)).toBe(false);
      } else {
        expectUploaded(uploaded, sent, [1]);
        expectTakeoverRefused(tookOver, BEHIND);
        expect(stored).toEqual([sent[0].id]);
        expect(await isMemberDevice(groupId, second)).toBe(true);
        expect(await isMemberDevice(groupId, applicant)).toBe(false);
        expect(await stateOf(first, groupId)).toEqual(wrongEpoch(1));
      }
      aMinuteLater();
    }
  });

  test('[SHARING-308.1] takes a device out whichever of its leave and its takeover comes first, and admits the new device only with the takeover', async () => {
    const [first, second, third] = [
      await registered(),
      await registered(),
      await registered(),
    ];
    const servers = [await ownServer(), await ownServer()];

    for (let round = 0; round < 5; round += 1) {
      const { groupId, asked } = await groupWithRequests(
        [first, second, third],
        1,
      );
      const [{ applicant, content, snapshot }] = asked;
      const takeover = takeoverOf(content, snapshot, {
        remove: [third],
        staying: [first, second],
      });

      const [tookOver, left] = await Promise.all([
        callOn(
          servers[0],
          first,
          takeoverRequest(groupId, applicant, takeover),
        ),
        callOn(servers[1], third, leaveRequest(groupId)),
      ]);

      expect(await isMemberDevice(groupId, third)).toBe(false);
      if (tookOver.status === 200) {
        expectTakenOver(tookOver, applicant, takeover, [1]);
        expect(left).toEqual({ status: 403, body: NOT_A_MEMBER });
        expect(await isMemberDevice(groupId, applicant)).toBe(true);
        expect(await stateOf(first, groupId)).toEqual(wrongEpoch(2));
      } else {
        expectLeft(left, third);
        expectTakeoverRefused(tookOver, rotationNeeded(first, second));
        expect(await isMemberDevice(groupId, applicant)).toBe(false);
        expect(await timesStored(content)).toBe(1);
      }
      aMinuteLater();
    }
  });
  test('[SHARING-308.1] lets exactly one of two takeovers of the same request through, and tells the other that the request is gone', async () => {
    const [first, second, third] = [
      await registered(),
      await registered(),
      await registered(),
    ];
    const servers = [await ownServer(), await ownServer()];

    for (let round = 0; round < 5; round += 1) {
      const { groupId, code, asked } = await groupWithRequests(
        [first, second, third],
        1,
      );
      const [{ applicant, content, snapshot }] = asked;
      const signers = [first, second];
      const takeovers = signers.map(() =>
        takeoverOf(content, snapshot, {
          remove: [third],
          staying: [first, second],
        }),
      );

      const answers = await Promise.all(
        signers.map((phone, index) =>
          callOn(
            servers[index],
            phone,
            takeoverRequest(groupId, applicant, takeovers[index]),
          ),
        ),
      );

      expect(answers.map(({ status }) => status).sort()).toEqual([200, 404]);
      const won = answers.findIndex(({ status }) => status === 200);
      expectTakenOver(answers[won], applicant, takeovers[won], [1]);
      expectTakeoverRefused(answers[1 - won], NO_REQUEST);
      expect(await stateOf(first, groupId)).toEqual(wrongEpoch(2));
      expect(await isMemberDevice(groupId, third)).toBe(false);
      expectHandover(
        await askResult(applicant, code),
        groupId,
        signers[won],
        takeovers[won],
      );
      expect((await everyEvent(first, groupId)).map(({ id }) => id)).toEqual([
        takeovers[won].events[0].id,
      ]);
      for (const each of takeovers[1 - won].boxes) {
        expect(await timesStored(bytesOf(each.box))).toBe(0);
      }
      aMinuteLater();
    }
  });

  test('[SHARING-308.1] lets one of two member devices replace the other when each sends a takeover that removes the other, and refuses the other as no member device', async () => {
    const [first, second] = [await registered(), await registered()];
    const servers = [await ownServer(), await ownServer()];

    for (let round = 0; round < 5; round += 1) {
      const { groupId, asked } = await groupWithRequests([first, second], 2);
      const signers = [first, second];
      const takeovers = asked.map(({ content, snapshot }, index) =>
        takeoverOf(content, snapshot, {
          remove: [signers[1 - index]],
          staying: [signers[index]],
        }),
      );

      const answers = await Promise.all(
        signers.map((phone, index) =>
          callOn(
            servers[index],
            phone,
            takeoverRequest(groupId, asked[index].applicant, takeovers[index]),
          ),
        ),
      );

      expect(answers.map(({ status }) => status).sort()).toEqual([200, 403]);
      const won = answers.findIndex(({ status }) => status === 200);
      expectTakenOver(answers[won], asked[won].applicant, takeovers[won], [1]);
      expect(answers[1 - won]).toEqual({ status: 403, body: NOT_A_MEMBER });
      expect(await isMemberDevice(groupId, signers[won])).toBe(true);
      expect(await isMemberDevice(groupId, signers[1 - won])).toBe(false);
      expect(await isMemberDevice(groupId, asked[won].applicant)).toBe(true);
      expect(await isMemberDevice(groupId, asked[1 - won].applicant)).toBe(
        false,
      );
      expect(await stateOf(signers[won], groupId)).toEqual(wrongEpoch(2));
      // The header is for its uploads and downloads, not for this request.
      const again = await callForHeaders(
        signers[1 - won],
        takeoverRequest(groupId, asked[1 - won].applicant, takeovers[1 - won]),
      );
      expect(again.status).toBe(403);
      expect(again.headers.get(REPLACED)).toBeNull();
      expect(await replacedOn(signers[1 - won], downloadOf(groupId))).toBe(
        TAKEOVER,
      );
      aMinuteLater();
    }
  });

  test('[SHARING-308.1] lets exactly one of a takeover and a rejection of the same request through', async () => {
    const [first, second, third] = [
      await registered(),
      await registered(),
      await registered(),
    ];
    const servers = [await ownServer(), await ownServer()];

    for (let round = 0; round < 5; round += 1) {
      const { groupId, asked } = await groupWithRequests(
        [first, second, third],
        1,
      );
      const [{ applicant, content, snapshot }] = asked;
      const takeover = takeoverOf(content, snapshot, {
        remove: [third],
        staying: [first, second],
      });

      const [tookOver, rejected] = await Promise.all([
        callOn(
          servers[0],
          first,
          takeoverRequest(groupId, applicant, takeover),
        ),
        callOn(servers[1], second, {
          method: 'DELETE',
          path: `/groups/${groupId}/requests/${applicant.deviceId}${naming(content)}`,
        }),
      ]);

      expect([tookOver.status, rejected.status].sort()).toEqual([200, 404]);
      if (tookOver.status === 200) {
        expectTakenOver(tookOver, applicant, takeover, [1]);
        expect(rejected).toEqual({ status: 404, body: NO_REQUEST });
        expect(await isMemberDevice(groupId, applicant)).toBe(true);
        expect(await isMemberDevice(groupId, third)).toBe(false);
        expect(await stateOf(first, groupId)).toEqual(wrongEpoch(2));
      } else {
        expectRejected(rejected, applicant);
        expectTakeoverRefused(tookOver, NO_REQUEST);
        expect(await isMemberDevice(groupId, applicant)).toBe(false);
        expect(await isMemberDevice(groupId, third)).toBe(true);
        expect(await stateOf(first, groupId)).toEqual(wrongEpoch(1));
        expect(await everyEvent(first, groupId)).toEqual([]);
      }
      aMinuteLater();
    }
  });

  test.each([
    ['one event', 1],
    ['no event', 0],
  ])(
    '[SHARING-308.1] lets exactly one of a takeover and a rotation with %s that remove the same device through',
    async (_, events) => {
      const [first, second, third] = [
        await registered(),
        await registered(),
        await registered(),
      ];
      const servers = [await ownServer(), await ownServer()];

      for (let round = 0; round < 5; round += 1) {
        const { groupId, asked } = await groupWithRequests(
          [first, second, third],
          1,
        );
        const [{ applicant, content, snapshot }] = asked;
        const takeover = takeoverOf(content, snapshot, {
          remove: [third],
          staying: [first, second],
        });
        const rotation = rotationOf([first, second], {
          remove: [third.deviceId],
          ...(events === 0 ? { events: [] } : {}),
        });

        const [tookOver, rotated] = await Promise.all([
          callOn(
            servers[0],
            first,
            takeoverRequest(groupId, applicant, takeover),
          ),
          callOn(servers[1], second, rotationRequest(groupId, rotation)),
        ]);

        expect([tookOver.status, rotated.status].sort()).toEqual([200, 409]);
        expect(await isMemberDevice(groupId, third)).toBe(false);
        expect(await stateOf(first, groupId)).toEqual(wrongEpoch(2));
        if (tookOver.status === 200) {
          expectTakenOver(tookOver, applicant, takeover, [1]);
          expect(rotated).toEqual({
            status: 409,
            body: otherDevices(first, second, applicant),
          });
          expect(await isMemberDevice(groupId, applicant)).toBe(true);
          expect(
            (await everyEvent(first, groupId)).map(({ id }) => id),
          ).toEqual([takeover.events[0].id]);
        } else {
          expectRotated(rotated, rotation, events === 0 ? [] : [1]);
          // With an event the takeover's cursor is behind; with none, its devices are not the group's.
          expectTakeoverRefused(
            tookOver,
            events === 0 ? otherDevices(first, second) : BEHIND,
          );
          expect(await isMemberDevice(groupId, applicant)).toBe(false);
          expect(await timesStored(content)).toBe(1);
          expect(
            (await everyEvent(first, groupId)).map(({ id }) => id),
          ).toEqual(rotation.events.map(({ id }) => id));
        }
        aMinuteLater();
      }
    },
  );
  test('[SHARING-308.1] takes a device over while it sends an event the group already has again: the upload is answered with the number it had, or refused', async () => {
    const [first, second] = [await registered(), await registered()];
    const servers = [await ownServer(), await ownServer()];

    for (let round = 0; round < 5; round += 1) {
      const { groupId, asked } = await groupWithRequests([first, second], 1);
      const [{ applicant, content, snapshot }] = asked;
      const sent = [event()];
      expectUploaded(await upload(second, groupId, sent), sent, [1]);
      const takeover = takeoverOf(
        content,
        snapshot,
        { remove: [second], staying: [first] },
        { cursor: 1 },
      );

      const [tookOver, uploaded] = await Promise.all([
        callOn(
          servers[0],
          first,
          takeoverRequest(groupId, applicant, takeover),
        ),
        callOn(servers[1], second, uploadOf(groupId, sent)),
      ]);

      // The upload adds no number, so the takeover's cursor holds in either order.
      expectTakenOver(tookOver, applicant, takeover, [2]);
      if (uploaded.status === 200) expectUploaded(uploaded, sent, [1]);
      else expect(uploaded).toEqual({ status: 403, body: NOT_A_MEMBER });
      expect((await everyEvent(first, groupId)).map(({ id }) => id)).toEqual([
        sent[0].id,
        takeover.events[0].id,
      ]);
      expect(await isMemberDevice(groupId, second)).toBe(false);
      aMinuteLater();
    }
  });

  test('[SHARING-308.1] refuses the approval of a device that the takeover of the same request has just removed as no member device', async () => {
    const [first, second] = [await registered(), await registered()];
    const servers = [await ownServer(), await ownServer()];

    for (let round = 0; round < 5; round += 1) {
      const { groupId, code, asked } = await groupWithRequests(
        [first, second],
        1,
      );
      const [{ applicant, content, snapshot }] = asked;
      const takeover = takeoverOf(content, snapshot, {
        remove: [second],
        staying: [first],
      });
      const approval = approvalOf(content, snapshot);

      const [tookOver, approved] = await Promise.all([
        callOn(
          servers[0],
          first,
          takeoverRequest(groupId, applicant, takeover),
        ),
        callOn(
          servers[1],
          second,
          approvalRequest(groupId, applicant, approval),
        ),
      ]);

      expect(await isMemberDevice(groupId, applicant)).toBe(true);
      if (tookOver.status === 200) {
        expectTakenOver(tookOver, applicant, takeover, [1]);
        expect(approved).toEqual({ status: 403, body: NOT_A_MEMBER });
        expect(await isMemberDevice(groupId, second)).toBe(false);
        expectHandover(
          await askResult(applicant, code),
          groupId,
          first,
          takeover,
        );
      } else {
        expectApproved(approved, applicant, approval, [1]);
        expectTakeoverRefused(tookOver, NO_REQUEST);
        expect(await isMemberDevice(groupId, second)).toBe(true);
        expect(await stateOf(first, groupId)).toEqual(wrongEpoch(1));
      }
      aMinuteLater();
    }
  });
});
