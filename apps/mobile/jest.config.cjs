module.exports = {
  displayName: 'mobile',
  rootDir: __dirname,
  preset: 'jest-expo',
  testMatch: ['<rootDir>/{src,tests}/**/*.test.[jt]s?(x)'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.test.*',
  ],
};
