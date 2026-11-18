import { checkSyncEvent, nextSyncStamp } from '../../src';
import {
  at,
  change,
  CREATED,
  deletion,
  dinner,
  DINNER,
  DINNER_MONEY,
  dinnerChange,
  dinnerCreated,
  FUEL_CATEGORY,
  judge,
  receive,
  refused,
  type Phone,
} from './sync-fixtures';

const RECEIVED = 1_700_000_000_000;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const LIMIT = 999_999_999_999;

const created = dinnerCreated();

const without = (content: object, field: string) =>
  Object.fromEntries(Object.entries(content).filter(([key]) => key !== field));

/** Dinner's first event with one unit holding something else. */
const dinnerWith = (unit: string, value: unknown, stamp = CREATED) => ({
  ...created,
  stamp,
  units: { ...created.units, [unit]: { value } },
});

const dinnerMoney = (changes: object, stamp = CREATED) =>
  dinnerWith('money', { ...DINNER_MONEY, ...changes }, stamp);

const dinnerCategory = (changes: object) =>
  dinnerWith('category', { ...DINNER.category, ...changes });

const share = (participant: string, amountMinor: number) => ({
  participant,
  amountMinor,
});

const VALID = (content: unknown) => ({ status: 'valid', event: content });

test('[SYNC-3.1] does not judge an event in format version 2', () => {
  expect(judge({ ...created, version: 2 })).toEqual({ status: 'unsupported' });
});

test('[SYNC-3.1] does not refuse a newer version for what version 1 would refuse', () => {
  const content = {
    version: 3,
    stamp: at(RECEIVED + HOUR, 0, 'phone-b'),
    kind: 'settlement',
    lines: [1, 2, 3],
  };

  expect(judge(content, RECEIVED)).toEqual({ status: 'unsupported' });
});

