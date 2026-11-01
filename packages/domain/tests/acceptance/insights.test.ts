import {
  buildInsights,
  type InsightCategory,
  type InsightChartKind,
  type InsightChartPreference,
  type InsightContext,
  type InsightExpense,
  type InsightPeriod,
} from '../../src';

const GROUP: InsightContext = { kind: 'group', groupId: 'trip' };

const PERSONAL: InsightContext = {
  kind: 'personal',
  userId: 'me',
  personalSpaceId: 'my-space',
  personalParticipantId: 'me-personal',
  participants: [
    { id: 'me-personal', userId: 'me' },
    { id: 'me-in-trip', userId: 'me' },
    { id: 'bob', userId: 'bob' },
    { id: 'ann' },
  ],
};

const CATEGORIES: InsightCategory[] = [
  { id: 'food', name: 'Food', color: '#FF5722' },
  { id: 'travel', name: 'Travel', color: '#2196F3' },
];

const NOTHING = { months: [], years: [] };

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

const expense = (fields: Partial<InsightExpense> = {}): InsightExpense => ({
  amountMinor: 1000,
  currency: 'USD',
  date: '2025-01-10',
  spaceId: 'trip',
  shares: [],
  categoryName: 'Other',
  ...fields,
});

const share = (participant: string, amountMinor: number) => ({
  participant,
  amountMinor,
});

type Options = {
  context?: InsightContext;
  categories?: InsightCategory[];
  chartPreference?: InsightChartPreference;
};

const buildOrUndefined = (
  expenses: InsightExpense[],
  {
    context = GROUP,
    categories = CATEGORIES,
    chartPreference = 'auto',
  }: Options = {},
) => buildInsights({ expenses, categories, context, chartPreference });

// Only INSIGHTS-12.1 expects no result.
const build = (expenses: InsightExpense[], options?: Options) =>
  buildOrUndefined(expenses, options)!;

// Up to seven categories with their own colors.
const CHART_CATEGORIES: InsightCategory[] = Array.from(
  { length: 7 },
  (_, index) => ({
    id: `c${index + 1}`,
    name: `Category ${index + 1}`,
    color: `#00000${index + 1}`,
  }),
);

// One expense in each of the first `count` chart categories, largest first: 10 × count down to 10.
const inCategories = (count: number) =>
  CHART_CATEGORIES.slice(0, count).map(({ id, name }, index) =>
    expense({
      categoryId: id,
      categoryName: name,
      amountMinor: (count - index) * 10,
    }),
  );

const totals = (period: InsightPeriod) =>
  period.currencies.map(({ currency, totalMinor }) => [currency, totalMinor]);

const keyedTotals = (periods: InsightPeriod[]) =>
  periods.map((period) => [period.key, totals(period)]);

const insight = (period: InsightPeriod, currency = 'USD') =>
  period.currencies.find((item) => item.currency === currency)!;

const rows = (period: InsightPeriod, currency = 'USD') =>
  insight(period, currency).categories.map(({ name, color, amountMinor }) => [
    name,
    color,
    amountMinor,
  ]);

test.each<[string, Partial<InsightExpense>, number]>([
  [
    'a personal-space expense in full',
    {
      spaceId: 'my-space',
      amountMinor: 1200,
      shares: [share('someone-else', 1200)],
    },
    1200,
  ],
  [
    'only my share of a group expense',
    {
      amountMinor: 10000,
      shares: [share('me-personal', 2000), share('bob', 8000)],
    },
    2000,
  ],
  [
    'the shares of every participant linked to me',
    {
      amountMinor: 900,
      shares: [
        share('me-personal', 300),
        share('me-in-trip', 200),
        share('bob', 400),
      ],
    },
    500,
  ],
])('[INSIGHTS-1.1] personal insights count %s', (_, fields, counted) => {
  const othersOnly = expense({ amountMinor: 700, shares: [share('ann', 700)] });

  const insights = build([expense(fields), othersOnly], { context: PERSONAL });

  expect(insights.months.map(totals)).toEqual([[['USD', counted]]]);
});

