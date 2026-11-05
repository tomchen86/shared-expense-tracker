/* global jest */
// These native modules can be imported by a screen before a test imports Expo
// Router's testing helpers. Install their supported mocks before either path.
jest.mock('react-native-worklets', () =>
  require('react-native-worklets/src/mock'),
);
require('react-native-reanimated').setUpTests();
