import { buildInsights, type InsightExpense } from './insights';

const expense = (fields: Partial<InsightExpense> = {}): InsightExpense => ({
  amountMinor: 100,
  currency: 'USD',
  date: '2025-01-10',
  spaceId: 'trip',
  shares: [],
  categoryName: 'Food',
  ...fields,
});

test.each<[number, number[]]>([
  [1, [Number.MAX_SAFE_INTEGER]],
  [2, []],
])(
  'a personal projection with a final share of %i respects the integer limit',
  (lastShare, expectedTotals) => {
    const result = buildInsights({
      expenses: [
        expense({
          shares: [
            {
              participant: 'personal',
              amountMinor: Number.MAX_SAFE_INTEGER - 1,
            },
            { participant: 'linked', amountMinor: lastShare },
          ],
        }),
      ],
      categories: [],
      context: {
        kind: 'personal',
        userId: 'me',
        personalSpaceId: 'my-space',
        personalParticipantId: 'personal',
        participants: [{ id: 'linked', userId: 'me' }],
      },
      chartPreference: 'auto',
    });

    expect(result).toBeDefined();
    expect(
      result!.months.map(({ currencies }) => currencies[0].totalMinor),
    ).toEqual(expectedTotals);
    expect(
      result!.years.map(({ currencies }) => currencies[0].totalMinor),
    ).toEqual(expectedTotals);
  },
);

test.each(['Food', 'Travel'])(
  'rejects monthly overflow with a second expense in %s',
  (categoryName) => {
    expect(
      buildInsights({
        expenses: [
          expense({ amountMinor: Number.MAX_SAFE_INTEGER }),
          expense({ amountMinor: 1, categoryName }),
        ],
        categories: [],
        context: { kind: 'group', groupId: 'trip' },
        chartPreference: 'auto',
      }),
    ).toBeUndefined();
  },
);

test('expense order cannot change snapshot selection, category identity, or chart output', () => {
  const expenses = [
    expense({
      categoryId: 'gone',
      categorySnapshot: { name: '😀', color: '#111111' },
    }),
    expense({
      categoryId: 'gone',
      categorySnapshot: { name: 'ｆ', color: '#222222' },
    }),
    expense({
      categoryId: 'gone',
      categorySnapshot: { name: 'ｆ', color: '#111111' },
    }),
    expense({ categoryId: 'gone', date: '2025-01-20' }),
    expense({
      categoryId: 'gone',
      date: '2025-01-01',
      categorySnapshot: { name: 'Alpha', color: '#111111' },
    }),
    expense({ categoryId: 'Food' }),
    expense(),
  ].map((item) => {
    Object.freeze(item.shares);
    Object.freeze(item.categorySnapshot);
    return Object.freeze(item);
  });
  const input = {
    categories: Object.freeze([
      Object.freeze({ id: 'Food', name: 'Meals', color: '#00FF00' }),
    ]),
    context: { kind: 'group' as const, groupId: 'trip' },
    chartPreference: 'donut' as const,
  };
  const expected = buildInsights({
    ...input,
    expenses: Object.freeze(expenses),
  });
  expect(expected!.months[0].currencies[0].categories).toEqual([
    {
      name: 'ｆ',
      color: '#111111',
      amountMinor: 500,
      percent: (500 / 700) * 100,
    },
    {
      name: 'Food',
      color: '#808080',
      amountMinor: 100,
      percent: (100 / 700) * 100,
    },
    {
      name: 'Meals',
      color: '#00FF00',
      amountMinor: 100,
      percent: (100 / 700) * 100,
    },
  ]);

  for (let offset = 0; offset < expenses.length; offset++) {
    const rotated = [...expenses.slice(offset), ...expenses.slice(0, offset)];
    expect(
      buildInsights({ ...input, expenses: Object.freeze(rotated) }),
    ).toEqual(expected);
    expect(
      buildInsights({
        ...input,
        expenses: Object.freeze([...rotated].reverse()),
      }),
    ).toEqual(expected);
  }
});
