import { receiveInviteLink } from '../src/sharing/invite-links';

// The app's scheme (app.json). Expo Router decodes a deep link's query once more
// than the link encodes it (#65), but takes a path as it is.
const SCHEME = 'shared-expense-tracker://';

function isInviteLink(path: string) {
  if (path.startsWith(`${SCHEME}i/`)) return true;
  try {
    const url = new URL(path);
    return url.protocol === 'https:' && url.pathname.startsWith('/i/');
  } catch {
    // Expo Router also passes paths relative to the app root.
    return false;
  }
}

/** Keeps the original invite for its sheet and routes other links as usual. */
export function redirectSystemPath({
  path,
  initial,
}: {
  path: string;
  initial: boolean;
}) {
  if (isInviteLink(path)) {
    receiveInviteLink(path);
    // Start on Expenses, or keep the screen already underneath the sheet.
    return initial ? '/' : null;
  }
  if (!path.startsWith(SCHEME)) return path;
  const route = path.slice(SCHEME.length).replace(/^\/+/, '');
  // An E2E flow's seed (ADR-0018) is read when the app starts, not routed.
  return route.startsWith('?seed=') ? '/' : `/${route}`;
}
