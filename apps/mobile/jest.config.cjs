const shared = {
  rootDir: __dirname,
  resolver: '<rootDir>/jest.resolver.cjs',
  setupFiles: ['react-native-gesture-handler/jestSetup'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.cjs'],
  transformIgnorePatterns:
    require('jest-expo/jest-preset').transformIgnorePatterns.map((pattern) =>
      pattern.replace('react-native|', '@noble/hashes|react-native|'),
    ),
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  // Fake timers keep the real Intl: tests set the phone's time zone by spying on
  // Intl.DateTimeFormat.prototype, which a faked DateTimeFormat bypasses.
  fakeTimers: { doNotFake: ['Intl'] },
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
