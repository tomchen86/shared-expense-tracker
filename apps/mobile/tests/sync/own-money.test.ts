import { randomUUID } from 'node:crypto';
import type { SyncMoney, SyncStamp } from '@shared-expense/domain';
import {
  ensureDefaultCategories,
  listCategories,
} from '../../src/categories/repository';
import {
  addGroupMember,
  createGroup,
  listGroups,
  removeGroupMember,
} from '../../src/groups';
import {
  listExpenses,
  listExpensesForCards,
  readExpenseToEdit,
  saveExpense,
  type GroupSplit,
} from '../../src/ledger/expenses';
import { keepCurrentMoney, restoreOwnMoney } from '../../src/ledger/review';
import {
  ensureLocalIdentity,
  type LocalIdentity,
} from '../../src/shell/identity';
import { appMigrations } from '../../src/shell/migrations';
import { initializeDatabase, type Database } from '../../src/storage';
import { openNodeDatabase } from '../../src/storage/node';
import {
  applySyncEvents,
  listUnsentSyncEvents,
  shareGroup,
} from '../../src/sync';

// What the phone keeps of its own money changes and does with a form's save, beyond what
// the acceptance tests of docs/specs/sync/spec.md reach through the screens: Trip is a
// shared ledger of three whose Dinner this phone added, so the phone holds an own money
// change of it.

let database: Database;
let identity: LocalIdentity;
let split: GroupSplit;
let input: Parameters<typeof saveExpense>[2];
let dinnerId: string;

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
    amountMinor: 12000,
    currency: 'USD',
    date: '2026-10-30',
    categoryId: category.id,
  };
  await shareGroup(database, { groupId: group.id, device: 'phone' });
  await saveExpense(database, identity, input, undefined, split);
  dinnerId = (await stored()).id;
});
afterEach(async () => database.close());

async function stored() {
  const [expense] = await listExpenses(database, split.groupId);
  return expense;
}

const moneyOf = ({
  amountMinor,
  currency,
  payments,
  shares,
}: SyncMoney): SyncMoney => ({ amountMinor, currency, payments, shares });

/** A money group of `amountMinor`, paid by the form's payer and shared by `sharers` in thirds. */
const money = (
  amountMinor: number,
  sharers = split.participants,
): SyncMoney => ({
  amountMinor,
  currency: 'USD',
  payments: [{ participant: split.payerId, amountMinor }],
  shares: sharers.map((participant) => ({
    participant,
    amountMinor: amountMinor / sharers.length,
  })),
});

let later = 0;

/** Hands the phone another phone's change of Dinner's money, written without a base. */
async function receiveMoney(value: SyncMoney, base?: SyncStamp) {
  later += 60_000;
  const stamp = { ms: Date.now() + later, counter: 0, device: 'remote' };
  await applySyncEvents(database, split.groupId, [
    {
      id: randomUUID(),
      device: stamp.device,
      receivedAtMs: stamp.ms,
      content: {
        version: 1,
        stamp,
        type: 'expense',
        id: dinnerId,
        units: { money: base ? { value, base } : { value } },
      },
    },
  ]);
  return stamp;
}

/** The money the user entered, while Dinner needs review. */
const toReview = async () =>
  (await listExpensesForCards(database)).find(({ id }) => id === dinnerId)
    ?.yours;

const eventUnits = async () =>
  (await listUnsentSyncEvents(database)).map(({ content }) =>
    'units' in content ? Object.keys(content.units) : content,
  );

test('Use Mine and Keep Current do nothing to an expense that is settled already', async () => {
  const theirs = await receiveMoney(money(9000));
  expect(await toReview()).toEqual(money(12000));

  await restoreOwnMoney(database, dinnerId);
  const settled = await stored();
  const events = await listUnsentSyncEvents(database);
  expect(moneyOf(settled)).toEqual(money(12000));
  expect(events).toHaveLength(2);
  expect(await toReview()).toBeUndefined();

  // A second press, on details that still showed the block.
  await restoreOwnMoney(database, dinnerId);
  await keepCurrentMoney(database, dinnerId);
  expect(await stored()).toEqual(settled);
  expect(await listUnsentSyncEvents(database)).toEqual(events);

  // Keep Current did not forget the change Use Mine made: one that had not seen it is marked.
  await receiveMoney(money(6000), theirs);
  expect(await toReview()).toEqual(money(12000));
});

