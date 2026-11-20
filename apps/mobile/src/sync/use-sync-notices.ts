import { useCallback, useState } from 'react';
import type { Database } from '../storage';
import { readSyncNotices } from './loop';
import { useSyncedFocusEffect } from './use-synced-focus-effect';

/**
 * The lines the screen of the shared ledger `groupId` shows under its title about its
 * sync (SYNC-75.1, SYNC-83.1), read again when a sync changes them. None, and no read,
 * without a `groupId`.
 */
export function useSyncNotices(
  database: Database,
  groupId: string | undefined,
): string[] {
  const [notices, setNotices] = useState<string[]>([]);
  useSyncedFocusEffect(
    database,
    groupId,
    useCallback(() => {
      let active = true;
      if (groupId !== undefined)
        void readSyncNotices(database, groupId).then(
          (read) => {
            if (active) setNotices(read);
          },
          // The group's own read fails with it, and shows that.
          () => undefined,
        );
      return () => {
        active = false;
      };
    }, [database, groupId]),
  );
  return notices;
}
