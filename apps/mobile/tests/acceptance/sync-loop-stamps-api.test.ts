import type { SyncEvent, SyncStamp } from '@shared-expense/domain';
import {
  HOUR,
  NOW,
  T,
  addCategory,
  addExpense,
  answerNext,
  copyOfData,
  deleteCategory,
  editExpense,
  endWorld,
  keyOf,
  ledgerOf,
  loseAnswerTo,
  mark,
  noAnswerTo,
  plaintextOf,
  randomId,
  refusals,
  renameGroup,
  restart,
  restoreData,
  send,
  sentBy,
  setApiTime,
  setClock,
  startWorld,
  storedContents,
  storedEvents,
  sync,
  titles,
  twoPhones,
  unsent,
  uploadAs,
  uploadedContent,
  uploads,
  whenAnswered,
  type Phone,
} from './sync-loop-app';

// Runs in Node against the real API (sync-loop-app): the check of an unsent event's stamp
// (ADR-0016). A phone's clock is set by the test, and so is the API's time; a stamp is
// written as milliseconds, counter and device, as in the spec.

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

/** A phone's clock an hour ahead of NOW. */
const FAST = NOW + HOUR;
const FIVE_MINUTES = 300_000;

const at = (ms: number, counter: number, device: string): SyncStamp => ({
  ms,
  counter,
  device,
});

const stampsOf = (events: readonly (SyncEvent | undefined)[]) =>
  events.map((event) => event?.stamp);

const unsentStamps = async (phone: Phone, groupId = phone.brisbane) =>
  (await unsent(phone, groupId)).map((event) => event.content.stamp);

/** The base an event gives for the unit `unit`. */
function baseOf(event: SyncEvent | undefined, unit: string) {
  if (!event || !('units' in event)) return undefined;
  const units: Record<string, { base?: SyncStamp } | undefined> = event.units;
  return units[unit]?.base;
}

/** The request time and the status of each request of the phone since `from` with this method. */
const attempts = async (phone: Phone, from: number, method: string) =>
  (await sentBy(phone, from))
    .filter((request) => request.method === method)
    .map((request) => [request.timestamp, request.status]);

test('[SYNC-21.1] stamps a change with the corrected time once the API has told the phone its offset', async () => {
  const { a, A, brisbane } = await twoPhones();
  setClock(a, FAST);
  // The API refuses the first try for its clock, and the phone takes the API's time.
  const answer = await send(a, 'GET', `/groups/${brisbane}/events?after=0`);
  expect(answer.status).toBe(200);
  expect(await a.sharing.readClockOffsetMs(a.database)).toBe(-HOUR);

  await addExpense(a);

  expect(await unsentStamps(a)).toEqual([at(NOW, 0, A)]);
});

