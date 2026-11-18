import * as path from 'node:path';
// Before expo-router itself, so the expo-linking mock it installs takes effect.
import { renderRouter } from 'expo-router/testing-library';
import { Linking } from 'react-native';
import { act, screen, waitFor, within } from '@testing-library/react-native';
import { navigationBars, titleOfBar } from './shell-tabs-app';
import { settle } from './shell-appearance-app';
import { screenOf } from './group-details-app';

// The invite link tests hand the app a link the two ways the system does. While the
// app runs, a link arrives through expo-linking's url event, as in the categories
// deep link tests. When a link starts the app, the app asks the system which link
// that was: expo-linking's getLinkingURL on iOS, React Native's getInitialURL on
// Android. The tests answer both, and read the Invite Link sheet the app opens.

const APP = path.join(__dirname, '../../app');

export const TITLE = 'Invite Link';
/** The specs' whole link, and the same invite on the app's own scheme. */
export const WHOLE_LINK =
  'https://links.example.test/i/3q2-7wEjRWeJq83vEjRWeA#AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8';
export const APP_SCHEME_LINK =
  'shared-expense-tracker://i/3q2-7wEjRWeJq83vEjRWeA#AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8';
export const SECOND_LINK =
  'https://links.example.test/i/ASNFZ4mrze_-3LqYdlQyEA#ICEiIyQlJicoKSorLC0uLzAxMjM0NTY3ODk6Ozw9Pj8';
/** Other ways an invite link can be written, each of which the app shows as it is. */
export const OTHER_SPELLINGS = [
  'https://links.example.test/i/3q2-7wEjRWeJq83vEjRWeA?openExternalBrowser=1#AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8',
  'https://links.example.test/i/3q2-7wEjRWeJq83vEjRWeA',
  'https://links.example.test/i/3q2-7wEjRWeJq83vEjRWeA#',
  'https://links.example.test/i/a%2Fb%20c?x=%26&y=1+2#k%2D1+2=3&4?5',
  'https://other.example.org/i/abc#def',
  'https://links.example.test/i/#def',
  'https://links.example.test/i/a/b#c',
  'shared-expense-tracker://i/abc?x=1#def',
];
export const LONG_LINK = `https://links.example.test/i/3q2-7wEjRWeJq83vEjRWeA#${'a'.repeat(2000)}`;

let launchLink: string | null = null;
let deliver: ((event: { url: string }) => void) | undefined;

// Expo Router keeps the expo-linking functions it finds when the app first starts in
// a test file, so these two go in once, before that, and answer from what each test
// has set.
Object.assign(jest.requireMock<typeof import('expo-linking')>('expo-linking'), {
  getLinkingURL: () => launchLink,
  addEventListener: (
    type: string,
    listener: (event: { url: string }) => void,
  ) => {
    if (type === 'url') deliver = listener;
    return { remove: () => undefined };
  },
});

/** Before each test: no link has started the app, and none has arrived. */
export function forgetLinks() {
  launchLink = null;
  deliver = undefined;
  jest
    .spyOn(Linking, 'getInitialURL')
    .mockImplementation(async () => launchLink);
}

/** Hands the running app `url`, as the system does with a link opened in another app. */
export async function receiveLink(url: string) {
  if (deliver === undefined) throw new Error('The app listens for no links');
  const listener = deliver;
  await act(async () => listener({ url }));
  await settle();
}

/**
 * Starts the app as the system does when `url` launches it, and waits until its
 * local data has opened. The test gives Expo Router no address of its own, so the
 * app asks the system which link started it.
 */
export async function startAppFromLink(url: string) {
  launchLink = url;
  const app = await renderRouter(APP, {
    initialUrl: null as unknown as string,
  });
  await waitFor(() =>
    expect(screen.queryByLabelText('Restoring local data')).toBeNull(),
  );
  await settle();
  return app;
}

/** How many Invite Link sheets are open. */
export const inviteLinksOpen = () =>
  navigationBars().filter((bar) => titleOfBar(bar) === TITLE).length;

/** The text view that shows `link` on Invite Link. */
export const shownLink = (link: string) =>
  within(screenOf(TITLE)).getByText(link, {
    exact: true,
    normalizer: (text) => text,
  });

/** Whether a text view shows all of its text, however many lines that takes. */
export const showsEveryLine = (view: ReturnType<typeof shownLink>) =>
  (view.props.numberOfLines ?? 0) === 0;
