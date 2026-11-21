import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Alert } from 'react-native';
import { act, fireEvent } from '@testing-library/react-native';
import type { Database } from '../../src/storage';
import { readIdentity, startGroupsApp } from '../acceptance/groups-app';
import {
  allowWrites,
  fakePhoneAppearance,
  fakeReduceTransparency,
  nameField,
  settle,
  testDatabase,
} from '../acceptance/shell-appearance-app';

// On a busy phone the keys typed just before Return, or just before the name field
// loses focus, can reach React in the same batch as it, before React renders the name
// they make. Settings must save the name the field holds, not the one from the last
// render. Each test calls the field's change handler and its Return or blur handler
// inside one act(), so React renders neither until both have run; fireEvent would
// wrap each in an act() of its own and render in between. The blur carries no text,
// as on Android.

let mockOpen: () => Promise<Database>;
jest.mock('../../src/storage/expo', () => ({
  openPhoneDatabase: () => mockOpen(),
}));

let directory: string;
let file: string;

beforeEach(() => {
  jest.clearAllMocks();
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-name-return-'));
  file = path.join(directory, 'app.db');
  mockOpen = async () => testDatabase(file);
  allowWrites();
  fakePhoneAppearance('light');
  fakeReduceTransparency(false);
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
  fs.rmSync(directory, { recursive: true, force: true });
});

/** Changes the name field to `text` and presses Return before React renders the change. */
async function typeAndReturnInOneBatch(text: string) {
  const { onChangeText, onSubmitEditing } = nameField().props;
  await act(async () => {
    onChangeText(text);
    onSubmitEditing({ nativeEvent: { text } });
  });
  await settle();
}

/** Changes the name field to `text` and takes its focus before React renders the change. */
async function typeAndLeaveInOneBatch(text: string) {
  const { onChangeText, onBlur } = nameField().props;
  await act(async () => {
    onChangeText(text);
    onBlur({ nativeEvent: {} });
  });
  await settle();
}

test('Return saves the whole name when the last keys come with it', async () => {
  await startGroupsApp('/settings');
  await fireEvent.changeText(nameField(), 'T');
  await settle();

  await typeAndReturnInOneBatch('Taylor');

  expect(nameField()).toHaveDisplayValue('Taylor');
  expect((await readIdentity()).name).toBe('Taylor');
});

test('Return saves the name when all of it comes with Return', async () => {
  await startGroupsApp('/settings');

  await typeAndReturnInOneBatch('Taylor');

  expect(nameField()).toHaveDisplayValue('Taylor');
  expect((await readIdentity()).name).toBe('Taylor');
});

test('Losing focus saves the whole name when the last keys come with it', async () => {
  await startGroupsApp('/settings');
  await fireEvent.changeText(nameField(), 'T');
  await settle();

  await typeAndLeaveInOneBatch('Taylor');

  expect(nameField()).toHaveDisplayValue('Taylor');
  expect((await readIdentity()).name).toBe('Taylor');
});
