import {
  CASEY,
  T,
  TAYLOR,
  expectPassed,
  expectRefused,
  newPhone,
  registered,
  send,
  setTime,
  signedBy,
  type Answer,
  type Phone,
} from './sharing-api';
import { leave } from './sharing-removal-api';
import {
  BRISBANE,
  NOT_A_MEMBER,
  REQUEST,
  TOKYO,
  addMember,
  answerHeaders,
  call,
  createGroup,
  download,
  downloadWith,
  events,
  expectCreated,
  expectGroupRefused,
  expectUploaded,
  leavingGroupsAsTheyWere,
  rowsHolding,
  upload,
  useSyncApi,
} from './sync-api';

// What a member device is told about when each member device of its group last synced
// (ADR-0045): the time of the progress the API already records for a download that got
// a page (SYNC-58.1). The tests run in the world of the sync tests.

useSyncApi();

/** Two more phones of the scenarios; their device IDs sort after Taylor's and Casey's. */
const DANA = 'c9bf9e57-1685-4c89-bafb-ff5af830be8a';
const BLAKE = 'e7f3a6c2-4b1d-4f8a-9c3e-5d6b7a8c9d0e';

const devicesPath = (groupId: string, query = '') =>
  `/groups/${groupId}/devices${query}`;

/** `phone` asks when the group's member devices last synced. */
const listDevices = (phone: Phone, groupId: string, query = '') =>
  call(phone, { path: devicesPath(groupId, query) });

/** The answer lists exactly these devices with these times, in this order, and nothing else of them. */
function expectDevices(
  answer: Answer,
  devices: [deviceId: string, syncedAtMs: number | null][],
) {
  expect(answer).toEqual({
    status: 200,
    body: {
      devices: devices.map(([deviceId, syncedAtMs]) => ({
        deviceId,
        syncedAtMs,
      })),
    },
  });
}

/**
 * Brisbane with the member devices of Taylor, Casey and Dana: Taylor's downloaded at
 * T+1,000 and Casey's at T+2,000, both from cursor 0, and Dana's never has.
 */
async function threeInBrisbane() {
  const taylor = await registered(TAYLOR);
  const casey = await registered(CASEY);
  const dana = await registered(DANA);
  expectCreated(await createGroup(taylor, BRISBANE), BRISBANE);
  await addMember(BRISBANE, casey);
  await addMember(BRISBANE, dana);
  setTime(T + 1_000);
  expect((await download(taylor, BRISBANE, 0)).status).toBe(200);
  setTime(T + 2_000);
  expect((await download(casey, BRISBANE, 0)).status).toBe(200);
  return { taylor, casey, dana };
}

describe('SYNC-310.1', () => {
  test('[SYNC-310.1] lists every member device of the group by device ID, each with the time of its progress or null, and the device that asks among them', async () => {
    const { taylor } = await threeInBrisbane();

    setTime(T + 3_000);
    const answer = await listDevices(taylor, BRISBANE);

    expectDevices(answer, [
      [TAYLOR, T + 1_000],
      [CASEY, T + 2_000],
      [DANA, null],
    ]);
    expect(T + 1_000).toBe(1794983521000);
  });

  test('[SYNC-310.1] answers with Cache-Control: no-store', async () => {
    const { taylor } = await threeInBrisbane();

    const headers = await answerHeaders(taylor, {
      path: devicesPath(BRISBANE),
    });

    expect(headers.get('cache-control')).toBe('no-store');
  });

  test("[SYNC-310.1] gives a device's latest download that got a page", async () => {
    const { taylor, casey } = await threeInBrisbane();

    setTime(T + 4_000);
    expect((await download(casey, BRISBANE, 0)).status).toBe(200);

    expectDevices(await listDevices(taylor, BRISBANE), [
      [TAYLOR, T + 1_000],
      [CASEY, T + 4_000],
      [DANA, null],
    ]);
  });

  test("[SYNC-310.1] an upload and a refused download do not move a device's time", async () => {
    const { taylor, casey } = await threeInBrisbane();

    setTime(T + 5_000);
    const sent = events(1);
    expectUploaded(await upload(casey, BRISBANE, sent), sent, [1]);
    setTime(T + 6_000);
    expectRefused(await downloadWith(casey, BRISBANE, ''), REQUEST);

    expectDevices(await listDevices(taylor, BRISBANE), [
      [TAYLOR, T + 1_000],
      [CASEY, T + 2_000],
      [DANA, null],
    ]);
  });

  test("[SYNC-310.1] asking is not syncing: it leaves every device's progress as it was, the asking device's too", async () => {
    const { taylor, casey } = await threeInBrisbane();

    setTime(T + 9_000);
    const answers = await leavingGroupsAsTheyWere(async () => [
      await listDevices(taylor, BRISBANE),
      await listDevices(casey, BRISBANE),
    ]);

    for (const answer of answers) {
      expectDevices(answer, [
        [TAYLOR, T + 1_000],
        [CASEY, T + 2_000],
        [DANA, null],
      ]);
    }
    expect(await rowsHolding(BRISBANE, TAYLOR, 0, T + 1_000)).toBe(1);
    expect(await rowsHolding(BRISBANE, TAYLOR, T + 9_000)).toBe(0);
  });

  test("[SYNC-310.1] lists only the group's own member devices, each with its time in that group", async () => {
    const { taylor } = await threeInBrisbane();
    const blake = await registered(BLAKE);
    expectCreated(await createGroup(taylor, TOKYO), TOKYO);
    await addMember(TOKYO, blake);
    setTime(T + 7_000);
    expect((await download(taylor, TOKYO, 0)).status).toBe(200);

    expectDevices(await listDevices(taylor, BRISBANE), [
      [TAYLOR, T + 1_000],
      [CASEY, T + 2_000],
      [DANA, null],
    ]);
    expectDevices(await listDevices(taylor, TOKYO), [
      [TAYLOR, T + 7_000],
      [BLAKE, null],
    ]);
  });

  test('[SYNC-310.1] leaves out a device that left, and still answers while the group needs a rotation', async () => {
    const { taylor, casey } = await threeInBrisbane();

    expect((await leave(casey, BRISBANE)).status).toBe(200);

    expectDevices(await listDevices(taylor, BRISBANE), [
      [TAYLOR, T + 1_000],
      [DANA, null],
    ]);
  });
});

