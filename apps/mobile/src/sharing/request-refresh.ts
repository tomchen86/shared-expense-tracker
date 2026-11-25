import { useCallback, useRef } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import type { Group } from '../groups';
import type { Database } from '../storage';
import { refreshReceivedRequests } from './received-requests';

const SHORT_DELAY = 3_000;

function startTimer(refresh: () => Promise<void>) {
  const shownAt = performance.now();
  let stopped = false;
  let timer = setTimeout(run, SHORT_DELAY);

  async function run() {
    await refresh().catch(() => undefined);
    if (stopped) return;
    const delay = performance.now() - shownAt < 120_000 ? SHORT_DELAY : 30_000;
    timer = setTimeout(run, delay);
  }

  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}

function whileInForeground(start: () => () => void) {
  let stop = AppState.currentState === 'background' ? undefined : start();
  const subscription = AppState.addEventListener('change', (state) => {
    if (state === 'background') {
      stop?.();
      stop = undefined;
    } else if (state === 'active') stop ??= start();
  });
  return () => {
    subscription.remove();
    stop?.();
  };
}

/** Refreshes a visible waiting screen, counting anew after each background stay (ADR-0046). */
export function refreshWhileShown(refresh: () => Promise<void>) {
  return whileInForeground(() => startTimer(refresh));
}

/**
 * Lists requests while the ledger screen or Members is focused (SHARING-290.2).
 * Members calls the returned function when the user presses Invite with Link.
 */
export function useRefreshReceivedRequests(
  database: Database,
  groupId: string,
  group: Group | null | undefined,
) {
  const restart = useRef<() => void>(undefined);
  // Count from focus even when the first read of the group is still under way.
  const canList = group === undefined || (group?.shared && !group.archived);
  useFocusEffect(
    useCallback(() => {
      if (!canList) return;
      const list = () => refreshReceivedRequests(database, groupId, 'timer');
      return whileInForeground(() => {
        let stop = startTimer(list);
        restart.current = () => {
          stop();
          stop = startTimer(list);
        };
        return () => {
          restart.current = undefined;
          stop();
        };
      });
    }, [database, groupId, canList]),
  );
  return () => restart.current?.();
}
