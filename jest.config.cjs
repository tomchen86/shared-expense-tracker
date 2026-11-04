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
    './apps/mobile/src/ledger/expenses.ts': { branches: 83.78 },
    './apps/mobile/src/ledger/expense-form-screen.tsx': { branches: 93.25 },
    './apps/mobile/src/ledger/use-expenses.ts': { branches: 74.07 },
    './apps/mobile/src/ledger/expense-screen.tsx': { branches: 96.15 },
    './apps/mobile/src/ledger/expenses-screen.tsx': { branches: 100 },
  },
  testTimeout: 15000,
};
