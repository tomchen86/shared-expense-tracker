import { randomBytes, randomUUID } from 'node:crypto';
import {
  CASEY,
  T,
  databaseContents,
  expectRefused,
  fieldOf,
  newPhone,
  registered,
  send,
  setTime,
  signedBy,
  timesStored,
  type Phone,
} from './sharing-api';
import {
  BEHIND,
  MEMBERS_FULL,
  MOST_MEMBER_DEVICES,
  NONE,
  NO_REQUEST,
  WAITING,
  approvalOf,
  approvalPath,
  approvalRequest,
  approve,
  askResult,
  bytesOf,
  caseyAsked,
  decisionPath,
  expectApproved,
  expectDecisionRefused,
  expectHandover,
  expectRejected,
  expectRequests,
  isMemberDevice,
  listAfter,
  listRequests,
  naming,
  reject,
  requestsPath,
  sha256Of,
} from './sharing-decisions-api';
import {
  ALREADY_A_MEMBER,
  CODE_A,
  CODE_B,
  CODE_C,
  MOST_REQUESTS,
  NO_INVITE,
  REQUEST,
  WEEK,
  applicants,
  brisbaneInvitesCasey,
  cancelRequest,
  card,
  expectRequestAnswered,
  expectRevoked,
  joinRequest,
  putInvite,
  requestBody,
  requestPath,
  revokeInvite,
  sendRequest,
} from './sharing-invites-api';
import {
  BRISBANE,
  GROUP_FULL,
  GROUP_LIMIT,
  LARGEST,
  NOT_A_MEMBER,
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
  THIRTY_DAYS,
  cleanUpAt,
  expectSnapshotNeeded,
  reach,
  valuesAddedSince,
} from './sync-cleanup-api';
import {
  NO_SNAPSHOT,
  ask,
  expectSnapshotRefused,
  expectWaiting,
  snapshotOf,
  uploadAll,
  uploadChunk,
} from './sync-snapshot-api';

// Approving and rejecting join requests on the API (ADR-0015, ADR-0039): a member device
// lists the requests of its group's active invite, rejects one, or approves one in a
// single request that stores the approval's events, admits the device, and keeps the
// handover for it. The device that asked learns the answer by asking.

useSyncApi();

const LOW = '11111111-1111-4111-8111-111111111111';
const HIGH = 'ffffffff-ffff-4fff-bfff-ffffffffffff';

/** Taylor's phone makes Tokyo and its invite under code B. */
async function tokyoInvites(taylor: Phone) {
  expectCreated(await createGroup(taylor, TOKYO), TOKYO);
  expect((await putInvite(taylor, TOKYO, CODE_B, card())).status).toBe(200);
}

/** A 16-byte code of its own, as base64url without padding. */
const newCode = () => randomBytes(16).toString('base64url');

/** The content of the request Brisbane holds for `applicant`, as a member device lists it. */
async function contentOf(member: Phone, applicant: Phone) {
  const { status, body } = await listRequests(member, BRISBANE);
  expect(status).toBe(200);
  const { requests } = body as {
    requests: { deviceId: string; request: string }[];
  };
  const held = requests.find(({ deviceId }) => deviceId === applicant.deviceId);
  if (!held) throw new Error('Brisbane holds no request of that device');
  return bytesOf(held.request);
}

describe('SHARING-170.1', () => {
  test('[SHARING-170.1] lists the requests of the group in the order of their device IDs, each with its code, device and content', async () => {
    const [taylor, casey] = await brisbaneInvitesCasey();
    const low = await registered(LOW);
    const P = joinRequest();
    const Q = joinRequest();
    expectRequestAnswered(await sendRequest(casey, CODE_A, P), CODE_A);
    expectRequestAnswered(await sendRequest(low, CODE_A, Q), CODE_A);

    const answer = await leavingGroupsAsTheyWere(() =>
      listRequests(taylor, BRISBANE),
    );

    expectRequests(answer, [
      [CODE_A, LOW, Q],
      [CODE_A, CASEY, P],
    ]);
    const headers = await answerHeaders(taylor, {
      path: requestsPath(BRISBANE),
    });
    expect(headers.get('cache-control')).toBe('no-store');
  });

  test('[SHARING-170.1] lists nothing for an invite with no request, and for a group with no invite', async () => {
    const [taylor] = await brisbaneInvitesCasey();
    expectCreated(await createGroup(taylor, TOKYO), TOKYO);

    expectRequests(await listRequests(taylor, BRISBANE), []);
    expectRequests(await listRequests(taylor, TOKYO), []);
  });

  test.each(['cancelled', 'revoked', 'expired'])(
    '[SHARING-170.1] lists no request that was %s',
    async (how) => {
      const { taylor, casey } = await caseyAsked({ sequence: false });
      if (how === 'cancelled') {
        expectRequestAnswered(await cancelRequest(casey, CODE_A), CODE_A);
      } else if (how === 'revoked') {
        expectRevoked(await revokeInvite(taylor, BRISBANE, CODE_A), CODE_A);
      } else {
        setTime(T + WEEK);
      }

      expectRequests(await listRequests(taylor, BRISBANE), []);
    },
  );

  test('[SHARING-170.1] lists the content a device sent last', async () => {
    const { taylor, casey } = await caseyAsked({ sequence: false });
    const Q = joinRequest();
    expectRequestAnswered(await sendRequest(casey, CODE_A, Q), CODE_A);

    expectRequests(await listRequests(taylor, BRISBANE), [[CODE_A, casey, Q]]);
  });

  test("[SHARING-170.1] lists only its own group's requests, to any member device", async () => {
    const { taylor, casey, P } = await caseyAsked({ sequence: false });
    await tokyoInvites(taylor);
    const other = await registered();
    expectRequestAnswered(
      await sendRequest(other, CODE_B, joinRequest()),
      CODE_B,
    );
    const member = await registered();
    await addMember(BRISBANE, member);

    expectRequests(await listRequests(member, BRISBANE), [[CODE_A, casey, P]]);
  });
});

