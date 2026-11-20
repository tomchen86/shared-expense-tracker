import { fireEvent } from '@testing-library/react-native';
import {
  newPhone,
  removePhones,
  resetPhones,
  startOn,
  writeData,
} from '../../tests/acceptance/backup-app';
import { expectInsights, rows } from '../../tests/acceptance/insights-app';
import {
  categoryCard,
  categoryCardTitles,
  expectCategorySummary,
  goBackFromCategory,
  openCategory,
} from '../../tests/acceptance/insights-category-app';
import { expectDetailsOn } from '../../tests/acceptance/ledger-group-expense-app';
import { chooseExpenseAction } from '../../tests/acceptance/ledger-trash-app';

jest.mock('../storage/expo', () => ({
  openPhoneDatabase: () =>
    jest
      .requireActual<typeof import('../../tests/acceptance/backup-app')>(
        '../../tests/acceptance/backup-app',
      )
      .openPhoneDatabase(),
}));

beforeEach(resetPhones);
afterEach(async () => {
  jest.restoreAllMocks();
  await removePhones();
});

test('keeps the selected category when its rank changes and its name contains a literal percent escape', async () => {
  const phone = newPhone();
  const name = 'Tea %2F Coffee';
  const date = '2026-11-18';
  await writeData(phone, {
    categories: [{ name }],
    expenses: [
      { title: 'Leaves', amount: '1', category: name, date },
      { title: 'Beans', amount: '6', category: name, date },
      { title: 'Bus', amount: '4', category: 'Transportation', date },
    ],
  });
  await startOn(phone, { url: '/insights' });
  await expectInsights();
  expect(rows().map(([label]) => label)).toEqual([name, 'Transportation']);
  await openCategory(name);
  await expectCategorySummary(['November 2026', '$7.00', '2 expenses'], name);

  await fireEvent.press(categoryCard(name, 'Beans'));
  await expectDetailsOn('Expenses', 'Beans');
  await chooseExpenseAction('Expenses', 'Delete');

  await expectCategorySummary(['November 2026', '$1.00', '1 expense'], name);
  expect(categoryCardTitles(name)).toEqual(['Leaves']);
  await goBackFromCategory(name);
  expect(rows().map(([label]) => label)).toEqual(['Transportation', name]);
});
