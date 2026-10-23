// Stubs for the ledger date rules in docs/specs/ledger/spec.md. The implementer
// replaces each body; the signatures are the boundary the acceptance tests use.

/** The calendar date of an instant in an IANA time zone, as YYYY-MM-DD. */
export function toLocalDate(instant: Date, timeZone: string): string {
  throw new Error(
    `Not implemented: toLocalDate(${instant.toISOString()}, ${timeZone})`,
  );
}

/** Whether text is a valid YYYY-MM-DD calendar date. */
export function isLocalDate(text: string): boolean {
  throw new Error(`Not implemented: isLocalDate(${text})`);
}
