import { formatCurrency } from './format-currency';

test('preserves minor units near and beyond the safe integer limit', () => {
  expect(formatCurrency(Number.MAX_SAFE_INTEGER, 'USD', 'en-US')).toBe(
    '$90,071,992,547,409.91',
  );
  expect(formatCurrency(900719925474099312345n, 'USD', 'en-US')).toBe(
    '$9,007,199,254,740,993,123.45',
  );
});

test('uses fixed currency precision and local digits for both parts', () => {
  expect(formatCurrency(123456, 'IDR', 'en-US').replace(/\s/g, ' ')).toBe(
    'IDR 1,234.56',
  );
  expect(formatCurrency(1234, 'IQD', 'en-US').replace(/\s/g, ' ')).toBe(
    'IQD 1.234',
  );
  expect(formatCurrency(1200, 'JPY', 'ja-JP')).toBe('￥1,200');
  expect(formatCurrency(105, 'USD', 'ar-EG')).toContain('١٫٠٥');
  expect(formatCurrency(0, 'USD', 'en-US')).toBe('$0.00');
});

test('rejects unsupported currencies and invalid minor units', () => {
  expect(() => formatCurrency(1, 'NOT', 'en-US')).toThrow(RangeError);
  expect(() => formatCurrency(-1, 'USD', 'en-US')).toThrow(RangeError);
  expect(() => formatCurrency(1.5, 'USD', 'en-US')).toThrow(RangeError);
  expect(() =>
    formatCurrency(Number.MAX_SAFE_INTEGER + 1, 'USD', 'en-US'),
  ).toThrow(RangeError);
});

test('keeps native currency placement and grouping for very large totals', () => {
  for (const locale of ['en-US', 'zh-TW', 'ja-JP', 'de-DE', 'hi-IN', 'ar-EG']) {
    for (const currency of ['USD', 'JPY', 'IQD']) {
      const decimals = currency === 'JPY' ? 0 : currency === 'IQD' ? 3 : 2;
      const expected = new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(900719925474099312345n);
      expect(
        formatCurrency(
          900719925474099312345n * 10n ** BigInt(decimals),
          currency,
          locale,
        ),
      ).toBe(expected);
    }
  }
});

test('formats on native Intl without formatToParts or BigInt input support', () => {
  const NativeNumberFormat = Intl.NumberFormat;
  const spy = jest.spyOn(Intl, 'NumberFormat').mockImplementation((...args) => {
    const formatter = new NativeNumberFormat(...args);
    const format = formatter.format;
    Object.defineProperties(formatter, {
      formatToParts: { value: undefined },
      format: {
        value: (value: number) => {
          if (typeof value !== 'number')
            throw new TypeError('Only numbers supported');
          return format(value);
        },
      },
    });
    return formatter;
  });
  try {
    expect(formatCurrency(875n, 'USD', 'en-US')).toBe('$8.75');
    expect(formatCurrency(Number.MAX_SAFE_INTEGER, 'USD', 'en-US')).toBe(
      '$90,071,992,547,409.91',
    );
  } finally {
    spy.mockRestore();
  }
});
