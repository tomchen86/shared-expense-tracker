import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useLocalDatabase } from '../shell';
import { listGroups, type Group } from './index';

/** Read again on focus; undefined keeps empty messages hidden during the first read. */
export function useGroups({ throwOnError = true } = {}) {
  const database = useLocalDatabase();
  const [groups, setGroups] = useState<Group[]>();
  const [error, setError] = useState<unknown>();
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void listGroups(database).then(
        (rows) => {
          if (!active) return;
          setGroups(rows);
          setError(undefined);
        },
        (failure: unknown) => {
          if (!active) return;
          setGroups(undefined);
          setError(failure);
        },
      );
      return () => {
        active = false;
      };
    }, [database]),
  );
  if (error && throwOnError) throw error;
  return [groups, setGroups] as const;
}
