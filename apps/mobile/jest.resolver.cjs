const reanimatedResolver = require('react-native-reanimated/jest/resolver');
const nativeResolver = require(require('jest-expo/jest-preset').resolver);
const path = require('node:path');
const reanimatedRoot = path.dirname(
  require.resolve('react-native-reanimated/package.json'),
);

// Reanimated's Jest implementation must resolve its web internals while React
// Native still needs the preset's package-exports compatibility resolver.
module.exports = (request, options) => {
  const inReanimated = options.basedir.startsWith(
    `${reanimatedRoot}${path.sep}`,
  );
  const inWorklets = options.basedir.includes(
    '/node_modules/react-native-worklets/',
  );
  if (
    !inReanimated &&
    !inWorklets &&
    !request.startsWith('react-native-worklets')
  ) {
    return nativeResolver(request, options);
  }
  // pnpm's Reanimated peer suffix contains "react-native-worklets", which the
  // upstream resolver otherwise mistakes for the Worklets package itself.
  const basedir = inReanimated
    ? path.join(
        __dirname,
        'node_modules/react-native-reanimated',
        path.relative(reanimatedRoot, options.basedir),
      )
    : options.basedir;
  return reanimatedResolver(request, {
    ...options,
    basedir,
    defaultResolver: (name, nextOptions) =>
      nativeResolver(name, {
        ...nextOptions,
        defaultResolver: options.defaultResolver,
      }),
  });
};
