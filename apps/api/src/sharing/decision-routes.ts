import {
  GROUP_REFUSAL_STATUS,
  JOIN_DECISION_REFUSAL_STATUS,
  JOIN_REQUEST_REFUSAL_STATUS,
  ROTATION_REFUSAL_STATUS,
  SNAPSHOT_REFUSAL_STATUS,
  isApproveJoinRequestBody,
  isGroupId as isId,
  isInviteCode,
  isRequestHash,
  isTakeoverRequestBody,
  type ApproveJoinRequestBody,
  type TakeoverRequestBody,
} from '@shared-expense/domain/api';
import { Hono, type Handler } from 'hono';
import type { AppEnv } from '../app';
import {
  approveJoinRequest,
  listJoinRequests,
  readJoinResult,
  rejectJoinRequest,
} from './join-decisions';
import { jsonOf } from './signed-requests';

const STATUS = {
  ...GROUP_REFUSAL_STATUS,
  ...SNAPSHOT_REFUSAL_STATUS,
  ...JOIN_REQUEST_REFUSAL_STATUS,
  ...JOIN_DECISION_REFUSAL_STATUS,
  devices: ROTATION_REFUSAL_STATUS.devices,
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

// A list and a result can differ each time the same URL is asked.
const NO_STORE = { 'Cache-Control': 'no-store' };

/**
 * What the URL's one query field holds, read from the URL as the request wrote it:
 * undefined when the query is anything but `?<field>=<value>` (SHARING-181.1).
 */
function queryValue(url: string, field: string): string | undefined {
  const query = url.slice(url.indexOf('?') + 1);
  return url.includes('?') && query.startsWith(`${field}=`)
    ? query.slice(field.length + 1)
    : undefined;
}

function approveWith(
  isBody: (
    value: unknown,
  ) => value is ApproveJoinRequestBody | TakeoverRequestBody,
): Handler<AppEnv, '/groups/:groupId/requests/:deviceId'> {
  return async (c) => {
    const { groupId, deviceId: applicant } = c.req.param();
    const approval = jsonOf(new Uint8Array(await c.req.arrayBuffer()));
    if (
      !isId(groupId) ||
      !isId(applicant) ||
      c.req.url.includes('?') ||
      !isBody(approval)
    ) {
      return answer({ error: 'request' });
    }
    return answer(
      await approveJoinRequest(
        c.env.sql,
        groupId,
        c.var.deviceId,
        applicant,
        approval,
        c.env.now,
      ),
    );
  };
}

/**
 * The routes that answer join requests (ADR-0039). They run after signature verification,
 * and each checks how its request is written before it looks up a group.
 */
export const decisionRoutes = new Hono<AppEnv>()
  .get('/groups/:groupId/requests', async (c, next) => {
    // Hono brings a HEAD here as well. It lists nothing (SHARING-187.1).
    if (c.req.method !== 'GET') return next();
    const groupId = c.req.param('groupId');
    const after = queryValue(c.req.url, 'after');
    if (!isId(groupId) || (c.req.url.includes('?') && !isId(after))) {
      return answer({ error: 'request' }, NO_STORE);
    }
    return answer(
      await listJoinRequests(
        c.env.sql,
        groupId,
        c.var.deviceId,
        after ?? null,
        c.env.now(),
      ),
      NO_STORE,
    );
  })
  .delete('/groups/:groupId/requests/:deviceId', async (c) => {
    const { groupId, deviceId: applicant } = c.req.param();
    const request = queryValue(c.req.url, 'request');
    if (
      !isId(groupId) ||
      !isId(applicant) ||
      !isRequestHash(request) ||
      (await c.req.arrayBuffer()).byteLength > 0
    ) {
      return answer({ error: 'request' });
    }
    return answer(
      await rejectJoinRequest(
        c.env.sql,
        groupId,
        c.var.deviceId,
        applicant,
        request,
        c.env.now,
      ),
    );
  })
  .post(
    '/groups/:groupId/requests/:deviceId/approval',
    approveWith(isApproveJoinRequestBody),
  )
  .post(
    '/groups/:groupId/requests/:deviceId/takeover',
    approveWith(isTakeoverRequestBody),
  )
  .get('/invites/:code/request', async (c, next) => {
    if (c.req.method !== 'GET') return next();
    const code = c.req.param('code');
    if (!isInviteCode(code) || c.req.url.includes('?')) {
      return answer({ error: 'request' }, NO_STORE);
    }
    return answer(
      await readJoinResult(c.env.sql, code, c.var.deviceId, c.env.now()),
      NO_STORE,
    );
  });
