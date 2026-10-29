# ADR-0002: Stack and code layout

- Date: 2026-10-23
- Status: Accepted; parts are superseded by ADR-0007

## Context

The product moves in from the baseline one capability at a time (ADR-0001). The baseline is a pnpm workspace with a NestJS + TypeORM + PostgreSQL API and an Expo mobile app. Its code is split by kind (controllers, services, entities, DTOs in the API; stores, hooks, utils in the app), so one capability's code is spread across many directories and a spec cannot point at a code boundary. Every API entity also exists twice, once for PostgreSQL and once for SQLite, picked at runtime. The API's request and response types and the money rules are written separately in the API and in the app.

On the phone, the baseline keeps its data in zustand stores persisted to AsyncStorage. Each store sits under its own key and is rewritten as one JSON string on every change, and changes to its format need hand-written migrations. AsyncStorage has no transactions, so a write that spans keys, such as an expense and the sync progress, can be left half done. Offline sync is a level-2 area (ADR-0001) and needs such writes to succeed or fail together.

The baseline already picks iOS and Android versions of its shared UI components through `.ios.tsx` and `.android.tsx` files, and a test checked that its expense form used them. Still, 15 such files sit outside its shared UI folder, in the expense form, insights, and navigation, and six of its route files hold whole screens.

## Decision

- Stack: the baseline's, except on-device storage. A pnpm workspace; NestJS + TypeORM + PostgreSQL for the API; Expo (React Native) for the mobile app.
- The API stores data only in PostgreSQL, in tests too, so each table has one entity.
- The mobile app keeps its data on the phone in SQLite through `expo-sqlite`, the source of truth on the phone. Secrets such as login tokens stay in `expo-secure-store`, as in the baseline. zustand holds only screen state, such as form input and filters, and persists nothing.
- Layout, one directory per capability, named after its spec (`docs/specs/<capability>/`):
  - `apps/api/src/<capability>/`: the capability's NestJS module, with its controllers, services, entities, and DTOs.
  - `apps/mobile/src/<capability>/`: the capability's SQLite tables and queries, screen state, screens, and components. UI and theme shared across capabilities live in `apps/mobile/src/ui/`.
  - `apps/mobile/app/`: Expo Router's route files. A route file only re-exports a screen from its capability directory, and a layout file only sets up navigation.
  - `packages/domain/`: rules every client must apply identically, such as money and split calculations, and the API's request and response types. Plain TypeScript with no framework dependencies. Clients import all of it and redefine none of it. The API imports only the request and response types, which its DTO classes implement, and applies no bookkeeping rules (ADR-0003).
- Differences between iOS and Android live only in `apps/mobile/src/ui/`. A component there has one props type and a default `.tsx` file, plus an `.ios.tsx` or `.android.tsx` file for each platform that differs, which Metro picks when it builds that platform. Code outside `ui/` never checks the platform; it tells a `ui/` component what to show. `ui/` imports nothing from capability directories.

## Consequences

- A capability's spec maps to one directory in each app that implements it. A rule in `packages/domain` has one implementation and one set of tests, and a mismatch between the API and the app fails the typecheck.
- On the phone, a change, its pending upload, and the sync progress can be written in one SQLite transaction, and a change rewrites only the rows it touches. Format changes ship as SQLite schema migrations.
- Each mobile capability writes its own tables and queries, and its screens have to refresh when the data they show changes.
- Capability code is written and tested once for both platforms; only `ui/` needs tests per platform.
- Each platform difference becomes a `ui/` component that is told what to show, which takes more design up front than a platform file per screen. A difference that is not about the UI has no place in this layout and needs its own ADR.
- `expo-sqlite` is less mature on the web than on iOS and Android, so a web version that must store data offline would have to revisit this.
- `packages/domain` has to build for both NestJS (Node) and Metro (Expo). The first capability that needs it sets this up.
- API tests need a running PostgreSQL, as the baseline's CI already provides.
- Moving a capability means reshaping its code into this layout, not copying the baseline's files as they are.
