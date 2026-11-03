import { currencyDecimals } from './money';

/** Localized currency text, keeping integer totals exact even beyond Number's range. */
export function formatCurrency(
  amountMinor: number | bigint,
  currency: string,
  locale: string,
): string {
  const decimals = currencyDecimals(currency);
  if (decimals === undefined) throw new RangeError('Unsupported currency');
  if (typeof amountMinor === 'number' && !Number.isSafeInteger(amountMinor))
    throw new RangeError('Invalid minor units');
  const amount = BigInt(amountMinor);
  if (amount < 0n) throw new RangeError('Negative amount');
  const scale = 10n ** BigInt(decimals);
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  const digits = new Intl.NumberFormat(locale, { useGrouping: false });
  const whole = amount / scale;
  // Hermes on iOS has no NumberFormat.formatToParts. Pass only safe integers to
  // native Intl, then replace its zero fraction with the exact minor units.
  let formatted: string;
  if (whole <= BigInt(Number.MAX_SAFE_INTEGER)) {
    formatted = formatter.format(Number(whole));
  } else {
    // Get the platform's currency placement and repeating grouping sizes from a
    // safe sample, including the 3-2-2 grouping used in India.
    const one = digits.format(1);
    const sample = formatter.format(111111111111111);
    const start = sample.indexOf(one);
    const end = sample.lastIndexOf(one) + one.length;
    const pattern = sample.slice(start, end);
    const separator = pattern.replaceAll(one, '')[0] ?? '';
    const widths = separator
      ? pattern.split(separator).map((part) => part.length / one.length)
      : [];
    const groups: string[] = [];
    let remaining = String(whole);
    let width = widths.at(-1) ?? remaining.length;
    while (remaining.length > width) {
      groups.unshift(remaining.slice(-width));
      remaining = remaining.slice(0, -width);
      width = widths.at(-2) ?? width;
    }
    groups.unshift(remaining);
    const localized = groups
      .join(separator)
      .replace(/\d/g, (digit) => digits.format(Number(digit)));
    formatted = sample.slice(0, start) + localized + sample.slice(end);
  }
  if (!decimals) return formatted;
  const zeroFraction = digits.format(0).repeat(decimals);
  const fraction = new Intl.NumberFormat(locale, {
    useGrouping: false,
    minimumIntegerDigits: decimals,
  }).format(Number(amount % scale));
  const fractionStart = formatted.lastIndexOf(zeroFraction);
  return (
    formatted.slice(0, fractionStart) +
    fraction +
    formatted.slice(fractionStart + zeroFraction.length)
  );
}
