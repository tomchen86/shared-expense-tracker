import { useCallback, useState } from 'react';
import type { Database } from '../storage';
import { readSyncNotices } from './loop';
import { useSyncedFocusEffect } from './use-synced-focus-effect';

const empty = { lines: [] as string[], unapplied: 0 };

/**
 * The sync messages and unapplied count under the shared ledger's title.
 * Refresh on focus and on changes to this ledger.
 */
export function useSyncNotices(
  database: Database,
  groupId: string | undefined,
) {
  const [last, setLast] = useState<{
    groupId: string;
    notices: typeof empty;
  }>();
  useSyncedFocusEffect(
    database,
    groupId,
    useCallback(() => {
      let active = true;
      if (groupId !== undefined)
        void readSyncNotices(database, groupId).then(
          (notices) => {
            if (active) setLast({ groupId, notices });
          },
          // The group's own read fails with it, and shows that.
          () => undefined,
        );
      return () => {
        active = false;
      };
    }, [database, groupId]),
  );
  return last && last.groupId === groupId ? last.notices : empty;
}
