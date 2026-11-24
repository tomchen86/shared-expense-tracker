import { randomBytes, randomUUID } from 'node:crypto';
import { SNAPSHOT_NEEDED_BY_HEADER } from '@shared-expense/domain/api';
import {
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
  NONE,
  approvalOf,
  approvalRequest,
  approve,
  askResult,
  caseyAsked,
  expectApproved,
  isMemberDevice,
  listRequests,
  reject,
  sha256Of,
} from './sharing-decisions-api';
import {
  CODE_A,
  CODE_B,
  NO_INVITE,
  card,
  expectCard,
  expectInviteRefused,
  expectRequestAnswered,
  joinRequest,
  putInvite,
  readInvite,
  revokeInvite,
  sendRequest,
} from './sharing-invites-api';
import {
  DANA,
  LARGEST_BOX,
  MOST_KEYS,
  ROTATION_NOT_NEEDED,
  SMALLEST_BOX,
  box,
  boxFor,
  bytesOf,
  expectKeys,
  expectLeft,
  expectRemovalRefused,
  expectRotated,
  keysAfter,
  keysPath,
  leave,
  leavePath,
  leaveRequest,
  otherDevices,
  removingDana,
  rotate,
  rotationNeeded,
  rotationOf,
  rotationPath,
  rotationRequest,
  threeInBrisbane,
  type Rotation,
} from './sharing-removal-api';
import {
  BRISBANE,
  EMPTY_PAGE,
  GROUP_FULL,
  GROUP_LIMIT,
  LARGEST,
  NOT_A_MEMBER,
  REQUEST,
  TOKYO,
  aMinuteLater,
  addMember,
  answerHeaders,
  call,
  callOn,
  createGroup,
  download,
  event,
  events,
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
  useSyncApi,
  wrongEpoch,
} from './sync-api';
import {
  DAY,
  THIRTY_DAYS,
  cleanUpAt,
  expectSnapshotNeeded,
  reach,
  store,
} from './sync-cleanup-api';
import {
  ask,
  chunksStored,
  downloadChunk,
  expectWaiting,
  snapshotOf,
  uploadAll,
  uploadChunk,
} from './sync-snapshot-api';

useSyncApi();

/** What the group answers a member device that uploads a new event under an epoch no group reaches. */
const stateOf = async (phone: Phone, groupId = BRISBANE) =>
  (await upload(phone, groupId, [event()], Number.MAX_SAFE_INTEGER)).body;

/**
 * Fills Brisbane's events to `room` bytes short of its limit with events of `phone`: 159
 * of 65,536 bytes and one more. Resolves with the group's last sequence number.
 */
async function fillBrisbane(phone: Phone, room = 0): Promise<number> {
  let stored = 0;
  for (const count of [...Array.from({ length: 22 }, () => 7), 5]) {
    const sent = events(count, LARGEST);
    expectUploaded(
      await upload(phone, BRISBANE, sent),
      sent,
      sent.map((_, index) => stored + index + 1),
    );
    stored += count;
  }
  aMinuteLater();
  const last = [event(GROUP_LIMIT - stored * LARGEST - room)];
  expectUploaded(await upload(phone, BRISBANE, last), last, [stored + 1]);
  aMinuteLater();
  return stored + 1;
}

/** A rotation without one of its fields. */
const without = (rotation: Rotation, field: keyof Rotation) =>
  Object.fromEntries(
    Object.entries(rotation).filter(([name]) => name !== field),
  );

describe('SHARING-250.1', () => {
  test('[SHARING-250.1] removes a member device and moves the group to the next key epoch in one request', async () => {
    const [taylor, casey, dana] = await threeInBrisbane();
    const rotation = removingDana(taylor, casey);
    setTime(T + 1_000);

    const answer = await rotate(taylor, BRISBANE, rotation);

    expectRotated(answer, rotation, [1]);
    expect(await isMemberDevice(BRISBANE, taylor)).toBe(true);
    expect(await isMemberDevice(BRISBANE, casey)).toBe(true);
    expect(await isMemberDevice(BRISBANE, dana)).toBe(false);
    expect(await stateOf(taylor)).toEqual(wrongEpoch(2));
  });

  test('[SHARING-250.1] stores the events of the request under the new key epoch, uploaded by the phone that sent it', async () => {
    const [taylor, casey] = await threeInBrisbane();
    const rotation = removingDana(taylor, casey);
    setTime(T + 1_000);
    expectRotated(await rotate(taylor, BRISBANE, rotation), rotation, [1]);

    expectPage(await download(casey, BRISBANE, 0), {
      events: [
        relayed(rotation.events[0], {
          sequence: 1,
          by: taylor,
          at: T + 1_000,
          epoch: 2,
        }),
      ],
      more: false,
    });
  });

  test('[SHARING-250.1] takes later uploads only under the new key epoch', async () => {
    const [taylor, casey] = await threeInBrisbane();
    const rotation = removingDana(taylor, casey);
    expectRotated(await rotate(taylor, BRISBANE, rotation), rotation, [1]);
    const next = [event()];

    expectGroupRefused(await upload(taylor, BRISBANE, next, 1), wrongEpoch(2));
    expectUploaded(await upload(taylor, BRISBANE, next, 2), next, [2]);
  });

  test('[SHARING-250.1] lets a phone whose progress is behind remove a device', async () => {
    const [taylor, casey] = await threeInBrisbane();
    await store(taylor, 3);
    await reach(taylor, 0);
    const rotation = removingDana(taylor, casey);

    expectRotated(await rotate(taylor, BRISBANE, rotation), rotation, [4]);
  });

  test('[SHARING-250.1] removes two devices at once', async () => {
    const [taylor, casey, dana] = await threeInBrisbane();
    const rotation = rotationOf([taylor], { remove: [casey.deviceId, DANA] });

    expectRotated(await rotate(taylor, BRISBANE, rotation), rotation, [1]);
    expect(await isMemberDevice(BRISBANE, casey)).toBe(false);
    expect(await isMemberDevice(BRISBANE, dana)).toBe(false);
    expect(await isMemberDevice(BRISBANE, taylor)).toBe(true);
  });

  test('[SHARING-250.1] rotates with no event', async () => {
    const [taylor, casey] = await threeInBrisbane();
    const rotation = removingDana(taylor, casey, { events: [] });

    const answer = await rotate(taylor, BRISBANE, rotation);

    expect(answer).toEqual({ status: 200, body: { epoch: 2, events: [] } });
    expect(await stateOf(taylor)).toEqual(wrongEpoch(2));
    expectPage(await download(casey, BRISBANE, 0), EMPTY_PAGE);
  });

  test('[SHARING-250.1] lets a device that was approved remove the device that approved it', async () => {
    const { taylor, casey, P, S } = await caseyAsked();
    const dana = await registered(DANA);
    await addMember(BRISBANE, dana);
    const approval = approvalOf(P, S);
    expectApproved(
      await approve(taylor, BRISBANE, casey, approval),
      casey,
      approval,
      [1],
    );
    const rotation = rotationOf([casey, dana], { remove: [taylor.deviceId] });

    expectRotated(await rotate(casey, BRISBANE, rotation), rotation, [2]);
    expect(await isMemberDevice(BRISBANE, taylor)).toBe(false);
  });

  test('[SHARING-250.1] keeps nothing of the removed device: its handover, its snapshot and its boxes go', async () => {
    // Dana's phone asks and is approved, so that the API holds a handover for it.
    const [taylor, casey] = await threeInBrisbane();
    const applicant = await registered();
    expect((await putInvite(taylor, BRISBANE, CODE_A, card())).status).toBe(
      200,
    );
    const P = joinRequest();
    expectRequestAnswered(await sendRequest(applicant, CODE_A, P), CODE_A);
    const joining = snapshotOf(taylor, applicant);
    await uploadAll(BRISBANE, joining);
    const approval = approvalOf(P, joining);
    expectApproved(
      await approve(taylor, BRISBANE, applicant, approval),
      applicant,
      approval,
      [1],
    );
    // An earlier rotation leaves a box for it, and a member uploads another snapshot for it.
    const first = rotationOf([taylor, casey, applicant], { remove: [DANA] });
    expectRotated(await rotate(taylor, BRISBANE, first), first, [2]);
    const later = snapshotOf(taylor, applicant, { epoch: 2, sequence: 2 });
    await uploadAll(BRISBANE, later);
    await reach(casey, 2);

    const second = rotationOf([taylor, casey], {
      epoch: 3,
      remove: [applicant.deviceId],
    });
    expectRotated(await rotate(taylor, BRISBANE, second), second, [3]);

    expect(await timesStored(bytesOf(approval.box))).toBe(0);
    expect(await chunksStored(later)).toBe(0);
    expect(await timesStored(bytesOf(boxFor(first, applicant)))).toBe(0);
    expect(await timesStored(bytesOf(boxFor(first, casey)))).toBe(1);
    expect(await timesStored(bytesOf(boxFor(second, casey)))).toBe(1);
  });

  test('[SHARING-250.1] leaves the group’s invite and its requests as they were', async () => {
    const [taylor, casey] = await threeInBrisbane();
    const applicant = await registered();
    const X = card();
    expect((await putInvite(taylor, BRISBANE, CODE_A, X)).status).toBe(200);
    const P = joinRequest();
    expectRequestAnswered(await sendRequest(applicant, CODE_A, P), CODE_A);
    const rotation = removingDana(taylor, casey);

    expectRotated(await rotate(taylor, BRISBANE, rotation), rotation, [1]);

    expectCard(await readInvite(applicant, CODE_A), T + 604_800_000, X);
    expect((await listRequests(taylor, BRISBANE)).body).toEqual({
      requests: [
        {
          code: CODE_A,
          deviceId: applicant.deviceId,
          request: Buffer.from(P).toString('hex'),
        },
      ],
      more: false,
    });
  });
});

