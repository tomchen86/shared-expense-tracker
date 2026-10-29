export const categoryMigrations: readonly string[] = [
  `CREATE TABLE categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    isDefault INTEGER NOT NULL CHECK (isDefault IN (0, 1)),
    position INTEGER NOT NULL UNIQUE
  )`,
];
