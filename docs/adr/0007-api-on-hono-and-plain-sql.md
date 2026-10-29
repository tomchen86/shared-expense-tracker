# ADR-0007: API on Hono and plain SQL, first on Cloudflare Workers

- Date: 2026-10-29
- Status: Accepted

## Context

ADR-0002 kept the baseline's NestJS + TypeORM + PostgreSQL for the API so its code could move over. ADR-0003 then made the API a thin sync server and left the baseline's full backend behind: the API only authorizes members and devices, stores and exchanges change events, and keeps sync cursors. No API code has been written yet.

NestJS and TypeORM are built for a Node server that keeps running. A server this small needs neither dependency injection nor an ORM, and both would tie the code to that kind of host. On the phone, migrations and queries are already plain SQL with no ORM (ADR-0006).

The free relay for shared ledgers should cost almost nothing while idle, and nobody should have to maintain a machine for it. Cloudflare Workers fit that, but they cannot keep a database connection open between requests; Cloudflare's Hyperdrive keeps those connections for them.

## Decision

- The API uses Hono for routing and middleware and postgres.js for the database, with queries written as SQL and no ORM. PostgreSQL stays its only database, in tests too (ADR-0002).
- Each API capability writes its migrations as SQL text in its own directory, and one list in the API sets the order they run in. The database records each migration that has run, with a checksum of its SQL text. A migration that has run in production is never edited; a change is a new migration at the end of the list.
- The code runs unchanged on Node and on Cloudflare Workers. Only one entry file per runtime may use what exists on just one of them; all other code uses web standards such as `Request`, `Response`, `fetch`, and Web Crypto, and every library the API uses must run on both.
- `apps/api/src/<capability>/` holds the capability's routes, SQL queries, and migrations.
- The API imports only the request and response types from `packages/domain`, and checks each request against them before using it.
- At first the API runs on Cloudflare Workers and reaches a managed PostgreSQL, Neon to start, through Hyperdrive.
- Tests run on Node with Jest against a real PostgreSQL, through the Node entry file.
- This replaces three parts of ADR-0002: NestJS + TypeORM in its stack, its `apps/api/src/<capability>/` layout line, and the DTO classes and NestJS build in its `packages/domain` notes. The rest of ADR-0002 stands.

## Consequences

- Moving off Workers means running the Node entry file somewhere else, such as a VM, with PostgreSQL reached directly. Moving off Neon means a dump and a restore.
- The Jest tests cover neither the Workers entry file nor Hyperdrive, so that file stays thin, and the API is tried in Wrangler's local mode before it is deployed.
- postgres.js runs on Workers through Cloudflare's Node.js compatibility, which the Workers configuration turns on.
- Neon's free plan sleeps when idle, so the first sync after a quiet period waits for the database to wake. Sync runs in the background and never blocks a local save (ADR-0005), so this only delays it.
- Hyperdrive's free plan limits queries per day; reaching the limit means moving to a paid Workers plan.
- `packages/domain` has to build for Node, Workers, and Metro.
- The first change that adds `apps/api` also makes `pnpm lint` enforce that only the entry files use runtime-specific APIs.
