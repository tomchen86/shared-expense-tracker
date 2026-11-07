import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ActionSheetIOS } from 'react-native';
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react-native';
import {
  DISCARD_CHANGES,
  SAVE_FAILED,
  addCategory,
  addExpense,
  amountField,
  categoryOptions,
  chooseCategory,
  editCategory,
  expectForm,
  expectFormClosed,
  fillForm,
  formButton,
  formCategory,
  formScreen,
  formTitle,
  inTreeOrder,
  noteField,
  openCategoryList,
  openEditExpense,
  openNewExpense,
  phoneDatabase,
  press,
  readIdentity,
  resetPhone,
  restart,
  storedExpenses,
  titleField,
  watchAlerts,
  menuField,
} from './ledger-expense-app';
import {
  allowWrites,
  failWritesAfter,
  holdWrites,
  settle,
} from './shell-appearance-app';
import { push, tapTab } from './shell-tabs-app';
import {
  barAction,
  barTitled,
  openGroup,
  pressOnBar,
  swipeDown,
} from './group-details-app';
import {
  ADD_NEW_CATEGORY,
  FORMER_MEMBER_LOCK,
  HISTORICAL,
  NO_GROUP_ID,
  addNewCategoryFromForm,
  addGroupExpense,
  addToGroup,
  archiveGroup,
  archiveGroupCategory,
  categoryIn,
  categorySheetTitle,
  chooseGroup,
  choosePayer,
  chooseSharers,
  closeCategorySheet,
  closeList,
  expectList,
  fillGroupExpense,
  groupAddButton,
  isDisabled,
  isNewCategoryOpen,
  isRowDisabled,
  isSplitOn,
  listOptions,
  memberIds,
  moveExpensesInSheet,
  openCategorySheet,
  openNewCategory,
  openRow,
  pickGroup,
  removeCategoryInSheet,
  removeFromGroup,
  renameInGroup,
  restoreGroup,
  rowValue,
  setSplit,
  splitRow,
  splitRows,
  splitSwitch,
  startWithGroups,
  storedGroup,
  toggleSharers,
} from './ledger-group-expense-app';
import type { Database } from '../../src/storage';

// Runs on iOS; ledger-group-expense-android.test.tsx checks what Android shows
// differently. Each test starts the app on a phone database file of its own, in
// Taipei on 2026-10-30, in a region whose currency is USD, with Taylor saved as
// your name, so your member in each group is named Taylor.

let mockOpen: () => Promise<Database>;

jest.mock('../../src/storage/expo', () => ({
  openPhoneDatabase: () => mockOpen(),
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

jest.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: {
    Light: 'light',
    Medium: 'medium',
    Heavy: 'heavy',
    Soft: 'soft',
    Rigid: 'rigid',
  },
  NotificationFeedbackType: {
    Success: 'success',
    Warning: 'warning',
    Error: 'error',
  },
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  selectionAsync: jest.fn(async () => undefined),
}));

const DEFAULT_NAMES = [
  'Food & Dining',
  'Transportation',
  'Shopping',
  'Entertainment',
  'Bills & Utilities',
  'Health',
  'Travel',
  'Other',
  'Uncategorized',
];

/** Brisbane, with Casey and Blake added after you. */
const BRISBANE = { Brisbane: ['Casey', 'Blake'] };

let directory: string;
let file: string;
let alerts: ReturnType<typeof watchAlerts>;

beforeEach(() => {
  jest.clearAllMocks();
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'group-expenses-'));
  file = path.join(directory, 'app.db');
  mockOpen = async () => phoneDatabase(file);
  allowWrites();
  resetPhone();
  alerts = watchAlerts();
  jest
    .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
    .mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
  fs.rmSync(directory, { recursive: true, force: true });
});

async function onlyExpense() {
  const expenses = await storedExpenses();
  expect(expenses).toHaveLength(1);
  return expenses[0];
}

/** Payments or shares as stored, from [member name, amount] pairs, in order. */
const allocation = (ids: Record<string, string>, entries: [string, number][]) =>
  entries.map(([name, amountMinor]) => ({
    participant: ids[name],
    amountMinor,
  }));

/** Opens New Expense on the Expenses tab and chooses the group, without choosing anyone. */
async function newExpenseIn(group: string) {
  await tapTab('Expenses');
  await openNewExpense();
  await chooseGroup(group);
}

/** Adds Brisbane's Dinner for 100.01: Casey pays, split between Blake, Taylor and Casey in that order. */
async function addDinner() {
  await addGroupExpense({
    group: 'Brisbane',
    payer: 'Casey',
    sharers: ['Blake', 'Taylor (You)', 'Casey'],
  });
  return onlyExpense();
}

// The switch

test('[LEDGER-45.1] puts an off Split with others switch under the note, with no group rows', async () => {
  await startWithGroups(BRISBANE);

  await openNewExpense();

  expect(isSplitOn()).toBe(false);
  expect(inTreeOrder(noteField(), splitSwitch())).toBe(true);
  expect(splitRows()).toEqual([]);
});

test("[LEDGER-45.1] opens a personal expense's Edit Expense with the switch off", async () => {
  await startWithGroups(BRISBANE);
  await addExpense();

  await openEditExpense((await onlyExpense()).id);

  expect(isSplitOn()).toBe(false);
  expect(splitRows()).toEqual([]);
});

// Select Group

test('[LEDGER-46.2] lists the unarchived groups in creation order in Select Group', async () => {
  await startWithGroups({ Brisbane: [], Tokyo: [], Paris: [] });
  await archiveGroup('Tokyo');
  await tapTab('Expenses');
  await openNewExpense();
  await setSplit(true);

  await openRow('Group');

  expect(listOptions('Select Group')).toEqual([
    ['Brisbane', false],
    ['Paris', false],
  ]);
});

test('[LEDGER-46.2] only shows Group, not selected when the switch is turned on, opening no list', async () => {
  await startWithGroups(BRISBANE);
  await openNewExpense();

  await setSplit(true);

  expect(isSplitOn()).toBe(true);
  expect(splitRows()).toEqual(['Group, not selected']);
  expect(barTitled('Select Group')).toBeUndefined();
});

