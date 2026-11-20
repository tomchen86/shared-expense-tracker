import { categoryNameKey } from '../categories/categories';
import { isLocalDate } from '../ledger/dates';
import type { Share } from '../ledger/money';

export type InsightChartPreference = 'auto' | 'donut' | 'bar';
export type InsightChartKind = 'progress' | 'donut' | 'bar';

export interface InsightExpense {
  amountMinor: number;
  currency: string;
  /** YYYY-MM-DD */
  date: string;
  /** The personal space or the group the expense belongs to. */
  spaceId: string;
  /** Each share's participant is a participant id. */
  shares: readonly Share<string>[];
  categoryId?: string;
  /** The category name stored on the expense. */
  categoryName: string;
  /** The category's name and color when the expense was recorded. */
  categorySnapshot?: { name: string; color: string };
}

export interface InsightCategory {
  id: string;
  name: string;
  color: string;
}

export type InsightContext =
  | {
      kind: 'personal';
      userId: string;
      personalSpaceId: string;
      personalParticipantId: string;
      participants: readonly { id: string; userId?: string }[];
    }
  | {
      kind: 'group';
      groupId: string;
      /** Your member in the group, whose share each currency reports. */
      ownMemberId?: string;
    };

export interface InsightCategoryTotal {
  name: string;
  color: string;
  amountMinor: number;
  percent: number;
}

export interface InsightCurrency {
  currency: string;
  totalMinor: number;
  /** Your share of the total, given the context's `ownMemberId`. */
  yourShareMinor?: number;
  comparison: {
    previousTotalMinor: number;
    deltaMinor: number;
    deltaPercent: number | null;
  } | null;
  categories: InsightCategoryTotal[];
  chart: { kind: InsightChartKind; categories: InsightCategoryTotal[] };
}

export interface InsightPeriod {
  /** YYYY-MM for a month, YYYY for a year. */
  key: string;
  label: string;
  currencies: InsightCurrency[];
}

export interface Insights {
  months: InsightPeriod[];
  years: InsightPeriod[];
}

const GRAY = '#808080';
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

type CategoryDetails = Pick<InsightCategory, 'name' | 'color'>;

interface CategoryTotal<E extends InsightExpense> {
  amountMinor: number;
  category: InsightCategory | undefined;
  source: E;
  /** Only the selected period's drill-down needs to retain the contributing expenses. */
  expenses?: E[];
}

interface CurrencyTotal<E extends InsightExpense = InsightExpense> {
  totalMinor: number;
  yourShareMinor?: number;
  categories: Map<string, CategoryTotal<E>>;
}

type PeriodTotals<E extends InsightExpense = InsightExpense> = Map<
  string,
  Map<string, CurrencyTotal<E>>
>;

// String comparison uses UTF-16 code units, which order emoji before some BMP
// characters. Iterate code points instead, without locale-dependent collation.
function compareCodePoints(left: string, right: string): number {
  const a = Array.from(left, (character) => character.codePointAt(0)!);
  const b = Array.from(right, (character) => character.codePointAt(0)!);
  for (let index = 0; index < Math.min(a.length, b.length); index++) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return a.length - b.length;
}

function compareDetails(left: CategoryDetails, right: CategoryDetails): number {
  return (
    compareCodePoints(left.name, right.name) ||
    compareCodePoints(left.color, right.color)
  );
}

function fallbackDetails(expense: InsightExpense): CategoryDetails {
  return (
    expense.categorySnapshot ?? { name: expense.categoryName, color: GRAY }
  );
}

function preferSource(
  candidate: InsightExpense,
  current: InsightExpense,
): boolean {
  if (!!candidate.categorySnapshot !== !!current.categorySnapshot) {
    return candidate.categorySnapshot !== undefined;
  }
  if (candidate.date !== current.date) return candidate.date > current.date;
  return (
    compareDetails(fallbackDetails(candidate), fallbackDetails(current)) < 0
  );
}

function countedAmount(
  expense: InsightExpense,
  context: InsightContext,
  participantIds: ReadonlySet<string>,
): number {
  if (context.kind === 'group') {
    return expense.spaceId === context.groupId ? expense.amountMinor : 0;
  }
  if (expense.spaceId === context.personalSpaceId) return expense.amountMinor;

  let total = 0;
  for (const share of expense.shares) {
    if (!participantIds.has(share.participant)) continue;
    // Reject an overflowing personal projection before adding minor units.
    if (share.amountMinor > Number.MAX_SAFE_INTEGER - total) return NaN;
    total += share.amountMinor;
  }
  return total;
}

function yourShareOf(expense: InsightExpense, context: InsightContext) {
  if (context.kind !== 'group' || context.ownMemberId === undefined)
    return undefined;
  return expense.shares
    .filter((share) => share.participant === context.ownMemberId)
    .reduce((sum, share) => sum + share.amountMinor, 0);
}

