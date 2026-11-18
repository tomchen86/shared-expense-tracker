import {
  compareSyncStamps,
  syncRecordValues,
  type SyncRecord,
  type SyncStamp,
} from '@shared-expense/domain';
import {
  ensureDefaultCategories,
  listCategories,
  setCategoryArchived,
  updateCategory,
} from '../categories/repository';
import {
  addGroupMember,
  createGroup,
  listGroups,
  removeGroupMember,
  setGroupArchived,
} from '../groups';
import { ensureLocalIdentity, type LocalIdentity } from '../shell/identity';
import { appMigrations } from '../shell/migrations';
import { initializeDatabase, type Database } from '../storage';
import { openNodeDatabase } from '../storage/node';
import { listUnsentSyncEvents, shareGroup } from '../sync';
import { moveExpenseToTrash } from './trash';
import {
  ArchivedExpenseError,
  listExpenses,
  saveExpense,
  type Expense,
  type GroupSplit,
} from './expenses';

let database: Database;
let identity: LocalIdentity;
let split: GroupSplit;
let input: Parameters<typeof saveExpense>[2];

beforeEach(async () => {
  database = openNodeDatabase(':memory:');
  identity = await initializeDatabase(
    database,
    appMigrations,
    false,
    async (tx) => {
      const local = await ensureLocalIdentity(tx);
      await ensureDefaultCategories(tx, local.personalSpaceId);
      return { ...local, name: 'Taylor' };
    },
  );
  await createGroup(database, 'Trip', identity);
  const [group] = await listGroups(database);
  await addGroupMember(database, group.id, 'Casey');
  await addGroupMember(database, group.id, 'Blake');
  const [{ members }] = await listGroups(database);
  const [category] = await listCategories(database, group.id);
  split = {
    groupId: group.id,
    payerId: members[1].id,
    participants: [members[2].id, members[0].id, members[1].id],
  };
  input = {
    title: 'Dinner',
    amountMinor: 10001,
    currency: 'USD',
    date: '2026-10-30',
    categoryId: category.id,
  };
});
afterEach(async () => database.close());

async function stored() {
  const [expense] = await listExpenses(database);
  return expense;
}

async function save(existing?: Expense) {
  await saveExpense(database, identity, input, existing, split);
  return stored();
}

const shareTrip = () =>
  shareGroup(database, { groupId: split.groupId, device: 'phone' });

test('sharing seeds the stored units of just the group, including removed members, archived categories and trash', async () => {
  const dinner = await save();
  const [trip] = await listGroups(database);
  const [you, casey, blake] = trip.members;
  await removeGroupMember(database, trip.id, blake.id);
  await removeGroupMember(database, trip.id, casey.id);
  await setCategoryArchived(database, input.categoryId, true);
  await moveExpenseToTrash(database, identity.personalSpaceId, dinner.id);
  await createGroup(database, 'Other', identity);

  const rows = () =>
    database.all<{ created: string; record: string }>(
      'SELECT created, record FROM sync_records',
    );
  await database.exec(`CREATE TRIGGER reject_clock BEFORE INSERT ON sync_clock
    BEGIN SELECT RAISE(ABORT, 'clock write failed'); END`);
  await expect(shareTrip()).rejects.toThrow('clock write failed');
  expect(await rows()).toEqual([]);
  expect(await database.all('SELECT * FROM sync_groups')).toEqual([]);
  await database.exec('DROP TRIGGER reject_clock');

  await shareTrip();
  const seeded = await rows();
  const records = seeded
    .map((row) => ({
      created: JSON.parse(row.created) as SyncStamp,
      record: JSON.parse(row.record) as SyncRecord,
    }))
    .sort((a, b) => compareSyncStamps(a.created, b.created));
  for (const { record, created } of records) {
    for (const unit of Object.values(record.units))
      expect(unit.stamp).toEqual(created);
  }
  expect(new Set(seeded.map((row) => row.created)).size).toBe(records.length);
  const ofType = (type: SyncRecord['type']) =>
    records
      .filter(({ record }) => record.type === type)
      .map(({ record }) => [record.id, syncRecordValues(record)]);
  expect(ofType('group')).toEqual([[trip.id, { name: trip.name }]]);
  expect(ofType('member')).toEqual(
    [you, blake, casey].map((member) => [
      member.id,
      { name: member.name, removed: member.id !== you.id },
    ]),
  );
  const categories = await listCategories(database, trip.id);
  expect(ofType('category')).toEqual(
    categories.map(({ id, name, color, isArchived }) => [
      id,
      { name, color, archived: isArchived },
    ]),
  );
  expect(ofType('expense')).toEqual([
    [
      dinner.id,
      {
        title: dinner.title,
        date: dinner.date,
        note: null,
        category: dinner.category,
        money: {
          amountMinor: dinner.amountMinor,
          currency: dinner.currency,
          payments: dinner.payments,
          shares: dinner.shares,
        },
        trashed: true,
      },
    ],
  ]);
  await shareTrip();
  expect(await rows()).toEqual(seeded);
  expect(await listUnsentSyncEvents(database)).toEqual([]);
});