describe('SYNC-311.1', () => {
  test.each([
    ['a group ID in capitals', devicesPath(BRISBANE.toUpperCase())],
    ['a group ID that is no UUID', devicesPath('brisbane')],
    ['a query', devicesPath(BRISBANE, '?x=1')],
    ['a cursor', devicesPath(BRISBANE, '?after=0')],
  ])(
    '[SYNC-311.1] refuses a request with %s: the request is wrong',
    async (_case, path) => {
      const { taylor } = await threeInBrisbane();

      const answer = await leavingGroupsAsTheyWere(() =>
        call(taylor, { path }),
      );

      expectRefused(answer, REQUEST);
    },
  );

  test('[SYNC-311.1] refuses a device that is no member device of the group, and any device for a group nobody created, as a download is refused', async () => {
    const { taylor } = await threeInBrisbane();
    const blake = await registered(BLAKE);

    const answers = await leavingGroupsAsTheyWere(async () => [
      await listDevices(blake, BRISBANE),
      await listDevices(taylor, TOKYO),
    ]);

    for (const answer of answers) expectGroupRefused(answer, NOT_A_MEMBER);
    expect(answers[0]).toEqual(await download(blake, BRISBANE, 0));
  });

  test('[SYNC-311.1] refuses a device that left the group', async () => {
    const { casey } = await threeInBrisbane();
    expect((await leave(casey, BRISBANE)).status).toBe(200);

    expectGroupRefused(await listDevices(casey, BRISBANE), NOT_A_MEMBER);
  });

  test('[SYNC-311.1] says the request is wrong before it says who is no member', async () => {
    await threeInBrisbane();
    const blake = await registered(BLAKE);

    expectRefused(await listDevices(blake, BRISBANE, '?x=1'), REQUEST);
  });

  test('[SYNC-311.1] refuses a request that is not signed, or signed by a phone that never registered, for its signature', async () => {
    const { taylor } = await threeInBrisbane();
    const signed = signedBy(taylor, { path: devicesPath(BRISBANE) });

    const answers = await leavingGroupsAsTheyWere(async () => [
      await send({ ...signed, headers: {} }),
      await call(newPhone(), { path: devicesPath(BRISBANE) }),
    ]);

    for (const answer of answers) {
      expectRefused(answer, { error: 'signature' });
    }
  });
});

describe('SYNC-312.1', () => {
  test.each(['HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'])(
    '[SYNC-312.1] answers "not found" to a %s on the path, and changes nothing',
    async (method) => {
      const { taylor } = await threeInBrisbane();

      const answer = await leavingGroupsAsTheyWere(() =>
        call(taylor, { method, path: devicesPath(BRISBANE) }),
      );

      expectPassed(answer);
      expect(await rowsHolding(BRISBANE, TAYLOR, 0, T + 1_000)).toBe(1);
    },
  );
});
