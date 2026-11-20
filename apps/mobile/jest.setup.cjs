/* global jest */
// These native modules can be imported by a screen before a test imports Expo
// Router's testing helpers. Install their supported mocks before either path.
jest.mock('react-native-worklets', () =>
  require('react-native-worklets/src/mock'),
);
require('react-native-reanimated').setUpTests();
// Jest turns an image into an object Expo's asset registry does not know, so a menu's dots
// (ui/menu-field) never load here.
jest.mock('expo-asset', () => ({ useAssets: () => [undefined, undefined] }));

// Load these two missing native APIs with Compose. Loading Expo in setup also loads
// expo-asset before individual tests can provide their own images.
jest.mock('@expo/ui/jetpack-compose', () => {
  const expoUI = require('expo').requireNativeModule('ExpoUI');
  globalThis.expo.modules.ExpoUI = {
    getMaterialColors: () => ({}),
    ObservableState: class extends globalThis.expo.SharedObject {
      constructor({ value }) {
        super();
        this.current = value;
      }
      getValue() {
        return this.current;
      }
      setValue({ value }) {
        this.current = value;
      }
    },
    ...expoUI,
  };
  return jest.requireActual('@expo/ui/jetpack-compose');
});
