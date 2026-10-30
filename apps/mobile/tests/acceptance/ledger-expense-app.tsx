import {
  Alert,
  DeviceEventEmitter,
  Text,
  type AlertButton,
} from 'react-native';
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react-native';
import {
  nativeViews,
  navigationBars,
  push,
  startApp,
  tab,
  tapTab,
} from './shell-tabs-app';
import { router } from 'expo-router';
import { settle, testDatabase } from './shell-appearance-app';
import { listCategories } from '../../src/categories';
import { listExpenses, type Expense } from '../../src/ledger';
import { useLocalIdentity, type LocalIdentity } from '../../src/shell';
import type { Database } from '../../src/storage';
import { openNodeDatabase } from '../../src/storage/node';
import type { DateFieldProps } from '../../src/ui/date-field';

// The expense form tests start the whole app on a phone database file each test
// chooses (ADR-0006), and read what the app stores through the ledger's
// listExpenses, on a connection of their own. They stand in for the phone around
// the app: its region's currency, the first locale expo-localization's getLocales
// reports; its time zone, the one JavaScript reports through Intl (expo-localization's
// getCalendars reports the same); and how iOS reports a swipe on a sheet. The
// form's buttons may be native bar items or views, and the category list a screen
// of its own or a view in the form; the helpers find them either way. The date
// field is a ui/ component, DateField, whose props the tests read and call.

type HostView = ReturnType<typeof nativeViews>[number];

// The phone

const REGIONS: Partial<Record<string, string>> = {
  USD: 'US',
  TWD: 'TW',
  JPY: 'JP',
};
const phone = { currency: 'USD' as string | null, timeZone: 'Asia/Taipei' };

export function resetPhone() {
  phone.currency = 'USD';
  phone.timeZone = 'Asia/Taipei';
}

/** The currency of the phone's region; null when the phone reports none. */
export function setRegionCurrency(currency: string | null) {
  phone.currency = currency;
}

/** What expo-localization's getLocales reports. */
export function phoneLocales() {
  const region =
    phone.currency === null ? null : (REGIONS[phone.currency] ?? null);
  return [
    {
      languageTag: region === null ? 'en' : `en-${region}`,
      languageCode: 'en',
      languageScriptCode: null,
      regionCode: region,
      languageRegionCode: region,
      currencyCode: phone.currency,
      currencySymbol: phone.currency,
      languageCurrencyCode: phone.currency,
      languageCurrencySymbol: phone.currency,
      decimalSeparator: '.',
      digitGroupingSeparator: ',',
      textDirection: 'ltr',
      measurementSystem: 'metric',
      temperatureUnit: 'celsius',
    },
  ];
}

/** What expo-localization's getCalendars reports. */
export const phoneCalendars = () => [
  {
    calendar: 'gregory',
    timeZone: phone.timeZone,
    uses24hourClock: true,
    firstWeekday: 1,
  },
];

const realResolvedOptions = Intl.DateTimeFormat.prototype.resolvedOptions;
const hostTimeZone = realResolvedOptions.call(
  new Intl.DateTimeFormat(),
).timeZone;

/**
 * Puts the phone in `timeZone` at the instant `now`. renderRouter fakes the clock
 * when the app starts, so this comes after startApp.
 */
export function setPhoneClock(timeZone: string, now: string) {
  phone.timeZone = timeZone;
  jest
    .spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions')
    .mockImplementation(function (this: Intl.DateTimeFormat) {
      const options = realResolvedOptions.call(this);
      // A format made with a time zone of its own keeps it.
      return options.timeZone === hostTimeZone
        ? { ...options, timeZone }
        : options;
    });
  jest.setSystemTime(new Date(now));
}

// The phone database

let databaseFile = '';

/** The phone database in `file`, its writes behind shell-appearance-app's gate. */
export function phoneDatabase(file: string): Database {
  databaseFile = file;
  return testDatabase(file);
}

async function readDatabase<T>(query: (database: Database) => Promise<T>) {
  const database = openNodeDatabase(databaseFile, { readOnly: true });
  try {
    return await query(database);
  } finally {
    await database.close();
  }
}