test.each<[string, unknown]>([
  ['null', null],
  ['text', 'event'],
  ['a number', 1],
  ['a list', [created]],
  ['no version', without(created, 'version')],
  ['version 0', { ...created, version: 0 }],
  ['a negative version', { ...created, version: -1 }],
  ['a fractional version', { ...created, version: 1.5 }],
  ['a version in text', { ...created, version: '1' }],
  ['no stamp', without(created, 'stamp')],
  ['no record type', without(created, 'type')],
  ['no record id', without(created, 'id')],
  ['neither units nor a deletion', without(created, 'units')],
  ['both units and a deletion', { ...created, deleted: true }],
  ['a field events do not have', { ...created, group: 'brisbane' }],
  ['a stamp that is a number', { ...created, stamp: 1000 }],
  ['a stamp that is null', { ...created, stamp: null }],
  ['a stamp with an extra field', { ...created, stamp: { ...CREATED, z: 0 } }],
  [
    'a stamp without a counter',
    { ...created, stamp: without(CREATED, 'counter') },
  ],
  ['negative milliseconds', { ...created, stamp: at(-1) }],
  ['fractional milliseconds', { ...created, stamp: at(1000.5) }],
  [
    'milliseconds past the largest safe integer',
    { ...created, stamp: at(Number.MAX_SAFE_INTEGER + 1) },
  ],
  ['milliseconds in text', { ...created, stamp: { ...CREATED, ms: '1000' } }],
  ['a negative counter', { ...created, stamp: at(1000, -1) }],
  ['a fractional counter', { ...created, stamp: at(1000, 0.5) }],
  ['an empty device', { ...created, stamp: at(1000, 0, '') }],
  ['a device with a space', { ...created, stamp: at(1000, 0, 'phone a') }],
  ['a device outside ASCII', { ...created, stamp: at(1000, 0, 'phöne') }],
  [
    'a device that is a number',
    { ...created, stamp: { ...CREATED, device: 7 } },
  ],
  ['a record type events do not have', { ...created, type: 'settlement' }],
  ['a record type that is a number', { ...created, type: 7 }],
  ['an empty record id', { ...created, id: '' }],
  ['a record id that is a number', { ...created, id: 7 }],
  ['units that are a list', { ...created, units: [created.units] }],
  ['units that are null', { ...created, units: null }],
  ['no unit changed', { ...created, units: {} }],
  ['a unit that is only its value', { ...created, units: { title: 'Dinner' } }],
  ['a unit without a value', { ...created, units: { title: {} } }],
  [
    'a unit with an extra field',
    { ...created, units: { title: { value: 'Dinner', by: 'taylor' } } },
  ],
  [
    'a base that is a number',
    { ...created, units: { title: { value: 'Supper', base: 1000 } } },
  ],
  [
    'a base with a negative counter',
    { ...created, units: { title: { value: 'Supper', base: at(900, -1) } } },
  ],
  [
    'a base with an extra field',
    {
      ...created,
      units: { title: { value: 'Supper', base: { ...CREATED, z: 0 } } },
    },
  ],
  [
    'a unit groups do not have',
    {
      ...change('group', 'brisbane', CREATED, { name: 'Brisbane' }),
      units: { name: { value: 'Brisbane' }, removed: { value: false } },
    },
  ],
  ['a unit expenses do not have', dinnerWith('archived', false)],
  [
    'the deletion of a group',
    { ...deletion('expense', 'brisbane', CREATED), type: 'group' },
  ],
  [
    'the deletion of a member',
    { ...deletion('expense', 'blake', CREATED), type: 'member' },
  ],
  [
    'a deletion marked false',
    { ...deletion('expense', 'dinner', CREATED), deleted: false },
  ],
  [
    'a deletion marked in text',
    { ...deletion('expense', 'dinner', CREATED), deleted: 'true' },
  ],
  [
    'a deletion with an extra field',
    { ...deletion('expense', 'dinner', CREATED), reason: 'duplicate' },
  ],
  ['a deletion with an empty record id', deletion('expense', '', CREATED)],
  [
    'a deletion with a negative counter',
    deletion('category', 'cat-fuel', at(1000, -1)),
  ],
])('[SYNC-4.1] refuses %s for its structure', (_case, content) => {
  expect(judge(content)).toEqual(refused('structure'));
});

test.each<[string, unknown]>([
  ['the first event of an expense', created],
  ['a change with its base', dinnerChange(at(2000), { title: 'Supper' })],
  ['the deletion of an expense', deletion('expense', 'dinner', at(2000))],
  ['the deletion of a category', deletion('category', 'cat-fuel', at(2000))],
  [
    'the largest stamp',
    {
      ...created,
      stamp: at(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, '!~'),
    },
  ],
])('[SYNC-4.1] accepts %s', (_case, content) => {
  expect(judge(content)).toEqual(VALID(content));
});

