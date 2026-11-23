import type { ExecutionContext } from 'hono';
import { app } from './app';
import { cleanUp } from './cleanup';
import { connect, type Sql } from './database/connect';
import type { AppLinks } from './sharing/app-links';

/** The bindings in wrangler.jsonc. */
interface WorkersEnv {
  HYPERDRIVE: { connectionString: string };
  /**
   * A secret of the Worker: the key of the keyed hash that stands for an IP in the
   * database (ADR-0022). Each environment has its own.
   */
  IP_HASH_KEY?: string;
  APP_LINKS?: AppLinks;
}

export default {
  fetch(request: Request, env: WorkersEnv, context: ExecutionContext) {
    // Public links need only configuration. Routes that use Hyperdrive share
    // one client for this request, which Hyperdrive cleans up when it ends.
    let sql: Sql | undefined;
    return app.fetch(
      request,
      {
        appLinks: env.APP_LINKS ?? {},
        get sql() {
          return (sql ??= connect(env.HYPERDRIVE.connectionString));
        },
        now: Date.now,
        // Cloudflare puts the address of whoever connected to it here, in place of
        // anything the request itself claimed (SHARING-41.1).
        clientIp: request.headers.get('CF-Connecting-IP') ?? undefined,
        ipHashKey: env.IP_HASH_KEY,
      },
      context,
    );
  },
  /**
   * What Cloudflare calls when the Worker's Cron trigger fires: runs the cleanup once on
   * this environment's database, at invocation time (SYNC-145.2). It resolves once the
   * cleanup has finished.
   */
  async scheduled(
    controller: { readonly cron: string; readonly scheduledTime: number },
    env: WorkersEnv,
    context: ExecutionContext,
  ): Promise<void> {
    void controller;
    void context;
    const sql = connect(env.HYPERDRIVE.connectionString);
    try {
      await cleanUp(sql, Date.now());
    } finally {
      await sql.end();
    }
  },
};