test('a shared expense keeps its category snapshot until a different category is saved', async () => {
  const dinner = await save();
  await shareTrip();
  const meals = { id: input.categoryId, name: 'Meals', color: '#43A047' };
  await updateCategory(database, meals);
  input.title = 'Supper';
  const supper = await save(dinner);
  expect(supper.category).toEqual(dinner.category);
  const [, next] = await listCategories(database, split.groupId);
  input.categoryId = next.id;
  await save(supper);
  input.categoryId = meals.id;
  expect((await save(supper)).category).toEqual(meals);
  const events = (await listUnsentSyncEvents(database))
    .map(({ content }) => content)
    .filter((event) => event.type === 'expense' && 'units' in event);
  expect(events.map((event) => Object.keys(event.units))).toEqual([
    ['title'],
    ['category'],
    ['category'],
  ]);
});

test('writes in either shared group follow the same clock when the wall clock goes back', async () => {
  const clock = jest.spyOn(Date, 'now').mockReturnValue(1_000);
  try {
    await shareTrip();
    clock.mockReturnValue(2_000);
    const dinner = await save();
    clock.mockReturnValue(900);
    await createGroup(database, 'Other', identity);
    const [, other] = await listGroups(database);
    await shareGroup(database, { groupId: other.id, device: 'phone' });
    const [category] = await listCategories(database, other.id);
    const payer = other.members[0].id;
    await saveExpense(
      database,
      identity,
      { ...input, categoryId: category.id },
      undefined,
      {
        groupId: other.id,
        payerId: payer,
        participants: [payer],
      },
    );
    input.title = 'Supper';
    await save(dinner);
    const events = await listUnsentSyncEvents(database);
    expect(events.map(({ groupId }) => groupId)).toEqual([
      split.groupId,
      other.id,
      split.groupId,
    ]);
    const stamps = events.map(({ content }) => content.stamp);
    expect(stamps.map(({ ms }) => ms)).toEqual([2_000, 2_000, 2_000]);
    expect(stamps[1].counter).toBeGreaterThan(stamps[0].counter);
    expect(stamps[2].counter).toBe(stamps[1].counter + 1);
  } finally {
    clock.mockRestore();
  }
});

test('rejects a local event with unsupported money in the expense transaction', async () => {
  await shareTrip();
  input.currency = 'XYZ';
  await expect(save()).rejects.toThrow('Invalid local sync event');
  expect(await listExpenses(database)).toEqual([]);
  expect(await listUnsentSyncEvents(database)).toEqual([]);
});

