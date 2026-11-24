import { Hono } from 'hono';
import type { Sql } from './database/connect';
import { healthRoutes } from './health/routes';
import type { AppLinks } from './sharing/app-links';
import { decisionRoutes } from './sharing/decision-routes';
import { inviteRoutes, publicInviteRoutes } from './sharing/invite-routes';
import { removalRoutes } from './sharing/removal-routes';
import { appLinkRoutes } from './sharing/routes';
import { signedRequests } from './sharing/signed-requests';
import { syncRoutes } from './sync/routes';

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
    /** The Node request stream, which can be cancelled without closing the socket. */
    readonly incomingBody?: ReadableStream<Uint8Array>;
  };
  Variables: {
    /** The device whose request passed the checks, for the routes after them (ADR-0022). */
    deviceId: string;
  };
}

export const app = new Hono<AppEnv>()
  // The public routes, which take requests that are not signed. A route belongs here only
  // when its requirement says so (SHARING-31.2).
  .route('/', healthRoutes)
  .route('/', appLinkRoutes)
  .route('/', publicInviteRoutes)
  // Every other request passes the checks first, whether its path has a route or not.
  .use(signedRequests)
  // The routes that take signed requests: each runs only once its request has passed.
  .route('/', inviteRoutes)
  .route('/', decisionRoutes)
  .route('/', removalRoutes)
  .route('/', syncRoutes);
