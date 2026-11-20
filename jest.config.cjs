// Every test runs in the same time zone wherever it runs: west of UTC, where a
// date read as UTC midnight falls on the day before.
process.env.TZ = 'America/Los_Angeles';

module.exports = {
  projects: [
    {
      displayName: 'tooling',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/tooling/**/*.test.cjs'],
    },
    '<rootDir>/apps/api/jest.config.cjs',
    ...require('./apps/mobile/jest.config.cjs').projects,
    '<rootDir>/packages/domain/jest.config.cjs',
  ],
  reporters: [
    'default',
    ['jest-junit', { outputDirectory: '<rootDir>/reports/junit' }],
  ],
  coverageDirectory: '<rootDir>/reports/coverage',
  coverageReporters: ['text', 'json-summary', 'lcov'],
  coverageThreshold: {
    './packages/domain/src/ledger/money.ts': { branches: 100 },
    // Measured using acceptance tests alone, so test:traced enforces these too.
    './packages/domain/src/crypto/index.ts': { branches: 100 },
    './packages/domain/src/groups/amounts.ts': { branches: 100 },
    './packages/domain/src/insights/insights.ts': { branches: 98.96 },
    './packages/domain/src/sync/sync.ts': { branches: 100 },
    // Checks imported amounts and keeps the latest sync stamp across an import.
    './apps/mobile/src/backup/import.ts': { branches: 100 },
    './apps/mobile/src/groups/group-card.tsx': { branches: 83.33 },
    './apps/mobile/src/groups/group-screen.tsx': { branches: 95.38 },
    './apps/mobile/src/groups/group-summary.tsx': { branches: 50 },
    './apps/mobile/src/groups/groups-screen.tsx': { branches: 100 },
    './apps/mobile/src/groups/balances-screen.tsx': { branches: 100 },
    './apps/mobile/src/groups/format-balance.ts': { branches: 100 },
    './apps/mobile/src/ledger/expenses.ts': { branches: 92 },
    './apps/mobile/src/ledger/list-filter.ts': { branches: 100 },
    './apps/mobile/src/ledger/expense-form-screen.tsx': { branches: 97.91 },
    './apps/mobile/src/ledger/use-expense-form.ts': { branches: 92.36 },
    './apps/mobile/src/ledger/use-expenses.ts': { branches: 91.66 },
    './apps/mobile/src/ledger/expense-screen.tsx': { branches: 98.21 },
    './apps/mobile/src/ledger/expenses-screen.tsx': { branches: 100 },
    // Offline sync: what writes a shared ledger's changes as events and applies the
    // events received, in the sync capability and in the capabilities whose tables it changes.
    './apps/mobile/src/sync/apply.ts': { branches: 100 },
    './apps/mobile/src/sync/index.ts': { branches: 75 },
    './apps/mobile/src/sync/positions.ts': { branches: 75 },
    './apps/mobile/src/sync/records.ts': { branches: 94.73 },
    './apps/mobile/src/sync/use-synced-focus-effect.ts': { branches: 83.33 },
    // The phone's sync with the API (ADR-0027): the loop, the check of unsent stamps, and
    // what starts a sync and shows its notices. Measured with the tests against the API
    // (`*-api.test.*`), which need Docker.
    './apps/mobile/src/sync/loop.ts': { branches: 98.18 },
    './apps/mobile/src/sync/stamps.ts': { branches: 95.65 },
    './apps/mobile/src/sync/use-sync-notices.ts': { branches: 75 },
    './apps/mobile/src/sync/use-sync-triggers.ts': { branches: 93.75 },
    // No acceptance test decodes a character that is cut short; utf8.test.ts reaches every branch.
    './apps/mobile/src/sync/utf8.ts': { branches: 95.83 },
    './apps/mobile/src/ledger/merged-expense.ts': { branches: 100 },
    './apps/mobile/src/ledger/trash.ts': { branches: 83.33 },
    './apps/mobile/src/categories/merged-category.ts': { branches: 100 },
    './apps/mobile/src/categories/repository.ts': { branches: 88.23 },
    './apps/mobile/src/groups/index.ts': { branches: 79.16 },
    // Device identity and signed requests: what lets a phone reach the API that a shared
    // ledger syncs through, and what the API checks before it takes anything (ADR-0015,
    // ADR-0022).
    './packages/domain/src/api/signed-request.ts': { branches: 100 },
    './apps/api/src/node.ts': { branches: 63.63 },
    // What every run reaches. The branch left needs two registrations of one device ID to
    // race, so a run that measures 100 reached it by its timing: leave this where it is.
    './apps/api/src/sharing/devices.ts': { branches: 92.85 },
    './apps/api/src/sharing/ip.ts': { branches: 93.33 },
    './apps/api/src/sharing/request-body.ts': { branches: 100 },
    './apps/api/src/sharing/signed-requests.ts': { branches: 100 },
    './apps/mobile/src/sharing/api-request.ts': { branches: 100 },
    './apps/mobile/src/sharing/device-identity.ts': { branches: 100 },
    // The event API: what stores a shared ledger's events, numbers them and hands them
    // out, and the checks of its bodies that the phone and the API share (ADR-0016,
    // ADR-0024).
    './packages/domain/src/api/group-events.ts': { branches: 100 },
    './apps/api/src/sync/groups.ts': { branches: 100 },
    './apps/api/src/sync/routes.ts': { branches: 100 },
  },
  testTimeout: 15000,
};
