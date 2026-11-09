import { Settings } from 'react-native';

/**
 * The seed an E2E flow passed at launch (ADR-0018), still URI-encoded. On iOS it is the `seed`
 * launch argument, which iOS keeps in the app's settings for that launch only.
 */
export async function readLaunchSeed(): Promise<string | undefined> {
  const seed: unknown = Settings.get('seed');
  return typeof seed === 'string' ? seed : undefined;
}
