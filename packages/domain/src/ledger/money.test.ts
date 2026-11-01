import { CURRENCY_DECIMALS } from './currencies';
import {
  currencyDecimals,
  formatAmount,
  parseAmount,
  splitEvenly,
} from './money';

test.each<[string, number]>([
  ['BIF', 0],
  ['XOF', 0],
  ['MGA', 2],
  ['XAD', 2],
  ['XCG', 2],
  ['ZWG', 2],
  ['BHD', 3],
  ['CLF', 4],
  ['UYW', 4],
])('looks up fixed minor units for %s', (currency, decimals) => {
  expect(currencyDecimals(currency)).toBe(decimals);
});

test.each([
  'toString',
  'constructor',
  '__proto__',
  '',
  ' USD',
  'Usd',
  'XAG',
  'XDR',
  'XXX',
])('does not treat %p as a supported currency', (currency) => {
  expect(currencyDecimals(currency)).toBeUndefined();
  expect(parseAmount('1', currency)).toBeUndefined();
});

test.each<[string, string, number]>([
  ['0.01', 'USD', 1],
  ['0.29', 'USD', 29],
  ['1.01', 'USD', 101],
  ['9999999999.98', 'USD', 999_999_999_998],
  ['0.001', 'KWD', 1],
  ['999999999.999', 'KWD', 999_999_999_999],
  ['0.0001', 'CLF', 1],
  ['1.2', 'UYW', 12_000],
  ['99999999.9999', 'CLF', 999_999_999_999],
])('converts %s %s without decimal rounding', (text, currency, expected) => {
  expect(parseAmount(text, currency)).toBe(expected);
});

test.each([
  '100000000',
  '99999999.99999',
  '9007199254740993',
  '9'.repeat(500),
  '+1',
  '1_000',
  '1 000',
  '0x10',
  '1\n.2',
  '１',
])('rejects oversized or malformed text %p before arithmetic', (text) => {
  expect(parseAmount(text, 'CLF')).toBeUndefined();
});

test.each([NaN, Infinity, -Infinity, -1, Number.MAX_SAFE_INTEGER + 1])(
  'rejects nonpositive, nonfinite or unsafe split amount %p',
  (amount) => {
    expect(splitEvenly(amount, ['A', 'B'])).toBeUndefined();
  },
);

test.each<[number, string, string]>([
  [Number.MAX_SAFE_INTEGER, 'JPY', '9007199254740991'],
  [Number.MAX_SAFE_INTEGER, 'KWD', '9007199254740.991'],
  [Number.MAX_SAFE_INTEGER, 'CLF', '900719925474.0991'],
  [9_007_199_254_739_999, 'CLF', '900719925473.9999'],
  [0, 'KWD', '0.000'],
  [0, 'UYW', '0.0000'],
  [-0, 'USD', '0.00'],
])('formats %p %s with exact decimal digits', (amount, currency, expected) => {
  expect(formatAmount(amount, currency)).toBe(expected);
});

test.each([NaN, Infinity, -Infinity, Number.MIN_VALUE])(
  'rejects formatting a nonfinite or fractional amount %p',
  (amount) => {
    expect(formatAmount(amount, 'USD')).toBeUndefined();
  },
);

test('round-trips integer amounts across every supported currency', () => {
  for (const currency of Object.keys(CURRENCY_DECIMALS)) {
    for (const amount of [
      1, 29, 101, 10_001, 999_999_999_998, 999_999_999_999,
    ]) {
      const text = formatAmount(amount, currency)!;
      expect(text).toMatch(/^\d+(\.\d+)?$/);
      expect(parseAmount(text, currency)).toBe(amount);
    }
  }
});

test('preserves the original participant list', () => {
  const participants = Object.freeze(['second', 'first', 'third']);
  expect(splitEvenly(5, participants)).toEqual([
    { participant: 'second', amountMinor: 2 },
    { participant: 'first', amountMinor: 2 },
    { participant: 'third', amountMinor: 1 },
  ]);
  expect(participants).toEqual(['second', 'first', 'third']);
});

test('conserves every minor unit and keeps shares ordered and balanced', () => {
  for (let count = 1; count <= 40; count++) {
    const participants = Array.from(
      { length: count },
      (_, index) => `${index}`,
    );
    for (const amount of [1, 2, 97, 10_001, 999_999_999_998, 999_999_999_999]) {
      const shares = splitEvenly(amount, participants)!;
      const amounts = shares.map((share) => share.amountMinor);
      expect(shares.map((share) => share.participant)).toEqual(participants);
      expect(amounts.reduce((sum, value) => sum + value, 0)).toBe(amount);
      expect(
        amounts.every((value) => Number.isSafeInteger(value) && value >= 0),
      ).toBe(true);
      expect(Math.max(...amounts) - Math.min(...amounts)).toBeLessThanOrEqual(
        1,
      );
      expect(amounts).toEqual([...amounts].sort((left, right) => right - left));
    }
  }
});
