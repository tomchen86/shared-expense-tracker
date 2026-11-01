# Specs

What the system does **now**, one capability per directory: `docs/specs/<capability>/spec.md`.

A capability is a long-lived area of responsibility (identity, ledger, sync), not a feature. Name it after a boundary that already exists in the code or the tests.

History lives in git, reasons in `docs/adr/`, plans in GitHub Issues. None of them belong here.

## File format

```markdown
# Ledger

## Purpose

Expenses, categories, and how an expense is split between members.

## Requirements

### Requirement: LEDGER-1.1 Percentage split sums to 100

WHEN a member submits a percentage split, the API SHALL reject it unless the percentages sum to exactly 100.

#### Scenario: percentages fall short

- **WHEN** three members are assigned 33% each
- **THEN** the API rejects the split

### Requirement: LEDGER-2.1 Remainder goes to the payer

WHEN an amount cannot be split evenly, the API SHALL give the remainder to the payer.

#### Scenario: 100.00 split three ways

- **WHEN** 100.00 is split evenly between three members, one of whom paid
- **THEN** the payer's share is 33.34 and each other share is 33.33

### Requirement: LEDGER-5.1 (manual) Expense list scrolls smoothly

WHILE a member scrolls a list of 500 expenses on a physical phone, the mobile app SHALL scroll without visible stutter.

#### Scenario: long list

- **WHEN** the list holds 500 expenses
- **THEN** scrolling shows no visible stutter
```

## IDs

`<DOMAIN>-<number>.<version>`, for example `LEDGER-2.1`.

- Numbers are never reused. A deleted requirement leaves a gap.
- When the meaning changes, bump the version (`LEDGER-2.1` → `LEDGER-2.2`) and update every test that cites it. Passing tests still citing `LEDGER-2.1` fail the trace check. It sees only tests that ran and passed, so also search for `LEDGER-2.1` and `LEDGER_2_1` to find skipped, failing, or commented-out ones.
- Wording and typo fixes keep the version.
- `(manual)` right after the ID marks a requirement no automated test can check. The trace check lists these as the pre-release manual checklist.
- `(e2e)` in the same place marks a requirement that only an E2E flow can check, such as one about a native control, a gesture, or the keyboard (ADR-0008). PRs do not run the flows, so the trace check in `bash scripts/check.sh` only lists these; a run of the flows, `bash scripts/e2e-ios.sh`, fails while one has no passing flow that cites it. A flow finds elements only by the text and accessibility labels its requirements state.
- A heading that looks like a requirement (any level, any case, singular or plural) but is not exactly `### Requirement: <ID>` fails the trace check instead of being skipped.

## Sentences (EARS)

Every requirement is one sentence in one of these shapes, so it states its trigger and the expected response:

| Shape | Pattern |
|---|---|
| Always | The <component> SHALL … |
| Event | WHEN <event>, the <component> SHALL … |
| State | WHILE <state>, the <component> SHALL … |
| Unwanted | IF <condition>, THEN the <component> SHALL … |
| Optional | WHERE <feature is present>, the <component> SHALL … |

Name the component ("the API", "the mobile app") instead of "the system" whenever there is more than one. A rule enforced only in the client still lets bad data into the server.

Give every requirement at least one scenario with concrete values. Scenarios are the first draft of the tests.

## Citing requirements in tests

A test covers a requirement when it passes and its reported name contains the ID. Skipped, failing, and commented-out tests never count.

| Test runner | Example |
|---|---|
| jest, vitest, mocha | `it('[LEDGER-2.1] gives the remainder to the payer', …)` |
| pytest | `def test_LEDGER_2_1_remainder_goes_to_payer():` |
| Go | `t.Run("LEDGER-2.1 remainder goes to payer", …)` |
| JUnit (Java, Kotlin) | `void LEDGER_2_1_remainderGoesToPayer()` |
| Maestro (E2E flows) | `name: '[SHELL-6.1] Opens on the tabs with Expenses selected'` |

Keep other ID-shaped strings (`TLS-1.2`, `USD-1.5`, `HTTP_2_0`) out of test names: the trace check reads them as citations and reports them as unknown.

Tests that cite IDs are the acceptance tests: the spec author writes them, in the paths listed in `AGENTS.md`. Cite only behavior that a user or another component can observe; tests of internal details live elsewhere and cite no ID. When two components implement the same rule, both tests cite the same ID.
