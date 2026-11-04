import { ensureDefaultCategories, listCategories } from '../../src/categories';
import { categoryMigrations } from '../../src/categories/migrations';
import {
  deleteCategory,
  moveAndArchiveCategory,
  setCategoryArchived,
} from '../../src/categories/repository';
import { listExpenses, savePersonalExpense } from '../../src/ledger/expenses';
import { ensureLocalIdentity } from '../../src/shell/identity';
import { appMigrations } from '../../src/shell/migrations';
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

test('upgrades an existing database without changing its categories, identity or expenses', async () => {
  const identity = await prepare(
    appMigrations.slice(0, appMigrations.indexOf(categoryMigrations[1])),
  );
  const before = await database.all<{ id: string }>(
    'SELECT * FROM categories ORDER BY position',
  );
  // Seed the old schema directly: today's save and read code uses later migrations.
  await database.run(
    `INSERT INTO expenses (id, title, amountMinor, currency, date, categoryId, categoryName, categoryColor, spaceId)
     SELECT 'lunch', 'Lunch', 1250, 'USD', '2026-11-01', id, name, color, spaceId FROM categories WHERE id = ?`,
    [before[0].id],
  );
  for (const table of ['expense_payments', 'expense_shares'])
    await database.run(`INSERT INTO ${table} VALUES ('lunch', ?, 1250)`, [
      identity.personalParticipantId,
    ]);
  const expenses = await database.all<Record<string, unknown>>(
    'SELECT * FROM expenses',
  );

  await runMigrations(database, appMigrations);

  expect(
    await database.all('SELECT * FROM categories ORDER BY position'),
  ).toEqual(before.map((row) => ({ ...row, isArchived: 0 })));
  expect(await ensureLocalIdentity(database)).toEqual(identity);
  expect(await database.all('SELECT * FROM expenses')).toEqual(
    expenses.map((expense) => ({ ...expense, trashOrder: null })),
  );
  const [lunch] = await listExpenses(database);
  expect(lunch.payments).toEqual([
    { participant: identity.personalParticipantId, amountMinor: 1250 },
  ]);
  expect(lunch.shares).toEqual(lunch.payments);
});

test('rejects reserved, missing, archived and wrong-space mutation targets without changing expenses', async () => {
  const identity = await prepare();
  await database.transaction((tx) =>
    ensureDefaultCategories(tx, 'other-space'),
  );
  const [source, target, archived, ...rest] = await listCategories(
    database,
    identity.personalSpaceId,
  );
  const reserved = rest.find((row) => row.name === 'Uncategorized')!;
  const [otherSpace] = await listCategories(database, 'other-space');
  await setCategoryArchived(database, archived.id, true);
  await savePersonalExpense(database, identity, {
    title: 'Lunch',
    amountMinor: 1250,
    currency: 'USD',
    date: '2026-11-01',
    categoryId: source.id,
  });
  await savePersonalExpense(database, identity, {
    title: 'Unknown',
    amountMinor: 300,
    currency: 'USD',
    date: '2026-11-01',
    categoryId: reserved.id,
  });
  const categories = await listCategories(database);
  const expenses = await listExpenses(database);

  for (const id of [reserved.id, 'missing']) {
    await expect(setCategoryArchived(database, id, true)).rejects.toThrow();
    await expect(deleteCategory(database, id)).rejects.toThrow();
    await expect(
      moveAndArchiveCategory(database, id, target.id),
    ).rejects.toThrow();
  }
  for (const id of [source.id, archived.id, otherSpace.id, 'missing']) {
    await expect(
      moveAndArchiveCategory(database, source.id, id),
    ).rejects.toThrow();
  }
  await expect(
    moveAndArchiveCategory(database, archived.id, target.id),
  ).rejects.toThrow();
  await expect(deleteCategory(database, source.id)).rejects.toThrow();
  expect(await listCategories(database)).toEqual(categories);
  expect(await listExpenses(database)).toEqual(expenses);
});