describe('SYNC-162.1 once a device is gone', () => {
  /** Who the page after `cursor` says needs a snapshot; null when it names nobody. */
  const neededBy = async (phone: Phone, cursor: number) =>
    (
      await answerHeaders(phone, {
        path: `/groups/${BRISBANE}/events?after=${cursor}`,
      })
    ).get(SNAPSHOT_NEEDED_BY_HEADER);

  test('[SHARING-250.1] [SHARING-254.1] a device that waited for a snapshot is named on no page once it was removed, or has left', async () => {
    const [taylor, casey, dana] = await threeInBrisbane();
    await store(taylor, 5);
    await cleanUpAt(T + THIRTY_DAYS + 1);
    setTime(T + 31 * DAY);
    expectSnapshotNeeded(await download(casey, BRISBANE, 2));
    expectSnapshotNeeded(await download(dana, BRISBANE, 2));
    expect(await neededBy(taylor, 5)).toBe(
      [casey.deviceId, DANA].sort().join(','),
    );

    const removal = removingDana(taylor, casey);
    expectRotated(await rotate(taylor, BRISBANE, removal), removal, [6]);

    expect(await neededBy(taylor, 5)).toBe(casey.deviceId);

    expectLeft(await leave(casey, BRISBANE), casey);
    const alone = rotationOf([taylor], { epoch: 3, events: [] });
    expectRotated(await rotate(taylor, BRISBANE, alone), alone, []);

    expect(await neededBy(taylor, 5)).toBeNull();
  });
});

describe('SHARING-251.1', () => {
  test('[SHARING-251.1] refuses a rotation that lacks the box of a device that stays, and lists the member devices', async () => {
    const [taylor, casey, dana] = await threeInBrisbane();
    const rotation = rotationOf([taylor], { remove: [DANA] });

    const answer = await leavingGroupsAsTheyWere(() =>
      rotate(taylor, BRISBANE, rotation),
    );

    expect(answer).toEqual({
      status: 409,
      body: {
        error: 'devices',
        devices: [taylor.deviceId, DANA, casey.deviceId],
      },
    });
    expect(await isMemberDevice(BRISBANE, dana)).toBe(true);
    expect(await stateOf(taylor)).toEqual(wrongEpoch(1));
    expect(await timesStored(bytesOf(rotation.events[0].content))).toBe(0);
  });

  test('[SHARING-251.1] refuses a rotation with no box for the phone that sends it', async () => {
    const [taylor, casey, dana] = await threeInBrisbane();

    expectRemovalRefused(
      await leavingGroupsAsTheyWere(() =>
        rotate(taylor, BRISBANE, rotationOf([casey], { remove: [DANA] })),
      ),
      otherDevices(taylor, casey, dana),
    );
  });

  test('[SHARING-251.1] refuses a rotation with a box for a device that is no member device', async () => {
    const [taylor, casey, dana] = await threeInBrisbane();
    const stranger = await registered();

    expectRemovalRefused(
      await leavingGroupsAsTheyWere(() =>
        rotate(
          taylor,
          BRISBANE,
          rotationOf([taylor, casey, stranger], { remove: [DANA] }),
        ),
      ),
      otherDevices(taylor, casey, dana),
    );
  });

  test.each([
    [
      'a registered device that is no member device',
      async () => (await registered()).deviceId,
    ],
    [
      'a device the API has never seen',
      async () => 'ffffffff-ffff-4fff-bfff-ffffffffffff',
    ],
  ])('[SHARING-251.1] refuses to remove %s', async (_, device) => {
    const [taylor, casey, dana] = await threeInBrisbane();
    const removed = await device();

    expectRemovalRefused(
      await leavingGroupsAsTheyWere(() =>
        rotate(
          taylor,
          BRISBANE,
          rotationOf([taylor, casey, dana], { remove: [removed] }),
        ),
      ),
      otherDevices(taylor, casey, dana),
    );
  });

  test('[SHARING-251.1] refuses a phone that removes itself', async () => {
    const [taylor, casey, dana] = await threeInBrisbane();

    expectRemovalRefused(
      await leavingGroupsAsTheyWere(() =>
        rotate(
          taylor,
          BRISBANE,
          rotationOf([casey, dana], { remove: [taylor.deviceId] }),
        ),
      ),
      otherDevices(taylor, casey, dana),
    );
    expect(await isMemberDevice(BRISBANE, taylor)).toBe(true);
  });

  test('[SHARING-251.1] refuses a rotation prepared before another device was approved', async () => {
    const { taylor, casey, P, S } = await caseyAsked();
    const dana = await registered(DANA);
    await addMember(BRISBANE, dana);
    const prepared = rotationOf([taylor], { remove: [DANA] });
    const approval = approvalOf(P, S);
    expectApproved(
      await approve(taylor, BRISBANE, casey, approval),
      casey,
      approval,
      [1],
    );

    expectRemovalRefused(
      await leavingGroupsAsTheyWere(() => rotate(taylor, BRISBANE, prepared)),
      otherDevices(taylor, casey, dana),
    );
    expect(await isMemberDevice(BRISBANE, dana)).toBe(true);
  });

  test('[SHARING-251.1] refuses a rotation prepared before a device left, and takes one that names those who are left', async () => {
    const [taylor, casey, dana] = await threeInBrisbane();
    const prepared = removingDana(taylor, casey);
    expectLeft(await leave(casey, BRISBANE), casey);

    expectRemovalRefused(
      await leavingGroupsAsTheyWere(() => rotate(taylor, BRISBANE, prepared)),
      otherDevices(taylor, dana),
    );

    const again = rotationOf([taylor], { remove: [DANA] });
    expectRotated(await rotate(taylor, BRISBANE, again), again, [1]);
  });
});

