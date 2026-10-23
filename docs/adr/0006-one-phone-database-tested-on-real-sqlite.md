# ADR-0006: One phone database, tested on real SQLite

- Date: 2026-10-23
- Status: Accepted

## Context

ADR-0002 keeps the phone's data in SQLite through `expo-sqlite`: each mobile capability owns its tables and queries, and format changes ship as schema migrations. It does not say how the app opens the database, in what order the migrations of different capabilities run, where the storage code that every capability shares lives (it names only `apps/mobile/src/ui/` as shared), or how tests get a database. The first data the app saves, the shell's local identity, needs all four: its acceptance tests check that the identity is still there after a restart.

The baseline keeps five stores, each under its own AsyncStorage key with its own version number and hand-written migrations, and refuses to load a store whose version is newer than the app knows. v2 has no users yet; its first external version comes later in the roadmap.

`expo-sqlite` runs native code, which does not exist in Node, where Jest runs. Node's built-in SQLite, `node:sqlite`, runs in this repo's mobile Jest project on Node 22, where it is marked experimental and prints a warning.

## Decision

- The mobile app keeps all its data in one SQLite database, opened when the app starts, so a write that spans capabilities, such as an expense and its pending upload, can be one transaction.
- Each capability writes its migrations in its own directory. One app-wide list in the shell sets the order they run in: a migration comes after those that create the tables it refers to. The database records how many migrations have run (`PRAGMA user_version`); at startup the app runs the rest in order, each in one transaction with its new version number. A migration on `main` is never edited, reordered, or removed; a change is a new migration at the end of the list.
- A database that records more migrations than the app knows, for example after an older version is installed over a newer one, is neither opened nor changed. The shell spec says what the user sees.
- `apps/mobile/src/storage/` holds the storage code every capability shares: opening the database, running the migrations it is given, and transactions. It is not a capability and has no spec. Like `ui/`, it imports nothing from capability directories, and it is the only place that imports `expo-sqlite`.
- Capabilities reach the database only through a small interface in `storage/`: run a statement, read rows, and run a function as one transaction. It runs one operation at a time on the single connection, so no statement ends up inside another caller's transaction.
- The interface has two implementations: `expo-sqlite` on the phone and `node:sqlite` in tests. Tests start the app with a database of their choosing, a file in a temporary directory: a restart closes and reopens the file, and clearing the app's data deletes it.
- Identity, name, and settings are data like any other and live in this database. Secrets, such as login tokens, stay in `expo-secure-store` (ADR-0002).
- v2 starts from an empty database and does not read the baseline's AsyncStorage data.

## Consequences

- Writes that span capabilities succeed or fail together, as offline sync needs (ADR-0002), and the order of every capability's tables is written down in one place.
- Adding a migration means adding it to the shared list, so two changes that add migrations at the same time conflict there and have to be put in order.
- The shell imports every capability's migrations through the list.
- Acceptance tests run the real migrations and SQL without a phone. They cover neither `expo-sqlite` itself nor differences between the SQLite builds on the phone and in Node, so the phone implementation stays thin, and queries use only SQL both builds support.
- Because operations run one at a time, a long transaction delays every other read and write.
- `node:sqlite` is experimental on Node 22; if its API changes, only the test implementation changes.
- After an older version is installed over a newer one, the app cannot open its data until the newer version is back or the app's data is cleared.
- Data recorded in the baseline app stays there; v2 never converts it.
- The first change that adds `storage/` also makes `pnpm lint` enforce its import rules, as it does for `ui/`.
