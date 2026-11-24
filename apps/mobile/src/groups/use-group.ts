import { useCallback, useEffect, useRef, useState } from 'react';
import { readOnlyCopyOf, type ReadOnlyCopy } from '../sync/read-only-copy';
import { membersWithPhones } from '../sync/roster';
import { useSyncedFocusEffect } from '../sync/use-synced-focus-effect';
import { useLocalDatabase } from '../shell';
import {
  listFormerMembers,
  listGroups,
  type Group,
  type GroupMember,
} from './index';

type GroupDetails = Group & {
  formerMembers: GroupMember[];
  /** Why the group is a read-only copy, and how many of its changes were never sent. */
  copy?: ReadOnlyCopy;
  /** The IDs of the members another phone represents (SYNC-251.2). */
  phones?: readonly string[];
};
type Database = ReturnType<typeof useLocalDatabase>;

/** The group as its screens show it, read now; null when the phone has no such group. */
export async function readGroupDetails(
  database: Database,
  id: string,
): Promise<GroupDetails | null> {
  const [groups, formerMembers, copy, phones] = await Promise.all([
    listGroups(database),
    listFormerMembers(database, id),
    readOnlyCopyOf(database, id),
    membersWithPhones(database, id),
  ]);
  const found = groups.find((candidate) => candidate.id === id);
  return found ? { ...found, formerMembers, copy, phones } : null;
}

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
export function useGroup(
  id: string,
  { startFromLatest = false, watchSync = true } = {},
) {
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
  useSyncedFocusEffect(
    watchSync ? database : undefined,
    id,
    useCallback(() => {
      let active = true;
      const read = readGroupDetails(database, id).then((details) => {
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