test('[LEDGER-46.2] chooses the group pressed, and marks it when Group opens the list again', async () => {
  await startWithGroups({ Brisbane: [], Paris: [] });
  await openNewExpense();
  await setSplit(true);
  await openRow('Group');

  await pickGroup('Brisbane');

  expect(isSplitOn()).toBe(true);
  expect(rowValue('Group')).toBe('Brisbane');
  await openRow('Group');
  expect(listOptions('Select Group')).toEqual([
    ['Brisbane', true],
    ['Paris', false],
  ]);
});

test('[LEDGER-46.2] lists no groups, only a disabled No Groups, when there are none yet', async () => {
  await startWithGroups();
  await openNewExpense();
  await setSplit(true);

  await openRow('Group');

  expect(listOptions('Select Group')).toEqual([]);
  expect(menuField('Group').props.empty).toBe('No Groups');
});

// The rows under the switch

test('[LEDGER-47.1] shows only Group, not selected until a group is chosen', async () => {
  await startWithGroups(BRISBANE);
  await openNewExpense();
  await setSplit(true);

  await closeList('Select Group');

  expect(splitRows()).toEqual(['Group, not selected']);
  expect(inTreeOrder(splitSwitch(), splitRow('Group'))).toBe(true);
});

test('[LEDGER-47.1] adds Paid by and Split between under Group once a group is chosen', async () => {
  await startWithGroups(BRISBANE);
  await openNewExpense();

  await chooseGroup('Brisbane');

  expect(splitRows()).toEqual([
    'Group, Brisbane',
    'Paid by, not selected',
    'Split between, Choose people',
  ]);
});

test('[LEDGER-47.1] names the payer, with (You) for your member, and counts the people to split between', async () => {
  await startWithGroups(BRISBANE);
  await newExpenseIn('Brisbane');

  await choosePayer('Taylor (You)');
  await chooseSharers('Casey', 'Taylor (You)');

  expect(splitRows()).toEqual([
    'Group, Brisbane',
    'Paid by, Taylor (You)',
    'Split between, 2 people',
  ]);
  await openRow('Split between');
  await toggleSharers('Taylor (You)');
  await closeList('Split Between');
  expect(rowValue('Split between')).toBe('1 person');
});

test('[LEDGER-47.1] names a payer removed from the group by their stored name, and still counts removed people in the split', async () => {
  await startWithGroups(BRISBANE);
  const dinner = await addDinner();
  await removeFromGroup('Brisbane', 'Casey');
  await removeFromGroup('Brisbane', 'Blake');

  await openEditExpense(dinner.id);

  expect(rowValue('Paid by')).toBe('Casey');
  expect(rowValue('Split between')).toBe('3 people');
});

test('[LEDGER-47.1] hides Group, Paid by and Split between when the switch is turned off', async () => {
  await startWithGroups(BRISBANE);
  await newExpenseIn('Brisbane');

  await setSplit(false);

  expect(splitRows()).toEqual([]);
});

// Who Paid?

test("[LEDGER-48.2] lists the group's members in the order of Members in Who Paid?", async () => {
  await startWithGroups(BRISBANE);
  await newExpenseIn('Brisbane');

  await openRow('Paid by');

  expect(listOptions('Who Paid?')).toEqual([
    ['Taylor (You)', false],
    ['Casey', false],
    ['Blake', false],
  ]);
});

test('[LEDGER-48.2] chooses the member pressed as the payer, and marks them next time', async () => {
  await startWithGroups(BRISBANE);
  await newExpenseIn('Brisbane');

  await choosePayer('Casey');

  expect(rowValue('Paid by')).toBe('Casey');
  await openRow('Paid by');
  expect(listOptions('Who Paid?')).toEqual([
    ['Taylor (You)', false],
    ['Casey', true],
    ['Blake', false],
  ]);
});

test('[LEDGER-48.2] leaves former members out of Who Paid?', async () => {
  await startWithGroups(BRISBANE);
  await removeFromGroup('Brisbane', 'Casey');
  await newExpenseIn('Brisbane');

  await openRow('Paid by');

  expect(listOptions('Who Paid?')).toEqual([
    ['Taylor (You)', false],
    ['Blake', false],
  ]);
});

// Split Between

test('[LEDGER-49.2] marks the people pressed in Split Between and splits in the order they were chosen', async () => {
  await startWithGroups(BRISBANE);
  const ids = await memberIds(file, 'Brisbane');
  await newExpenseIn('Brisbane');
  await fillForm({ amount: '100.01', title: 'Dinner' });
  await choosePayer('Taylor (You)');
  await openRow('Split between');

  await toggleSharers('Casey', 'Taylor (You)');

  expect(listOptions('Split Between')).toEqual([
    ['Taylor (You)', true],
    ['Casey', true],
    ['Blake', false],
  ]);
  await closeList('Split Between');
  expect(rowValue('Split between')).toBe('2 people');
  await press('Add');
  expect((await onlyExpense()).shares).toEqual(
    allocation(ids, [
      ['Casey', 5001],
      ['Taylor', 5000],
    ]),
  );
});

test('[LEDGER-49.2] takes a person out of the split when they are pressed again', async () => {
  await startWithGroups(BRISBANE);
  await newExpenseIn('Brisbane');
  await chooseSharers('Casey', 'Taylor (You)');

  await openRow('Split between');
  await toggleSharers('Casey');

  expect(listOptions('Split Between')).toEqual([
    ['Taylor (You)', true],
    ['Casey', false],
    ['Blake', false],
  ]);
  await closeList('Split Between');
  expect(rowValue('Split between')).toBe('1 person');
});

