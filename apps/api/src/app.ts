import { Hono } from 'hono';
import type { Sql } from './database/connect';
import { healthRoutes } from './health/routes';
import type { AppLinks } from './sharing/app-links';
import { appLinkRoutes } from './sharing/routes';

/** What the entry file gives every request, as `c.env`. */
export interface AppEnv {
  Bindings: { sql: Sql; appLinks: AppLinks };
}

export const app = new Hono<AppEnv>()
  .route('/', healthRoutes)
  .route('/', appLinkRoutes);
