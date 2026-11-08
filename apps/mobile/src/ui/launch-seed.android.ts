import { Linking } from 'react-native';

// An Android app reads no launch argument without native code, so the flow opens the app with
// the link shared-expense-tracker://?seed=<seed> instead.
export async function readLaunchSeed(): Promise<string | undefined> {
  const url = await Linking.getInitialURL();
  return url?.match(/^shared-expense-tracker:\/\/\/?\?seed=([^&]*)/)?.[1];
}