describe('SHARING-252.1', () => {
  test.each([1, 3, Number.MAX_SAFE_INTEGER])(
    '[SHARING-252.1] refuses a rotation to key epoch %s while the group is at key epoch 1',
    async (epoch) => {
      const [taylor, casey, dana] = await threeInBrisbane();

      const answer = await leavingGroupsAsTheyWere(() =>
        rotate(taylor, BRISBANE, removingDana(taylor, casey, { epoch })),
      );

      expect(answer).toEqual({
        status: 409,
        body: { error: 'epoch', epoch: 1 },
      });
      expect(await isMemberDevice(BRISBANE, dana)).toBe(true);
    },
  );

  test('[SHARING-252.1] refuses a second rotation to the key epoch the group has reached', async () => {
    const [taylor, casey] = await threeInBrisbane();
    const rotation = removingDana(taylor, casey);
    expectRotated(await rotate(taylor, BRISBANE, rotation), rotation, [1]);

    expectRemovalRefused(
      await leavingGroupsAsTheyWere(() =>
        rotate(casey, BRISBANE, rotationOf([taylor, casey])),
      ),
      wrongEpoch(2),
    );
  });
});

describe('SHARING-253.1', () => {
  test('[SHARING-253.1] refuses a rotation that removes nobody while the group needs none', async () => {
    const [taylor, casey, dana] = await threeInBrisbane();

    const answer = await leavingGroupsAsTheyWere(() =>
      rotate(taylor, BRISBANE, rotationOf([taylor, casey, dana])),
    );

    expect(answer).toEqual({
      status: 409,
      body: { error: 'rotation-not-needed' },
    });
    expect(await stateOf(taylor)).toEqual(wrongEpoch(1));
  });

  test('[SHARING-253.1] takes a rotation that removes nobody once a device has left', async () => {
    const [taylor, casey, dana] = await threeInBrisbane();
    expectLeft(await leave(dana, BRISBANE), dana);
    const rotation = rotationOf([taylor, casey]);

    expectRotated(await rotate(taylor, BRISBANE, rotation), rotation, [1]);
    expect(await stateOf(taylor)).toEqual(wrongEpoch(2));
  });
});

describe('SHARING-254.1', () => {
  test('[SHARING-254.1] takes a member device out of the group when it leaves, and marks the group as needing a rotation', async () => {
    const [taylor, casey, dana] = await threeInBrisbane();

    const answer = await call(dana, {
      method: 'POST',
      path: `/groups/${BRISBANE}/leave`,
    });

    expect(answer).toEqual({ status: 200, body: { deviceId: DANA } });
    expect(await isMemberDevice(BRISBANE, dana)).toBe(false);
    expect(await isMemberDevice(BRISBANE, taylor)).toBe(true);
    expect(await isMemberDevice(BRISBANE, casey)).toBe(true);
    expect(await stateOf(taylor)).toEqual(rotationNeeded(taylor, casey));
  });

  test('[SHARING-254.1] lets a device leave a full group though it never downloaded', async () => {
    const [taylor, , dana] = await threeInBrisbane();
    await fillBrisbane(taylor);

    expectLeft(await leave(dana, BRISBANE), dana);
  });

  test('[SHARING-254.1] lets one device after another leave a group that already needs a rotation', async () => {
    const [taylor, casey, dana] = await threeInBrisbane();

    expectLeft(await leave(dana, BRISBANE), dana);
    expectLeft(await leave(casey, BRISBANE), casey);

    expect(await isMemberDevice(BRISBANE, taylor)).toBe(true);
    expect(await stateOf(taylor)).toEqual(rotationNeeded(taylor));
  });

  test('[SHARING-254.1] keeps nothing of the device that left: its snapshot and its boxes go', async () => {
    const [taylor, casey, dana] = await threeInBrisbane();
    const other = await registered();
    await addMember(BRISBANE, other);
    const rotation = rotationOf([taylor, casey, dana], {
      remove: [other.deviceId],
    });
    expectRotated(await rotate(taylor, BRISBANE, rotation), rotation, [1]);
    const forDana = snapshotOf(taylor, dana, { epoch: 2, sequence: 1 });
    await uploadAll(BRISBANE, forDana);
    await reach(casey, 1);

    expectLeft(await leave(dana, BRISBANE), dana);

    expect(await chunksStored(forDana)).toBe(0);
    expect(await timesStored(bytesOf(boxFor(rotation, dana)))).toBe(0);
    expect(await timesStored(bytesOf(boxFor(rotation, casey)))).toBe(1);
  });
});

describe('SHARING-255.1', () => {
  test('[SHARING-255.1] deletes the group and what it stores when its only member device leaves', async () => {
    const taylor = await registered();
    const casey = await registered();
    expectCreated(await createGroup(taylor, BRISBANE), BRISBANE);
    const sent = await store(taylor, 2);
    const X = card();
    expect((await putInvite(taylor, BRISBANE, CODE_A, X)).status).toBe(200);
    const P = joinRequest();
    expectRequestAnswered(await sendRequest(casey, CODE_A, P), CODE_A);

    expectLeft(await leave(taylor, BRISBANE), taylor);

    for (const each of sent) {
      expect(await timesStored(bytesOf(each.content))).toBe(0);
    }
    expect(await timesStored(X)).toBe(0);
    expect(await timesStored(P)).toBe(0);
    expectInviteRefused(await readInvite(casey, CODE_A), NO_INVITE);
    expectGroupRefused(await download(taylor, BRISBANE, 0), NOT_A_MEMBER);
  });

  test('[SHARING-255.1] keeps the group until the last of its member devices has left', async () => {
    const [taylor, casey, dana] = await threeInBrisbane();
    const [sent] = await store(taylor, 1);

    expectLeft(await leave(dana, BRISBANE), dana);
    expectLeft(await leave(casey, BRISBANE), casey);
    expect(await timesStored(bytesOf(sent.content))).toBe(1);
    expectLeft(await leave(taylor, BRISBANE), taylor);

    expect(await timesStored(bytesOf(sent.content))).toBe(0);
  });

  test('[SHARING-255.1] lets the group ID be created again as a new group, and keeps its invite codes used', async () => {
    const taylor = await registered();
    const casey = await registered();
    expectCreated(await createGroup(taylor, BRISBANE), BRISBANE);
    await store(taylor, 2);
    expect((await putInvite(taylor, BRISBANE, CODE_A, card())).status).toBe(
      200,
    );
    expectLeft(await leave(taylor, BRISBANE), taylor);

    expectCreated(await createGroup(casey, BRISBANE), BRISBANE);
    const first = [event()];
    expectUploaded(await upload(casey, BRISBANE, first, 1), first, [1]);
    expect(await isMemberDevice(BRISBANE, taylor)).toBe(false);
    expectInviteRefused(
      await putInvite(casey, BRISBANE, CODE_A, card()),
      NO_INVITE,
    );
    expect((await putInvite(casey, BRISBANE, CODE_B, card())).status).toBe(200);
  });
});

