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
    './packages/domain/src/groups/amounts.ts': { branches: 100 },
    './packages/domain/src/insights/insights.ts': { branches: 98.87 },
    './apps/mobile/src/groups/group-card.tsx': { branches: 83.33 },
    './apps/mobile/src/groups/group-screen.tsx': { branches: 94.64 },
    './apps/mobile/src/groups/group-summary.tsx': { branches: 50 },
    './apps/mobile/src/groups/groups-screen.tsx': { branches: 100 },
    './apps/mobile/src/groups/balances-screen.tsx': { branches: 100 },
    './apps/mobile/src/groups/format-balance.ts': { branches: 100 },
    './apps/mobile/src/ledger/expenses.ts': { branches: 84.61 },
    './apps/mobile/src/ledger/expense-form-screen.tsx': { branches: 97.91 },
    './apps/mobile/src/ledger/use-expense-form.ts': { branches: 92.24 },
    './apps/mobile/src/ledger/use-expenses.ts': { branches: 88.46 },
    './apps/mobile/src/ledger/expense-screen.tsx': { branches: 98.11 },
    './apps/mobile/src/ledger/expenses-screen.tsx': { branches: 100 },
  },
  testTimeout: 15000,
};
