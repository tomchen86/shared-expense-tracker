export const groupMigrations: readonly string[] = [
  `CREATE TABLE groups (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    position INTEGER NOT NULL UNIQUE
  );
  CREATE TABLE group_members (
    id TEXT PRIMARY KEY NOT NULL,
    groupId TEXT NOT NULL REFERENCES groups(id),
    userId TEXT NOT NULL,
    name TEXT NOT NULL
  )`,
  `CREATE TABLE group_members_next (
    id TEXT PRIMARY KEY NOT NULL,
    groupId TEXT NOT NULL REFERENCES groups(id),
    userId TEXT,
    name TEXT NOT NULL,
    position INTEGER NOT NULL,
    removed INTEGER NOT NULL DEFAULT 0 CHECK (removed IN (0, 1)),
    UNIQUE (groupId, position)
  );
  INSERT INTO group_members_next (id, groupId, userId, name, position)
    SELECT id, groupId, userId, name, rowid FROM group_members;
  DROP TABLE group_members;
  ALTER TABLE group_members_next RENAME TO group_members`,
];

export const groupArchiveMigration = `ALTER TABLE groups
  ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))`;
