import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Alert } from 'react-native';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { Database } from '../../src/storage';
import {
  createGroup,
  pressAddGroup,
  saveName,
  startGroupsApp,
  storedGroups,
} from '../acceptance/groups-app';
import {
  expectClosed,
  groupNameField,
  isOpen,
  memberNameField,
  openGroup,
  openRenameGroup,
  openRenameMember,
  openWithMembers,
  pressOnBar,
} from '../acceptance/group-details-app';
import {
  allowWrites,
  fakePhoneAppearance,
  holdWrites,
  settle,
  testDatabase,
} from '../acceptance/shell-appearance-app';
import {
  navigationBarTitles,
  selectedTab,
  tab,
  tapTab,
} from '../acceptance/shell-tabs-app';

let mockOpen: () => Promise<Database>;
jest.mock('../../src/storage/expo', () => ({
  openPhoneDatabase: () => mockOpen(),
}));
jest.mock('expo-symbols', () => ({
  ...jest.requireActual('expo-symbols'),
  unstable_getMaterialSymbolSourceAsync: async (symbol: string) => ({
    uri: `material-symbol:${symbol}`,
  }),
}));

let directory: string;
let file: string;

beforeEach(() => {
  jest.clearAllMocks();
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'group-form-navigation-'));
  file = path.join(directory, 'app.db');
  mockOpen = async () => testDatabase(file);
  allowWrites();
  fakePhoneAppearance('light');
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
  fs.rmSync(directory, { recursive: true, force: true });
});

test.each(['Rename Member', 'Rename Group', 'New Group'])(
  '%s closes its own sheet after saving while another tab is selected',
  async (form) => {
    await startGroupsApp();
    await saveName('Taylor');
    await createGroup('Brisbane');

    await tapTab('Settings');
    await fireEvent.press(
      screen.getByRole('button', { name: 'Manage Categories' }),
    );
    await waitFor(() =>
      expect(navigationBarTitles(tab('Settings'))).toEqual([
        'Settings',
        'Manage Categories',
      ]),
    );
    await tapTab('Groups');

    if (form === 'New Group') {
      await pressAddGroup();
    } else if (form === 'Rename Group') {
      await openGroup('Brisbane');
      await openRenameGroup('Brisbane');
    } else {
      await openWithMembers('Brisbane', ['Blake']);
      await openRenameMember('Blake');
    }

    await fireEvent.changeText(
      form.endsWith('Group') ? groupNameField() : memberNameField(),
      'Updated',
    );
    const writes = holdWrites();
    const confirm = form === 'New Group' ? 'Create' : 'Save';
    await pressOnBar(form, confirm);
    await tapTab('Settings');
    expect(selectedTab()).toBe('Settings');
    expect(isOpen(form)).toBe(true);

    await writes.release();
    await settle();
    await expectClosed(form);
    expect(selectedTab()).toBe('Settings');
    expect(navigationBarTitles(tab('Settings'))).toEqual([
      'Settings',
      'Manage Categories',
    ]);

    await tapTab('Groups');
    expect(isOpen(form)).toBe(false);
    await waitFor(() =>
      expect(navigationBarTitles(tab('Groups'))).toEqual(
        form === 'New Group'
          ? ['Groups']
          : form === 'Rename Group'
            ? ['Groups', 'Updated']
            : ['Groups', 'Brisbane', 'Members'],
      ),
    );
    const groups = await storedGroups(file);
    if (form.endsWith('Group')) {
      expect(groups.map((group) => group.name)).toContain('Updated');
    } else {
      expect(groups[0].members.map((member) => member.name)).toContain(
        'Updated',
      );
    }
  },
);