/** The stored expenses, as the ledger lists them for other screens. */
export const storedExpenses = () => readDatabase(listExpenses);

/** A stored category as an expense stores it: its ID, name and color. */
export async function categoryNamed(name: string) {
  const categories = await readDatabase(listCategories);
  const category = categories.find((candidate) => candidate.name === name);
  if (category === undefined) throw new Error(`No category named ${name}`);
  return { id: category.id, name: category.name, color: category.color };
}

/** The expense a personal expense of `amountMinor` is stored as, with `fields`. */
export function personalExpense(
  identity: LocalIdentity,
  fields: Omit<Expense, 'id' | 'spaceId' | 'payments' | 'shares'>,
) {
  const allocation = [
    {
      participant: identity.personalParticipantId,
      amountMinor: fields.amountMinor,
    },
  ];
  return {
    id: expect.any(String),
    spaceId: identity.personalSpaceId,
    payments: allocation,
    shares: allocation,
    ...fields,
  };
}

// Starting the app

function IdentityProbe() {
  return (
    <Text testID="identity-probe">{JSON.stringify(useLocalIdentity())}</Text>
  );
}

const TEST_ROUTES = {
  './(tabs)/(expenses)/identity-probe.tsx': IdentityProbe,
};

/** Starts the app on the Expenses tab, in Taipei on 2026-10-30. */
export async function startExpenses() {
  const app = await startApp('/', TEST_ROUTES);
  setPhoneClock('Asia/Taipei', '2026-10-30T04:00:00Z');
  await settle();
  return app;
}

/** Closes the app and starts it again on the same data. */
export async function restart(app: { unmount: () => void }) {
  app.unmount();
  await settle();
  return startExpenses();
}

/** The local identity, read on a test screen pushed onto the Expenses tab. */
export async function readIdentity(): Promise<LocalIdentity> {
  await push('/identity-probe');
  const probe = await screen.findByTestId('identity-probe');
  const identity = JSON.parse(String(probe.props.children)) as LocalIdentity;
  await act(async () => router.back());
  await waitFor(() =>
    expect(screen.queryByTestId('identity-probe')).toBeNull(),
  );
  return identity;
}

// Names and states

const textOf = (node: HostView | string): string =>
  typeof node === 'string' ? node : node.children.map(textOf).join('');

/** A view's accessible name: its label, else its text. */
export const nameOf = (view: HostView): string =>
  view.props.accessibilityLabel ?? view.props['aria-label'] ?? textOf(view);

const isSelected = (view: HostView) =>
  view.props.accessibilityState?.selected === true ||
  view.props['aria-selected'] === true;

const isDisabled = (view: HostView) =>
  view.props.accessibilityState?.disabled === true ||
  view.props['aria-disabled'] === true;

const SCREEN = /^RNS(Modal)?Screen$/;

/** The nearest native screen around `view`. */
function screenAround(view: HostView): HostView | undefined {
  for (let outer = view.parent; outer; outer = outer.parent)
    if (SCREEN.test(String(outer.type))) return outer;
  return undefined;
}

/**
 * The native screen `view` is presented in. On iOS a modal or sheet is an
 * RNSModalScreen holding a stack of its own, whose screen holds the header;
 * the presentation, the gestures and their events belong to the modal.
 */
function presentedScreen(view: HostView): HostView | undefined {
  for (let outer = view.parent; outer; outer = outer.parent)
    if (String(outer.type) === 'RNSModalScreen') return outer;
  return screenAround(view);
}

/** Whether the views come in this order in the rendered tree. */
export function inTreeOrder(...views: HostView[]) {
  const all = screen.UNSAFE_root.findAll(() => true);
  const indexes = views.map((view) => all.indexOf(view));
  return indexes.every(
    (index, position) =>
      index >= 0 && (position === 0 || index > indexes[position - 1]),
  );
}

// Buttons in navigation bars

interface Control {
  disabled: boolean;
  press: () => void;
}

interface BarItem {
  type: string;
  buttonId?: string;
  accessibilityLabel?: string;
  title?: string;
  disabled?: boolean;
}

