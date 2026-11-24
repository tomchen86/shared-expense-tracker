import { Alert } from 'react-native';
import { listCategories } from '../../src/categories';
import {
  listFormerMembers,
  listGroups,
  renameGroup,
  type Group,
} from '../../src/groups';
import { listExpenses } from '../../src/ledger/expenses';
import type { LocalIdentity } from '../../src/shell';
import type { Database } from '../../src/storage';
import { openNodeDatabase } from '../../src/storage/node';
import {
  applySyncEvents,
  listRefusedSyncEvents,
  listUnsentSyncEvents,
  makeReadOnlyCopy,
  readOnlyCopyOf,
  shareGroup,
} from '../../src/sync';
import {
  CANNOT_USE_FILE,
  REPLACE,
  alertsShown,
  chooseFile,
  close,
  dataIn,
  edited,
  exportFrom,
  importFile,
  newPhone,
  nextAlert,
  removePhones,
  replaceMessage,
  resetPhones,
  startOn,
  taylorsExport,
  writeData,
  writeSamsData,
  type Data,
  type Phone,
} from './backup-app';
import { resetPhone } from './ledger-expense-app';
import {
  fakePhoneAppearance,
  fakeReduceTransparency,
  settle,
} from './shell-appearance-app';
import { MINUTE, OTHER, PHONE, at, created, relayed } from './sync-app';

// Export and import on phones that have shared ledgers (ADR-0025). Each test starts the
// whole app on phones of its own, as backup-import.test.tsx does, and exports and imports
// with Export Data and Import Data. While the app is closed, the tests stand in for the
// phone's sync and its first Invite through the sync capability's own functions, as
// sync-app does: they make a group a shared ledger, hand the phone events another phone
// wrote, and read the events it has not uploaded and the ones it did not apply. They
// change a group's name through the groups capability, as Rename Group does.

jest.mock('../../src/storage/expo', () => ({
  openPhoneDatabase: () =>
    jest
      .requireActual<typeof import('./backup-app')>('./backup-app')
      .openPhoneDatabase(),
}));

jest.mock(
  '../../src/storage/expo-files',
  () =>
    jest.requireActual<typeof import('./backup-app')>('./backup-app')
      .phoneFiles,
);

// Not virtual, as in the expense form tests.
jest.mock('expo-localization', () => {
  const phone = () =>
    jest.requireActual<typeof import('./ledger-expense-app')>(
      './ledger-expense-app',
    );
  return {
    ...jest.requireActual<object>('expo-localization'),
    getLocales: () => phone().phoneLocales(),
    getCalendars: () => phone().phoneCalendars(),
    useLocales: () => phone().phoneLocales(),
    useCalendars: () => phone().phoneCalendars(),
  };
});

/** When Brisbane becomes a shared ledger: 2026-11-18 14:32 in Taipei, the backup tests' own time. */
const T = Date.parse('2026-11-18T06:32:00Z');
const HOUR = 60 * MINUTE;
const iso = (ms: number) => new Date(ms).toISOString();

/** Lunch, an expense another phone adds; Taxi, one it adds with an empty title; Dana, a member this phone never gets. */
const LUNCH = 'b0000000-0000-4000-8000-000000000001';
const TAXI = 'b0000000-0000-4000-8000-000000000002';
const DANA = 'd0000000-0000-4000-8000-00000000000d';

let phone: Phone;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  resetPhones();
  resetPhone();
  fakePhoneAppearance('light');
  fakeReduceTransparency(false);
  phone = newPhone();
});

afterEach(async () => {
  jest.restoreAllMocks();
  await removePhones();
});

// The phone while the app is closed

/** Does `work` on the phone's data while the app is closed, with the phone's clock at `ms`. */
async function onPhone<R>(
  on: Phone,
  ms: number,
  work: (database: Database, identity: LocalIdentity) => Promise<R>,
): Promise<R> {
  jest.useFakeTimers();
  jest.setSystemTime(ms);
  let result: R | undefined;
  await writeData(on, {}, async (database, identity) => {
    result = await work(database, identity);
  });
  return result as R;
}

/** Reads the phone's data without the app. */
async function read<R>(on: Phone, query: (database: Database) => Promise<R>) {
  const database = openNodeDatabase(on.database, { readOnly: true });
  try {
    return await query(database);
  } finally {
    await database.close();
  }
}