test('[LEDGER-49.2] puts a person taken out and chosen again at the end of the split', async () => {
  await startWithGroups(BRISBANE);
  const ids = await memberIds(file, 'Brisbane');
  await newExpenseIn('Brisbane');
  await fillForm({ amount: '100.01', title: 'Dinner' });
  await choosePayer('Casey');

  await chooseSharers('Casey', 'Taylor (You)', 'Blake', 'Casey', 'Casey');
  await press('Add');

  expect((await onlyExpense()).shares).toEqual(
    allocation(ids, [
      ['Taylor', 3334],
      ['Blake', 3334],
      ['Casey', 3333],
    ]),
  );
});

test('[LEDGER-49.2] leaves former members out of Split Between', async () => {
  await startWithGroups(BRISBANE);
  await removeFromGroup('Brisbane', 'Casey');
  await newExpenseIn('Brisbane');

  await openRow('Split between');

  expect(listOptions('Split Between')).toEqual([
    ['Taylor (You)', false],
    ['Blake', false],
  ]);
});

// Choosing another group

test('[LEDGER-50.1] clears the payer and the split when another group is chosen', async () => {
  await startWithGroups({ ...BRISBANE, Tokyo: ['Casey'] });
  await newExpenseIn('Brisbane');
  await choosePayer('Taylor (You)');
  await chooseSharers('Casey');

  await openRow('Group');
  await pickGroup('Tokyo');

  expect(splitRows()).toEqual([
    'Group, Tokyo',
    'Paid by, not selected',
    'Split between, Choose people',
  ]);
});

test('[LEDGER-50.1] keeps the payer and the split when the same group is chosen again', async () => {
  await startWithGroups({ ...BRISBANE, Tokyo: [] });
  await newExpenseIn('Brisbane');
  await choosePayer('Taylor (You)');
  await chooseSharers('Casey');

  await openRow('Group');
  await pickGroup('Brisbane');

  expect(splitRows()).toEqual([
    'Group, Brisbane',
    'Paid by, Taylor (You)',
    'Split between, 1 person',
  ]);
});

test('[LEDGER-50.1] clears the group, the payer and the split when the switch is turned off', async () => {
  await startWithGroups(BRISBANE);
  await newExpenseIn('Brisbane');
  await choosePayer('Taylor (You)');
  await chooseSharers('Casey');

  await setSplit(false);
  await setSplit(true);

  await expectList('Select Group');
  expect(listOptions('Select Group')).toEqual([['Brisbane', false]]);
  await pickGroup('Brisbane');
  expect(splitRows()).toEqual([
    'Group, Brisbane',
    'Paid by, not selected',
    'Split between, Choose people',
  ]);
});

// The category when the form's space changes

test("[LEDGER-51.1] switches to the group's category of the same name when a group is chosen", async () => {
  await startWithGroups(BRISBANE);
  const brisbane = await storedGroup(file, 'Brisbane');
  await openNewExpense();
  await fillForm({ amount: '8.75', title: 'Socks', category: 'Shopping' });

  await chooseGroup('Brisbane');

  expect(formCategory()).toBe('Shopping');
  await choosePayer('Taylor (You)');
  await chooseSharers('Taylor (You)');
  await press('Add');
  expect((await onlyExpense()).category).toEqual(
    await categoryIn(file, brisbane.id, 'Shopping'),
  );
});

test('[LEDGER-51.1] matches category names whatever their case', async () => {
  await startWithGroups(BRISBANE);
  const brisbane = await storedGroup(file, 'Brisbane');
  await addCategory('Gym');
  await addCategory('GYM', brisbane.id);
  await openNewExpense();
  await chooseCategory('Gym');

  await chooseGroup('Brisbane');

  expect(formCategory()).toBe('GYM');
});

test("[LEDGER-51.1] switches to the group's Uncategorized when the group has no category of that name", async () => {
  await startWithGroups(BRISBANE);
  const brisbane = await storedGroup(file, 'Brisbane');
  await addCategory('Gym');
  await openNewExpense();
  await fillForm({ amount: '8.75', title: 'Spin class', category: 'Gym' });

  await chooseGroup('Brisbane');

  expect(formCategory()).toBe('Uncategorized');
  await choosePayer('Taylor (You)');
  await chooseSharers('Taylor (You)');
  await press('Add');
  expect((await onlyExpense()).category).toEqual(
    await categoryIn(file, brisbane.id, 'Uncategorized'),
  );
});

test("[LEDGER-51.1] switches to Uncategorized when the group's category of that name is archived", async () => {
  await startWithGroups(BRISBANE);
  const brisbane = await storedGroup(file, 'Brisbane');
  await addGroupExpense({
    group: 'Brisbane',
    payer: 'Casey',
    sharers: ['Casey'],
    category: 'Shopping',
  });
  await archiveGroupCategory(brisbane.id, 'Shopping');
  await openNewExpense();
  await chooseCategory('Shopping');

  await chooseGroup('Brisbane');

  expect(formCategory()).toBe('Uncategorized');
});

test("[LEDGER-51.1] switches to the other group's category of the same name when the group changes", async () => {
  await startWithGroups({ Brisbane: [], Tokyo: [] });
  const brisbane = await storedGroup(file, 'Brisbane');
  const tokyo = await storedGroup(file, 'Tokyo');
  await addCategory('Flights', brisbane.id);
  await addCategory('Flights', tokyo.id);
  await newExpenseIn('Brisbane');
  await fillForm({ amount: '420', title: 'Flight', category: 'Flights' });

  await openRow('Group');
  await pickGroup('Tokyo');

  expect(formCategory()).toBe('Flights');
  await choosePayer('Taylor (You)');
  await chooseSharers('Taylor (You)');
  await press('Add');
  expect((await onlyExpense()).category).toEqual(
    await categoryIn(file, tokyo.id, 'Flights'),
  );
});

test('[LEDGER-51.1] switches to the personal Uncategorized when the switch is turned off on a group category', async () => {
  await startWithGroups(BRISBANE);
  const brisbane = await storedGroup(file, 'Brisbane');
  const identity = await readIdentity();
  await addCategory('Flights', brisbane.id);
  await newExpenseIn('Brisbane');
  await fillForm({ amount: '420', title: 'Flight', category: 'Flights' });

  await setSplit(false);

  expect(formCategory()).toBe('Uncategorized');
  await press('Add');
  expect((await onlyExpense()).category).toEqual(
    await categoryIn(file, identity.personalSpaceId, 'Uncategorized'),
  );
});