describe('SHARING-171.1', () => {
  test('[SHARING-171.1] lists 20 small requests in one page', async () => {
    const [taylor] = await brisbaneInvitesCasey();
    await applicants(CODE_A, MOST_REQUESTS);

    const { status, body } = await listRequests(taylor, BRISBANE);

    expect(status).toBe(200);
    const page = body as { requests: unknown[]; more: boolean };
    expect(page.requests).toHaveLength(MOST_REQUESTS);
    expect(page.more).toBe(false);
  });

  test('[SHARING-171.1] stops a page before the request that would take it past 262,144 bytes, and goes on after a device ID', async () => {
    const [taylor] = await brisbaneInvitesCasey();
    const sent = new Map<string, Uint8Array>();
    for (let each = 0; each < 6; each += 1) {
      const phone = await registered();
      const content = joinRequest(LARGEST);
      expectRequestAnswered(await sendRequest(phone, CODE_A, content), CODE_A);
      sent.set(phone.deviceId, content);
    }
    const inOrder = [...sent.keys()].sort();
    const listed = (ids: string[]) =>
      ids.map((id): [string, string, Uint8Array] => [
        CODE_A,
        id,
        sent.get(id)!,
      ]);

    const first = await listRequests(taylor, BRISBANE);
    const second = await listAfter(taylor, BRISBANE, inOrder[3]);

    expectRequests(first, listed(inOrder.slice(0, 4)), true);
    expectRequests(second, listed(inOrder.slice(4)));
  });

  test('[SHARING-171.1] lists nothing after the last request, or after a device ID past every request', async () => {
    const { taylor, casey } = await caseyAsked({ sequence: false });

    expectRequests(await listAfter(taylor, BRISBANE, casey), []);
    expectRequests(await listAfter(taylor, BRISBANE, HIGH), []);
    // A device ID before it still lists it.
    expect(
      ((await listAfter(taylor, BRISBANE, LOW)).body as { requests: unknown[] })
        .requests,
    ).toHaveLength(1);
  });
});

describe('SHARING-172.1', () => {
  test('[SHARING-172.1] rejects a request for any member device: its content is gone, and the others stay', async () => {
    const { taylor, casey, P } = await caseyAsked({ sequence: false });
    const other = await registered();
    const Q = joinRequest();
    expectRequestAnswered(await sendRequest(other, CODE_A, Q), CODE_A);

    const answer = await reject(taylor, BRISBANE, casey, P);

    expectRejected(answer, casey);
    expect(await timesStored(P)).toBe(0);
    expect(await timesStored(Q)).toBe(1);
    expectRequests(await listRequests(taylor, BRISBANE), [[CODE_A, other, Q]]);
    expect(await isMemberDevice(BRISBANE, casey)).toBe(false);
  });

  test('[SHARING-172.1] frees the place of the request it rejects', async () => {
    const [taylor] = await brisbaneInvitesCasey();
    const [first] = await applicants(CODE_A, MOST_REQUESTS);
    const late = await registered();
    const held = await contentOf(taylor, first);

    expectRejected(await reject(taylor, BRISBANE, first, held), first);

    expectRequestAnswered(
      await sendRequest(late, CODE_A, joinRequest()),
      CODE_A,
    );
  });

  test('[SHARING-172.1] lets a rejected device ask again', async () => {
    const { taylor, casey, P } = await caseyAsked({ sequence: false });
    expectRejected(await reject(taylor, BRISBANE, casey, P), casey);
    const Q = joinRequest();

    expectRequestAnswered(await sendRequest(casey, CODE_A, Q), CODE_A);

    expectRequests(await listRequests(taylor, BRISBANE), [[CODE_A, casey, Q]]);
  });
});

describe('SHARING-173.2', () => {
  test('[SHARING-173.2] approves a request: it answers with the device and the number of each event, and the request is gone', async () => {
    const { taylor, casey, P, S } = await caseyAsked();
    const approval = approvalOf(P, S);
    setTime(T + 1_000);

    const answer = await approve(taylor, BRISBANE, casey, approval);

    expectApproved(answer, casey, approval, [1]);
    expect(await timesStored(P)).toBe(0);
    expectRequests(await listRequests(taylor, BRISBANE), []);
  });

  test('[SHARING-173.2] makes the device a member device that gets its snapshot and the events of the approval', async () => {
    const { taylor, casey, P, S } = await caseyAsked();
    const approval = approvalOf(P, S);
    expect(await isMemberDevice(BRISBANE, casey)).toBe(false);
    setTime(T + 1_000);
    expectApproved(
      await approve(taylor, BRISBANE, casey, approval),
      casey,
      approval,
      [1],
    );

    expectWaiting(await ask(casey, BRISBANE), S);
    expectPage(await download(casey, BRISBANE, 0), {
      events: [
        relayed(approval.events[0], { sequence: 1, by: taylor, at: T + 1_000 }),
      ],
      more: false,
    });
  });

  test("[SHARING-173.2] records the device's progress at the number the snapshot covers", async () => {
    const { taylor, casey, P, S } = await caseyAsked({
      events: 3,
      sequence: 2,
    });
    const approval = approvalOf(P, S, { cursor: 3 });
    setTime(T + 1_000);

    expectApproved(
      await approve(taylor, BRISBANE, casey, approval),
      casey,
      approval,
      [4],
    );

    expect(await rowsHolding(BRISBANE, casey.deviceId, 2, T + 1_000)).toBe(1);
    // Taylor's phone has every event; only the new device holds the group's events back.
    await reach(taylor, 4);
    await cleanUpAt(T + 2_000);
    expectPage(await download(casey, BRISBANE, 2), {
      events: [
        expect.objectContaining({ sequence: 3 }),
        relayed(approval.events[0], { sequence: 4, by: taylor, at: T + 1_000 }),
      ],
      more: false,
    } as never);
  });

  test('[SHARING-173.2] stores every event of an approval that carries several, in its order', async () => {
    const { taylor, casey, P, S } = await caseyAsked();
    const approval = approvalOf(P, S, { events: events(3) });

    expectApproved(
      await approve(taylor, BRISBANE, casey, approval),
      casey,
      approval,
      [1, 2, 3],
    );

    expect((await everyEvent(taylor, BRISBANE)).map(({ id }) => id)).toEqual(
      approval.events.map(({ id }) => id),
    );
  });

  test('[SHARING-173.2] lets a device that was approved approve another', async () => {
    const { taylor, casey, P, S } = await caseyAsked();
    expect(
      (await approve(taylor, BRISBANE, casey, approvalOf(P, S))).status,
    ).toBe(200);
    const other = await registered();
    const Q = joinRequest();
    expectRequestAnswered(await sendRequest(other, CODE_A, Q), CODE_A);
    const S2 = snapshotOf(casey, other, { sequence: 1 });
    await uploadAll(BRISBANE, S2);
    const approval = approvalOf(Q, S2, { cursor: 1 });

    expectApproved(
      await approve(casey, BRISBANE, other, approval),
      other,
      approval,
      [2],
    );
    expect(await isMemberDevice(BRISBANE, other)).toBe(true);
  });
});