describe('SYNC-84.1', () => {
  test('[SYNC-84.1] leaves the stamp of an event written with an accurate clock', async () => {
    const { a, A, brisbane, key } = await twoPhones();
    await addExpense(a);
    expect(await unsentStamps(a)).toEqual([at(NOW, 0, A)]);

    await sync(a);

    expect(stampsOf(await storedContents(brisbane, key))).toEqual([
      at(NOW, 0, A),
    ]);
  });

  test('[SYNC-84.1] leaves a stamp that is exactly 5 minutes ahead of the corrected time', async () => {
    const { a, A, brisbane, key } = await twoPhones();
    setClock(a, NOW + FIVE_MINUTES);
    await addExpense(a);
    setClock(a, NOW);

    await sync(a);

    expect(stampsOf(await storedContents(brisbane, key))).toEqual([
      at(NOW + FIVE_MINUTES, 0, A),
    ]);
  });

  test('[SYNC-84.1] replaces a stamp that is one millisecond more than 5 minutes ahead', async () => {
    const { a, A, brisbane, key } = await twoPhones();
    setClock(a, NOW + FIVE_MINUTES + 1);
    await addExpense(a);
    const [written] = await unsent(a);
    expect(written.content.stamp).toEqual(at(NOW + FIVE_MINUTES + 1, 0, A));
    setClock(a, NOW);

    await sync(a);

    expect(await storedContents(brisbane, key)).toEqual([
      { ...written.content, stamp: at(NOW, 0, A) },
    ]);
    expect(
      (await storedEvents(brisbane)).map((event) => event.eventId),
    ).toEqual([written.id]);
  });

  test('[SYNC-84.1] leaves a stamp that is behind the corrected time, however far', async () => {
    const { a, A, brisbane, key } = await twoPhones();
    await addExpense(a);
    const threeDaysLater = NOW + 72 * HOUR;
    setClock(a, threeDaysLater);
    setApiTime(threeDaysLater);

    await sync(a);

    expect(stampsOf(await storedContents(brisbane, key))).toEqual([
      at(NOW, 0, A),
    ]);
  });

  test('[SYNC-84.1] checks an event saved in the middle of a sync before it sends it, in that sync or the next', async () => {
    const { a, A, brisbane, key } = await twoPhones();
    for (let index = 0; index < 150; index += 1) {
      await renameGroup(a, `Trip ${index + 1}`);
    }
    // As the first upload is confirmed, the clock is an hour ahead for one save.
    whenAnswered('POST', async () => {
      setClock(a, FAST);
      await addExpense(a, { title: 'Late' });
      setClock(a, NOW);
    });

    await sync(a);
    await sync(a);

    expect(await unsent(a)).toEqual([]);
    const contents = await storedContents(brisbane, key);
    expect(contents).toHaveLength(151);
    const late = contents.find(
      (event) =>
        event?.type === 'expense' &&
        'units' in event &&
        event.units.title?.value === 'Late',
    );
    // The 150 renames are stamped NOW, so the latest stamp left is in that millisecond.
    expect(late?.stamp).toEqual(at(NOW + 1, 0, A));
    expect(
      contents.filter((event) => (event?.stamp.ms ?? Infinity) > NOW + 1),
    ).toEqual([]);
  });

  test("[SYNC-84.1] checks the unsent events of the phone's other shared ledgers in the same check", async () => {
    const { a, A, brisbane, tokyo, key } = await twoPhones({
      tokyoShared: true,
    });
    setClock(a, FAST);
    await addExpense(a);
    await addExpense(a, { title: 'Sushi', group: tokyo });
    expect(await unsentStamps(a)).toEqual([at(FAST, 0, A)]);
    expect(await unsentStamps(a, tokyo)).toEqual([at(FAST, 1, A)]);

    await sync(a);

    expect(stampsOf(await storedContents(brisbane, key))).toEqual([
      at(NOW, 0, A),
    ]);
    // Tokyo has not synced, and its event already has the stamp it will go up with.
    expect(await unsentStamps(a, tokyo)).toEqual([at(NOW + 1, 0, A)]);
    expect(await storedEvents(tokyo)).toEqual([]);

    await sync(a, tokyo);

    expect(stampsOf(await storedContents(tokyo, keyOf(a, tokyo)))).toEqual([
      at(NOW + 1, 0, A),
    ]);
  });

  test('[SYNC-84.1] checks before it merges the page, so a downloaded event is compared with the new stamp', async () => {
    const { a, b, A, B, brisbane, key } = await twoPhones({
      expenses: ['Dinner'],
    });
    await sync(a);
    await sync(b);
    setClock(b, T + 90_000);
    await editExpense(b, 'Dinner', { title: 'Brunch' });
    await sync(b);
    setClock(a, FAST);
    await editExpense(a, 'Dinner', { title: 'Supper' });
    expect(await unsentStamps(a)).toEqual([at(FAST, 0, A)]);

    await sync(a);

    expect(stampsOf(await storedContents(brisbane, key))).toEqual([
      at(T + 90_000, 0, B),
      at(NOW, 0, A),
    ]);
    // Supper, now stamped NOW, lost to Brunch on the phone that wrote it too.
    expect(await titles(a)).toEqual(['Brunch']);
    await sync(b);
    expect(await titles(b)).toEqual(['Brunch']);
    expect(await ledgerOf(b)).toEqual(await ledgerOf(a));
  });
});