describe('SHARING-256.1', () => {
  test('[SHARING-256.1] refuses an upload of a new event while the group needs a rotation, and lists the member devices', async () => {
    const [taylor, casey, dana] = await threeInBrisbane();
    expectLeft(await leave(dana, BRISBANE), dana);
    const sent = [event()];

    const answer = await leavingGroupsAsTheyWere(() =>
      upload(taylor, BRISBANE, sent, 1),
    );

    expect(answer).toEqual({
      status: 409,
      body: {
        error: 'rotation-needed',
        devices: [taylor.deviceId, casey.deviceId],
      },
    });
    expect(await timesStored(bytesOf(sent[0].content))).toBe(0);
  });

  test('[SHARING-256.1] refuses a download from the group’s last number while it needs a rotation, and records no progress', async () => {
    const [taylor, casey, dana] = await threeInBrisbane();
    await store(taylor, 3);
    expectLeft(await leave(dana, BRISBANE), dana);
    setTime(T + 1_000);

    const answer = await leavingGroupsAsTheyWere(() =>
      download(casey, BRISBANE, 3),
    );

    expectRemovalRefused(answer, rotationNeeded(taylor, casey));
  });

  test('[SHARING-256.1] answers a download from behind the last number with its page while the group needs a rotation', async () => {
    const [taylor, casey, dana] = await threeInBrisbane();
    const sent = await store(taylor, 3);
    expectLeft(await leave(dana, BRISBANE), dana);

    const fromStart = await download(casey, BRISBANE, 0);
    const fromTwo = await download(casey, BRISBANE, 2);

    expect(fromStart.status).toBe(200);
    expect(
      (fromStart.body as { events: { id: string }[] }).events.map(
        ({ id }) => id,
      ),
    ).toEqual(sent.map(({ id }) => id));
    expect(fromTwo.body).toMatchObject({
      events: [{ id: sent[2].id, sequence: 3 }],
      more: false,
    });
  });

  test('[SHARING-256.1] [SHARING-173.2] refuses an approval while the group needs a rotation', async () => {
    const { taylor, casey, P, S } = await caseyAsked();
    const dana = await registered(DANA);
    await addMember(BRISBANE, dana);
    expectLeft(await leave(dana, BRISBANE), dana);

    const answer = await leavingGroupsAsTheyWere(() =>
      approve(taylor, BRISBANE, casey, approvalOf(P, S)),
    );

    expectRemovalRefused(answer, rotationNeeded(taylor));
    expect(await timesStored(P)).toBe(1);
    expect(await isMemberDevice(BRISBANE, casey)).toBe(false);
  });

  test('[SHARING-256.1] answers an upload of events the group already has with their numbers', async () => {
    const [taylor, , dana] = await threeInBrisbane();
    const sent = await store(taylor, 1);
    expectLeft(await leave(dana, BRISBANE), dana);

    expectUploaded(await upload(taylor, BRISBANE, sent, 1), sent, [1]);
  });

  test('[SHARING-256.1] goes on listing requests, making invites, taking snapshots and handing out boxes', async () => {
    const [taylor, casey, dana] = await threeInBrisbane();
    expectLeft(await leave(dana, BRISBANE), dana);

    expect((await listRequests(taylor, BRISBANE)).status).toBe(200);
    expect((await putInvite(taylor, BRISBANE, CODE_B, card())).status).toBe(
      200,
    );
    const S = snapshotOf(taylor, casey);
    await uploadAll(BRISBANE, S);
    expectWaiting(await ask(casey, BRISBANE), S);
    expectKeys(await keysAfter(taylor, BRISBANE, 1), []);
  });

  test('[SHARING-256.1] takes uploads and downloads again once a device that stays has rotated', async () => {
    const [taylor, casey, dana] = await threeInBrisbane();
    expectLeft(await leave(dana, BRISBANE), dana);
    const rotation = rotationOf([taylor, casey]);
    expectRotated(await rotate(taylor, BRISBANE, rotation), rotation, [1]);
    const next = [event()];

    expectUploaded(await upload(taylor, BRISBANE, next, 2), next, [2]);
    expect((await download(casey, BRISBANE, 1)).body).toMatchObject({
      events: [{ id: next[0].id, sequence: 2, epoch: 2 }],
      more: false,
    });
    expectPage(await download(casey, BRISBANE, 2), EMPTY_PAGE);
  });
});

describe('SHARING-257.1', () => {
  /** Every request a member device can send about a group, as `phone` sends it. */
  const everyRequest = (phone: Phone, groupId: string) => {
    const S = snapshotOf(phone, phone);
    return [
      () => upload(phone, groupId, [event()], 2),
      () => download(phone, groupId, 0),
      () => ask(phone, groupId),
      () => uploadChunk(groupId, S, 0),
      () => downloadChunk(phone, groupId, S.id, 0),
      () => putInvite(phone, groupId, CODE_B, card()),
      () => revokeInvite(phone, groupId, CODE_A),
      () => listRequests(phone, groupId),
      () =>
        approve(phone, groupId, TOKYO_APPLICANT, approvalOf(joinRequest(), S)),
      () => reject(phone, groupId, TOKYO_APPLICANT, joinRequest()),
      () => rotate(phone, groupId, rotationOf([phone], { epoch: 3 })),
      () => keysAfter(phone, groupId, 1),
      () => leave(phone, groupId),
    ];
  };
  const TOKYO_APPLICANT = '11111111-1111-4111-8111-111111111111';

  test('[SHARING-257.1] refuses every request of a removed device about the group, as it refuses a device that never was a member', async () => {
    const [taylor, casey, dana] = await threeInBrisbane();
    const stranger = await registered();
    expect((await putInvite(taylor, BRISBANE, CODE_A, card())).status).toBe(
      200,
    );
    const rotation = removingDana(taylor, casey);
    expectRotated(await rotate(taylor, BRISBANE, rotation), rotation, [1]);

    const asRemoved = everyRequest(dana, BRISBANE);
    const asStranger = everyRequest(stranger, BRISBANE);
    expect(asRemoved).toHaveLength(13);
    for (let each = 0; each < asRemoved.length; each += 1) {
      const answer = await leavingGroupsAsTheyWere(asRemoved[each]);
      expect(answer).toEqual({ status: 403, body: NOT_A_MEMBER });
      expect(await asStranger[each]()).toEqual(answer);
    }
  });

  test('[SHARING-257.1] refuses a device that left, also when it leaves again', async () => {
    const [, , dana] = await threeInBrisbane();
    expectLeft(await leave(dana, BRISBANE), dana);

    expectGroupRefused(await download(dana, BRISBANE, 0), NOT_A_MEMBER);
    expectGroupRefused(await leave(dana, BRISBANE), NOT_A_MEMBER);
  });

  test('[SHARING-257.1] leaves the removed device a member device of its other groups', async () => {
    const [taylor, casey, dana] = await threeInBrisbane();
    expectCreated(await createGroup(dana, TOKYO), TOKYO);
    const rotation = removingDana(taylor, casey);
    expectRotated(await rotate(taylor, BRISBANE, rotation), rotation, [1]);
    const sent = [event()];

    expectUploaded(await upload(dana, TOKYO, sent), sent, [1]);
  });

  test('[SHARING-257.1] no longer tells a device that was approved and then removed that it was approved', async () => {
    const { taylor, casey, P, S } = await caseyAsked();
    const approval = approvalOf(P, S);
    expectApproved(
      await approve(taylor, BRISBANE, casey, approval),
      casey,
      approval,
      [1],
    );
    const rotation = rotationOf([taylor], { remove: [casey.deviceId] });
    expectRotated(await rotate(taylor, BRISBANE, rotation), rotation, [2]);

    expect(await askResult(casey, CODE_A)).toEqual(NONE);
    expect(await timesStored(bytesOf(approval.box))).toBe(0);
  });

  test('[SHARING-257.1] lets a removed device ask again and be approved, with none of its old boxes', async () => {
    const [taylor, casey, dana] = await threeInBrisbane();
    const other = await registered();
    await addMember(BRISBANE, other);
    const first = rotationOf([taylor, casey, dana], {
      remove: [other.deviceId],
    });
    expectRotated(await rotate(taylor, BRISBANE, first), first, [1]);
    const second = removingDana(taylor, casey, { epoch: 3 });
    expectRotated(await rotate(taylor, BRISBANE, second), second, [2]);
    expect((await putInvite(taylor, BRISBANE, CODE_A, card(), 2)).status).toBe(
      200,
    );
    const P = joinRequest();
    expectRequestAnswered(await sendRequest(dana, CODE_A, P), CODE_A);
    const S = snapshotOf(casey, dana, { epoch: 3, sequence: 2 });
    await uploadAll(BRISBANE, S);
    const approval = approvalOf(P, S, { cursor: 2, epoch: 3 });

    expectApproved(
      await approve(casey, BRISBANE, dana, approval),
      dana,
      approval,
      [3],
    );

    expect(await isMemberDevice(BRISBANE, dana)).toBe(true);
    expectKeys(await keysAfter(dana, BRISBANE, 0), []);
  });
});

