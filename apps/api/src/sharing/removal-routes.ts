import {
  GROUP_REFUSAL_STATUS,
  REFUSAL_STATUS,
  ROTATION_REFUSAL_STATUS,
  isGroupId as isId,
  isRotateKeyRequest,
} from '@shared-expense/domain/api';
import { Hono } from 'hono';
import type { AppEnv } from '../app';
import { leaveGroup, readKeys, rotateKey } from './removal';
import { jsonOf } from './signed-requests';

const STATUS = {
  request: REFUSAL_STATUS.request,
  ...GROUP_REFUSAL_STATUS,
  ...ROTATION_REFUSAL_STATUS,
};

/** A refusal under its status, and anything else under 200. */
function answer(
  body: object | { error: keyof typeof STATUS },
  headers?: HeadersInit,
) {
  return Response.json(body, {
    status: 'error' in body ? STATUS[body.error] : 200,
    headers,
  });
}

// The boxes kept for a device differ each time the same URL is asked.
const NO_STORE = { 'Cache-Control': 'no-store' };

// The query of a question for keys is the epoch and nothing else, in decimal with no
// sign, point, escape or leading zero (SHARING-261.1). Read from the URL as it was written.
const AFTER = /^[^?]*\?after=(0|[1-9][0-9]{0,15})$/;

/**
 * The routes that take a device out of a group (ADR-0041). They run after signature
 * verification, and each checks how its request is written before it looks up a group.
 */
export const removalRoutes = new Hono<AppEnv>()
  .post('/groups/:groupId/rotation', async (c) => {
    const groupId = c.req.param('groupId');
    const rotation = jsonOf(new Uint8Array(await c.req.arrayBuffer()));
    if (
      !isId(groupId) ||
      c.req.url.includes('?') ||
      !isRotateKeyRequest(rotation)
    ) {
      return answer({ error: 'request' });
    }
    return answer(
      await rotateKey(c.env.sql, groupId, c.var.deviceId, rotation, c.env.now),
    );
  })
  .post('/groups/:groupId/leave', async (c) => {
    const groupId = c.req.param('groupId');
    if (
      !isId(groupId) ||
      c.req.url.includes('?') ||
      (await c.req.arrayBuffer()).byteLength > 0
    ) {
      return answer({ error: 'request' });
    }
    return answer(await leaveGroup(c.env.sql, groupId, c.var.deviceId));
  })
  .get('/groups/:groupId/keys', async (c, next) => {
    // Hono brings a HEAD here as well. It fetches no key (SHARING-264.1).
    if (c.req.method !== 'GET') return next();
    const groupId = c.req.param('groupId');
    const after = Number(AFTER.exec(c.req.url)?.[1]);
    if (!isId(groupId) || !Number.isSafeInteger(after)) {
      return answer({ error: 'request' }, NO_STORE);
    }
    return answer(
      await readKeys(c.env.sql, groupId, c.var.deviceId, after),
      NO_STORE,
    );
  });
