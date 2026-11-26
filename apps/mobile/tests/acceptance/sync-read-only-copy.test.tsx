import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react-native';
import { readOnlyCopyOf } from '../../src/sync';
import {
  NO_ARCHIVED,
  READ_ONLY,
  contentButton,
  contentButtons,
  openArchivedGroup,
  openArchivedGroups,
} from './group-archive-app';
import {
  NO_EXPENSES,
  addMember,
  alertsShown,
  barItems,
  expectMembers,
  goBackFrom,
  isOpen,
  lastAlertButtonStyles,
  longPressLargeTitle,
  openGroup,
  openMembers,
  pressAlertButton,
  textsOn,
} from './group-details-app';
import {
  fillForm,
  formTitle,
  openEditExpense,
  openNewExpense,
  press,
  restart,
  titleField,
} from './ledger-expense-app';
import {
  detailLines,
  linesIn,
  openDetails,
  shownInOrder,
} from './ledger-expense-list-app';
import {
  SHARED_HISTORY,
  archiveGroup,
  deleteFromGroup,
  editOn,
  groupAddButton,
  isDisabled,
  listOptions,
  openRow,
  restoreGroup,
  setSplit,
} from './ledger-group-expense-app';
import {
  goOffline,
  goOnline,
  mistakes,
  removeSecureStoreEntry,
  removeWorld,
  resetWorld,
  secureStoreEntries,
} from './sharing-app';
import { startDecisionApi, syncs } from './sharing-decision-app';
import {
  LAPSED_BANNER,
  NO_MEMBER_BANNER,
  READ_ONLY_COPY,
  TAKEN_OVER_BANNER,
  neverSent,
  startRemovalApi,
  thisPhoneIsRemoved,
  thisPhoneIsTakenOver,
} from './sharing-removal-app';
import { expenseScreen, openTrash, openTrashed } from './ledger-trash-app';
import {
  allowWrites,
  failWrites,
  holdWrites,
  settle,
} from './shell-appearance-app';
import { tapTab } from './shell-tabs-app';
import {
  LATER,
  YOU,
  appDatabase,
  categoriesLines,
  created,
  eachTestGetsAPhone,
  everything,
  expenseTitled,
  groupId,
  leaveMembers,
  members,
  openGroupCategories,
  receiveEvents,
  relayed,
  showMembers,
  unsent,
} from './sync-app';
import {
  deviceId,
  eventRequests,
  lunchCreated,
  mark,
  otherPhoneUploads,
  startEventApi,
  startSynced,
} from './sync-screens-app';
import { HOUR, notAppliedCount, unapplied } from './sync-unapplied-app';

// Runs on iOS. Each test starts the whole app with Taylor saved as your name and Brisbane's
// members Taylor, Casey and Blake, a shared ledger that syncs (sync-screens-app). Then the
// phone loses its access: the API stops counting it among Brisbane's member devices, or
// its seed is gone. The tests look at what is left on the phone: a read-only copy
// (ADR-0041).

jest.mock('../../src/storage/expo', () => ({
  openPhoneDatabase: async () =>
    jest.requireActual<typeof import('./sync-app')>('./sync-app').openPhone(),
}));

// Not virtual, as in ledger-expense-form.test.tsx.
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

jest.mock(
  'expo-secure-store',
  () =>
    jest.requireActual<typeof import('./sharing-app')>('./sharing-app')
      .secureStore,
  { virtual: true },
);

jest.mock(
  'expo-crypto',
  () =>
    jest.requireActual<typeof import('./sharing-app')>('./sharing-app')
      .randomSource,
  { virtual: true },
);

jest.mock('../../src/sharing/api-address', () => ({
  apiUrl: () =>
    jest
      .requireActual<typeof import('./sync-screens-app')>('./sync-screens-app')
      .builtApiUrl(),
}));

eachTestGetsAPhone('sync-read-only-copy-');

beforeEach(() => {
  resetWorld();
  startEventApi();
  startDecisionApi();
  startRemovalApi();
});

afterEach(async () => {
  const wrong = mistakes();
  await removeWorld();
  expect(wrong).toEqual([]);
});

const GROUPS = { Brisbane: ['Casey', 'Blake'], Tokyo: [] };
const NO_CHANGE =
  "This group is a read-only copy. Its expenses can't be changed.";