test('[INSIGHTS-2.1] group insights count every expense of the group in full', () => {
  const insights = build([
    expense({ amountMinor: 3000, shares: [share('bob', 3000)] }),
    expense({ amountMinor: 1000 }),
    expense({ amountMinor: 500, spaceId: 'other-group' }),
    expense({ amountMinor: 700, spaceId: 'my-space' }),
  ]);

  expect(insights.months.map(totals)).toEqual([[['USD', 4000]]]);
});

test.each(['2025-02-30', '2025/01/05', ''])(
  '[INSIGHTS-3.1] leaves out an expense dated %p',
  (date) => {
    expect(build([expense({ date })])).toEqual(NOTHING);
  },
);

test.each([0, -100, 12.5, Number.MAX_SAFE_INTEGER + 1])(
  '[INSIGHTS-3.1] leaves out a group expense of %p',
  (amountMinor) => {
    expect(build([expense({ amountMinor })])).toEqual(NOTHING);
  },
);

test('[INSIGHTS-3.1] leaves out a group expense where my share is 0', () => {
  const paidOnly = expense({
    shares: [share('me-personal', 0), share('bob', 1000)],
  });

  expect(build([paidOnly], { context: PERSONAL })).toEqual(NOTHING);
});

test('[INSIGHTS-3.1] left-out expenses add to no total and make no period', () => {
  const insights = build([
    expense({ date: '2025-01-10', amountMinor: 1000 }),
    expense({ date: '2025-01-11', amountMinor: 0 }),
    expense({ date: '2025-02-30', amountMinor: 500 }),
    expense({ date: '2025-03-01', amountMinor: -5 }),
  ]);

  expect(keyedTotals(insights.months)).toEqual([['2025-01', [['USD', 1000]]]]);
  expect(keyedTotals(insights.years)).toEqual([['2025', [['USD', 1000]]]]);
});

test('[INSIGHTS-4.1] makes periods only for months and years with expenses, oldest first', () => {
  const insights = build([
    expense({ date: '2025-03-10' }),
    expense({ date: '2024-12-31' }),
    expense({ date: '2025-01-02' }),
    expense({ date: '2025-01-20' }),
  ]);

  expect(insights.months.map(({ key, label }) => [key, label])).toEqual([
    ['2024-12', 'December 2024'],
    ['2025-01', 'January 2025'],
    ['2025-03', 'March 2025'],
  ]);
  expect(insights.years.map(({ key, label }) => [key, label])).toEqual([
    ['2024', '2024'],
    ['2025', '2025'],
  ]);
});

test('[INSIGHTS-4.1] names each month in English', () => {
  const insights = build(
    MONTH_NAMES.map((_, index) =>
      expense({ date: `2025-${String(index + 1).padStart(2, '0')}-15` }),
    ),
  );

  expect(insights.months.map(({ label }) => label)).toEqual(
    MONTH_NAMES.map((name) => `${name} 2025`),
  );
});

test('[INSIGHTS-4.1] makes no periods without expenses', () => {
  expect(build([])).toEqual(NOTHING);
});

test('[INSIGHTS-5.1] totals each currency on its own, ordered by code', () => {
  const insights = build([
    expense({ currency: 'USD', amountMinor: 1200 }),
    expense({ currency: 'JPY', amountMinor: 2000 }),
    expense({ currency: 'AUD', amountMinor: 450 }),
    expense({ currency: 'USD', amountMinor: 300 }),
  ]);

  expect(insights.months.map(totals)).toEqual([
    [
      ['AUD', 450],
      ['JPY', 2000],
      ['USD', 1500],
    ],
  ]);
});

test('[INSIGHTS-5.1] totals a year over all its months', () => {
  const insights = build([
    expense({ date: '2024-12-31', amountMinor: 200 }),
    expense({ date: '2025-01-10', amountMinor: 1000 }),
    expense({ date: '2025-03-05', amountMinor: 500 }),
  ]);

  expect(keyedTotals(insights.years)).toEqual([
    ['2024', [['USD', 200]]],
    ['2025', [['USD', 1500]]],
  ]);
});