test('Keep Current forgets the own change, so the next unseen change is not marked', async () => {
  await receiveMoney(money(9000));

  await keepCurrentMoney(database, dinnerId);
  await receiveMoney(money(6000));

  expect(moneyOf(await stored())).toEqual(money(6000));
  expect(await toReview()).toBeUndefined();
  expect(await eventUnits()).toHaveLength(1);
});

test('a form saves its title and leaves the money of an expense that a former member shares, whatever its amount field says', async () => {
  const opened = (await readExpenseToEdit(database, dinnerId))!;
  const [, , blake] = (await listGroups(database))[0].members;
  await removeGroupMember(database, split.groupId, blake.id);
  await receiveMoney(money(9000), opened.units!.money!.stamp);

  await saveExpense(
    database,
    identity,
    { ...input, title: 'Supper', amountMinor: 7000 },
    opened.expense,
    split,
    opened.units,
  );

  expect(await stored()).toMatchObject({ title: 'Supper', ...money(9000) });
  expect((await eventUnits()).at(-1)).toEqual(['title']);
});

test('a form that changed the money is refused when its payer has left the group since it opened, and saves once it leaves the money alone', async () => {
  const opened = (await readExpenseToEdit(database, dinnerId))!;
  const [blake, taylor] = split.participants;
  // While the form is open, another phone takes Casey out of the money, and Casey leaves.
  await receiveMoney(
    {
      ...money(9000, [blake, taylor]),
      payments: [{ participant: taylor, amountMinor: 9000 }],
    },
    opened.units!.money!.stamp,
  );
  await removeGroupMember(database, split.groupId, split.payerId);
  const current = await stored();
  const save = (changes: Partial<typeof input>) =>
    saveExpense(
      database,
      identity,
      { ...input, ...changes },
      opened.expense,
      split,
      opened.units,
    );

  await expect(save({ amountMinor: 7000 })).rejects.toThrow('Member not found');
  expect(await stored()).toEqual(current);

  await save({ title: 'Supper' });
  expect(await stored()).toEqual({ ...current, title: 'Supper' });
  expect(current.amountMinor).toBe(9000);
  expect((await eventUnits()).at(-1)).toEqual(['title']);
});

test('a form saves a changed amount in the currency it opened with, and leaves a currency another phone set when it changes only the title', async () => {
  const opened = (await readExpenseToEdit(database, dinnerId))!;
  const yen = { ...money(9000), currency: 'JPY' };
  await receiveMoney(yen, opened.units!.money!.stamp);
  const save = (changes: Partial<typeof input>) =>
    saveExpense(
      database,
      identity,
      { ...input, ...changes },
      opened.expense,
      split,
      opened.units,
    );

  await save({ title: 'Supper' });
  expect(await stored()).toMatchObject({ title: 'Supper', ...yen });

  await save({ amountMinor: 6000 });
  expect(await stored()).toMatchObject({ title: 'Supper', ...money(6000) });
  expect((await eventUnits()).slice(-2)).toEqual([['title'], ['money']]);
});

test('reads no units with a personal expense, and nothing for an expense that is not there', async () => {
  const [category] = await listCategories(database, identity.personalSpaceId);
  await saveExpense(database, identity, { ...input, categoryId: category.id });
  const [personal] = await listExpenses(database, identity.personalSpaceId);

  expect(await readExpenseToEdit(database, personal.id)).toEqual({
    expense: personal,
    units: undefined,
  });
  expect(await readExpenseToEdit(database, 'missing')).toBeUndefined();
  expect((await readExpenseToEdit(database, dinnerId))?.units).toMatchObject({
    money: { value: money(12000) },
    title: { value: 'Dinner' },
  });
});
