export const syncMigration = `
  CREATE TABLE sync_groups (
    groupId TEXT PRIMARY KEY NOT NULL REFERENCES groups(id),
    device TEXT NOT NULL
  );
  CREATE TABLE sync_clock (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    ms INTEGER NOT NULL,
    counter INTEGER NOT NULL,
    device TEXT NOT NULL
  );
  CREATE TABLE sync_records (
    groupId TEXT NOT NULL REFERENCES sync_groups(groupId),
    type TEXT NOT NULL,
    id TEXT NOT NULL,
    created TEXT NOT NULL,
    record TEXT NOT NULL,
    seeded INTEGER NOT NULL DEFAULT 0 CHECK (seeded IN (0, 1)),
    PRIMARY KEY (groupId, type, id)
  );
  CREATE TABLE sync_outbox (
    position INTEGER PRIMARY KEY,
    id TEXT NOT NULL UNIQUE,
    groupId TEXT NOT NULL REFERENCES sync_groups(groupId),
    content TEXT NOT NULL
  );
  CREATE TABLE sync_refusals (
    position INTEGER PRIMARY KEY,
    groupId TEXT NOT NULL REFERENCES sync_groups(groupId),
    id TEXT NOT NULL,
    device TEXT NOT NULL,
    receivedAtMs INTEGER NOT NULL,
    content TEXT NOT NULL,
    reason TEXT NOT NULL,
    UNIQUE (groupId, id)
  );
`;

/**
 * What a phone keeps to sync a shared ledger with the API (ADR-0027): its cursor, its key
 * epoch, whether its last download stopped at an event in a format version it does not
 * know and whether its last upload was refused because the group is full, and which
 * unsent events have had their stamp checked.
 */
export const syncLoopMigration = `
  ALTER TABLE sync_groups ADD COLUMN cursor INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE sync_groups ADD COLUMN epoch INTEGER NOT NULL DEFAULT 1;
  ALTER TABLE sync_groups
    ADD COLUMN waitsForUpdate INTEGER NOT NULL DEFAULT 0 CHECK (waitsForUpdate IN (0, 1));
  ALTER TABLE sync_groups
    ADD COLUMN groupFull INTEGER NOT NULL DEFAULT 0 CHECK (groupFull IN (0, 1));
  ALTER TABLE sync_outbox ADD COLUMN checked INTEGER NOT NULL DEFAULT 0 CHECK (checked IN (0, 1));
`;
