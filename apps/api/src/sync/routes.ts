import {
  CONTINUE_STATUS,
  GROUP_REFUSAL_STATUS,
  REPLACED_BY_TAKEOVER,
  REPLACED_HEADER,
  REFUSAL_STATUS,
  SNAPSHOT_NEEDED_BY_HEADER,
  SNAPSHOT_NEEDED_STATUS,
  SNAPSHOT_REFUSAL_STATUS,
  isSnapshotChunkStoredResponse,
  isUploadSnapshotChunkRequest,
  isCreateGroupResponse,
  isUploadEventsRequest,
  writeSnapshotNeededBy,
  type CreateGroupResponse,
  type SnapshotRefusal,
} from '@shared-expense/domain/api';
import { Hono } from 'hono';
import type { AppEnv } from '../app';
import { jsonOf } from '../sharing/signed-requests';
import {
  createGroup,
  readGroupDevices,
  readPage,
  storeEvents,
  type EventApiRefusal,
  type EventMembershipRefusal,
} from './groups';
import { readSnapshot, storeChunk } from './snapshots';

const STATUS = {
  request: REFUSAL_STATUS.request,
  ...GROUP_REFUSAL_STATUS,
  ...SNAPSHOT_REFUSAL_STATUS,
};
const NO_STORE = { 'Cache-Control': 'no-store' };

function refuse(
  refusal: EventApiRefusal | SnapshotRefusal | EventMembershipRefusal,
) {
  const status = STATUS[refusal.error];
  if ('replaced' in refusal) {
    return Response.json(
      { error: refusal.error },
      {
        status,
        headers: refusal.replaced
          ? { [REPLACED_HEADER]: REPLACED_BY_TAKEOVER }
          : undefined,
      },
    );
  }
  return Response.json(refusal, { status });
}

/** Whether the text is a group ID, as the answer to creating the group carries it (SYNC-48.1). */
const isGroupId = (groupId: string) => isCreateGroupResponse({ groupId });

// A download's query is the cursor and nothing else, in decimal with no sign, point,
// escape or leading zero (SYNC-59.1). Read from the URL as the request wrote it.
const AFTER = /^[^?]*\?after=(0|[1-9][0-9]{0,15})$/;

/** Whether the URL carries a query, which a create and an upload must not (SYNC-64.1). */
const hasQuery = (url: string) => url.includes('?');

const chunkPath = '/groups/:groupId/snapshots/:snapshotId/chunks/:index';
const validSnapshotPath = (url: string, groupId: string) =>
  isGroupId(groupId) && !hasQuery(url);

function requestedChunk(snapshotId: string, writtenIndex: string) {
  const index = Number(writtenIndex);
  const chunk = { snapshotId, index };
  if (String(index) === writtenIndex && isSnapshotChunkStoredResponse(chunk))
    return chunk;
}

// A recipient can ask the same URL before and after an upload or a replacement.
function snapshotDownloadResponse(
  result: Awaited<ReturnType<typeof readSnapshot>>,
) {
  return Response.json(result, {
    status: 'error' in result ? STATUS[result.error] : 200,
    headers: NO_STORE,
  });
}

/**
 * The group, event and snapshot routes run after signature verification. Each checks the
 * request's shape before looking up a group or its members.
 */
