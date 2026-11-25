import type { SyncMoney } from '@shared-expense/domain';
import { cleanUp } from '../../../api/src/cleanup';
import {
  NOW,
  addExpense,
  apiSql,
  deviceId,
  giveKey,
  randomKey,
  send,
  sentBy,
  setApiTime,
  setClock,
  sync,
  twoPhones,
  type Phone,
  type Setup,
  type SetupOptions,
} from './sync-loop-app';

// The tests of a phone that catches up from a snapshot (ADR-0034) run in the world of the
// sync loop's tests, with the snapshot tests' faults (sync-snapshot-app): two phones in
// Node against the real API, whose cleanup the tests run themselves, as the Workers entry
// file does when Cron fires. A phone falls behind when the cleanup deletes events after
// its cursor; the other phone, which keeps up, makes its snapshot when it syncs.

/** A day, in milliseconds. */
export const DAY = 86_400_000;
/** Where every clock is once a phone has been away: 31 days after the scenarios start. */
export const AWAY = NOW + 31 * DAY;

/** From now on every phone's clock and the API's time are `ms`. */
export function everyClockAt(setup: Pick<Setup, 'a' | 'b'>, ms: number) {
  setApiTime(ms);
  setClock(setup.b, ms);
  setClock(setup.a, ms);
}

/** Runs the API's cleanup once, with `ms` as the API's time. */
export const cleanUpAt = (ms: number) => cleanUp(apiSql(), ms);

/**
 * Taylor's phone has fallen behind, as the sync spec's scenarios start: Casey's phone
 * added Lunch and synced, Taylor's phone did not sync, and 31 days later the cleanup
 * deleted Lunch's event. Brisbane is cleared to 1, Taylor's cursor is 0, and Casey's
 * phone keeps up. Every clock is at AWAY.
 */
export async function taylorBehind(options: SetupOptions = {}): Promise<Setup> {
  const setup = await twoPhones(options);
  await addExpense(setup.b, { title: 'Lunch' });
  await sync(setup.b);
  everyClockAt(setup, AWAY);
  await cleanUpAt(AWAY);
  return setup;
}

/**
 * Makes Tokyo a shared ledger of Taylor's phone alone: on the API that phone is Tokyo's
 * only member device, as in a ledger nobody else has joined. Resolves with Tokyo's key of
 * key epoch 1, which the phone has.
 */
export async function tokyoAlone({ a, tokyo }: Setup): Promise<Uint8Array> {
  await send(a, 'PUT', `/groups/${tokyo}`);
  const key = randomKey();
  giveKey(a, tokyo, 1, key);
  setClock(a, a.state.clockMs);
  await a.sync.shareGroup(a.database, {
    groupId: tokyo,
    device: await deviceId(a),
  });
  return key;
}

/**
 * What the phone sent since `from`, in order, in the words of the scenarios:
 * `download after=<cursor>`, `upload`, `ask` for the request that asks for a snapshot,
 * `get chunk <index>` and `put chunk <index>`.
 */
export async function requestsOf(phone: Phone, from = 0): Promise<string[]> {
  return (await sentBy(phone, from)).map(({ method, path }) => {
    const events = /^\/groups\/[^/]+\/events(?:\?(.*))?$/.exec(path);
    if (events) return method === 'GET' ? `download ${events[1]}` : 'upload';
    if (/^\/groups\/[^/]+\/snapshot$/.test(path)) return 'ask';
    const chunk = /^\/groups\/[^/]+\/snapshots\/[^/]+\/chunks\/(\d+)$/.exec(
      path,
    );
    if (chunk) return `${method === 'PUT' ? 'put' : 'get'} chunk ${chunk[1]}`;
    return `${method} ${path}`;
  });
}

/** Whether the shared ledger waits for a snapshot on the phone, as the app's other capabilities read it (SYNC-165.1). */
export async function waits(
  phone: Phone,
  groupId = phone.brisbane,
): Promise<boolean> {
  setClock(phone, phone.state.clockMs);
  return phone.sync.isWaitingForSnapshot(phone.database, groupId);
}

/**
 * The lines the group's screen shows under its title about its sync, top to bottom. They
 * are read through the phone's own modules: a plain `requireActual` gives those of the
 * phone started last, and what a sync's end decided is kept in memory (SYNC-315.1, SYNC-316.2).
 */
export async function noticesOf(
  phone: Phone,
  groupId = phone.brisbane,
): Promise<string[]> {
  return (await phone.loop.readSyncNotices(phone.database, groupId)).lines;
}

/** The line a shared ledger's screen shows while it waits for an app update (SYNC-75.1). */
export const UPDATE_NOTICE =
  'This group has changes from a newer version of the app. Update the app to see them.';

/** The line a shared ledger's screen shows while it waits for a snapshot (SYNC-314.1). */
export const WAITING_NOTICE =
  'This group is out of date. It will catch up after another member opens the app.';

/** The line of a shared ledger whose last sync stopped at a request that got no answer (SYNC-316.2). */
export const OFFLINE_NOTICE =
  'Connect to the internet to sync this group. New changes stay on this phone until then.';

/** The group's expenses on the phone as its cards read them: each with `yours` while it needs review (LEDGER-151.1). */
async function cardsOf(phone: Phone, groupId: string) {
  return (await phone.expenses.listExpensesForCards(phone.database)).filter(
    (expense) => expense.spaceId === groupId,
  );
}

/** An expense of the group on the phone, by title. */
async function expenseTitled(phone: Phone, title: string, groupId: string) {
  const found = (await cardsOf(phone, groupId)).find(
    (expense) => expense.title === title,
  );
  if (!found) throw new Error(`No expense titled ${title}`);
  return found;
}

/** An expense's money as the phone holds it now, and the user's own money while the expense needs review. */
export async function moneyOf(
  phone: Phone,
  title: string,
  groupId = phone.brisbane,
): Promise<{ current: SyncMoney; yours: SyncMoney | undefined }> {
  const { amountMinor, currency, payments, shares, yours } =
    await expenseTitled(phone, title, groupId);
  return { current: { amountMinor, currency, payments, shares }, yours };
}

/** The titles of the group's expenses on the phone that need review, sorted. */
export async function toReview(
  phone: Phone,
  groupId = phone.brisbane,
): Promise<string[]> {
  return (await cardsOf(phone, groupId))
    .filter((expense) => expense.yours !== undefined)
    .map((expense) => expense.title)
    .sort();
}

/** The user chooses Keep Current for the expense (SYNC-131.1). */
export async function keepCurrent(
  phone: Phone,
  title: string,
  groupId = phone.brisbane,
) {
  setClock(phone, phone.state.clockMs);
  const { keepCurrentMoney } = jest.requireActual<
    typeof import('../../src/ledger/review')
  >('../../src/ledger/review');
  await keepCurrentMoney(
    phone.database,
    (await expenseTitled(phone, title, groupId)).id,
  );
}

/** The ID of the group's expense titled `title` on the phone. */
export const expenseId = async (
  phone: Phone,
  title: string,
  groupId = phone.brisbane,
) => (await expenseTitled(phone, title, groupId)).id;
