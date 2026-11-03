import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useLocalDatabase } from '../shell';
import { listGroups, type Group } from './index';

/** Read again on focus; undefined keeps empty messages hidden during the first read. */
export function useGroups() {
  const database = useLocalDatabase();
  const [groups, setGroups] = useState<Group[]>();
  const [error, setError] = useState<unknown>();
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void listGroups(database).then(
        (rows) => {
          if (active) setGroups(rows);
        },
        (failure: unknown) => {
          if (active) setError(failure);
        },
      );
      return () => {
        active = false;
      };
    }, [database]),
  );
  if (error) throw error;
  return [groups, setGroups] as const;
}
