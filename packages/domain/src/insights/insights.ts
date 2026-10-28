// Stubs for the insights rules in docs/specs/insights/spec.md. The implementer
// replaces the body; the signatures are the boundary the acceptance tests use.
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

/** Month and year periods with their per-currency totals, oldest first, or undefined when a total is rejected. */
export function buildInsights(input: {
  expenses: readonly InsightExpense[];
  categories: readonly InsightCategory[];
  context: InsightContext;
  chartPreference: InsightChartPreference;
}): Insights | undefined {
  throw new Error(
    `Not implemented: buildInsights(${input.expenses.length} expenses)`,
  );
}