test.each<[string, unknown]>([
  ['an empty title', dinnerWith('title', '')],
  ['a title that is a number', dinnerWith('title', 7)],
  ['a date that does not exist', dinnerWith('date', '2025-02-30')],
  ['a date without leading zeros', dinnerWith('date', '2025-1-5')],
  ['an empty date', dinnerWith('date', '')],
  ['a date that is a number', dinnerWith('date', 20250314)],
  ['an empty note', dinnerWith('note', '')],
  ['a note that is a number', dinnerWith('note', 7)],
  ['a category that is only an id', dinnerWith('category', 'cat-food')],
  ['a category with an empty id', dinnerCategory({ id: '' })],
  ['a category with an empty name', dinnerCategory({ name: '' })],
  [
    'a category without a name',
    dinnerWith('category', without(DINNER.category, 'name')),
  ],
  ['a category with an extra field', dinnerCategory({ icon: 'fork' })],
  ['a category color that is a word', dinnerCategory({ color: 'red' })],
  ['a category color of five digits', dinnerCategory({ color: '#D81B6' })],
  ['a category color of seven digits', dinnerCategory({ color: '#D81B600' })],
  ['a category color past F', dinnerCategory({ color: '#G81B60' })],
  ['a category color without #', dinnerCategory({ color: 'D81B60' })],
  ['money that is only an amount', dinnerWith('money', 10001)],
  [
    'an amount of zero',
    dinnerMoney({
      amountMinor: 0,
      payments: [share('casey', 0)],
      shares: [share('blake', 0)],
    }),
  ],
  ['a negative amount', dinnerMoney({ amountMinor: -1 })],
  [
    'a fractional amount',
    dinnerMoney({
      amountMinor: 12.5,
      payments: [share('casey', 12.5)],
      shares: [share('blake', 12.5)],
    }),
  ],
  [
    'an amount above the limit',
    dinnerMoney({
      amountMinor: LIMIT + 1,
      payments: [share('casey', LIMIT), share('taylor', 1)],
      shares: [share('blake', LIMIT), share('taylor', 1)],
    }),
  ],
  [
    'money without a currency',
    dinnerWith('money', without(DINNER_MONEY, 'currency')),
  ],
  ['a currency that is a number', dinnerMoney({ currency: 840 })],
  ['money with an extra field', dinnerMoney({ tip: 500 })],
  ['payments that are not a list', dinnerMoney({ payments: 'casey' })],
  ['a share that is only an amount', dinnerMoney({ shares: [10001] })],
  [
    'a share with a negative amount',
    dinnerMoney({ shares: [share('blake', -1), share('taylor', 10002)] }),
  ],
  [
    'a share with a fractional amount',
    dinnerMoney({ shares: [share('blake', 0.5), share('taylor', 10000.5)] }),
  ],
  [
    'a share above the limit',
    dinnerMoney({ shares: [share('blake', LIMIT + 1)] }),
  ],
  [
    'a payment with a negative amount',
    dinnerMoney({ payments: [share('casey', -1), share('taylor', 10002)] }),
  ],
  [
    'a share without a participant',
    dinnerMoney({ shares: [{ amountMinor: 10001 }] }),
  ],
  [
    'a share with an empty participant',
    dinnerMoney({ shares: [share('', 10001)] }),
  ],
  [
    'a share with an extra field',
    dinnerMoney({ shares: [{ ...share('blake', 10001), weight: 1 }] }),
  ],
  [
    'the same participant twice in the shares',
    dinnerMoney({ shares: [share('blake', 5001), share('blake', 5000)] }),
  ],
  [
    'the same participant twice in the payments',
    dinnerMoney({ payments: [share('casey', 5001), share('casey', 5000)] }),
  ],
  ['a trashed mark in text', dinnerWith('trashed', 'yes')],
])(
  '[SYNC-5.1] refuses an expense with %s for its structure',
  (_case, content) => {
    expect(judge(content)).toEqual(refused('structure'));
  },
);

test.each<[string, unknown]>([
  ['every unit', created],
  ['a title of one space', dinnerWith('title', ' ')],
  ['a note', dinnerWith('note', 'Window seat')],
  ['no note', dinnerWith('note', null)],
  ['a lowercase category color', dinnerCategory({ color: '#d81b60' })],
  [
    'the largest amount',
    dinnerMoney({
      amountMinor: LIMIT,
      payments: [share('casey', LIMIT)],
      shares: [share('blake', LIMIT)],
    }),
  ],
  [
    'a payer who also shares',
    dinnerMoney({
      payments: [share('casey', 10001)],
      shares: [share('casey', 5001), share('blake', 5000)],
    }),
  ],
  [
    'a share of zero',
    dinnerMoney({
      amountMinor: 1,
      payments: [share('casey', 1)],
      shares: [share('casey', 1), share('blake', 0)],
    }),
  ],
  ['a place in the trash', dinnerWith('trashed', true)],
])('[SYNC-5.1] accepts an expense with %s', (_case, content) => {
  expect(judge(content)).toEqual(VALID(content));
});

