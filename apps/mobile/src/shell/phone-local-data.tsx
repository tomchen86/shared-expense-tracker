import { useEffect, useMemo, type ReactNode } from 'react';
import type { Database } from '../storage';
import { openPhoneDatabase } from '../storage/expo';
import { LocalDataGate } from './local-data-gate';

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
