import { ensureDefaultCategories, listCategories } from '../../src/categories';
import {
  listExpenses,
  savePersonalExpense,
  subscribeToExpenses,
} from '../../src/ledger/expenses';
import {
  deleteTrashedExpenses,
  moveExpenseToTrash,
  restoreExpense,
} from '../../src/ledger/trash';
import { ensureLocalIdentity } from '../../src/shell/identity';
import { appMigrations } from '../../src/shell/migrations';
import { expenseTrashMigration } from '../../src/ledger/migrations';
import {
  initializeDatabase,
  runMigrations,
  type Database,
} from '../../src/storage';
import { openNodeDatabase } from '../../src/storage/node';

let database: Database;
beforeEach(() => {
  database = openNodeDatabase(':memory:');
});
afterEach(async () => {
  await database.close();
});

async function prepare(migrations = appMigrations) {
  return initializeDatabase(database, migrations, false, async (tx) => {
    const identity = await ensureLocalIdentity(tx);
    await ensureDefaultCategories(tx, identity.personalSpaceId);
    return identity;
  });
}

async function add(title: string, spaceId?: string) {
  const identity = await ensureLocalIdentity(database);
  if (spaceId) {
    identity.personalSpaceId = spaceId;
    identity.personalParticipantId = 'other-participant';
    await ensureDefaultCategories(database, spaceId);
  }
  const [category] = await listCategories(database, identity.personalSpaceId);
  await savePersonalExpense(database, identity, {
    title,
    amountMinor: 875,
    currency: 'USD',
    date: '2026-10-30',
    categoryId: category.id,
    note: 'Keep the original payment and share',
  });
  return (await listExpenses(database)).find(
    (expense) => expense.title === title,
  )!;
}

test('upgrading preserves existing expenses, payments, shares, row order and migration history', async () => {
  const previous = appMigrations.slice(
    0,
    appMigrations.indexOf(expenseTrashMigration),
  );
  const identity = await prepare(previous);
  const [category] = await listCategories(database, identity.personalSpaceId);
  // Seed the pre-trash schema: current save/read code also needs allocation positions.
  for (const title of ['First', 'Second']) {
    await database.run(
      `INSERT INTO expenses (id, title, amountMinor, currency, date, categoryId, categoryName, categoryColor, spaceId)
       VALUES (?, ?, 875, 'USD', '2026-10-30', ?, ?, ?, ?)`,
      [
        title,
        title,
        category.id,
        category.name,
        category.color,
        identity.personalSpaceId,
      ],
    );
    for (const table of ['expense_payments', 'expense_shares'])
      await database.run(`INSERT INTO ${table} VALUES (?, ?, 875)`, [
        title,
        identity.personalParticipantId,
      ]);
  }
  const before = await database.all<Record<string, unknown>>(
    'SELECT rowid, * FROM expenses ORDER BY rowid',
  );
  const allocations = await Promise.all(
    ['expense_payments', 'expense_shares'].map((table) =>
      database.all<Record<string, unknown>>(
        `SELECT * FROM ${table} ORDER BY rowid`,
      ),
    ),
  );
  const migrations = await database.all(
    'SELECT * FROM _migrations ORDER BY position',
  );

  await runMigrations(database, appMigrations);

  expect(
    await database.all('SELECT rowid, * FROM expenses ORDER BY rowid'),
  ).toEqual(before.map((row) => ({ ...row, trashOrder: null })));
  for (const [index, table] of ['expense_payments', 'expense_shares'].entries())
    expect(await database.all(`SELECT * FROM ${table} ORDER BY rowid`)).toEqual(
      allocations[index].map((row) => ({ ...row, position: 0 })),
    );
  expect(
    await database.all('SELECT * FROM _migrations ORDER BY position LIMIT ?', [
      previous.length,
    ]),
  ).toEqual(migrations);
  expect(await database.all('SELECT trashOrder FROM expenses')).toEqual([
    { trashOrder: null },
    { trashOrder: null },
  ]);
});

test('permanent deletion cascades only through trashed expenses of the requested space', async () => {
  const identity = await prepare();
  const active = await add('Active');
  const deleted = await add('Deleted');
  const other = await add('Other space', 'other-space');
  await moveExpenseToTrash(database, identity.personalSpaceId, deleted.id);
  await moveExpenseToTrash(database, other.spaceId, other.id);

  expect(
    await deleteTrashedExpenses(database, identity.personalSpaceId, active.id),
  ).toBe(false);
  expect(
    await deleteTrashedExpenses(database, identity.personalSpaceId, other.id),
  ).toBe(false);
  expect(
    await restoreExpense(database, identity.personalSpaceId, other.id),
  ).toBe(false);
  expect(await deleteTrashedExpenses(database, identity.personalSpaceId)).toBe(
    true,
  );

  const retained = [active.id, other.id].sort();
  expect((await listExpenses(database)).map(({ id }) => id).sort()).toEqual(
    retained,
  );
  for (const table of ['expense_payments', 'expense_shares']) {
    const rows = await database.all<{ expenseId: string; amountMinor: number }>(
      `SELECT expenseId, amountMinor FROM ${table} ORDER BY expenseId`,
    );
    expect(rows).toEqual(
      retained.map((expenseId) => ({ expenseId, amountMinor: 875 })),
    );
  }
  expect(await database.all('PRAGMA foreign_key_check')).toEqual([]);
});

test('a failure after deleting the rows rolls back the expense and its dependent rows without notifying screens', async () => {
  const identity = await prepare();
  const expense = await add('Coffee');
  await moveExpenseToTrash(database, identity.personalSpaceId, expense.id);
  const before = await listExpenses(database);
  const failing: Database = {
    ...database,
    transaction: (work) =>
      database.transaction(async (tx) => {
        await work(tx);
        throw new Error('Cannot finish the transaction');
      }),
  };
  const changed = jest.fn();
  const unsubscribe = subscribeToExpenses(failing, changed);

  await expect(
    deleteTrashedExpenses(failing, identity.personalSpaceId),
  ).rejects.toThrow('Cannot finish the transaction');

  expect(await listExpenses(database)).toEqual(before);
  expect(changed).not.toHaveBeenCalled();
  unsubscribe();
});

test('repeated moves and restores publish only committed changes and preserve the original expense', async () => {
  const identity = await prepare();
  const expense = await add('Coffee');
  const changed = jest.fn();
  const unsubscribe = subscribeToExpenses(database, changed);

  expect(await moveExpenseToTrash(database, 'another-space', expense.id)).toBe(
    false,
  );
  expect(
    await moveExpenseToTrash(database, identity.personalSpaceId, expense.id),
  ).toBe(true);
  expect(
    await moveExpenseToTrash(database, identity.personalSpaceId, expense.id),
  ).toBe(false);
  expect(
    await restoreExpense(database, identity.personalSpaceId, expense.id),
  ).toBe(true);
  expect(
    await restoreExpense(database, identity.personalSpaceId, expense.id),
  ).toBe(false);

  expect(await listExpenses(database)).toEqual([expense]);
  expect(changed).toHaveBeenCalledTimes(2);
  unsubscribe();
});
