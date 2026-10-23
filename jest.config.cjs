module.exports = {
  projects: [
    {
      displayName: 'tooling',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/tooling/**/*.test.cjs'],
    },
    '<rootDir>/apps/mobile/jest.config.cjs',
    '<rootDir>/packages/domain/jest.config.cjs',
  ],
  reporters: [
    'default',
    ['jest-junit', { outputDirectory: '<rootDir>/reports/junit' }],
  ],
  collectCoverage: true,
  coverageDirectory: '<rootDir>/reports/coverage',
  coverageReporters: ['text', 'json-summary', 'lcov'],
  coverageThreshold: {
    './packages/domain/src/ledger/money.ts': { branches: 100 },
  },
};
