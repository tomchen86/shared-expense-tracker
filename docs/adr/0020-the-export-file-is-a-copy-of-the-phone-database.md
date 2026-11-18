# ADR-0020: The export file is a copy of the phone's database

- Date: 2026-11-18
- Status: Accepted

## Context

The app needs no sign-up and keeps its data on the phone, so until the cloud service exists, a file the user exports and imports is what saves the data when a phone is replaced or broken (`docs/roadmap.md`). The transfer code reuses the file: ADR-0015 makes a transfer bundle "the export file plus the group keys". The first external version ships with both, so the format chosen now is the one later versions must keep reading.

The phone keeps all its data in one SQLite database. The database records each migration that has run, with a checksum, and a migration that a release tag contains never changes (ADR-0006). Secrets, the device's seed and the group keys, live in `expo-secure-store` and never in the database (ADR-0015).

Export and import need three things that exist only as native code: files on the phone, the system share sheet, and the system file picker. Jest runs on Node, where none of them exist, as `expo-sqlite` does not (ADR-0006).

A file a user picks is input from outside the app. It may be cut short, damaged, made by another program, edited by hand, or exported by a newer version of the app.

Also considered:

- A JSON document with its own version number. It opens in a text editor and does not depend on SQLite. Every table and every new column would need hand-written code to write it and to read it, and every format version a conversion; a column left out loses data without any error, which breaks the promise that an import equals the export.
- Encrypting the file with a password the user chooses. A forgotten password loses the data the file exists to save, and the phone's own database is plain text to whoever holds the unlocked phone (ADR-0015).

## Decision

- The export file is one SQLite database file: a copy of the phone's whole database as it is at one moment, migration records included. SQLite makes the copy in one step that reads a single snapshot, such as `VACUUM INTO`, so a change saved during an export is in the file whole or not at all.
- The copy also records when it was made, in a table of its own that the phone's database does not have.
- The file's version is its migration records. There is no other version number. A file whose records equal the start of the app's list is older than the app, or the same; one whose records start with the app's whole list and go on is newer; any other file is not an export of this app.
- The file is not encrypted, and Settings says so where the user starts an export.
- The file holds only what the database holds, so no seed and no group key is ever in it (ADR-0015). A transfer bundle is this file's bytes plus the group keys, encrypted as ADR-0015 says.
- Import treats the file as untrusted. It works on the copy the file picker hands the app, never on the phone's database file. Before anything is written it requires, in this order: SQLite's own integrity and foreign key checks pass; the migration records are not newer than the app, and match the start of its list; the file holds no view and no trigger, which an export never has, so that nothing the file brought is executed, by the migrations that follow or by anything else; after the migrations the file has not run are run on the copy, the copy holds exactly the tables and indexes the app's migrations make, each defined as they define it, plus the table that records when it was made, and nothing else; and the rows keep the bookkeeping rules the database cannot express, which the `backup` spec lists.
- Import then replaces the rows of the phone's open database with the copy's, in one transaction on the app's single connection (ADR-0006). The picked file never becomes the phone's database file, so a failure rolls back to the data the phone had.
- `apps/mobile/src/backup/` holds export and import, a capability with a spec and no tables of its own. It reads and replaces every capability's tables by reading the schema, not by naming them.
- `apps/mobile/src/storage/` is also the only place that reaches the phone's files, the share sheet, and the file picker, through one module beside the one that opens the phone's database. Tests replace that module with Node's file system, `node:sqlite`, and a share sheet and a picker they control.

## Consequences

- A new table or column needs no change to export or import, and an old file is brought up to date by the migrations the app already has: there is no second set of conversions to maintain.
- Every release build can import a file that any earlier release build exported. A file from a build that no release tag contains can stop being importable when its migrations are changed or merged, which ADR-0006 allows before the first external release.
- An older version of the app cannot import a newer version's file. The user updates the app first.
- Anyone who has the file can read it with any SQLite tool. The user is told, and chooses where the file goes.
- The file carries the whole local identity, so a phone that imports it becomes the same user as the phone that exported it. Nothing depends on that until shared ledgers exist; the work on removing members and on transfer codes decides what an imported shared ledger is.
- The copy holds every table, including those added later. Once sync keeps its state in the database, such as events waiting to upload and how far the phone has synced, an export carries that state and an import puts it back as it was at the export. On a phone that is in a shared ledger, that would take its sync back to that moment without the other phones knowing. No such table exists yet, and import on a phone that is in a shared ledger is not built. This ADR leaves it open: the change that adds those tables, the phone's sync loop (#135), and the transfer code (#145), which moves a phone's shared ledgers in this file, each decide what an export carries of that state and what an import does with it, in an ADR of their own.
- Opening a file from outside hands it to SQLite's parser. The checks above run before any row is trusted, and a file with a view, a trigger, or a table or index the app did not define is refused. A changed value that leaves the file well formed and within the rules is not detected, because the file has no checksum of its own.
- The format is tied to SQLite: a client that cannot run SQLite, such as a web version without it, cannot read the file.
- An export or an import runs on the phone's one connection, so every other read and write waits until it ends (ADR-0006).
- `apps/mobile` adds the Expo packages that reach files, the share sheet, and the file picker, each imported only in `storage/`, which `pnpm lint` enforces as it does for `expo-sqlite`.