test.each([
  'empty split',
  'duplicate member',
  'foreign payer',
  'foreign sharer',
  'removed sharer',
  'missing group',
  'zero amount',
  'fractional minor units',
  'overflow',
])('rejects %s without storing any expense or allocation', async (invalid) => {
  if (invalid === 'empty split') split.participants = [];
  if (invalid === 'duplicate member')
    split.participants.push(split.participants[0]);
  if (invalid === 'foreign payer')
    split.payerId = identity.personalParticipantId;
  if (invalid === 'foreign sharer')
    split.participants.push(identity.personalParticipantId);
  if (invalid === 'removed sharer')
    await removeGroupMember(database, split.groupId, split.participants[0]);
  if (invalid === 'missing group') split.groupId = 'missing';
  if (invalid === 'zero amount') input.amountMinor = 0;
  if (invalid === 'fractional minor units') input.amountMinor = 1.5;
  if (invalid === 'overflow') input.amountMinor = 1000000000000;
  await expect(save()).rejects.toThrow();
  expect(await listExpenses(database)).toEqual([]);
  expect(await database.all('SELECT * FROM expense_payments')).toEqual([]);
  expect(await database.all('SELECT * FROM expense_shares')).toEqual([]);
});

test('rejects a category from another space and a missing category without changing the expense', async () => {
  const before = await save();
  const [personalCategory] = await listCategories(
    database,
    identity.personalSpaceId,
  );
  for (const categoryId of [personalCategory.id, 'missing']) {
    input.categoryId = categoryId;
    await expect(save(before)).rejects.toThrow('Category not found');
    expect(await stored()).toEqual(before);
  }
});

test('checks archival inside the transaction even if the form opened before archival', async () => {
  const before = await save();
  await setGroupArchived(database, split.groupId, true);
  input.title = 'Changed';
  await expect(save(before)).rejects.toBeInstanceOf(ArchivedExpenseError);
  expect(await stored()).toEqual(before);
});

test('rejects editing an expense that no longer exists without leaving new allocations', async () => {
  const before = await save();
  await database.run('DELETE FROM expenses WHERE id = ?', [before.id]);
  await expect(save(before)).rejects.toThrow('Expense not found');
  expect(await listExpenses(database)).toEqual([]);
  expect(await database.all('SELECT * FROM expense_payments')).toEqual([]);
  expect(await database.all('SELECT * FROM expense_shares')).toEqual([]);
});

test('keeps original allocations and amount when a former member locks financial edits', async () => {
  const before = await save();
  await removeGroupMember(database, split.groupId, split.participants[0]);
  input.amountMinor = 9000;
  input.title = 'Supper';
  split.participants = [split.payerId];
  await save(before);
  expect(await stored()).toEqual({ ...before, title: 'Supper' });
});

test('rejects moving an existing group expense to a different group or to personal space', async () => {
  const before = await save();
  await expect(saveExpense(database, identity, input, before)).rejects.toThrow(
    'cannot change spaces',
  );
  split.groupId = 'different';
  await expect(save(before)).rejects.toThrow('cannot change spaces');
  expect(await stored()).toEqual(before);
});

test('rolls back an edit after every possible partial write, retaining allocations and their order', async () => {
  const before = await save();
  input.amountMinor = 10000;
  input.title = 'Supper';
  input.currency = 'JPY';
  for (let failAfter = 1; failAfter <= 7; failAfter += 1) {
    let writes = 0;
    const failing: Database = {
      ...database,
      transaction: (body) =>
        database.transaction((tx) =>
          body({
            ...tx,
            run: async (sql, parameters) => {
              const result = await tx.run(sql, parameters);
              if (++writes === failAfter) throw new Error('write failed');
              return result;
            },
          }),
        ),
    };
    await expect(
      saveExpense(failing, identity, input, before, split),
    ).rejects.toThrow('write failed');
    expect(await stored()).toEqual(before);
  }
  await save(before);
  const after = await stored();
  expect(after.id).toBe(before.id);
  expect(after.currency).toBe('USD');
  expect(after.payments).toEqual([
    { participant: split.payerId, amountMinor: 10000 },
  ]);
  expect(after.shares).toEqual(
    split.participants.map((participant, index) => ({
      participant,
      amountMinor: index === 0 ? 3334 : 3333,
    })),
  );
});