describe('SHARING-174.1', () => {
  test('[SHARING-174.1] refuses to approve or reject a request that was rejected', async () => {
    const { taylor, casey, P, S } = await caseyAsked();
    expectRejected(await reject(taylor, BRISBANE, casey, P), casey);

    const answers = await leavingGroupsAsTheyWere(async () => [
      await approve(taylor, BRISBANE, casey, approvalOf(P, S)),
      await reject(taylor, BRISBANE, casey, P),
    ]);

    for (const answer of answers) {
      expect(answer).toEqual({ status: 404, body: { error: 'no-request' } });
    }
    expect(await isMemberDevice(BRISBANE, casey)).toBe(false);
  });

  test('[SHARING-174.1] refuses to approve or reject a request that was approved, and stores its events once', async () => {
    const { taylor, casey, P, S } = await caseyAsked();
    const approval = approvalOf(P, S);
    expectApproved(
      await approve(taylor, BRISBANE, casey, approval),
      casey,
      approval,
      [1],
    );

    const answers = await leavingGroupsAsTheyWere(async () => [
      await approve(taylor, BRISBANE, casey, { ...approval, cursor: 1 }),
      await reject(taylor, BRISBANE, casey, P),
    ]);

    for (const answer of answers) expectDecisionRefused(answer, NO_REQUEST);
    expect(await isMemberDevice(BRISBANE, casey)).toBe(true);
    expect(await everyEvent(taylor, BRISBANE)).toHaveLength(1);
  });

  test('[SHARING-174.1] refuses an approval and a rejection that name content the request no longer has', async () => {
    const { taylor, casey, P, S } = await caseyAsked();
    const Q = joinRequest();
    expectRequestAnswered(await sendRequest(casey, CODE_A, Q), CODE_A);

    const stale = await leavingGroupsAsTheyWere(async () => [
      await approve(taylor, BRISBANE, casey, approvalOf(P, S)),
      await reject(taylor, BRISBANE, casey, P),
    ]);

    for (const answer of stale) expectDecisionRefused(answer, NO_REQUEST);
    expect(await timesStored(Q)).toBe(1);
    expect(await isMemberDevice(BRISBANE, casey)).toBe(false);
    expect(
      (await approve(taylor, BRISBANE, casey, approvalOf(Q, S))).status,
    ).toBe(200);
  });

  test.each(['expired', 'was revoked'])(
    '[SHARING-174.1] refuses both once the invite %s',
    async (how) => {
      const { taylor, casey, P, S } = await caseyAsked();
      if (how === 'expired') setTime(T + WEEK);
      else expectRevoked(await revokeInvite(taylor, BRISBANE, CODE_A), CODE_A);

      expectDecisionRefused(
        await approve(taylor, BRISBANE, casey, approvalOf(P, S)),
        NO_REQUEST,
      );
      expectDecisionRefused(
        await reject(taylor, BRISBANE, casey, P),
        NO_REQUEST,
      );
      expect(await isMemberDevice(BRISBANE, casey)).toBe(false);
    },
  );

  test('[SHARING-174.1] refuses both for a device with no request, registered or never seen', async () => {
    const { taylor, P, S } = await caseyAsked();
    const idle = await registered();

    for (const applicant of [idle.deviceId, HIGH]) {
      expectDecisionRefused(
        await approve(taylor, BRISBANE, applicant, approvalOf(P, S)),
        NO_REQUEST,
      );
      expectDecisionRefused(
        await reject(taylor, BRISBANE, applicant, P),
        NO_REQUEST,
      );
    }
  });
});

/**
 * Five groups, each with Taylor's phone and another member device, a server of its own
 * for each of them, and `asking` phones with a request and a complete snapshot each.
 */
async function fiveGroups(asking: number) {
  const taylor = await registered();
  const member = await registered();
  const rounds = [];
  for (let round = 0; round < 5; round += 1) {
    const groupId = randomUUID();
    const code = newCode();
    expectCreated(await createGroup(taylor, groupId), groupId);
    await addMember(groupId, member);
    expect((await putInvite(taylor, groupId, code, card())).status).toBe(200);
    const asked = [];
    for (let each = 0; each < asking; each += 1) {
      const phone = await registered();
      const content = joinRequest();
      expectRequestAnswered(await sendRequest(phone, code, content), code);
      const snapshot = snapshotOf(taylor, phone);
      await uploadAll(groupId, snapshot);
      asked.push({ phone, content, snapshot });
    }
    rounds.push({ groupId, code, asked });
    aMinuteLater();
  }
  return {
    taylor,
    member,
    rounds,
    servers: [await ownServer(), await ownServer()],
  };
}

describe('SHARING-175.1', () => {
  test('[SHARING-175.1] lets exactly one of two members approve one request at the same moment, and stores only its events', async () => {
    const { taylor, member, rounds, servers } = await fiveGroups(1);

    for (const { groupId, asked } of rounds) {
      const [{ phone, content, snapshot }] = asked;
      const approvals = [
        approvalOf(content, snapshot),
        approvalOf(content, snapshot),
      ];

      const answers = await Promise.all(
        [taylor, member].map((approver, index) =>
          callOn(
            servers[index],
            approver,
            approvalRequest(groupId, phone, approvals[index]),
          ),
        ),
      );

      expect(answers.map(({ status }) => status).sort()).toEqual([200, 404]);
      const won = answers.findIndex(({ status }) => status === 200);
      expectApproved(answers[won], phone, approvals[won], [1]);
      expectDecisionRefused(answers[1 - won], NO_REQUEST);
      expect((await everyEvent(taylor, groupId)).map(({ id }) => id)).toEqual([
        approvals[won].events[0].id,
      ]);
      expect(await isMemberDevice(groupId, phone)).toBe(true);
      aMinuteLater();
    }
  });

  test('[SHARING-175.1] lets exactly one of an approval and a rejection of one request through', async () => {
    const { taylor, member, rounds, servers } = await fiveGroups(1);

    for (const { groupId, asked } of rounds) {
      const [{ phone, content, snapshot }] = asked;
      const approval = approvalOf(content, snapshot);

      const [approved, rejected] = await Promise.all([
        callOn(servers[0], taylor, approvalRequest(groupId, phone, approval)),
        callOn(servers[1], member, {
          method: 'DELETE',
          path: `${decisionPath(groupId, phone)}${naming(content)}`,
        }),
      ]);

      expect([approved.status, rejected.status].sort()).toEqual([200, 404]);
      const joined = approved.status === 200;
      expectDecisionRefused(joined ? rejected : approved, NO_REQUEST);
      expect(await isMemberDevice(groupId, phone)).toBe(joined);
      expect(await everyEvent(taylor, groupId)).toHaveLength(joined ? 1 : 0);
      aMinuteLater();
    }
  });
});

