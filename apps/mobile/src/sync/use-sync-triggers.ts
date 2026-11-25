import { useEffect } from 'react';
import { AppState } from 'react-native';
import { apiUrl } from '../sharing/api-address';
import type { Database } from '../storage';
import { syncGroup } from './loop';
import { UNSENT_EVENTS, subscribeToUnsentEvents } from './records';

/**
 * Starts syncs of ledgers the phone holds (ADR-0027): each shared ledger once when the
 * app opens, which is when it starts and when it comes back from the background
 * (SYNC-89.2), and a ledger once this phone has saved an unsent event of it (SYNC-88.1).
 * Opening the app and saving do not wait for a sync. A build that names no API starts
 * none, and reads nothing for one (SYNC-93.1).
 */
export function useSyncTriggers(database: Database | undefined) {
  useEffect(() => {
    if (!database) return undefined;
    const sync = (groupId: string, url: string) =>
      void syncGroup(database, { apiUrl: url, groupId }).catch(() => undefined);
    const syncAll = () => {
      const url = apiUrl();
      if (!url) return;
      void database
        .all<{ groupId: string }>('SELECT groupId FROM sync_groups')
        .then(
          (ledgers) => ledgers.forEach(({ groupId }) => sync(groupId, url)),
          () => undefined,
        );
    };

    syncAll();
    let away = false;
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'background') away = true;
      else if (state === 'active' && away) {
        away = false;
        syncAll();
      }
    });

    const asked = new Set<string>();
    const unsubscribe = subscribeToUnsentEvents((groupId, position) => {
      const url = apiUrl();
      if (!url || asked.has(groupId)) return;
      asked.add(groupId);
      // Read once the transaction that wrote the event has ended: the event is there
      // only if the change was saved.
      void database
        .all(
          `SELECT 1 FROM ${UNSENT_EVENTS} WHERE groupId = ? AND position >= ? LIMIT 1`,
          [groupId, position],
        )
        .then(
          (saved) => {
            asked.delete(groupId);
            if (saved.length > 0) sync(groupId, url);
          },
          () => asked.delete(groupId),
        );
    });
    return () => {
      appState.remove();
      unsubscribe();
    };
  }, [database]);
}
