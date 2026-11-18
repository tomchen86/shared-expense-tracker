export const categoryMigrations: readonly string[] = [
  // A category has no creator when another phone added it. isUncategorized marks a space's
  // reserved category: its name cannot, since an applied event may give that name to another.
  `CREATE TABLE categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    isDefault INTEGER NOT NULL CHECK (isDefault IN (0, 1)),
    position INTEGER NOT NULL UNIQUE,
    createdByUserId TEXT,
    spaceId TEXT NOT NULL,
    isUncategorized INTEGER NOT NULL DEFAULT 0 CHECK (isUncategorized IN (0, 1))
  );
  CREATE UNIQUE INDEX categories_uncategorized ON categories (spaceId) WHERE isUncategorized = 1`,
  `ALTER TABLE categories ADD COLUMN isArchived INTEGER NOT NULL DEFAULT 0
    CHECK (isArchived IN (0, 1))`,
];
