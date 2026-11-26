import { currencyDecimals } from '@shared-expense/domain';
import type { Expense } from './expenses';

/** The conditions remembered for a list (LEDGER-129.1). Limits keep the digits the user entered. */
export interface ListFilter {
  categories: string[];
  ledgers: string[];
  payers: string[];
  paidByMe: boolean;
  min: string;
  max: string;
  currency: string;
}

export interface SavedFilter {
  name: string;
  filter: ListFilter;
}

export const NO_FILTER: ListFilter = {
  categories: [],
  ledgers: [],
  payers: [],
  paidByMe: false,
  min: '',
  max: '',
  currency: '',
};

export function hasFilter(filter: ListFilter) {
  return Boolean(
    filter.categories.length ||
    filter.ledgers.length ||
    filter.payers.length ||
    filter.paidByMe ||
    filter.min ||
    filter.max ||
    filter.currency,
  );
}

/** Compare decimal values without rounding them or changing the text kept for the fields. */
function decimalValue(text: string) {
  if (!text) return '';
  const [whole, fraction = ''] = text.split('.');
  return `${whole.replace(/^0+/, '')}.${fraction.replace(/0+$/, '')}`;
}

function sameChoices(left: string[], right: string[]) {
  return left.length === right.length && left.every((id) => right.includes(id));
}

/** Selection order and equivalent spellings of a bound do not distinguish saved filters (LEDGER-143.3). */
export function sameFilter(left: ListFilter, right: ListFilter) {
  return (
    left.paidByMe === right.paidByMe &&
    left.currency === right.currency &&
    sameChoices(left.categories, right.categories) &&
    sameChoices(left.ledgers, right.ledgers) &&
    sameChoices(left.payers, right.payers) &&
    decimalValue(left.min) === decimalValue(right.min) &&
    decimalValue(left.max) === decimalValue(right.max)
  );
}

/** Decimal keyboard input in both the expense form and the list's amount fields (LEDGER-19.1). */
export function normalizeAmount(text: string) {
  return text
    .replace(/[０-９．，]/g, (character) =>
      String.fromCharCode(character.charCodeAt(0) - 0xfee0),
    )
    .replaceAll(',', '.');
}

export function filterAmount(text: string) {
  const digits = normalizeAmount(text.trim());
  return /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(digits) ? digits : '';
}

/** The first or last whole minor unit inside a bound, even when the bound has more decimal places. */
function boundInMinor(text: string, decimals: number, minimum: boolean) {
  const [whole, fraction = ''] = text.split('.');
  const floor = Number(
    whole + fraction.slice(0, decimals).padEnd(decimals, '0'),
  );
  return minimum && /[1-9]/.test(fraction.slice(decimals)) ? floor + 1 : floor;
}

/** Membership counts even when the participant's allocation is zero. */
export function participation(
  expense: Expense,
  personalSpaceId: string,
  own: ReadonlySet<string>,
) {
  const payments = expense.payments.filter(({ participant }) =>
    own.has(participant),
  );
  const shares = expense.shares.filter(({ participant }) =>
    own.has(participant),
  );
  return {
    paidByMe: payments.length > 0,
    yourPaid: payments.reduce((sum, payment) => sum + payment.amountMinor, 0),
    yourShare: shares.reduce((sum, share) => sum + share.amountMinor, 0),
    involved:
      expense.spaceId === personalSpaceId ||
      payments.length > 0 ||
      shares.length > 0,
  };
}

export function passesFilter(
  filter: ListFilter,
  expense: Expense & { yourShare: number; paidByMe: boolean },
  inGroup: boolean,
) {
  if (
    filter.categories.length &&
    !filter.categories.includes(expense.category.name)
  )
    return false;
  if (filter.ledgers.length && !filter.ledgers.includes(expense.spaceId))
    return false;
  if (
    filter.payers.length &&
    !expense.payments.some(({ participant }) =>
      filter.payers.includes(participant),
    )
  )
    return false;
  if (filter.paidByMe && !expense.paidByMe) return false;
  if (filter.currency && filter.currency !== expense.currency) return false;
  if (filter.min || filter.max) {
    const decimals = currencyDecimals(expense.currency)!;
    const minor = inGroup ? expense.amountMinor : expense.yourShare;
    if (filter.min && minor < boundInMinor(filter.min, decimals, true))
      return false;
    if (filter.max && minor > boundInMinor(filter.max, decimals, false))
      return false;
  }
  return true;
}
