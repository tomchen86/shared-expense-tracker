import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { subscribeToExpenses } from '../ledger/expenses';
import type { Database } from '../storage';

export function subscribeToSyncedGroup(
  database: Database,
  groupId: string | undefined,
  refresh: () => void,
) {
  return subscribeToExpenses(database, (_, syncedGroupId) => {
    if (
      syncedGroupId !== undefined &&
      (groupId === undefined || groupId === syncedGroupId)
    )
      refresh();
  });
}

/** Rerun a focused screen's read after a sync commit for the ledger it shows. */
export function useSyncedFocusEffect(
  database: Database | undefined,
  groupId: string | undefined,
  read: () => () => void,
) {
  useFocusEffect(
    useCallback(() => {
      let cancelRead = read();
      const unsubscribe =
        database &&
        subscribeToSyncedGroup(database, groupId, () => {
          cancelRead();
          cancelRead = read();
        });
      return () => {
        unsubscribe?.();
        cancelRead();
      };
    }, [database, groupId, read]),
  );
}