export const syncRoutes = new Hono<AppEnv>()
  .put('/groups/:groupId', async (c) => {
    const groupId = c.req.param('groupId');
    if (
      !isGroupId(groupId) ||
      hasQuery(c.req.url) ||
      (await c.req.arrayBuffer()).byteLength > 0
    ) {
      return refuse({ error: 'request' });
    }
    if (!(await createGroup(c.env.sql, groupId, c.var.deviceId))) {
      return refuse({ error: 'not-a-member' });
    }
    const answer: CreateGroupResponse = { groupId };
    return c.json(answer);
  })
  .get('/groups/:groupId/devices', async (c, next) => {
    if (c.req.method !== 'GET') return next();
    const groupId = c.req.param('groupId');
    if (!isGroupId(groupId) || hasQuery(c.req.url)) {
      return refuse({ error: 'request' });
    }
    const outcome = await readGroupDevices(c.env.sql, groupId, c.var.deviceId);
    return 'error' in outcome
      ? refuse(outcome)
      : c.json(outcome, 200, NO_STORE);
  })
  .post('/groups/:groupId/events', async (c) => {
    const groupId = c.req.param('groupId');
    const upload = jsonOf(new Uint8Array(await c.req.arrayBuffer()));
    if (
      !isGroupId(groupId) ||
      hasQuery(c.req.url) ||
      !isUploadEventsRequest(upload)
    ) {
      return refuse({ error: 'request' });
    }
    const outcome = await storeEvents(c.env.sql, {
      ...upload,
      groupId,
      deviceId: c.var.deviceId,
      now: c.env.now(),
    });
    return 'error' in outcome ? refuse(outcome) : c.json(outcome);
  })
  .get('/groups/:groupId/events', async (c, next) => {
    // Hono brings a HEAD here as well. It is no download (SYNC-63.1), so it goes on like
    // a request for a path with no route.
    if (c.req.method !== 'GET') return next();
    const groupId = c.req.param('groupId');
    const after = Number(AFTER.exec(c.req.url)?.[1]);
    if (!isGroupId(groupId) || !Number.isSafeInteger(after)) {
      return refuse({ error: 'request' });
    }
    const outcome = await readPage(c.env.sql, {
      groupId,
      deviceId: c.var.deviceId,
      after,
      now: c.env.now(),
    });
    if ('error' in outcome) {
      if (outcome.error === 'snapshot-needed')
        return c.json(outcome, SNAPSHOT_NEEDED_STATUS, NO_STORE);
      if (outcome.error === 'continue')
        return c.json(outcome, CONTINUE_STATUS, NO_STORE);
      return refuse(outcome);
    }
    if (outcome.snapshotNeededBy.length > 0)
      c.header(
        SNAPSHOT_NEEDED_BY_HEADER,
        writeSnapshotNeededBy(outcome.snapshotNeededBy),
      );
    return c.json(outcome.page, 200, NO_STORE);
  })
  .put(chunkPath, async (c) => {
    const { groupId, snapshotId, index } = c.req.param();
    const chunk = requestedChunk(snapshotId, index);
    const upload = jsonOf(new Uint8Array(await c.req.arrayBuffer()));
    if (
      !validSnapshotPath(c.req.url, groupId) ||
      !chunk ||
      !isUploadSnapshotChunkRequest(upload) ||
      chunk.index >= upload.count
    )
      return refuse({ error: 'request' });
    const result = await storeChunk(
      c.env.sql,
      groupId,
      c.var.deviceId,
      chunk,
      upload,
      c.env.now,
    );
    return 'error' in result ? refuse(result) : c.json(result);
  })
  .get('/groups/:groupId/snapshot', async (c, next) => {
    if (c.req.method !== 'GET') return next();
    const groupId = c.req.param('groupId');
    if (!validSnapshotPath(c.req.url, groupId))
      return snapshotDownloadResponse({ error: 'request' });
    const result = await readSnapshot(
      c.env.sql,
      groupId,
      c.var.deviceId,
      c.env.now(),
    );
    return snapshotDownloadResponse(result);
  })
  .get(chunkPath, async (c, next) => {
    if (c.req.method !== 'GET') return next();
    const { groupId, snapshotId, index } = c.req.param();
    const chunk = requestedChunk(snapshotId, index);
    if (!validSnapshotPath(c.req.url, groupId) || !chunk)
      return snapshotDownloadResponse({ error: 'request' });
    const result = await readSnapshot(
      c.env.sql,
      groupId,
      c.var.deviceId,
      chunk,
    );
    return snapshotDownloadResponse(result);
  });