test('[INSIGHTS-5.1] lists no currency that only the previous period has', () => {
  const insights = build([
    expense({ date: '2024-12-05', currency: 'JPY', amountMinor: 2000 }),
    expense({ date: '2024-12-06', currency: 'USD', amountMinor: 500 }),
    expense({ date: '2025-01-10', currency: 'USD', amountMinor: 800 }),
  ]);

  expect(keyedTotals(insights.months)).toEqual([
    [
      '2024-12',
      [
        ['JPY', 2000],
        ['USD', 500],
      ],
    ],
    ['2025-01', [['USD', 800]]],
  ]);
});

test('[INSIGHTS-6.1] merges expenses with the same categoryId', () => {
  const [january] = build([
    expense({ categoryId: 'food', categoryName: 'Food', amountMinor: 400 }),
    expense({ categoryId: 'travel', categoryName: 'Travel', amountMinor: 500 }),
    expense({
      categoryId: 'food',
      categoryName: 'Old food name',
      amountMinor: 600,
    }),
  ]).months;

  expect(rows(january)).toEqual([
    ['Food', '#FF5722', 1000],
    ['Travel', '#2196F3', 500],
  ]);
});

test('[INSIGHTS-6.1] merges an expense without categoryId into the category with its name', () => {
  const [january] = build([
    expense({ categoryName: 'Food', amountMinor: 300 }),
    expense({ categoryId: 'food', categoryName: 'Food', amountMinor: 200 }),
  ]).months;

  expect(rows(january)).toEqual([['Food', '#FF5722', 500]]);
});

test('[INSIGHTS-6.1] matches the first category with that name', () => {
  const [january] = build(
    [
      expense({ categoryName: 'Food', amountMinor: 300 }),
      expense({ categoryId: 'food-1', categoryName: 'Food', amountMinor: 200 }),
      expense({ categoryId: 'food-2', categoryName: 'Food', amountMinor: 100 }),
    ],
    {
      categories: [
        { id: 'food-1', name: 'Food', color: '#FF0000' },
        { id: 'food-2', name: 'Food', color: '#00FF00' },
      ],
    },
  ).months;

  expect(rows(january)).toEqual([
    ['Food', '#FF0000', 500],
    ['Food', '#00FF00', 100],
  ]);
});

test('[INSIGHTS-6.1] merges unmatched expenses by the name stored on them', () => {
  const [january] = build([
    expense({ categoryName: 'Gifts', amountMinor: 100 }),
    expense({ categoryName: 'Books', amountMinor: 50 }),
    expense({ categoryName: 'Gifts', amountMinor: 200 }),
  ]).months;

  expect(rows(january)).toEqual([
    ['Gifts', '#808080', 300],
    ['Books', '#808080', 50],
  ]);
});

test('[INSIGHTS-6.1] keeps a category apart in each currency', () => {
  const [january] = build([
    expense({ categoryId: 'food', categoryName: 'Food', amountMinor: 400 }),
    expense({
      categoryId: 'food',
      categoryName: 'Food',
      currency: 'JPY',
      amountMinor: 1000,
    }),
  ]).months;

  expect(rows(january, 'USD')).toEqual([['Food', '#FF5722', 400]]);
  expect(rows(january, 'JPY')).toEqual([['Food', '#FF5722', 1000]]);
});

test('[INSIGHTS-7.1] uses the current name and color of the category', () => {
  const [january] = build(
    [
      expense({
        categoryId: 'food',
        categoryName: 'Food',
        categorySnapshot: { name: 'Food', color: '#111111' },
      }),
    ],
    { categories: [{ id: 'food', name: 'Meals', color: '#222222' }] },
  ).months;

  expect(rows(january)).toEqual([['Meals', '#222222', 1000]]);
});

test('[INSIGHTS-7.1] uses the snapshot when the categoryId is not in the list', () => {
  const [january] = build([
    expense({
      categoryId: 'gone',
      categoryName: 'Food',
      categorySnapshot: { name: 'Road Trip', color: '#5678C8' },
    }),
  ]).months;

  expect(rows(january)).toEqual([['Road Trip', '#5678C8', 1000]]);
});

