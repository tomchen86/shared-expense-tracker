import { useCallback, useRef, useState } from 'react';
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
  const pending = useRef<Promise<GroupDetails | null>>(undefined);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      const read = Promise.all([
        listGroups(database),
        listFormerMembers(database, id),
      ]).then(([groups, formerMembers]) => {
        const found = groups.find((candidate) => candidate.id === id);
        const details = found ? { ...found, formerMembers } : null;
        if (active) setGroup(details);
        return details;
      });
      pending.current = read;
      read.then(
        () => {
          if (pending.current === read) pending.current = undefined;
        },
        (failure: unknown) => {
          if (pending.current === read) pending.current = undefined;
          if (active) setError(failure);
        },
      );
      return () => {
        active = false;
      };
    }, [database, id]),
  );
  if (error) throw error;
  /** The read in progress, if the screen is reading the group again. */
  const pendingRead = useCallback(() => pending.current, []);
  return [group, setGroup, pendingRead] as const;
}
