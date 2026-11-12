# ADR-0019: The API deploys from GitHub Actions to staging and production

- Date: 2026-11-11
- Status: Accepted

## Context

ADR-0007 put the API on Cloudflare Workers, reaching Neon through Hyperdrive, and left open who deploys it, when, and when its migrations run. Its code has not been deployed anywhere yet.

Sessions act as the bot account and hold no Cloudflare credentials (`AGENTS.md`, rule 9). The bot can push branches and start workflows, so a secret that any workflow run can read is one a session can read. A GitHub environment gives its secrets only to runs from the branches it names, and can make a run wait for a person's approval; in a public repository both are free.

A Worker keeps nothing between requests, so the only place it could run migrations is inside a request. ADR-0007's runner is the Node entry file's `migrate` command. Hyperdrive answers only to a Worker, so whatever runs that command connects to Neon directly. postgres.js sends a connection-string parameter it does not know to the server as a setting, and Neon's connection strings carry `channel_binding=require`, which PostgreSQL does not have as a setting.

The options as of 2026-11-11:

- The owner deploys by hand with Wrangler. No credential leaves the owner's machine, but staging then runs whatever was last deployed by hand, not `main`, and every merge that changes the API waits for the owner.
- A workflow with repository secrets deploys. Any branch's workflow can read those.
- A workflow deploys with secrets that live in GitHub environments limited to `main`, and production's waits for the owner's approval.

## Decision

- The API runs in two environments, `staging` and `production`. Each has its own Worker, its own Hyperdrive configuration with query caching off, and its own Neon project; they share only the Cloudflare account. `apps/api/wrangler.jsonc` names both under `env`. Its top level is for local development and binds no real Hyperdrive configuration.
- The `deploy` workflow deploys `main`: to staging after each merge that changes what the Worker is built from, and to production when the owner starts it and approves the run.
- A deploy does three things in order. It runs the migrations on that environment's database, straight to Neon with the server's certificate checked. It uploads the Worker. It requests `/health` from the deployed Worker, which answers only after a query through the real Hyperdrive.
- Migrations run nowhere else in production, and never while handling a request: lint lets only the Node entry file import the runner.
- The Cloudflare API token and each database's connection string are secrets of the GitHub environments `staging` and `production`. Both accept runs only from `main`, and `production` also requires the owner's approval. Hyperdrive holds the connection string the Worker uses. A Hyperdrive configuration's id is not a secret and stays in `wrangler.jsonc`.
- The check of `AGENTS.md`'s rule 9 is `pnpm --filter api check:hyperdrive <environment>`. It runs the checkout's Worker on Cloudflare with `wrangler dev --remote` and that environment's Hyperdrive configuration, under the owner's own Cloudflare login.

## Consequences

- Staging follows `main` without anyone deploying it. A merge deploys when it changes a path the Worker is built from. The lockfile and the root `package.json` are among those paths, so a merge that only upgrades one of the phone app's dependencies deploys the same Worker again.
- Between the migrations and the upload, and for as long as an upload keeps failing, the Worker deployed before runs on the new schema. So a migration keeps that Worker working: it adds first, and a later deploy removes what the old code used, once no deployed Worker uses it. Rolling a Worker back with Wrangler does not roll the schema back, for the same reason.
- The runner applies all pending migrations in one transaction, so one that fails stops the deploy before the upload and leaves the database as it was.
- When the upload succeeds and the `/health` request then fails, the run fails with the new Worker already answering requests, and nothing puts the one before back. That environment stays broken until the owner rolls the Worker back with Wrangler or a fix merges. The request also cannot tell which Worker answered: just after an upload, a 200 may still come from the one deployed before.
- Production gets every migration `main` has when the owner starts its deploy. Nothing but the staging deploys before it has run them first.
- The bot can start a production deploy, but it waits until the owner approves it.
- The workflow can run only once it is on `main`, so a change to it is first tried by the deploy its own merge starts.
- One API token deploys both Workers, because both are in one Cloudflare account: a token leaked from a staging deploy reaches production too. Keeping them apart takes a second account.
- One database role, the one Neon creates with the project, both runs the migrations and serves requests. Roles made in Neon's console all get the same broad rights, so a role for the Worker that cannot change the schema takes roles and grants written in SQL.
- The API's address is its Worker's name under the account's `workers.dev` subdomain until it gets a domain of its own.
- The check needs a Cloudflare login, so it stays with the owner. The `/health` request at the end of a deploy is the only check through Hyperdrive that runs by itself.