describe('SHARING-176.1', () => {
  test('[SHARING-176.1] refuses an approval from a phone that has not every event of the group, and takes it once it has', async () => {
    const { taylor, casey, P, S } = await caseyAsked({ events: 3 });

    const behind = await leavingGroupsAsTheyWere(() =>
      approve(taylor, BRISBANE, casey, approvalOf(P, S, { cursor: 2 })),
    );

    expect(behind).toEqual({ status: 409, body: { error: 'behind' } });
    expect(await timesStored(P)).toBe(1);
    const approval = approvalOf(P, S, { cursor: 3 });
    expectApproved(
      await approve(taylor, BRISBANE, casey, approval),
      casey,
      approval,
      [4],
    );
  });

  test('[SHARING-176.1] lets exactly one of two members approve two requests at the same moment with one cursor', async () => {
    const { taylor, member, rounds, servers } = await fiveGroups(2);

    for (const { groupId, asked } of rounds) {
      const answers = await Promise.all(
        [taylor, member].map((approver, index) =>
          callOn(
            servers[index],
            approver,
            approvalRequest(
              groupId,
              asked[index].phone,
              approvalOf(asked[index].content, asked[index].snapshot),
            ),
          ),
        ),
      );

      expect(answers.map(({ status }) => status).sort()).toEqual([200, 409]);
      const lost = answers.findIndex(({ status }) => status === 409);
      expectDecisionRefused(answers[lost], BEHIND);
      expect(await isMemberDevice(groupId, asked[lost].phone)).toBe(false);
      expect(await isMemberDevice(groupId, asked[1 - lost].phone)).toBe(true);
      expect(await timesStored(asked[lost].content)).toBe(1);
      aMinuteLater();
    }
  });
});

describe('SHARING-177.1', () => {
  test('[SHARING-177.1] refuses an approval that names a snapshot that was never uploaded, or lacks a chunk', async () => {
    const { taylor, casey, P, S } = await caseyAsked({ sequence: false });

    const never = await leavingGroupsAsTheyWere(() =>
      approve(taylor, BRISBANE, casey, approvalOf(P, S)),
    );
    await uploadChunk(BRISBANE, S, 0);
    await uploadChunk(BRISBANE, S, 1);
    const partial = await approve(taylor, BRISBANE, casey, approvalOf(P, S));

    expect(never).toEqual({ status: 404, body: { error: 'no-snapshot' } });
    expectSnapshotRefused(partial, NO_SNAPSHOT);
    expect(await timesStored(P)).toBe(1);
    expect(await isMemberDevice(BRISBANE, casey)).toBe(false);
  });

  test("[SHARING-177.1] refuses an approval that names another device's snapshot, or one that was replaced", async () => {
    const { taylor, casey, P, S } = await caseyAsked();
    const other = await registered();
    const forOther = snapshotOf(taylor, other);
    await uploadAll(BRISBANE, forOther);
    const member = await registered();
    await addMember(BRISBANE, member);
    const S2 = snapshotOf(member, casey);
    await uploadAll(BRISBANE, S2);

    expectSnapshotRefused(
      await approve(taylor, BRISBANE, casey, approvalOf(P, forOther)),
      NO_SNAPSHOT,
    );
    expectSnapshotRefused(
      await approve(taylor, BRISBANE, casey, approvalOf(P, S)),
      NO_SNAPSHOT,
    );
    expect(
      (await approve(taylor, BRISBANE, casey, approvalOf(P, S2))).status,
    ).toBe(200);
  });

  test('[SHARING-177.1] refuses a snapshot that covers less than the group is cleared to, and takes one that covers exactly that', async () => {
    const { taylor, casey, P } = await caseyAsked({
      events: 3,
      sequence: false,
    });
    await reach(taylor, 3);
    await cleanUpAt();
    const short = snapshotOf(taylor, casey, { sequence: 2 });
    await uploadAll(BRISBANE, short);

    const refused = await approve(
      taylor,
      BRISBANE,
      casey,
      approvalOf(P, short, { cursor: 3 }),
    );
    const enough = snapshotOf(taylor, casey, { sequence: 3 });
    await uploadAll(BRISBANE, enough);
    const approval = approvalOf(P, enough, { cursor: 3 });
    const approved = await approve(taylor, BRISBANE, casey, approval);

    expectSnapshotRefused(refused, NO_SNAPSHOT);
    expectApproved(approved, casey, approval, [4]);
  });
});

/** Gives Brisbane member devices until it has `count`. */
async function memberDevices(count: number) {
  for (let have = 1; have < count; have += 1) {
    await addMember(BRISBANE, await registered());
  }
}

describe('SHARING-178.1', () => {
  test('[SHARING-178.1] refuses to admit a 21st member device', async () => {
    const { taylor, casey, P, S } = await caseyAsked();
    await memberDevices(MOST_MEMBER_DEVICES);

    const answer = await leavingGroupsAsTheyWere(() =>
      approve(taylor, BRISBANE, casey, approvalOf(P, S)),
    );

    expect(answer).toEqual({ status: 409, body: { error: 'members-full' } });
    expectDecisionRefused(answer, MEMBERS_FULL);
    expect(await timesStored(P)).toBe(1);
  });

  test('[SHARING-178.1] admits the 20th', async () => {
    const { taylor, casey, P, S } = await caseyAsked();
    await memberDevices(MOST_MEMBER_DEVICES - 1);

    expect(
      (await approve(taylor, BRISBANE, casey, approvalOf(P, S))).status,
    ).toBe(200);

    expect(await isMemberDevice(BRISBANE, casey)).toBe(true);
  });
});

/**
 * Brisbane's events leave 199 bytes of room: 159 events of 65,536 bytes and one more.
 * Casey's phone has its request P, and Taylor's complete snapshot S covers `cursor`.
 */
async function almostFull() {
  const [taylor, casey] = await brisbaneInvitesCasey();
  let stored = 0;
  for (const count of [...Array.from({ length: 22 }, () => 7), 5]) {
    const sent = events(count, LARGEST);
    expectUploaded(
      await upload(taylor, BRISBANE, sent),
      sent,
      sent.map((_, index) => stored + index + 1),
    );
    stored += count;
  }
  aMinuteLater();
  const last = [event(GROUP_LIMIT - stored * LARGEST - 199)];
  expectUploaded(await upload(taylor, BRISBANE, last), last, [stored + 1]);
  const P = joinRequest();
  expectRequestAnswered(await sendRequest(casey, CODE_A, P), CODE_A);
  const S = snapshotOf(taylor, casey, { sequence: stored + 1 });
  await uploadAll(BRISBANE, S);
  return { taylor, casey, P, S, cursor: stored + 1 };
}

describe('SHARING-179.1', () => {
  test("[SHARING-179.1] refuses an approval under another key epoch than the group's, and says which it is", async () => {
    const { taylor, casey, P, S } = await caseyAsked();
    const approval = approvalOf(P, S, { epoch: 2 });

    const answer = await leavingGroupsAsTheyWere(() =>
      approve(taylor, BRISBANE, casey, approval),
    );

    expectGroupRefused(answer, wrongEpoch(1));
    expect(await timesStored(P)).toBe(1);
    expect(await timesStored(bytesOf(approval.events[0].content))).toBe(0);
    expect(await isMemberDevice(BRISBANE, casey)).toBe(false);
  });

  test('[SHARING-179.1] refuses an approval whose events the group has no room for', async () => {
    const { taylor, casey, P, S, cursor } = await almostFull();

    const answer = await leavingGroupsAsTheyWere(() =>
      approve(
        taylor,
        BRISBANE,
        casey,
        approvalOf(P, S, { cursor, events: [event(200)] }),
      ),
    );

    expectGroupRefused(answer, GROUP_FULL);
    expect(await timesStored(P)).toBe(1);
    expect(await isMemberDevice(BRISBANE, casey)).toBe(false);
  });
});