test.each<[string, Partial<InsightExpense>, string]>([
  [
    'a categoryId not in the list',
    { categoryId: 'gone', categoryName: 'Food' },
    'Food',
  ],
  ['a name not in the list', { categoryName: 'Misc' }, 'Misc'],
])(
  '[INSIGHTS-7.1] uses the stored name in gray for %s without a snapshot',
  (_, fields, name) => {
    const [january] = build([expense(fields)]).months;

    expect(rows(january)).toEqual([[name, '#808080', 1000]]);
  },
);

test('[INSIGHTS-7.1] uses the snapshot when the name matches no category', () => {
  const [january] = build([
    expense({
      categoryName: 'Misc',
      categorySnapshot: { name: 'Snacks', color: '#333333' },
    }),
  ]).months;

  expect(rows(january)).toEqual([['Snacks', '#333333', 1000]]);
});

// An expense whose categoryId is not in the category list.
const gone = (
  date: string,
  amountMinor: number,
  categorySnapshot?: { name: string; color: string },
  categoryName = 'Old name',
) =>
  expense({
    date,
    amountMinor,
    categoryId: 'gone',
    categoryName,
    categorySnapshot,
  });

test('[INSIGHTS-7.1] uses the latest snapshot in each period', () => {
  const insights = build([
    gone('2025-01-20', 200, { name: 'Treats', color: '#222222' }),
    gone('2025-01-05', 100, { name: 'Snacks', color: '#111111' }),
    gone('2025-02-10', 300, { name: 'Sweets', color: '#333333' }),
  ]);

  expect(insights.months.map((period) => rows(period))).toEqual([
    [['Treats', '#222222', 300]],
    [['Sweets', '#333333', 300]],
  ]);
  expect(rows(insights.years[0])).toEqual([['Sweets', '#333333', 600]]);
});

test('[INSIGHTS-7.1] prefers a snapshot to a later expense without one', () => {
  const [january] = build([
    gone('2025-01-20', 200),
    gone('2025-01-05', 100, { name: 'Snacks', color: '#111111' }),
  ]).months;

  expect(rows(january)).toEqual([['Snacks', '#111111', 300]]);
});

test.each([
  ['name', { name: 'Treats', color: '#222222' }],
  ['color', { name: 'Snacks', color: '#222222' }],
])(
  '[INSIGHTS-7.1] picks the same-day snapshot that sorts first by %s',
  (_, other) => {
    const [january] = build([
      gone('2025-01-10', 100, other),
      gone('2025-01-10', 200, { name: 'Snacks', color: '#111111' }),
    ]).months;

    expect(rows(january)).toEqual([['Snacks', '#111111', 300]]);
  },
);

test('[INSIGHTS-7.1] without snapshots uses the latest stored name, first by code point on the same day', () => {
  const [january] = build([
    gone('2025-01-05', 100, undefined, 'Alpha'),
    gone('2025-01-20', 100, undefined, 'Zeta'),
    gone('2025-01-20', 100, undefined, 'Yak'),
  ]).months;

  expect(rows(january)).toEqual([['Yak', '#808080', 300]]);
});

test('[INSIGHTS-8.1] gives each category its percentage of the currency total, largest first', () => {
  const [january] = build([
    expense({
      categoryId: 'travel',
      categoryName: 'Travel',
      amountMinor: 2000,
    }),
    expense({ categoryId: 'food', categoryName: 'Food', amountMinor: 6000 }),
    expense({
      categoryId: 'food',
      categoryName: 'Food',
      currency: 'JPY',
      amountMinor: 5000,
    }),
  ]).months;

  const percents = (currency: string) =>
    insight(january, currency).categories.map(({ name, percent }) => [
      name,
      percent,
    ]);
  expect(percents('USD')).toEqual([
    ['Food', 75],
    ['Travel', 25],
  ]);
  expect(percents('JPY')).toEqual([['Food', 100]]);
});

test('[INSIGHTS-8.1] does not round percentages', () => {
  const [january] = build([
    expense({ categoryId: 'food', categoryName: 'Food', amountMinor: 100 }),
    expense({ categoryId: 'travel', categoryName: 'Travel', amountMinor: 200 }),
  ]).months;

  const [travel, food] = insight(january).categories;
  expect([travel.name, food.name]).toEqual(['Travel', 'Food']);
  expect(travel.percent).toBeCloseTo(200 / 3, 10);
  expect(food.percent).toBeCloseTo(100 / 3, 10);
});

