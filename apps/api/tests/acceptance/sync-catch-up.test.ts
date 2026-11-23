import {
  SNAPSHOT_NEEDED_BY_HEADER,
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
import { bothInBrisbane } from './sharing-invites-api';
import {
  BRISBANE,
  EMPTY_PAGE,
  REQUEST,
  TOKYO,
  addMember,
  createGroup,
  download,
  event,
  eventsPath,
  expectCreated,
  expectUploaded,
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
  expectStored,
  snapshotOf,
  uploadAll,
  uploadChunk,
} from './sync-snapshot-api';

// How a phone that is behind its group's cleared events gets a snapshot (ADR-0034): the
// API remembers which member devices it told that they need one, and names them to every
// member device that gets a page, in a header of that page's answer, until the group
// stores a snapshot such a device can go on from.

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
});
