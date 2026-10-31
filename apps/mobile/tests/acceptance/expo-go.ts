// Expo Go tells the JavaScript it runs that it is Expo Go through its ExpoGo native
// module, and Expo Router looks for that module once, when it loads. A test file
// that runs the app in Expo Go imports this file before anything else.
globalThis.expo.modules.ExpoGo = {};
