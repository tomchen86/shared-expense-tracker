import { Buffer } from 'node:buffer';
import { waitFor } from '@testing-library/react-native';
import {
  alertsShown,
  chooseForMember,
  expectMembers,
} from './group-details-app';
import {
  apiLosesNextAnswer,
  mistakes,
  removeWorld,
  resetWorld,
} from './sharing-app';
import {
  APPROVE,
  D,
  NEW_MEMBER,
  OFFLINE,
  UNABLE_TO_APPROVE,
  WENT_WRONG,
  approvals,
  asks,
  chunks,
  groupRequests,
  startDecisionApi,
  startWithInvite,
  syncs,
} from './sharing-decision-app';
import {
  YOU,
  eachTestGetsAPhone,
  members,
  showMembers,
  unsent,
} from './sync-app';
import { addDinner } from './sync-conflict-app';
import {
  apiEventIds,
  groupIsFull,
  mark,
  startEventApi,
  upload,
} from './sync-screens-app';

jest.mock('../../src/storage/expo', () => ({
  openPhoneDatabase: async () =>
    jest.requireActual<typeof import('./sync-app')>('./sync-app').openPhone(),
}));

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

eachTestGetsAPhone('sharing-approval-failures-');

beforeEach(() => {
  resetWorld();
  startEventApi();
  startDecisionApi();
});

afterEach(async () => {
  const wrong = mistakes();
  await removeWorld();
  expect(wrong).toEqual([]);
});

const DANA_ROW = `Dana, ${NEW_MEMBER}`;
const ROWS = [DANA_ROW, YOU, 'Casey', 'Blake', 'Add Member'];

async function showDanaRequest() {
  await asks();
  await syncs();
  await showMembers('Brisbane');
  await expectMembers(ROWS);
}

test("[SHARING-200.2] says to connect when Dana's snapshot upload gets no answer", async () => {
  const { brisbane } = await startWithInvite();
  await showDanaRequest();
  const before = await members('Brisbane');
  const from = mark();
  apiLosesNextAnswer(
    ({ method, path }) =>
      method === 'PUT' && path.startsWith(`/groups/${brisbane}/snapshots/`),
  );

  await chooseForMember(DANA_ROW, APPROVE);

  await waitFor(() =>
    expect(alertsShown().at(-1)).toEqual([UNABLE_TO_APPROVE, OFFLINE]),
  );
  await expectMembers(ROWS);
  expect(await members('Brisbane')).toEqual(before);
  expect(await unsent()).toEqual([]);
  const sent = chunks(from);
  expect(sent).toHaveLength(1);
  expect(JSON.parse(Buffer.from(sent[0].body).toString('utf8'))).toMatchObject({
    deviceId: D,
  });
  expect(approvals(from)).toEqual([]);
});

test("[SHARING-200.2] keeps Dana's request when a full group refuses a pending event", async () => {
  const { brisbane } = await startWithInvite();
  groupIsFull(brisbane, true);
  await addDinner();
  await showDanaRequest();
  const pending = await unsent();
  expect(pending).toHaveLength(1);
  const from = mark();

  await chooseForMember(DANA_ROW, APPROVE);

  await waitFor(() =>
    expect(alertsShown().at(-1)).toEqual([UNABLE_TO_APPROVE, WENT_WRONG]),
  );
  await expectMembers(ROWS);
  expect(groupRequests(from)).toContain(upload(brisbane));
  expect(apiEventIds(brisbane)).not.toContain(pending[0].id);
  expect(await unsent()).toEqual(pending);
  expect(chunks(from)).toEqual([]);
  expect(approvals(from)).toEqual([]);
});
