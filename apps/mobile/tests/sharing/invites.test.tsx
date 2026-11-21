import { Alert } from 'react-native';
import { act, fireEvent } from '@testing-library/react-native';
import { addGroupMember, renameGroup } from '../../src/groups';
import { SEED_OPTIONS } from '../../src/sharing/device-identity';
import {
  expectClosed,
  membersButton,
  pressAlertButton,
} from '../acceptance/group-details-app';
import { setPhoneClock } from '../acceptance/ledger-expense-app';
import { T, received, secureStore } from '../acceptance/sharing-app';
import {
  WENT_WRONG,
  TOO_MANY_MEMBERS,
  codeIn,
  eachTestGetsAnInvitingPhone,
  inviteLines,
  inviteOnApi,
  inviteRequests,
  invited,
  isCreateGroup,
  isPutInvite,
  keepAnswersBack,
  openedCard,
  partsOf,
  pressInInvite,
  revokedByAnotherPhone,
  shownLink,
  startAt,
  tryAgain,
  until,
} from '../acceptance/sharing-invite-app';
import {
  appDatabase,
  at,
  groupId,
  receive,
  share,
  showMembers,
  unsent,
} from '../acceptance/sync-app';

jest.mock('../../src/storage/expo', () => ({
  openPhoneDatabase: () =>
    jest
      .requireActual<typeof import('../acceptance/sync-app')>(
        '../acceptance/sync-app',
      )
      .openPhone(),
}));
jest.mock(
  'expo-crypto',
  () =>
    jest.requireActual<typeof import('../acceptance/sharing-app')>(
      '../acceptance/sharing-app',
    ).randomSource,
);
jest.mock(
  'expo-secure-store',
  () =>
    jest.requireActual<typeof import('../acceptance/sharing-app')>(
      '../acceptance/sharing-app',
    ).secureStore,
);

eachTestGetsAnInvitingPhone('phone-invite-recovery-');

test('a retained key can create and revoke an invite', async () => {
  await startAt({ Brisbane: [] });
  setPhoneClock('America/Los_Angeles', new Date(T).toISOString());
  const entry = `group-key.${await groupId('Brisbane')}.1`;
  const key = '37'.repeat(32);
  await secureStore.setItemAsync(entry, key, SEED_OPTIONS);
  const { code } = partsOf(await invited('Brisbane'));
  expect(await secureStore.getItemAsync(entry, SEED_OPTIONS)).toBe(key);
  expect(inviteLines()).toContain('Expires Nov 24, 2026');

  await pressInInvite('Revoke Link');
  expect(jest.mocked(Alert.alert).mock.lastCall?.[2]).toEqual([
    expect.objectContaining({ text: 'Cancel', style: 'cancel' }),
    expect.objectContaining({ text: 'Revoke', style: 'destructive' }),
  ]);
  await pressAlertButton('Revoke');
  await expectClosed('Invite');
  expect(inviteOnApi(code)?.revoked).toBe(true);
});

test('a late creation reply cannot resurrect a link another member already revoked', async () => {
  await startAt({ Brisbane: [] });
  const id = await groupId('Brisbane');
  const release = keepAnswersBack(isPutInvite);
  await showMembers('Brisbane');
  await fireEvent.press(membersButton('Invite with Link'));
  await until(() => inviteRequests().length === 1, 'the first card');
  const code = codeIn(inviteRequests()[0]);
  revokedByAnotherPhone(code);
  await receive(id, {
    version: 1,
    type: 'invite',
    id: code,
    stamp: at(T),
    deleted: true,
  });
  await release();
  await until(() => inviteLines().includes(WENT_WRONG), 'the late answer');
  expect(await unsent()).toEqual([]);
  await tryAgain();
  const replacement = partsOf(shownLink()!).code;
  expect(replacement).not.toBe(code);
  expect(inviteRequests().map(codeIn)).toEqual([code, code, replacement]);
});

test('rechecks the roster before committing a delayed group creation', async () => {
  await startAt({ Brisbane: [] });
  const group = await groupId('Brisbane');
  const release = keepAnswersBack(isCreateGroup);
  await showMembers('Brisbane');
  await fireEvent.press(membersButton('Invite with Link'));
  await until(
    () => received().some(isCreateGroup),
    'the group creation request',
  );
  for (let i = 1; i <= 20; i++)
    await addGroupMember(appDatabase(), group, `Member ${i}`);
  await release();
  await until(
    () => inviteLines().includes(TOO_MANY_MEMBERS),
    'the updated roster check',
  );
  expect(await appDatabase().all('SELECT groupId FROM sync_groups')).toEqual(
    [],
  );
  expect(inviteRequests()).toHaveLength(0);
});

test('sends successive name changes at the same cursor in order when one card is delayed', async () => {
  await startAt({ Brisbane: [] });
  const { secret } = partsOf(await invited('Brisbane'));
  const id = await groupId('Brisbane');
  const release = keepAnswersBack(isPutInvite);
  await act(async () => {
    await renameGroup(appDatabase(), id, 'First');
  });
  await until(() => inviteRequests().length === 2, 'the first replacement');
  await act(async () => {
    await renameGroup(appDatabase(), id, 'Second');
    await renameGroup(appDatabase(), id, 'Third');
  });
  await release();
  await until(() => inviteRequests().length === 4, 'all four cards');
  expect(
    inviteRequests().map((r) => JSON.parse(openedCard(r, secret)).name),
  ).toEqual(['Brisbane', 'First', 'Second', 'Third']);
});

test('breaks an expiry tie by code and can display the date beyond the JavaScript Date limit', async () => {
  await startAt({ Brisbane: [] });
  const group = await share('Brisbane');
  const codes = ['AAAAAAAAAAAAAAAAAAAAAA', 'AAAAAAAAAAAAAAAAAAAAAg'];
  const secret = 'A'.repeat(43);
  // One full Gregorian cycle after September 13, 275760 (the last JS Date).
  const expiresAtMs = 8_640_000_000_000_000 + 146097 * 86_400_000;
  await receive(
    group,
    ...codes.map((id) => ({
      version: 1,
      stamp: at(T),
      type: 'invite',
      id,
      units: { link: { value: { secret, expiresAtMs } } },
    })),
  );
  expect(partsOf(await invited('Brisbane')).code).toBe(codes[1]);
  expect(inviteLines()).toContain('Expires Sep 13, 276160');
  expect(inviteRequests()).toHaveLength(0);
});