const HISTORY_OF_A_COPY =
  'Payments and shares are preserved as read-only history.';
const CATEGORIES_OF_A_COPY = 'Read-only copy. Categories are read-only.';
const DELETE_COPY = 'Delete Copy';
const DELETE_THIS_COPY = 'Delete This Copy?';
const deleteMessage = (unsentChanges = 0) =>
  unsentChanges === 0
    ? "This copy and its expenses will be deleted from this phone. This can't be undone."
    : `This copy and its expenses will be deleted from this phone, including ${
        unsentChanges === 1
          ? '1 change that was'
          : `${unsentChanges} changes that were`
      } never sent to the group. This can't be undone.`;
const DELETE_FAILED = [
  'Unable to Delete Copy',
  'The copy could not be deleted. Please try again.',
];

/** The lines of a group's card on the Groups root. */
const cardLines = (group: string) =>
  linesIn(screen.getByRole('button', { name: `Open ${group}` }));

/** What the sync capability says of the group: a read-only copy, or nothing. */
const copyOf = async (group: string) =>
  readOnlyCopyOf(appDatabase(), await groupId(group));

/** The requests the event API got for the group since `from`. */
const requestsFor = (group: string, from: number) =>
  eventRequests(from).filter((line) => line.includes(group));

/** The phone has Lunch, which another phone added to Brisbane: you owe half of it. */
async function withLunch() {
  const brisbane = await groupId('Brisbane');
  otherPhoneUploads(brisbane, await lunchCreated());
  await syncs();
  return brisbane;
}

/** While the phone was a member, it uploaded a change that no phone applied: its stamp is an hour ahead of when the API got it (SYNC-350.1). */
async function aChangeWasNotApplied(brisbane: string) {
  const device = await deviceId();
  await receiveEvents(
    brisbane,
    relayed(
      created(
        'invite',
        'A'.repeat(22),
        { ms: LATER + HOUR, counter: 0, device },
        {
          link: { secret: 'A'.repeat(43), expiresAtMs: LATER + 7 * 24 * HOUR },
        },
      ),
      { device, receivedAtMs: LATER },
    ),
  );
  expect(await unapplied()).toHaveLength(1);
}

/** Brisbane is a read-only copy because the phone was removed, and its screen is open on the Groups tab. */
async function copyIsOpen(group = 'Brisbane') {
  await thisPhoneIsRemoved(group);
  await tapTab('Groups');
  await openGroup(group);
  await waitFor(() => expect(textsOn(group)).toContain(NO_MEMBER_BANNER));
}

async function pressDeleteCopy(group = 'Brisbane') {
  await fireEvent.press(contentButton(group, DELETE_COPY));
  await settle();
}

/** Presses Delete Copy and then Delete in the alert that asks. */
async function deleteCopy(group = 'Brisbane') {
  const shown = alertsShown().length;
  await pressDeleteCopy(group);
  expect(alertsShown().slice(shown)).toHaveLength(1);
  await pressAlertButton('Delete');
}

/** The names of the group cards on the Groups root. */
const groupCards = () =>
  screen
    .getAllByRole('button')
    .map((button) => button.props.accessibilityLabel as string)
    .filter((name) => /^Open /.test(name ?? ''));

const secondsPass = (seconds: number) =>
  act(async () => {
    await jest.advanceTimersByTimeAsync(seconds * 1_000);
  });

describe('SYNC-300.1', () => {
  test('[SYNC-300.1] makes a shared ledger a read-only copy once the API refuses its sync because the phone is no member', async () => {
    await startSynced(GROUPS);
    expect(await copyOf('Brisbane')).toBeUndefined();

    await thisPhoneIsRemoved();

    expect(await copyOf('Brisbane')).toEqual({
      reason: 'not-a-member',
      unsent: 0,
    });
  });

  test('[SYNC-300.1] leaves a ledger as it is when a sync of it gets no answer', async () => {
    await startSynced(GROUPS);
    goOffline();

    await syncs();
    goOnline();

    expect(await copyOf('Brisbane')).toBeUndefined();
    await showMembers('Brisbane');
    await expectMembers([YOU, 'Casey', 'Blake', 'Add Member']);
  });

  test('[SYNC-300.1] leaves every other shared ledger syncing', async () => {
    await startSynced(GROUPS, ['Brisbane', 'Tokyo']);
    const tokyo = await groupId('Tokyo');

    await thisPhoneIsRemoved('Brisbane');
    const from = mark();
    await syncs();

    expect(await copyOf('Tokyo')).toBeUndefined();
    expect(requestsFor(tokyo, from).length).toBeGreaterThan(0);
  });
});

