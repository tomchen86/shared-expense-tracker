import type { HealthResponse } from '@shared-expense/domain/api';
import { Hono } from 'hono';
import type { AppEnv } from '../app';

export const healthRoutes = new Hono<AppEnv>().get('/health', async (c) => {
  await c.env.sql`SELECT 1`;
  const response: HealthResponse = { status: 'ok' };
  return c.json(response);
});
