import type { ExecutionContext } from 'hono';
import { app } from './app';
import { connect } from './database/connect';

/** The bindings in wrangler.jsonc. */
interface WorkersEnv {
  HYPERDRIVE: { connectionString: string };
  /**
   * A secret of the Worker: the key of the keyed hash that stands for an IP in the
   * database (ADR-0022). Each environment has its own.
   */
  IP_HASH_KEY?: string;
}

export default {
  // A new client per request and never a global one: a Worker keeps no connection between
  // requests; Hyperdrive does, and it cleans up the client when the request ends.
  fetch(request: Request, env: WorkersEnv, context: ExecutionContext) {
    const sql = connect(env.HYPERDRIVE.connectionString);
    return app.fetch(
      request,
      {
        sql,
        now: Date.now,
        // Cloudflare puts the address of whoever connected to it here, in place of
        // anything the request itself claimed (SHARING-41.1).
        clientIp: request.headers.get('CF-Connecting-IP') ?? undefined,
        ipHashKey: env.IP_HASH_KEY,
      },
      context,
    );
  },
};