describe('SHARING-259.1', () => {
  test('[SHARING-259.1] hands a member device the box kept for it, with the sender’s key and the key epoch', async () => {
    const [taylor, casey] = await threeInBrisbane();
    const rotation = removingDana(taylor, casey);
    expectRotated(await rotate(taylor, BRISBANE, rotation), rotation, [1]);

    const answer = await call(casey, {
      path: `/groups/${BRISBANE}/keys?after=1`,
    });

    expect(answer).toEqual({
      status: 200,
      body: {
        keys: [
          {
            epoch: 2,
            senderKey: rotation.senderKey,
            box: boxFor(rotation, casey),
          },
        ],
        more: false,
      },
    });
    expectKeys(await keysAfter(taylor, BRISBANE, 1), [
      [2, rotation, boxFor(rotation, taylor)],
    ]);
    expect(
      (
        await answerHeaders(casey, { path: keysPath(BRISBANE, '?after=1') })
      ).get('cache-control'),
    ).toBe('no-store');
  });

  test('[SHARING-259.1] hands the same box again while the phone names an epoch before it', async () => {
    const [taylor, casey] = await threeInBrisbane();
    const rotation = removingDana(taylor, casey);
    expectRotated(await rotate(taylor, BRISBANE, rotation), rotation, [1]);
    const expected: Parameters<typeof expectKeys>[1] = [
      [2, rotation, boxFor(rotation, casey)],
    ];

    expectKeys(await keysAfter(casey, BRISBANE, 1), expected);
    expectKeys(await keysAfter(casey, BRISBANE, 1), expected);

    expect(await timesStored(bytesOf(boxFor(rotation, casey)))).toBe(1);
  });

  test('[SHARING-259.1] deletes a phone’s box once the phone names its epoch, and no other phone’s', async () => {
    const [taylor, casey] = await threeInBrisbane();
    const rotation = removingDana(taylor, casey);
    expectRotated(await rotate(taylor, BRISBANE, rotation), rotation, [1]);

    expectKeys(await keysAfter(casey, BRISBANE, 2), []);

    expect(await timesStored(bytesOf(boxFor(rotation, casey)))).toBe(0);
    expect(await timesStored(bytesOf(boxFor(rotation, taylor)))).toBe(1);
  });

  test('[SHARING-259.1] hands the boxes of two rotations in the order of their epochs, and only those after the epoch named', async () => {
    const [taylor, casey] = await threeInBrisbane();
    const first = removingDana(taylor, casey);
    expectRotated(await rotate(taylor, BRISBANE, first), first, [1]);
    const other = await registered();
    await addMember(BRISBANE, other);
    const second = rotationOf([taylor, casey], {
      epoch: 3,
      remove: [other.deviceId],
    });
    expectRotated(await rotate(taylor, BRISBANE, second), second, [2]);

    expectKeys(await keysAfter(casey, BRISBANE, 1), [
      [2, first, boxFor(first, casey)],
      [3, second, boxFor(second, casey)],
    ]);
    expectKeys(await keysAfter(casey, BRISBANE, 2), [
      [3, second, boxFor(second, casey)],
    ]);
  });

  test('[SHARING-259.1] hands every box when the phone names epoch 0', async () => {
    const [taylor, casey] = await threeInBrisbane();
    const rotation = removingDana(taylor, casey);
    expectRotated(await rotate(taylor, BRISBANE, rotation), rotation, [1]);

    expectKeys(await keysAfter(casey, BRISBANE, 0), [
      [2, rotation, boxFor(rotation, casey)],
    ]);
  });

  test('[SHARING-259.1] answers with no box for a group that never rotated', async () => {
    const [taylor] = await threeInBrisbane();

    expect(await keysAfter(taylor, BRISBANE, 1)).toEqual({
      status: 200,
      body: { keys: [], more: false },
    });
  });

  test('[SHARING-259.1] hands at most 100 boxes at once, and says that more follow', async () => {
    const [taylor, casey, dana] = await threeInBrisbane();
    const rotations: Rotation[] = [];
    // Dana's phone leaves and is put back 101 times; each time Taylor's phone rotates.
    for (let round = 0; round < MOST_KEYS + 1; round += 1) {
      if (round % 25 === 0) aMinuteLater();
      expectLeft(await leave(dana, BRISBANE), dana);
      const rotation = rotationOf([taylor, casey], {
        epoch: round + 2,
        events: [],
      });
      expectRotated(await rotate(taylor, BRISBANE, rotation), rotation, []);
      rotations.push(rotation);
      await addMember(BRISBANE, dana);
    }
    aMinuteLater();

    expectKeys(
      await keysAfter(casey, BRISBANE, 1),
      rotations
        .slice(0, MOST_KEYS)
        .map((rotation, index) => [
          index + 2,
          rotation,
          boxFor(rotation, casey),
        ]),
      true,
    );
    expectKeys(await keysAfter(casey, BRISBANE, MOST_KEYS + 1), [
      [
        MOST_KEYS + 2,
        rotations[MOST_KEYS],
        boxFor(rotations[MOST_KEYS], casey),
      ],
    ]);
  });
});

describe('SHARING-260.1', () => {
  test('[SHARING-260.1] keeps a box through a year of cleanups, until its phone fetches it', async () => {
    const [taylor, casey] = await threeInBrisbane();
    const rotation = removingDana(taylor, casey);
    expectRotated(await rotate(taylor, BRISBANE, rotation), rotation, [1]);

    await cleanUpAt(T + 365 * DAY);
    setTime(T + 365 * DAY);

    expectKeys(await keysAfter(casey, BRISBANE, 1), [
      [2, rotation, boxFor(rotation, casey)],
    ]);
  });

  test('[SHARING-260.1] deletes the box of a phone that leaves the group', async () => {
    const [taylor, casey] = await threeInBrisbane();
    const rotation = removingDana(taylor, casey);
    expectRotated(await rotate(taylor, BRISBANE, rotation), rotation, [1]);

    expectLeft(await leave(casey, BRISBANE), casey);

    expect(await timesStored(bytesOf(boxFor(rotation, casey)))).toBe(0);
    expect(await timesStored(bytesOf(boxFor(rotation, taylor)))).toBe(1);
  });
});