const itemName = (item: BarItem) => item.accessibilityLabel || item.title;

/** A button in `bar`: an iOS bar item, or a view as on Android. */
function barControl(bar: HostView, name: string): Control | undefined {
  const item = [
    ...((bar.props.headerLeftBarButtonItems as BarItem[] | undefined) ?? []),
    ...((bar.props.headerRightBarButtonItems as BarItem[] | undefined) ?? []),
  ].find(
    (candidate) => candidate.type === 'button' && itemName(candidate) === name,
  );
  if (item !== undefined) {
    const disabled = item.disabled === true;
    return {
      disabled,
      // The native bar sends no press for a disabled item.
      press: () => {
        if (!disabled)
          fireEvent(bar, 'pressHeaderBarButtonItem', {
            nativeEvent: { buttonId: item.buttonId },
          });
      },
    };
  }
  const button = within(bar).queryByRole('button', { name });
  if (button === null) return undefined;
  return { disabled: isDisabled(button), press: () => fireEvent.press(button) };
}

/** A button in any navigation bar on screen, else a button view on screen. */
function anyButton(name: string): Control {
  for (const bar of navigationBars().reverse()) {
    const control = barControl(bar, name);
    if (control !== undefined) return control;
  }
  const button = screen.getByRole('button', { name });
  return { disabled: isDisabled(button), press: () => fireEvent.press(button) };
}

// The expense form

const FORM_TITLES = ['New Expense', 'Edit Expense'];
const SHEETS = ['formSheet', 'pageSheet', 'modal'];

const formBars = () =>
  navigationBars().filter((bar) => FORM_TITLES.includes(bar.props.title));

/** The title of the open expense form, if one is open. */
export const formTitle = (): string | undefined =>
  formBars().at(-1)?.props.title;

function formBar() {
  const bar = formBars().at(-1);
  if (bar === undefined) throw new Error('No expense form is open');
  return bar;
}

/** The native screen the open expense form is presented in. */
export function formScreen(): HostView {
  const form = presentedScreen(formBar());
  if (form === undefined) throw new Error('The expense form is not a screen');
  return form;
}

/** Whether the form is a sheet presented over the tabs. */
export const isSheet = () =>
  SHEETS.includes(formScreen().props.stackPresentation);

/** How many expense forms are open, one above another. */
export const formCount = () => formBars().length;

/** Whether the open form sits inside a tab, above the tab bar rather than over it. */
export function formIsInATab() {
  for (let outer = formScreen().parent; outer; outer = outer.parent)
    if (/^RNSTabsScreen/.test(String(outer.type))) return true;
  return false;
}

export async function expectForm(title: 'New Expense' | 'Edit Expense') {
  await waitFor(() => expect(formTitle()).toBe(title));
  await waitFor(() =>
    expect(
      within(formScreen()).queryByLabelText('Expense title'),
    ).not.toBeNull(),
  );
  await settle();
}

export async function expectFormClosed() {
  await waitFor(() => expect(formTitle()).toBeUndefined());
  expect(screen.queryByLabelText('Expense title')).toBeNull();
}

/** A button in the form's navigation bar. */
export function formButton(name: 'Cancel' | 'Add' | 'Save'): Control {
  const control = barControl(formBar(), name);
  if (control === undefined)
    throw new Error(`No ${name} in the expense form's navigation bar`);
  return control;
}

/** Presses a button in the form's navigation bar and lets the save, if any, finish. */
export async function press(name: 'Cancel' | 'Add' | 'Save') {
  formButton(name).press();
  await settle();
}

/** The names of the form's navigation bar buttons on each side. */
export function formBarSides() {
  const bar = formBar();
  const items = (side: 'Left' | 'Right') =>
    ((bar.props[`header${side}BarButtonItems`] as BarItem[] | undefined) ?? [])
      .filter((item) => item.type === 'button')
      .map(itemName);
  const sides = { left: items('Left'), right: items('Right') };
  for (const subview of nativeViews(/^RNSScreenStackHeaderSubview$/, bar)) {
    const side: unknown = subview.props.type;
    if (side === 'left' || side === 'right')
      sides[side].push(...within(subview).queryAllByRole('button').map(nameOf));
  }
  return sides;
}

