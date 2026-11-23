import * as path from 'node:path';
// Before expo-router itself, so the expo-linking mock it installs takes effect.
import { renderRouter } from 'expo-router/testing-library';
import { Linking } from 'react-native';
import { act, screen, waitFor } from '@testing-library/react-native';
import { navigationBars, titleOfBar } from './shell-tabs-app';
import { settle } from './shell-appearance-app';

// The invite link tests hand the app a link the two ways the system does. While the
// app runs, a link arrives at every listener the app registered for the url event,
// through expo-linking, as Expo Router does, or through React Native's Linking.
// When a link starts the app, the app asks the system which link that was:
// expo-linking's getLinkingURL on iOS, React Native's getInitialURL on Android.
// The tests answer both, and read the Join Group sheet the app opens. They build the app
// with no address for the API and start on a phone with no shared ledger and no request,
// so a link that is written rightly gets as far as needing the network, and Join Group
// says to connect (SHARING-133.1); one that is not is refused at once (SHARING-123.1).

const APP = path.join(__dirname, '../../app');

export const TITLE = 'Join Group';
/** What Join Group shows for a link written rightly, here where the build names no API. */
export const CONNECT = [
  'Connect to the internet to join this group.',
  'Try Again',
];
/** What it shows for a link that is not. */
export const CANNOT_USE = [
  "This invite link can't be used. Ask the person who sent it to send it again.",
];
/** The specs' whole link, and the same invite on the app's own scheme. */
export const WHOLE_LINK =
  'https://links.example.test/i/3q2-7wEjRWeJq83vEjRWeA#AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8';
export const APP_SCHEME_LINK =
  'shared-expense-tracker://i/3q2-7wEjRWeJq83vEjRWeA#AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8';
/** The whole link without its `#` and what follows: half a link, which cannot be used. */
export const HALF_LINK = 'https://links.example.test/i/3q2-7wEjRWeJq83vEjRWeA';
export const APP_SCHEME_HALF_LINK =
  'shared-expense-tracker://i/3q2-7wEjRWeJq83vEjRWeA';
/** Other ways an invite link can be written, each of which opens Join Group. */
export const OTHER_SPELLINGS = [
  'https://other.example.org/i/3q2-7wEjRWeJq83vEjRWeA?openExternalBrowser=1#AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8',
  'https://links.example.test/i/abc#def',
  'https://links.example.test/i/#def',
  'https://links.example.test/i/a/b#c',
  'shared-expense-tracker://i/abc?x=1#def',
];
/**
 * Links on the app's scheme that are not invite links: after `://` comes one more
 * slash, so none starts with `shared-expense-tracker://i/`, whatever its path says.
 */
export const NOT_INVITE_LINKS = [
  'shared-expense-tracker:///i/3q2-7wEjRWeJq83vEjRWeA#AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8',
  'shared-expense-tracker:///i/invite',
  'shared-expense-tracker:///i/invite?link=hello',
];

type LinkListener = (event: { url: string }) => void;

let launchLink: string | null = null;
const listeners = new Set<LinkListener>();

/** Takes a listener for links as the system does, whichever library the app asks through. */
function listen(type: string, listener: LinkListener) {
  if (type === 'url') listeners.add(listener);
  return { remove: () => void listeners.delete(listener) };
}

// Expo Router keeps the expo-linking functions it finds when the app first starts in
// a test file, so these two go in once, before that, and answer from what each test
// has set.
Object.assign(jest.requireMock<typeof import('expo-linking')>('expo-linking'), {
  getLinkingURL: () => launchLink,
  addEventListener: listen,
});

/**
 * Before each test: no link has started the app, none has arrived, and React
 * Native's own Linking answers as expo-linking does.
 */
export function forgetLinks() {
  launchLink = null;
  listeners.clear();
  jest
    .spyOn(Linking, 'getInitialURL')
    .mockImplementation(async () => launchLink);
  jest
    .spyOn(Linking, 'addEventListener')
    .mockImplementation(
      (type, listener) =>
        listen(type, listener) as ReturnType<typeof Linking.addEventListener>,
    );
}

/**
 * Hands the running app `url`, as the system does with a link opened in another
 * app: every listener the app has registered gets it.
 */
export async function receiveLink(url: string) {
  if (listeners.size === 0) throw new Error('The app listens for no links');
  await act(async () => {
    for (const listener of [...listeners]) listener({ url });
  });
  await settle();
}

/**
 * Starts the app as the system does when `url` launches it, without waiting for its
 * local data. The test gives Expo Router no address of its own, so the app asks the
 * system which link started it.
 */
export function launchAppFromLink(url: string) {
  launchLink = url;
  return renderRouter(APP, { initialUrl: null as unknown as string });
}

/** Starts the app as `launchAppFromLink` does and waits until its local data has opened. */
export async function startAppFromLink(url: string) {
  const app = await launchAppFromLink(url);
  await waitFor(() =>
    expect(screen.queryByLabelText('Restoring local data')).toBeNull(),
  );
  await settle();
  return app;
}

/** How many Join Group sheets are open. */
export const inviteLinksOpen = () =>
  navigationBars().filter((bar) => titleOfBar(bar) === TITLE).length;