describe('SYNC-301.1', () => {
  test('[SYNC-301.1] makes every shared ledger a read-only copy on a phone whose seed is gone, with no request sent', async () => {
    await startSynced(GROUPS, ['Brisbane', 'Tokyo']);
    const seed = secureStoreEntries().find(
      ({ key }) => !key.startsWith('group-key.'),
    )!;
    removeSecureStoreEntry(seed.key);
    const from = mark();

    await syncs();

    expect(await copyOf('Brisbane')).toMatchObject({ reason: 'lapsed' });
    expect(await copyOf('Tokyo')).toMatchObject({ reason: 'lapsed' });
    expect(eventRequests(from)).toEqual([]);
    await tapTab('Groups');
    await openGroup('Brisbane');
    await waitFor(() => expect(textsOn('Brisbane')).toContain(LAPSED_BANNER));
  });
});

describe('SYNC-302.1', () => {
  test('[SYNC-302.1] sends no more requests for a read-only copy, when the app opens or its screens do', async () => {
    await startSynced(GROUPS);
    const brisbane = await groupId('Brisbane');
    await thisPhoneIsRemoved();
    const from = mark();

    await syncs();
    await tapTab('Groups');
    await openGroup('Brisbane');
    await openMembers('Brisbane');
    await secondsPass(5);

    expect(requestsFor(brisbane, from)).toEqual([]);
  });

  test('[SYNC-302.1] keeps the events the phone never uploaded, and uploads none of them', async () => {
    await startSynced(GROUPS);
    goOffline();
    await showMembers('Brisbane');
    await addMember('Dana');
    await addMember('Evan');
    await leaveMembers('Brisbane');
    const waiting = await unsent();
    expect(waiting).toHaveLength(2);
    goOnline();

    await thisPhoneIsRemoved();

    expect(await copyOf('Brisbane')).toEqual({
      reason: 'not-a-member',
      unsent: 2,
    });
    expect(await unsent()).toEqual(waiting);
  });

  test('[SYNC-302.1] deletes the keys of a group that became a read-only copy, and no other entry', async () => {
    await startSynced(GROUPS, ['Brisbane', 'Tokyo']);
    const brisbane = await groupId('Brisbane');
    const before = secureStoreEntries().map(({ key }) => key);
    expect(before).toContain(`group-key.${brisbane}.1`);

    await thisPhoneIsRemoved('Brisbane');

    expect(
      secureStoreEntries()
        .map(({ key }) => key)
        .sort(),
    ).toEqual(before.filter((key) => key !== `group-key.${brisbane}.1`).sort());
  });
});

describe('GROUPS-153.1', () => {
  test('[GROUPS-153.1] [GROUPS-72.4] keeps the card of a read-only copy where it was, and says Read-only copy in place of its members', async () => {
    await startSynced(GROUPS);
    await tapTab('Groups');
    expect(cardLines('Brisbane')).toContain('3 members');

    await thisPhoneIsRemoved();
    await tapTab('Groups');

    await waitFor(() =>
      expect(cardLines('Brisbane')).toContain(READ_ONLY_COPY),
    );
    expect(cardLines('Brisbane')).not.toContain('3 members');
    expect(cardLines('Tokyo')).toContain('1 member');
    expect(
      screen
        .getAllByRole('button')
        .map((button) => button.props.accessibilityLabel as string)
        .filter((name) => /^Open /.test(name ?? '')),
    ).toEqual(['Open Brisbane', 'Open Tokyo']);
  });

  test('[GROUPS-153.1] stays a read-only copy through being archived and restored', async () => {
    await startSynced(GROUPS);
    await thisPhoneIsRemoved();

    await archiveGroup('Brisbane');
    await restoreGroup('Brisbane');
    await tapTab('Groups');

    await waitFor(() =>
      expect(cardLines('Brisbane')).toContain(READ_ONLY_COPY),
    );
    await openGroup('Brisbane');
    await waitFor(() =>
      expect(textsOn('Brisbane')).toContain(NO_MEMBER_BANNER),
    );
  });
});

