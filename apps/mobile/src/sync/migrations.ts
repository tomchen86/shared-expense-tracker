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