describe('SHARING-261.1', () => {
  const refusedAsWritten = async (work: () => Promise<Answer>) =>
    expectRefused(await leavingGroupsAsTheyWere(work), REQUEST);

  test.each(['9B2F6C1E-8D47-4F3A-B1C5-2E7D90A4F6B8', 'brisbane'])(
    '[SHARING-261.1] refuses a rotation, a leave and a question for keys whose group ID is %s',
    async (groupId) => {
      const [taylor, casey, dana] = await threeInBrisbane();

      await refusedAsWritten(() =>
        rotate(taylor, groupId, removingDana(taylor, casey)),
      );
      await refusedAsWritten(() => leave(dana, groupId));
      await refusedAsWritten(() => keysAfter(taylor, groupId, 1));
      expect(await isMemberDevice(BRISBANE, dana)).toBe(true);
    },
  );

  test('[SHARING-261.1] refuses a rotation and a leave whose URL carries a query', async () => {
    const [taylor, casey, dana] = await threeInBrisbane();

    await refusedAsWritten(() =>
      call(taylor, {
        ...rotationRequest(BRISBANE, removingDana(taylor, casey)),
        path: rotationPath(BRISBANE, '?x=1'),
      }),
    );
    await refusedAsWritten(() =>
      call(dana, { method: 'POST', path: leavePath(BRISBANE, '?x=1') }),
    );
    expect(await isMemberDevice(BRISBANE, dana)).toBe(true);
  });

  test.each([
    '',
    '?after=',
    '?after=-1',
    '?after=1.5',
    '?after=01',
    '?after=abc',
    '?after=%31',
    '?after=9007199254740992',
    '?epoch=1',
    '?after=1&x=1',
    '?after=1&after=1',
  ])(
    '[SHARING-261.1] refuses a question for keys with the query "%s"',
    async (query) => {
      const [taylor] = await threeInBrisbane();

      await refusedAsWritten(() =>
        call(taylor, { path: keysPath(BRISBANE, query) }),
      );
    },
  );

  test('[SHARING-261.1] refuses a leave that carries content', async () => {
    const [, , dana] = await threeInBrisbane();

    await refusedAsWritten(() => leave(dana, BRISBANE, '{}'));
    expect(await isMemberDevice(BRISBANE, dana)).toBe(true);
  });

  /** A rotation that removes Dana's phone, changed by `change`, as the text a request carries. */
  const wrongRotations: [string, (rotation: Rotation) => unknown][] = [
    ['no content', () => ''],
    ['an empty object', () => '{}'],
    ['an array', () => '[]'],
    ['text that is no JSON', () => 'rotate'],
    ['no epoch', (rotation) => without(rotation, 'epoch')],
    ['no remove', (rotation) => without(rotation, 'remove')],
    ['no senderKey', (rotation) => without(rotation, 'senderKey')],
    ['no boxes', (rotation) => without(rotation, 'boxes')],
    ['no events', (rotation) => without(rotation, 'events')],
    ['a cursor besides', (rotation) => ({ ...rotation, cursor: 0 })],
    ['epoch 0', (rotation) => ({ ...rotation, epoch: 0 })],
    ['epoch 1', (rotation) => ({ ...rotation, epoch: 1 })],
    ['epoch 1.5', (rotation) => ({ ...rotation, epoch: 1.5 })],
    ['epoch as text', (rotation) => ({ ...rotation, epoch: '2' })],
    ['remove that is no array', (rotation) => ({ ...rotation, remove: DANA })],
    [
      'remove with 20 devices',
      (rotation) => ({
        ...rotation,
        remove: Array.from({ length: 20 }, () => randomUUID()),
      }),
    ],
    [
      'remove with one device twice',
      (rotation) => ({ ...rotation, remove: [DANA, DANA] }),
    ],
    [
      'remove with a device ID that is no UUID',
      (rotation) => ({ ...rotation, remove: ['dana'] }),
    ],
    [
      'a senderKey of 31 bytes',
      (rotation) => ({
        ...rotation,
        senderKey: randomBytes(31).toString('hex'),
      }),
    ],
    [
      'a senderKey in upper case',
      (rotation) => ({
        ...rotation,
        senderKey: rotation.senderKey.toUpperCase(),
      }),
    ],
    ['no box at all', (rotation) => ({ ...rotation, boxes: [] })],
    [
      '21 boxes',
      (rotation) => ({
        ...rotation,
        boxes: Array.from({ length: 21 }, () => ({
          deviceId: randomUUID(),
          box: box(),
        })),
      }),
    ],
    [
      'two boxes for one device',
      (rotation) => ({
        ...rotation,
        boxes: [...rotation.boxes, { ...rotation.boxes[0], box: box() }],
      }),
    ],
    [
      'a box with an epoch besides',
      (rotation) => ({
        ...rotation,
        boxes: [{ ...rotation.boxes[0], epoch: 2 }, rotation.boxes[1]],
      }),
    ],
    [
      'a box of 40 bytes',
      (rotation) => ({
        ...rotation,
        boxes: [
          { ...rotation.boxes[0], box: box(SMALLEST_BOX - 1) },
          rotation.boxes[1],
        ],
      }),
    ],
    [
      'a box of 1,025 bytes',
      (rotation) => ({
        ...rotation,
        boxes: [
          { ...rotation.boxes[0], box: box(LARGEST_BOX + 1) },
          rotation.boxes[1],
        ],
      }),
    ],
    [
      'a device both removed and given a box',
      (rotation) => ({
        ...rotation,
        boxes: [...rotation.boxes, { deviceId: DANA, box: box() }],
      }),
    ],
    ['events that are no array', (rotation) => ({ ...rotation, events: {} })],
    ['101 events', (rotation) => ({ ...rotation, events: events(101) })],
    [
      'two events with one ID',
      (rotation) => ({
        ...rotation,
        events: [rotation.events[0], event(200, rotation.events[0].id)],
      }),
    ],
    [
      'an event of 40 bytes',
      (rotation) => ({ ...rotation, events: [event(40)] }),
    ],
  ];

  test.each(wrongRotations)(
    '[SHARING-261.1] refuses a rotation with %s',
    async (_, change) => {
      const [taylor, casey, dana] = await threeInBrisbane();

      await refusedAsWritten(() =>
        rotate(taylor, BRISBANE, change(removingDana(taylor, casey))),
      );
      expect(await isMemberDevice(BRISBANE, dana)).toBe(true);
      expect(await stateOf(taylor)).toEqual(wrongEpoch(1));
    },
  );

  test('[SHARING-261.1] takes boxes of 41 and of 1,024 bytes', async () => {
    const [taylor, casey] = await threeInBrisbane();
    const rotation = removingDana(taylor, casey, {
      boxes: [
        { deviceId: taylor.deviceId, box: box(SMALLEST_BOX) },
        { deviceId: casey.deviceId, box: box(LARGEST_BOX) },
      ],
    });

    expectRotated(await rotate(taylor, BRISBANE, rotation), rotation, [1]);
  });
});

