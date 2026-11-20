import {
  GROUP_REFUSAL_STATUS,
  REFUSAL_STATUS,
  isCreateGroupResponse,
  isUploadEventsRequest,
  type CreateGroupResponse,
} from '@shared-expense/domain/api';
import { Hono } from 'hono';
import type { AppEnv } from '../app';
import { jsonOf } from '../sharing/signed-requests';
import {
  createGroup,
  readPage,
  storeEvents,
  type EventApiRefusal,
} from './groups';

const STATUS = { request: REFUSAL_STATUS.request, ...GROUP_REFUSAL_STATUS };

const refuse = (refusal: EventApiRefusal) =>
  Response.json(refusal, { status: STATUS[refusal.error] });

/** Whether the text is a group ID, as the answer to creating the group carries it (SYNC-48.1). */
const isGroupId = (groupId: string) => isCreateGroupResponse({ groupId });

// A download's query is the cursor and nothing else, in decimal with no sign, point,
// escape or leading zero (SYNC-59.1). Read from the URL as the request wrote it.
const AFTER = /^[^?]*\?after=(0|[1-9][0-9]{0,15})$/;

/**
 * The event API (ADR-0016, ADR-0024): a phone creates a group, uploads its events and
 * downloads them page by page. What is wrong with how a request is written is refused
 * before anything is read about the group (SYNC-60.1).
 */
export const syncRoutes = new Hono<AppEnv>()
  .put('/groups/:groupId', async (c) => {
    const groupId = c.req.param('groupId');
    if (!isGroupId(groupId) || (await c.req.arrayBuffer()).byteLength > 0) {
      return refuse({ error: 'request' });
    }
    if (!(await createGroup(c.env.sql, groupId, c.var.deviceId))) {
      return refuse({ error: 'not-a-member' });
    }
    const answer: CreateGroupResponse = { groupId };
    return c.json(answer);
  })
  .post('/groups/:groupId/events', async (c) => {
    const groupId = c.req.param('groupId');
    const upload = jsonOf(new Uint8Array(await c.req.arrayBuffer()));
    if (!isGroupId(groupId) || !isUploadEventsRequest(upload)) {
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
    if ('error' in outcome) return refuse(outcome);
    // A phone that is up to date asks for the same URL every time (SYNC-57.1).
    c.header('Cache-Control', 'no-store');
    return c.json(outcome);
  });