describe('GROUPS-155.2', () => {
  test('[GROUPS-155.2] says under the title why the group is a read-only copy, with no Restore Group', async () => {
    await startSynced(GROUPS);
    await thisPhoneIsRemoved();
    await tapTab('Groups');

    await openGroup('Brisbane');

    await waitFor(() =>
      expect(textsOn('Brisbane')).toEqual([
        NO_MEMBER_BANNER,
        DELETE_COPY,
        NO_EXPENSES,
      ]),
    );
    expect(textsOn('Brisbane')).not.toContain(READ_ONLY);
  });

  test('[GROUPS-155.2] [SYNC-330.1] says that another phone took the place of this one, when the API said so as it refused the phone', async () => {
    await startSynced(GROUPS);
    await thisPhoneIsTakenOver();
    await tapTab('Groups');

    await openGroup('Brisbane');

    await waitFor(() =>
      expect(textsOn('Brisbane')).toEqual([
        TAKEN_OVER_BANNER,
        DELETE_COPY,
        NO_EXPENSES,
      ]),
    );
    expect(textsOn('Brisbane')).not.toContain(NO_MEMBER_BANNER);
  });

  test('[GROUPS-155.2] [SYNC-330.1] keeps the banner of a removed phone when the header says anything else, and still says after a restart that a phone was taken over', async () => {
    let app = await startSynced(GROUPS, ['Brisbane', 'Tokyo']);
    await thisPhoneIsTakenOver('Brisbane', 'transfer');
    await thisPhoneIsTakenOver('Tokyo');
    await tapTab('Groups');

    await openGroup('Brisbane');
    await waitFor(() =>
      expect(textsOn('Brisbane')).toContain(NO_MEMBER_BANNER),
    );
    expect(textsOn('Brisbane')).not.toContain(TAKEN_OVER_BANNER);

    app = await restart(app);
    expect(app).toBeDefined();
    await tapTab('Groups');
    await openGroup('Tokyo');

    await waitFor(() => expect(textsOn('Tokyo')).toContain(TAKEN_OVER_BANNER));
  });

  test('[GROUPS-155.2] shows no button for the changes that were not applied, which the copy keeps', async () => {
    await startSynced(GROUPS);
    await aChangeWasNotApplied(await groupId('Brisbane'));
    await tapTab('Groups');
    await openGroup('Brisbane');
    await waitFor(() =>
      expect(notAppliedCount('Brisbane')).toBe("1 change wasn't applied"),
    );
    await goBackFrom('Brisbane');

    await copyIsOpen();

    expect(textsOn('Brisbane')).toEqual([
      NO_MEMBER_BANNER,
      DELETE_COPY,
      NO_EXPENSES,
    ]);
    expect(notAppliedCount('Brisbane')).toBeUndefined();
    expect(await unapplied()).toHaveLength(1);
  });

  test.each([
    [1, ['Dana']],
    [3, ['Dana', 'Evan', 'Finn']],
  ])(
    '[GROUPS-155.2] says how many changes were never sent: %s',
    async (count, added) => {
      await startSynced(GROUPS);
      goOffline();
      await showMembers('Brisbane');
      for (const name of added) await addMember(name);
      await leaveMembers('Brisbane');
      goOnline();
      await thisPhoneIsRemoved();
      await tapTab('Groups');

      await openGroup('Brisbane');

      await waitFor(() =>
        expect(textsOn('Brisbane')).toEqual([
          NO_MEMBER_BANNER,
          neverSent(count),
          DELETE_COPY,
          NO_EXPENSES,
        ]),
      );
    },
  );

  test('[GROUPS-155.2] shows the banner of the copy, not the notice of an archived group, on an archived read-only copy', async () => {
    await startSynced(GROUPS);
    await thisPhoneIsRemoved();
    await archiveGroup('Brisbane');

    await openArchivedGroups();
    await openArchivedGroup('Brisbane');

    await waitFor(() =>
      expect(textsOn('Brisbane')).toContain(NO_MEMBER_BANNER),
    );
    expect(textsOn('Brisbane')).not.toContain(READ_ONLY);
    expect(textsOn('Brisbane')).not.toContain('Restore Group');
  });
});