// New Expense from a group's URL

test("[LEDGER-52.1] opens New Expense with the URL's group chosen and no one chosen yet", async () => {
  await startWithGroups(BRISBANE);
  const brisbane = await storedGroup(file, 'Brisbane');
  await editCategory('Food & Dining', 'Meals', undefined, brisbane.id);

  await push(`/expenses/new?groupId=${brisbane.id}`);
  await expectForm('New Expense');

  expect(isSplitOn()).toBe(true);
  expect(splitRows()).toEqual([
    'Group, Brisbane',
    'Paid by, not selected',
    'Split between, Choose people',
  ]);
  expect(formCategory()).toBe('Meals');
});

test("[LEDGER-52.1] opens New Expense as usual for an ID that is no group's", async () => {
  await startWithGroups(BRISBANE);

  await push(`/expenses/new?groupId=${NO_GROUP_ID}`);
  await expectForm('New Expense');

  expect(isSplitOn()).toBe(false);
  expect(formCategory()).toBe('Food & Dining');
});

test('[LEDGER-52.1] opens New Expense as usual for an archived group, which Select Group leaves out', async () => {
  await startWithGroups({ ...BRISBANE, Tokyo: [] });
  const brisbane = await storedGroup(file, 'Brisbane');
  await archiveGroup('Brisbane');

  await push(`/expenses/new?groupId=${brisbane.id}`);
  await expectForm('New Expense');

  expect(isSplitOn()).toBe(false);
  await setSplit(true);
  await expectList('Select Group');
  expect(listOptions('Select Group')).toEqual([['Tokyo', false]]);
});

// When Add or Save can be pressed

test('[LEDGER-53.1] disables Add while no group is chosen', async () => {
  await startWithGroups(BRISBANE);
  await openNewExpense();
  await fillForm({ amount: '8.75', title: 'Coffee' });

  await setSplit(true);
  await closeList('Select Group');

  expect(formButton('Add').disabled).toBe(true);
});

test('[LEDGER-53.1] disables Add until a payer is chosen', async () => {
  await startWithGroups(BRISBANE);
  await newExpenseIn('Brisbane');
  await fillForm({ amount: '8.75', title: 'Coffee' });

  await chooseSharers('Casey');

  expect(formButton('Add').disabled).toBe(true);
  await choosePayer('Taylor (You)');
  expect(formButton('Add').disabled).toBe(false);
});

test('[LEDGER-53.1] disables Add while nobody is in the split', async () => {
  await startWithGroups(BRISBANE);
  await newExpenseIn('Brisbane');
  await fillForm({ amount: '8.75', title: 'Coffee' });
  await choosePayer('Taylor (You)');

  expect(formButton('Add').disabled).toBe(true);
  await chooseSharers('Casey', 'Casey');
  expect(formButton('Add').disabled).toBe(true);
});

test("[LEDGER-53.1] disables Save when everyone is taken out of a group expense's split", async () => {
  await startWithGroups(BRISBANE);
  const dinner = await addDinner();
  await openEditExpense(dinner.id);
  await fillForm({ title: 'Supper' });

  await chooseSharers('Blake', 'Taylor (You)', 'Casey');

  expect(formButton('Save').disabled).toBe(true);
});

// Adding a group expense

test('[LEDGER-54.1] adds a group expense paid in full by the payer and split evenly in the order chosen', async () => {
  await startWithGroups(BRISBANE);
  const brisbane = await storedGroup(file, 'Brisbane');
  const ids = await memberIds(file, 'Brisbane');

  await addDinner();

  expect(await storedExpenses()).toEqual([
    {
      id: expect.any(String),
      title: 'Dinner',
      amountMinor: 10001,
      currency: 'USD',
      date: '2026-10-30',
      category: await categoryIn(file, brisbane.id, 'Food & Dining'),
      spaceId: brisbane.id,
      payments: allocation(ids, [['Casey', 10001]]),
      shares: allocation(ids, [
        ['Blake', 3334],
        ['Taylor', 3334],
        ['Casey', 3333],
      ]),
    },
  ]);
});

test('[LEDGER-54.1] leaves the payer out of the split when they are not chosen', async () => {
  await startWithGroups(BRISBANE);
  const ids = await memberIds(file, 'Brisbane');

  await addGroupExpense({
    group: 'Brisbane',
    payer: 'Taylor (You)',
    sharers: ['Casey', 'Blake'],
  });

  const dinner = await onlyExpense();
  expect(dinner.payments).toEqual(allocation(ids, [['Taylor', 10001]]));
  expect(dinner.shares).toEqual(
    allocation(ids, [
      ['Casey', 5001],
      ['Blake', 5000],
    ]),
  );
});

test('[LEDGER-54.1] adds a group expense that you neither paid nor share', async () => {
  await startWithGroups(BRISBANE);
  const ids = await memberIds(file, 'Brisbane');

  await addGroupExpense({
    group: 'Brisbane',
    payer: 'Casey',
    sharers: ['Blake'],
  });

  const dinner = await onlyExpense();
  expect(dinner.payments).toEqual(allocation(ids, [['Casey', 10001]]));
  expect(dinner.shares).toEqual(allocation(ids, [['Blake', 10001]]));
});

test('[LEDGER-54.1] keeps a share of 0 when the amount is smaller than the number of people', async () => {
  await startWithGroups(BRISBANE);
  const ids = await memberIds(file, 'Brisbane');

  await addGroupExpense({
    group: 'Brisbane',
    payer: 'Casey',
    sharers: ['Casey', 'Blake'],
    amount: '0.01',
  });

  expect((await onlyExpense()).shares).toEqual(
    allocation(ids, [
      ['Casey', 1],
      ['Blake', 0],
    ]),
  );
});

