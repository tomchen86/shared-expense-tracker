import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
  useState,
} from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { useLocalDatabase, useLocalIdentity } from '../shell';
import type { InviteCredentials } from './invite-card';
import { onInviteLink } from './invite-links';
import {
  cannotUse,
  groupForLink,
  parseInviteLink,
  readJoinInvite,
  wentWrong,
  type InviteNotice,
  type JoinCard,
} from './join-invite';
import {
  cancelJoinRequest,
  requestByCode,
  sendJoinRequest,
  type JoinRequest,
  type SendResult,
} from './join-requests';

type Page =
  | (InviteNotice & { link?: InviteCredentials })
  | { kind: 'loading' | 'sending' }
  | {
      kind: 'form';
      card: JoinCard;
      link: InviteCredentials;
      preparing?: boolean;
    }
  | {
      kind: 'request';
      request: JoinRequest;
      reason?: string;
      link: InviteCredentials;
    };

export const RequestCardsContext = createContext<{
  revision: number;
  openRequest: (request: JoinRequest) => void;
} | null>(null);

export function useRequestCards() {
  return useContext(RequestCardsContext)!;
}

function navigateToGroup(group: { id: string; archived: number }) {
  router.navigate(
    group.archived
      ? `/settings/archived-groups/${group.id}`
      : `/groups/${group.id}`,
  );
}

export function useJoinGroup() {
  const db = useLocalDatabase();
  const { userId } = useLocalIdentity();
  const [page, setPage] = useState<Page | null>(null);
  const [revision, changed] = useReducer((n: number) => n + 1, 0);
  // A fresh object identifies each opening, even when the same link is reopened.
  const active = useRef<InviteCredentials | undefined>(undefined);
  const [sending] = useState(() => new Map<string, Promise<SendResult>>());
  const [cancelling] = useState(
    () => new Map<string, Promise<string | undefined>>(),
  );
  const close = useCallback(() => {
    active.current = undefined;
    setPage(null);
  }, []);

  const read = useCallback(
    async (link: InviteCredentials) => {
      setPage({ kind: 'loading' });
      const next = await readJoinInvite(db, link).catch((): InviteNotice => ({
        kind: 'notice',
        message: wentWrong,
        retry: true,
      }));
      if (active.current !== link) return;
      if (next.kind === 'group') {
        close();
        navigateToGroup(next.group);
      } else setPage({ ...next, link });
    },
    [db, close],
  );

  const showSendResult = useCallback(
    async (
      link: InviteCredentials,
      job: Promise<SendResult>,
      previous?: Page,
    ) => {
      const next = await job;
      if (active.current !== link) return;
      if (next.kind === 'blocked') {
        Alert.alert('Unable to Send Request', next.message);
        if (previous) setPage(previous);
        else await read(link);
      } else if (next.kind === 'refused')
        setPage({ kind: 'notice', message: next.message });
      else setPage({ ...next, link });
    },
    [read],
  );

  const showCancelResult = useCallback(
    async (link: InviteCredentials, job: Promise<string | undefined>) => {
      const error = await job;
      if (active.current !== link) return;
      if (error) Alert.alert('Unable to Cancel Request', error);
      else close();
    },
    [close],
  );

  const open = useCallback(
    async (link: InviteCredentials | undefined, fromCard = false) => {
      if (!link) {
        active.current = undefined;
        setPage({ kind: 'notice', message: cannotUse });
        return;
      }
      if (
        active.current?.code === link.code &&
        active.current.secret === link.secret
      )
        return;
      active.current = link;
      setPage((previous) => previous && { kind: 'loading' });
      // Capture an operation before the local reads in case its answer arrives during them.
      const put = sending.get(link.code);
      const del = cancelling.get(link.code);
      try {
        if (!fromCard) {
          const group = await groupForLink(db, link);
          if (active.current !== link) return;
          if (group) {
            close();
            navigateToGroup(group);
            return;
          }
        }
        const saved = await requestByCode(db, link.code);
        if (active.current !== link) return;
        const stored: Page | undefined = saved && {
          kind: 'request',
          request: saved,
          link,
        };
        if (put) {
          setPage({ kind: 'sending' });
          await showSendResult(link, put, stored);
        } else if (del) {
          if (stored) setPage(stored);
          await showCancelResult(link, del);
        } else if (stored) setPage(stored);
        else if (fromCard) close();
        else await read(link);
      } catch {
        if (active.current === link)
          setPage({ kind: 'notice', message: wentWrong, retry: true, link });
      }
    },
    [db, sending, cancelling, close, read, showSendResult, showCancelResult],
  );

  useEffect(() => {
    const unsubscribe = onInviteLink((url) => void open(parseInviteLink(url)));
    return () => {
      active.current = undefined;
      unsubscribe();
    };
  }, [open]);

  function send(request: JoinRequest) {
    if (
      (page?.kind !== 'form' && page?.kind !== 'request') ||
      active.current !== page.link ||
      sending.has(request.code) ||
      cancelling.has(request.code)
    )
      return;
    const { link } = page;
    const isNew = page.kind === 'form';
    setPage(isNew ? { ...page, preparing: true } : { kind: 'sending' });
    const job = sendJoinRequest(db, request, userId, isNew, changed)
      .then((result) => {
        if (
          result.kind === 'refused' ||
          (result.kind === 'request' && result.request.sent)
        )
          changed();
        return result;
      })
      .finally(() => {
        sending.delete(request.code);
      });
    sending.set(request.code, job);
    void showSendResult(link, job, page);
  }

  function askToCancel(request: JoinRequest) {
    if (
      page?.kind !== 'request' ||
      page.link !== active.current ||
      cancelling.has(request.code)
    )
      return;
    const { link } = page;
    Alert.alert(
      'Cancel Request?',
      "You'll need the invite link to ask again.",
      [
        { text: 'Keep Waiting', style: 'cancel' },
        {
          text: 'Cancel Request',
          style: 'destructive',
          onPress: () => {
            if (
              active.current !== link ||
              sending.has(request.code) ||
              cancelling.has(request.code)
            )
              return;
            const job = cancelJoinRequest(db, request)
              .then((error) => {
                if (!error) changed();
                return error;
              })
              .finally(() => {
                cancelling.delete(request.code);
              });
            cancelling.set(request.code, job);
            void showCancelResult(link, job);
          },
        },
      ],
      { cancelable: true },
    );
  }

  return {
    page,
    close,
    askToCancel,
    cards: {
      revision,
      openRequest: ({ code, secret }: JoinRequest) =>
        void open({ code, secret }, true),
    },
    submit(name: string, memberId: string | null) {
      if (page?.kind === 'form')
        send({
          ...page.link,
          name,
          memberId,
          groupName: page.card.name,
          sent: 0,
        });
    },
    retry() {
      if (page?.kind === 'request') send(page.request);
      else if (
        page?.kind === 'notice' &&
        page.link &&
        active.current === page.link
      ) {
        const link = { ...page.link };
        active.current = undefined;
        void open(link);
      }
    },
  };
}
