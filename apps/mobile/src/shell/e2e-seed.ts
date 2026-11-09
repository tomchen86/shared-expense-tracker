import {
  availableCategoryColors,
  parseAmount,
  toLocalDate,
} from '@shared-expense/domain';
import {
  createCategory,
  listCategories,
  setCategoryArchived,
} from '../categories/repository';
import {
  addGroupMember,
  createGroup,
  listGroups,
  setGroupArchived,
} from '../groups';
import { listExpenses, saveExpense } from '../ledger/expenses';
import { moveExpenseToTrash } from '../ledger/trash';
import { defaultCurrency } from '../ledger/use-expense-form';
import type { Database } from '../storage';
import { readLaunchSeed } from '../ui/launch-seed';
import { saveLocalName, type LocalIdentity } from './identity';

/**
 * The data an E2E flow starts from (ADR-0018). The app writes it through the functions the
 * screens use, in the order of these fields, so it ends up as the screens would leave it.
 */
export interface Seed {
  /** Your name, saved before any group exists. */
  name?: string;
  /** Each has you and then these members, in order. */
  groups?: { name: string; members?: string[]; archived?: boolean }[];
  /**
   * A new category in your personal space or a group's, with the first free color unless given.
   * A name the space already has, such as a default category's, only gets archived.
   */
  categories?: {
    name: string;
    group?: string;
    color?: string;
    archived?: boolean;
  }[];
  expenses?: {
    title: string;
    /** As typed in the form, in the form's currency, such as "8.75". */
    amount: string;
    /** YYYY-MM-DD; today unless given. */
    date?: string;
    /** The space's first category unless given, as in the form. */
    category?: string;
    note?: string;
    group?: string;
    /** Member names; you pay and everyone shares unless given. */
    paidBy?: string;
    splitBetween?: string[];
    /** Moved to Trash once every expense is saved, in this order. */
    trashed?: boolean;
  }[];
}

/** The fields of each part, so that a misspelled one fails the flow instead of doing nothing. */
const FIELDS = {
  seed: ['name', 'groups', 'categories', 'expenses'],
  groups: ['name', 'members', 'archived'],
  categories: ['name', 'group', 'color', 'archived'],
  expenses: [
    'title',
    'amount',
    'date',
    'category',
    'note',
    'group',
    'paidBy',
    'splitBetween',
    'trashed',
  ],
};

function checkFields(seed: Seed) {
  const check = (value: object, part: keyof typeof FIELDS) => {
    const unknown = Object.keys(value).filter(
      (key) => !FIELDS[part].includes(key),
    );
    if (unknown.length)
      throw new Error(`The seed's ${part} have no field ${unknown.join(', ')}`);
  };
  check(seed, 'seed');
  for (const part of ['groups', 'categories', 'expenses'] as const)
    for (const item of seed[part] ?? []) check(item, part);
}

export async function applySeed(
  database: Database,
  identity: LocalIdentity,
  seed: Seed,
): Promise<LocalIdentity> {
  checkFields(seed);
  const you = { ...identity, name: seed.name ?? identity.name };
  if (seed.name !== undefined) await saveLocalName(database, seed.name);
  for (const group of seed.groups ?? []) {
    await createGroup(database, group.name, you);
    const { id } = (await listGroups(database)).at(-1)!;
    for (const member of group.members ?? [])
      await addGroupMember(database, id, member);
  }
  const groups = await listGroups(database);
  const named = <T extends { name: string }>(items: T[], name: string) => {
    const item = items.find((candidate) => candidate.name === name);
    if (!item) throw new Error(`The seed names ${name}, which is not there`);
    return item;
  };
  const spaceOf = (group?: string) =>
    group === undefined ? you.personalSpaceId : named(groups, group).id;

  for (const category of seed.categories ?? []) {
    const spaceId = spaceOf(category.group);
    const existing = await listCategories(database, spaceId);
    if (existing.some((item) => item.name === category.name)) continue;
    await createCategory(database, {
      name: category.name,
      color: category.color ?? availableCategoryColors(existing)[0],
      createdByUserId: you.userId,
      spaceId,
    });
  }

  const currency = defaultCurrency();
  const today = toLocalDate(
    new Date(),
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  for (const expense of seed.expenses ?? []) {
    const group =
      expense.group === undefined ? undefined : named(groups, expense.group);
    const categories = (
      await listCategories(database, group?.id ?? you.personalSpaceId)
    ).filter((category) => !category.isArchived);
    const amountMinor = parseAmount(expense.amount, currency);
    if (amountMinor === undefined)
      throw new Error(`The seed's amount ${expense.amount} is not valid`);
    const member = (name: string) => named(group!.members, name).id;
    await saveExpense(
      database,
      you,
      {
        title: expense.title,
        amountMinor,
        currency,
        date: expense.date ?? today,
        categoryId:
          expense.category === undefined
            ? categories[0].id
            : named(categories, expense.category).id,
        note: expense.note,
      },
      undefined,
      group && {
        groupId: group.id,
        payerId:
          expense.paidBy === undefined
            ? group.members.find((item) => item.userId === you.userId)!.id
            : member(expense.paidBy),
        participants: (
          expense.splitBetween ?? group.members.map((item) => item.name)
        ).map(member),
      },
    );
  }

  for (const expense of seed.expenses ?? []) {
    if (!expense.trashed) continue;
    const saved = (await listExpenses(database)).find(
      (item) => item.title === expense.title && item.trashOrder === undefined,
    )!;
    await moveExpenseToTrash(database, you.personalSpaceId, saved.id);
  }
  for (const category of seed.categories ?? []) {
    if (!category.archived) continue;
    const spaceCategories = await listCategories(
      database,
      spaceOf(category.group),
    );
    await setCategoryArchived(
      database,
      named(spaceCategories, category.name).id,
      true,
    );
  }
  for (const group of seed.groups ?? [])
    if (group.archived)
      await setGroupArchived(database, named(groups, group.name).id, true);
  return you;
}

let launchSeedRead = false;

/** Writes the seed an E2E flow passed at launch, if any, once per launch. */
export async function seedFromLaunch(
  database: Database,
  identity: LocalIdentity,
): Promise<LocalIdentity> {
  if (launchSeedRead) return identity;
  launchSeedRead = true;
  const seed = await readLaunchSeed();
  return seed === undefined
    ? identity
    : applySeed(database, identity, JSON.parse(decodeURIComponent(seed)));
}