describe('SHARING-180.1', () => {
  test('[SHARING-180.1] refuses a device that is no member device in one way, whether or not the group exists', async () => {
    const { casey, P, S } = await caseyAsked();
    const outsider = await registered();

    const answers = await leavingGroupsAsTheyWere(async () => {
      const all = [];
      for (const groupId of [BRISBANE, TOKYO]) {
        all.push(
          await listRequests(outsider, groupId),
          await approve(outsider, groupId, casey, approvalOf(P, S)),
          await reject(outsider, groupId, casey, P),
        );
      }
      return all;
    });

    for (const answer of answers) expectGroupRefused(answer, NOT_A_MEMBER);
    expect(new Set(answers.map((answer) => JSON.stringify(answer))).size).toBe(
      1,
    );
    expect(await timesStored(P)).toBe(1);
  });

  test('[SHARING-180.1] does not let the device that asked approve itself', async () => {
    const { casey, P, S } = await caseyAsked();

    expectGroupRefused(
      await approve(casey, BRISBANE, casey, approvalOf(P, S)),
      NOT_A_MEMBER,
    );
    expect(await isMemberDevice(BRISBANE, casey)).toBe(false);
  });
});

describe('SHARING-181.1', () => {
  test.each(['9B2F6C1E-8D47-4F3A-B1C5-2E7D90A4F6B8', 'brisbane'])(
    '[SHARING-181.1] refuses the group ID %s as written wrongly',
    async (groupId) => {
      const { taylor, casey, P, S } = await caseyAsked();

      for (const answer of [
        await listRequests(taylor, groupId),
        await approve(taylor, groupId, casey, approvalOf(P, S)),
        await reject(taylor, groupId, casey, P),
      ]) {
        expectRefused(answer, REQUEST);
      }
    },
  );

  test.each(['casey', '7C9E6679-7425-40DE-944B-E07FC1F90AE7'])(
    '[SHARING-181.1] refuses the device ID %s as written wrongly',
    async (deviceId) => {
      const { taylor, P, S } = await caseyAsked();

      expectRefused(
        await approve(taylor, BRISBANE, deviceId, approvalOf(P, S)),
        REQUEST,
      );
      expectRefused(await reject(taylor, BRISBANE, deviceId, P), REQUEST);
    },
  );

  test.each([
    '?after=casey',
    '?after=',
    '?x=1',
    `?after=${CASEY}&x=1`,
    `?after=${CASEY.toUpperCase()}`,
  ])('[SHARING-181.1] refuses to list with the query %s', async (query) => {
    const { taylor } = await caseyAsked({ sequence: false });

    expectRefused(await listRequests(taylor, BRISBANE, query), REQUEST);
  });

  test('[SHARING-181.1] refuses a query on an approval and on a question about the answer', async () => {
    const { taylor, casey, P, S } = await caseyAsked();

    for (const answer of [
      await call(taylor, {
        ...approvalRequest(BRISBANE, casey, approvalOf(P, S)),
        path: `${approvalPath(BRISBANE, casey)}?x=1`,
      }),
      await askResult(casey, CODE_A, '?x=1'),
    ]) {
      expectRefused(answer, REQUEST);
    }
    expect(await timesStored(P)).toBe(1);
  });

  test.each<[string, (hash: string) => string]>([
    ['no query', () => ''],
    ['a query that names nothing', () => '?request='],
    ['a hash of 63 characters', (hash) => `?request=${hash.slice(1)}`],
    ['a hash in capitals', (hash) => `?request=${hash.toUpperCase()}`],
    ['another query', () => '?x=1'],
    ['a second field', (hash) => `?request=${hash}&x=1`],
  ])(
    '[SHARING-181.1] refuses a rejection with %s as written wrongly',
    async (_case, query) => {
      const { taylor, casey, P } = await caseyAsked({ sequence: false });

      expectRefused(
        await reject(taylor, BRISBANE, casey, query(sha256Of(P))),
        REQUEST,
      );

      expect(await timesStored(P)).toBe(1);
      // The rejection itself is one the API takes.
      expectRejected(await reject(taylor, BRISBANE, casey, P), casey);
    },
  );

  test("[SHARING-181.1] refuses a question about an invite's answer whose code is written wrongly", async () => {
    const { casey } = await caseyAsked({ sequence: false });

    for (const code of [
      '3q2-7wEjRWeJq83vEjRWe',
      '3q2-7wEjRWeJq83vEjRWeB',
      'invite',
    ]) {
      expectRefused(await askResult(casey, code), REQUEST);
    }
  });

  const WRONG: [string, (approval: Record<string, unknown>) => unknown][] = [
    ['no body', () => ''],
    ['an empty object', () => ({})],
    ['an array', (approval) => [approval]],
    ['text that is no JSON', () => 'approve'],
    ...[
      'request',
      'cursor',
      'snapshotId',
      'senderKey',
      'epoch',
      'box',
      'events',
    ].map((field): [string, (approval: Record<string, unknown>) => unknown] => [
      `no ${field}`,
      (approval) =>
        Object.fromEntries(
          Object.entries(approval).filter(([name]) => name !== field),
        ),
    ]),
    ['an extra field', (approval) => ({ ...approval, name: 'Casey' })],
    [
      'a request hash of 63 characters',
      (a) => ({ ...a, request: 'a'.repeat(63) }),
    ],
    [
      'a request hash of 65 characters',
      (a) => ({ ...a, request: 'a'.repeat(65) }),
    ],
    ['a request hash in capitals', (a) => ({ ...a, request: 'A'.repeat(64) })],
    ['a request hash that is a number', (a) => ({ ...a, request: 7 })],
    ['a sender key of 31 bytes', (a) => ({ ...a, senderKey: 'ab'.repeat(31) })],
    ['a cursor of -1', (a) => ({ ...a, cursor: -1 })],
    ['a cursor of 1.5', (a) => ({ ...a, cursor: 1.5 })],
    ['a cursor in text', (a) => ({ ...a, cursor: '0' })],
    [
      'a snapshot ID that is no UUID',
      (a) => ({ ...a, snapshotId: 'snapshot' }),
    ],
    ['a key epoch of 0', (a) => ({ ...a, epoch: 0 })],
    ['a box of 40 bytes', (a) => ({ ...a, box: 'ab'.repeat(40) })],
    ['a box of 65,537 bytes', (a) => ({ ...a, box: 'ab'.repeat(65_537) })],
    ['no event', (a) => ({ ...a, events: [] })],
    ['101 events', (a) => ({ ...a, events: events(101, 41) })],
    [
      'two events with one ID',
      (a) => ({ ...a, events: [event(200, LOW), event(200, LOW)] }),
    ],
    ['an event of 40 bytes', (a) => ({ ...a, events: [event(40)] })],
  ];

  test.each(WRONG)(
    '[SHARING-181.1] refuses an approval with %s as written wrongly',
    async (_case, wrong) => {
      const { taylor, casey, P, S } = await caseyAsked();
      const good = approvalOf(P, S);

      const answer = await leavingGroupsAsTheyWere(() =>
        approve(taylor, BRISBANE, casey, wrong({ ...good })),
      );

      expectRefused(answer, REQUEST);
      expect(await timesStored(P)).toBe(1);
      expect(await timesStored('Casey')).toBe(0);
      // The approval itself is one the API takes.
      expect((await approve(taylor, BRISBANE, casey, good)).status).toBe(200);
    },
  );

  test('[SHARING-181.1] refuses a rejection that carries a body', async () => {
    const { taylor, casey, P } = await caseyAsked({ sequence: false });

    expectRefused(await reject(taylor, BRISBANE, casey, P, '{}'), REQUEST);

    expect(await timesStored(P)).toBe(1);
  });

  test("[SHARING-181.1] refuses a cursor past the group's last sequence number as written wrongly, not as behind", async () => {
    const { taylor, casey, P, S } = await caseyAsked({ events: 3 });

    expectRefused(
      await approve(taylor, BRISBANE, casey, approvalOf(P, S, { cursor: 4 })),
      REQUEST,
    );
  });
});

