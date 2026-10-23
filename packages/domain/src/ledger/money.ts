import { CURRENCY_DECIMALS } from './currencies';

const MAX_AMOUNT_MINOR = 999_999_999_999;

export interface Share<P> {
  participant: P;
  amountMinor: number;
}

/** Decimal places of an ISO 4217 currency, or undefined when it is not supported. */
export function currencyDecimals(currency: string): number | undefined {
  return Object.hasOwn(CURRENCY_DECIMALS, currency)
    ? CURRENCY_DECIMALS[currency]
    : undefined;
}

/** Amount text in minor units, or undefined when the text is rejected. */
export function parseAmount(
  text: string,
  currency: string,
): number | undefined {
  const decimals = currencyDecimals(currency);
  if (decimals === undefined) return undefined;

  const match = /^(0|[1-9]\d*)(?:\.(\d+))?$/.exec(text.trim());
  if (!match) return undefined;

  const fraction = match[2] ?? '';
  if (fraction.length > decimals) return undefined;

  // Build the integer as text first, rejecting overflow before Number conversion.
  const minorText = `${match[1]}${fraction.padEnd(decimals, '0')}`.replace(
    /^0+/,
    '',
  );
  if (minorText.length > String(MAX_AMOUNT_MINOR).length) return undefined;

  const amountMinor = Number(minorText);
  return amountMinor > 0 ? amountMinor : undefined;
}

/** Minor units as plain decimal text, or undefined when the amount or currency is rejected. */
export function formatAmount(
  amountMinor: number,
  currency: string,
): string | undefined {
  const decimals = currencyDecimals(currency);
  if (
    decimals === undefined ||
    !Number.isSafeInteger(amountMinor) ||
    amountMinor < 0
  ) {
    return undefined;
  }

  // Insert the decimal point without rounding even at Number.MAX_SAFE_INTEGER.
  const digits = String(amountMinor).padStart(decimals + 1, '0');
  if (decimals === 0) return digits;
  return `${digits.slice(0, -decimals)}.${digits.slice(-decimals)}`;
}

/** Equal shares in the participants' order, or undefined when the split is rejected. */
export function splitEvenly<P>(
  amountMinor: number,
  participants: readonly P[],
): Share<P>[] | undefined {
  if (
    !Number.isSafeInteger(amountMinor) ||
    amountMinor <= 0 ||
    amountMinor > MAX_AMOUNT_MINOR ||
    participants.length === 0 ||
    new Set(participants).size !== participants.length
  ) {
    return undefined;
  }

  const base = Math.floor(amountMinor / participants.length);
  const remainder = amountMinor % participants.length;
  return participants.map((participant, index) => ({
    participant,
    amountMinor: base + (index < remainder ? 1 : 0),
  }));
}
