import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
  useState,
} from 'react';
import { Alert, AppState } from 'react-native';
import { router } from 'expo-router';
import { useLocalDatabase, useLocalIdentity } from '../shell';
import type { InviteCredentials } from './invite-card';
import { onInviteLink } from './invite-links';
import { askJoinResult, type JoinResult } from './join-decisions';
import {
  cannotUse,
  groupForLink,
  offline,
  parseInviteLink,
  readJoinInvite,
  wentWrong,
  type CardUnread,
  type InviteNotice,
  type JoinCard,
  type JoinCopy,
} from './join-invite';
import { refreshWhileShown } from './request-refresh';
import {
  alreadyIn,
  cancelJoinRequest,
  connectAgain,
  endedRequestAt,
  forgetEndedRequest,
  listJoinRequests,
  renewBeforeCopyConfirmation,
  requestByCode,
  sendJoinRequest,
  type CancelResult,
  type EndedJoinRequest,
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
      /** The copy of the group this phone holds, which an approval replaces (SHARING-226.2). */
      copy?: JoinCopy;
      preparing?: boolean;
      /** The request whose choice no longer fits the card, when the form is to choose again. */
      again?: JoinRequest;
    }
  | {
      kind: 'request';
      request: JoinRequest;
      reason?: string;
      link: InviteCredentials;
      /** The request as the local data holds it, when `request` is a new choice for it. */
      stored?: JoinRequest;
    }
  | {
      kind: 'approved';
      request: JoinRequest;
      link: InviteCredentials;
      /** Why joining did not finish; nothing while the phone is joining. */
      reason?: 'no-answer' | 'update-needed' | 'failed';
    }
  | { kind: 'ended'; request: EndedJoinRequest; link: InviteCredentials };