async function groupNamed(database: Database, name: string): Promise<Group> {
  const group = (await listGroups(database)).find(
    (candidate) => candidate.name === name,
  );
  if (group === undefined) throw new Error(`No group named ${name}`);
  return group;
}

const memberOf = (group: Group, name: string) =>
  group.members.find((member) => member.name === name)!.id;

const unsentOn = (on: Phone) => read(on, listUnsentSyncEvents);
const refusedOn = (on: Phone) => read(on, listRefusedSyncEvents);

/** Renames the group named `from`, and returns the events the phone has not uploaded, in order. */
const renameOn = (on: Phone, ms: number, from: string, to: string) =>
  onPhone(on, ms, async (database) => {
    await renameGroup(database, (await groupNamed(database, from)).id, to);
    return listUnsentSyncEvents(database);
  });

/** The group is a read-only copy on the phone from now on, as after the phone left it. */
const becomesACopy = (on: Phone, group: string, ms = T + MINUTE) =>
  onPhone(on, ms, async (database) =>
    makeReadOnlyCopy(database, (await groupNamed(database, group)).id, 'left'),
  );

/** What makes the group a read-only copy on the phone, if it is one. */
const copyOn = (on: Phone, group: string) =>
  read(on, async (database) =>
    readOnlyCopyOf(database, (await groupNamed(database, group)).id),
  );

/** A phone of Sam's with these groups, the `shared` ones shared ledgers since T under the device `phone-s`. */
async function writeSamsGroups(on: Phone, groups: string[], shared = groups) {
  jest.useFakeTimers();
  jest.setSystemTime(T);
  await writeData(
    on,
    { name: 'Sam', groups: groups.map((name) => ({ name })) },
    async (database) => {
      for (const name of shared) {
        const { id } = await groupNamed(database, name);
        await shareGroup(database, { groupId: id, device: 'phone-s' });
      }
    },
  );
}

/**
 * Starts the app on the phone and picks `file` with Import Data: the alert the app
 * answers with, and its message as written, apart from the space before AM or PM.
 */
async function chooseOn(on: Phone, file: string, ms = T + 4 * MINUTE) {
  const app = await startOn(on, { now: iso(ms) });
  const before = alertsShown().length;
  await chooseFile(file);
  const alert = await nextAlert(before + 1);
  const written = (
    jest.mocked(Alert.alert).mock.calls.at(-1)?.[1] ?? ''
  ).replace(/[\u202f\u00a0]/g, ' ');
  await close(app);
  return { alert, written };
}

const LEAVE_FIRST = 'Leave Shared Groups First';
const leaveFirst = (...groups: string[]) =>
  groups.length === 1
    ? `This phone is still a member of ${groups[0]}, and this file would remove that group from it. Leave the group first, then import the file again.`
    : `This phone is still a member of ${groups.slice(0, -1).join(', ')} and ${groups.at(-1)}, and this file would remove those groups from it. Leave them first, then import the file again.`;

/** What the confirmation adds about changes an import would lose. */
const lost = (count: number) =>
  count === 1
    ? "1 change in your shared groups hasn't been sent yet and will be lost. To send it first, tap Cancel, connect to the internet, and open the app again."
    : `${count} changes in your shared groups haven't been sent yet and will be lost. To send them first, tap Cancel, connect to the internet, and open the app again.`;

/**
 * Taylor's phone, device `phone-a`: Brisbane with Casey and Blake, which becomes a
 * shared ledger at T, and Tokyo, which does not.
 */
async function writeSharedBrisbane(on: Phone) {
  jest.useFakeTimers();
  jest.setSystemTime(T);
  await writeData(
    on,
    {
      name: 'Taylor',
      groups: [
        { name: 'Brisbane', members: ['Casey', 'Blake'] },
        { name: 'Tokyo' },
      ],
    },
    async (database) => {
      const { id } = await groupNamed(database, 'Brisbane');
      await shareGroup(database, { groupId: id, device: PHONE });
    },
  );
}

/**
 * Lunch for 30.00 in Brisbane as another phone adds it: Casey pays and Taylor and
 * Casey share it, unless `payer` and `sharer` name someone else in Casey's place.
 * `group` is what Brisbane is called by then.
 */
