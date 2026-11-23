import {
  CASEY,
  T,
  TAYLOR,
  comeFrom,
  databaseContents,
  expectPassed,
  expectRefused,
  expectRegistered,
  fieldOf,
  newPhone,
  register,
  registered,
  registrationBy,
  send,
  setTime,
  signedBy,
  timesStored,
} from './sharing-api';
import {
  CODE_A,
  CODE_B,
  NO_INVITE,
  WEEK,
  brisbaneInvitesCasey,
  card,
  expectCard,
  expectInvite,
  expectInviteRefused,
  expectRequestAnswered,
  joinRequest,
  putInvite,
  readInvite,
  sendRequest,
  taylorWithBrisbaneAndCasey,
} from './sharing-invites-api';
import {
  BRISBANE,
  TOKYO,
  createGroup,
  expectCreated,
  useSyncApi,
} from './sync-api';
import { DAY, cleanUpAt, valuesAddedSince } from './sync-cleanup-api';

// What the cleanup deletes besides events (ADR-0033): the card of an invite that has
// expired and the join requests under it (ADR-0032), and what the checks of signed
// requests keep about a request and a registration once they can no longer use it
// (ADR-0015, ADR-0022, ADR-0026).

useSyncApi();

describe('SYNC-142.1', () => {
  test('[SYNC-142.1] deletes the card of an invite once the invite has expired, not a millisecond before', async () => {
    const [taylor, casey] = await taylorWithBrisbaneAndCasey();
    const x = card();
    expectInvite(
      await putInvite(taylor, BRISBANE, CODE_A, x),
      CODE_A,
      T + WEEK,
    );

    await cleanUpAt(T + WEEK - 1);
    expect(await timesStored(x)).toBe(1);
    setTime(T + WEEK - 1);
    expectCard(await readInvite(casey, CODE_A), T + WEEK, x);

    await cleanUpAt(T + WEEK);
    expect(await timesStored(x)).toBe(0);
  });

  test('[SYNC-142.1] keeps the code of an invite whose card it deleted as one the API has seen, and lets the group make another invite', async () => {
    const [taylor] = await taylorWithBrisbaneAndCasey();
    expectInvite(
      await putInvite(taylor, BRISBANE, CODE_A, card()),
      CODE_A,
      T + WEEK,
    );
    await cleanUpAt(T + WEEK);

    setTime(T + WEEK);
    const sameCode = await putInvite(taylor, BRISBANE, CODE_A, card());
    const otherCode = await putInvite(taylor, BRISBANE, CODE_B, card());

    expectInviteRefused(sameCode, NO_INVITE);
    expectInvite(otherCode, CODE_B, T + 2 * WEEK);
  });

  test('[SYNC-142.1] leaves an invite that has not expired as it is', async () => {
    const [taylor, casey] = await taylorWithBrisbaneAndCasey();
    expectCreated(await createGroup(casey, TOKYO), TOKYO);
    const x = card();
    const y = card();
    expectInvite(
      await putInvite(taylor, BRISBANE, CODE_A, x),
      CODE_A,
      T + WEEK,
    );
    setTime(T + 3 * DAY);
    expectInvite(
      await putInvite(casey, TOKYO, CODE_B, y),
      CODE_B,
      T + 10 * DAY,
    );

    await cleanUpAt(T + 7 * DAY);

    expect(await timesStored(x)).toBe(0);
    expect(await timesStored(y)).toBe(1);
    setTime(T + 7 * DAY);
    expectCard(await readInvite(taylor, CODE_B), T + 10 * DAY, y);
  });
});

describe('SYNC-151.1', () => {
  test('[SYNC-151.1] deletes the join requests of an invite once the invite has expired, not a millisecond before', async () => {
    const [, casey] = await brisbaneInvitesCasey();
    const other = await registered();
    const p = joinRequest();
    const q = joinRequest();
    expectRequestAnswered(await sendRequest(casey, CODE_A, p), CODE_A);
    setTime(T + DAY);
    expectRequestAnswered(await sendRequest(other, CODE_A, q), CODE_A);

    await cleanUpAt(T + WEEK - 1);
    expect(await timesStored(p)).toBe(1);
    expect(await timesStored(q)).toBe(1);

    await cleanUpAt(T + WEEK);
    expect(await timesStored(p)).toBe(0);
    expect(await timesStored(q)).toBe(0);
  });

  test('[SYNC-151.1] leaves the join requests of an invite that has not expired', async () => {
    const [taylor, casey] = await brisbaneInvitesCasey();
    expectCreated(await createGroup(casey, TOKYO), TOKYO);
    const p = joinRequest();
    const q = joinRequest();
    expectRequestAnswered(await sendRequest(casey, CODE_A, p), CODE_A);
    setTime(T + 3 * DAY);
    expectInvite(
      await putInvite(casey, TOKYO, CODE_B, card()),
      CODE_B,
      T + 10 * DAY,
    );
    expectRequestAnswered(await sendRequest(taylor, CODE_B, q), CODE_B);

    await cleanUpAt(T + 7 * DAY);

    expect(await timesStored(p)).toBe(0);
    expect(await timesStored(q)).toBe(1);
  });

  test('[SYNC-151.1] deletes the join requests of an expired invite after its group made another invite, and leaves those of the new one', async () => {
    const [taylor, casey] = await brisbaneInvitesCasey();
    const p = joinRequest();
    const q = joinRequest();
    expectRequestAnswered(await sendRequest(casey, CODE_A, p), CODE_A);
    setTime(T + WEEK);
    expectInvite(
      await putInvite(taylor, BRISBANE, CODE_B, card()),
      CODE_B,
      T + 2 * WEEK,
    );
    expectRequestAnswered(await sendRequest(casey, CODE_B, q), CODE_B);

    await cleanUpAt(T + WEEK);

    expect(await timesStored(p)).toBe(0);
    expect(await timesStored(q)).toBe(1);
  });
});

