import { addGroupExpense } from './ledger-group-expense-app';
import { openInsights } from './insights-app';
import {
  categoryCardTitles,
  expectCategorySummary,
  openCategory,
} from './insights-category-app';
import {
  LATER,
  YOU,
  at,
  categoryOf,
  created,
  eachTestGetsAPhone,
  groupId,
  members,
  receive,
  startShared,
} from './sync-app';

// Runs on iOS. Starts the app as the sync tests do (sync-expense-apply.test.tsx): Taylor's
// Brisbane, with Casey and Blake, is a shared ledger on 2026-10-30 in Taipei, and the app is
// handed events another phone wrote while a category's expenses are open.

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

eachTestGetsAPhone('insights-category-sync-');

const FOOD = 'Food & Dining';
const BRUNCH = 'b0000000-0000-4000-8000-000000000001';
const LUNCH = 'b0000000-0000-4000-8000-000000000002';

/** An expense of Brisbane's Food & Dining as another phone adds it: Casey pays 30.00, split between Taylor and Casey. */
async function added(id: string, title: string, date: string, counter: number) {
  const ids = await members('Brisbane');
  return created('expense', id, at(LATER, counter), {
    title,
    date,
    note: null,
    category: await categoryOf('Brisbane', FOOD),
    money: {
      amountMinor: 3000,
      currency: 'USD',
      payments: [{ participant: ids.Casey, amountMinor: 3000 }],
      shares: [
        { participant: ids.Taylor, amountMinor: 1500 },
        { participant: ids.Casey, amountMinor: 1500 },
      ],
    },
    trashed: false,
  });
}

test("[INSIGHTS-52.1] shows an expense another phone added on a category's expenses that are open, without a restart, and none dated outside the period", async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  // Dinner for 100.01: Casey pays, split between Blake, Taylor and Casey in that order.
  await addGroupExpense({
    group: 'Brisbane',
    payer: 'Casey',
    sharers: ['Blake', YOU, 'Casey'],
    category: FOOD,
  });
  await openInsights();
  await openCategory(FOOD);
  await expectCategorySummary(['October 2026', '$33.34', '1 expense'], FOOD);

  await receive(
    brisbane,
    await added(BRUNCH, 'Brunch', '2026-09-15', 0),
    await added(LUNCH, 'Lunch', '2026-10-30', 1),
  );

  await expectCategorySummary(['October 2026', '$48.34', '2 expenses'], FOOD);
  expect(categoryCardTitles(FOOD)).toEqual(['Lunch', 'Dinner']);
});