async function lunchUnits(
  database: Database,
  {
    payer,
    sharer,
    group = 'Brisbane',
  }: { payer?: string; sharer?: string; group?: string } = {},
) {
  const brisbane = await groupNamed(database, group);
  const casey = memberOf(brisbane, 'Casey');
  const food = (await listCategories(database, brisbane.id)).find(
    (category) => category.name === 'Food & Dining',
  )!;
  return {
    title: 'Lunch',
    date: '2026-11-18',
    note: null,
    category: { id: food.id, name: food.name, color: food.color },
    money: {
      amountMinor: 3000,
      currency: 'USD',
      payments: [{ participant: payer ?? casey, amountMinor: 3000 }],
      shares: [
        { participant: memberOf(brisbane, 'Taylor'), amountMinor: 1500 },
        { participant: sharer ?? casey, amountMinor: 1500 },
      ],
    },
    trashed: false,
  };
}

/** Hands the phone these events for Brisbane, in this order, in one go. */
const receiveOn = (
  on: Phone,
  ms: number,
  events: (database: Database) => Promise<ReturnType<typeof relayed>[]>,
) =>
  onPhone(on, ms, async (database) => {
    const { id } = await groupNamed(database, 'Brisbane');
    await applySyncEvents(database, id, await events(database));
  });

/** Lunch as stored on the phone, with who paid and who shares it. */
const lunchOn = (on: Phone) =>
  read(on, async (database) =>
    (await listExpenses(database)).find((expense) => expense.id === LUNCH),
  );

/** `data` without the one row an import does not copy: the latest stamp the phone has seen (BACKUP-27.1). */
function exceptLatestStamp(data: Data): Data {
  const rest = { ...data };
  delete rest.sync_clock;
  return rest;
}

/** Starts the app on the phone, imports `file` with Import Data, and closes the app. */
async function importOn(on: Phone, file: string, ms = T + 2 * MINUTE) {
  const app = await startOn(on, { now: iso(ms) });
  await importFile(file);
  await close(app);
}

// A shared ledger's expense paid and shared by someone who is no member (#190)

/**
 * Taylor's phone after it applied two events of another phone: Dana's first event,
 * stamped an hour after it was received and so refused (SYNC-9.1), and Lunch, which
 * Dana pays and shares with Taylor, applied all the same (SYNC-31.2). Exported at
 * 14:34.
 */
async function exportNamingSomeoneWhoIsNoMember() {
  const taylors = newPhone();
  await writeSharedBrisbane(taylors);
  await receiveOn(taylors, T + MINUTE, async (database) => [
    relayed(
      created('member', DANA, at(T + HOUR + MINUTE), {
        name: 'Dana',
        removed: false,
      }),
      { receivedAtMs: T + MINUTE },
    ),
    relayed(
      created(
        'expense',
        LUNCH,
        at(T + MINUTE, 1),
        await lunchUnits(database, { payer: DANA, sharer: DANA }),
      ),
    ),
  ]);
  const exported = await exportFrom(taylors, iso(T + 2 * MINUTE));
  return { taylors, ...exported };
}

/** Lunch is paid by Dana and shared by Taylor and Dana, and Dana is no member or former member of Brisbane. */
async function expectLunchNamesSomeoneWhoIsNoMember(on: Phone) {
  const brisbane = await read(on, (database) =>
    groupNamed(database, 'Brisbane'),
  );
  const former = await read(on, (database) =>
    listFormerMembers(database, brisbane.id),
  );
  expect(
    [...brisbane.members, ...former].map((member) => member.id),
  ).not.toContain(DANA);
  expect(await lunchOn(on)).toMatchObject({
    spaceId: brisbane.id,
    payments: [{ participant: DANA, amountMinor: 3000 }],
    shares: [
      { participant: memberOf(brisbane, 'Taylor'), amountMinor: 1500 },
      { participant: DANA, amountMinor: 1500 },
    ],
  });
}

const EXPORTED_AT_1434 = replaceMessage(
  'Nov 18, 2026 at 2:34 PM',
  '2 groups',
  '1 expense',
);

test('[BACKUP-16.2] imports, on the phone that exported it, the file of a phone that applied a shared ledger expense paid and shared by someone who is no member', async () => {
  const { taylors, file, data } = await exportNamingSomeoneWhoIsNoMember();
  expect(await refusedOn(taylors)).toMatchObject([
    { id: expect.any(String), device: OTHER, reason: 'clock' },
  ]);
  await expectLunchNamesSomeoneWhoIsNoMember(taylors);

  await importOn(taylors, file);

  expect(alertsShown()).toEqual([[REPLACE, EXPORTED_AT_1434]]);
  expect(dataIn(taylors.database)).toEqual(data);
  await expectLunchNamesSomeoneWhoIsNoMember(taylors);
});