describe('SHARING-182.2', () => {
  test('[SHARING-182.2] refuses a request that is not signed, or signed by a device that has not registered, for its signature', async () => {
    const { casey, P, S } = await caseyAsked();
    const stranger = newPhone();
    const inputs = [
      { path: requestsPath(BRISBANE) },
      approvalRequest(BRISBANE, casey, approvalOf(P, S)),
      {
        method: 'DELETE',
        path: `${decisionPath(BRISBANE, casey)}${naming(P)}`,
      },
      { path: requestPath(CODE_A) },
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

  test('[SHARING-182.2] names how a request is written before whether its sender is a member device', async () => {
    const { casey } = await caseyAsked();
    const outsider = await registered();

    expectRefused(await approve(outsider, BRISBANE, casey, {}), REQUEST);
    expectRefused(
      await call(outsider, {
        method: 'DELETE',
        path: `${decisionPath(BRISBANE, casey)}?x=1`,
      }),
      REQUEST,
    );
  });

  test('[SHARING-182.2] names that the sender is no member device before whether the request exists', async () => {
    const { P, S } = await caseyAsked();
    const outsider = await registered();
    const idle = await registered();

    expectGroupRefused(
      await approve(outsider, BRISBANE, idle, approvalOf(P, S)),
      NOT_A_MEMBER,
    );
  });

  test('[SHARING-182.2] names a missing request first, then a phone that is behind, the key epoch, the snapshot, and the member devices', async () => {
    const { taylor, casey, P, S } = await caseyAsked({ events: 3 });
    await memberDevices(MOST_MEMBER_DEVICES);
    const unknown = { id: randomUUID() };
    const idle = await registered();
    const worst = approvalOf(P, unknown, { cursor: 2, epoch: 2 });

    const reasons = [
      await approve(taylor, BRISBANE, idle, worst),
      await approve(taylor, BRISBANE, casey, worst),
      await approve(taylor, BRISBANE, casey, { ...worst, cursor: 3 }),
      await approve(taylor, BRISBANE, casey, { ...worst, cursor: 3, epoch: 1 }),
      await approve(taylor, BRISBANE, casey, {
        ...worst,
        cursor: 3,
        epoch: 1,
        snapshotId: S.id,
      }),
    ].map(({ body }) => (body as { error: string }).error);

    expect(reasons).toEqual([
      'no-request',
      'behind',
      'epoch',
      'no-snapshot',
      'members-full',
    ]);
    expect(await timesStored(P)).toBe(1);
  });

  test('[SHARING-182.2] names a cursor past the last sequence number before a missing request', async () => {
    const { taylor, casey, P, S } = await caseyAsked({ events: 3 });
    expectRejected(await reject(taylor, BRISBANE, casey, P), casey);

    expectRefused(
      await approve(taylor, BRISBANE, casey, approvalOf(P, S, { cursor: 4 })),
      REQUEST,
    );
  });

  test('[SHARING-182.2] names the member devices before the room for events', async () => {
    const { taylor, casey, P, S, cursor } = await almostFull();
    await memberDevices(MOST_MEMBER_DEVICES);

    const answer = await leavingGroupsAsTheyWere(() =>
      approve(
        taylor,
        BRISBANE,
        casey,
        approvalOf(P, S, { cursor, events: [event(200)] }),
      ),
    );

    expectDecisionRefused(answer, MEMBERS_FULL);
    expect(await timesStored(P)).toBe(1);
  });

  test('[SHARING-182.2] has taken a request it refuses: sent again as it is, it is a replay', async () => {
    const { taylor, P } = await caseyAsked({ sequence: false });
    const idle = await registered();
    const request = signedBy(taylor, {
      method: 'DELETE',
      path: `${decisionPath(BRISBANE, idle)}${naming(P)}`,
    });

    expectDecisionRefused(await send(request), NO_REQUEST);

    expectRefused(await send(request), { error: 'replayed' });
  });
});

describe('SHARING-117.2', () => {
  test.each([
    '',
    ', once the invite is revoked',
    ', once the invite has expired',
  ])(
    '[SHARING-117.2] refuses the cancellation of a device that was approved%s: it is a member already',
    async (how) => {
      const { taylor, casey, P, S } = await caseyAsked();
      const approval = approvalOf(P, S);
      expect((await approve(taylor, BRISBANE, casey, approval)).status).toBe(
        200,
      );
      if (how.includes('revoked')) {
        expectRevoked(await revokeInvite(taylor, BRISBANE, CODE_A), CODE_A);
      }
      if (how.includes('expired')) setTime(T + WEEK);

      const answer = await leavingGroupsAsTheyWere(() =>
        cancelRequest(casey, CODE_A),
      );

      expect(answer).toEqual({ status: 409, body: ALREADY_A_MEMBER });
      expect(await isMemberDevice(BRISBANE, casey)).toBe(true);
      expectHandover(
        await askResult(casey, CODE_A),
        BRISBANE,
        taylor,
        approval,
      );
    },
  );
});

describe('SHARING-188.1', () => {
  test('[SHARING-188.1] lets exactly one of an approval and a new content for the same request through', async () => {
    const { taylor, rounds, servers } = await fiveGroups(1);

    for (const { groupId, code, asked } of rounds) {
      const [{ phone, content, snapshot }] = asked;
      const Q = joinRequest();

      const [approved, resent] = await Promise.all([
        callOn(
          servers[0],
          taylor,
          approvalRequest(groupId, phone, approvalOf(content, snapshot)),
        ),
        callOn(servers[1], phone, {
          method: 'PUT',
          path: requestPath(code),
          body: requestBody(Q),
        }),
      ]);

      const joined = approved.status === 200;
      if (joined) {
        expect(resent).toEqual({ status: 409, body: ALREADY_A_MEMBER });
        expect(await timesStored(Q)).toBe(0);
      } else {
        expectDecisionRefused(approved, NO_REQUEST);
        expectRequestAnswered(resent, code);
        expect(await timesStored(Q)).toBe(1);
      }
      expect(await timesStored(content)).toBe(0);
      expect(await isMemberDevice(groupId, phone)).toBe(joined);
      expect(await everyEvent(taylor, groupId)).toHaveLength(joined ? 1 : 0);
      aMinuteLater();
    }
  });

  test('[SHARING-188.1] lets exactly one of an approval and a cancellation of the same request through', async () => {
    const { taylor, rounds, servers } = await fiveGroups(1);

    for (const { groupId, code, asked } of rounds) {
      const [{ phone, content, snapshot }] = asked;

      const [approved, cancelled] = await Promise.all([
        callOn(
          servers[0],
          taylor,
          approvalRequest(groupId, phone, approvalOf(content, snapshot)),
        ),
        callOn(servers[1], phone, {
          method: 'DELETE',
          path: requestPath(code),
        }),
      ]);

      const joined = approved.status === 200;
      if (joined) {
        expect(cancelled).toEqual({ status: 409, body: ALREADY_A_MEMBER });
      } else {
        expectDecisionRefused(approved, NO_REQUEST);
        expectRequestAnswered(cancelled, code);
      }
      expect(await timesStored(content)).toBe(0);
      expect(await isMemberDevice(groupId, phone)).toBe(joined);
      aMinuteLater();
    }
  });
});

describe('SHARING-183.1', () => {
  test('[SHARING-183.1] tells a device whose request waits that it waits, and changes nothing', async () => {
    const { casey, P } = await caseyAsked({ sequence: false });

    const answer = await leavingGroupsAsTheyWere(() =>
      askResult(casey, CODE_A),
    );

    expect(answer).toEqual({ status: 200, body: { state: 'waiting' } });
    expect(answer).toEqual(WAITING);
    expect(await timesStored(P)).toBe(1);
    const headers = await answerHeaders(casey, { path: requestPath(CODE_A) });
    expect(headers.get('cache-control')).toBe('no-store');
  });

  test('[SHARING-183.1] answers a device that never asked, one that cancelled and one that was rejected in one way', async () => {
    const { taylor, casey, P } = await caseyAsked({ sequence: false });
    const idle = await registered();
    const cancelled = await registered();
    expectRequestAnswered(
      await sendRequest(cancelled, CODE_A, joinRequest()),
      CODE_A,
    );
    expectRequestAnswered(await cancelRequest(cancelled, CODE_A), CODE_A);
    expectRejected(await reject(taylor, BRISBANE, casey, P), casey);

    const answers = [
      await askResult(idle, CODE_A),
      await askResult(cancelled, CODE_A),
      await askResult(casey, CODE_A),
    ];

    for (const answer of answers) {
      expect(answer).toEqual({ status: 200, body: { state: 'none' } });
      expect(answer).toEqual(NONE);
    }
  });

  test('[SHARING-183.1] gives an approved device its handover, every time it asks', async () => {
    const { taylor, casey, P, S } = await caseyAsked();
    const approval = approvalOf(P, S);
    expect((await approve(taylor, BRISBANE, casey, approval)).status).toBe(200);

    const first = await askResult(casey, CODE_A);
    const second = await leavingGroupsAsTheyWere(() =>
      askResult(casey, CODE_A),
    );

    expect(first).toEqual({
      status: 200,
      body: {
        state: 'approved',
        groupId: BRISBANE,
        deviceId: taylor.deviceId,
        senderKey: approval.senderKey,
        epoch: 1,
        box: approval.box,
      },
    });
    expectHandover(second, BRISBANE, taylor, approval);
  });

  test.each(['is revoked', 'expires'])(
    '[SHARING-183.1] still gives the handover after the invite %s',
    async (how) => {
      const { taylor, casey, P, S } = await caseyAsked();
      const approval = approvalOf(P, S);
      expect((await approve(taylor, BRISBANE, casey, approval)).status).toBe(
        200,
      );
      if (how === 'expires') setTime(T + WEEK);
      else expectRevoked(await revokeInvite(taylor, BRISBANE, CODE_A), CODE_A);

      expectHandover(
        await askResult(casey, CODE_A),
        BRISBANE,
        taylor,
        approval,
      );
    },
  );

  test('[SHARING-183.1] answers a revoked invite, an expired one and a code it has never seen in one way', async () => {
    const { taylor, casey } = await caseyAsked({ sequence: false });
    await tokyoInvites(taylor);
    expectRequestAnswered(
      await sendRequest(casey, CODE_B, joinRequest()),
      CODE_B,
    );
    expectRevoked(await revokeInvite(taylor, TOKYO, CODE_B), CODE_B);
    setTime(T + WEEK);

    const answers = [
      await askResult(casey, CODE_A),
      await askResult(casey, CODE_B),
      await askResult(casey, CODE_C),
    ];

    for (const answer of answers) {
      expect(answer).toEqual({ status: 404, body: NO_INVITE });
    }
  });

  test('[SHARING-183.1] tells a member device of the group that it is a member already', async () => {
    const { taylor } = await caseyAsked({ sequence: false });

    expect(await askResult(taylor, CODE_A)).toEqual({
      status: 409,
      body: ALREADY_A_MEMBER,
    });
  });

  test.each(['is revoked', 'expires'])(
    '[SHARING-183.1] tells a member device that an invite that %s names no invite, not that it is a member',
    async (how) => {
      const { taylor } = await caseyAsked({ sequence: false });
      if (how === 'expires') setTime(T + WEEK);
      else expectRevoked(await revokeInvite(taylor, BRISBANE, CODE_A), CODE_A);

      expect(await askResult(taylor, CODE_A)).toEqual({
        status: 404,
        body: NO_INVITE,
      });
    },
  );

  test("[SHARING-183.1] answers for each invite by itself: approved under one, nothing under another group's", async () => {
    const { taylor, casey, P, S } = await caseyAsked();
    expect(
      (await approve(taylor, BRISBANE, casey, approvalOf(P, S))).status,
    ).toBe(200);
    await tokyoInvites(taylor);

    expect(await askResult(casey, CODE_B)).toEqual(NONE);
  });
});

describe('SHARING-185.1', () => {
  test("[SHARING-185.1] forgets the handover once the device has downloaded a page of the group's events", async () => {
    const { taylor, casey, P, S } = await caseyAsked();
    const approval = approvalOf(P, S);
    expect((await approve(taylor, BRISBANE, casey, approval)).status).toBe(200);
    expect(await timesStored(bytesOf(approval.box))).toBe(1);

    expect((await download(casey, BRISBANE, 0)).status).toBe(200);

    expect(await timesStored(bytesOf(approval.box))).toBe(0);
    expect(await timesStored(bytesOf(approval.senderKey))).toBe(0);
    expect(await askResult(casey, CODE_A)).toEqual({
      status: 409,
      body: ALREADY_A_MEMBER,
    });
  });

  test("[SHARING-185.1] keeps the handover through another device's download, the device's own upload and a download that is refused", async () => {
    const { taylor, casey, P, S } = await caseyAsked();
    const approval = approvalOf(P, S);
    expect((await approve(taylor, BRISBANE, casey, approval)).status).toBe(200);

    expect((await download(taylor, BRISBANE, 0)).status).toBe(200);
    expect((await upload(casey, BRISBANE, events(1))).status).toBe(200);
    expectRefused(
      await call(casey, { path: `/groups/${BRISBANE}/events` }),
      REQUEST,
    );

    expect(await timesStored(bytesOf(approval.box))).toBe(1);
    expectHandover(await askResult(casey, CODE_A), BRISBANE, taylor, approval);
  });
});

describe('SHARING-185.1', () => {
  test('[SHARING-185.1] keeps the handover when the device is told that it needs a snapshot', async () => {
    const { taylor, casey, P, S } = await caseyAsked();
    const approval = approvalOf(P, S);
    expectApproved(
      await approve(taylor, BRISBANE, casey, approval),
      casey,
      approval,
      [1],
    );
    await reach(taylor, 1);
    await cleanUpAt(T + THIRTY_DAYS + 1);

    expectSnapshotNeeded(await download(casey, BRISBANE, 0));

    expect(await timesStored(bytesOf(approval.box))).toBe(1);
    expectHandover(await askResult(casey, CODE_A), BRISBANE, taylor, approval);
  });
});

describe('SHARING-186.1', () => {
  test('[SHARING-186.1] keeps the box, the sender key and the events of an approval once each, and neither the request nor its hash nor other headers', async () => {
    const { taylor, casey, P, S } = await caseyAsked();
    const approval = approvalOf(P, S);

    const answer = await call(
      taylor,
      approvalRequest(BRISBANE, casey, approval),
      { 'User-Agent': 'TaylorsPhone/1.0', 'X-Member-Name': 'Casey-Lee' },
    );

    expect(answer.status).toBe(200);
    expect(await timesStored(bytesOf(approval.box))).toBe(1);
    expect(await timesStored(bytesOf(approval.senderKey))).toBe(1);
    expect(await timesStored(bytesOf(approval.events[0].content))).toBe(1);
    expect(await timesStored(P)).toBe(0);
    expect(await timesStored(bytesOf(sha256Of(P)))).toBe(0);
    expect(await timesStored('TaylorsPhone')).toBe(0);
    expect(await timesStored('Casey-Lee')).toBe(0);
  });

  test('[SHARING-186.1] keeps nothing of an approval it refuses', async () => {
    const { taylor, casey, P, S } = await caseyAsked({ events: 3 });
    const behind = approvalOf(P, S, { cursor: 0 });
    const noSnapshot = approvalOf(P, { id: randomUUID() }, { cursor: 3 });

    expectDecisionRefused(
      await approve(taylor, BRISBANE, casey, behind),
      BEHIND,
    );
    expectSnapshotRefused(
      await approve(taylor, BRISBANE, casey, noSnapshot),
      NO_SNAPSHOT,
    );

    for (const { box, senderKey, events: sent } of [behind, noSnapshot]) {
      expect(await timesStored(bytesOf(box))).toBe(0);
      expect(await timesStored(bytesOf(senderKey))).toBe(0);
      expect(await timesStored(bytesOf(sent[0].content))).toBe(0);
    }
  });

  test('[SHARING-186.1] keeps nothing of a rejection', async () => {
    const { taylor, casey, P } = await caseyAsked({ sequence: false });
    const before = await databaseContents();
    const request = signedBy(taylor, {
      method: 'DELETE',
      path: `${decisionPath(BRISBANE, casey)}${naming(P)}`,
    });

    expectRejected(await send(request), casey);

    const added = [...(await valuesAddedSince(before))].filter(
      (value) => !String(value).includes(fieldOf(request, 'nonce')),
    );
    // What the API added is the record of the request it accepted: its times.
    expect(added.every((value) => /^(bigint:)?\d+$/.test(String(value)))).toBe(
      true,
    );
    expect(await timesStored(P)).toBe(0);
    expect(await timesStored(bytesOf(sha256Of(P)))).toBe(0);
    expect(await timesStored(sha256Of(P))).toBe(0);
  });
});

describe('SHARING-187.1', () => {
  test('[SHARING-187.1] answers "not found" to every other method on the three paths, and changes nothing', async () => {
    const { taylor, casey, P, S } = await caseyAsked();
    const body = JSON.stringify(approvalOf(P, S));

    const answers = await leavingGroupsAsTheyWere(async () => [
      await call(taylor, { method: 'HEAD', path: requestsPath(BRISBANE) }),
      await call(taylor, {
        method: 'POST',
        path: requestsPath(BRISBANE),
        body,
      }),
      await call(taylor, { method: 'DELETE', path: requestsPath(BRISBANE) }),
      await call(taylor, { path: decisionPath(BRISBANE, casey) }),
      await call(taylor, {
        method: 'HEAD',
        path: decisionPath(BRISBANE, casey),
      }),
      await call(taylor, {
        method: 'PUT',
        path: decisionPath(BRISBANE, casey),
        body,
      }),
      await call(taylor, {
        method: 'POST',
        path: decisionPath(BRISBANE, casey),
        body,
      }),
      await call(taylor, { path: approvalPath(BRISBANE, casey) }),
      await call(taylor, {
        method: 'HEAD',
        path: approvalPath(BRISBANE, casey),
      }),
      await call(taylor, {
        method: 'DELETE',
        path: approvalPath(BRISBANE, casey),
      }),
      await call(taylor, {
        method: 'PUT',
        path: approvalPath(BRISBANE, casey),
        body,
      }),
    ]);

    expect(answers).toHaveLength(11);
    for (const answer of answers) {
      expect(answer.status).toBe(404);
      expect(answer.body).not.toEqual(NO_REQUEST);
      expect(answer.body).not.toEqual(NO_INVITE);
    }
    expect(await timesStored(P)).toBe(1);
    expect(await isMemberDevice(BRISBANE, casey)).toBe(false);
  });
});
