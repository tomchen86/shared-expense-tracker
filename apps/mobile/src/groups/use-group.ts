import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useLocalDatabase } from '../shell';
import {
  listFormerMembers,
  listGroups,
  type Group,
  type GroupMember,
} from './index';

type GroupDetails = Group & { formerMembers: GroupMember[] };

/** Refresh after a sheet closes; undefined means the first read is still pending. */
export function useGroup(id: string) {
  const database = useLocalDatabase();
  const [group, setGroup] = useState<GroupDetails | null>();
  const [error, setError] = useState<unknown>();
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void Promise.all([
        listGroups(database),
        listFormerMembers(database, id),
      ]).then(
        ([groups, formerMembers]) => {
          if (!active) return;
          const found = groups.find((candidate) => candidate.id === id);
          setGroup(found ? { ...found, formerMembers } : null);
        },
        (failure: unknown) => {
          if (active) setError(failure);
        },
      );
      return () => {
        active = false;
      };
    }, [database, id]),
  );
  if (error) throw error;
  return [group, setGroup] as const;
}