test('[BACKUP-16.2] imports that file on a new phone, with the expense still paid and shared by someone who is no member', async () => {
  const { file, data } = await exportNamingSomeoneWhoIsNoMember();

  await importOn(phone, file);

  expect(alertsShown()).toEqual([[REPLACE, EXPORTED_AT_1434]]);
  expect(dataIn(phone.database)).toEqual(data);
  await expectLunchNamesSomeoneWhoIsNoMember(phone);
});

test("[BACKUP-16.2] asks to replace for a file edited so that a shared ledger's expense is paid by someone who is no member", async () => {
  const taylors = newPhone();
  await writeSharedBrisbane(taylors);
  await receiveOn(taylors, T + MINUTE, async (database) => [
    relayed(
      created('expense', LUNCH, at(T + MINUTE), await lunchUnits(database)),
    ),
  ]);
  const { file } = await exportFrom(taylors, iso(T + 2 * MINUTE));
  await startOn(phone);

  await chooseFile(
    edited(
      file,
      `UPDATE expense_payments SET participant = 'stranger' WHERE expenseId = '${LUNCH}'`,
    ),
  );

  expect((await nextAlert(1))[0]).toBe(REPLACE);
});

/** Edits to that file that break another rule in the shared ledger's expense. */
const STILL_AGAINST_THE_RULES: [string, string][] = [
  [
    'shares that add up to less than the amount',
    `UPDATE expense_shares SET amountMinor = 1400 WHERE expenseId = '${LUNCH}' AND participant = '${DANA}'`,
  ],
  [
    'a payment larger than the amount',
    `UPDATE expense_payments SET amountMinor = 3001 WHERE expenseId = '${LUNCH}'`,
  ],
  [
    'a currency that is not supported',
    `UPDATE expenses SET currency = 'XYZ' WHERE id = '${LUNCH}'`,
  ],
  [
    'a date that does not exist',
    `UPDATE expenses SET date = '2025-02-30' WHERE id = '${LUNCH}'`,
  ],
];

test.each(STILL_AGAINST_THE_RULES)(
  "[BACKUP-16.2] writes nothing and says the file cannot be used for a shared ledger's expense with %s",
  async (_what, sql) => {
    const { file } = await exportNamingSomeoneWhoIsNoMember();
    await writeSamsData(phone);
    await startOn(phone);
    const before = dataIn(phone.database);

    await chooseFile(edited(file, sql));

    expect(await nextAlert(1)).toEqual(CANNOT_USE_FILE);
    await settle();
    expect(alertsShown()).toEqual([CANNOT_USE_FILE]);
    expect(dataIn(phone.database)).toEqual(before);
  },
);

/** Edits that name someone who is no member outside the file's shared ledger. */
const OUTSIDE_THE_SHARED_LEDGER: [string, string][] = [
  [
    'an expense of a group that is not a shared ledger paid by someone who is not a member of it',
    "UPDATE expense_payments SET participant = 'stranger' WHERE expenseId = (SELECT id FROM expenses WHERE title = 'Sushi')",
  ],
  [
    'an expense of a group that is not a shared ledger shared by a member of the shared ledger',
    "UPDATE expense_shares SET participant = (SELECT id FROM group_members WHERE name = 'Casey') WHERE expenseId = (SELECT id FROM expenses WHERE title = 'Sushi')",
  ],
  [
    'a personal expense shared by someone who is not the personal participant',
    "UPDATE expense_shares SET participant = 'stranger' WHERE expenseId = (SELECT id FROM expenses WHERE title = 'Coffee run')",
  ],
];