const fuel = change('category', 'cat-fuel', CREATED, FUEL_CATEGORY);
const brisbane = change('group', 'brisbane', CREATED, { name: 'Brisbane' });
const blake = change('member', 'blake', CREATED, {
  name: 'Blake',
  removed: false,
});

const withUnit = (
  content: { units: object },
  unit: string,
  value: unknown,
) => ({ ...content, units: { ...content.units, [unit]: { value } } });

test.each<[string, unknown]>([
  ['the first event of a category', fuel],
  [
    'a group renamed',
    change('group', 'brisbane', at(2000), { name: 'Brissie' }, CREATED),
  ],
  ['the first event of a group', brisbane],
  ['the first event of a member', blake],
  [
    'a member removed',
    change('member', 'blake', at(2000), { removed: true }, CREATED),
  ],
  [
    'a category archived',
    change('category', 'cat-fuel', at(2000), { archived: true }, CREATED),
  ],
])('[SYNC-6.1] accepts %s', (_case, content) => {
  expect(judge(content)).toEqual(VALID(content));
});

test.each<[string, unknown]>([
  ['a category with an empty name', withUnit(fuel, 'name', '')],
  ['a category name that is a number', withUnit(fuel, 'name', 7)],
  ['a group with an empty name', withUnit(brisbane, 'name', '')],
  ['a group name that is a number', withUnit(brisbane, 'name', 7)],
  ['a member with an empty name', withUnit(blake, 'name', '')],
  ['a member name that is a number', withUnit(blake, 'name', 7)],
  ['a category color that is a word', withUnit(fuel, 'color', 'blue')],
  ['a category color of five digits', withUnit(fuel, 'color', '#1E88E')],
  ['an archived mark that is a number', withUnit(fuel, 'archived', 1)],
  ['a removed mark in text', withUnit(blake, 'removed', 'true')],
])('[SYNC-6.1] refuses %s for its structure', (_case, content) => {
  expect(judge(content)).toEqual(refused('structure'));
});

test.each(['XYZ', 'usd', 'XAU', ''])(
  '[SYNC-7.1] refuses money in %p for its currency',
  (currency) => {
    expect(judge(dinnerMoney({ currency }))).toEqual(refused('currency'));
  },
);

test.each<[number, string]>([
  [1200, 'JPY'],
  [1234, 'KWD'],
])('[SYNC-7.1] accepts %i in %s', (amountMinor, currency) => {
  const content = dinnerMoney({
    amountMinor,
    currency,
    payments: [share('casey', amountMinor)],
    shares: [share('blake', amountMinor)],
  });

  expect(judge(content)).toEqual(VALID(content));
});

test.each<[string, object]>([
  [
    'shares that fall short',
    {
      shares: [
        share('blake', 3334),
        share('taylor', 3333),
        share('casey', 3333),
      ],
    },
  ],
  ['shares that go over', { shares: [share('blake', 10002)] }],
  ['a payment that goes over', { payments: [share('casey', 10002)] }],
  ['a payment that falls short', { payments: [share('casey', 10000)] }],
  ['no payments', { payments: [] }],
  ['no shares', { shares: [] }],
])('[SYNC-8.1] refuses 10001 with %s for its sum', (_case, changes) => {
  expect(judge(dinnerMoney(changes))).toEqual(refused('sum'));
});

test.each<[string, object]>([
  [
    'two people paying',
    { payments: [share('casey', 6000), share('taylor', 4001)] },
  ],
  [
    'someone sharing nothing',
    {
      amountMinor: 1,
      payments: [share('casey', 1)],
      shares: [share('casey', 1), share('blake', 0)],
    },
  ],
  [
    'the largest amount',
    {
      amountMinor: LIMIT,
      payments: [share('casey', LIMIT)],
      shares: [share('blake', LIMIT - 1), share('taylor', 1)],
    },
  ],
])('[SYNC-8.1] accepts money with %s', (_case, changes) => {
  const content = dinnerMoney(changes);

  expect(judge(content)).toEqual(VALID(content));
});

