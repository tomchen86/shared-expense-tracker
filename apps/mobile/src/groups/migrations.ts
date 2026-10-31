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
];
