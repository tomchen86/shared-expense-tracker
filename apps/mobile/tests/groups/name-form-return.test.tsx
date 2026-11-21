import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ActionSheetIOS, Alert } from 'react-native';
import { act, fireEvent } from '@testing-library/react-native';
import type { Database } from '../../src/storage';
import {
  allowReads,
  createGroup,
  expectNewGroupClosed,
  expectNewGroupOpen,
  pressAddGroup,
  saveName,
  startGroupsApp,
  storedGroups,
  testDatabaseWithReads,
} from '../acceptance/groups-app';
import {
  allowWrites,
  fakePhoneAppearance,
  fakeReduceTransparency,
  settle,
} from '../acceptance/shell-appearance-app';
import {
  barTitled,
  expectClosed,
  expectMembers,
  groupNameField,
  memberNameField,
  openGroup,
  openRenameGroup,
  openRenameMember,
  openWithMembers,
  storedMemberNames,
} from '../acceptance/group-details-app';

// On a busy phone the keys typed just before Return, or just before a press on the
// title bar's Create or Save, can reach React in the same batch as it, before React
// renders the name they make. New Group, Rename Member and Rename Group must save the
// name the field holds, not the one from the last render. Each test calls the field's
// change handler and the Return or title bar handler inside one act(), so React
// renders neither until both have run; fireEvent would wrap each in an act() of its
// own and render in between.

let mockOpen: () => Promise<Database>;
jest.mock('../../src/storage/expo', () => ({
  openPhoneDatabase: () => mockOpen(),
}));

let directory: string;
let file: string;

beforeEach(() => {
  jest.clearAllMocks();
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'name-form-return-'));
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

type Field = ReturnType<typeof groupNameField>;

/** Changes `field` to `text` and presses Return before React renders the change. */
async function typeAndReturnInOneBatch(field: Field, text: string) {
  const { onChangeText, onSubmitEditing } = field.props;
  await act(async () => {
    onChangeText(text);
    onSubmitEditing({ nativeEvent: { text } });
  });
  await settle();
}

interface BarItem {
  type: string;
  title?: string;
  accessibilityLabel?: string;
  disabled?: boolean;
  buttonId?: string;
}

/**
 * Changes `field` to `text` and presses `button` on the bar titled `title` before React
 * renders the change, as the native bar reports a press on iOS.
 */
async function typeAndPressInOneBatch(
  field: Field,
  text: string,
  title: string,
  button: string,
) {
  const { onChangeText } = field.props;
  const bar = barTitled(title)!;
  const items: BarItem[] = [
    ...(bar.props.headerLeftBarButtonItems ?? []),
    ...(bar.props.headerRightBarButtonItems ?? []),
  ];
  const item = items.find(
    (candidate) =>
      candidate.type === 'button' &&
      (candidate.accessibilityLabel || candidate.title) === button,
  );
  expect(item).toBeDefined();
  // The native bar reports no press on a disabled button.
  expect(item!.disabled).not.toBe(true);
  await act(async () => {
    onChangeText(text);
    bar.props.onPressHeaderBarButtonItem({
      nativeEvent: { buttonId: item!.buttonId },
    });
  });
  await settle();
}

const storedGroupNames = async () =>
  (await storedGroups(file)).map((group) => group.name);

async function startInNewGroup() {
  await startGroupsApp();
  await saveName('Taylor');
  await pressAddGroup();
  await expectNewGroupOpen();
}

test('New Group creates the group with the whole name when the last keys come with Return', async () => {
  await startInNewGroup();
  await fireEvent.changeText(groupNameField(), 'B');
  await settle();

  await typeAndReturnInOneBatch(groupNameField(), 'Brisbane');

  await expectNewGroupClosed();
  expect(await storedGroupNames()).toEqual(['Brisbane']);
});

test('New Group creates the group when all of its name comes with Return', async () => {
  await startInNewGroup();

  await typeAndReturnInOneBatch(groupNameField(), 'Brisbane');

  await expectNewGroupClosed();
  expect(await storedGroupNames()).toEqual(['Brisbane']);
});

test('New Group creates the group with the whole name when the last keys come with Create', async () => {
  await startInNewGroup();
  await fireEvent.changeText(groupNameField(), 'B');
  await settle();

  await typeAndPressInOneBatch(
    groupNameField(),
    'Brisbane',
    'New Group',
    'Create',
  );

  await expectNewGroupClosed();
  expect(await storedGroupNames()).toEqual(['Brisbane']);
});

async function startInRenameMember() {
  await startGroupsApp();
  await saveName('Taylor');
  await createGroup('Brisbane');
  await openWithMembers('Brisbane', ['Blake', 'Casey']);
  await openRenameMember('Casey');
}

test('Rename Member saves the whole name when the last keys come with Return', async () => {
  await startInRenameMember();
  await fireEvent.changeText(memberNameField(), 'Casey L');
  await settle();

  await typeAndReturnInOneBatch(memberNameField(), 'Casey Lee');

  await expectClosed('Rename Member');
  await expectMembers(['Taylor (You)', 'Blake', 'Casey Lee', 'Add Member']);
  expect(await storedMemberNames(file, 'Brisbane')).toEqual([
    'Taylor',
    'Blake',
    'Casey Lee',
  ]);
});

test('Rename Member saves when all of the change comes with Return', async () => {
  await startInRenameMember();

  await typeAndReturnInOneBatch(memberNameField(), 'Casey Lee');

  await expectClosed('Rename Member');
  expect(await storedMemberNames(file, 'Brisbane')).toEqual([
    'Taylor',
    'Blake',
    'Casey Lee',
  ]);
});

test('Rename Member saves the whole name when the last keys come with Save', async () => {
  await startInRenameMember();
  await fireEvent.changeText(memberNameField(), 'Casey L');
  await settle();

  await typeAndPressInOneBatch(
    memberNameField(),
    'Casey Lee',
    'Rename Member',
    'Save',
  );

  await expectClosed('Rename Member');
  expect(await storedMemberNames(file, 'Brisbane')).toEqual([
    'Taylor',
    'Blake',
    'Casey Lee',
  ]);
});

async function startInRenameGroup() {
  await startGroupsApp();
  await saveName('Taylor');
  await createGroup('Brisbane');
  await openGroup('Brisbane');
  await openRenameGroup('Brisbane');
}

test('Rename Group saves the whole name when the last keys come with Return', async () => {
  await startInRenameGroup();
  await fireEvent.changeText(groupNameField(), 'T');
  await settle();

  await typeAndReturnInOneBatch(groupNameField(), 'Tokyo');

  await expectClosed('Rename Group');
  expect(await storedGroupNames()).toEqual(['Tokyo']);
});

test('Rename Group saves the whole name when the last keys come with Save', async () => {
  await startInRenameGroup();
  await fireEvent.changeText(groupNameField(), 'T');
  await settle();

  await typeAndPressInOneBatch(
    groupNameField(),
    'Tokyo',
    'Rename Group',
    'Save',
  );

  await expectClosed('Rename Group');
  expect(await storedGroupNames()).toEqual(['Tokyo']);
});
