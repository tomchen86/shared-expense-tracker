import {
  INVITE_REFUSAL_STATUS,
  isGroupId,
  isInviteCode,
  isPutInviteRequest,
  type InviteRefusal,
  type PutInviteResponse,
  type ReadInviteResponse,
  type RevokeInviteResponse,
} from '@shared-expense/domain/api';
import { Hono } from 'hono';
import type { AppEnv } from '../app';
import { putInvite, readInvite, revokeInvite } from './invites';
import { jsonOf } from './signed-requests';

function answer(
  body:
    | PutInviteResponse
    | ReadInviteResponse
    | RevokeInviteResponse
    | InviteRefusal,
  headers?: HeadersInit,
) {
  return Response.json(body, {
    status: 'error' in body ? INVITE_REFUSAL_STATUS[body.error] : 200,
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
  .get('/invites/:code', async (c, next) => {
    // Hono routes HEAD to GET. Only GET reads an invite.
    if (c.req.method !== 'GET') return next();
    const code = c.req.param('code');
    const headers = { 'Cache-Control': 'no-store' };
    if (!isInviteCode(code) || c.req.url.includes('?')) {
      return answer({ error: 'request' }, headers);
    }
    return answer(await readInvite(c.env.sql, code, c.env.now()), headers);
  });
