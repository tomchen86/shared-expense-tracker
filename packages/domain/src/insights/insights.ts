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
  | { kind: 'group'; groupId: string };

export interface InsightCategoryTotal {
  name: string;
  color: string;
  amountMinor: number;
  percent: number;
}

export interface InsightCurrency {
  currency: string;
  totalMinor: number;
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

interface CategoryTotal {
  amountMinor: number;
  category: InsightCategory | undefined;
  source: InsightExpense;
}

interface CurrencyTotal {
  totalMinor: number;
  categories: Map<string, CategoryTotal>;
}

type PeriodTotals = Map<string, Map<string, CurrencyTotal>>;

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

function addExpense(
  periods: PeriodTotals,
  key: string,
  expense: InsightExpense,
  amountMinor: number,
  category: InsightCategory | undefined,
): boolean {
  const currencies = periods.get(key) ?? new Map<string, CurrencyTotal>();
  const currency = currencies.get(expense.currency) ?? {
    totalMinor: 0,
    categories: new Map<string, CategoryTotal>(),
  };
  if (amountMinor > Number.MAX_SAFE_INTEGER - currency.totalMinor) return false;

  const categoryId = expense.categoryId ?? category?.id;
  const categoryKey =
    categoryId === undefined
      ? `name:${expense.categoryName}`
      : `id:${categoryId}`;
  const existing = currency.categories.get(categoryKey);
  if (existing) {
    // Positive category subtotals cannot exceed the checked currency total.
    existing.amountMinor += amountMinor;
    if (!category && preferSource(expense, existing.source)) {
      existing.source = expense;
    }
  } else {
    currency.categories.set(categoryKey, {
      amountMinor,
      category,
      source: expense,
    });
  }
  currency.totalMinor += amountMinor;
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
        const { totalMinor, categories: categoryTotals } =
          totals.get(currency)!;
        const categories = [...categoryTotals.values()]
          .map(({ amountMinor, category, source }) => {
            const { name, color } = category ?? fallbackDetails(source);
            return {
              name,
              color,
              amountMinor,
              percent: (amountMinor / totalMinor) * 100,
            };
          })
          .sort(
            (left, right) =>
              right.amountMinor - left.amountMinor ||
              compareCodePoints(
                left.name.toLowerCase(),
                right.name.toLowerCase(),
              ) ||
              compareDetails(left, right),
          );
        const previousTotalMinor = previous?.get(currency)?.totalMinor ?? 0;
        const deltaMinor = totalMinor - previousTotalMinor;
        return {
          currency,
          totalMinor,
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

/** Month and year periods with their per-currency totals, oldest first, or undefined when a total is rejected. */
export function buildInsights(input: {
  expenses: readonly InsightExpense[];
  categories: readonly InsightCategory[];
  context: InsightContext;
  chartPreference: InsightChartPreference;
}): Insights | undefined {
  const { expenses, categories, context, chartPreference } = input;
  const participantIds = new Set<string>();
  if (context.kind === 'personal') {
    participantIds.add(context.personalParticipantId);
    for (const participant of context.participants) {
      if (participant.userId === context.userId)
        participantIds.add(participant.id);
    }
  }

  const months: PeriodTotals = new Map();
  const years: PeriodTotals = new Map();
  for (const expense of expenses) {
    if (!isLocalDate(expense.date)) continue;
    const amountMinor = countedAmount(expense, context, participantIds);
    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) continue;

    const category =
      expense.categoryId === undefined
        ? categories.find(({ name }) => name === expense.categoryName)
        : categories.find(({ id }) => id === expense.categoryId);
    if (
      !addExpense(
        months,
        expense.date.slice(0, 7),
        expense,
        amountMinor,
        category,
      ) ||
      !addExpense(
        years,
        expense.date.slice(0, 4),
        expense,
        amountMinor,
        category,
      )
    )
      return undefined;
  }

  return {
    months: buildPeriods(months, chartPreference),
    years: buildPeriods(years, chartPreference),
  };
}