test.each(OUTSIDE_THE_SHARED_LEDGER)(
  '[BACKUP-16.2] writes nothing and says the file cannot be used when a file with a shared ledger has %s',
  async (_what, sql) => {
    const taylors = newPhone();
    jest.useFakeTimers();
    jest.setSystemTime(T);
    await writeData(
      taylors,
      {
        name: 'Taylor',
        groups: [
          { name: 'Brisbane', members: ['Casey', 'Blake'] },
          { name: 'Tokyo' },
        ],
        expenses: [
          { title: 'Coffee run', amount: '8.75', date: '2026-11-10' },
          { title: 'Sushi', amount: '40', date: '2026-11-11', group: 'Tokyo' },
          {
            title: 'Dinner',
            amount: '100.01',
            date: '2026-11-12',
            group: 'Brisbane',
            paidBy: 'Casey',
          },
        ],
      },
      async (database) => {
        const { id } = await groupNamed(database, 'Brisbane');
        await shareGroup(database, { groupId: id, device: PHONE });
      },
    );
    const { file } = await exportFrom(taylors);
    await writeSamsData(phone);
    await startOn(phone);
    const before = dataIn(phone.database);

    await chooseFile(edited(file, sql));

    expect(await nextAlert(1)).toEqual(CANNOT_USE_FILE);
    await settle();
    expect(alertsShown()).toEqual([CANNOT_USE_FILE]);
    expect(dataIn(phone.database)).toEqual(before);
  },
);

// The sync data goes back to the export

/**
 * Taylor's phone renames Brisbane to Brissie, applies Lunch and refuses Taxi for its
 * empty title, and exports. After the export it renames the group to Sydney and
 * refuses another event.
 */
async function exportThenChangeTheSharedLedgers() {
  const taylors = newPhone();
  await writeSharedBrisbane(taylors);
  await renameOn(taylors, T + MINUTE, 'Brisbane', 'Brissie');
  const emptyTitle = async (
    database: Database,
    id: string,
    counter: number,
    group: string,
  ) =>
    relayed(
      created('expense', id, at(T + MINUTE, counter), {
        ...(await lunchUnits(database, { group })),
        title: '',
      }),
    );
  await onPhone(taylors, T + MINUTE, async (database) => {
    const { id } = await groupNamed(database, 'Brissie');
    await applySyncEvents(database, id, [
      relayed(
        created(
          'expense',
          LUNCH,
          at(T + MINUTE),
          await lunchUnits(database, { group: 'Brissie' }),
        ),
      ),
      await emptyTitle(database, TAXI, 1, 'Brissie'),
    ]);
  });
  const atExport = {
    unsent: await unsentOn(taylors),
    refused: await refusedOn(taylors),
    brisbane: (
      await read(taylors, (database) => groupNamed(database, 'Brissie'))
    ).id,
  };
  const exported = await exportFrom(taylors, iso(T + 2 * MINUTE));

  await renameOn(taylors, T + 3 * MINUTE, 'Brissie', 'Sydney');
  await onPhone(taylors, T + 3 * MINUTE, async (database) => {
    await applySyncEvents(database, atExport.brisbane, [
      await emptyTitle(
        database,
        'b0000000-0000-4000-8000-000000000003',
        2,
        'Sydney',
      ),
    ]);
  });
  return { taylors, atExport, ...exported };
}

test('[BACKUP-13.3] takes the shared ledgers, the unsent events and the refused events of a phone back to what its export file holds', async () => {
  const { taylors, atExport, file, data } =
    await exportThenChangeTheSharedLedgers();
  expect(atExport.unsent).toHaveLength(1);
  expect(atExport.refused).toHaveLength(1);
  expect(await unsentOn(taylors)).toHaveLength(2);
  expect(await refusedOn(taylors)).toHaveLength(2);

  await importOn(taylors, file, T + 4 * MINUTE);

  expect(await unsentOn(taylors)).toEqual(atExport.unsent);
  expect(await refusedOn(taylors)).toEqual(atExport.refused);
  expect(
    (await read(taylors, listGroups)).map(({ name, shared }) => [name, shared]),
  ).toEqual([
    ['Brissie', true],
    ['Tokyo', false],
  ]);
  expect(await lunchOn(taylors)).toMatchObject({ title: 'Lunch' });
  expect(exceptLatestStamp(dataIn(taylors.database))).toEqual(
    exceptLatestStamp(data),
  );

  // Tokyo is no shared ledger, and Brissie's name has the stamp the file gave it.
  await renameOn(taylors, T + 5 * MINUTE, 'Tokyo', 'Kyoto');
  const events = await renameOn(taylors, T + 5 * MINUTE, 'Brissie', 'Cairns');
  expect(events.slice(0, 1)).toEqual(atExport.unsent);
  expect(events).toHaveLength(2);
  expect(events[1]).toMatchObject({
    groupId: atExport.brisbane,
    content: {
      type: 'group',
      id: atExport.brisbane,
      units: {
        name: { value: 'Cairns', base: atExport.unsent[0].content.stamp },
      },
    },
  });
});

