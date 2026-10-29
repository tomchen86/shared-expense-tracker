import { useEffect, useMemo, type ReactNode } from 'react';
import { LogBox } from 'react-native';
import type { Database } from '../storage';
import { openPhoneDatabase } from '../storage/expo';
import { LocalDataGate } from './local-data-gate';

// E2E flows run on a debug build, where LogBox notices can cover the tab bar
// (ADR-0008). Metro inlines EXPO_PUBLIC_ variables when it bundles.
if (process.env.EXPO_PUBLIC_E2E === '1') LogBox.ignoreAllLogs();

/** Owns the phone connection; the gate is also usable with a real test database. */
export function PhoneLocalData({ children }: { children: ReactNode }) {
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
  return (
    <LocalDataGate openDatabase={lifetime.open} development={__DEV__}>
      {children}
    </LocalDataGate>
  );
}