test('[LEDGER-54.1] adds one group expense when Add is pressed twice before the save finishes', async () => {
  await startWithGroups(BRISBANE);
  await openNewExpense();
  await fillGroupExpense({
    group: 'Brisbane',
    payer: 'Casey',
    sharers: ['Casey'],
  });
  const writes = holdWrites();
  const add = formButton('Add');

  await act(async () => {
    await add.press();
    await add.press();
  });
  await writes.release();
  await settle();

  await expectFormClosed();
  expect(await storedExpenses()).toHaveLength(1);
});

test('[LEDGER-26.1] stores nothing of a group expense whose save fails partway, at any write', async () => {
  await startWithGroups(BRISBANE);
  await openNewExpense();
  await fillGroupExpense({
    group: 'Brisbane',
    payer: 'Casey',
    sharers: ['Blake', 'Taylor (You)', 'Casey'],
  });

  for (let written = 1; ; written += 1) {
    if (written > 50) throw new Error('The save never went through');
    const shown = alerts.shown().length;
    failWritesAfter(written);
    await press('Add');
    await waitFor(() =>
      expect(formTitle() === undefined || alerts.shown().length > shown).toBe(
        true,
      ),
    );
    if (formTitle() === undefined) break;
    expect(alerts.shown().at(-1)).toEqual(SAVE_FAILED);
    expect(await storedExpenses()).toEqual([]);
  }
  allowWrites();
  const dinner = await onlyExpense();
  expect(dinner.shares).toHaveLength(3);
  expect(dinner.payments).toHaveLength(1);
});

// Editing a group expense

test("[LEDGER-55.1] opens a group expense's Edit Expense with its group, payer and split, the switch and Group disabled", async () => {
  await startWithGroups(BRISBANE);
  const dinner = await addDinner();

  await openEditExpense(dinner.id);

  expect(isSplitOn()).toBe(true);
  expect(isDisabled(splitSwitch())).toBe(true);
  expect(isRowDisabled('Group')).toBe(true);
  expect(splitRows()).toEqual([
    'Group, Brisbane',
    'Paid by, Casey',
    'Split between, 3 people',
  ]);
  await openRow('Split between');
  expect(listOptions('Split Between')).toEqual([
    ['Taylor (You)', true],
    ['Casey', true],
    ['Blake', true],
  ]);
});

test('[LEDGER-55.1] names the payer by their current name', async () => {
  await startWithGroups(BRISBANE);
  const dinner = await addDinner();
  await renameInGroup('Brisbane', 'Casey', 'Cass');

  await openEditExpense(dinner.id);

  expect(rowValue('Paid by')).toBe('Cass');
});

test("[LEDGER-55.1] lists the group's categories in a group expense's Edit Expense", async () => {
  await startWithGroups(BRISBANE);
  const brisbane = await storedGroup(file, 'Brisbane');
  await addCategory('Flights', brisbane.id);
  const dinner = await addDinner();
  await openEditExpense(dinner.id);

  await openCategoryList();

  expect(
    categoryOptions([...DEFAULT_NAMES, 'Flights']).map(([name]) => name),
  ).toEqual([...DEFAULT_NAMES, 'Flights']);
});

test('[LEDGER-56.1] splits a changed amount again in the stored order', async () => {
  await startWithGroups(BRISBANE);
  const ids = await memberIds(file, 'Brisbane');
  const dinner = await addDinner();
  await openEditExpense(dinner.id);

  await fillForm({ amount: '100.00' });
  await press('Save');

  await expectFormClosed();
  const saved = await onlyExpense();
  expect(saved.id).toBe(dinner.id);
  expect(saved.spaceId).toBe(dinner.spaceId);
  expect(saved.payments).toEqual(allocation(ids, [['Casey', 10000]]));
  expect(saved.shares).toEqual(
    allocation(ids, [
      ['Blake', 3334],
      ['Taylor', 3333],
      ['Casey', 3333],
    ]),
  );
});

test('[LEDGER-56.1] changes the payer and keeps the split', async () => {
  await startWithGroups(BRISBANE);
  const ids = await memberIds(file, 'Brisbane');
  const dinner = await addDinner();
  await openEditExpense(dinner.id);

  await choosePayer('Taylor (You)');
  await press('Save');

  const saved = await onlyExpense();
  expect(saved.payments).toEqual(allocation(ids, [['Taylor', 10001]]));
  expect(saved.shares).toEqual(dinner.shares);
});

test('[LEDGER-56.1] puts someone added to the split at the end', async () => {
  await startWithGroups(BRISBANE);
  const ids = await memberIds(file, 'Brisbane');
  await addGroupExpense({
    group: 'Brisbane',
    payer: 'Casey',
    sharers: ['Blake', 'Taylor (You)'],
  });
  await openEditExpense((await onlyExpense()).id);

  await chooseSharers('Casey');
  await press('Save');

  expect((await onlyExpense()).shares).toEqual(
    allocation(ids, [
      ['Blake', 3334],
      ['Taylor', 3334],
      ['Casey', 3333],
    ]),
  );
});

test('[LEDGER-56.1] moves someone taken out and chosen again to the end of the split', async () => {
  await startWithGroups(BRISBANE);
  const ids = await memberIds(file, 'Brisbane');
  const dinner = await addDinner();
  await openEditExpense(dinner.id);

  await chooseSharers('Blake', 'Blake');
  await fillForm({ title: 'Supper' });
  await press('Save');

  expect((await onlyExpense()).shares).toEqual(
    allocation(ids, [
      ['Taylor', 3334],
      ['Casey', 3334],
      ['Blake', 3333],
    ]),
  );
});

test('[LEDGER-57.1] turns a personal expense into a group expense, keeping its ID and currency', async () => {
  await startWithGroups(BRISBANE);
  const brisbane = await storedGroup(file, 'Brisbane');
  const ids = await memberIds(file, 'Brisbane');
  await addExpense();
  const coffee = await onlyExpense();
  await openEditExpense(coffee.id);

  await chooseGroup('Brisbane');
  await choosePayer('Taylor (You)');
  await chooseSharers('Taylor (You)', 'Casey');
  await press('Save');

  await expectFormClosed();
  expect(await storedExpenses()).toEqual([
    {
      ...coffee,
      spaceId: brisbane.id,
      category: await categoryIn(file, brisbane.id, 'Food & Dining'),
      payments: allocation(ids, [['Taylor', 875]]),
      shares: allocation(ids, [
        ['Taylor', 438],
        ['Casey', 437],
      ]),
    },
  ]);
});

