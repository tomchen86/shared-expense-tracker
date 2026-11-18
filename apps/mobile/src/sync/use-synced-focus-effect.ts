import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import type { Database } from '../storage';
import { subscribeToAppliedEvents } from './apply';

/**
 * Runs a focused screen's read, and runs it again each time events are applied to the
 * shared ledger `groupId`, or to any shared ledger when `groupId` is undefined. Without
 * `database`, it only reads on focus.
 */
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
        subscribeToAppliedEvents(database, (synced) => {
          if (groupId !== undefined && groupId !== synced) return;
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
