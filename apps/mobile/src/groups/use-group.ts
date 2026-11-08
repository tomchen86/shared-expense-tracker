import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useLocalDatabase } from '../shell';
import {
  listFormerMembers,
  listGroups,
  type Group,
  type GroupMember,
} from './index';

type GroupDetails = Group & { formerMembers: GroupMember[] };
type Database = ReturnType<typeof useLocalDatabase>;

// Each database's latest group details that a screen holds, with the changes it made. On
// iOS, a sheet sized to its contents that grows after it opens can keep its screen at the
// first, shorter height and cut off the last rows; a sheet that starts from these has the
// group's rows in its first layout.
const latest = new WeakMap<Database, Map<string, GroupDetails | null>>();

/**
 * Refresh after a sheet closes; undefined means the first read is still pending. With
 * `startFromLatest`, it starts from the details another screen holds, until its own read.
 * A form that starts editing from the group should read it fresh instead.
 */
export function useGroup(id: string, { startFromLatest = false } = {}) {
  const database = useLocalDatabase();
  const [group, setGroup] = useState<GroupDetails | null | undefined>(() =>
    startFromLatest ? latest.get(database)?.get(id) : undefined,
  );
  useEffect(() => {
    if (group !== undefined)
      latest.set(database, (latest.get(database) ?? new Map()).set(id, group));
  }, [database, id, group]);
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