// A phone whose local data is new, as after the app was installed again. These phones
// have no device identity, so an import leaves none of them with a lapsed authorization
// (BACKUP-29.1 has its own file).
test("[BACKUP-13.3] gives a phone whose local data is new the exporting phone's shared ledgers, unsent events and refused events, and the device ID it stamps with", async () => {
  const { atExport, file, data } = await exportThenChangeTheSharedLedgers();

  await importOn(phone, file, T + 4 * MINUTE);

  expect(dataIn(phone.database)).toEqual(data);
  expect(await unsentOn(phone)).toEqual(atExport.unsent);
  expect(await refusedOn(phone)).toEqual(atExport.refused);

  const events = await renameOn(phone, T + 5 * MINUTE, 'Brissie', 'Cairns');
  expect(events).toHaveLength(2);
  expect(events[1]).toMatchObject({
    groupId: atExport.brisbane,
    content: {
      stamp: { ms: T + 5 * MINUTE, counter: 0, device: PHONE },
      units: {
        name: { value: 'Cairns', base: atExport.unsent[0].content.stamp },
      },
    },
  });
});

// The latest stamp the phone has seen does not go back

/** Hands the phone Lunch, stamped five minutes ahead of the phone's clock at T+1 minute. */
const receiveLunchStampedAhead = (on: Phone) =>
  receiveOn(on, T + MINUTE, async (database) => [
    relayed(
      created('expense', LUNCH, at(T + 6 * MINUTE), await lunchUnits(database)),
      { receivedAtMs: T + MINUTE },
    ),
  ]);

test('[BACKUP-27.1] stamps a change made after an import later than the changes the phone wrote before it', async () => {
  const taylors = newPhone();
  await writeSharedBrisbane(taylors);
  const { file } = await exportFrom(taylors, iso(T + MINUTE));
  await receiveLunchStampedAhead(taylors);
  const before = await renameOn(taylors, T + MINUTE, 'Brisbane', 'Brissie');
  expect(before.map((event) => event.content.stamp)).toEqual([
    { ms: T + 6 * MINUTE, counter: 1, device: PHONE },
  ]);

  await importOn(taylors, file);

  const events = await renameOn(taylors, T + 2 * MINUTE, 'Brisbane', 'Sydney');
  expect(events).toHaveLength(1);
  expect(events[0].content).toMatchObject({
    stamp: { ms: T + 6 * MINUTE, counter: 2, device: PHONE },
    units: {
      name: {
        value: 'Sydney',
        base: { ms: T, counter: expect.any(Number), device: PHONE },
      },
    },
  });
});

test("[BACKUP-27.1] follows the file's latest stamp on a phone whose local data is new", async () => {
  const taylors = newPhone();
  await writeSharedBrisbane(taylors);
  await receiveLunchStampedAhead(taylors);
  const { file } = await exportFrom(taylors, iso(T + MINUTE));

  await importOn(phone, file);

  const events = await renameOn(phone, T + 2 * MINUTE, 'Brisbane', 'Sydney');
  expect(events.map((event) => event.content.stamp)).toEqual([
    { ms: T + 6 * MINUTE, counter: 1, device: PHONE },
  ]);
});

/** Makes the imported Brisbane a shared ledger at T+2 minutes and renames it; the event it writes. */
async function shareAndRenameBrisbane(on: Phone) {
  await onPhone(on, T + 2 * MINUTE, async (database) => {
    const { id } = await groupNamed(database, 'Brisbane');
    await shareGroup(database, { groupId: id, device: PHONE });
  });
  const events = await renameOn(on, T + 2 * MINUTE, 'Brisbane', 'Sydney');
  expect(events).toHaveLength(1);
  return events[0].content;
}

