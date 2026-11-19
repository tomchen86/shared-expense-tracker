import type { ExecutionContext } from 'hono';
import { app } from './app';
import { connect, type Sql } from './database/connect';
import type { AppLinks } from './sharing/app-links';

/** The bindings in wrangler.jsonc. */
interface WorkersEnv {
  HYPERDRIVE: { connectionString: string };
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
      },
      context,
    );
  },
};
