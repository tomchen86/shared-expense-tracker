import { cleanUp } from '../../../api/src/cleanup';
import {
  NOW,
  addExpense,
  apiSql,
  created,
  downloads,
  endWorld,
  everythingIn,
  mark,
  sentBy,
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

// Runs in Node against the real API (sync-loop-app): what a phone built today does once
// the API's cleanup has deleted events after its cursor (ADR-0033). Fetching a snapshot is
// not built yet (#156), so the phone has to end its sync without losing anything.

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

/** The 30 days an event may stay on the API, in milliseconds. */
const THIRTY_DAYS = 2_592_000_000;

describe('SYNC-71.1', () => {
  test('[SYNC-71.1] with [SYNC-136.1] a phone that is told it needs a snapshot applies nothing, uploads nothing, and keeps its unsent events and its cursor', async () => {
    const { a, b, brisbane, key } = await twoPhones();
    await uploadAs(b, key, [await created(b, 'Lunch', await stampOf(b, NOW))]);
    await addExpense(a);
    // To the cleanup Lunch's event was received over 30 days ago, and no phone has it.
    await cleanUp(apiSql(), NOW + THIRTY_DAYS + 1);
    expect(await storedEvents(brisbane)).toEqual([]);
    const localData = everythingIn(a);
    const from = mark();

    await sync(a);
    await sync(a);

    expect(await downloads(a, from)).toEqual(['after=0', 'after=0']);
    expect((await sentBy(a, from)).map(({ status }) => status)).toEqual([
      410, 410,
    ]);
    expect(await uploads(a, from)).toEqual([]);
    expect(await unsent(a)).toHaveLength(1);
    expect(await titles(a)).toEqual(['Dinner']);
    expect(everythingIn(a)).toEqual(localData);
  });
});