function addExpense<E extends InsightExpense>(
  periods: PeriodTotals<E>,
  key: string,
  expense: E,
  amountMinor: number,
  yourShareMinor: number | undefined,
  category: InsightCategory | undefined,
  categoryKey: string,
  keepExpenses: boolean,
): boolean {
  const currencies = periods.get(key) ?? new Map<string, CurrencyTotal<E>>();
  const currency = currencies.get(expense.currency) ?? {
    totalMinor: 0,
    categories: new Map<string, CategoryTotal<E>>(),
  };
  if (amountMinor > Number.MAX_SAFE_INTEGER - currency.totalMinor) return false;

  const existing = currency.categories.get(categoryKey);
  if (existing) {
    // Positive category subtotals cannot exceed the checked currency total.
    existing.amountMinor += amountMinor;
    existing.expenses?.push(expense);
    if (!category && preferSource(expense, existing.source)) {
      existing.source = expense;
    }
  } else {
    currency.categories.set(categoryKey, {
      amountMinor,
      category,
      source: expense,
      expenses: keepExpenses ? [expense] : undefined,
    });
  }
  currency.totalMinor += amountMinor;
  // Your shares cannot exceed the checked currency total.
  if (yourShareMinor !== undefined)
    currency.yourShareMinor = (currency.yourShareMinor ?? 0) + yourShareMinor;
  currencies.set(expense.currency, currency);
  periods.set(key, currencies);
  return true;
}

function buildChart(
  categories: InsightCategoryTotal[],
  totalMinor: number,
  preference: InsightChartPreference,
): InsightCurrency['chart'] {
  const kind =
    preference === 'auto'
      ? categories.length === 1
        ? 'progress'
        : categories.length <= 5
          ? 'donut'
          : 'bar'
      : preference;
  if (kind !== 'donut' || categories.length <= 5) return { kind, categories };

  const amountMinor = categories
    .slice(5)
    .reduce((sum, category) => sum + category.amountMinor, 0);
  return {
    kind,
    categories: [
      ...categories.slice(0, 5),
      {
        name: 'Others',
        color: GRAY,
        amountMinor,
        percent: (amountMinor / totalMinor) * 100,
      },
    ],
  };
}

function orderedCategories<E extends InsightExpense>(
  currency: CurrencyTotal<E>,
) {
  return Array.from(currency.categories, ([key, total]) => {
    const { name, color } = total.category ?? fallbackDetails(total.source);
    return {
      key,
      name,
      color,
      amountMinor: total.amountMinor,
      expenses: total.expenses,
    };
  }).sort(
    (left, right) =>
      right.amountMinor - left.amountMinor ||
      compareCodePoints(left.name.toLowerCase(), right.name.toLowerCase()) ||
      compareDetails(left, right),
  );
}

function buildPeriods(
  periods: PeriodTotals,
  preference: InsightChartPreference,
): InsightPeriod[] {
  let previous: Map<string, CurrencyTotal> | undefined;
  return [...periods.keys()].sort().map((key) => {
    const totals = periods.get(key)!;
    const currencies = [...totals.keys()]
      .sort()
      .map((currency): InsightCurrency => {
        const total = totals.get(currency)!;
        const { totalMinor, yourShareMinor } = total;
        const categories = orderedCategories(total).map(
          ({ name, color, amountMinor }) => ({
            name,
            color,
            amountMinor,
            percent: (amountMinor / totalMinor) * 100,
          }),
        );
        const previousTotalMinor = previous?.get(currency)?.totalMinor ?? 0;
        const deltaMinor = totalMinor - previousTotalMinor;
        return {
          currency,
          totalMinor,
          ...(yourShareMinor === undefined ? {} : { yourShareMinor }),
          comparison: previous
            ? {
                previousTotalMinor,
                deltaMinor,
                deltaPercent:
                  previousTotalMinor === 0
                    ? null
                    : (deltaMinor / previousTotalMinor) * 100,
              }
            : null,
          categories,
          chart: buildChart(categories, totalMinor, preference),
        };
      });
    previous = totals;
    return {
      key,
      label:
        key.length === 4
          ? key
          : `${MONTH_NAMES[Number(key.slice(5)) - 1]} ${key.slice(0, 4)}`,
      currencies,
    };
  });
}

interface InsightsInput<E extends InsightExpense = InsightExpense> {
  expenses: readonly E[];
  categories: readonly InsightCategory[];
  context: InsightContext;
  chartPreference: InsightChartPreference;
}

/**
 * Adds each counted expense to the periods that `periodsOf` names for its date. False when a
 * total is rejected.
 */
