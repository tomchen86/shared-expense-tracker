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
  },
  testTimeout: 15000,
};
