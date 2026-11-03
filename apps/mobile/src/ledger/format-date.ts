/** A stored calendar date has no time zone; keep its day when formatting. */
export function formatExpenseDate(date: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
}