describe('SYNC-85.1', () => {
  /**
   * Taylor's phone, its clock set an hour ahead, has added Dinner, renamed it Supper and
   * renamed Brisbane to Brissie, and then synced while the API's time is NOW.
   */
  async function afterAnHourAhead() {
    const setup = await twoPhones();
    const { a, A } = setup;
    setClock(a, FAST);
    await addExpense(a);
    await editExpense(a, 'Dinner', { title: 'Supper' });
    await renameGroup(a, 'Brissie');
    const written = await unsent(a);
    expect(written.map((event) => event.content.stamp)).toEqual([
      at(FAST, 0, A),
      at(FAST, 1, A),
      at(FAST, 2, A),
    ]);
    const from = mark();
    await sync(a);
    return { ...setup, written, from };
  }

  test('[SYNC-85.1] gives events stamped an hour ahead new stamps from the corrected time on, a millisecond apart, with the bases that name them', async () => {
    const { a, A, brisbane, key, written, from } = await afterAnHourAhead();

    // The download is refused for the clock first, and accepted at the API's time; the
    // download after the upload follows at that time too (SYNC-160.1).
    expect(await attempts(a, from, 'GET')).toEqual([
      [String(FAST), 401],
      [String(NOW), 200],
      [String(NOW), 200],
    ]);
    expect(await a.sharing.readClockOffsetMs(a.database)).toBe(-HOUR);

    const stored = await storedContents(brisbane, key);
    expect(stampsOf(stored)).toEqual([
      at(NOW, 0, A),
      at(NOW + 1, 0, A),
      at(NOW + 2, 0, A),
    ]);
    expect(
      (await storedEvents(brisbane)).map((event) => event.eventId),
    ).toEqual(written.map((event) => event.id));
    // Nothing else of the first event changed.
    expect(stored[0]).toEqual({ ...written[0].content, stamp: at(NOW, 0, A) });
    expect(baseOf(stored[1], 'title')).toEqual(at(NOW, 0, A));
    // The group's name was last stamped when Brisbane became a shared ledger.
    expect(baseOf(stored[2], 'name')).toEqual(
      baseOf(written[2].content, 'name'),
    );
    expect(baseOf(stored[2], 'name')?.ms).toBe(T);
    expect(await unsent(a)).toEqual([]);
  });

  test('[SYNC-85.1] the other phone applies the events with their new stamps', async () => {
    const { b } = await afterAnHourAhead();

    await sync(b);

    expect((await ledgerOf(b)).name).toBe('Brissie');
    expect(await titles(b)).toEqual(['Supper']);
    expect(await refusals(b)).toEqual([]);
  });

  test("[SYNC-85.1] the phone's next change is stamped after the new stamps, and names the new stamp as its base", async () => {
    const { a, A } = await afterAnHourAhead();

    await editExpense(a, 'Supper', { title: 'Late supper' });

    // The corrected time is still NOW, not later than the last new stamp, NOW + 2: the
    // change takes that millisecond and the next counter (SYNC-2.1).
    const [next] = await unsent(a);
    expect(next.content.stamp).toEqual(at(NOW + 2, 1, A));
    expect(baseOf(next.content, 'title')).toEqual(at(NOW + 1, 0, A));
  });

  test('[SYNC-85.1] replaces only the stamps that are too far ahead', async () => {
    const { a, A, brisbane, key } = await twoPhones();
    await addExpense(a, { title: 'Lunch' });
    setClock(a, FAST);
    await addExpense(a);
    expect(await unsentStamps(a)).toEqual([at(NOW, 0, A), at(FAST, 0, A)]);

    await sync(a);

    // Lunch's stamp is left in the millisecond of the corrected time, so Dinner's is the next one.
    expect(stampsOf(await storedContents(brisbane, key))).toEqual([
      at(NOW, 0, A),
      at(NOW + 1, 0, A),
    ]);
  });

  test('[SYNC-85.1] replaces the stamp a record was created with, so every phone lists it in the same place', async () => {
    const { a, b, A, brisbane, key } = await twoPhones();
    setClock(a, FAST);
    await addCategory(a, 'Flights');
    setClock(b, T + 120_000);
    await addCategory(b, 'Hotels', '#00ACC1');
    await sync(b);

    // Taylor's phone syncs once while the API's time is NOW: it has not downloaded its
    // own event yet, and Flights already comes before Hotels.
    await sync(a);

    const added = async (phone: Phone) =>
      (await ledgerOf(phone)).categories.slice(9).map(({ name }) => name);
    expect(await added(a)).toEqual(['Flights', 'Hotels']);
    expect(stampsOf(await storedContents(brisbane, key)).at(-1)).toEqual(
      at(NOW, 0, A),
    );
    await sync(b);
    expect(await added(b)).toEqual(['Flights', 'Hotels']);
    expect(await refusals(b)).toEqual([]);
  });

  test('[SYNC-85.1] replaces the stamp of the tombstone a replaced deletion left', async () => {
    const { a, A, brisbane, key } = await twoPhones();
    setClock(a, FAST);
    await deleteCategory(a, 'Shopping');
    expect(await unsentStamps(a)).toEqual([at(FAST, 0, A)]);
    // The API's time is NOW: the phone's offset becomes an hour, and the deletion is stamped NOW.
    await sync(a);
    expect(await a.sharing.readClockOffsetMs(a.database)).toBe(-HOUR);

    // For one save the phone's clock is another hour ahead.
    setClock(a, FAST + HOUR + 1000);
    await addExpense(a);
    expect(await unsentStamps(a)).toEqual([at(FAST + 1000, 0, A)]);
    setClock(a, FAST);
    await sync(a);

    // A tombstone still stamped an hour ahead would have been the latest stamp left.
    expect(stampsOf(await storedContents(brisbane, key))).toEqual([
      at(NOW, 0, A),
      at(NOW + 1, 0, A),
    ]);
  });

  test('[SYNC-85.1] does not keep a latest stamp that no record holds', async () => {
    const { a, b, A, B, brisbane, key } = await twoPhones();
    const id = randomId();
    // An expense deleted for good, and then a change to it stamped 9 minutes ahead:
    // the change merges, and changes no unit.
    await uploadAs(b, key, [
      { version: 1, stamp: at(NOW, 0, B), type: 'expense', id, deleted: true },
      {
        version: 1,
        stamp: at(NOW + 540_000, 0, B),
        type: 'expense',
        id,
        units: { title: { value: 'Late' } },
      },
    ]);
    await sync(a);
    expect(await refusals(a)).toEqual([]);
    await addExpense(a);
    expect(await unsentStamps(a)).toEqual([at(NOW + 540_000, 1, A)]);

    await sync(a);

    // The latest stamp left is the tombstone's.
    expect(stampsOf(await storedContents(brisbane, key))).toEqual([
      at(NOW, 0, B),
      at(NOW + 540_000, 0, B),
      at(NOW + 1, 0, A),
    ]);
  });

  test('[SYNC-85.1] does not count the latest stamp it had stored, once nothing holds that stamp', async () => {
    const setup = await twoPhones({ tokyoShared: true });
    const { b, A, brisbane, tokyo, key } = setup;
    setClock(setup.a, FAST);
    await addExpense(setup.a, { title: 'Sushi', group: tokyo });
    await addExpense(setup.a);
    expect(await unsentStamps(setup.a, tokyo)).toEqual([at(FAST, 0, A)]);
    expect(await unsentStamps(setup.a)).toEqual([at(FAST, 1, A)]);
    const copy = await copyOfData(setup.a);
    // The API's time is NOW: Sushi is stamped NOW, and Dinner goes up stamped a millisecond later.
    await sync(setup.a);
    expect(stampsOf(await storedContents(brisbane, key))).toEqual([
      at(NOW + 1, 0, A),
    ]);

    // Three minutes later the phone, still an hour ahead, is back at the copy. Dinner
    // takes the stamp the API holds (SYNC-96.1), so nothing holds the stamp the phone has
    // stored as its latest any more: Dinner's old one.
    setApiTime(NOW + 180_000);
    const a = await restoreData(setup.a, copy);
    setClock(a, FAST + 180_000);
    await sync(a);

    expect(await unsentStamps(a, tokyo)).toEqual([at(NOW + 180_000, 0, A)]);
    await sync(a, tokyo);
    setClock(b, NOW + 180_000);
    await sync(b, tokyo);
    expect(await titles(b, tokyo)).toEqual(['Sushi']);
    expect(await refusals(b)).toEqual([]);
  });

  test('[SYNC-85.1] gives a new stamp that is later than the base of the event, when the base is ahead of the corrected time', async () => {
    const { a, b, A, B, brisbane, key } = await twoPhones({
      expenses: ['Dinner'],
    });
    await sync(a);
    await sync(b);
    setClock(b, T + 240_000);
    await editExpense(b, 'Dinner', { title: 'Brunch' });
    await sync(b);
    await sync(a);
    expect(await titles(a)).toEqual(['Brunch']);
    setClock(a, FAST);
    await editExpense(a, 'Brunch', { title: 'Supper' });
    const [written] = await unsent(a);
    expect(written.content.stamp).toEqual(at(FAST, 0, A));
    expect(baseOf(written.content, 'title')).toEqual(at(T + 240_000, 0, B));
    setClock(a, NOW);

    await sync(a);

    const stored = await storedContents(brisbane, key);
    expect(stampsOf(stored)).toEqual([
      at(T + 240_000, 0, B),
      at(T + 240_001, 0, A),
    ]);
    expect(baseOf(stored[1], 'title')).toEqual(at(T + 240_000, 0, B));
    await sync(b);
    expect(await titles(b)).toEqual(['Supper']);
    expect(await titles(a)).toEqual(['Supper']);
  });

  test('[SYNC-85.1] does not make an event larger: one saved at the size limit and replaced after ten others still uploads', async () => {
    const { a, b, A, brisbane, key } = await twoPhones();
    // How long a note makes an event exactly 65,536 bytes, measured on the other phone:
    // the events differ only in what is as long on both.
    await addExpense(b, { title: 'Big', note: 'a' });
    const [trial] = await unsent(b);
    const noteLength = 1 + 65_536 - (plaintextOf(trial.content).length + 41);
    setClock(a, FAST);
    for (let index = 0; index < 10; index += 1) {
      await renameGroup(a, `Trip ${index + 1}`);
    }
    // A second later, so the large event's stamp has counter 0: no stamp is shorter.
    setClock(a, FAST + 1000);
    await addExpense(a, { title: 'Big', note: 'a'.repeat(noteLength) });
    const written = await unsent(a);
    expect(written.map((event) => event.content.stamp)).toEqual([
      ...Array.from({ length: 10 }, (_, counter) => at(FAST, counter, A)),
      at(FAST + 1000, 0, A),
    ]);
    expect(plaintextOf(written[10].content).length + 41).toBe(65_536);

    await sync(a);

    // Counting up at the corrected time would have stamped it NOW with counter 10: a byte
    // more, and the API refuses a request that holds an event over 65,536 bytes.
    const stored = await storedContents(brisbane, key);
    expect(stampsOf(stored)).toEqual(
      Array.from({ length: 11 }, (_, index) => at(NOW + index, 0, A)),
    );
    expect(plaintextOf(stored[10]).length + 41).toBe(65_536);
    expect(await unsent(a)).toEqual([]);
  });
});