describe('GROUPS-156.1', () => {
  test('[GROUPS-156.1] offers only Members and Categories in Group actions, no Add expense and no renaming', async () => {
    await startSynced(GROUPS);
    await thisPhoneIsRemoved();
    await tapTab('Groups');

    await openGroup('Brisbane');

    await waitFor(() =>
      expect(barItems('Brisbane').right).toContainEqual({
        menu: 'Group actions',
        icon: 'ellipsis.circle',
        items: ['Members', 'Categories'],
      }),
    );
    expect(groupAddButton('Brisbane')).toBeUndefined();
    await longPressLargeTitle('Brisbane');
    expect(isOpen('Rename Group')).toBe(false);
  });

  test('[GROUPS-156.1] lists the members of a read-only copy, none of them a button, with no Invite with Link and no Add Member', async () => {
    await startSynced(GROUPS);
    await thisPhoneIsRemoved();
    await tapTab('Groups');
    await openGroup('Brisbane');

    await openMembers('Brisbane');

    await waitFor(() =>
      expect(textsOn('Members')).toEqual(['Taylor (You)', 'Casey', 'Blake']),
    );
    expect(contentButtons('Members')).toEqual([]);
  });
});

describe('GROUPS-157.1', () => {
  test('[GROUPS-157.1] asks before it deletes a read-only copy, and changes nothing until then', async () => {
    await startSynced(GROUPS);
    await copyIsOpen();
    const before = everything();
    const shown = alertsShown().length;

    await pressDeleteCopy();

    expect(alertsShown().slice(shown)).toEqual([
      [DELETE_THIS_COPY, deleteMessage()],
    ]);
    expect(lastAlertButtonStyles()).toEqual([
      ['Cancel', 'cancel'],
      ['Delete', 'destructive'],
    ]);
    expect(everything()).toEqual(before);
  });

  test.each([
    [1, ['Dana']],
    [3, ['Dana', 'Evan', 'Finn']],
  ])(
    '[GROUPS-157.1] says in the alert how many changes were never sent: %s',
    async (count, added) => {
      await startSynced(GROUPS);
      goOffline();
      await showMembers('Brisbane');
      for (const name of added) await addMember(name);
      await leaveMembers('Brisbane');
      goOnline();
      await copyIsOpen();
      const shown = alertsShown().length;

      await pressDeleteCopy();

      expect(alertsShown().slice(shown)).toEqual([
        [DELETE_THIS_COPY, deleteMessage(count)],
      ]);
    },
  );

  test('[GROUPS-157.1] keeps the copy, and everything the phone holds, when Cancel is pressed', async () => {
    await startSynced(GROUPS);
    await copyIsOpen();
    const before = everything();
    await pressDeleteCopy();

    await pressAlertButton('Cancel');

    expect(textsOn('Brisbane')).toEqual([
      NO_MEMBER_BANNER,
      DELETE_COPY,
      NO_EXPENSES,
    ]);
    expect(await copyOf('Brisbane')).toMatchObject({ reason: 'not-a-member' });
    expect(everything()).toEqual(before);
  });

  test('[GROUPS-157.1] has Delete Copy on an archived read-only copy too', async () => {
    await startSynced(GROUPS);
    await thisPhoneIsRemoved();
    await archiveGroup('Brisbane');

    await openArchivedGroups();
    await openArchivedGroup('Brisbane');

    await waitFor(() =>
      expect(textsOn('Brisbane')).toEqual([
        NO_MEMBER_BANNER,
        DELETE_COPY,
        NO_EXPENSES,
      ]),
    );
  });

  test('[GROUPS-157.1] has no Delete Copy on a group that is no read-only copy', async () => {
    await startSynced(GROUPS, ['Brisbane', 'Tokyo']);
    await copyIsOpen('Brisbane');
    expect(textsOn('Brisbane')).toContain(DELETE_COPY);
    await goBackFrom('Brisbane');

    await openGroup('Tokyo');

    expect(textsOn('Tokyo')).not.toContain(DELETE_COPY);
  });
});

