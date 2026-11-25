import { act } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import { settle } from './shell-appearance-app';

// The app going to the background and coming back as two steps, so that a test can let
// time pass in between (leaveAndComeBack of ledger-list-period-app does both at once).

/** What the app has listening to AppState's change, and has not taken off. */
function appStateListeners() {
  const listen = jest.mocked(AppState.addEventListener);
  return listen.mock.calls.flatMap(([type, listener], index) => {
    const subscription = listen.mock.results[index]?.value as
      { remove: jest.Mock } | undefined;
    return type === 'change' && subscription?.remove.mock.calls.length === 0
      ? [listener as (state: AppStateStatus) => void]
      : [];
  });
}

async function appHears(state: AppStateStatus) {
  await act(async () => {
    for (const hear of appStateListeners()) hear(state);
  });
  await settle();
}

/** The user leaves the app: it hears, as React Native tells it, that it is in the background. */
export const goesToBackground = () => appHears('background');

/** The user comes back to the app: it hears that it is active again. */
export const comesToForeground = () => appHears('active');
