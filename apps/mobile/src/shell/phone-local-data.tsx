import { useEffect, useMemo, type ReactNode } from 'react';
import { LogBox } from 'react-native';
import { router, useNavigationContainerRef } from 'expo-router';
import type { Database } from '../storage';
import { openPhoneDatabase } from '../storage/expo';
import { removeTemporaryFiles } from '../storage/expo-files';
import { seedFromLaunch } from './e2e-seed';
import { LocalDataGate } from './local-data-gate';

// Builds for the E2E flows are bundled with EXPO_PUBLIC_E2E=1: they keep LogBox notices off the
// tab bar of a debug build (ADR-0008) and write the data a flow passes at launch (ADR-0018).
// Metro inlines EXPO_PUBLIC_ variables when it bundles, so a store build does neither.
const e2e = process.env.EXPO_PUBLIC_E2E === '1';
if (e2e) LogBox.ignoreAllLogs();

interface NavigatorState {
  key: string;
  type: string;
  index: number;
  routes: { state?: unknown }[];
}

/**
 * Shows what the app shows after loading (SHELL-6.1): every stack back on its first
 * screen, which leaves each tab on its root and nothing over the tabs, and the
 * Expenses tab, where `/` is.
 */
function showStart(navigation: {
  getRootState: () => unknown;
  dispatch: (action: { type: string; target: string }) => void;
}) {
  const popToTop = (state: NavigatorState) => {
    for (const route of state.routes)
      if (route.state) popToTop(route.state as NavigatorState);
    if (state.type === 'stack' && state.index > 0)
      navigation.dispatch({ type: 'POP_TO_TOP', target: state.key });
  };
  popToTop(navigation.getRootState() as NavigatorState);
  router.navigate('/');
}

/** Owns the phone connection; the gate is also usable with a real test database. */
export function PhoneLocalData({ children }: { children: ReactNode }) {
  const navigation = useNavigationContainerRef();
  const lifetime = useMemo(() => {
    let active = true;
    let opening: Promise<Database> | undefined;
    return {
      activate: () => {
        active = true;
      },
      open: () => (opening ??= openPhoneDatabase()),
      close: () => {
        active = false;
        // React Strict Mode immediately replays effects. Keep its one connection;
        // a real unmount closes even a connection that is still opening.
        void Promise.resolve()
          .then(() => {
            if (!active) return opening?.then((database) => database.close());
          })
          .catch(() => undefined);
      },
    };
  }, []);
  useEffect(() => {
    lifetime.activate();
    return lifetime.close;
  }, [lifetime]);
  // What an earlier export or import left behind goes when the app starts (BACKUP-25.1).
  useEffect(() => {
    void Promise.resolve()
      .then(removeTemporaryFiles)
      .catch(() => undefined);
  }, []);
  return (
    <LocalDataGate
      openDatabase={lifetime.open}
      development={__DEV__}
      onReplaced={() => showStart(navigation)}
      seed={e2e ? seedFromLaunch : undefined}
    >
      {children}
    </LocalDataGate>
  );
}