describe('SYNC-86.1', () => {
  /**
   * Taylor's phone runs 4 minutes ahead of the API. Dinner is stamped 4 minutes ahead of
   * that, the first sync checks it (240,000 ms ahead) and its upload is not confirmed;
   * then the phone's clock is set right, which leaves the stamp 480,000 ms ahead.
   */
  async function checkedThenSetRight(firstUpload: () => void) {
    const setup = await twoPhones();
    const { a, A } = setup;
    setClock(a, NOW + 480_000);
    await addExpense(a);
    const [dinner] = await unsent(a);
    expect(dinner.content.stamp).toEqual(at(NOW + 480_000, 0, A));
    setClock(a, NOW + 240_000);
    firstUpload();
    await sync(a);
    expect(await unsent(a)).toEqual([dinner]);
    setClock(a, NOW);
    return { ...setup, dinner };
  }

  test('[SYNC-86.1] sends a checked event again unchanged after an answer was lost, though its stamp is now more than 5 minutes ahead', async () => {
    const { a, b, brisbane, key, dinner } = await checkedThenSetRight(() =>
      loseAnswerTo('POST'),
    );
    expect(await storedEvents(brisbane)).toHaveLength(1);
    const from = mark();

    await sync(a);

    const [again] = await uploads(a, from);
    expect(again.events.map((event) => event.id)).toEqual([dinner.id]);
    expect(await uploadedContent(a, key, again, 0)).toEqual(dinner.content);
    expect(await storedContents(brisbane, key)).toEqual([dinner.content]);
    expect(await unsent(a)).toEqual([]);

    // Less than 10 minutes after its receive time, so every phone applies it (SYNC-9.1).
    await sync(b);
    expect(await titles(b)).toEqual(['Dinner']);
    expect(await refusals(b)).toEqual([]);
  });

  test('[SYNC-86.1] sends a checked event unchanged when its first upload never reached the API', async () => {
    const { a, brisbane, key, dinner } = await checkedThenSetRight(() =>
      noAnswerTo('POST'),
    );
    expect(await storedEvents(brisbane)).toEqual([]);

    await sync(a);

    expect(await storedContents(brisbane, key)).toEqual([dinner.content]);
  });

  test('[SYNC-86.1] keeps a checked stamp across a restart', async () => {
    const { a, brisbane, key, dinner } = await checkedThenSetRight(() =>
      noAnswerTo('POST'),
    );

    const restarted = await restart(a);
    await sync(restarted);

    expect(await storedContents(brisbane, key)).toEqual([dinner.content]);
  });
});

