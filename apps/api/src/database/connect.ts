import postgres from 'postgres';

export type Sql = postgres.Sql;

/**
 * A client with Cloudflare's options for postgres.js on Hyperdrive, on Node too, so tests
 * run queries the way production does. Without `fetch_types` a new connection skips a
 * round trip, and array columns read as text. Prepared statements stay on: Hyperdrive
 * does not reliably support postgres.js with `prepare: false`. Notices such as "already
 * exists" are not worth a log line.
 */
export function connect(url: string): Sql {
  return postgres(url, { max: 5, fetch_types: false, onnotice: () => {} });
}