const inForm = () => within(formScreen());

export const amountField = () => inForm().getByLabelText(/^Amount in /);
/** The form's currency, as the amount field's name gives it. */
export const formCurrency = () =>
  nameOf(amountField()).replace(/^Amount in /, '');
export const titleField = () => inForm().getByLabelText('Expense title');
export const noteField = () => inForm().getByLabelText('Expense note');
export const categoryButton = () =>
  inForm().getByRole('button', { name: /^Category, / });
/** The category the form shows. */
export const formCategory = () =>
  nameOf(categoryButton()).replace(/^Category, /, '');

/** The form's date field, the ui/ DateField. */
export function dateFieldView(): HostView {
  const fields = formScreen().findAll(
    (node) => typeof node.type === 'function' && node.type.name === 'DateField',
  );
  expect(fields).toHaveLength(1);
  return fields[0];
}

/** What the form tells its date field. */
export const dateField = () => dateFieldView().props as DateFieldProps;

/** Chooses `date` in the date field's picker. */
export function chooseDate(date: string) {
  act(() => dateField().onChange(date));
}

export const addExpenseButton = () =>
  within(tab('Expenses')).getByRole('button', { name: 'Add expense' });

export async function openNewExpense() {
  fireEvent.press(addExpenseButton());
  await expectForm('New Expense');
}

/** Opens the expense's Edit Expense, as a link in the app would. */
export async function openEditExpense(id: string) {
  await push(`/expenses/${id}/edit`);
  await expectForm('Edit Expense');
}

export interface ExpenseInput {
  amount?: string;
  title?: string;
  note?: string;
  category?: string;
  date?: string;
}

export async function fillForm({
  amount,
  title,
  note,
  category,
  date,
}: ExpenseInput) {
  if (amount !== undefined) fireEvent.changeText(amountField(), amount);
  if (title !== undefined) fireEvent.changeText(titleField(), title);
  if (note !== undefined) fireEvent.changeText(noteField(), note);
  if (category !== undefined) await chooseCategory(category);
  if (date !== undefined) chooseDate(date);
}

/** Adds an expense through New Expense: Coffee run for 8.75 unless `input` says otherwise. */
export async function addExpense(input: ExpenseInput = {}) {
  await openNewExpense();
  await fillForm({ amount: '8.75', title: 'Coffee run', ...input });
  await press('Add');
  await expectFormClosed();
}

/** Changes an expense through its Edit Expense. */
export async function editExpense(id: string, input: ExpenseInput) {
  await openEditExpense(id);
  await fillForm(input);
  await press('Save');
  await expectFormClosed();
}

// Leaving the form

/**
 * Swipes the form down, as iOS reports it: a sheet the app lets go is dismissed;
 * one the app asked iOS to hold (preventNativeDismiss) stays and reports the
 * cancelled dismissal; one whose gesture is off reports only the cancelled gesture.
 */
export async function swipeFormDown() {
  const form = formScreen();
  if (form.props.preventNativeDismiss === true)
    fireEvent(form, 'nativeDismissCancelled', {
      nativeEvent: { dismissCount: 1 },
    });
  else if (form.props.gestureEnabled === false)
    fireEvent(form, 'gestureCancel', { nativeEvent: {} });
  else fireEvent(form, 'dismissed', { nativeEvent: { dismissCount: 1 } });
  await settle();
}

/** Presses the Android back button, delivered the way React Native delivers it. */
export async function pressBack() {
  await act(async () => {
    DeviceEventEmitter.emit('hardwareBackPress');
  });
  await settle();
}

// Alerts

export const DISCARD_CHANGES = [
  'Discard Changes?',
  'Your changes will not be saved.',
];
export const SAVE_FAILED = [
  'Unable to Save Expense',
  'Your expense could not be saved. Please try again.',
];

