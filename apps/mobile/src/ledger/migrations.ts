export const expenseMigrations: readonly string[] = [
  `CREATE TABLE expenses (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL CHECK (length(title) > 0),
    amountMinor INTEGER NOT NULL CHECK (typeof(amountMinor) = 'integer' AND amountMinor BETWEEN 1 AND 999999999999),
    currency TEXT NOT NULL,
    date TEXT NOT NULL,
    categoryId TEXT NOT NULL REFERENCES categories(id),
    categoryName TEXT NOT NULL,
    categoryColor TEXT NOT NULL,
    note TEXT,
    spaceId TEXT NOT NULL
  );
  CREATE TABLE expense_payments (
    expenseId TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    participant TEXT NOT NULL,
    amountMinor INTEGER NOT NULL CHECK (typeof(amountMinor) = 'integer' AND amountMinor BETWEEN 0 AND 999999999999),
    PRIMARY KEY (expenseId, participant)
  );
  CREATE TABLE expense_shares (
    expenseId TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    participant TEXT NOT NULL,
    amountMinor INTEGER NOT NULL CHECK (typeof(amountMinor) = 'integer' AND amountMinor BETWEEN 0 AND 999999999999),
    PRIMARY KEY (expenseId, participant)
  );`,
];

/** Keep allocation order explicit, including allocations written before this migration. */
export const expenseAllocationOrderMigration = `
  ALTER TABLE expense_payments ADD COLUMN position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0);
  ALTER TABLE expense_shares ADD COLUMN position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0);
  UPDATE expense_payments SET position = (
    SELECT COUNT(*) FROM expense_payments AS earlier
    WHERE earlier.expenseId = expense_payments.expenseId AND earlier.rowid < expense_payments.rowid
  );
  UPDATE expense_shares SET position = (
    SELECT COUNT(*) FROM expense_shares AS earlier
    WHERE earlier.expenseId = expense_shares.expenseId AND earlier.rowid < expense_shares.rowid
  );
`;
