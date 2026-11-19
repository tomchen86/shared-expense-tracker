import { toLocalDate } from '@shared-expense/domain';
import { formatExpenseDate } from './format-date';

/**
 * The dates a list shows (LEDGER-107.1): one month or one year, whose `key` is YYYY-MM or YYYY,
 * the last three months, a custom range, or all of them.
 */
export type Period =
  | { kind: 'month' | 'year'; key: string }
  | { kind: 'last3Months' | 'custom' | 'all' };

/** A range of days, each YYYY-MM-DD; both are in it. */
export type Dates = { from: string; to: string };

/**
 * The period of one list, and the dates of its custom range as they were chosen, which stay
 * while the list shows another period. The list has none until its first custom range.
 */
export interface ListPeriod {
  period: Period;
  range?: Dates;
}

/** The periods a list offers by name, in the order of the Date list (LEDGER-109.1). */
export const PERIOD_OPTIONS = [
  { id: 'thisMonth', name: 'This Month' },
  { id: 'lastMonth', name: 'Last Month' },
  { id: 'last3Months', name: 'Last 3 Months' },
  { id: 'thisYear', name: 'This Year' },
  { id: 'all', name: 'All Time' },
  { id: 'custom', name: 'Custom Range' },
];

const MONTHS = [
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

/** Today where the phone is, as YYYY-MM-DD. */
export function today(): string {
  return toLocalDate(
    new Date(),
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
}

/** The month `count` months after `month`, both YYYY-MM; before it when negative. */
function monthAfter(month: string, count: number): string {
  return new Date(
    Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + count),
  )
    .toISOString()
    .slice(0, 7);
}

const lastDayOf = (month: string) =>
  new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0))
    .toISOString()
    .slice(0, 10);

const monthName = (month: string) =>
  `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;

/** The month a date is in, as a period. */
export const monthOf = (date: string): Period => ({
  kind: 'month',
  key: date.slice(0, 7),
});

/** The custom range a list starts with: the first day of this month to today (LEDGER-112.1). */
export const firstRange = (day: string): Dates => ({
  from: `${day.slice(0, 7)}-01`,
  to: day,
});

/** The period an option of the Date list stands for on the day `day`. */
export function periodOf(id: string, day: string): Period {
  switch (id) {
    case 'thisMonth':
      return monthOf(day);
    case 'lastMonth':
      return { kind: 'month', key: monthAfter(day.slice(0, 7), -1) };
    case 'thisYear':
      return { kind: 'year', key: day.slice(0, 4) };
    case 'last3Months':
    case 'custom':
      return { kind: id };
    default:
      return { kind: 'all' };
  }
}

const samePeriod = (one: Period, other: Period) =>
  one.kind === other.kind &&
  ('key' in one ? one.key : '') === ('key' in other ? other.key : '');

/** The option of the Date list that `period` is on the day `day`; none for another month or year. */
export function optionOf(period: Period, day: string): string | undefined {
  return PERIOD_OPTIONS.find(({ id }) => samePeriod(periodOf(id, day), period))
    ?.id;
}

/** The first and last day of the list's period; undefined for all dates. */
export function datesOf(
  { period, range }: ListPeriod,
  day: string,
): Dates | undefined {
  switch (period.kind) {
    case 'all':
      return undefined;
    case 'month':
      return { from: `${period.key}-01`, to: lastDayOf(period.key) };
    case 'year':
      return { from: `${period.key}-01-01`, to: `${period.key}-12-31` };
    case 'last3Months':
      return { from: `${monthAfter(day.slice(0, 7), -2)}-01`, to: day };
    case 'custom': {
      const { from, to } = range ?? firstRange(day);
      return from <= to ? { from, to } : { from: to, to: from };
    }
  }
}

/** The name on the period row (LEDGER-108.1); `allName` is what all dates are called there. */
export function periodName(
  period: Period,
  day: string,
  allName: string,
): string {
  switch (period.kind) {
    case 'all':
      return allName;
    case 'month':
      return monthName(period.key);
    case 'year':
      return period.key;
    case 'custom':
      return 'Custom Range';
    case 'last3Months': {
      const first = monthAfter(day.slice(0, 7), -2);
      const short = (month: string) => monthName(month).slice(0, 3);
      const firstYear = first.slice(0, 4);
      const year = day.slice(0, 4);
      return `${short(first)}${firstYear === year ? '' : ` ${firstYear}`} – ${short(day)} ${year}`;
    }
  }
}

/** What a period with no expense is called (LEDGER-116.1): a custom range by its two days. */
export function emptyPeriodName(
  list: ListPeriod,
  day: string,
  locale: string,
): string {
  const dates = datesOf(list, day);
  return list.period.kind === 'custom' && dates
    ? `${formatExpenseDate(dates.from, locale)} – ${formatExpenseDate(dates.to, locale)}`
    : periodName(list.period, day, '');
}

/** The month or year before (`by` -1) or after (1) a month or a year. */
export function stepped(
  period: Extract<Period, { key: string }>,
  by: -1 | 1,
): Period {
  return period.kind === 'month'
    ? { kind: 'month', key: monthAfter(period.key, by) }
    : { kind: 'year', key: String(Number(period.key) + by) };
}

/** Whether Next period has somewhere to go: not from this month or this year, nor past them. */
export function hasNext(
  period: Extract<Period, { key: string }>,
  day: string,
): boolean {
  return period.key < day.slice(0, period.key.length);
}

/**
 * The search params that open Insights on the list's period (LEDGER-35.4, INSIGHTS-45.1): the
 * month or the year, the two days of the last three months or of a custom range, and this
 * month for all dates.
 */
export function insightsParams(
  list: ListPeriod,
  day: string,
): { period: string } | Dates {
  const { period } = list;
  if ('key' in period) return { period: period.key };
  if (period.kind === 'all') return { period: day.slice(0, 7) };
  return datesOf(list, day)!;
}

/**
 * The period to offer in place of one that holds no expense (LEDGER-116.1): the year, from a
 * year, or else the month of the latest expense dated before `first`. `dates` are the dates of
 * the list's expenses, latest first.
 */
export function earlierPeriod(
  period: Period,
  first: string,
  dates: readonly string[],
): Period | undefined {
  const before = dates.find((date) => date < first);
  if (before === undefined) return undefined;
  return period.kind === 'year'
    ? { kind: 'year', key: before.slice(0, 4) }
    : monthOf(before);
}
