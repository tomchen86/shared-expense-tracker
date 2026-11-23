import {
  CONTINUE_STATUS,
  SNAPSHOT_NEEDED_BY_HEADER,
  isContinueResponse,
  type EventsPageResponse,
} from '@shared-expense/domain/api';
import {
  T,
  expectRefused,
  registered,
  serverUrl,
  setTime,
  signedBy,
  type Phone,
} from './sharing-api';
import {
  bothInBrisbane,
  taylorWithBrisbaneAndCasey,
} from './sharing-invites-api';
import {
  BRISBANE,
  EMPTY_PAGE,
  NOT_A_MEMBER,
  REQUEST,
  TOKYO,
  addMember,
  answerHeaders,
  createGroup,
  download,
  event,
  events,
  eventsPath,
  expectCreated,
  expectGroupRefused,
  expectUploaded,
  rowsHolding,
  upload,
  useSyncApi,
} from './sync-api';
import {
  DAY,
  THIRTY_DAYS,
  cleanUpAt,
  expectSnapshotNeeded,
  store,
} from './sync-cleanup-api';
import {
  NO_SNAPSHOT,
  ask,
  expectSnapshotRefused,
  expectStored,
  expectWaiting,
  snapshotOf,
  uploadAll,
  uploadChunk,
} from './sync-snapshot-api';

// How a phone that is behind its group's cleared events gets a snapshot (ADR-0034): the
// API remembers which member devices it told that they need one, or that it stores none
// for them, and names them to every member device that gets a page, in a header of that
// page's answer, until the group stores a snapshot such a device can go on from. Where no
// member device could make that snapshot, the API tells the phone that holds the most to
// go on from the number the group is cleared to.

useSyncApi();

interface Downloaded {
  status: number;
  body: unknown;
  /** The header that lists the devices a snapshot is needed by; null when the answer has none. */
  neededBy: string | null;
}

/** Downloads the page after `cursor`, and reads the answer's header beside its status and body. */
async function downloadFrom(
  phone: Phone,
  cursor: number,
  groupId = BRISBANE,
): Promise<Downloaded> {
  const request = signedBy(phone, {
    path: `${eventsPath(groupId)}?after=${cursor}`,
  });
  const response = await fetch(`${serverUrl()}${request.path}`, {
    method: request.method,
    headers: request.headers,
  });
  const text = await response.text();
  return {
    status: response.status,
    body: JSON.parse(text) as unknown,
    neededBy: response.headers.get(SNAPSHOT_NEEDED_BY_HEADER),
  };
}

/** The answer is a page with these events, and says who needs a snapshot: nobody when `neededBy` is null. */
function expectPageNaming(
  answer: Downloaded,
  neededBy: string | null,
  page: EventsPageResponse = EMPTY_PAGE,
) {
  expect({ status: answer.status, body: answer.body }).toEqual({
    status: 200,
    body: page,
  });
  expect(answer.neededBy).toBe(neededBy);
}

/** The time the scenarios are at once the group's events are over 30 days old. */
const LATER = T + 31 * DAY;

/**
 * Brisbane with Taylor's and Casey's phones, its five events cleared for their age, at
 * LATER: the group is cleared to 5. Resolves with the two phones.
 */
async function clearedToFive(): Promise<[Phone, Phone]> {
  const phones = await bothInBrisbane();
  await store(phones[0], 5);
  await cleanUpAt(T + THIRTY_DAYS + 1);
  setTime(LATER);
  return phones;
}

/** The same, once Casey's phone has been told at LATER that it needs a snapshot. */
async function caseyWaits(): Promise<[Phone, Phone]> {
  const [taylor, casey] = await clearedToFive();
  expectSnapshotNeeded(await download(casey, BRISBANE, 2));
  return [taylor, casey];
}

