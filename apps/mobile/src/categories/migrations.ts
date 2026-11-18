export const categoryMigrations: readonly string[] = [
  `CREATE TABLE categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    isDefault INTEGER NOT NULL CHECK (isDefault IN (0, 1)),
    position INTEGER NOT NULL UNIQUE,
    createdByUserId TEXT,
    spaceId TEXT NOT NULL,
    CHECK (isDefault = 1 OR (createdByUserId IS NOT NULL AND spaceId IS NOT NULL))
  )`,
  `ALTER TABLE categories ADD COLUMN isArchived INTEGER NOT NULL DEFAULT 0
    CHECK (isArchived IN (0, 1))`,
];

// Received categories have no creator user ID. Remember which seeded row is
// Uncategorized even when another default category is later given that name.
export const syncedCategoriesMigration = `
  PRAGMA defer_foreign_keys = ON;
  CREATE TEMP TABLE saved_categories AS SELECT rowid AS originalRowid, * FROM categories;
  DROP TABLE categories;
  CREATE TABLE categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    isDefault INTEGER NOT NULL CHECK (isDefault IN (0, 1)),
    position INTEGER NOT NULL UNIQUE,
    createdByUserId TEXT,
    spaceId TEXT NOT NULL,
    isArchived INTEGER NOT NULL DEFAULT 0 CHECK (isArchived IN (0, 1)),
    isUncategorized INTEGER NOT NULL DEFAULT 0 CHECK (isUncategorized IN (0, 1))
  );
  INSERT INTO categories (rowid, id, name, color, isDefault, position, createdByUserId, spaceId, isArchived, isUncategorized)
    SELECT originalRowid, id, name, color, isDefault, position, createdByUserId, spaceId, isArchived,
           isDefault AND name = 'Uncategorized' FROM saved_categories;
  CREATE UNIQUE INDEX categories_uncategorized ON categories (spaceId) WHERE isUncategorized = 1;
  DROP TABLE saved_categories;
`;
