import type { SyncMoney, SyncSnapshot } from '@shared-expense/domain';
import {
  AWAY,
  cleanUpAt,
  everyClockAt,
  expenseId,
  keepCurrent,
  moneyOf,
  toReview,
} from './sync-catch-up-app';
import {
  MINUTE,
  NOW,
  addExpense,
  editExpense,
  everythingIn,
  memberIds,
  setApiTime,
  setClock,
  stampOf,
  sync,
  titles,
  twoPhones,
  uploadAs,
  type Phone,
  type Setup,
} from './sync-loop-app';
import {
  contentFor,
  endSnapshotWorld,
  plant,
  sentSnapshot,
  startSnapshotWorld,
  takeSnapshot,
} from './sync-snapshot-app';

// Runs in Node against the real API (sync-loop-app, sync-snapshot-app): a phone that takes
// a snapshot in marks an expense for review when the snapshot holds its money under a later
// stamp than the phone's own last change of it (ADR-0016, ADR-0029, ADR-0034). A snapshot
// has no base to tell whether the other phone had seen that change, so the phone marks
// rather than miss one.

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

beforeEach(startSnapshotWorld);
afterEach(endSnapshotWorld);

const IMPORTED = { outcome: 'imported' };

/** The money of an expense Casey paid and Blake, Taylor and Casey share evenly, as the phone holds it. */
async function evenly(phone: Phone, amountMinor: number): Promise<SyncMoney> {
  const ids = await memberIds(phone);
  const share = amountMinor / 3;
  return {
    amountMinor,
    currency: 'USD',
    payments: [{ participant: ids.Casey, amountMinor }],
    shares: [ids.Blake, ids.Taylor, ids.Casey].map((participant) => ({
      participant,
      amountMinor: share,
    })),
  };
}

/** From now on every phone's clock and the API's time are `ms`. */
function allAt(setup: Setup, ms: number) {
  setApiTime(ms);
  setClock(setup.b, ms);
  setClock(setup.a, ms);
}

/**
 * Both phones have Dinner, which Taylor's phone added and both synced. Then Casey's phone
 * changed its amount at `caseyAt` and synced, and Taylor's phone, with no network, changed
 * it to 120.00 at `taylorAt`. Casey's phone has uploaded a snapshot for Taylor's phone,
 * which has not taken it in yet.
 */
async function bothChangedTheAmount({
  taylorAt = NOW,
  caseyAt = NOW + MINUTE,
  casey = 9000,
}: { taylorAt?: number; caseyAt?: number; casey?: number } = {}) {
  const setup = await twoPhones();
  const { a, b } = setup;
  await addExpense(a);
  await sync(a);
  await sync(b);
  setClock(b, caseyAt);
  setApiTime(caseyAt);
  await editExpense(b, 'Dinner', { amountMinor: casey });
  await sync(b);
  setClock(a, taylorAt);
  await editExpense(a, 'Dinner', { amountMinor: 12000 });
  allAt(setup, Math.max(taylorAt, caseyAt));
  await sentSnapshot(b, a);
  return setup;
}

