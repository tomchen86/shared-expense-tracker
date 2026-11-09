import { Hono } from 'hono';
import type { Sql } from './database/connect';
import { healthRoutes } from './health/routes';

/** What the entry file gives every request, as `c.env`. */
export interface AppEnv {
  Bindings: { sql: Sql };
}

export const app = new Hono<AppEnv>().route('/', healthRoutes);
