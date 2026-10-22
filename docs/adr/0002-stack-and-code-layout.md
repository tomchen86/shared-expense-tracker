# ADR-0002: Stack and code layout

- Date: 2026-10-23
- Status: Accepted

## Context

The product moves in from the baseline one capability at a time (ADR-0001). The baseline is a pnpm workspace with a NestJS + TypeORM + PostgreSQL API and an Expo mobile app. Its code is split by kind (controllers, services, entities, DTOs in the API; stores, hooks, utils in the app), so one capability's code is spread across many directories and a spec cannot point at a code boundary. Every API entity also exists twice, once for PostgreSQL and once for SQLite, picked at runtime. The API's request and response types and the money rules are written separately in the API and in the app.

## Decision

- Stack: the baseline's. A pnpm workspace; NestJS + TypeORM + PostgreSQL for the API; Expo (React Native) for the mobile app. PostgreSQL is the only database, in tests too, so each table has one entity.
- Layout, one directory per capability, named after its spec (`docs/specs/<capability>/`):
  - `apps/api/src/<capability>/`: the capability's NestJS module, with its controllers, services, entities, and DTOs.
  - `apps/mobile/src/<capability>/`: the capability's state, screens, and components. UI and theme shared across capabilities live in `apps/mobile/src/ui/`.
  - `packages/domain/`: rules both apps must apply identically, such as money and split calculations, and the API's request and response types. Plain TypeScript with no framework dependencies. Both apps import it; neither redefines what it holds, and the API's DTO classes implement its types.

## Consequences

- A capability's spec maps to one directory in each app. A rule in `packages/domain` has one implementation and one set of tests, and a mismatch between the API and the app fails the typecheck.
- `packages/domain` has to build for both NestJS (Node) and Metro (Expo). The first capability that needs it sets this up.
- Tests need a running PostgreSQL, as the baseline's CI already provides.
- Moving a capability means reshaping its code into this layout, not copying the baseline's files as they are.