test('[INSIGHTS-8.1] orders equal amounts by lowercased name in code point order', () => {
  const [january] = build([
    ...['Banana', 'apple', 'Fig', 'Éclair', '餐飲', '交通', '😀', 'ｆ'].map(
      (categoryName) => expense({ categoryName, amountMinor: 500 }),
    ),
    expense({ categoryName: 'Coffee', amountMinor: 900 }),
  ]).months;

  expect(rows(january).map(([name]) => name)).toEqual([
    'Coffee',
    'apple',
    'Banana',
    'Fig',
    'Éclair',
    '交通',
    '餐飲',
    'ｆ',
    '😀',
  ]);
});

test('[INSIGHTS-8.1] breaks remaining ties by the name as written, then by color', () => {
  const [january] = build(
    [
      expense({ categoryName: 'tea', amountMinor: 500 }),
      expense({ categoryId: 'tea-red', categoryName: 'Tea', amountMinor: 500 }),
      expense({
        categoryId: 'tea-green',
        categoryName: 'Tea',
        amountMinor: 500,
      }),
    ],
    {
      categories: [
        { id: 'tea-red', name: 'Tea', color: '#FF0000' },
        { id: 'tea-green', name: 'Tea', color: '#00FF00' },
      ],
    },
  ).months;

  expect(rows(january)).toEqual([
    ['Tea', '#00FF00', 500],
    ['Tea', '#FF0000', 500],
    ['tea', '#808080', 500],
  ]);
});

test.each<[number, number, number, number]>([
  [800, 1200, 400, 50],
  [1200, 900, -300, -25],
  [1000, 1000, 0, 0],
])(
  '[INSIGHTS-9.1] compares %i last month with %i this month',
  (previousTotalMinor, current, deltaMinor, deltaPercent) => {
    const [, january] = build([
      expense({ date: '2024-12-10', amountMinor: previousTotalMinor }),
      expense({ date: '2025-01-10', amountMinor: current }),
    ]).months;

    expect(insight(january).comparison).toEqual({
      previousTotalMinor,
      deltaMinor,
      deltaPercent,
    });
  },
);

test('[INSIGHTS-9.1] compares with the latest earlier month that has expenses', () => {
  const [, january] = build([
    expense({ date: '2024-10-10', amountMinor: 1000 }),
    expense({ date: '2025-01-10', amountMinor: 2000 }),
  ]).months;

  expect(insight(january).comparison).toEqual({
    previousTotalMinor: 1000,
    deltaMinor: 1000,
    deltaPercent: 100,
  });
});

test('[INSIGHTS-9.1] has no percentage when the previous period lacks the currency', () => {
  const [, january] = build([
    expense({ date: '2024-12-10', amountMinor: 500 }),
    expense({ date: '2025-01-10', amountMinor: 1000 }),
    expense({ date: '2025-01-11', currency: 'JPY', amountMinor: 2000 }),
  ]).months;

  expect(insight(january, 'JPY').comparison).toEqual({
    previousTotalMinor: 0,
    deltaMinor: 2000,
    deltaPercent: null,
  });
  expect(insight(january, 'USD').comparison).toEqual({
    previousTotalMinor: 500,
    deltaMinor: 500,
    deltaPercent: 100,
  });
});

test('[INSIGHTS-9.1] does not round the percentage', () => {
  const [, january] = build([
    expense({ date: '2024-12-10', amountMinor: 300 }),
    expense({ date: '2025-01-10', amountMinor: 400 }),
  ]).months;

  expect(insight(january).comparison?.deltaPercent).toBeCloseTo(100 / 3, 10);
});

test('[INSIGHTS-9.1] compares a year with the latest earlier year that has expenses', () => {
  const [, latest] = build([
    expense({ date: '2022-06-01', amountMinor: 1000 }),
    expense({ date: '2024-06-01', amountMinor: 1500 }),
  ]).years;

  expect(latest.key).toBe('2024');
  expect(insight(latest).comparison).toEqual({
    previousTotalMinor: 1000,
    deltaMinor: 500,
    deltaPercent: 50,
  });
});

