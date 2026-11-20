// Native intents can arrive before the local-data gate mounts the navigator.
// Until then, only the most recent invite needs to be presented.
let pending: string | undefined;
let present: ((link: string) => void) | undefined;

export function receiveInviteLink(link: string) {
  if (present) present(link);
  else pending = link;
}

export function onInviteLink(open: (link: string) => void) {
  present = open;
  if (pending !== undefined) {
    const link = pending;
    pending = undefined;
    open(link);
  }
  return () => {
    present = undefined;
  };
}