describe('SHARING-262.1', () => {
  test('[SHARING-262.1] refuses an unsigned rotation, leave and question for keys before anything else', async () => {
    const [taylor, casey] = await threeInBrisbane();
    const stranger = newPhone();
    const inputs = [
      rotationRequest(BRISBANE, removingDana(taylor, casey)),
      leaveRequest(BRISBANE),
      { path: keysPath(BRISBANE, '?after=1') },
    ];
    const before = await databaseContents();

    for (const input of inputs) {
      expectRefused(await send({ ...signedBy(stranger, input), headers: {} }), {
        error: 'signature',
      });
      expectRefused(await send(signedBy(stranger, input)), {
        error: 'signature',
      });
    }

    expect(await databaseContents()).toEqual(before);
  });

  test('[SHARING-262.1] reports a request written wrongly before it looks at membership', async () => {
    await threeInBrisbane();
    const stranger = await registered();

    expectRefused(await rotate(stranger, BRISBANE, '{}'), REQUEST);
    expectRefused(await leave(stranger, BRISBANE, '{}'), REQUEST);
    expectRefused(await call(stranger, { path: keysPath(BRISBANE) }), REQUEST);
  });

  test('[SHARING-262.1] tells a device that is no member device the same about a group that exists and one that does not', async () => {
    const [taylor, casey] = await threeInBrisbane();
    const stranger = await registered();
    const answers: Answer[][] = [];

    for (const groupId of [BRISBANE, TOKYO]) {
      answers.push([
        await rotate(
          stranger,
          groupId,
          removingDana(taylor, casey, { epoch: 9 }),
        ),
        await leave(stranger, groupId),
        await keysAfter(stranger, groupId, 1),
      ]);
    }

    for (const answer of answers[0]) {
      expect(answer).toEqual({ status: 403, body: NOT_A_MEMBER });
    }
    expect(answers[1]).toEqual(answers[0]);
  });

  test('[SHARING-262.1] reports other devices, then the key epoch, then that no rotation is needed, then a full group', async () => {
    const [taylor, casey, dana] = await threeInBrisbane();
    await fillBrisbane(taylor, 199);
    const sent = [event(200)];
    const attempt = (changes: Partial<Rotation>, staying: Phone[]) =>
      leavingGroupsAsTheyWere(() =>
        rotate(
          taylor,
          BRISBANE,
          rotationOf(staying, { events: sent, ...changes }),
        ),
      );

    expectRemovalRefused(
      await attempt({ epoch: 3 }, [taylor]),
      otherDevices(taylor, casey, dana),
    );
    expectRemovalRefused(
      await attempt({ epoch: 3 }, [taylor, casey, dana]),
      wrongEpoch(1),
    );
    expectRemovalRefused(
      await attempt({ epoch: 2 }, [taylor, casey, dana]),
      ROTATION_NOT_NEEDED,
    );
    expectRemovalRefused(
      await attempt({ epoch: 2, remove: [DANA] }, [taylor, casey]),
      GROUP_FULL,
    );
    expect(await isMemberDevice(BRISBANE, dana)).toBe(true);
    expect(await stateOf(taylor)).toEqual(wrongEpoch(1));
  });

  test('[SHARING-262.1] counts a refused rotation as a request that passed the checks: sent again as it is, it is a replay', async () => {
    const [taylor, casey] = await threeInBrisbane();
    const request = signedBy(
      taylor,
      rotationRequest(BRISBANE, removingDana(taylor, casey, { epoch: 3 })),
    );

    expectRemovalRefused(await send(request), wrongEpoch(1));

    expectRefused(await send(request), { error: 'replayed' });
  });
});

describe('SHARING-263.1', () => {
  test('[SHARING-263.1] stores the boxes, the sender’s key and the events of a rotation, and no other header of its request', async () => {
    const [taylor, casey] = await threeInBrisbane();
    const rotation = removingDana(taylor, casey);

    expectRotated(
      await call(taylor, rotationRequest(BRISBANE, rotation), {
        'User-Agent': 'TaylorsPhone/1.0',
        'X-Member-Name': 'Dana-Kim',
      }),
      rotation,
      [1],
    );

    expect(await timesStored(bytesOf(boxFor(rotation, taylor)))).toBe(1);
    expect(await timesStored(bytesOf(boxFor(rotation, casey)))).toBe(1);
    expect(await timesStored(bytesOf(rotation.events[0].content))).toBe(1);
    expect(await timesStored(bytesOf(rotation.senderKey))).toBeGreaterThan(0);
    expect(await timesStored('TaylorsPhone')).toBe(0);
    expect(await timesStored('Dana-Kim')).toBe(0);
  });

  test('[SHARING-263.1] stores nothing a refused rotation carried', async () => {
    const [taylor, casey] = await threeInBrisbane();
    const wrongEpochRotation = removingDana(taylor, casey, { epoch: 3 });
    const tooFewBoxes = rotationOf([taylor], { remove: [DANA] });

    expect((await rotate(taylor, BRISBANE, wrongEpochRotation)).status).toBe(
      409,
    );
    expect((await rotate(taylor, BRISBANE, tooFewBoxes)).status).toBe(409);

    for (const rotation of [wrongEpochRotation, tooFewBoxes]) {
      for (const each of rotation.boxes) {
        expect(await timesStored(bytesOf(each.box))).toBe(0);
      }
      expect(await timesStored(bytesOf(rotation.senderKey))).toBe(0);
      expect(await timesStored(bytesOf(rotation.events[0].content))).toBe(0);
    }
  });

  test('[SHARING-263.1] keeps no header of a leave, and no row that names both the group and the device that left', async () => {
    const [, , dana] = await threeInBrisbane();
    await reach(dana, 0);
    expect(await rowsHolding(BRISBANE, DANA)).toBeGreaterThan(0);

    expectLeft(
      await call(dana, leaveRequest(BRISBANE), { 'X-Reason': 'moving-out' }),
      dana,
    );

    expect(await timesStored('moving-out')).toBe(0);
    expect(await rowsHolding(BRISBANE, DANA)).toBe(0);
  });
});

describe('SHARING-264.1', () => {
  test('[SHARING-264.1] has no route for another method on the paths of a rotation, a leave and the keys', async () => {
    const [taylor, casey, dana] = await threeInBrisbane();
    const body = JSON.stringify(removingDana(taylor, casey));
    const requests = [
      { method: 'GET', path: rotationPath(BRISBANE) },
      { method: 'HEAD', path: rotationPath(BRISBANE) },
      { method: 'DELETE', path: rotationPath(BRISBANE) },
      { method: 'PUT', path: rotationPath(BRISBANE), body },
      { method: 'GET', path: leavePath(BRISBANE) },
      { method: 'HEAD', path: leavePath(BRISBANE) },
      { method: 'PUT', path: leavePath(BRISBANE) },
      { method: 'DELETE', path: leavePath(BRISBANE) },
      { method: 'HEAD', path: keysPath(BRISBANE, '?after=1') },
      { method: 'POST', path: keysPath(BRISBANE, '?after=1') },
      { method: 'PUT', path: keysPath(BRISBANE, '?after=1') },
      { method: 'DELETE', path: keysPath(BRISBANE, '?after=1') },
    ];

    for (const request of requests) {
      const answer = await leavingGroupsAsTheyWere(() => call(taylor, request));
      expect(answer.status).toBe(404);
      expect(answer.body).not.toEqual(NOT_A_MEMBER);
    }
    expect(await isMemberDevice(BRISBANE, dana)).toBe(true);
    expect(await stateOf(taylor)).toEqual(wrongEpoch(1));
  });
});

/**
 * Five groups, each with three member devices, the same three phones in all of them, and
 * a server of its own for each of two of them.
 */