describe('SYNC-162.1', () => {
  test('[SYNC-162.1] a page names the member device that was told it needs a snapshot, and that answer itself names nobody', async () => {
    const [taylor, casey] = await clearedToFive();

    const behind = await downloadFrom(casey, 2);
    const level = await downloadFrom(taylor, 5);

    expect(behind).toEqual({
      status: 410,
      body: { error: 'snapshot-needed' },
      neededBy: null,
    });
    expectPageNaming(level, casey.deviceId);
  });

  test('[SYNC-162.1] a page has no such header while no member device waits for a snapshot', async () => {
    const [taylor, casey] = await bothInBrisbane();
    const sent = await store(taylor, 3);
    const page = {
      events: sent.map((each, index) => ({
        id: each.id,
        sequence: index + 1,
        deviceId: taylor.deviceId,
        epoch: 1,
        receivedAtMs: T,
        content: each.content,
      })),
      more: false,
    };

    expectPageNaming(await downloadFrom(taylor, 0), null, page);
    expectPageNaming(await downloadFrom(casey, 0), null, page);

    // Once one of them is told it needs a snapshot, the other's page names it.
    await cleanUpAt(T + THIRTY_DAYS + 1);
    setTime(LATER);
    expectSnapshotNeeded(await download(casey, BRISBANE, 0));
    expectPageNaming(await downloadFrom(taylor, 3), casey.deviceId);
  });

  test('[SYNC-162.1] a device is no longer named once it has got a page', async () => {
    const [taylor, casey] = await caseyWaits();
    expectPageNaming(await downloadFrom(taylor, 5), casey.deviceId);

    expectPageNaming(await downloadFrom(casey, 5), null);

    expectPageNaming(await downloadFrom(taylor, 5), null);
  });

  test('[SYNC-162.1] a device is named until the group stores a complete snapshot for it that covers what the group is cleared to', async () => {
    const [taylor, casey] = await caseyWaits();
    const s = snapshotOf(taylor, casey, { sequence: 5 });

    expectStored(await uploadChunk(BRISBANE, s, 0), s, 0);
    expectPageNaming(await downloadFrom(taylor, 5), casey.deviceId);
    expectStored(await uploadChunk(BRISBANE, s, 1), s, 1);
    expectPageNaming(await downloadFrom(taylor, 5), casey.deviceId);
    expectStored(await uploadChunk(BRISBANE, s, 2), s, 2);

    expectPageNaming(await downloadFrom(taylor, 5), null);
  });

  test('[SYNC-162.1] a snapshot that covers more than the group is cleared to counts as well', async () => {
    const [taylor, casey] = await caseyWaits();
    const sixth = [event()];
    expectUploaded(await upload(taylor, BRISBANE, sixth), sixth, [6]);
    expectPageNaming(await downloadFrom(taylor, 6), casey.deviceId);

    await uploadAll(BRISBANE, snapshotOf(taylor, casey, { sequence: 6 }));

    expectPageNaming(await downloadFrom(taylor, 6), null);
  });

  test('[SYNC-162.1] a device stays named while its snapshot covers less than the group is cleared to', async () => {
    const [taylor, casey] = await caseyWaits();
    await uploadAll(BRISBANE, snapshotOf(taylor, casey, { sequence: 4 }));

    expectPageNaming(await downloadFrom(taylor, 5), casey.deviceId);
  });

  test('[SYNC-162.1] a snapshot for another device does not count', async () => {
    const [taylor, casey] = await caseyWaits();
    await uploadAll(BRISBANE, snapshotOf(taylor, taylor, { sequence: 5 }));

    expectPageNaming(await downloadFrom(taylor, 5), casey.deviceId);
  });

  test('[SYNC-162.1] a device is named for 30 days after it last asked, and again once it asks again', async () => {
    const [taylor, casey] = await caseyWaits();

    setTime(LATER + THIRTY_DAYS);
    expectPageNaming(await downloadFrom(taylor, 5), casey.deviceId);
    setTime(LATER + THIRTY_DAYS + 1);
    expectPageNaming(await downloadFrom(taylor, 5), null);

    expectSnapshotNeeded(await download(casey, BRISBANE, 2));
    expectPageNaming(await downloadFrom(taylor, 5), casey.deviceId);
  });

  test('[SYNC-162.1] names several devices by the time each last asked, the earliest first', async () => {
    const [taylor, casey] = await clearedToFive();
    const other = await registered();
    await addMember(BRISBANE, other);

    expectSnapshotNeeded(await download(other, BRISBANE, 0));
    setTime(LATER + 1_000);
    expectSnapshotNeeded(await download(casey, BRISBANE, 2));

    expectPageNaming(
      await downloadFrom(taylor, 5),
      `${other.deviceId},${casey.deviceId}`,
    );

    // The one that asked first asks again, and is now the later of the two.
    setTime(LATER + 2_000);
    expectSnapshotNeeded(await download(other, BRISBANE, 0));
    expectPageNaming(
      await downloadFrom(taylor, 5),
      `${casey.deviceId},${other.deviceId}`,
    );
  });

  test('[SYNC-162.1] names devices that asked at the same time by device ID, the smaller first', async () => {
    const [taylor, casey] = await clearedToFive();
    const other = await registered();
    await addMember(BRISBANE, other);
    // Whichever of the two asks first: the order is not the order they asked in.
    for (const phone of [casey, other]) {
      expectSnapshotNeeded(await download(phone, BRISBANE, 1));
    }
    const byId = [casey.deviceId, other.deviceId].sort((a, b) =>
      Buffer.compare(Buffer.from(a), Buffer.from(b)),
    );

    expectPageNaming(await downloadFrom(taylor, 5), byId.join(','));
  });

  test('[SYNC-162.1] the device that asks is not named to itself', async () => {
    const [taylor, casey] = await clearedToFive();
    const other = await registered();
    await addMember(BRISBANE, other);
    expectSnapshotNeeded(await download(casey, BRISBANE, 2));
    setTime(LATER + 1_000);
    expectSnapshotNeeded(await download(other, BRISBANE, 0));
    expectPageNaming(
      await downloadFrom(taylor, 5),
      `${casey.deviceId},${other.deviceId}`,
    );

    // Casey's phone gets a page: it is told of the other device, and is no longer waiting itself.
    expectPageNaming(await downloadFrom(casey, 5), other.deviceId);
    expectPageNaming(await downloadFrom(taylor, 5), other.deviceId);
  });

  test('[SYNC-162.1] an upload, a refused download and a cleanup leave a waiting device waiting', async () => {
    const [taylor, casey] = await caseyWaits();
    const sixth = [event()];

    expectUploaded(await upload(casey, BRISBANE, sixth), sixth, [6]);
    expectRefused(await download(casey, BRISBANE, 7), REQUEST);
    await cleanUpAt(LATER);

    const page = await downloadFrom(taylor, 5);
    expect(page.status).toBe(200);
    expect(page.neededBy).toBe(casey.deviceId);
  });

  test('[SYNC-162.1] a group names only its own waiting devices', async () => {
    const [taylor, casey] = await caseyWaits();
    expectCreated(await createGroup(taylor, TOKYO), TOKYO);
    await addMember(TOKYO, casey);

    expectPageNaming(await downloadFrom(taylor, 0, TOKYO), null);
    expectPageNaming(await downloadFrom(taylor, 5), casey.deviceId);
  });

  test('[SYNC-162.1] a member device that has never downloaded is not waiting', async () => {
    const [taylor, casey] = await clearedToFive();

    expectPageNaming(await downloadFrom(taylor, 5), null);

    // It waits from the moment it is told so.
    expectSnapshotNeeded(await download(casey, BRISBANE, 0));
    expectPageNaming(await downloadFrom(taylor, 5), casey.deviceId);
  });

  test('[SYNC-162.1] an upload and the snapshot API answer without the header', async () => {
    const [taylor, casey] = await caseyWaits();
    const sixth = [event()];
    const sign = (path: string, method = 'GET', body?: string) =>
      signedBy(taylor, { method, path, body });
    const headerOf = async (request: ReturnType<typeof signedBy>) => {
      const response = await fetch(`${serverUrl()}${request.path}`, {
        method: request.method,
        headers: request.headers,
        ...(request.body.length > 0 ? { body: request.body } : {}),
      });
      await response.arrayBuffer();
      return response.headers.get(SNAPSHOT_NEEDED_BY_HEADER);
    };

    expect(
      await headerOf(
        sign(
          eventsPath(BRISBANE),
          'POST',
          JSON.stringify({ epoch: 1, events: sixth }),
        ),
      ),
    ).toBeNull();
    expect(await headerOf(sign(`/groups/${BRISBANE}/snapshot`))).toBeNull();
    // A refused download names nobody either.
    expect(await headerOf(sign(`${eventsPath(BRISBANE)}?after=99`))).toBeNull();
    // The page that follows does: the header is the page's alone.
    expect((await downloadFrom(taylor, 5)).neededBy).toBe(casey.deviceId);
  });

  // A member device that does not hold the ledger yet downloads no events, so it is never
  // told that it needs a snapshot: it waits from the answer that there is none for it.
  test('[SYNC-162.1] with [SYNC-108.2] a member device told that the group stores no snapshot for it waits too, until it gets a page', async () => {
    const [taylor, casey] = await bothInBrisbane();
    await store(taylor, 3);
    expectPageNaming(await downloadFrom(taylor, 3), null);

    expectSnapshotRefused(await ask(casey, BRISBANE), NO_SNAPSHOT);

    expectPageNaming(await downloadFrom(taylor, 3), casey.deviceId);
    expect((await downloadFrom(casey, 3)).status).toBe(200);
    expectPageNaming(await downloadFrom(taylor, 3), null);
  });

  test('[SYNC-162.1] with [SYNC-108.2] a device told of a snapshot for it does not wait, also once that snapshot is replaced', async () => {
    const [taylor, casey] = await bothInBrisbane();
    await store(taylor, 3);
    const s = snapshotOf(taylor, casey, { sequence: 3 });
    await uploadAll(BRISBANE, s);

    expectWaiting(await ask(casey, BRISBANE), s);
    // Another snapshot for it begins and replaces S: the group stores no complete one now.
    const s2 = snapshotOf(taylor, casey, { sequence: 3 });
    expectStored(await uploadChunk(BRISBANE, s2, 0), s2, 0);

    expectPageNaming(await downloadFrom(taylor, 3), null);

    // It waits once it asks and is told there is none.
    expectSnapshotRefused(await ask(casey, BRISBANE), NO_SNAPSHOT);
    expectPageNaming(await downloadFrom(taylor, 3), casey.deviceId);
  });

  test('[SYNC-162.1] with [SYNC-108.2] devices told there is no snapshot are named by the time each was last told, for 30 days', async () => {
    const [taylor, casey] = await bothInBrisbane();
    const other = await registered();
    await addMember(BRISBANE, other);
    const both = `${casey.deviceId},${other.deviceId}`;

    setTime(T + 1_000);
    expectSnapshotRefused(await ask(casey, BRISBANE), NO_SNAPSHOT);
    setTime(T + 2_000);
    expectSnapshotRefused(await ask(other, BRISBANE), NO_SNAPSHOT);

    expectPageNaming(await downloadFrom(taylor, 0), both);
    setTime(T + THIRTY_DAYS + 1_000);
    expectPageNaming(await downloadFrom(taylor, 0), both);
    setTime(T + THIRTY_DAYS + 1_001);
    expectPageNaming(await downloadFrom(taylor, 0), other.deviceId);

    // Told again, Casey's phone is named again, now as the later of the two.
    expectSnapshotRefused(await ask(casey, BRISBANE), NO_SNAPSHOT);
    expectPageNaming(
      await downloadFrom(taylor, 0),
      `${other.deviceId},${casey.deviceId}`,
    );
  });

  test('[SYNC-162.1] with [SYNC-108.2] the answer that there is no snapshot leaves the device’s progress as it was', async () => {
    const [taylor, casey] = await bothInBrisbane();
    await store(taylor, 3);
    setTime(T + 1_000);
    expect((await downloadFrom(casey, 2)).status).toBe(200);

    setTime(T + 2_000);
    expectSnapshotRefused(await ask(casey, BRISBANE), NO_SNAPSHOT);

    expect(await rowsHolding(BRISBANE, casey.deviceId, 2, T + 1_000)).toBe(1);
    // And it waits from that answer: the page it got before does not undo it.
    expectPageNaming(await downloadFrom(taylor, 3), casey.deviceId);
  });
});

