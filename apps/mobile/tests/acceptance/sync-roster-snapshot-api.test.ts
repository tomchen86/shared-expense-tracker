import type { SyncStamp } from '@shared-expense/domain';
import {
  NOW,
  memberIds,
  randomId,
  setClock,
  sync,
  twoPhones,
  type Phone,
} from './sync-loop-app';
import {
  contentFor,
  endSnapshotWorld,
  newcomer,
  sentSnapshot,
  startSnapshotWorld,
  takeSnapshot,
} from './sync-snapshot-app';

// Runs in Node against the real API (sync-loop-app, sync-snapshot-app): a snapshot carries
// the roster of its shared ledger, and the phone that takes it in gives each member the
// user ID the roster has for them (ADR-0039).

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

jest.mock('../../src/storage/expo', () => ({}));
jest.mock('../../src/storage/expo-files', () => ({}));

beforeEach(startSnapshotWorld);
afterEach(endSnapshotWorld);

const BOX_KEY =
  'bc908a559c76aef30842db38b5e1844f63847c087cf94b793fe477da10d44e75';

/** A roster entry's first event: `device` represents `memberId`, for the user `userId`. */
const entry = (
  device: string,
  memberId: string,
  userId: string,
  ms: number,
) => ({
  version: 1,
  stamp: { ms, counter: 0, device } satisfies SyncStamp,
  type: 'device',
  id: device,
  units: { member: { value: { memberId, userId, boxKey: BOX_KEY } } },
});

/** Hands the phone events as the API would relay them, each uploaded by the device its stamp names. */
async function apply(phone: Phone, ...contents: ReturnType<typeof entry>[]) {
  setClock(phone, phone.state.clockMs);
  await phone.sync.applySyncEvents(
    phone.database,
    phone.brisbane,
    contents.map((content) => ({
      id: randomId(),
      device: content.stamp.device,
      receivedAtMs: content.stamp.ms,
      content: content as never,
    })),
  );
}

const userIds = async (phone: Phone) =>
  Object.fromEntries(
    (
      (await phone.groups.listGroups(phone.database)).find(
        (group) => group.id === phone.brisbane,
      )?.members ?? []
    ).map(({ name, userId }) => [name, userId]),
  );

test('[SYNC-114.3] a snapshot holds the roster entries of its shared ledger', async () => {
  const setup = await twoPhones();
  const { a, key } = setup;
  const { Casey } = await memberIds(a);
  await apply(a, entry('phone-x', Casey, 'user-x', NOW));
  const riley = await newcomer(setup);

  await sentSnapshot(a, riley);

  expect((await contentFor(riley, key)).records).toContainEqual({
    type: 'device',
    id: 'phone-x',
    units: {
      member: {
        value: { memberId: Casey, userId: 'user-x', boxKey: BOX_KEY },
        stamp: { ms: NOW, counter: 0, device: 'phone-x' },
      },
    },
    created: { ms: NOW, counter: 0, device: 'phone-x' },
    seeded: false,
  });
});

test('[SYNC-125.2] a phone that takes a snapshot in gives each member the user ID its roster has, and none to the others', async () => {
  const setup = await twoPhones();
  const { a } = setup;
  const { Casey } = await memberIds(a);
  await apply(a, entry('phone-x', Casey, 'user-x', NOW));
  const riley = await newcomer(setup);
  await sentSnapshot(a, riley);

  expect(await takeSnapshot(riley)).toEqual({ outcome: 'imported' });

  expect(await userIds(riley)).toEqual({
    Taylor: null,
    Casey: 'user-x',
    Blake: null,
  });
});

test('[SYNC-127.2] a phone that has the ledger follows the roster a snapshot brings, and keeps the rest', async () => {
  const setup = await twoPhones();
  const { a, b, B } = setup;
  const { Casey } = await memberIds(a);
  const before = await userIds(b);
  await apply(a, entry('phone-x', Casey, 'user-x', NOW));
  await sync(a);
  await sentSnapshot(a, B);

  expect(await takeSnapshot(b)).toEqual({ outcome: 'imported' });

  expect(await userIds(b)).toEqual({ ...before, Casey: 'user-x' });
});

test('[SYNC-127.2] a snapshot with no roster entry leaves every user ID as it was', async () => {
  const setup = await twoPhones();
  const { a, b, B } = setup;
  const before = await userIds(b);
  await sentSnapshot(a, B);

  expect(await takeSnapshot(b)).toEqual({ outcome: 'imported' });

  expect(await userIds(b)).toEqual(before);
});
