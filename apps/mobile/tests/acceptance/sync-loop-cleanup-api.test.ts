import { cleanUp } from '../../../api/src/cleanup';
import {
  NOW,
  addExpense,
  answerNext,
  apiSql,
  created,
  endWorld,
  everythingIn,
  mark,
  sentBy,
  setApiTime,
  setClock,
  stampOf,
  startWorld,
  storedEvents,
  sync,
  titles,
  twoPhones,
  unsent,
  uploadAs,
  uploads,
} from './sync-loop-app';

// Runs in Node against the real API (sync-loop-app): what a phone takes for the API's
// answer that it needs a snapshot (ADR-0033, ADR-0034). Only status 410 with exactly that
// body is it; anything else that is no page ends the sync as before, and the phone asks
// for no snapshot.

jest.mock(
  'expo-secure-store',
  () =>
    jest
      .requireActual<typeof import('./sync-loop-app')>('./sync-loop-app')
      .secureStoreOfStartingPhone(),
  { virtual: true },
);

jest.mock(
  'expo-crypto',
  () =>
    jest.requireActual<typeof import('./sync-loop-app')>('./sync-loop-app')
      .randomSource,
  { virtual: true },
);

beforeEach(startWorld);
afterEach(endWorld);

/** 31 days, after which the cleanup takes an event whatever phone has it. */
const THIRTY_ONE_DAYS = 31 * 86_400_000;

describe('SYNC-71.4', () => {
  test.each<[string, number, unknown]>([
    ['status 410 and an empty object', 410, {}],
    [
      'status 410 and the reason with a sequence number beside it',
      410,
      { error: 'snapshot-needed', sequence: 5 },
    ],
    ['status 410 and another reason', 410, { error: 'gone' }],
    ['status 410 and text that is no JSON', 410, 'not json'],
    ['status 200 and the reason', 200, { error: 'snapshot-needed' }],
  ])(
    '[SYNC-71.4] with [SYNC-137.1] takes %s for no answer that it needs a snapshot: it asks for none, uploads nothing and changes nothing',
    async (_case, status, body) => {
      const setup = await twoPhones();
      const { a, b, brisbane, key } = setup;
      await uploadAs(b, key, [
        await created(b, 'Lunch', await stampOf(b, NOW)),
      ]);
      await addExpense(a);
      const localData = everythingIn(a);
      answerNext('GET', status, body);
      const from = mark();

      await sync(a);

      expect(
        (await sentBy(a, from)).map((request) => [
          request.path,
          request.status,
        ]),
      ).toEqual([[`/groups/${brisbane}/events?after=0`, status]]);
      expect(await uploads(a, from)).toEqual([]);
      expect(await unsent(a)).toHaveLength(1);
      expect(await titles(a)).toEqual(['Dinner']);
      expect(everythingIn(a)).toEqual(localData);

      // The API's own answer that it needs a snapshot is another matter: the phone asks for one.
      const later = NOW + THIRTY_ONE_DAYS;
      setApiTime(later);
      setClock(a, later);
      await cleanUp(apiSql(), later);
      expect(await storedEvents(brisbane)).toEqual([]);
      const next = mark();
      await sync(a);
      expect(
        (await sentBy(a, next)).map((request) => [
          request.path,
          request.status,
        ]),
      ).toEqual([
        [`/groups/${brisbane}/events?after=0`, 410],
        [`/groups/${brisbane}/snapshot`, 404],
      ]);
    },
  );
});