describe('GROUPS-158.1', () => {
  test('[GROUPS-158.1] deletes the copy and everything the phone holds for it, with no request, and goes back to the Groups root', async () => {
    await startSynced(GROUPS, ['Brisbane', 'Tokyo']);
    const brisbane = await withLunch();
    const ids = await members('Brisbane');
    const lunch = await expenseTitled('Lunch');
    await aChangeWasNotApplied(brisbane);
    await copyIsOpen();
    const before = everything();
    const from = mark();

    await deleteCopy();

    await waitFor(() => expect(isOpen('Brisbane')).toBe(false));
    expect(groupCards()).toEqual(['Open Tokyo']);
    expect(await unapplied()).toEqual([]);
    const after = everything();
    const held = JSON.stringify(after);
    for (const id of [brisbane, lunch.id, ...Object.values(ids)]) {
      expect(held).not.toContain(id);
    }
    expect(after.sync_clock).toEqual(before.sync_clock);
    expect(after.groups).toEqual(
      before.groups.filter((row) => !row.includes(brisbane)),
    );
    expect(after.local_identity).toEqual(before.local_identity);
    expect(requestsFor(brisbane, from)).toEqual([]);
    await tapTab('Expenses');
    expect(screen.queryByText('Lunch')).toBeNull();
  });

  test('[GROUPS-158.1] deletes the changes that were never sent with the copy', async () => {
    await startSynced(GROUPS);
    goOffline();
    await showMembers('Brisbane');
    await addMember('Dana');
    await addMember('Evan');
    await leaveMembers('Brisbane');
    goOnline();
    await copyIsOpen();
    expect(await unsent()).toHaveLength(2);

    await deleteCopy();

    await waitFor(() => expect(isOpen('Brisbane')).toBe(false));
    expect(await unsent()).toEqual([]);
  });

  test("[GROUPS-158.1] deletes the copy's expenses in the Trash", async () => {
    await startSynced(GROUPS);
    await withLunch();
    await tapTab('Groups');
    await openGroup('Brisbane');
    await deleteFromGroup('Brisbane', 'Lunch');
    await syncs();
    await goBackFrom('Brisbane');
    await copyIsOpen();

    await deleteCopy();

    await waitFor(() => expect(isOpen('Brisbane')).toBe(false));
    expect(everything().expenses).toEqual([]);
    await openTrash();
    expect(screen.queryByText('Lunch')).toBeNull();
  });

  test('[GROUPS-158.1] goes back to Archived Groups after deleting an archived copy', async () => {
    await startSynced(GROUPS);
    await thisPhoneIsRemoved();
    await archiveGroup('Brisbane');
    await openArchivedGroups();
    await openArchivedGroup('Brisbane');
    await waitFor(() =>
      expect(textsOn('Brisbane')).toContain(NO_MEMBER_BANNER),
    );

    await deleteCopy();

    await waitFor(() =>
      expect(textsOn('Archived Groups')).toEqual([NO_ARCHIVED]),
    );
  });

  test('[GROUPS-158.1] has no copy, and asks the API nothing about it, after a restart', async () => {
    const app = await startSynced(GROUPS, ['Brisbane', 'Tokyo']);
    const brisbane = await groupId('Brisbane');
    await copyIsOpen();
    await deleteCopy();
    await waitFor(() => expect(isOpen('Brisbane')).toBe(false));
    const from = mark();

    await restart(app);
    await tapTab('Groups');

    expect(groupCards()).toEqual(['Open Tokyo']);
    expect(requestsFor(brisbane, from)).toEqual([]);
  });

  test("[GROUPS-158.1] shows an open detail of the copy's expense as not found once the copy is deleted", async () => {
    await startSynced(GROUPS);
    await withLunch();
    await tapTab('Expenses');
    await openDetails('Lunch');
    await copyIsOpen();

    await deleteCopy();
    await waitFor(() => expect(isOpen('Brisbane')).toBe(false));
    await tapTab('Expenses');

    await waitFor(() => expect(detailLines()).toEqual(['Expense not found.']));
  });
});

