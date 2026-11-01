const shared = {
  rootDir: __dirname,
  transformIgnorePatterns:
    require('jest-expo/jest-preset').transformIgnorePatterns.map((pattern) =>
      pattern.replace('react-native|', '@noble/hashes|react-native|'),
    ),
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  coveragePathIgnorePatterns: ['/node_modules/', '/tests/'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.test.*',
  ],
};

// Every test runs on iOS except those named *-android.test.*, which run on Android
// only. Tests under ui/ run on both, since only ui/ differs by platform (ADR-0002).
// The root jest.config.cjs runs these projects; Jest does not nest projects.
module.exports = {
  projects: [
    {
      ...shared,
      displayName: 'mobile-ios',
      preset: 'jest-expo/ios',
      testMatch: [
        '<rootDir>/{src,tests}/**/*.test.[jt]s?(x)',
        '!**/*-android.test.[jt]s?(x)',
      ],
    },
    {
      ...shared,
      displayName: 'mobile-android',
      preset: 'jest-expo/android',
      testMatch: [
        '<rootDir>/{src,tests}/ui/**/*.test.[jt]s?(x)',
        '<rootDir>/tests/**/*-android.test.[jt]s?(x)',
      ],
    },
  ],
};