test('[INSIGHTS-9.1] the earliest month and year have no comparison', () => {
  const insights = build([
    expense({ date: '2024-12-10', amountMinor: 500 }),
    expense({ date: '2025-01-10', amountMinor: 800 }),
  ]);

  expect(insight(insights.months[0]).comparison).toBeNull();
  expect(insight(insights.years[0]).comparison).toBeNull();
});

test.each<[InsightChartPreference, number, InsightChartKind]>([
  ['auto', 1, 'progress'],
  ['auto', 2, 'donut'],
  ['auto', 5, 'donut'],
  ['auto', 6, 'bar'],
  ['donut', 1, 'donut'],
  ['donut', 7, 'donut'],
  ['bar', 1, 'bar'],
  ['bar', 7, 'bar'],
])(
  '[INSIGHTS-10.1] %s with %i categories draws a %s chart',
  (chartPreference, count, kind) => {
    const [january] = build(inCategories(count), { chartPreference }).months;

    expect(insight(january).chart.kind).toBe(kind);
  },
);

test.each<[InsightChartPreference, number]>([
  ['auto', 1],
  ['auto', 5],
  ['auto', 6],
  ['donut', 5],
  ['bar', 7],
])(
  '[INSIGHTS-10.1] %s with %i categories charts every category',
  (chartPreference, count) => {
    const [january] = build(inCategories(count), { chartPreference }).months;

    const { categories, chart } = insight(january);
    expect(categories).toHaveLength(count);
    expect(chart.categories).toEqual(categories);
  },
);

test('[INSIGHTS-11.1] a donut of 7 categories draws the largest 5 and a gray Others', () => {
  const [january] = build(inCategories(7), {
    chartPreference: 'donut',
    categories: CHART_CATEGORIES,
  }).months;

  const { categories, chart } = insight(january);
  expect(chart.categories.slice(0, 5)).toEqual(categories.slice(0, 5));
  expect(
    chart.categories.map(({ name, color, amountMinor }) => [
      name,
      color,
      amountMinor,
    ]),
  ).toEqual([
    ['Category 1', '#000001', 70],
    ['Category 2', '#000002', 60],
    ['Category 3', '#000003', 50],
    ['Category 4', '#000004', 40],
    ['Category 5', '#000005', 30],
    ['Others', '#808080', 30],
  ]);
  expect(chart.categories[5].percent).toBeCloseTo((30 / 280) * 100, 10);
  expect(categories.map(({ name }) => name)).toEqual([
    'Category 1',
    'Category 2',
    'Category 3',
    'Category 4',
    'Category 5',
    'Category 6',
    'Category 7',
  ]);
});

test('[INSIGHTS-11.1] a donut of 6 categories puts the sixth in Others', () => {
  const [january] = build(inCategories(6), { chartPreference: 'donut' }).months;

  expect(
    insight(january).chart.categories.map(({ name, amountMinor }) => [
      name,
      amountMinor,
    ]),
  ).toEqual([
    ['Category 1', 60],
    ['Category 2', 50],
    ['Category 3', 40],
    ['Category 4', 30],
    ['Category 5', 20],
    ['Others', 10],
  ]);
});

test('[INSIGHTS-12.1] totals up to the safe integer limit', () => {
  const insights = build([
    expense({ date: '2025-01-10', amountMinor: Number.MAX_SAFE_INTEGER - 1 }),
    expense({ date: '2025-01-11', currency: 'JPY', amountMinor: 500 }),
    expense({ date: '2025-02-10', amountMinor: 1 }),
  ]);

  expect(keyedTotals(insights.years)).toEqual([
    [
      '2025',
      [
        ['JPY', 500],
        ['USD', Number.MAX_SAFE_INTEGER],
      ],
    ],
  ]);
});

test('[INSIGHTS-12.1] rejects a year whose total passes the limit', () => {
  expect(
    buildOrUndefined([
      expense({ date: '2025-01-10', amountMinor: Number.MAX_SAFE_INTEGER - 1 }),
      expense({ date: '2025-02-10', amountMinor: 2 }),
    ]),
  ).toBeUndefined();
});
