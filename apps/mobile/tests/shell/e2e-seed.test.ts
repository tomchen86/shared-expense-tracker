import { availableCategoryColors, toLocalDate } from '@shared-expense/domain';
import { ensureDefaultCategories, listCategories } from '../../src/categories';
import { listGroups } from '../../src/groups';
import { listExpenses } from '../../src/ledger/expenses';
import { applySeed, type Seed } from '../../src/shell/e2e-seed';
import { ensureLocalIdentity } from '../../src/shell/identity';
import { appMigrations } from '../../src/shell/migrations';
import { initializeDatabase, type Database } from '../../src/storage';
import { openNodeDatabase } from '../../src/storage/node';

jest.mock('expo-localization', () => ({
  getLocales: () => [{ currencyCode: 'AUD' }],
}));

let database: Database;
beforeEach(() => {
  database = openNodeDatabase(':memory:');
});
afterEach(async () => {
  await database.close();
});

test('writes a seed as the screens would leave it', async () => {
  const initial = await initializeDatabase(
    database,
    appMigrations,
    false,
    async (tx) => {
      const identity = await ensureLocalIdentity(tx);
      await ensureDefaultCategories(tx, identity.personalSpaceId);
      return identity;
    },
  );
  const defaults = await listCategories(database, initial.personalSpaceId);

  const identity = await applySeed(database, initial, {
    name: 'Taylor',
    groups: [
      { name: 'Brisbane', members: ['Casey', 'Blake'] },
      { name: 'Tokyo', archived: true },
    ],
    categories: [
      { name: 'Scroll 1' },
      { name: 'Flights', group: 'Brisbane' },
      { name: 'Travel', archived: true },
    ],
    expenses: [
      {
        title: 'Train',
        amount: '3',
        date: '2026-10-15',
        category: 'Health',
        note: 'Platform 2',
      },
      {
        title: 'Dinner',
        amount: '100.01',
        group: 'Brisbane',
        category: 'Flights',
        paidBy: 'Casey',
        splitBetween: ['Taylor', 'Casey'],
      },
      { title: 'Coffee run', amount: '8.75', trashed: true },
    ],
  });

  expect(identity.name).toBe('Taylor');
  expect((await ensureLocalIdentity(database)).name).toBe('Taylor');

  const groups = await listGroups(database);
  expect(
    groups.map(({ name, archived, members }) => ({
      name,
      archived,
      members: members.map((member) => member.name),
    })),
  ).toEqual([
    {
      name: 'Brisbane',
      archived: false,
      members: ['Taylor', 'Casey', 'Blake'],
    },
    { name: 'Tokyo', archived: true, members: ['Taylor'] },
  ]);
  const [brisbane] = groups;
  const [taylor, casey] = brisbane.members;

  const personal = await listCategories(database, identity.personalSpaceId);
  expect(
    personal.find((category) => category.name === 'Scroll 1'),
  ).toMatchObject({
    color: availableCategoryColors(defaults)[0],
    isArchived: false,
  });
  expect(personal.find((category) => category.name === 'Travel')).toMatchObject(
    {
      isDefault: true,
      isArchived: true,
    },
  );
  const flights = (await listCategories(database, brisbane.id)).find(
    (category) => category.name === 'Flights',
  );
  expect(flights).toBeDefined();

  const expenses = await listExpenses(database);
  const named = (title: string) =>
    expenses.find((expense) => expense.title === title)!;
  expect(named('Train')).toMatchObject({
    amountMinor: 300,
    currency: 'AUD',
    date: '2026-10-15',
    category: { name: 'Health' },
    note: 'Platform 2',
    spaceId: identity.personalSpaceId,
  });
  expect(named('Dinner')).toMatchObject({
    amountMinor: 10001,
    spaceId: brisbane.id,
    category: { id: flights!.id },
    payments: [{ participant: casey.id, amountMinor: 10001 }],
  });
  expect(named('Dinner').shares.map((share) => share.participant)).toEqual([
    taylor.id,
    casey.id,
  ]);
  expect(named('Coffee run')).toMatchObject({
    date: toLocalDate(
      new Date(),
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    ),
    category: { name: defaults[0].name },
    trashOrder: 1,
  });
  expect(named('Train').trashOrder).toBeUndefined();
});

test('fails on a name the seed does not define, or a field it does not have', async () => {
  const identity = await initializeDatabase(
    database,
    appMigrations,
    false,
    ensureLocalIdentity,
  );

  await expect(
    applySeed(database, identity, {
      expenses: [{ title: 'Dinner', amount: '12', group: 'Brisbane' }],
    }),
  ).rejects.toThrow('The seed names Brisbane, which is not there');
  await expect(
    // A flow's JSON can have any field, which only the check finds.
    applySeed(database, identity, {
      expenses: [{ title: 'Dinner', amount: '12', paid_by: 'Casey' }],
    } as unknown as Seed),
  ).rejects.toThrow("The seed's expenses have no field paid_by");
});
