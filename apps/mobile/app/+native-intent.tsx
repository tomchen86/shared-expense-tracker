// The app's scheme (app.json). Expo Router decodes a deep link's query once more
// than the link encodes it (#65), but takes a path as it is.
const SCHEME = 'shared-expense-tracker://';

/** Hands Expo Router the path and query of the app's own deep links, as sent. */
export function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}) {
  return path.startsWith(SCHEME)
    ? `/${path.slice(SCHEME.length).replace(/^\/+/, '')}`
    : path;
}