async function fiveGroupsOfThree() {
  const phones = [await registered(), await registered(), await registered()];
  const groupIds: string[] = [];
  for (let round = 0; round < 5; round += 1) {
    const groupId = randomUUID();
    expectCreated(await createGroup(phones[0], groupId), groupId);
    await addMember(groupId, phones[1]);
    await addMember(groupId, phones[2]);
    groupIds.push(groupId);
  }
  aMinuteLater();
  return { phones, groupIds, servers: [await ownServer(), await ownServer()] };
}

describe('SHARING-265.1', () => {
  test('[SHARING-265.1] lets exactly one of two rotations that remove the same device at the same moment through', async () => {
    const { phones, groupIds, servers } = await fiveGroupsOfThree();
    const [first, second, third] = phones;

    for (const groupId of groupIds) {
      const rotations = [first, second].map(() =>
        rotationOf([first, second], { remove: [third.deviceId] }),
      );

      const answers = await Promise.all(
        [first, second].map((phone, index) =>
          callOn(
            servers[index],
            phone,
            rotationRequest(groupId, rotations[index]),
          ),
        ),
      );

      expect(answers.map(({ status }) => status).sort()).toEqual([200, 409]);
      const won = answers.findIndex(({ status }) => status === 200);
      expectRotated(answers[won], rotations[won], [1]);
      expect(['devices', 'epoch']).toContain(
        (answers[1 - won].body as { error: string }).error,
      );
      expect(await stateOf(first, groupId)).toEqual(wrongEpoch(2));
      for (const each of rotations[won].boxes) {
        expect(await timesStored(bytesOf(each.box))).toBe(1);
      }
      for (const each of rotations[1 - won].boxes) {
        expect(await timesStored(bytesOf(each.box))).toBe(0);
      }
      expect((await everyEvent(first, groupId)).map(({ id }) => id)).toEqual([
        rotations[won].events[0].id,
      ]);
      aMinuteLater();
    }
  });

  test('[SHARING-265.1] never admits a device and rotates past it at the same moment', async () => {
    const taylor = await registered();
    const member = await registered();
    const servers = [await ownServer(), await ownServer()];

    for (let round = 0; round < 5; round += 1) {
      const groupId = randomUUID();
      const code = randomBytes(16).toString('base64url');
      expectCreated(await createGroup(taylor, groupId), groupId);
      await addMember(groupId, member);
      expect((await putInvite(taylor, groupId, code, card())).status).toBe(200);
      const applicant = await registered();
      const P = joinRequest();
      expectRequestAnswered(await sendRequest(applicant, code, P), code);
      const S = snapshotOf(taylor, applicant);
      await uploadAll(groupId, S);
      const approval = approvalOf(P, S);
      const rotation = rotationOf([member], { remove: [taylor.deviceId] });

      const [approved, rotated] = await Promise.all([
        callOn(
          servers[0],
          taylor,
          approvalRequest(groupId, applicant, approval),
        ),
        callOn(servers[1], member, rotationRequest(groupId, rotation)),
      ]);

      if (approved.status === 200) {
        expectRemovalRefused(rotated, otherDevices(taylor, member, applicant));
        expect(await isMemberDevice(groupId, taylor)).toBe(true);
        expect(await isMemberDevice(groupId, applicant)).toBe(true);
        expect(await stateOf(member, groupId)).toEqual(wrongEpoch(1));
      } else {
        expectRotated(rotated, rotation, [1]);
        expect(approved).toEqual({ status: 403, body: NOT_A_MEMBER });
        expect(await isMemberDevice(groupId, taylor)).toBe(false);
        expect(await isMemberDevice(groupId, applicant)).toBe(false);
        expect(await timesStored(P)).toBe(1);
        expect(await stateOf(member, groupId)).toEqual(wrongEpoch(2));
      }
      aMinuteLater();
    }
  });

  test('[SHARING-265.1] takes a device that leaves out of the group whichever of its leave and its removal comes first', async () => {
    const { phones, groupIds, servers } = await fiveGroupsOfThree();
    const [first, second, third] = phones;

    for (const groupId of groupIds) {
      const rotation = rotationOf([first, second], {
        remove: [third.deviceId],
      });

      const [left, rotated] = await Promise.all([
        callOn(servers[0], third, leaveRequest(groupId)),
        callOn(servers[1], first, rotationRequest(groupId, rotation)),
      ]);

      expect(await isMemberDevice(groupId, third)).toBe(false);
      if (rotated.status === 200) {
        expectRotated(rotated, rotation, [1]);
        expect(left).toEqual({ status: 403, body: NOT_A_MEMBER });
        expect(await stateOf(first, groupId)).toEqual(wrongEpoch(2));
      } else {
        expectLeft(left, third);
        expectRemovalRefused(rotated, otherDevices(first, second));
        expect(await stateOf(first, groupId)).toEqual(
          rotationNeeded(first, second),
        );
      }
      aMinuteLater();
    }
  });
});

describe('SHARING-182.2', () => {
  test('[SHARING-182.2] reports that an approval’s phone is behind before that the group needs a rotation, and that before the key epoch', async () => {
    const { taylor, casey, P, S } = await caseyAsked({ events: 3 });
    const dana = await registered(DANA);
    await addMember(BRISBANE, dana);
    expectLeft(await leave(dana, BRISBANE), dana);

    const behind = await leavingGroupsAsTheyWere(() =>
      approve(
        taylor,
        BRISBANE,
        casey,
        approvalOf(P, S, { cursor: 2, epoch: 2 }),
      ),
    );
    const caughtUp = await leavingGroupsAsTheyWere(() =>
      approve(
        taylor,
        BRISBANE,
        casey,
        approvalOf(P, S, { cursor: 3, epoch: 2 }),
      ),
    );

    expect(behind).toEqual({ status: 409, body: { error: 'behind' } });
    expectRemovalRefused(caughtUp, rotationNeeded(taylor));
    expect(await timesStored(P)).toBe(1);
    expect(sha256Of(P)).toHaveLength(64);
  });
});

describe('SYNC-57.3', () => {
  test('[SYNC-57.3] answers a download from the last number of a group that needs a rotation with a refusal, not with an empty page', async () => {
    const [taylor, casey] = await threeInBrisbane();
    const sent = await store(taylor, 3);
    expectLeft(await leave(casey, BRISBANE), casey);

    const fromTwo = await download(taylor, BRISBANE, 2);
    const fromThree = await download(taylor, BRISBANE, 3);

    expect(fromTwo.body).toMatchObject({
      events: [{ id: sent[2].id, sequence: 3 }],
      more: false,
    });
    expect(fromThree.status).toBe(409);
    expect(fromThree.body).toMatchObject({ error: 'rotation-needed' });
  });
});

describe('SYNC-60.2', () => {
  test('[SYNC-60.2] reports that the group needs a rotation before the key epoch and a full group, and a cursor past the last number before that', async () => {
    const [taylor, casey] = await threeInBrisbane();
    const last = await fillBrisbane(taylor);
    expectLeft(await leave(casey, BRISBANE), casey);

    const uploaded = await leavingGroupsAsTheyWere(() =>
      upload(taylor, BRISBANE, [event(41)], 2),
    );
    const downloaded = await leavingGroupsAsTheyWere(() =>
      download(taylor, BRISBANE, last + 1),
    );

    expect(uploaded.status).toBe(409);
    expect(uploaded.body).toMatchObject({ error: 'rotation-needed' });
    expectRefused(downloaded, REQUEST);
  });
});
