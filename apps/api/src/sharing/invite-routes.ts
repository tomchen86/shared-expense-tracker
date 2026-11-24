import {
  INVITE_REFUSAL_STATUS,
  JOIN_REQUEST_REFUSAL_STATUS,
  isGroupId,
  isInviteCode,
  isJoinRequestBody,
  isPutInviteRequest,
  type InviteRefusal,
  type JoinRequestRefusal,
  type PutInviteResponse,
  type ReadInviteResponse,
  type RevokeInviteResponse,
} from '@shared-expense/domain/api';
import { Hono } from 'hono';
import type { AppEnv } from '../app';
import { putInvite, readInvite, revokeInvite } from './invites';
import { cancelJoinRequest, putJoinRequest } from './join-requests';
import { jsonOf } from './signed-requests';

const refusalStatus = {
  ...INVITE_REFUSAL_STATUS,
  ...JOIN_REQUEST_REFUSAL_STATUS,
};

function answer(
  body:
    | PutInviteResponse
    | ReadInviteResponse
    | RevokeInviteResponse
    | InviteRefusal
    | JoinRequestRefusal,
  headers?: HeadersInit,
) {
  return Response.json(body, {
    status: 'error' in body ? refusalStatus[body.error] : 200,
    headers,
  });
}

export const inviteRoutes = new Hono<AppEnv>()
  .on(['PUT', 'DELETE'], '/groups/:groupId/invites/:code', async (c) => {
    const { groupId, code } = c.req.param();
    if (!isGroupId(groupId) || !isInviteCode(code) || c.req.url.includes('?')) {
      return answer({ error: 'request' });
    }
    const { sql, now } = c.env;
    const body = new Uint8Array(await c.req.arrayBuffer());
    if (c.req.method === 'DELETE') {
      if (body.length) return answer({ error: 'request' });
      return answer(
        await revokeInvite(sql, groupId, c.var.deviceId, code, now),
      );
    }
    const put = jsonOf(body);
    if (!isPutInviteRequest(put)) return answer({ error: 'request' });
    return answer(
      await putInvite(sql, groupId, c.var.deviceId, code, put, now),
    );
  })
  .on(['PUT', 'DELETE'], '/invites/:code/request', async (c) => {
    const code = c.req.param('code');
    if (!isInviteCode(code) || c.req.url.includes('?')) {
      return answer({ error: 'request' });
    }
    const { sql, now } = c.env;
    const body = new Uint8Array(await c.req.arrayBuffer());
    if (c.req.method === 'DELETE') {
      if (body.length) return answer({ error: 'request' });
      return answer(await cancelJoinRequest(sql, code, c.var.deviceId, now));
    }
    const put = jsonOf(body);
    if (!isJoinRequestBody(put)) return answer({ error: 'request' });
    return answer(await putJoinRequest(sql, code, c.var.deviceId, put, now));
  });

export const publicInviteRoutes = new Hono<AppEnv>().get(
  '/invites/:code',
  async (c, next) => {
    // Hono routes HEAD to GET. Only GET reads an invite.
    if (c.req.method !== 'GET') return next();
    const code = c.req.param('code');
    const headers = { 'Cache-Control': 'no-store' };
    if (!isInviteCode(code) || c.req.url.includes('?')) {
      return answer({ error: 'request' }, headers);
    }
    return answer(await readInvite(c.env.sql, code, c.env.now()), headers);
  },
);
