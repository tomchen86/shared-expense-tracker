import {
  currencyDecimals,
  formatAmount,
  isLocalDate,
  parseAmount,
  splitEvenly,
  toLocalDate,
} from '../../src';

const LIMIT = 999_999_999_999;

const shares = (participants: string[], amounts: number[]) =>
  participants.map((participant, index) => ({
    participant,
    amountMinor: amounts[index],
  }));

test.each<[string, number]>([
  ['USD', 2],
  ['EUR', 2],
  ['TWD', 2],
  ['JPY', 0],
  ['KWD', 3],
])('[LEDGER-1.1] %s has %i decimal places', (currency, decimals) => {
  expect(currencyDecimals(currency)).toBe(decimals);
});

test.each(['XYZ', 'usd', 'XAU'])(
  '[LEDGER-1.1] %s is not supported',
  (currency) => {
    expect(currencyDecimals(currency)).toBeUndefined();
  },
);

test.each<[string, string, number]>([
  ['12.34', 'USD', 1234],
  ['12.3', 'AUD', 1230],
  ['12', 'JPY', 12],
  ['1.234', 'KWD', 1234],
  [' 8.75 ', 'USD', 875],
])('[LEDGER-2.1] parses %p in %s as %i', (text, currency, amountMinor) => {
  expect(parseAmount(text, currency)).toBe(amountMinor);
});

test.each<[string, string]>([
  ['0', 'USD'],
  ['0.00', 'USD'],
  ['-1', 'USD'],
  ['12abc', 'USD'],
  ['1e3', 'USD'],
  ['Infinity', 'USD'],
  ['', 'USD'],
  ['   ', 'USD'],
  ['.5', 'USD'],
  ['12.', 'USD'],
  ['05', 'USD'],
  ['12,5', 'USD'],
  ['10.999', 'USD'],
  ['1.0', 'JPY'],
  ['10', 'XYZ'],
])('[LEDGER-3.1] rejects %p in %s', (text, currency) => {
  expect(parseAmount(text, currency)).toBeUndefined();
});

test.each<[string, string]>([
  ['9999999999.99', 'USD'],
  ['999999999999', 'JPY'],
])('[LEDGER-4.1] accepts %p in %s at the limit', (text, currency) => {
  expect(parseAmount(text, currency)).toBe(LIMIT);
});

test.each<[string, string]>([
  ['10000000000.00', 'USD'],
  ['1000000000000', 'JPY'],
])('[LEDGER-4.1] rejects %p in %s above the limit', (text, currency) => {
  expect(parseAmount(text, currency)).toBeUndefined();
});

test.each<[number, string, string]>([
  [1500, 'USD', '15.00'],
  [5, 'USD', '0.05'],
  [1200, 'JPY', '1200'],
  [1234, 'KWD', '1.234'],
  [LIMIT, 'USD', '9999999999.99'],
])(
  '[LEDGER-5.1] formats %i in %s as %p, which parses back',
  (amountMinor, currency, text) => {
    expect(formatAmount(amountMinor, currency)).toBe(text);
    expect(parseAmount(text, currency)).toBe(amountMinor);
  },
);

test.each<[number, string[], number[]]>([
  [1000, ['A', 'B', 'C'], [334, 333, 333]],
  [10001, ['A', 'B', 'C'], [3334, 3334, 3333]],
  [1000, ['B', 'A', 'C'], [334, 333, 333]],
  [1, ['A', 'B'], [1, 0]],
  [1000, ['A', 'B', 'C', 'D'], [250, 250, 250, 250]],
])('[LEDGER-6.1] splits %i among %j', (amountMinor, participants, amounts) => {
  expect(splitEvenly(amountMinor, participants)).toEqual(
    shares(participants, amounts),
  );
});

test.each<[number, string[]]>([
  [1000, []],
  [1000, ['A', 'A', 'B']],
  [0, ['A', 'B']],
  [12.5, ['A', 'B']],
  [1_000_000_000_000, ['A', 'B']],
])(
  '[LEDGER-7.1] rejects splitting %p among %j',
  (amountMinor, participants) => {
    expect(splitEvenly(amountMinor, participants)).toBeUndefined();
  },
);

test('[LEDGER-7.1] splits the largest amount', () => {
  expect(splitEvenly(LIMIT, ['A', 'B', 'C'])).toEqual(
    shares(
      ['A', 'B', 'C'],
      [333_333_333_333, 333_333_333_333, 333_333_333_333],
    ),
  );
});

test.each<[string, string, string]>([
  ['Australia/Sydney', '2025-01-01T13:30:00Z', '2025-01-02'],
  ['America/Los_Angeles', '2025-01-01T05:00:00Z', '2024-12-31'],
])(
  '[LEDGER-8.1] in %s the instant %s falls on %s',
  (timeZone, instant, date) => {
    expect(toLocalDate(new Date(instant), timeZone)).toBe(date);
  },
);

test.each(['2024-02-29', '2025-12-31'])(
  '[LEDGER-9.1] %p is a valid expense date',
  (text) => {
    expect(isLocalDate(text)).toBe(true);
  },
);

test.each([
  '2025-02-29',
  '2025-02-30',
  '2025-13-01',
  '2025-1-5',
  '2025/01/05',
  '',
])('[LEDGER-9.1] %p is not a valid expense date', (text) => {
  expect(isLocalDate(text)).toBe(false);
});
