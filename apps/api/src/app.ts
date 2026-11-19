import { Hono } from 'hono';
import type { Sql } from './database/connect';
import { healthRoutes } from './health/routes';
import type { AppLinks } from './sharing/app-links';
import { appLinkRoutes } from './sharing/routes';
import { signedRequests } from './sharing/signed-requests';

/** What the entry file gives every request, as `c.env` (ADR-0007, ADR-0022, ADR-0023). */
export interface AppEnv {
  Bindings: {
    sql: Sql;
    /** The API's time: whole milliseconds since the Unix epoch. */
    now: () => number;
    /** The address the request came from, as the runtime tells it; undefined when it does not. */
    clientIp: string | undefined;
    /**
     * The key of the keyed hash that stands for an IP in the database (SHARING-42.1);
     * undefined when the environment gives none.
     */
    ipHashKey: string | undefined;
    /** What this environment's verification files and download page say. */
    appLinks: AppLinks;
  };
}

export const app = new Hono<AppEnv>()
  // The public routes, which take requests that are not signed. A route belongs here only
  // when its requirement says so (SHARING-31.1).
  .route('/', healthRoutes)
  .route('/', appLinkRoutes)
  // Every other request passes the checks first, whether its path has a route or not.
  .use(signedRequests);
