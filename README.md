# Shared Expense Tracker

A simple bookkeeping app for everyday expenses, alone or together with a partner or friends. No sign-up by default, it works offline and keeps data on your device, and shared ledgers sync once you are online.

## Develop

Use Node from `.nvmrc`, pnpm from `package.json`, and Python 3 for the requirement trace.

```bash
pnpm install
bash scripts/check.sh            # lint, format check, typecheck, tests, requirement trace
pnpm test:traced                  # only requirement-citing acceptance tests, with branch coverage
pnpm --filter mobile start        # Expo development server
```

The workspace contains the mobile toolchain and an empty domain module. Product routes
and behavior arrive with their capability specs.

Jest discovers `*.test.ts`, `*.test.tsx`, and `*.test.js` under each workspace's
`src/` and `tests/`. Acceptance tests live in the directories listed in `AGENTS.md`;
other tests cite no requirement IDs. Tooling tests live in `tests/tooling/`.
JUnit reports go to `reports/junit/`; traced coverage includes branch counts in
`reports/coverage/coverage-summary.json` and LCOV. With no acceptance tests yet,
`pnpm test:traced` exits successfully without claiming coverage.

Domain source is typechecked using only ES2022 types. Its tests are checked separately
with Jest and Node types, so test tooling cannot enable Node APIs in domain code.

Lint also checks the platform boundary in ADR-0002: `.ios`, `.android`, `.native`, and
`.web` files, `Platform` imports, and `process.env.EXPO_OS` checks stay in mobile
`src/ui/`, and UI cannot import capability code, including
through the `@/` alias. Outside UI, use named React Native imports so namespace,
default, and dynamic imports cannot hide access to `Platform`.

## Where things are

| What | Where |
|---|---|
| What the system does | `docs/specs/` |
| How the parts fit together | `docs/architecture.md` |
| Why it is built this way | `docs/adr/` |
| Where it is going | `docs/roadmap.md` |
| Plan for each phase | `docs/proposals/` |
| Plans, progress, discussion | GitHub Issues and the Project board |
| Rules for AI agents | `AGENTS.md` |
| Step-by-step procedures for AI agents | `skills/` |
