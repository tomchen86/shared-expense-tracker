import {
  startTransition,
  useEffect,
  useMemo,
  useOptimistic,
  useState,
} from 'react';
import { Alert } from 'react-native';
import { useIsFocused } from 'expo-router/react-navigation';
import { useLocalDatabase, useLocalIdentity } from '../shell';
import type { Database } from '../storage';
import type { MenuFieldOption } from '../ui/menu-field';
import { useDisplayLocale } from '../ui/use-display-locale';
import { subscribeToExpenses } from './expenses';
import {
  NO_FILTER,
  hasFilter,
  passesFilter,
  type ListFilter,
} from './list-filter';
import { readListFilter, writeListFilter } from './list-filter-storage';
import type { ExpenseView, GroupWithFormerMembers } from './use-expenses';

type Update = (current: ListFilter) => ListFilter;
export type ChangeFilter = (update: Update) => void;
type FilterListener = (
  database: Database,
  spaceId: string,
  filter: ListFilter,
) => void;
const listeners = new Set<FilterListener>();

/** Each write reads the current choices inside the same transaction, including rapid edits from a native control. */
function useRememberedFilter(spaceId: string) {
  const database = useLocalDatabase();
  const focused = useIsFocused();
  const [saved, setFilter] = useState(NO_FILTER);
  const [filter, showChange] = useOptimistic(
    saved,
    (current: ListFilter, update: Update) => update(current),
  );
  const [error, setError] = useState<unknown>();
  useEffect(() => {
    let active = true;
    function refresh() {
      void database
        .transaction((tx) => readListFilter(tx, spaceId))
        .then(
          (saved) => {
            if (active) setFilter(saved);
          },
          (failure: unknown) => {
            if (active) setError(failure);
          },
        );
    }
    const show: FilterListener = (db, list, saved) => {
      if (db === database && list === spaceId) setFilter(saved);
    };
    listeners.add(show);
    const unsubscribe = subscribeToExpenses(database, refresh);
    refresh();
    return () => {
      active = false;
      listeners.delete(show);
      unsubscribe();
    };
  }, [database, spaceId, focused]);
  if (error) throw error;

  function change(update: Update, onChanged?: () => void) {
    startTransition(async () => {
      showChange(update);
      try {
        const next = await database.transaction(async (tx) => {
          const current = await readListFilter(tx, spaceId);
          const updated = update(current);
          if (updated === current) return;
          await writeListFilter(tx, spaceId, updated);
          return updated;
        });
        if (next === undefined) return;
        startTransition(() => {
          for (const show of listeners) show(database, spaceId, next);
          onChanged?.();
        });
      } catch {
        Alert.alert(
          'Unable to Save Settings',
          'Your settings could not be saved. Please try again.',
        );
      }
    });
  }
  return { filter, change };
}

export interface FilterMenu {
  label: 'Category' | 'Ledger' | 'Paid by' | 'Currency';
  /** The row value when off, and the value shared by the row and capsule when on. */
  placeholder: string;
  value: string;
  multiple: boolean;
  selected: string[];
  options: MenuFieldOption[];
  select: (id: string) => Update;
}

function choices(
  label: FilterMenu['label'],
  placeholder: string,
  plural: string,
  key: 'categories' | 'ledgers' | 'payers',
  selected: string[],
  options: MenuFieldOption[],
): FilterMenu {
  const value =
    selected.length > 1
      ? `${selected.length} ${plural}`
      : (options.find(({ id }) => id === selected[0])?.name ?? '');
  return {
    label,
    placeholder,
    value,
    selected,
    options,
    multiple: true,
    select: (id) => (current) => ({
      ...current,
      [key]: current[key].includes(id)
        ? current[key].filter((item) => item !== id)
        : [...current[key], id],
    }),
  };
}

const named = (id: string) => ({ id, name: id });

/** Options use every eligible expense on every date, plus choices still selected (LEDGER-130.1). */
export function useListFilter(
  groupId: string | undefined,
  expenses: ExpenseView[] | undefined,
  groups: GroupWithFormerMembers[],
) {
  const { personalSpaceId, userId } = useLocalIdentity();
  const locale = useDisplayLocale();
  const { filter, change } = useRememberedFilter(groupId ?? personalSpaceId);
  const active = hasFilter(filter);
  const filtered = useMemo(
    () =>
      active
        ? expenses?.filter((expense) =>
            passesFilter(filter, expense, groupId !== undefined),
          )
        : expenses,
    [active, expenses, filter, groupId],
  );
  const menus = useMemo(() => {
    const categories = new Set(filter.categories);
    const ledgers = new Set(filter.ledgers);
    const payers = new Set(filter.payers);
    const currencies = new Set<string>();
    for (const expense of expenses ?? []) {
      categories.add(expense.category.name);
      currencies.add(expense.currency);
      if (groupId === undefined) ledgers.add(expense.spaceId);
      else
        for (const { participant } of expense.payments) payers.add(participant);
    }
    const compare = new Intl.Collator(locale, { sensitivity: 'accent' })
      .compare;
    function byName(options: MenuFieldOption[], first?: string) {
      return options.sort(
        (a, b) =>
          Number(b.id === first) - Number(a.id === first) ||
          compare(a.name, b.name),
      );
    }
    const category = choices(
      'Category',
      'Any',
      'Categories',
      'categories',
      filter.categories,
      byName(Array.from(categories, named)),
    );
    let scope: FilterMenu;
    if (groupId === undefined) {
      const names = new Map(groups.map(({ id, name }) => [id, name]));
      names.set(personalSpaceId, 'Personal');
      scope = choices(
        'Ledger',
        'All',
        'Ledgers',
        'ledgers',
        filter.ledgers,
        byName(
          Array.from(ledgers, (id) => ({ id, name: names.get(id) ?? id })),
          personalSpaceId,
        ),
      );
    } else {
      const group = groups.find(({ id }) => id === groupId);
      const members = group ? [...group.members, ...group.formerMembers] : [];
      const own = members.find((member) => member.userId === userId)?.id;
      const names = new Map(
        members.map(({ id, name }) => [id, id === own ? 'You' : name]),
      );
      scope = choices(
        'Paid by',
        'Anyone',
        'Payers',
        'payers',
        filter.payers,
        byName(
          Array.from(payers, (id) => ({ id, name: names.get(id) ?? id })),
          own,
        ),
      );
    }
    let currency: FilterMenu | undefined;
    if (currencies.size >= 2 || filter.currency) {
      if (filter.currency) currencies.add(filter.currency);
      currency = {
        label: 'Currency',
        placeholder: 'All',
        value: filter.currency,
        multiple: false,
        options: [
          { id: '', name: 'All' },
          ...[...currencies].sort().map(named),
        ],
        selected: [filter.currency],
        select: (id) => (current) =>
          current.currency === id ? current : { ...current, currency: id },
      };
    }
    return { category, scope, currency };
  }, [expenses, groups, groupId, filter, personalSpaceId, userId, locale]);
  return { filter, active, filtered, change, ...menus };
}

export type ListFilterState = ReturnType<typeof useListFilter>;
