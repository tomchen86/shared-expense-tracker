// Stubs for the ledger money rules in docs/specs/ledger/spec.md. The implementer
// replaces each body; the signatures are the boundary the acceptance tests use.

export interface Share<P> {
  participant: P;
  amountMinor: number;
}

/** Decimal places of an ISO 4217 currency, or undefined when it is not supported. */
export function currencyDecimals(currency: string): number | undefined {
  throw new Error(`Not implemented: currencyDecimals(${currency})`);
}

/** Amount text in minor units, or undefined when the text is rejected. */
export function parseAmount(
  text: string,
  currency: string,
): number | undefined {
  throw new Error(`Not implemented: parseAmount(${text}, ${currency})`);
}

/** Minor units as plain decimal text in the currency's decimal places. */
export function formatAmount(amountMinor: number, currency: string): string {
  throw new Error(`Not implemented: formatAmount(${amountMinor}, ${currency})`);
}

/** Equal shares in the participants' order, or undefined when the split is rejected. */
export function splitEvenly<P>(
  amountMinor: number,
  participants: readonly P[],
): Share<P>[] | undefined {
  throw new Error(
    `Not implemented: splitEvenly(${amountMinor}, ${participants.length})`,
  );
}
