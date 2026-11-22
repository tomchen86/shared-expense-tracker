import { Buffer } from 'node:buffer';
import { randomBytes } from 'node:crypto';
import { AccessibilityInfo } from 'react-native';
import { fireEvent, screen, within } from '@testing-library/react-native';
import { decrypt, deriveKey, encrypt } from '@shared-expense/domain/crypto';
import { saveName } from './groups-app';
import { isOpen, screenOf } from './group-details-app';
import { startExpenses } from './ledger-expense-app';
import { linesIn } from './ledger-expense-list-app';
import { isDisabled, isSelected } from './ledger-group-expense-app';
import {
  API,
  T,
  fromHex,
  requestsReceived,
  utf8,
  type Received,
} from './sharing-app';
import {
  cardKeyOf,
  eachTestGetsAnInvitingPhone,
  inviteWithCard,
  until,
} from './sharing-invite-app';
import { forgetLinks, receiveLink } from './sharing-invite-link-app';
import { settle } from './shell-appearance-app';
import { tapTab } from './shell-tabs-app';
import { everything, setClock } from './sync-app';

// The join tests start the whole app on the phone of someone who was sent an invite link,
// hand it the link as the system does (sharing-invite-link-app), and use Join Group as a
// person would. Around the app they stand in for the phone and the API as the invite
// tests do (sharing-invite-app): the API behind `fetch` serves an invite's card to anyone
// and takes join requests as docs/specs/sharing/spec.md says the real one does
// (SHARING-83.2, SHARING-112.1 to 122.1). Another phone's group, invite and card are put
// on that API by the tests, sealed here with the secret of the link.

export const TITLE = 'Join Group';

export const CANNOT_USE =
  "This invite link can't be used. Ask the person who sent it to send it again.";
export const UPDATE_APP = 'Update the app to use this invite link.';
export const OFFLINE = 'Connect to the internet to join this group.';
export const WENT_WRONG = 'Something went wrong. Try again later.';
export const LOADING = 'Loading invite…';
export const SENDING = 'Sending request…';
export const JOIN_AS = 'Join as';
export const NEW_MEMBER = 'New Member';
export const ALREADY_JOINED = 'Already joined';
export const APPROVAL = 'A member of this group has to approve your request.';
export const SEND = 'Send Request';
export const SAME_NAME = 'A member with this name already exists.';
export const ONLY_MEMBERS =
  'A shared group can have up to 20 members. You can join as one of the members above.';
export const FULL =
  'This group is full. A shared group can have up to 20 members.';
export const WAITING = 'Waiting for Approval';
export const WAITING_TEXT =
  'A member of this group has to approve your request. You can keep using the app while you wait.';
export const CANCEL = 'Cancel Request';
export const NOT_SENT = "Your request hasn't been sent.";
export const NOT_SENT_OFFLINE = 'Connect to the internet and try again.';
export const TOO_MANY =
  'Too many people are waiting to join this group. Try again later.';
export const ALREADY_IN = 'This phone is already in this group.';
export const CANNOT_JOIN = "This phone can't join a group.";
export const UNABLE_TO_SEND = 'Unable to Send Request';
export const UNABLE_TO_CANCEL = 'Unable to Cancel Request';
export const CANCEL_ALERT = [
  'Cancel Request?',
  "You'll need the invite link to ask again.",
];

// The invites of the scenarios

export const CODE_A = '3q2-7wEjRWeJq83vEjRWeA';
export const CODE_B = 'AAECAwQFBgcICQoLDA0ODw';
/** The 32 bytes `000102…1e1f`, and another 32. */
export const S = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8';
export const S2 = 'ICEiIyQlJicoKSorLC0uLzAxMjM0NTY3ODk6Ozw9Pj8';

export const TAYLOR_ID = '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed';
export const CASEY_ID = '6ec0bd7f-11c0-43da-975e-2a8ad9ebae0b';
export const BLAKE_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

/** The groups' IDs on the phone that made them, and so on the API. */
export const BRISBANE_ID = '9b2f6c1e-8d47-4f3a-b1c5-2e7d90a4f6b8';
const TOKYO_ID = 'c4a1e2d3-5b6f-4a7c-9d8e-0f1a2b3c4d5e';
/** The phone that made the groups: their one member device on the API. */
export const TAYLORS_PHONE = '0f8fad5b-d9cb-469f-a165-70867728950e';

export const linkOf = (code: string, secret: string, start = `${API}/i/`) =>
  `${start}${code}#${secret}`;
export const BRISBANE_LINK = linkOf(CODE_A, S);
export const TOKYO_LINK = linkOf(CODE_B, S2);

export interface CardMember {
  id: string;
  name: string;
  hasDevice: boolean;
}

export const BRISBANE_CARD = {
  name: 'Brisbane',
  members: [
    { id: TAYLOR_ID, name: 'Taylor', hasDevice: true },
    { id: CASEY_ID, name: 'Casey', hasDevice: false },
    { id: BLAKE_ID, name: 'Blake', hasDevice: false },
  ] as CardMember[],
};