describe('SYNC-168.1', () => {
  test('[SYNC-168.1] a phone that catches up finds the expense whose amount another phone changed meanwhile marked for review, with the amount it entered itself', async () => {
    const setup = await twoPhones();
    const { a, b } = setup;
    await addExpense(a);
    await sync(a);
    await sync(b);
    // Taylor's phone has no network; Casey's phone changes the amount a minute later.
    await editExpense(a, 'Dinner', { amountMinor: 12000 });
    setClock(b, NOW + MINUTE);
    setApiTime(NOW + MINUTE);
    await editExpense(b, 'Dinner', { amountMinor: 9000 });
    await sync(b);
    everyClockAt(setup, AWAY);
    await cleanUpAt(AWAY);

    await sync(a);
    await sync(b);
    await sync(a);

    expect(await moneyOf(a, 'Dinner')).toEqual({
      current: await evenly(a, 9000),
      yours: await evenly(a, 12000),
    });
    expect(await toReview(a)).toEqual(['Dinner']);
    // Its own change went up afterwards, and is the earlier one on every phone.
    await sync(b);
    expect((await moneyOf(b, 'Dinner')).current).toEqual(await evenly(b, 9000));
    expect(await toReview(b)).toEqual([]);
  });

  test('[SYNC-168.1] marks the expense when the snapshot holds its money under a later stamp than the phone’s own change of it', async () => {
    const { a } = await bothChangedTheAmount();
    expect(await toReview(a)).toEqual([]);

    expect(await takeSnapshot(a)).toEqual(IMPORTED);

    expect(await moneyOf(a, 'Dinner')).toEqual({
      current: await evenly(a, 9000),
      yours: await evenly(a, 12000),
    });
    expect(await toReview(a)).toEqual(['Dinner']);
  });

  test('[SYNC-168.1] does not mark it while the phone’s own change is the later one', async () => {
    const setup = await bothChangedTheAmount({ taylorAt: NOW + 2 * MINUTE });
    const { a, b } = setup;

    expect(await takeSnapshot(a)).toEqual(IMPORTED);

    expect(await moneyOf(a, 'Dinner')).toEqual({
      current: await evenly(a, 12000),
      yours: undefined,
    });
    expect(await toReview(a)).toEqual([]);

    // A change the other phone makes after that, without having seen it, is marked.
    allAt(setup, NOW + 3 * MINUTE);
    await editExpense(b, 'Dinner', { amountMinor: 6000 });
    await sync(b);
    await sentSnapshot(b, a);
    expect(await takeSnapshot(a)).toEqual(IMPORTED);
    expect(await moneyOf(a, 'Dinner')).toEqual({
      current: await evenly(a, 6000),
      yours: await evenly(a, 12000),
    });
  });

  test('[SYNC-168.1] does not mark it when the snapshot holds the same money as the phone’s own change', async () => {
    const setup = await bothChangedTheAmount({ casey: 12000 });
    const { a, b } = setup;

    expect(await takeSnapshot(a)).toEqual(IMPORTED);

    expect(await moneyOf(a, 'Dinner')).toEqual({
      current: await evenly(a, 12000),
      yours: undefined,
    });

    // Another amount under a later stamp is marked.
    allAt(setup, NOW + 2 * MINUTE);
    await editExpense(b, 'Dinner', { amountMinor: 9000 });
    await sync(b);
    await sentSnapshot(b, a);
    expect(await takeSnapshot(a)).toEqual(IMPORTED);
    expect(await toReview(a)).toEqual(['Dinner']);
  });

  test('[SYNC-168.1] marks only expenses whose money this phone changed itself', async () => {
    // Dinner was there when Brisbane became a shared ledger; Taxi is one Taylor's phone added since.
    const setup = await twoPhones({ expenses: ['Dinner'] });
    const { a, b } = setup;
    await addExpense(a, { title: 'Taxi' });
    await sync(a);
    await sync(b);
    allAt(setup, NOW + MINUTE);
    await editExpense(b, 'Dinner', { amountMinor: 9000 });
    await editExpense(b, 'Taxi', { amountMinor: 9000 });
    await sync(b);
    await sentSnapshot(b, a);

    expect(await takeSnapshot(a)).toEqual(IMPORTED);

    expect(await moneyOf(a, 'Dinner')).toEqual({
      current: await evenly(a, 9000),
      yours: undefined,
    });
    expect(await toReview(a)).toEqual(['Taxi']);
  });

  test('[SYNC-168.1] marks it whatever the merge keeps: also when the phone already holds later money than the snapshot’s', async () => {
    const setup = await twoPhones();
    const { a, b, B, key } = setup;
    await addExpense(a);
    await editExpense(a, 'Dinner', { amountMinor: 12000 });
    await sync(a);
    await sync(b);
    // Casey's phone has seen the 120.00 when it changes the amount, so no event marks Dinner.
    allAt(setup, NOW + 2 * MINUTE);
    await editExpense(b, 'Dinner', { amountMinor: 9000 });
    await sync(b);
    await sync(a);
    expect(await toReview(a)).toEqual([]);
    // A snapshot whose Dinner holds other money, stamped between the two changes.
    const { sequence } = await sentSnapshot(b, a);
    const content = await contentFor(a, key);
    const id = await expenseId(a, 'Dinner');
    const between = {
      value: {
        ...(await evenly(a, 9000)),
        amountMinor: 8000,
        payments: [
          { participant: (await memberIds(a)).Casey, amountMinor: 8000 },
        ],
        shares: (await evenly(a, 9000)).shares.map((share, index) => ({
          ...share,
          amountMinor: index < 2 ? 2667 : 2666,
        })),
      },
      stamp: { ms: NOW + MINUTE, counter: 0, device: B },
    };
    const changed = {
      ...content,
      records: content.records.map((record) =>
        record.type === 'expense' && record.id === id
          ? { ...record, units: { ...record.units, money: between } }
          : record,
      ),
    } as SyncSnapshot;
    await plant(b, a, key, changed, { sequence });

    expect(await takeSnapshot(a)).toEqual(IMPORTED);

    expect(await moneyOf(a, 'Dinner')).toEqual({
      current: await evenly(a, 9000),
      yours: await evenly(a, 12000),
    });
  });

  test('[SYNC-168.1] an expense the snapshot holds only a tombstone of is gone, and is not to review', async () => {
    const setup = await twoPhones();
    const { a, b, key } = setup;
    await addExpense(a);
    await addExpense(a, { title: 'Taxi' });
    await sync(a);
    await sync(b);
    await editExpense(a, 'Dinner', { amountMinor: 12000 });
    allAt(setup, NOW + MINUTE);
    // Another phone's code deletes Dinner for good; Casey's phone applies it, and changes Taxi.
    await uploadAs(b, key, [
      {
        version: 1,
        stamp: await stampOf(b, NOW + MINUTE),
        type: 'expense',
        id: await expenseId(b, 'Dinner'),
        deleted: true,
      },
    ]);
    await sync(b);
    expect(await titles(b)).toEqual(['Taxi']);
    await editExpense(b, 'Taxi', { amountMinor: 9000 });
    await sync(b);
    await sentSnapshot(b, a);

    expect(await takeSnapshot(a)).toEqual(IMPORTED);

    expect(await titles(a)).toEqual(['Taxi']);
    // Taxi, whose money the snapshot changed, is the only one to review.
    expect(await toReview(a)).toEqual(['Taxi']);
  });

  test('[SYNC-168.1] taking the same snapshot in again changes nothing, also once the user has chosen Keep Current', async () => {
    const { a } = await bothChangedTheAmount();
    expect(await takeSnapshot(a)).toEqual(IMPORTED);
    expect(await toReview(a)).toEqual(['Dinner']);
    const marked = everythingIn(a);

    expect(await takeSnapshot(a)).toEqual(IMPORTED);

    expect(everythingIn(a)).toEqual(marked);

    await keepCurrent(a, 'Dinner');
    expect(await toReview(a)).toEqual([]);
    const settled = everythingIn(a);

    expect(await takeSnapshot(a)).toEqual(IMPORTED);

    expect(everythingIn(a)).toEqual(settled);
    expect(await toReview(a)).toEqual([]);
  });
});
