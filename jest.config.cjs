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
    // Checks that payments and shares in an imported file add up to each amount.
    './apps/mobile/src/backup/import.ts': { branches: 100 },
    './apps/mobile/src/groups/group-card.tsx': { branches: 83.33 },
    './apps/mobile/src/groups/group-screen.tsx': { branches: 95.08 },
    './apps/mobile/src/groups/group-summary.tsx': { branches: 50 },
    './apps/mobile/src/groups/groups-screen.tsx': { branches: 100 },
    './apps/mobile/src/groups/balances-screen.tsx': { branches: 100 },
    './apps/mobile/src/groups/format-balance.ts': { branches: 100 },
    './apps/mobile/src/ledger/expenses.ts': { branches: 90.76 },
    './apps/mobile/src/ledger/expense-form-screen.tsx': { branches: 97.91 },
    './apps/mobile/src/ledger/use-expense-form.ts': { branches: 92.36 },
    './apps/mobile/src/ledger/use-expenses.ts': { branches: 89.65 },
    './apps/mobile/src/ledger/expense-screen.tsx': { branches: 98.21 },
    './apps/mobile/src/ledger/expenses-screen.tsx': { branches: 100 },
    // Offline sync: what writes a shared ledger's changes as events and applies the
    // events received, in the sync capability and in the capabilities whose tables it changes.
    './apps/mobile/src/sync/apply.ts': { branches: 100 },
    './apps/mobile/src/sync/index.ts': { branches: 75 },
    './apps/mobile/src/sync/positions.ts': { branches: 75 },
    './apps/mobile/src/sync/records.ts': { branches: 94.73 },
    './apps/mobile/src/sync/use-synced-focus-effect.ts': { branches: 83.33 },
    './apps/mobile/src/ledger/merged-expense.ts': { branches: 100 },
    './apps/mobile/src/ledger/trash.ts': { branches: 81.25 },
    './apps/mobile/src/categories/merged-category.ts': { branches: 100 },
    './apps/mobile/src/categories/repository.ts': { branches: 88.23 },
    './apps/mobile/src/groups/index.ts': { branches: 79.16 },
  },
  testTimeout: 15000,
};