describe('SYNC-143.1', () => {
  test('[SYNC-143.1] deletes the record of a request that passed the checks more than 600,000 ms before, whatever its request time, and none that passed exactly that long before', async () => {
    const taylor = await registered(TAYLOR);
    const onTime = signedBy(taylor);
    // Signed by a clock five minutes behind the API's: its request time is no measure.
    const early = signedBy(taylor, { timestampMs: T - 300_000 });
    expectPassed(await send(onTime));
    expectPassed(await send(early));
    const nonces = [onTime, early].map((request) =>
      Buffer.from(fieldOf(request, 'nonce'), 'hex'),
    );

    await cleanUpAt(T + 600_000);
    const kept = [await timesStored(nonces[0]), await timesStored(nonces[1])];

    await cleanUpAt(T + 600_001);
    const left = [await timesStored(nonces[0]), await timesStored(nonces[1])];

    expect(kept).toEqual([1, 1]);
    expect(left).toEqual([0, 0]);
  });

  test('[SYNC-143.1] keeps the record of a request for as long as the same request could pass the clock check again, so that [SHARING-36.1] it is refused as replayed until then', async () => {
    const taylor = await registered(TAYLOR);
    const request = signedBy(taylor, { timestampMs: T + 300_000 });
    expectPassed(await send(request));

    await cleanUpAt(T + 600_000);
    setTime(T + 600_000);
    const whileItCounts = await send(request);

    await cleanUpAt(T + 600_001);
    setTime(T + 600_001);
    const afterwards = await send(request);

    expectRefused(whileItCounts, { error: 'replayed' });
    // Its request time is now more than 300,000 ms from the API's time.
    expectRefused(afterwards, {
      error: 'clock',
      serverTimeMs: T + 600_001,
    });
  });

  test("[SYNC-143.1] leaves [SHARING-37.1] a device's count of requests as it is", async () => {
    // The registration is the first of the 60.
    const taylor = await registered(TAYLOR);
    for (let sent = 1; sent < 60; sent += 1) {
      expectPassed(await send(signedBy(taylor)));
    }

    await cleanUpAt(T + 59_999);
    setTime(T + 59_999);
    const next = await send(signedBy(taylor));

    expectRefused(next, { error: 'too-many-requests', retryAfterMs: 1 });
  });
});

describe('SYNC-144.1', () => {
  test('[SYNC-144.1] deletes what the API kept of a registration an hour after it, not a millisecond before, and keeps the device ID and the public key', async () => {
    const before = await databaseContents();
    const casey = newPhone(CASEY);
    await register(casey);
    const device = [casey.deviceId, `bytes:${casey.publicKey}`];

    // The record of the request is gone by now (SYNC-143.1); the registration's is not.
    await cleanUpAt(T + 3_599_999);
    const anHourLess = await valuesAddedSince(before);
    await cleanUpAt(T + 3_600_000);
    const anHour = await valuesAddedSince(before);

    expect([...anHourLess]).toEqual(expect.arrayContaining(device));
    expect(anHourLess.size).toBeGreaterThan(device.length);
    expect(anHour).toEqual(new Set(device));
    setTime(T + 3_600_000);
    expectPassed(await send(signedBy(casey)));
  });

  test("[SYNC-144.1] leaves [SHARING-41.1] an IP's count of new devices as it is", async () => {
    comeFrom('198.51.100.20');
    for (let devices = 0; devices < 30; devices += 1) {
      await register(newPhone());
    }

    await cleanUpAt(T + 3_599_999);
    setTime(T + 3_599_999);
    const oneMore = await send(registrationBy(newPhone()));

    expectRefused(oneMore, { error: 'too-many-registrations' });
  });

  test('[SYNC-144.1] keeps nothing of a registration again when the device registers once more after it', async () => {
    const before = await databaseContents();
    const casey = newPhone(CASEY);
    await register(casey);
    await cleanUpAt(T + 3_600_000);

    setTime(T + 3_600_000);
    expectRegistered(await send(registrationBy(casey)), casey);

    // Ten minutes on, the record of that request is gone too.
    await cleanUpAt(T + 3_600_000 + 600_001);
    expect(await valuesAddedSince(before)).toEqual(
      new Set([casey.deviceId, `bytes:${casey.publicKey}`]),
    );
  });
});