test('[BACKUP-27.1] keeps the latest stamp the phone has seen when the file has no shared ledger', async () => {
  const { file } = await taylorsExport();
  const taylors = newPhone();
  await writeSharedBrisbane(taylors);
  await receiveLunchStampedAhead(taylors);
  await renameOn(taylors, T + MINUTE, 'Brisbane', 'Brissie');
  // The phone is no longer in Brissie, or the import would be refused (BACKUP-28.1).
  await becomesACopy(taylors, 'Brissie');

  await importOn(taylors, file);

  expect(await unsentOn(taylors)).toEqual([]);
  expect(await shareAndRenameBrisbane(taylors)).toMatchObject({
    stamp: { ms: T + 6 * MINUTE, device: PHONE },
    units: { name: { base: { ms: T + 6 * MINUTE, device: PHONE } } },
  });
});

test('[BACKUP-27.1] has no latest stamp after an import when neither the phone nor the file had one', async () => {
  const { file } = await taylorsExport();

  await importOn(phone, file);

  expect(await shareAndRenameBrisbane(phone)).toMatchObject({
    stamp: { ms: T + 2 * MINUTE, device: PHONE },
    units: { name: { base: { ms: T + 2 * MINUTE, device: PHONE } } },
  });
});

// A copy in the file stays a copy

test('[BACKUP-13.3] keeps a read-only copy of the export file a read-only copy, for the same reason', async () => {
  const taylors = newPhone();
  await writeSharedBrisbane(taylors);
  await onPhone(taylors, T + MINUTE, async (database) =>
    makeReadOnlyCopy(
      database,
      (await groupNamed(database, 'Brisbane')).id,
      'not-a-member',
    ),
  );
  const { file } = await exportFrom(taylors, iso(T + 2 * MINUTE));

  await importOn(taylors, file);

  expect(await copyOn(taylors, 'Brisbane')).toEqual({
    reason: 'not-a-member',
    unsent: 0,
  });
});

// An import that would take a shared ledger the phone is in

test('[BACKUP-28.1] refuses a file from before the phone shared a group it is in, and names the group', async () => {
  const taylors = newPhone();
  await writeSharedBrisbane(taylors);
  const { file } = await exportFrom(taylors, iso(T + MINUTE));
  await onPhone(taylors, T + 2 * MINUTE, async (database) => {
    const tokyo = await groupNamed(database, 'Tokyo');
    await shareGroup(database, { groupId: tokyo.id, device: PHONE });
  });
  const before = dataIn(taylors.database);

  const { alert } = await chooseOn(taylors, file);

  expect(alert).toEqual([LEAVE_FIRST, leaveFirst('Tokyo')]);
  expect(alertsShown()).toHaveLength(1);
  expect(dataIn(taylors.database)).toEqual(before);
});

test("[BACKUP-28.1] refuses another phone's file on a phone that is in a shared ledger of its own", async () => {
  const taylors = newPhone();
  await writeSharedBrisbane(taylors);
  const { file } = await exportFrom(taylors, iso(T + MINUTE));
  await writeSamsGroups(phone, ['Osaka']);
  const before = dataIn(phone.database);

  const { alert } = await chooseOn(phone, file);

  expect(alert).toEqual([LEAVE_FIRST, leaveFirst('Osaka')]);
  expect(dataIn(phone.database)).toEqual(before);
});

test('[BACKUP-28.1] refuses a file in which the shared ledger the phone is in belongs to another device', async () => {
  const taylors = newPhone();
  jest.useFakeTimers();
  jest.setSystemTime(T);
  await writeData(taylors, {
    name: 'Taylor',
    groups: [{ name: 'Brisbane', members: ['Casey', 'Blake'] }],
  });
  const unshared = await exportFrom(taylors, iso(T + MINUTE));
  await onPhone(taylors, T + MINUTE, async (database) => {
    const { id } = await groupNamed(database, 'Brisbane');
    await shareGroup(database, { groupId: id, device: PHONE });
  });
  const { file } = await exportFrom(taylors, iso(T + 2 * MINUTE));
  // Casey's phone has the same group, and is in it as another device.
  await importOn(phone, unshared.file);
  await onPhone(phone, T + 3 * MINUTE, async (database) => {
    const { id } = await groupNamed(database, 'Brisbane');
    await shareGroup(database, { groupId: id, device: OTHER });
  });
  jest.mocked(Alert.alert).mockClear();

  const { alert } = await chooseOn(phone, file);

  expect(alert).toEqual([LEAVE_FIRST, leaveFirst('Brisbane')]);
});

