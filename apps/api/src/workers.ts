import type { ExecutionContext } from 'hono';
import { app } from './app';
import { connect } from './database/connect';

/** The bindings in wrangler.jsonc. */
interface WorkersEnv {
  HYPERDRIVE: { connectionString: string };
}

export default {
  // A new client per request and never a global one: a Worker keeps no connection between
  // requests; Hyperdrive does, and it cleans up the client when the request ends.
  fetch(request: Request, env: WorkersEnv, context: ExecutionContext) {
    const sql = connect(env.HYPERDRIVE.connectionString);
    return app.fetch(request, { sql }, context);
  },
};