test('[LEDGER-57.1] locks the switch when the expense turned into a group expense is opened again', async () => {
  await startWithGroups(BRISBANE);
  await addExpense();
  const coffee = await onlyExpense();
  await openEditExpense(coffee.id);
  await chooseGroup('Brisbane');
  await choosePayer('Taylor (You)');
  await chooseSharers('Taylor (You)');
  await press('Save');
  await expectFormClosed();

  await openEditExpense(coffee.id);

  expect(isSplitOn()).toBe(true);
  expect(isDisabled(splitSwitch())).toBe(true);
});

test('[LEDGER-58.1] keeps the order of the split after a restart, for the stored expense and its next save', async () => {
  const app = await startWithGroups(BRISBANE);
  const ids = await memberIds(file, 'Brisbane');
  const dinner = await addDinner();

  await restart(app);

  expect((await onlyExpense()).shares).toEqual(dinner.shares);
  await openEditExpense(dinner.id);
  await fillForm({ amount: '100.00' });
  await press('Save');
  expect((await onlyExpense()).shares).toEqual(
    allocation(ids, [
      ['Blake', 3334],
      ['Taylor', 3333],
      ['Casey', 3333],
    ]),
  );
});

// The split's fields are form fields

test('[LEDGER-59.1] asks before discarding when only the switch was turned on', async () => {
  await startWithGroups(BRISBANE);
  await openNewExpense();
  await setSplit(true);
  await closeList('Select Group');

  await press('Cancel');

  expect(alerts.shown()).toEqual([DISCARD_CHANGES]);
  expect(formTitle()).toBe('New Expense');
});

test('[LEDGER-59.1] closes without asking when the switch was turned on and off again', async () => {
  await startWithGroups(BRISBANE);
  await openNewExpense();
  await chooseGroup('Brisbane');
  await setSplit(false);

  await press('Cancel');

  await expectFormClosed();
  expect(alerts.shown()).toEqual([]);
});

test('[LEDGER-59.1] enables Save when only the payer changes, and disables it once the payer is changed back', async () => {
  await startWithGroups(BRISBANE);
  const dinner = await addDinner();
  await openEditExpense(dinner.id);

  await choosePayer('Taylor (You)');
  expect(formButton('Save').disabled).toBe(false);

  await choosePayer('Casey');
  expect(formButton('Save').disabled).toBe(true);
});

test('[LEDGER-59.1] enables Save, and asks before discarding, when only the people in the split change', async () => {
  await startWithGroups(BRISBANE);
  const dinner = await addDinner();
  await openEditExpense(dinner.id);

  await chooseSharers('Blake');

  expect(formButton('Save').disabled).toBe(false);
  await press('Cancel');
  expect(alerts.shown()).toEqual([DISCARD_CHANGES]);
  expect(formTitle()).toBe('Edit Expense');
});

test('[LEDGER-59.1] keeps Save disabled when someone is taken out of the split and chosen again', async () => {
  await startWithGroups(BRISBANE);
  const dinner = await addDinner();
  await openEditExpense(dinner.id);

  await chooseSharers('Blake', 'Blake');

  expect(formButton('Save').disabled).toBe(true);
});

test('[LEDGER-59.1] locks the switch and the rows under it while the expense is saved', async () => {
  await startWithGroups(BRISBANE);
  await openNewExpense();
  await fillGroupExpense({
    group: 'Brisbane',
    payer: 'Casey',
    sharers: ['Casey'],
  });
  const writes = holdWrites();

  await press('Add');

  expect(isDisabled(splitSwitch())).toBe(true);
  expect(isRowDisabled('Group')).toBe(true);
  expect(isRowDisabled('Paid by')).toBe(true);
  expect(isRowDisabled('Split between')).toBe(true);
  await writes.release();
  await settle();
  await expectFormClosed();
});

// Former members

test('[LEDGER-60.1] locks the amount, the payer and the split when someone in the split was removed', async () => {
  await startWithGroups(BRISBANE);
  const dinner = await addDinner();
  await removeFromGroup('Brisbane', 'Blake');

  await openEditExpense(dinner.id);

  expect(amountField()).toBeDisabled();
  expect(isRowDisabled('Paid by')).toBe(true);
  expect(isRowDisabled('Split between')).toBe(true);
  const lock = within(formScreen()).getByText(FORMER_MEMBER_LOCK);
  expect(inTreeOrder(amountField(), lock)).toBe(true);
  expect(titleField()).not.toBeDisabled();
});

test('[LEDGER-60.1] saves the other changes and keeps the payments and shares as they were', async () => {
  await startWithGroups(BRISBANE);
  const dinner = await addDinner();
  await removeFromGroup('Brisbane', 'Blake');
  await openEditExpense(dinner.id);

  await fillForm({ title: 'Supper', category: 'Entertainment' });
  await press('Save');

  await expectFormClosed();
  const saved = await onlyExpense();
  expect(saved.title).toBe('Supper');
  expect(saved.category.name).toBe('Entertainment');
  expect(saved.payments).toEqual(dinner.payments);
  expect(saved.shares).toEqual(dinner.shares);
});

test('[LEDGER-60.1] locks the amount, the payer and the split when the payer was removed, and still saves the other changes', async () => {
  await startWithGroups(BRISBANE);
  const dinner = await addDinner();
  await removeFromGroup('Brisbane', 'Casey');

  await openEditExpense(dinner.id);

  expect(amountField()).toBeDisabled();
  expect(isRowDisabled('Paid by')).toBe(true);
  expect(isRowDisabled('Split between')).toBe(true);
  expect(within(formScreen()).getByText(FORMER_MEMBER_LOCK)).toBeOnTheScreen();

  await fillForm({ title: 'Supper' });
  await press('Save');

  await expectFormClosed();
  const saved = await onlyExpense();
  expect(saved.title).toBe('Supper');
  expect(saved.payments).toEqual(dinner.payments);
  expect(saved.shares).toEqual(dinner.shares);
});

