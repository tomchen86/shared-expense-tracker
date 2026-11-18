module.exports = {
  displayName: 'domain',
  rootDir: __dirname,
  testEnvironment: 'node',
  testMatch: ['<rootDir>/{src,tests}/**/*.test.[jt]s'],
  // noble is ESM; transform it under both plain and pnpm node_modules layouts.
  transformIgnorePatterns: [
    '/node_modules/(?!\\.pnpm/|@noble/(?:ciphers|curves|hashes)/)',
  ],
  transform: {
    '^.+\\.[jt]s$': [
      require.resolve('babel-jest'),
      {
        presets: [require.resolve('@babel/preset-typescript')],
        plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')],
      },
    ],
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts', '!src/**/*.test.*'],
};