test.each([
  [['Osaka', 'Kyoto', 'Nara'], leaveFirst('Osaka', 'Kyoto', 'Nara')],
  [['Osaka', 'Nara'], leaveFirst('Osaka', 'Nara')],
])(
  '[BACKUP-28.1] names every shared ledger the import would take, in the order the phone created them: %s',
  async (shared, message) => {
    const { file } = await taylorsExport();
    await writeSamsGroups(phone, ['Osaka', 'Kyoto', 'Nara'], shared);

    const { alert } = await chooseOn(phone, file);

    expect(alert).toEqual([LEAVE_FIRST, message]);
  },
);

test('[BACKUP-28.1] refuses a file in which the shared ledger the phone is in is a read-only copy', async () => {
  const taylors = newPhone();
  await writeSharedBrisbane(taylors);
  const inIt = await exportFrom(taylors, iso(T + MINUTE));
  await becomesACopy(taylors, 'Brisbane');
  const asACopy = await exportFrom(taylors, iso(T + 2 * MINUTE));
  // The phone is in Brisbane again.
  await importOn(taylors, inIt.file);
  jest.mocked(Alert.alert).mockClear();

  const { alert } = await chooseOn(taylors, asACopy.file);

  expect(alert).toEqual([LEAVE_FIRST, leaveFirst('Brisbane')]);
});

test('[BACKUP-28.1] asks to replace the data when the phone picks its own file, whose shared ledgers it is still in', async () => {
  const taylors = newPhone();
  await writeSharedBrisbane(taylors);
  const { file } = await exportFrom(taylors, iso(T + MINUTE));
  await onPhone(taylors, T + 2 * MINUTE, async (database) => {
    await renameGroup(
      database,
      (await groupNamed(database, 'Tokyo')).id,
      'Kyoto',
    );
  });

  const { alert } = await chooseOn(taylors, file);

  expect(alert[0]).toBe(REPLACE);
});

test('[BACKUP-28.1] lets a phone import over a read-only copy', async () => {
  const { file } = await taylorsExport();
  await writeSamsGroups(phone, ['Osaka']);
  await becomesACopy(phone, 'Osaka');

  const { alert } = await chooseOn(phone, file);

  expect(alert[0]).toBe(REPLACE);
});

// What the confirmation says about changes that were never sent

const EXPORTED_AT_1433 = replaceMessage(
  'Nov 18, 2026 at 2:33 PM',
  '2 groups',
  '0 expenses',
);

test.each([
  [1, ['Brissie']],
  [3, ['Bris', 'Brissie', 'Sydney']],
])(
  '[BACKUP-11.2] says in the confirmation how many unsent changes the import would lose, and how to send them first: %s',
  async (count, names) => {
    const taylors = newPhone();
    await writeSharedBrisbane(taylors);
    const { file } = await exportFrom(taylors, iso(T + MINUTE));
    let name = 'Brisbane';
    for (const next of names) {
      await renameOn(taylors, T + 2 * MINUTE, name, next);
      name = next;
    }
    expect(await unsentOn(taylors)).toHaveLength(count);

    const { alert, written } = await chooseOn(taylors, file);

    expect(alert[0]).toBe(REPLACE);
    expect(written).toBe(`${EXPORTED_AT_1433}\n\n${lost(count)}`);
  },
);

test('[BACKUP-11.2] does not count an unsent change that the export file holds too', async () => {
  const taylors = newPhone();
  await writeSharedBrisbane(taylors);
  await renameOn(taylors, T + MINUTE, 'Brisbane', 'Brissie');
  const { file } = await exportFrom(taylors, iso(T + MINUTE));
  expect(await unsentOn(taylors)).toHaveLength(1);
  await renameOn(taylors, T + 2 * MINUTE, 'Brissie', 'Sydney');

  const { written } = await chooseOn(taylors, file);

  expect(written).toBe(`${EXPORTED_AT_1433}\n\n${lost(1)}`);
});

test('[BACKUP-11.2] does not count the unsent changes of a read-only copy', async () => {
  const { file } = await taylorsExport();
  const taylors = newPhone();
  await writeSharedBrisbane(taylors);
  await renameOn(taylors, T + MINUTE, 'Brisbane', 'Brissie');
  await becomesACopy(taylors, 'Brissie');

  const { alert } = await chooseOn(taylors, file);

  expect(alert).toEqual([
    REPLACE,
    replaceMessage('Nov 18, 2026 at 2:32 PM', '2 groups', '3 expenses'),
  ]);
});
