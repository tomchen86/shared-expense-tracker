import { groupAmounts } from './amounts';

test('other groups and trashed allocations introduce no totals, currencies or former members', () => {
  const expense = {
    spaceId: 'trip',
    currency: 'USD',
    amountMinor: 100,
    payments: [{ participant: 'payer', amountMinor: 100 }],
    shares: [{ participant: 'payer', amountMinor: 100 }],
  };
  const amounts = groupAmounts(
    [
      expense,
      { ...expense, spaceId: 'other', currency: 'JPY' },
      { ...expense, currency: 'EUR', trashOrder: 1 },
      {
        ...expense,
        trashOrder: 2,
        shares: [{ participant: 'former', amountMinor: 100 }],
      },
    ],
    { id: 'trip', members: [{ id: 'payer' }] },
  );

  expect(amounts).toEqual([
    {
      currency: 'USD',
      total: 100n,
      members: new Map([['payer', { paid: 100n, share: 100n, net: 0n }]]),
    },
  ]);
});

test('large group totals conserve every minor unit beyond the safe number range', () => {
  const expenses = Array.from({ length: 10_000 }, () => ({
    spaceId: 'trip',
    currency: 'USD',
    amountMinor: 999_999_999_999,
    payments: [{ participant: 'payer', amountMinor: 999_999_999_999 }],
    shares: [
      { participant: 'payer', amountMinor: 500_000_000_000 },
      { participant: 'friend', amountMinor: 499_999_999_999 },
    ],
  }));

  const [amounts] = groupAmounts(expenses, {
    id: 'trip',
    members: [{ id: 'payer' }, { id: 'friend' }],
  });

  expect(amounts.total).toBe(9_999_999_999_990_000n);
  expect(amounts.members.get('payer')).toEqual({
    paid: 9_999_999_999_990_000n,
    share: 5_000_000_000_000_000n,
    net: 4_999_999_999_990_000n,
  });
  expect(amounts.members.get('friend')).toEqual({
    paid: 0n,
    share: 4_999_999_999_990_000n,
    net: -4_999_999_999_990_000n,
  });
});