function collect<E extends InsightExpense>(
  { expenses, categories, context }: Omit<InsightsInput<E>, 'chartPreference'>,
  periodsOf: (date: string) => [PeriodTotals<E>, string][],
  keepExpenses = false,
): boolean {
  const participantIds = new Set<string>();
  if (context.kind === 'personal') {
    participantIds.add(context.personalParticipantId);
    for (const participant of context.participants) {
      if (participant.userId === context.userId)
        participantIds.add(participant.id);
    }
  }

  const firstByName = new Map<string, InsightCategory>();
  for (const category of categories) {
    const key = categoryNameKey(category.name);
    if (!firstByName.has(key)) firstByName.set(key, category);
  }

  for (const expense of expenses) {
    if (!isLocalDate(expense.date)) continue;
    const amountMinor = countedAmount(expense, context, participantIds);
    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) continue;
    const yourShareMinor = yourShareOf(expense, context);

    // Matched expenses merge by name into the first category of that name (INSIGHTS-6.2).
    const matched =
      expense.categoryId === undefined
        ? firstByName.get(categoryNameKey(expense.categoryName))
        : categories.find(({ id }) => id === expense.categoryId);
    const category = matched && firstByName.get(categoryNameKey(matched.name));
    const categoryKey = category
      ? `category:${categoryNameKey(category.name)}`
      : expense.categoryId === undefined
        ? `name:${categoryNameKey(expense.categoryName)}`
        : `id:${expense.categoryId}`;
    for (const [periods, key] of periodsOf(expense.date))
      if (
        !addExpense(
          periods,
          key,
          expense,
          amountMinor,
          yourShareMinor,
          category,
          categoryKey,
          keepExpenses,
        )
      )
        return false;
  }
  return true;
}

/** Month and year periods with their per-currency totals, oldest first, or undefined when a total is rejected. */
export function buildInsights(input: InsightsInput): Insights | undefined {
  const months: PeriodTotals = new Map();
  const years: PeriodTotals = new Map();
  const counted = collect(input, (date) => [
    [months, date.slice(0, 7)],
    [years, date.slice(0, 4)],
  ]);
  if (!counted) return undefined;
  return {
    months: buildPeriods(months, input.chartPreference),
    years: buildPeriods(years, input.chartPreference),
  };
}

/**
 * The counted expenses dated from `from` to `to`, both days included, as one period's
 * currencies with no comparison, or undefined when a total is rejected (INSIGHTS-44.1).
 */
export function buildRangeInsights(
  input: InsightsInput & {
    /** YYYY-MM-DD */
    from: string;
    /** YYYY-MM-DD */
    to: string;
  },
): InsightCurrency[] | undefined {
  const { from, to } = input;
  const range: PeriodTotals = new Map();
  const counted = collect(input, (date) =>
    from <= date && date <= to ? [[range, 'range']] : [],
  );
  if (!counted) return undefined;
  // One period, so with no period before it to compare with.
  return buildPeriods(range, input.chartPreference)[0]?.currencies ?? [];
}

export interface InsightCategoryExpenses<E extends InsightExpense> {
  /** The same for the same category however the expenses change (INSIGHTS-55.1). */
  key: string;
  /** The given expenses counted into the category, in the order given. */
  expenses: E[];
}

export interface InsightCurrencyExpenses<E extends InsightExpense> {
  currency: string;
  /** In the order of the currency's categories (INSIGHTS-8.1). */
  categories: InsightCategoryExpenses<E>[];
}

/**
 * The expenses each category of a month, a year or a range counts, by currency, or undefined
 * when a total is rejected (INSIGHTS-55.1).
 */
export function buildCategoryExpenses<E extends InsightExpense>(
  input: Omit<InsightsInput<E>, 'chartPreference'> &
    (
      | {
          /** YYYY-MM for a month, YYYY for a year, as InsightPeriod's key. */
          period: string;
        }
      | {
          /** YYYY-MM-DD */
          from: string;
          /** YYYY-MM-DD */
          to: string;
        }
    ),
): InsightCurrencyExpenses<E>[] | undefined {
  const selected: PeriodTotals<E> = new Map();
  const counted = collect(
    input,
    (date) => {
      const included =
        'period' in input
          ? date.slice(0, 7) === input.period ||
            date.slice(0, 4) === input.period
          : input.from <= date && date <= input.to;
      return included ? [[selected, 'selected']] : [];
    },
    true,
  );
  if (!counted) return undefined;
  const totals = selected.get('selected');
  if (!totals) return [];
  return [...totals.keys()].sort().map((currency) => ({
    currency,
    categories: orderedCategories(totals.get(currency)!).map(
      ({ key, expenses }) => ({ key, expenses: expenses! }),
    ),
  }));
}