export const RequestCardsContext = createContext<{
  revision: number;
  openRequest: (request: JoinRequest | EndedJoinRequest) => void;
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
  const [cancelling] = useState(() => new Map<string, Promise<CancelResult>>());
  const [asking] = useState(() => new Map<string, Promise<JoinResult>>());
  // The card each request's last question read, for the form that chooses again, or why
  // it read none. In memory only (SHARING-212.2).
  const [cards] = useState(() => new Map<string, JoinCard | CardUnread>());
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

  /**
   * What Join Group shows for a request the local data holds (SHARING-225.1). `asked`
   * is the answer to the question about it, once there is one.
   */
  const pageFor = useCallback(
    (
      request: JoinRequest,
      link: InviteCredentials,
      asked?: JoinResult,
      afterSend = false,
    ): Page => {
      if (request.outcome === 'approved') {
        const reason =
          asked?.outcome === 'approved'
            ? asked.reason
            : asked?.outcome === 'no-answer' || asked?.outcome === 'failed'
              ? asked.outcome
              : undefined;
        return { kind: 'approved', request, link, reason };
      }
      if (request.outcome === 'choose-again') {
        const card = cards.get(request.code);
        if (typeof card === 'object')
          return { kind: 'form', card, link, again: request };
        // The form shows the card as it is now, which only the question reads.
        if (!asked) return { kind: 'loading' };
        const noAnswer =
          asked.outcome === 'no-answer' ||
          (asked.outcome !== 'failed' && card === 'no-answer');
        return {
          kind: 'notice',
          message: noAnswer ? offline : wentWrong,
          retry: true,
          link,
        };
      }
      // A question that follows a refusal as a member, and finds nothing out (SHARING-140.2).
      const reason = !afterSend
        ? undefined
        : asked?.outcome === 'no-answer'
          ? connectAgain
          : wentWrong;
      return { kind: 'request', request, link, reason };
    },
    [cards],
  );

  /**
   * Asks once what became of the request under `code` (SHARING-210.1), unless it is on
   * its way or being cancelled; a question that is on its way already is the one waited
   * for. Then shows the answer, when Join Group shows that request.
   */
  const askAbout = useCallback(
    async (code: string, afterSend = false) => {
      if (sending.has(code) || cancelling.has(code)) return;
      let job = asking.get(code);
      if (!job) {
        // Before the question: a request that ends keeps its place, and loses its code.
        const before = requestByCode(db, code).catch(() => undefined);
        job = askJoinResult(db, code, {
          // A card that was read stays, whatever a later question reads.
          onCard: (card) => {
            if (typeof card === 'object' || typeof cards.get(code) !== 'object')
              cards.set(code, card);
          },
          onApproved: () => {
            changed();
            void before.then((request) => {
              const link = active.current;
              if (request && link?.code === code)
                setPage({
                  kind: 'approved',
                  request: { ...request, outcome: 'approved' },
                  link,
                });
            });
          },
        })
          .catch((): JoinResult => ({ outcome: 'failed' }))
          .finally(() => {
            asking.delete(code);
            changed();
          });
        asking.set(code, job);
        void job.then(async (asked) => {
          const link = active.current;
          if (link?.code !== code || sending.has(code) || cancelling.has(code))
            return;
          if (asked.outcome === 'joined') {
            close();
            navigateToGroup({ id: asked.groupId, archived: 0 });
          } else if (asked.outcome === 'already-a-member')
            setPage({ kind: 'notice', message: alreadyIn });
          else {
            const position = (await before)?.position;
            const [saved, ended] = await Promise.all([
              requestByCode(db, code),
              position === undefined ? undefined : endedRequestAt(db, position),
            ]).catch(() => []);
            if (active.current !== link) return;
            if (ended) setPage({ kind: 'ended', request: ended, link });
            else if (saved) setPage(pageFor(saved, link, asked, afterSend));
          }
        });
      }
      await job;
    },
    [db, sending, cancelling, asking, cards, close, pageFor],
  );

  const waiting =
    page?.kind === 'request' &&
    page.request.sent &&
    !page.reason &&
    !page.request.outcome
      ? page.link
      : undefined;
  useEffect(() => {
    if (!waiting) return;
    return refreshWhileShown(async () => {
      // An existing question belongs to its own trigger. This timer skips that turn.
      if (active.current === waiting && !asking.has(waiting.code))
        await askAbout(waiting.code);
    });
  }, [waiting, asking, askAbout]);

  const showSendResult = useCallback(
    async (
      link: InviteCredentials,
      job: Promise<SendResult>,
      previous?: Page,
      stored?: JoinRequest,
    ) => {
      const next = await job;
      if (active.current !== link) return;
      if (next.kind === 'blocked') {
        Alert.alert('Unable to Send Request', next.message);
        if (previous) setPage(previous);
        else await read(link);
      } else if (next.kind === 'refused')
        setPage({ kind: 'notice', message: next.message });
      // The question that follows shows what it finds.
      else if (next.kind === 'request')
        setPage({
          ...next,
          link,
          stored: next.request.sent ? undefined : stored,
        });
    },
    [read],
  );

  const showCancelResult = useCallback(
    async (link: InviteCredentials, job: Promise<CancelResult>) => {
      const result = await job;
      if (active.current !== link) return;
      if (result.kind === 'failed')
        Alert.alert('Unable to Cancel Request', result.message);
      else if (result.kind === 'cancelled') close();
    },
    [close],
  );

  const open = useCallback(
    // `shown` is the request as its card shows it, when the opening comes from the card.
    async (link: InviteCredentials | undefined, shown?: JoinRequest) => {
      const fromCard = shown !== undefined;
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
      // Capture an operation before the local reads in case its answer arrives during them.
      const put = sending.get(link.code);
      const del = cancelling.get(link.code);
      // A card opens on its request at once, as the card shows it; what the local data
      // holds replaces it below.
      setPage((previous) =>
        shown && !put && !del
          ? pageFor(shown, link)
          : previous && { kind: 'loading' },
      );
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
        } else if (saved) {
          setPage(pageFor(saved, link));
          void askAbout(link.code);
        } else if (fromCard) close();
        else await read(link);
      } catch {
        if (active.current === link)
          setPage({ kind: 'notice', message: wentWrong, retry: true, link });
      }
    },
    [
      db,
      sending,
      cancelling,
      close,
      read,
      pageFor,
      askAbout,
      showSendResult,
      showCancelResult,
    ],
  );

  useEffect(() => {
    const unsubscribe = onInviteLink((url) => void open(parseInviteLink(url)));
    return () => {
      active.current = undefined;
      unsubscribe();
    };
  }, [open]);

  // When the app opens, which is when it starts and when it comes back from the
  // background, it asks about every request it holds that has not ended (SHARING-210.1).
  useEffect(() => {
    const askAll = () =>
      void listJoinRequests(db).then(
        (requests) =>
          requests.forEach((request) => {
            if (request.code !== null) void askAbout(request.code);
          }),
        () => undefined,
      );
    askAll();
    let away = false;
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'background') away = true;
      else if (state === 'active' && away) {
        away = false;
        askAll();
      }
    });
    return () => appState.remove();
  }, [db, askAbout]);

  function send(
    from: Extract<Page, { kind: 'form' | 'request' }>,
    request: JoinRequest,
  ) {
    if (
      active.current !== from.link ||
      sending.has(request.code) ||
      cancelling.has(request.code)
    )
      return;
    const { link } = from;
    const stored = from.kind === 'form' ? from.again : from.stored;
    const isNew = from.kind === 'form' && !stored;
    setPage(
      from.kind === 'form' ? { ...from, preparing: true } : { kind: 'sending' },
    );
    const job = sendJoinRequest(
      db,
      request,
      userId,
      isNew,
      changed,
      stored,
    ).finally(() => {
      sending.delete(request.code);
      // Renewal can remove other request cards even when this draft could not be sent.
      changed();
    });
    sending.set(request.code, job);
    // The API will not take it from a member device: it may have been approved meanwhile.
    void job.then((result) => {
      if (result.kind === 'member') void askAbout(request.code, true);
    });
    void showSendResult(link, job, from, stored);
  }

  function askToCancel(link: InviteCredentials, request: JoinRequest) {
    if (active.current !== link || cancelling.has(request.code)) return;
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
              .then((result) => {
                if (result.kind === 'cancelled') changed();
                return result;
              })
              .finally(() => {
                cancelling.delete(request.code);
              });
            cancelling.set(request.code, job);
            // A member approved it first: the phone asks, and joins (SHARING-143.2).
            void job.then((result) => {
              if (result.kind === 'member') void askAbout(request.code);
            });
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
      openRequest: (request: JoinRequest | EndedJoinRequest) => {
        if (request.code !== null) {
          void open({ code: request.code, secret: request.secret }, request);
          return;
        }
        // What is left of it has no link: its own object stands for this opening.
        const link = { code: '', secret: '' };
        active.current = link;
        setPage({ kind: 'ended', request, link });
      },
    },
    submit(
      form: Extract<Page, { kind: 'form' }>,
      name: string,
      memberId: string | null,
      takeover: boolean,
    ) {
      if (form.again) {
        send(form, {
          ...form.again,
          name,
          memberId,
          takeover,
          sent: 0,
          outcome: null,
        });
        return;
      }
      const { copy, card, link } = form;
      const request: JoinRequest = {
        ...link,
        name,
        memberId,
        takeover,
        groupName: card.name,
        sent: 0,
        // The one group an approval of this request may replace.
        copyGroupId: copy?.groupId ?? null,
      };
      // Asked once, where something of the copy can be lost: always for the phone's own
      // copy, and for a read-only copy that has changes it never sent (SHARING-226.2).
      const ask = copy && (copy.own || copy.unsent > 0);
      if (!ask) {
        send(form, request);
        return;
      }
      function alertIfOpen(...args: Parameters<typeof Alert.alert>) {
        if (active.current === link) Alert.alert(...args);
      }
      void renewBeforeCopyConfirmation(db).then(
        (renewed) => {
          if (renewed) changed();
          const lost =
            copy.unsent === 1
              ? '1 change made on this phone was never sent to the group and will be lost.'
              : `${copy.unsent} changes made on this phone were never sent to the group and will be lost.`;
          alertIfOpen(
            copy.own ? 'Replace Your Copy?' : 'Replace This Copy?',
            copy.own
              ? `This phone has its own copy of ${card.name}. If your request is approved, the group's version replaces it, and anything changed only in your copy will be lost. To keep it, export your data first.`
              : `If your request is approved, the group's version replaces the read-only copy on this phone. ${lost}`,
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Send Request', onPress: () => send(form, request) },
            ],
            { cancelable: true },
          );
        },
        () => alertIfOpen('Unable to Send Request', wentWrong),
      );
    },
    retry() {
      if (page?.kind === 'request') send(page, page.request);
      else if (page?.kind === 'approved' && active.current === page.link) {
        // Asks and joins again (SHARING-221.1).
        setPage({ ...page, reason: undefined });
        void askAbout(page.request.code);
      } else if (
        page?.kind === 'notice' &&
        page.link &&
        active.current === page.link
      ) {
        const link = { ...page.link };
        active.current = undefined;
        void open(link);
      }
    },
    /** Forgets a request that has ended, once the person has seen what became of it. */
    forget() {
      if (page?.kind !== 'ended' || active.current !== page.link) return;
      void forgetEndedRequest(db, page.request.position).then(
        () => {
          changed();
          close();
        },
        () => undefined,
      );
    },
  };
}
