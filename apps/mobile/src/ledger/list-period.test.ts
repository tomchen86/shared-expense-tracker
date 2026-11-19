import {
  datesOf,
  earlierPeriod,
  emptyPeriodName,
  hasNext,
  insightsParams,
  optionOf,
  periodName,
  periodOf,
  stepped,
  type Period,
} from './list-period';

const DAY = '2026-01-15';
const month = (key: string): Period => ({ kind: 'month', key });
const year = (key: string): Period => ({ kind: 'year', key });

test('each option of the Date list stands for a period that is that option again', () => {
  for (const id of [
    'thisMonth',
    'lastMonth',
    'last3Months',
    'thisYear',
    'all',
    'custom',
  ])
    expect(optionOf(periodOf(id, DAY), DAY)).toBe(id);
  expect(periodOf('lastMonth', DAY)).toEqual(month('2025-12'));
  expect(optionOf(month('2025-11'), DAY)).toBeUndefined();
  expect(optionOf(year('2025'), DAY)).toBeUndefined();
});

test('a period reaches from its first day to its last', () => {
  expect(datesOf({ period: month('2024-02') }, DAY)).toEqual({
    from: '2024-02-01',
    to: '2024-02-29',
  });
  expect(datesOf({ period: year('2025') }, DAY)).toEqual({
    from: '2025-01-01',
    to: '2025-12-31',
  });
  expect(datesOf({ period: { kind: 'last3Months' } }, DAY)).toEqual({
    from: '2025-11-01',
    to: DAY,
  });
  expect(datesOf({ period: { kind: 'all' } }, DAY)).toBeUndefined();
});

test('a custom range starts on this month and puts the earlier of its two days first', () => {
  const custom: Period = { kind: 'custom' };
  expect(datesOf({ period: custom }, DAY)).toEqual({
    from: '2026-01-01',
    to: DAY,
  });
  expect(
    datesOf(
      { period: custom, range: { from: '2025-10-20', to: '2025-10-05' } },
      DAY,
    ),
  ).toEqual({ from: '2025-10-05', to: '2025-10-20' });
});

test('names a period as the period row does', () => {
  expect(periodName(month('2025-12'), DAY, 'All Time')).toBe('December 2025');
  expect(periodName(year('2025'), DAY, 'All Time')).toBe('2025');
  expect(periodName({ kind: 'last3Months' }, DAY, 'All Time')).toBe(
    'Nov 2025 – Jan 2026',
  );
  expect(periodName({ kind: 'last3Months' }, '2026-10-30', 'All Time')).toBe(
    'Aug – Oct 2026',
  );
  expect(periodName({ kind: 'custom' }, DAY, 'All Time')).toBe('Custom Range');
  expect(periodName({ kind: 'all' }, DAY, 'Group Total')).toBe('Group Total');
});

test('names an empty custom range by its days, and any other period by its name', () => {
  expect(
    emptyPeriodName(
      {
        period: { kind: 'custom' },
        range: { from: '2026-01-10', to: '2026-01-02' },
      },
      DAY,
      'en-US',
    ),
  ).toBe('Jan 2, 2026 – Jan 10, 2026');
  expect(emptyPeriodName({ period: month('2026-01') }, DAY, 'en-US')).toBe(
    'January 2026',
  );
});

test('steps over the turn of a year, and not past this month or this year', () => {
  expect(stepped({ kind: 'month', key: '2026-01' }, -1)).toEqual(
    month('2025-12'),
  );
  expect(stepped({ kind: 'month', key: '2025-12' }, 1)).toEqual(
    month('2026-01'),
  );
  expect(stepped({ kind: 'year', key: '2026' }, -1)).toEqual(year('2025'));
  expect(hasNext({ kind: 'month', key: '2025-12' }, DAY)).toBe(true);
  expect(hasNext({ kind: 'month', key: '2026-01' }, DAY)).toBe(false);
  expect(hasNext({ kind: 'month', key: '2026-02' }, DAY)).toBe(false);
  expect(hasNext({ kind: 'year', key: '2025' }, DAY)).toBe(true);
  expect(hasNext({ kind: 'year', key: '2026' }, DAY)).toBe(false);
});

test('opens Insights on the month, the year, the days of a range, and this month for all dates', () => {
  expect(insightsParams({ period: month('2025-12') }, DAY)).toEqual({
    period: '2025-12',
  });
  expect(insightsParams({ period: year('2025') }, DAY)).toEqual({
    period: '2025',
  });
  expect(insightsParams({ period: { kind: 'last3Months' } }, DAY)).toEqual({
    from: '2025-11-01',
    to: DAY,
  });
  expect(insightsParams({ period: { kind: 'all' } }, DAY)).toEqual({
    period: '2026-01',
  });
});

test('offers the month, or from a year the year, of the latest expense before the period', () => {
  const dates = ['2026-01-10', '2025-08-15', '2024-03-05'];
  expect(earlierPeriod(month('2025-12'), '2025-12-01', dates)).toEqual(
    month('2025-08'),
  );
  expect(earlierPeriod(year('2025'), '2025-01-01', dates)).toEqual(
    year('2024'),
  );
  expect(earlierPeriod(month('2024-01'), '2024-01-01', dates)).toBeUndefined();
});
