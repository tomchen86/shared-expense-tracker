module.exports = {
  displayName: 'mobile',
  rootDir: __dirname,
  preset: 'jest-expo',
  transformIgnorePatterns:
    require('jest-expo/jest-preset').transformIgnorePatterns.map((pattern) =>
      pattern.replace('react-native|', '@noble/hashes|react-native|'),
    ),
  testMatch: ['<rootDir>/{src,tests}/**/*.test.[jt]s?(x)'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.test.*',
  ],
};