describe('GROUPS-159.1', () => {
  test('[GROUPS-159.1] says the copy could not be deleted, and keeps it, when the write fails', async () => {
    await startSynced(GROUPS);
    await withLunch();
    await copyIsOpen();
    const before = everything();
    failWrites();
    const shown = alertsShown().length;

    await deleteCopy();

    expect(alertsShown().slice(shown + 1)).toEqual([DELETE_FAILED]);
    expect(textsOn('Brisbane')).toEqual(
      expect.arrayContaining([NO_MEMBER_BANNER, DELETE_COPY]),
    );
    expect(isDisabled(contentButton('Brisbane', DELETE_COPY))).toBe(false);
    expect(everything()).toEqual(before);
  });

  test('[GROUPS-159.1] deletes the copy when Delete is pressed again after writes recover', async () => {
    await startSynced(GROUPS);
    await copyIsOpen();
    failWrites();
    await deleteCopy();
    allowWrites();

    await deleteCopy();

    await waitFor(() => expect(isOpen('Brisbane')).toBe(false));
    expect(groupCards()).toEqual(['Open Tokyo']);
  });

  test('[GROUPS-159.1] disables Delete Copy while the copy is being deleted', async () => {
    await startSynced(GROUPS);
    await copyIsOpen();
    const writes = holdWrites();

    await deleteCopy();

    expect(isDisabled(contentButton('Brisbane', DELETE_COPY))).toBe(true);
    await writes.release();
    await settle();
    await waitFor(() => expect(isOpen('Brisbane')).toBe(false));
    expect(alertsShown().at(-1)).toEqual([DELETE_THIS_COPY, deleteMessage()]);
  });
});

describe('LEDGER-220.1', () => {
  test('[LEDGER-220.1] shows an expense of a read-only copy as shared history, with its status and no Edit', async () => {
    await startSynced(GROUPS);
    await withLunch();
    await thisPhoneIsRemoved();
    await tapTab('Expenses');

    await openDetails('Lunch');

    const expected = [
      'Lunch',
      SHARED_HISTORY,
      HISTORY_OF_A_COPY,
      'Group',
      'Brisbane',
      'Status',
      READ_ONLY_COPY,
    ];
    await waitFor(() =>
      expect(shownInOrder(detailLines(), expected)).toEqual(expected),
    );
    expect(editOn('Expenses')?.disabled).toBe(true);
  });
});

describe('LEDGER-221.1', () => {
  test('[LEDGER-221.1] refuses to save an expense of a read-only copy, and keeps the form open', async () => {
    await startSynced(GROUPS);
    await withLunch();
    const lunch = await expenseTitled('Lunch');
    await thisPhoneIsRemoved();
    const before = alertsShown().length;
    await openEditExpense(lunch.id);
    await fillForm({ title: 'Supper' });

    await press('Save');

    expect(alertsShown().slice(before)).toEqual([
      ['Read-only Copy', NO_CHANGE],
    ]);
    expect(formTitle()).toBe('Edit Expense');
    expect(titleField().props.value).toBe('Supper');
    expect((await expenseTitled('Lunch')).id).toBe(lunch.id);
    expect(await unsent()).toEqual([]);
  });
});

describe('LEDGER-222.1', () => {
  test('[LEDGER-222.1] leaves a read-only copy out of Select Group', async () => {
    await startSynced(GROUPS);
    await thisPhoneIsRemoved();
    await tapTab('Expenses');
    await openNewExpense();
    await setSplit(true);

    await openRow('Group');

    expect(listOptions('Select Group')).toEqual([['Tokyo', false]]);
  });

  test('[LEDGER-222.1] cannot restore a trashed expense of a read-only copy', async () => {
    await startSynced(GROUPS);
    await withLunch();
    await tapTab('Groups');
    await openGroup('Brisbane');
    await deleteFromGroup('Brisbane', 'Lunch');
    // The move to the trash is uploaded before the phone loses its access.
    await syncs();
    await thisPhoneIsRemoved();

    await openTrash();
    await openTrashed('Lunch');

    expect(
      isDisabled(
        within(expenseScreen('Settings')).getByRole('button', {
          name: 'Restore',
        }),
      ),
    ).toBe(true);
    expect(await unsent()).toEqual([]);
  });
});

describe('CATEGORIES-60.1', () => {
  test('[CATEGORIES-60.1] says above the categories of a read-only copy that they are read-only', async () => {
    await startSynced(GROUPS);
    await thisPhoneIsRemoved();

    await openGroupCategories(await groupId('Brisbane'));

    await waitFor(() =>
      expect(categoriesLines()[0]).toBe(CATEGORIES_OF_A_COPY),
    );
    expect(
      screen.queryByRole('button', { name: 'About categories' }),
    ).toBeNull();
  });
});