/** The answer tells the phone to go on from `after`: status 410, exactly that body, and it names no device. */
function expectContinue(answer: Downloaded, after: number) {
  expect(answer).toEqual({
    status: 410,
    body: { error: 'continue', after },
    neededBy: null,
  });
  expect(CONTINUE_STATUS).toBe(410);
  expect(isContinueResponse(answer.body)).toBe(true);
}

/**
 * Brisbane with Taylor's phone as its only member device, its five events cleared for
 * their age, at LATER. Casey's phone is registered and no member device.
 */
async function aloneClearedToFive(): Promise<[Phone, Phone]> {
  const phones = await taylorWithBrisbaneAndCasey();
  await store(phones[0], 5);
  await cleanUpAt(T + THIRTY_DAYS + 1);
  setTime(LATER);
  return phones;
}

describe('SYNC-171.1', () => {
  test('[SYNC-171.1] tells the only member device of a group to go on from the number the group is cleared to: status 410, not to be stored, and a page from that number', async () => {
    const [taylor] = await aloneClearedToFive();

    const behind = await downloadFrom(taylor, 2);
    const headers = await answerHeaders(taylor, {
      path: `${eventsPath(BRISBANE)}?after=2`,
    });

    expectContinue(behind, 5);
    expect(headers.get('cache-control')).toBe('no-store');
    for (const cursor of [0, 4]) {
      expectContinue(await downloadFrom(taylor, cursor), 5);
    }
    expectPageNaming(await downloadFrom(taylor, 5), null);
  });

  test('[SYNC-171.1] answers that a snapshot is needed while another member device does not wait for one, whether it has never downloaded or got a page', async () => {
    const [taylor, casey] = await clearedToFive();

    // Casey's phone has never downloaded.
    expectSnapshotNeeded(await download(taylor, BRISBANE, 2));
    // It gets a page: it may hold what Taylor's phone lacks.
    expect((await downloadFrom(casey, 5)).status).toBe(200);
    expectSnapshotNeeded(await download(taylor, BRISBANE, 2));

    // Once it waits too, with the larger cursor, it is the one told to go on.
    expectContinue(await downloadFrom(casey, 4), 5);
    expectSnapshotNeeded(await download(taylor, BRISBANE, 2));
  });

  test('[SYNC-171.1] when every member device waits, tells the one whose cursor no other’s is above to go on, and the others that they need a snapshot', async () => {
    const [taylor, casey] = await clearedToFive();

    expectSnapshotNeeded(await download(casey, BRISBANE, 2));
    expectContinue(await downloadFrom(taylor, 3), 5);
    expectSnapshotNeeded(await download(casey, BRISBANE, 2));
  });

  test('[SYNC-171.1] tells each of two phones with the same cursor to go on, once the other waits', async () => {
    const [taylor, casey] = await clearedToFive();

    // Taylor's phone does not wait yet.
    expectSnapshotNeeded(await download(casey, BRISBANE, 3));

    expectContinue(await downloadFrom(taylor, 3), 5);
    expectContinue(await downloadFrom(casey, 3), 5);
    expectContinue(await downloadFrom(taylor, 3), 5);
  });

  test('[SYNC-171.1] a phone that went on gets a page that names the phone still waiting, and no longer waits itself', async () => {
    const [taylor, casey] = await clearedToFive();
    expectSnapshotNeeded(await download(casey, BRISBANE, 2));
    expectContinue(await downloadFrom(taylor, 3), 5);

    expectPageNaming(await downloadFrom(taylor, 5), casey.deviceId);

    expectSnapshotNeeded(await download(casey, BRISBANE, 2));
  });

  test('[SYNC-171.1] goes by every other member device of the group: one that does not wait is enough for snapshot-needed', async () => {
    const [taylor, casey] = await clearedToFive();
    const other = await registered();
    await addMember(BRISBANE, other);
    expectSnapshotNeeded(await download(casey, BRISBANE, 2));

    expectSnapshotNeeded(await download(taylor, BRISBANE, 3));

    // The third phone waits too, behind a larger cursor than its own.
    expectSnapshotNeeded(await download(other, BRISBANE, 1));
    expectContinue(await downloadFrom(taylor, 3), 5);
  });

  test('[SYNC-171.1] answers snapshot-needed while the group stores a complete snapshot for another member device that covers more than the cursor', async () => {
    const [taylor, casey] = await clearedToFive();
    expectSnapshotNeeded(await download(casey, BRISBANE, 2));
    await uploadAll(BRISBANE, snapshotOf(taylor, casey, { sequence: 4 }));

    // Casey's phone may have taken it in, and would then hold the fourth event.
    expectSnapshotNeeded(await download(taylor, BRISBANE, 3));

    expectContinue(await downloadFrom(taylor, 4), 5);
  });

  test('[SYNC-171.1] a snapshot that is not complete does not count', async () => {
    const [taylor, casey] = await clearedToFive();
    expectSnapshotNeeded(await download(casey, BRISBANE, 2));
    const s = snapshotOf(taylor, casey, { sequence: 4 });
    expectStored(await uploadChunk(BRISBANE, s, 0), s, 0);
    expectStored(await uploadChunk(BRISBANE, s, 1), s, 1);

    expectContinue(await downloadFrom(taylor, 3), 5);
  });

  test('[SYNC-171.1] answers snapshot-needed while the group stores a complete snapshot for the phone itself that covers more than its cursor, so that it takes it in first', async () => {
    const [taylor, casey] = await clearedToFive();
    expectSnapshotNeeded(await download(casey, BRISBANE, 2));
    await uploadAll(BRISBANE, snapshotOf(casey, taylor, { sequence: 4 }));

    expectSnapshotNeeded(await download(taylor, BRISBANE, 3));

    expectContinue(await downloadFrom(taylor, 4), 5);
  });

  test('[SYNC-171.1] with [SYNC-108.2] a member device that waits and has never downloaded holds none of the ledger, and does not keep the answer at snapshot-needed', async () => {
    const [taylor, casey] = await clearedToFive();
    // Casey's phone has never downloaded, and does not wait.
    expectSnapshotNeeded(await download(taylor, BRISBANE, 3));

    expectSnapshotRefused(await ask(casey, BRISBANE), NO_SNAPSHOT);

    expectContinue(await downloadFrom(taylor, 3), 5);
  });

  test('[SYNC-171.1] records the cursor and the time as the progress of the phone it tells so, and that it waits', async () => {
    const [taylor, casey] = await aloneClearedToFive();
    setTime(LATER + 9_000);

    expectContinue(await downloadFrom(taylor, 2), 5);

    expect(await rowsHolding(BRISBANE, taylor.deviceId, 2, LATER + 9_000)).toBe(
      1,
    );
    // A phone that becomes a member device afterwards is told who waits.
    await addMember(BRISBANE, casey);
    setTime(LATER + 10_000);
    expectPageNaming(await downloadFrom(casey, 5), taylor.deviceId);
  });

  test('[SYNC-171.1] refuses a cursor past the group’s last number, and a device that is no member device, as before', async () => {
    const [taylor, casey] = await aloneClearedToFive();

    expectRefused(await download(taylor, BRISBANE, 6), REQUEST);
    expectGroupRefused(await download(casey, BRISBANE, 2), NOT_A_MEMBER);

    // What the member device is told for a cursor the group has had.
    expectContinue(await downloadFrom(taylor, 2), 5);
  });

  test('[SYNC-171.1] goes by each group’s own member devices', async () => {
    const [taylor] = await bothInBrisbane();
    await store(taylor, 5);
    expectCreated(await createGroup(taylor, TOKYO), TOKYO);
    const two = events(2);
    expectUploaded(await upload(taylor, TOKYO, two), two, [1, 2]);
    await cleanUpAt(T + THIRTY_DAYS + 1);
    setTime(LATER);

    // Tokyo has Taylor's phone alone; in Brisbane Casey's phone does not wait.
    expectContinue(await downloadFrom(taylor, 1, TOKYO), 2);
    expectSnapshotNeeded(await download(taylor, BRISBANE, 2));
  });
});
