import Constants, { AppOwnership, ExecutionEnvironment } from 'expo-constants';

// Expo Go tells the JavaScript it runs that it is Expo Go through its ExpoGo native
// module and through Constants. Expo Router looks for the module once, when it
// loads, so a test file that runs the app in Expo Go imports this file before
// anything else.
globalThis.expo.modules.ExpoGo = {};
Constants.executionEnvironment = ExecutionEnvironment.StoreClient;
Constants.appOwnership = AppOwnership.Expo;
