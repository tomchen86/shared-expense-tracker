# ADR-0004: Money as integer minor units

- Date: 2026-10-23
- Status: Accepted

## Context

Split and settlement amounts are a level-2 area (ADR-0001). Every client applies the same money rules from `packages/domain`. The sync server stores only events it cannot read, so it never sees or computes an amount (ADR-0003); amounts exist only on the clients, in SQLite on the phone and in JavaScript. SQLite has no decimal type, and a JavaScript `number` is a binary float, in which 0.1 + 0.2 is not 0.3 and integers beyond 2^53 lose precision without any error.

The baseline already stores amounts as integers in the currency's minor unit: the app's `amountMinor` and the API's `bigint` `amount_cents`. It reads each currency's number of decimal places from the device's `Intl`, which can give different answers on different devices, JavaScript engines, and browsers.

## Decision

- An amount is an integer in its currency's minor unit, always paired with its ISO 4217 currency code: NT$123.45 is 12345 with `TWD`. It must be a safe integer in JavaScript (`Number.isSafeInteger`).
- Each currency's number of decimal places comes from a fixed table in `packages/domain`, never from the device. Once a currency is in the table, its entry never changes, so an amount already recorded keeps its meaning.
- Arithmetic on amounts uses integers only. A split allocates integers so the shares add up exactly to the total; the ledger spec decides who gets the leftover minor units.
- Every intermediate value in a calculation must be a safe integer too, such as an amount multiplied by a split's percentage or weight. The ledger spec decides how: by capping the largest amount, or by computing with `BigInt` internally. Either way, tests cover the limit.
- Amounts in different currencies are never added together.
- Values that are not money changing hands, such as percentages and unit prices per liter, are computed from the integers when needed and are not stored as amounts.

## Consequences

- Sums and splits are exact on every client, and every device reads the same integer as the same amount.
- Converting between decimal text and integers, for input and display, happens in one place, `packages/domain`, using the table. A currency that is not in the table cannot be recorded until it is added.
- A figure with more decimal places than its currency allows, such as a fuel price per liter printed with three decimals, is kept as receipt text or computed when shown, never stored as an amount.
- When the ledger moves in from the baseline, its `Intl` lookup is replaced by the table.
