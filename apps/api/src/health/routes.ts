import type { HealthResponse } from '@shared-expense/domain/api';
import { Hono } from 'hono';
import type { AppEnv } from '../app';

export const healthRoutes = new Hono<AppEnv>().get(
  '/health',
  async (c, next) => {
    // Hono brings a HEAD here as well. Only GET is public (SHARING-31.2), so any other
    // method goes on to the checks like a request for any other route.
    if (c.req.method !== 'GET') return next();
    await c.env.sql`SELECT 1`;
    const response: HealthResponse = { status: 'ok' };
    return c.json(response);
  },
);