describe('SYNC-87.1', () => {
  test('[SYNC-87.1] checks the events of an upload again when the API refuses it for its clock, and sends them with stamps the corrected time allows', async () => {
    const { a, b, A, brisbane, key } = await twoPhones();
    // As the answer to the download arrives, the clock jumps an hour and Dinner is saved.
    whenAnswered('GET', async () => {
      setClock(a, FAST);
      await addExpense(a);
    });
    const from = mark();

    await sync(a);

    expect(await attempts(a, from, 'POST')).toEqual([
      [String(FAST), 401],
      [String(NOW), 200],
    ]);
    const [refused, accepted] = await uploads(a, from);
    expect((await uploadedContent(a, key, refused, 0))?.stamp).toEqual(
      at(FAST, 0, A),
    );
    expect((await uploadedContent(a, key, accepted, 0))?.stamp).toEqual(
      at(NOW, 0, A),
    );
    expect(accepted.events.map((event) => event.id)).toEqual(
      refused.events.map((event) => event.id),
    );
    expect(await a.sharing.readClockOffsetMs(a.database)).toBe(-HOUR);
    expect(stampsOf(await storedContents(brisbane, key))).toEqual([
      at(NOW, 0, A),
    ]);
    expect(await unsent(a)).toEqual([]);

    await sync(b);
    expect(await titles(b)).toEqual(['Dinner']);
    expect(await refusals(b)).toEqual([]);
  });

  test('[SYNC-87.1] sends the events again as they are when the corrected time allows their stamps', async () => {
    const { a, A, brisbane, key } = await twoPhones();
    await addExpense(a);
    whenAnswered('GET', async () => setClock(a, FAST));
    const from = mark();

    await sync(a);

    expect(await attempts(a, from, 'POST')).toEqual([
      [String(FAST), 401],
      [String(NOW), 200],
    ]);
    const sentUploads = await uploads(a, from);
    expect(
      await Promise.all(
        sentUploads.map(
          async (upload) => (await uploadedContent(a, key, upload, 0))?.stamp,
        ),
      ),
    ).toEqual([at(NOW, 0, A), at(NOW, 0, A)]);
    expect(stampsOf(await storedContents(brisbane, key))).toEqual([
      at(NOW, 0, A),
    ]);
  });

  test('[SYNC-87.1] keeps the events when the upload is refused for its clock a second time', async () => {
    const { a, brisbane } = await twoPhones();
    await addExpense(a);
    const [dinner] = await unsent(a);
    whenAnswered('GET', async () => setClock(a, FAST));
    // The API refuses the first upload itself; the tests refuse the one sent again.
    whenAnswered('POST', async () =>
      answerNext('POST', 401, { error: 'clock', serverTimeMs: NOW + 2 * HOUR }),
    );
    const from = mark();

    await sync(a);

    expect(await uploads(a, from)).toHaveLength(2);
    expect((await unsent(a)).map((event) => event.id)).toEqual([dinner.id]);
    expect(await storedEvents(brisbane)).toEqual([]);
  });
});