const stampedAt = (ms: number) =>
  dinnerChange(at(ms, 0, 'phone-b'), { title: 'Supper' });

test('[SYNC-9.1] refuses an event stamped an hour after it was received', () => {
  expect(judge(stampedAt(RECEIVED + HOUR), RECEIVED)).toEqual(refused('clock'));
});

test('[SYNC-9.1] accepts a stamp exactly 10 minutes after the receive time, and refuses one millisecond more', () => {
  const atTheBound = stampedAt(RECEIVED + 10 * MINUTE);

  expect(judge(atTheBound, RECEIVED)).toEqual(VALID(atTheBound));
  expect(judge(stampedAt(RECEIVED + 10 * MINUTE + 1), RECEIVED)).toEqual(
    refused('clock'),
  );
});

test('[SYNC-9.1] accepts an event uploaded three days after it was made', () => {
  const content = stampedAt(RECEIVED - 3 * DAY);

  expect(judge(content, RECEIVED)).toEqual(VALID(content));
});

test('[SYNC-9.1] does not check the clock of a change that has no receive time yet', () => {
  const content = stampedAt(RECEIVED + HOUR);

  expect(judge(content)).toEqual(VALID(content));
});

test('[SYNC-9.1] refuses a deletion stamped an hour after it was received', () => {
  const removal = deletion(
    'expense',
    'dinner',
    at(RECEIVED + HOUR, 0, 'phone-b'),
  );

  expect(judge(removal, RECEIVED)).toEqual(refused('clock'));
  expect(judge(removal)).toEqual(VALID(removal));
});

test('[SYNC-9.1] refused stamps move neither the phone nor its next change forward', () => {
  const phone: Phone = {
    records: { 'expense/dinner': dinner() },
    seen: at(RECEIVED, 0, 'phone-a'),
  };
  const tooNew = [
    stampedAt(RECEIVED + HOUR),
    deletion('expense', 'dinner', at(RECEIVED + HOUR, 0, 'phone-b')),
  ].map((content) => ({ content, receivedAtMs: RECEIVED }));

  const after = tooNew.reduce(receive, phone);

  expect(after).toEqual(phone);
  expect(
    nextSyncStamp({
      seen: after.seen,
      nowMs: RECEIVED + 1000,
      device: 'phone-a',
    }),
  ).toEqual(at(RECEIVED + 1000, 0, 'phone-a'));
});

const LATE = at(RECEIVED + HOUR, 0, 'phone-b');

test.each<[string, string, unknown]>([
  ['its structure and its clock', 'structure', dinnerWith('title', '', LATE)],
  [
    'its clock and its currency',
    'clock',
    dinnerMoney({ currency: 'XYZ' }, LATE),
  ],
  ['its clock and its sum', 'clock', dinnerMoney({ shares: [] }, LATE)],
  [
    'its currency and its sum',
    'currency',
    dinnerMoney({ currency: 'XYZ', shares: [] }),
  ],
  [
    'its structure, its currency and its sum',
    'structure',
    { ...dinnerMoney({ currency: 'XYZ', shares: [] }), id: '' },
  ],
])(
  '[SYNC-10.1] an event refused for %s reports its %s',
  (_case, reason, content) => {
    expect(judge(content, RECEIVED)).toEqual(refused(reason));
  },
);

test.each<[string, number]>([
  ['negative', -1],
  ['fractional', 1.5],
  ['not a number', Number.NaN],
  ['past the largest safe integer', Number.MAX_SAFE_INTEGER + 1],
])('[SYNC-18.1] throws when the receive time is %s', (_case, receivedAtMs) => {
  expect(checkSyncEvent(created, { receivedAtMs: 0 })).toEqual(VALID(created));
  expect(() => checkSyncEvent(created, { receivedAtMs })).toThrow();
});