test('[LEDGER-60.1] unlocks them once the former member is added back', async () => {
  await startWithGroups(BRISBANE);
  const dinner = await addDinner();
  await removeFromGroup('Brisbane', 'Blake');
  await addToGroup('Brisbane', 'Blake');

  await openEditExpense(dinner.id);

  expect(amountField()).not.toBeDisabled();
  expect(isRowDisabled('Paid by')).toBe(false);
  expect(isRowDisabled('Split between')).toBe(false);
  expect(within(formScreen()).queryByText(FORMER_MEMBER_LOCK)).toBeNull();
});

// Archived groups

test("[LEDGER-61.1] refuses to save an archived group's expense and keeps the form open", async () => {
  await startWithGroups(BRISBANE);
  const dinner = await addDinner();
  await archiveGroup('Brisbane');
  await openEditExpense(dinner.id);
  await fillForm({ title: 'Supper' });

  await press('Save');

  expect(alerts.shown()).toEqual([HISTORICAL]);
  expect(formTitle()).toBe('Edit Expense');
  expect(titleField().props.value).toBe('Supper');
  expect(await storedExpenses()).toEqual([dinner]);
});

test('[LEDGER-61.1] saves the expense again once its group is restored', async () => {
  await startWithGroups(BRISBANE);
  const dinner = await addDinner();
  await archiveGroup('Brisbane');
  await restoreGroup('Brisbane');
  await openEditExpense(dinner.id);
  await fillForm({ title: 'Supper' });

  await press('Save');

  await expectFormClosed();
  expect((await onlyExpense()).title).toBe('Supper');
  expect(alerts.shown()).toEqual([]);
});

// + Add New Category

test('[LEDGER-62.2] opens New Category over New Expense from + Add New Category', async () => {
  const app = await startWithGroups(BRISBANE);
  await openNewExpense();
  await fillForm({ amount: '8.75', title: 'Coffee' });

  await openNewCategory();

  expect(barTitled('New Category')).toBeDefined();
  expect(formTitle()).toBe('New Expense');
  expect(barAction('New Category', 'Cancel').disabled).toBe(false);
  expect(barAction('New Category', 'Add').disabled).toBe(true);
  expect(categorySheetTitle()).toBeUndefined();
  expect(app.getPathname()).toBe('/expenses/new');
});

test('[LEDGER-62.2] selects the new category and returns to the form with its inputs once it is added', async () => {
  await startWithGroups(BRISBANE);
  await openNewExpense();
  await fillForm({ amount: '8.75', title: 'Coffee' });

  await addNewCategoryFromForm('Gym');

  expect(formTitle()).toBe('New Expense');
  expect(amountField().props.value).toBe('8.75');
  expect(titleField().props.value).toBe('Coffee');
  expect(formCategory()).toBe('Gym');
  await openCategoryList();
  expect(categoryOptions([...DEFAULT_NAMES, 'Gym', ADD_NEW_CATEGORY])).toEqual([
    ...DEFAULT_NAMES.map((name) => [name, false] as const),
    ['Gym', true],
    [ADD_NEW_CATEGORY, false],
  ]);
});

test("[LEDGER-62.2] adds the category to the group when the form's space is a group", async () => {
  await startWithGroups(BRISBANE);
  const brisbane = await storedGroup(file, 'Brisbane');
  const identity = await readIdentity();
  await newExpenseIn('Brisbane');

  await addNewCategoryFromForm('Flights');

  expect(formCategory()).toBe('Flights');
  await expect(categoryIn(file, brisbane.id, 'Flights')).resolves.toMatchObject(
    { name: 'Flights' },
  );
  await expect(
    categoryIn(file, identity.personalSpaceId, 'Flights'),
  ).rejects.toThrow('No category named Flights');
});

test('[LEDGER-62.2] keeps New Category open and shows why on a name the space already uses', async () => {
  await startWithGroups(BRISBANE);
  await openNewExpense();
  await openNewCategory();
  await fireEvent.changeText(
    screen.getByLabelText('Category name'),
    'shopping',
  );

  await pressOnBar('New Category', 'Add');

  expect(isNewCategoryOpen()).toBe(true);
  expect(
    screen.getByText('A category with this name already exists.'),
  ).toBeOnTheScreen();
  expect(formCategory()).toBe('Food & Dining');
});

test.each([
  ['Cancel is pressed', () => pressOnBar('New Category', 'Cancel')],
  ['New Category is swiped down', () => swipeDown('New Category')],
])(
  '[LEDGER-62.2] keeps the category and the inputs, and adds nothing, when %s',
  async (_when, close) => {
    await startWithGroups(BRISBANE);
    const identity = await readIdentity();
    await openNewExpense();
    await fillForm({ amount: '8.75', title: 'Coffee' });
    await openNewCategory();
    await fireEvent.changeText(screen.getByLabelText('Category name'), 'Gym');
    await settle();

    await close();

    await waitFor(() => expect(isNewCategoryOpen()).toBe(false));
    expect(formTitle()).toBe('New Expense');
    expect(amountField().props.value).toBe('8.75');
    expect(titleField().props.value).toBe('Coffee');
    expect(formCategory()).toBe('Food & Dining');
    await expect(
      categoryIn(file, identity.personalSpaceId, 'Gym'),
    ).rejects.toThrow('No category named Gym');
  },
);

