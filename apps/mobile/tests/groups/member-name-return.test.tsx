import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ActionSheetIOS, Alert } from 'react-native';
import { act, fireEvent, waitFor } from '@testing-library/react-native';
import type { Database } from '../../src/storage';
import {
  allowReads,
  createGroup,
  saveName,
  startGroupsApp,
  testDatabaseWithReads,
} from '../acceptance/groups-app';
import {
  allowWrites,
  fakePhoneAppearance,
  fakeReduceTransparency,
  settle,
} from '../acceptance/shell-appearance-app';
import {
  expectMembers,
  memberField,
  openMemberField,
  openWithMembers,
  storedMemberNames,
} from '../acceptance/group-details-app';

// On a busy phone the keys typed just before Return can reach React in the same batch
// as Return, before React renders the name they make. Return must add the name the
// field holds, not the one from the last render. Each test calls the field's change and
// Return handlers inside one act(), so React renders neither until both have run;
// fireEvent would wrap each in an act() of its own and render in between.

let mockOpen: () => Promise<Database>;
jest.mock('../../src/storage/expo', () => ({
  openPhoneDatabase: () => mockOpen(),
}));

let directory: string;
let file: string;

beforeEach(() => {
  jest.clearAllMocks();
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'member-name-return-'));
  file = path.join(directory, 'app.db');
  mockOpen = async () => testDatabaseWithReads(file);
  allowWrites();
  allowReads();
  fakePhoneAppearance('light');
  fakeReduceTransparency(false);
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  jest
    .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
    .mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
  fs.rmSync(directory, { recursive: true, force: true });
});

async function startInMembers() {
  await startGroupsApp();
  await saveName('Taylor');
  await createGroup('Brisbane');
  await openWithMembers('Brisbane', []);
  await openMemberField();
}

/** Changes the field to `text` and presses Return before React renders the change. */
async function typeAndReturnInOneBatch(text: string) {
  const { onChangeText, onSubmitEditing } = memberField()!.props;
  await act(async () => {
    onChangeText(text);
    onSubmitEditing({ nativeEvent: { text } });
  });
  await settle();
}

test('Return adds the whole name when the last keys come with it', async () => {
  await startInMembers();
  await fireEvent.changeText(memberField()!, 'C');
  await settle();

  await typeAndReturnInOneBatch('Casey');

  await expectMembers(['Taylor (You)', 'Casey']);
  expect(memberField()).toHaveDisplayValue('');
  expect(await storedMemberNames(file, 'Brisbane')).toEqual([
    'Taylor',
    'Casey',
  ]);
});

test('Return adds the name and keeps the field when all of it comes with Return', async () => {
  await startInMembers();

  await typeAndReturnInOneBatch('Casey');

  await expectMembers(['Taylor (You)', 'Casey']);
  await waitFor(() => expect(memberField()).toBeDefined());
  expect(memberField()).toHaveDisplayValue('');
  expect(await storedMemberNames(file, 'Brisbane')).toEqual([
    'Taylor',
    'Casey',
  ]);
});