export function watchAlerts() {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  const lastButtons = (): AlertButton[] => alert.mock.calls.at(-1)?.[2] ?? [];
  return {
    /** The alerts shown so far, as [title, message]. */
    shown: () => alert.mock.calls.map((call) => call.slice(0, 2)),
    /** The last alert's buttons, as [text, style]. */
    buttons: () => lastButtons().map(({ text, style }) => [text, style]),
    /** Presses a button of the last alert and lets what it starts finish. */
    choose: async (text: string) => {
      const button = lastButtons().find((candidate) => candidate.text === text);
      if (button === undefined)
        throw new Error(`The last alert has no ${text}`);
      await act(async () => button.onPress?.());
      await settle();
    },
  };
}

// The category list

/** The open category list: a screen titled Category, or what holds a Category header. */
function categoryList(): { root: HostView; bar?: HostView } | undefined {
  const bar = navigationBars()
    .filter((candidate) => candidate.props.title === 'Category')
    .at(-1);
  if (bar !== undefined) return { root: screenAround(bar) ?? bar, bar };
  const header = screen.queryAllByRole('header', { name: 'Category' }).at(-1);
  if (header === undefined) return undefined;
  return { root: screenAround(header) ?? screen.UNSAFE_root };
}

function listRoot() {
  const list = categoryList();
  if (list === undefined) throw new Error('The category list is not open');
  return list.root;
}

export const isCategoryListOpen = () => categoryList() !== undefined;

/** The view that holds the open category list. */
export const categoryListView = () => listRoot();

export async function openCategoryList() {
  fireEvent.press(categoryButton());
  await waitFor(() => expect(isCategoryListOpen()).toBe(true));
  await settle();
}

/** The list's buttons named after `names`, in screen order, as [name, selected]. */
export function categoryOptions(names: readonly string[]) {
  return within(listRoot())
    .getAllByRole('button')
    .map((button) => [nameOf(button), isSelected(button)] as const)
    .filter(([name]) => names.includes(name));
}

export async function chooseCategory(name: string) {
  await openCategoryList();
  fireEvent.press(within(listRoot()).getByRole('button', { name }));
  await waitFor(() => expect(isCategoryListOpen()).toBe(false));
}

export async function cancelCategoryList() {
  const list = categoryList();
  if (list === undefined) throw new Error('The category list is not open');
  const control =
    (list.bar && barControl(list.bar, 'Cancel')) ??
    barControl(list.root, 'Cancel');
  if (control === undefined) throw new Error('The category list has no Cancel');
  control.press();
  await waitFor(() => expect(isCategoryListOpen()).toBe(false));
}

// Manage Categories, where categories are added and renamed

async function openManageCategories() {
  await tapTab('Settings');
  fireEvent.press(screen.getByText('Manage Categories'));
  await waitFor(() =>
    expect(navigationBars(tab('Settings')).at(-1)?.props.title).toBe(
      'Manage Categories',
    ),
  );
  await settle();
}

async function saveCategoryForm(name: 'Add' | 'Save') {
  anyButton(name).press();
  await settle();
  await waitFor(() =>
    expect(screen.queryByLabelText('Category name')).toBeNull(),
  );
}

async function backToExpenses() {
  await act(async () => router.back());
  await waitFor(() =>
    expect(navigationBars(tab('Settings')).at(-1)?.props.title).toBe(
      'Settings',
    ),
  );
  await tapTab('Expenses');
  await settle();
}

/** Renames a category in Manage Categories, recoloring it when `color` is given. */
export async function editCategory(
  name: string,
  newName: string,
  color?: string,
) {
  await openManageCategories();
  fireEvent.press(within(tab('Settings')).getByText(name));
  fireEvent.changeText(await screen.findByLabelText('Category name'), newName);
  if (color !== undefined)
    fireEvent.press(
      screen.getByRole('button', { name: `Select color ${color}` }),
    );
  await saveCategoryForm('Save');
  await backToExpenses();
}

/** Adds a category in Manage Categories. */
export async function addCategory(name: string) {
  await openManageCategories();
  anyButton('Add category').press();
  fireEvent.changeText(await screen.findByLabelText('Category name'), name);
  await saveCategoryForm('Add');
  await backToExpenses();
}