test("[LEDGER-63.1] switches to the personal Uncategorized when the form's category is deleted", async () => {
  await startWithGroups(BRISBANE);
  const identity = await readIdentity();
  await openNewExpense();
  await addNewCategoryFromForm('Gym');
  await openCategorySheet();

  await removeCategoryInSheet('Gym', 'Delete');
  await closeCategorySheet();

  expect(formCategory()).toBe('Uncategorized');
  await openCategoryList();
  expect(categoryOptions(DEFAULT_NAMES)).toEqual(
    DEFAULT_NAMES.map((name) => [name, name === 'Uncategorized'] as const),
  );
  await fillForm({ amount: '8.75', title: 'Spin class' });
  await press('Add');
  expect((await onlyExpense()).category).toEqual(
    await categoryIn(file, identity.personalSpaceId, 'Uncategorized'),
  );
});

test("[LEDGER-63.1] switches to the group's Uncategorized when the form's group category is deleted", async () => {
  await startWithGroups(BRISBANE);
  const brisbane = await storedGroup(file, 'Brisbane');
  await newExpenseIn('Brisbane');
  await addNewCategoryFromForm('Flights');
  await openCategorySheet(brisbane.id);

  await removeCategoryInSheet('Flights', 'Delete');
  await closeCategorySheet();

  expect(formCategory()).toBe('Uncategorized');
  await openCategoryList();
  expect(categoryOptions(DEFAULT_NAMES)).toEqual(
    DEFAULT_NAMES.map((name) => [name, name === 'Uncategorized'] as const),
  );
  await fillForm({ amount: '420', title: 'Flight' });
  await choosePayer('Taylor (You)');
  await chooseSharers('Taylor (You)');
  await press('Add');
  expect((await onlyExpense()).category).toEqual(
    await categoryIn(file, brisbane.id, 'Uncategorized'),
  );
});

// The category list and New Expense from a group

test('[LEDGER-17.5] ends the category list with + Add New Category', async () => {
  await startWithGroups(BRISBANE);
  await openNewExpense();

  await openCategoryList();

  expect(categoryOptions([...DEFAULT_NAMES, ADD_NEW_CATEGORY])).toEqual([
    ...DEFAULT_NAMES.map((name) => [name, name === 'Food & Dining'] as const),
    [ADD_NEW_CATEGORY, false],
  ]);
});

test("[LEDGER-17.5] lists the chosen group's categories", async () => {
  await startWithGroups(BRISBANE);
  const brisbane = await storedGroup(file, 'Brisbane');
  await addCategory('Flights', brisbane.id);
  await editCategory('Shopping', 'Groceries', undefined, brisbane.id);
  const names = DEFAULT_NAMES.map((name) =>
    name === 'Shopping' ? 'Groceries' : name,
  );
  await newExpenseIn('Brisbane');

  await openCategoryList();

  expect(
    categoryOptions([
      ...DEFAULT_NAMES,
      'Groceries',
      'Flights',
      ADD_NEW_CATEGORY,
    ]).map(([name]) => name),
  ).toEqual([...names, 'Flights', ADD_NEW_CATEGORY]);
});

test("[LEDGER-17.5] leaves + Add New Category out of the list on an archived group's expense", async () => {
  await startWithGroups(BRISBANE);
  await addGroupExpense({
    group: 'Brisbane',
    payer: 'Casey',
    sharers: ['Taylor (You)', 'Casey'],
  });
  const dinner = await onlyExpense();
  await archiveGroup('Brisbane');
  await tapTab('Expenses');
  await settle();
  await openEditExpense(dinner.id);

  await openCategoryList();

  expect(
    categoryOptions([...DEFAULT_NAMES, ADD_NEW_CATEGORY]).map(([name]) => name),
  ).toEqual(DEFAULT_NAMES);
});

test('[LEDGER-17.5] keeps the form on a category archived while the form is open, and saves it', async () => {
  await startWithGroups(BRISBANE);
  await addCategory('Gym');
  await addExpense({ title: 'Yoga', category: 'Gym' });
  const yoga = await onlyExpense();
  await openEditExpense(yoga.id);
  await openCategorySheet();

  await removeCategoryInSheet('Gym', 'Archive');
  await closeCategorySheet();

  expect(formCategory()).toBe('Gym');
  await fillForm({ title: 'Spin class' });
  await press('Save');
  expect((await onlyExpense()).category).toEqual(yoga.category);
});

test('[LEDGER-17.5] keeps the form on a category whose expenses were moved away while the form is open', async () => {
  await startWithGroups(BRISBANE);
  await addCategory('Gym');
  await addExpense({ title: 'Yoga', category: 'Gym' });
  const yoga = await onlyExpense();
  await openEditExpense(yoga.id);
  await openCategorySheet();

  await moveExpensesInSheet('Gym', 'Shopping');
  await closeCategorySheet();

  expect(formCategory()).toBe('Gym');
  await fillForm({ title: 'Spin class' });
  await press('Save');
  expect((await onlyExpense()).category.id).toBe(yoga.category.id);
});

test("[LEDGER-14.3] starts New Expense from a group on the group's first category", async () => {
  await startWithGroups(BRISBANE);
  const brisbane = await storedGroup(file, 'Brisbane');
  await editCategory('Food & Dining', 'Meals', undefined, brisbane.id);
  await tapTab('Groups');
  await openGroup('Brisbane');

  const add = groupAddButton('Brisbane');
  expect(add).toBeDefined();
  await fireEvent.press(add!);
  await expectForm('New Expense');

  expect(formCategory()).toBe('Meals');
  await press('Cancel');
  await expectFormClosed();
  await tapTab('Expenses');
  await openNewExpense();
  expect(formCategory()).toBe('Food & Dining');
});

test('[LEDGER-21.2] adds a personal expense when the switch was turned on and off again', async () => {
  await startWithGroups(BRISBANE);
  const identity = await readIdentity();
  await openNewExpense();
  await chooseGroup('Brisbane');
  await setSplit(false);
  await fillForm({ amount: '8.75', title: 'Coffee run' });

  await press('Add');

  await expectFormClosed();
  const coffee = await onlyExpense();
  expect(coffee.spaceId).toBe(identity.personalSpaceId);
  const personal = [
    { participant: identity.personalParticipantId, amountMinor: 875 },
  ];
  expect(coffee.payments).toEqual(personal);
  expect(coffee.shares).toEqual(personal);
});