export const TOKYO_CARD = {
  name: 'Tokyo',
  members: [{ id: TAYLOR_ID, name: 'Taylor', hasDevice: true }],
};

/** A member ID of its own for the `index`th member of a made-up card. */
export const memberId = (index: number) =>
  `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;

/** A card of `count` members named Member 1 and so on, of whom the first `withPhone` have a phone. */
export const cardOf = (count: number, withPhone: number) => ({
  name: 'Brisbane',
  members: Array.from({ length: count }, (_, index) => ({
    id: memberId(index + 1),
    name: `Member ${index + 1}`,
    hasDevice: index < withPhone,
  })),
});

const CARD_PURPOSE = 'shared-expense/invite/card/v1';
const REQUEST_PURPOSE = 'shared-expense/invite/request/v1';

const fromBase64Url = (text: string) =>
  new Uint8Array(Buffer.from(text, 'base64url'));

/**
 * A card as a member's phone uploads it (SHARING-95.1): `content` as JSON, or as the text
 * it is, sealed with the card key of `secret` for the invite `code`.
 */
export function sealedCard(code: string, secret: string, content: unknown) {
  return encrypt({
    key: cardKeyOf(secret),
    nonce: new Uint8Array(randomBytes(24)),
    plaintext: utf8(
      typeof content === 'string' ? content : JSON.stringify(content),
    ),
    associatedData: utf8(`${CARD_PURPOSE}\n${code}`),
  });
}

/** Another phone's group on the API with an invite made now, whose card says `content`. */
export function invites(
  code: string,
  secret: string,
  content: unknown,
  groupId = BRISBANE_ID,
) {
  inviteWithCard(
    groupId,
    TAYLORS_PHONE,
    code,
    sealedCard(code, secret, content),
  );
}

/** Brisbane's invite under code A, sealed with S: Taylor has a phone, Casey and Blake have none. */
export const brisbaneInvites = () => invites(CODE_A, S, BRISBANE_CARD);

/** Tokyo's invite under code B, sealed with S2: Taylor alone, with a phone. */
export const tokyoInvites = () => invites(CODE_B, S2, TOKYO_CARD, TOKYO_ID);

// What the API received

type Sent = Pick<Received, 'method' | 'path'>;

const READ_PATH = /^\/invites\/([^/?]+)$/;
const REQUEST_PATH = /^\/invites\/([^/?]+)\/request$/;

export const isRead = (request: Sent) =>
  request.method === 'GET' && READ_PATH.test(request.path);
export const isSending = (request: Sent) =>
  request.method === 'PUT' && REQUEST_PATH.test(request.path);
export const isCancelling = (request: Sent) =>
  request.method === 'DELETE' && REQUEST_PATH.test(request.path);

export const reads = () => requestsReceived().filter(isRead);
export const sendings = () => requestsReceived().filter(isSending);
export const cancellations = () => requestsReceived().filter(isCancelling);

/** Whether a request carries any of the four fields of a signed request. */
export const hasSignedFields = (request: Received) =>
  [request.deviceId, request.timestamp, request.nonce, request.signature].some(
    (field) => field !== null,
  );

/** The ciphertext a request that sends a join request carries. */
export function sentRequest(request: Received): Uint8Array {
  const body = JSON.parse(Buffer.from(request.body).toString('utf8')) as {
    request: string;
  };
  expect(Object.keys(body)).toEqual(['request']);
  return fromHex(body.request);
}

/** The request key of a link's secret (SHARING-135.1). */
export const requestKeyOf = (secret: string) =>
  deriveKey({ secret: fromBase64Url(secret), purpose: REQUEST_PURPOSE });

/**
 * What a join request says, opened with the request key of `secret` and the associated
 * data of SHARING-135.1; undefined when it does not open. The code and the device ID are
 * the request's own unless given.
 */
export function openedRequest(
  request: Received,
  secret: string,
  {
    code = REQUEST_PATH.exec(request.path)![1],
    deviceId = request.deviceId!,
  } = {},
): string | undefined {
  const opened = decrypt({
    key: requestKeyOf(secret),
    ciphertext: sentRequest(request),
    associatedData: utf8(`${REQUEST_PURPOSE}\n${code}\n${deviceId}`),
  });
  return opened.ok ? Buffer.from(opened.plaintext).toString('utf8') : undefined;
}

/** The last join request the API received, opened with S, as the object it says. */
export const lastRequest = (secret = S) =>
  JSON.parse(openedRequest(sendings().at(-1)!, secret)!) as {
    name: string;
    memberId: string | null;
    userId: string;
    boxKey: string;
  };

// The phone's local data

/** The rows of the phone's local data, of any table, that hold every one of `texts`. */
export const rowsWith = (...texts: string[]) =>
  Object.values(everything())
    .flat()
    .filter((row) => texts.every((text) => row.includes(text)));

// The app

/**
 * Gives each test a phone and an API as the invite tests have them, with no link handed
 * to the app yet and what a screen reader is told recorded.
 */
export function eachTestGetsAJoiningPhone(prefix: string) {
  eachTestGetsAnInvitingPhone(prefix);
  beforeEach(() => {
    forgetLinks();
    jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => undefined);
    jest
      .spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions')
      .mockImplementation(() => undefined);
  });
}

/** What a screen reader was told to say. */
export const announcements = () =>
  [
    ...jest.mocked(AccessibilityInfo.announceForAccessibility).mock.calls,
    ...jest.mocked(AccessibilityInfo.announceForAccessibilityWithOptions).mock
      .calls,
  ].map(([said]) => said);

/**
 * Starts the app on a phone with no groups, saves `name` as your name unless it is
 * undefined, and leaves the app on the Expenses root with the phone's clock at T.
 */
export async function startAs(name: string | undefined = 'Dana') {
  const app = await startExpenses();
  if (name !== undefined) await saveName(name);
  await tapTab('Expenses');
  setClock(T);
  return app;
}

/** The lines Join Group shows under its title bar, top to bottom. */
export const joinLines = () => linesIn(screenOf(TITLE));

/** Whether Join Group, if it is open, shows something other than that it is working. */
const hasResult = () =>
  !isOpen(TITLE) ||
  (joinLines().length > 0 &&
    !joinLines().includes(LOADING) &&
    !joinLines().includes(SENDING));

/** Lets the app work until Join Group shows a result, or has closed. */
export const joinSettles = () =>
  until(hasResult, 'Join Group to show a result');

/** The system hands the running app `link`; waits for what Join Group then shows. */
export async function openLink(link: string) {
  await receiveLink(link);
  await joinSettles();
}

const nameOf = (view: ReturnType<typeof screenOf>) =>
  String(view.props.accessibilityLabel ?? linesIn(view).join(' '));

const isButton = (view: ReturnType<typeof screenOf>) =>
  view.props.accessibilityRole === 'button' || view.props.role === 'button';

/** The buttons in Join Group's content, outermost only, top to bottom. */
function joinButtons() {
  const sheet = screenOf(TITLE);
  return sheet.queryAll(isButton, { includeSelf: false }).filter((view) => {
    if (String(view.type) === 'RNSScreenStackHeaderConfig') return false;
    for (
      let outer = view.parent;
      outer && outer !== sheet;
      outer = outer.parent
    ) {
      if (isButton(outer)) return false;
      if (String(outer.type) === 'RNSScreenStackHeaderConfig') return false;
    }
    return true;
  });
}

/** A button in Join Group's content, by its accessible name; undefined when it has none. */
export const joinButton = (name: string) =>
  joinButtons().find((view) => nameOf(view) === name);

const ACTIONS = [SEND, 'Try Again', CANCEL];

/** The rows a person can pick in the form, top to bottom, by name. */
export const choices = () =>
  joinButtons()
    .map(nameOf)
    .filter((name) => !ACTIONS.includes(name));

/** The rows that are picked: one, or none. */
export const chosen = () => joinButtons().filter(isSelected).map(nameOf);

/** Whether Send Request is there and can be pressed. */
export function canSend() {
  const button = joinButton(SEND);
  if (button === undefined) throw new Error('No Send Request in Join Group');
  return !isDisabled(button);
}

/** Presses a button in Join Group's content and lets the app take it in. */
export async function pressInJoin(name: string) {
  const button = joinButton(name);
  if (button === undefined) throw new Error(`No ${name} in Join Group`);
  await fireEvent.press(button);
  await settle();
}

export const nameField = () =>
  within(screenOf(TITLE)).getByLabelText('Your name');

/** Changes the name field to `name`. */
export async function typeName(name: string) {
  await fireEvent.changeText(nameField(), name);
  await settle();
}

/** Presses Send Request, or Try Again, and waits for what Join Group shows next. */
export async function send(button = SEND) {
  await pressInJoin(button);
  await joinSettles();
}

/** Opens Brisbane's link on the Expenses root and sends the request the form starts with. */
export async function requested(link = BRISBANE_LINK) {
  await openLink(link);
  await send();
}

/** The card of a request on the Groups root, by the group it asks to join. */
export const requestCard = (group: string) =>
  screen
    .queryAllByRole('button', { name: `Open request to join ${group}` })
    .at(0);

/** Presses the card of the request to join `group`, and waits for what Join Group shows. */
export async function openRequest(group: string) {
  const card = requestCard(group);
  if (card === undefined) throw new Error(`No request to join ${group}`);
  await fireEvent.press(card);
  await until(() => isOpen(TITLE), 'Join Group to open');
  await joinSettles();
}

/** The names of the Groups root's cards among `names`, top to bottom. */
export const cardsAmong = (names: string[]) =>
  screen
    .queryAllByRole('button')
    .map(nameOf)
    .filter(
      (name, index, all) => names.includes(name) && all[index - 1] !== name,
    );
