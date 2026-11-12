import {
  checkSyncEvent,
  compareSyncStamps,
  mergeSyncEvent,
  nextSyncStamp,
  overridesSyncMoney,
  syncRecordValues,
  type SyncMoney,
  type SyncMoneyChange,
  type SyncStamp,
  type SyncUnits,
} from '../../src';
import {
  at,
  bothOrders,
  change,
  CREATED,
  deletion,
  dinner,
  DINNER,
  DINNER_MONEY,
  dinnerChange,
  dinnerCreated,
  FUEL_CATEGORY,
  merge,
  merged,
  money,
  pick,
  receiveAll,
  seeded,
  shuffledWithRepeats,
  unit,
  unitsAt,
  valid,
  type Delivery,
  type Phone,
} from './sync-fixtures';

const share = (participant: string, amountMinor: number) => ({
  participant,
  amountMinor,
});

/** Dinner at 100.00, split three ways. */
const TEN_THOUSAND = money({
  amountMinor: 10000,
  payments: [share('casey', 10000)],
  shares: [share('blake', 3334), share('taylor', 3333), share('casey', 3333)],
});

/** Dinner split between Blake and Taylor only. */
const TWO_WAYS = money({
  shares: [share('blake', 5001), share('taylor', 5000)],
});

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

test("[SYNC-11.1] a record's first event gives it every unit with the event's stamp", () => {
  expect(dinner()).toEqual({
    type: 'expense',
    id: 'dinner',
    units: unitsAt(DINNER, CREATED),
  });
});

test('[SYNC-11.1] keeps changes to different units, whichever arrives first', () => {
  const title = dinnerChange(at(2000, 0, 'phone-a'), { title: 'Supper' });
  const note = dinnerChange(at(2000, 0, 'phone-b'), { note: 'Window seat' });

  for (const order of bothOrders(title, note)) {
    expect(merged(order, dinner()).units).toEqual({
      ...unitsAt(DINNER, CREATED),
      title: { value: 'Supper', stamp: at(2000, 0, 'phone-a') },
      note: { value: 'Window seat', stamp: at(2000, 0, 'phone-b') },
    });
  }
});

test('[SYNC-11.1] keeps the later change to the same unit, whichever arrives first', () => {
  const earlier = dinnerChange(at(2000, 0, 'phone-a'), { title: 'Supper' });
  const later = dinnerChange(at(3000, 0, 'phone-b'), { title: 'Late dinner' });

  for (const order of bothOrders(earlier, later)) {
    expect(merged(order, dinner()).units).toEqual({
      ...unitsAt(DINNER, CREATED),
      title: { value: 'Late dinner', stamp: at(3000, 0, 'phone-b') },
    });
  }
});

test.each<[string, SyncStamp, SyncStamp]>([
  ['the larger counter', at(2000, 0, 'phone-b'), at(2000, 1, 'phone-a')],
  ['the larger device', at(2000, 0, 'phone-a'), at(2000, 0, 'phone-b')],
])(
  '[SYNC-11.1] at the same millisecond, the change with %s stays',
  (_rule, loses, wins) => {
    const lost = dinnerChange(loses, { title: 'Supper' });
    const won = dinnerChange(wins, { title: 'Late dinner' });

    for (const order of bothOrders(lost, won)) {
      expect(unit(merged(order, dinner()), 'title')).toEqual({
        value: 'Late dinner',
        stamp: wins,
      });
    }
  },
);

test('[SYNC-11.1] a change made after seeing another stays, even from a phone whose clock is an hour behind', () => {
  const supperAt = at(7_200_000, 0, 'phone-a');
  const supper = dinnerChange(supperAt, { title: 'Supper' });
  const { seen } = merge(dinner(), supper, CREATED);
  const stamp = nextSyncStamp({ seen, nowMs: 3_605_000, device: 'phone-b' });
  const lateDinner = dinnerChange(stamp, { title: 'Late dinner' }, supperAt);

  expect(stamp).toEqual(at(7_200_000, 1, 'phone-b'));
  for (const order of bothOrders(supper, lateDinner)) {
    expect(unit(merged(order, dinner()), 'title')).toEqual({
      value: 'Late dinner',
      stamp,
    });
  }
});

test('[SYNC-11.1] a later restore beats an earlier move to the trash', () => {
  const trashedAt = at(2000, 0, 'phone-a');
  const trash = dinnerChange(trashedAt, { trashed: true });
  const restore = dinnerChange(
    at(3000, 0, 'phone-b'),
    { trashed: false },
    trashedAt,
  );

  expect(unit(merged([trash], dinner()), 'trashed')).toEqual({
    value: true,
    stamp: trashedAt,
  });
  for (const order of bothOrders(trash, restore)) {
    expect(unit(merged(order, dinner()), 'trashed')).toEqual({
      value: false,
      stamp: at(3000, 0, 'phone-b'),
    });
  }
});

test("[SYNC-11.1] a change that arrives before the record's first event keeps its unit", () => {
  const supperAt = at(2000, 0, 'phone-b');
  const early = merged([dinnerChange(supperAt, { title: 'Supper' })]);

  expect(early).toEqual({
    type: 'expense',
    id: 'dinner',
    units: { title: { value: 'Supper', stamp: supperAt } },
  });
  expect(merged([dinnerCreated()], early).units).toEqual({
    ...unitsAt(DINNER, CREATED),
    title: { value: 'Supper', stamp: supperAt },
  });
});

test('[SYNC-11.1] leaves the record and the event it was given as they were', () => {
  const record = deepFreeze(dinner());
  const event = deepFreeze(
    valid(dinnerChange(at(2000), { title: 'Supper', money: TEN_THOUSAND })),
  );
  const seen = deepFreeze(at(1500));
  const before = structuredClone({ record, event, seen });

  const result = mergeSyncEvent({ record, seen, event });

  expect({ record, event, seen }).toEqual(before);
  expect(unit(result.record, 'title')).toEqual({
    value: 'Supper',
    stamp: at(2000),
  });
});

test('[SYNC-12.1] the later money replaces the amount, payments and shares together', () => {
  const amount = dinnerChange(at(2000, 0, 'phone-a'), { money: TEN_THOUSAND });
  const split = dinnerChange(at(3000, 0, 'phone-b'), { money: TWO_WAYS });

  for (const order of bothOrders(amount, split)) {
    expect(unit(merged(order, dinner()), 'money')).toEqual({
      value: TWO_WAYS,
      stamp: at(3000, 0, 'phone-b'),
    });
  }
});

test('[SYNC-12.1] an earlier amount is not paired with a later payer', () => {
  const taylorPaid = money({ payments: [share('taylor', 10001)] });
  const payer = dinnerChange(at(3000, 0, 'phone-a'), { money: taylorPaid });
  const amount = dinnerChange(at(2000, 0, 'phone-b'), {
    money: money({
      amountMinor: 20000,
      payments: [share('casey', 20000)],
      shares: [
        share('blake', 6667),
        share('taylor', 6667),
        share('casey', 6666),
      ],
    }),
  });

  for (const order of bothOrders(payer, amount)) {
    expect(unit(merged(order, dinner()), 'money')).toEqual({
      value: taylorPaid,
      stamp: at(3000, 0, 'phone-a'),
    });
  }
});

test('[SYNC-12.1] money changed on one phone and the title on another are both kept', () => {
  const amount = dinnerChange(at(2000, 0, 'phone-a'), { money: TEN_THOUSAND });
  const title = dinnerChange(at(3000, 0, 'phone-b'), { title: 'Supper' });

  for (const order of bothOrders(amount, title)) {
    expect(merged(order, dinner()).units).toEqual({
      ...unitsAt(DINNER, CREATED),
      money: { value: TEN_THOUSAND, stamp: at(2000, 0, 'phone-a') },
      title: { value: 'Supper', stamp: at(3000, 0, 'phone-b') },
    });
  }
});

const deleted = (stamp: SyncStamp, type = 'expense', id = 'dinner') => ({
  type,
  id,
  deleted: stamp,
  units: {},
});

test('[SYNC-13.1] a later change does not bring a deleted record back, whichever arrives first', () => {
  const removedAt = at(2000, 0, 'phone-a');
  const removal = deletion('expense', 'dinner', removedAt);
  const supper = dinnerChange(at(3000, 0, 'phone-b'), { title: 'Supper' });

  for (const order of bothOrders(removal, supper)) {
    expect(merged(order, dinner())).toEqual(deleted(removedAt));
  }
});

test("[SYNC-13.1] a deletion that arrives before the record's first event keeps it deleted", () => {
  const removedAt = at(2000, 0, 'phone-b');
  const removal = deletion('expense', 'dinner', removedAt);

  expect(merged([removal])).toEqual(deleted(removedAt));
  expect(merged([removal, dinnerCreated()])).toEqual(deleted(removedAt));
});

test('[SYNC-13.1] restoring from the trash does not bring a deleted record back', () => {
  const removedAt = at(2000, 0, 'phone-a');
  const restore = dinnerChange(at(3000, 0, 'phone-b'), { trashed: false });

  expect(
    merged([deletion('expense', 'dinner', removedAt), restore], dinner()),
  ).toEqual(deleted(removedAt));
});

test('[SYNC-13.1] two deletions of one record leave the later stamp, whichever arrives first', () => {
  const first = deletion('expense', 'dinner', at(2000, 0, 'phone-a'));
  const second = deletion('expense', 'dinner', at(2500, 0, 'phone-b'));

  for (const order of bothOrders(first, second)) {
    expect(merged(order, dinner())).toEqual(deleted(at(2500, 0, 'phone-b')));
  }
});

test('[SYNC-13.1] a deleted category stays deleted when it is renamed later', () => {
  const removedAt = at(2000, 0, 'phone-a');
  const fuel = change('category', 'cat-fuel', CREATED, FUEL_CATEGORY);
  const removal = deletion('category', 'cat-fuel', removedAt);
  const renamed = change(
    'category',
    'cat-fuel',
    at(3000, 0, 'phone-b'),
    { name: 'Petrol' },
    CREATED,
  );

  for (const order of bothOrders(removal, renamed)) {
    expect(merged([fuel, ...order])).toEqual(
      deleted(removedAt, 'category', 'cat-fuel'),
    );
  }
});

const LUNCH_CREATED = at(1000, 0, 'phone-you');
const YOURS = at(5000, 0, 'phone-you');
const BOBS = at(6000, 0, 'phone-bob');

const lunchMoney = (
  amountMinor: number,
  sharers = ['you', 'bob'],
): SyncMoney => ({
  amountMinor,
  currency: 'JPY',
  payments: [share('you', amountMinor)],
  shares: sharers.map((sharer) => share(sharer, amountMinor / 2)),
});

const LUNCH: SyncUnits['expense'] = {
  ...DINNER,
  title: 'Lunch',
  money: lunchMoney(300),
};

const lunchChange = (
  stamp: SyncStamp,
  values: Partial<SyncUnits['expense']>,
  base?: SyncStamp,
) => change('expense', 'lunch', stamp, values, base);

/** Your own change of Lunch's money, made on top of its first event. */
const yours = (value = lunchMoney(320)): SyncMoneyChange => ({
  stamp: YOURS,
  money: value,
});

/** Whether the event overrode your money change. */
const overrides = (content: unknown, mine = yours()) =>
  overridesSyncMoney(valid(content), mine);

/** Bob's change of Lunch's money to 350. */
const bobs = (stamp: SyncStamp, base?: SyncStamp, value = lunchMoney(350)) =>
  lunchChange(stamp, { money: value }, base);

test('[SYNC-14.1] a later money change made without seeing yours overrode it, however often it is asked', () => {
  const event = bobs(BOBS, LUNCH_CREATED);

  expect(overrides(event)).toBe(true);
  expect(overrides(event)).toBe(true);
});

test.each<[string, unknown]>([
  ['that carries no base', bobs(BOBS)],
  [
    'that is later by its device only',
    bobs(at(5000, 0, 'phone-zed'), LUNCH_CREATED),
  ],
  [
    'that changes the title too',
    lunchChange(
      BOBS,
      { title: 'Late lunch', money: lunchMoney(350) },
      LUNCH_CREATED,
    ),
  ],
])('[SYNC-14.1] a money change %s overrode yours', (_case, event) => {
  expect(overrides(event)).toBe(true);
});

test.each<[string, unknown]>([
  ['made on top of yours', bobs(BOBS, YOURS)],
  [
    'made on top of a change later than yours',
    bobs(BOBS, at(5500, 0, 'phone-carol')),
  ],
  ['stamped earlier than yours', bobs(at(4000, 0, 'phone-bob'), LUNCH_CREATED)],
  ['that is your own event', bobs(YOURS, LUNCH_CREATED, lunchMoney(320))],
])('[SYNC-14.1] a money change %s did not override it', (_case, event) => {
  expect(overrides(event)).toBe(false);
});

test('[SYNC-14.1] a third phone changing the money first does not hide that yours was overridden', () => {
  const carols = bobs(at(5500, 0, 'phone-carol'), YOURS, lunchMoney(330));
  const bobsEvent = bobs(BOBS, LUNCH_CREATED);
  const onYourPhone = merged([
    lunchChange(LUNCH_CREATED, LUNCH),
    lunchChange(YOURS, { money: lunchMoney(320) }, LUNCH_CREATED),
  ]);

  for (const order of bothOrders(carols, bobsEvent)) {
    expect(unit(merged(order, onYourPhone), 'money')).toEqual({
      value: lunchMoney(350),
      stamp: BOBS,
    });
    expect(order.map((event) => overrides(event))).toEqual(
      order.map((event) => event === bobsEvent),
    );
  }
});

test('[SYNC-14.1] a change to exactly the same money did not override yours', () => {
  expect(overrides(bobs(BOBS, LUNCH_CREATED), yours(lunchMoney(350)))).toBe(
    false,
  );
});

test.each<[string, SyncMoney]>([
  ['the shares are in another order', lunchMoney(350, ['bob', 'you'])],
  ['someone else paid', { ...lunchMoney(350), payments: [share('bob', 350)] }],
  ['the currency differs', { ...lunchMoney(350), currency: 'TWD' }],
  [
    'one share differs',
    { ...lunchMoney(350), shares: [share('you', 176), share('bob', 174)] },
  ],
])(
  '[SYNC-14.1] a change to the same amount overrode yours when %s',
  (_case, bobsMoney) => {
    expect(
      overrides(bobs(BOBS, LUNCH_CREATED, bobsMoney), yours(lunchMoney(350))),
    ).toBe(true);
  },
);

test.each<[string, unknown]>([
  [
    'changes only the title',
    lunchChange(BOBS, { title: 'Late lunch' }, LUNCH_CREATED),
  ],
  ['deletes the expense', deletion('expense', 'lunch', BOBS)],
])('[SYNC-14.1] an event that %s did not override yours', (_case, event) => {
  expect(overrides(event)).toBe(false);
});

test('[SYNC-15.1] the first event merged is the latest stamp seen', () => {
  const stamp = at(5000, 0, 'phone-b');

  expect(
    merge(undefined, change('expense', 'dinner', stamp, DINNER)).seen,
  ).toEqual(stamp);
});

test.each<[string, SyncStamp, SyncStamp, SyncStamp]>([
  [
    'a later event',
    at(5000, 0, 'phone-a'),
    at(6000, 0, 'phone-b'),
    at(6000, 0, 'phone-b'),
  ],
  [
    'an earlier event',
    at(6000, 0, 'phone-b'),
    at(5000, 0, 'phone-a'),
    at(6000, 0, 'phone-b'),
  ],
  [
    'an event later by its device only',
    at(5000, 0, 'phone-a'),
    at(5000, 0, 'phone-b'),
    at(5000, 0, 'phone-b'),
  ],
  [
    'an event earlier by its counter only',
    at(5000, 1, 'phone-a'),
    at(5000, 0, 'phone-b'),
    at(5000, 1, 'phone-a'),
  ],
])(
  '[SYNC-15.1] after %s the latest stamp seen is the later of the two',
  (_case, seen, stamp, expected) => {
    const result = merge(
      dinner(),
      dinnerChange(stamp, { title: 'Supper' }),
      seen,
    );

    expect(result.seen).toEqual(expected);
  },
);

test('[SYNC-15.1] an event that changes no unit still counts as seen', () => {
  const removedAt = at(2000, 0, 'phone-a');
  const gone = merged([deletion('expense', 'dinner', removedAt)], dinner());

  const result = merge(
    gone,
    dinnerChange(at(2500, 0, 'phone-b'), { title: 'Supper' }),
    removedAt,
  );

  expect(result.record).toEqual(gone);
  expect(result.seen).toEqual(at(2500, 0, 'phone-b'));
});

test('[SYNC-15.1] a deletion counts as seen too', () => {
  const result = merge(
    dinner(),
    deletion('expense', 'dinner', at(6000, 0, 'phone-b')),
    at(5000, 0, 'phone-a'),
  );

  expect(result.seen).toEqual(at(6000, 0, 'phone-b'));
});

test('[SYNC-15.1] the next change is stamped after the event just merged', () => {
  const { seen } = merge(
    dinner(),
    dinnerChange(at(6000, 0, 'phone-b'), { title: 'Supper' }),
    CREATED,
  );

  expect(nextSyncStamp({ seen, nowMs: 5000, device: 'phone-a' })).toEqual(
    at(6000, 1, 'phone-a'),
  );
});

test('[SYNC-16.1] a record with every unit shows the value each unit holds now', () => {
  const record = merged(
    [dinnerChange(at(2000), { title: 'Supper' })],
    dinner(),
  );

  expect(syncRecordValues(dinner())).toEqual(DINNER);
  expect(syncRecordValues(record)).toEqual({ ...DINNER, title: 'Supper' });
});

test('[SYNC-16.1] a record that only got a later change shows nothing until its first event arrives', () => {
  const early = merged([
    dinnerChange(at(2000, 0, 'phone-b'), { title: 'Supper' }),
  ]);

  expect(syncRecordValues(early)).toBeUndefined();
  expect(syncRecordValues(merged([dinnerCreated()], early))).toEqual({
    ...DINNER,
    title: 'Supper',
  });
});

test('[SYNC-16.1] a deleted record shows nothing', () => {
  const gone = merged([deletion('expense', 'dinner', at(2000))], dinner());

  expect(syncRecordValues(gone)).toBeUndefined();
});

test('[SYNC-16.1] a category shows nothing until it has its name, color and archived mark', () => {
  const partial = merged([
    change('category', 'cat-fuel', CREATED, { name: 'Fuel', color: '#1E88E5' }),
  ]);
  const whole = merged(
    [change('category', 'cat-fuel', at(2000), { archived: false })],
    partial,
  );

  expect(syncRecordValues(partial)).toBeUndefined();
  expect(syncRecordValues(whole)).toEqual(FUEL_CATEGORY);
});

test('[SYNC-16.1] a member shows nothing until it has its name and removed mark', () => {
  const partial = merged([
    change('member', 'blake', CREATED, { name: 'Blake' }),
  ]);
  const whole = merged(
    [change('member', 'blake', at(2000), { removed: true })],
    partial,
  );

  expect(syncRecordValues(partial)).toBeUndefined();
  expect(syncRecordValues(whole)).toEqual({ name: 'Blake', removed: true });
});

test('[SYNC-16.1] a group shows its name', () => {
  const group = merged([
    change('group', 'brisbane', CREATED, { name: 'Brisbane' }),
  ]);

  expect(syncRecordValues(group)).toEqual({ name: 'Brisbane' });
});

test.each<[string, unknown]>([
  [
    'a change',
    dinnerChange(at(6000, 0, 'phone-b'), { title: 'Supper', money: TWO_WAYS }),
  ],
  ['a deletion', deletion('expense', 'dinner', at(6000, 0, 'phone-b'))],
  ["the record's first event", dinnerCreated()],
])('[SYNC-17.1] merging %s again changes nothing', (_case, event) => {
  const once = merge(dinner(), event, CREATED);

  let again = once;
  for (let repeat = 0; repeat < 2; repeat += 1) {
    again = merge(again.record, event, again.seen);
    expect(again).toEqual(once);
  }
});

const T0 = 1_700_000_000_000;
const TAYLOR = 'phone-taylor';
const CASEY = 'phone-casey';
const BLAKE = 'phone-blake';

/** A stamp `seconds` after T0. */
const t = (seconds: number, counter: number, device: string) =>
  at(T0 + seconds * 1000, counter, device);

/** Uploaded a minute after it was made. */
const delivered = <T extends { stamp: SyncStamp }>(content: T): Delivery => ({
  content,
  receivedAtMs: content.stamp.ms + 60_000,
});

const TWELVE_THOUSAND = money({
  amountMinor: 12000,
  payments: [share('casey', 12000)],
  shares: [share('blake', 4000), share('taylor', 4000), share('casey', 4000)],
});

const NINE_THOUSAND = money({
  amountMinor: 9000,
  payments: [share('casey', 9000)],
  shares: [share('blake', 3000), share('taylor', 3000), share('casey', 3000)],
});

const FUEL: SyncUnits['expense'] = {
  title: 'Fuel',
  date: '2025-03-15',
  note: 'Full tank',
  category: { id: 'cat-fuel', name: 'Fuel', color: '#1E88E5' },
  money: {
    amountMinor: 5000,
    currency: 'JPY',
    payments: [share('taylor', 5000)],
    shares: [share('taylor', 2500), share('casey', 2500)],
  },
  trashed: false,
};

const SNACKS: SyncUnits['expense'] = {
  ...DINNER,
  title: 'Snacks',
  money: money({
    amountMinor: 1,
    payments: [share('blake', 1)],
    shares: [share('blake', 1), share('casey', 0)],
  }),
};

const FOOD_CATEGORY: SyncUnits['category'] = {
  name: 'Food & Dining',
  color: '#D81B60',
  archived: false,
};

const GROUP_MADE = t(1, 0, TAYLOR);
const TAYLOR_MADE = t(1, 1, TAYLOR);
const CASEY_MADE = t(1, 2, TAYLOR);
const FOOD_MADE = t(1, 3, TAYLOR);
const DINNER_MADE = t(2, 0, TAYLOR);
const BLAKE_MADE = t(3, 0, CASEY);
const FUEL_MADE = t(7, 0, TAYLOR);
const FUEL_TRASHED = t(8, 0, TAYLOR);
const SNACKS_MADE = t(10, 0, TAYLOR);
const PETROL_MADE = t(13, 0, BLAKE);

/** A week in a shared group, each event once, in the order of their stamps. */
const WEEK: Delivery[] = [
  change('group', 'brisbane', GROUP_MADE, { name: 'Brisbane' }),
  change('member', 'taylor', TAYLOR_MADE, { name: 'Taylor', removed: false }),
  change('member', 'casey', CASEY_MADE, { name: 'Casey', removed: false }),
  change('category', 'cat-food', FOOD_MADE, FOOD_CATEGORY),
  change('expense', 'dinner', DINNER_MADE, DINNER),
  change('member', 'blake', BLAKE_MADE, { name: 'Blake', removed: false }),
  // Two phones change different units of Dinner.
  change('expense', 'dinner', t(4, 0, CASEY), { title: 'Supper' }, DINNER_MADE),
  change(
    'expense',
    'dinner',
    t(4, 0, TAYLOR),
    { note: 'Window seat' },
    DINNER_MADE,
  ),
  // Two phones change Dinner's money without seeing each other.
  change(
    'expense',
    'dinner',
    t(5, 0, TAYLOR),
    { money: TWELVE_THOUSAND },
    DINNER_MADE,
  ),
  change(
    'expense',
    'dinner',
    t(5.5, 0, CASEY),
    { money: NINE_THOUSAND },
    DINNER_MADE,
  ),
  // Two phones rename the group in the same millisecond.
  change(
    'group',
    'brisbane',
    t(6, 0, BLAKE),
    { name: 'Brisbane Trip' },
    GROUP_MADE,
  ),
  change('group', 'brisbane', t(6, 0, CASEY), { name: 'Brissie' }, GROUP_MADE),
  // Fuel goes to the trash and comes back.
  change('expense', 'fuel', FUEL_MADE, FUEL),
  change('expense', 'fuel', FUEL_TRASHED, { trashed: true }, FUEL_MADE),
  change('expense', 'fuel', t(9, 0, CASEY), { trashed: false }, FUEL_TRASHED),
  // Snacks is deleted twice, and changed after the first deletion.
  change('expense', 'snacks', SNACKS_MADE, SNACKS),
  deletion('expense', 'snacks', t(11, 0, CASEY)),
  change(
    'expense',
    'snacks',
    t(12, 0, TAYLOR),
    { title: 'Late snacks' },
    SNACKS_MADE,
  ),
  deletion('expense', 'snacks', t(12.5, 0, BLAKE)),
  change('category', 'cat-fuel', PETROL_MADE, FUEL_CATEGORY),
  change(
    'category',
    'cat-fuel',
    t(14, 0, CASEY),
    { archived: true },
    PETROL_MADE,
  ),
  change(
    'category',
    'cat-fuel',
    t(14, 0, TAYLOR),
    { name: 'Petrol' },
    PETROL_MADE,
  ),
  change('member', 'blake', t(15, 0, BLAKE), { removed: true }, BLAKE_MADE),
  change('member', 'blake', t(16, 0, CASEY), { name: 'Blake K.' }, BLAKE_MADE),
].map(delivered);

const EXPECTED: Phone = {
  records: {
    'group/brisbane': {
      type: 'group',
      id: 'brisbane',
      units: { name: { value: 'Brissie', stamp: t(6, 0, CASEY) } },
    },
    'member/taylor': {
      type: 'member',
      id: 'taylor',
      units: {
        name: { value: 'Taylor', stamp: TAYLOR_MADE },
        removed: { value: false, stamp: TAYLOR_MADE },
      },
    },
    'member/casey': {
      type: 'member',
      id: 'casey',
      units: {
        name: { value: 'Casey', stamp: CASEY_MADE },
        removed: { value: false, stamp: CASEY_MADE },
      },
    },
    'member/blake': {
      type: 'member',
      id: 'blake',
      units: {
        name: { value: 'Blake K.', stamp: t(16, 0, CASEY) },
        removed: { value: true, stamp: t(15, 0, BLAKE) },
      },
    },
    'category/cat-food': {
      type: 'category',
      id: 'cat-food',
      units: {
        name: { value: 'Food & Dining', stamp: FOOD_MADE },
        color: { value: '#D81B60', stamp: FOOD_MADE },
        archived: { value: false, stamp: FOOD_MADE },
      },
    },
    'category/cat-fuel': {
      type: 'category',
      id: 'cat-fuel',
      units: {
        name: { value: 'Petrol', stamp: t(14, 0, TAYLOR) },
        color: { value: '#1E88E5', stamp: PETROL_MADE },
        archived: { value: true, stamp: t(14, 0, CASEY) },
      },
    },
    'expense/dinner': {
      type: 'expense',
      id: 'dinner',
      units: {
        title: { value: 'Supper', stamp: t(4, 0, CASEY) },
        date: { value: '2025-03-14', stamp: DINNER_MADE },
        note: { value: 'Window seat', stamp: t(4, 0, TAYLOR) },
        category: { value: DINNER.category, stamp: DINNER_MADE },
        money: { value: NINE_THOUSAND, stamp: t(5.5, 0, CASEY) },
        trashed: { value: false, stamp: DINNER_MADE },
      },
    },
    'expense/fuel': {
      type: 'expense',
      id: 'fuel',
      units: {
        title: { value: 'Fuel', stamp: FUEL_MADE },
        date: { value: '2025-03-15', stamp: FUEL_MADE },
        note: { value: 'Full tank', stamp: FUEL_MADE },
        category: { value: FUEL.category, stamp: FUEL_MADE },
        money: { value: FUEL.money, stamp: FUEL_MADE },
        trashed: { value: false, stamp: t(9, 0, CASEY) },
      },
    },
    'expense/snacks': {
      type: 'expense',
      id: 'snacks',
      deleted: t(12.5, 0, BLAKE),
      units: {},
    },
  },
  seen: t(16, 0, CASEY),
};

/** Events every phone refuses, each stamped after everything in the week. */
const REFUSED: Delivery[] = [
  // Shares that do not add up to the amount.
  delivered(
    change(
      'expense',
      'dinner',
      t(20, 0, BLAKE),
      { money: money({ shares: [share('blake', 1)] }) },
      DINNER_MADE,
    ),
  ),
  // An empty title.
  delivered(
    change('expense', 'dinner', t(21, 0, BLAKE), { title: '' }, DINNER_MADE),
  ),
  // A currency that is not supported.
  delivered(
    change(
      'expense',
      'fuel',
      t(22, 0, BLAKE),
      { money: { ...FUEL.money, currency: 'XYZ' } },
      FUEL_MADE,
    ),
  ),
  // The deletion of a member.
  delivered({
    ...deletion('expense', 'casey', t(23, 0, BLAKE)),
    type: 'member',
  }),
  // Stamped an hour after it was received.
  {
    content: change(
      'group',
      'brisbane',
      at(T0 + 30_000 + 3_600_000, 0, BLAKE),
      { name: 'From the future' },
      GROUP_MADE,
    ),
    receivedAtMs: T0 + 30_000,
  },
  // A deletion stamped an hour after it was received.
  {
    content: deletion(
      'expense',
      'dinner',
      at(T0 + 30_000 + 3_600_000, 1, BLAKE),
    ),
    receivedAtMs: T0 + 30_000,
  },
];

const stampOf = (delivery: Delivery) =>
  (delivery.content as { stamp: SyncStamp }).stamp;

test('[SYNC-17.1] 200 shuffled orders with repeats give the result of merging each event once in stamp order', () => {
  const inStampOrder = [...WEEK].sort((a, b) =>
    compareSyncStamps(stampOf(a), stampOf(b)),
  );

  expect(inStampOrder).toEqual(WEEK);
  expect(receiveAll(WEEK)).toEqual(EXPECTED);
  expect(receiveAll([...WEEK].reverse())).toEqual(EXPECTED);

  const random = seeded(130);
  for (let run = 0; run < 200; run += 1) {
    expect(receiveAll(shuffledWithRepeats(WEEK, random))).toEqual(EXPECTED);
  }
});

test('[SYNC-17.1] refused events leave the result as if they had never been sent', () => {
  for (const { content, receivedAtMs } of REFUSED) {
    expect(checkSyncEvent(content, { receivedAtMs }).status).toBe('refused');
  }

  const random = seeded(131);
  for (let run = 0; run < 200; run += 1) {
    expect(
      receiveAll(shuffledWithRepeats([...WEEK, ...REFUSED], random)),
    ).toEqual(EXPECTED);
  }
});

const DEVICES = ['phone-a', 'phone-b', 'phone-c'];

/** One of 12 stamps, so that many events share a stamp. */
const crowdedStamp = (random: () => number) =>
  at(
    1000 + Math.floor(random() * 2),
    Math.floor(random() * 2),
    pick(DEVICES, random),
  );

const RANDOM_VALUES: Record<string, Record<string, readonly unknown[]>> = {
  expense: {
    title: ['Dinner', 'Supper', 'Late dinner'],
    date: ['2025-03-14', '2025-03-15'],
    note: [null, 'Window seat', 'By the door'],
    category: [DINNER.category, FUEL.category],
    money: [DINNER_MONEY, TEN_THOUSAND, TWO_WAYS, FUEL.money],
    trashed: [true, false],
  },
  category: {
    name: ['Fuel', 'Petrol'],
    color: ['#1E88E5', '#43A047'],
    archived: [true, false],
  },
  group: { name: ['Brisbane', 'Brissie', 'Brisbane Trip'] },
  member: { name: ['Blake', 'Blake K.'], removed: [true, false] },
};

const RANDOM_RECORDS: readonly (readonly [string, string])[] = [
  ['expense', 'dinner'],
  ['expense', 'fuel'],
  ['category', 'cat-fuel'],
  ['group', 'brisbane'],
  ['member', 'blake'],
  ['member', 'casey'],
];

/** A valid event on one of six records; now and then the deletion of Fuel. */
function randomEvent(random: () => number): unknown {
  const [type, id] = pick(RANDOM_RECORDS, random);
  const stamp = crowdedStamp(random);
  if (id === 'fuel' && random() < 0.05) return deletion('expense', id, stamp);

  const choices = RANDOM_VALUES[type];
  const whole = random() < 0.2;
  const names = Object.keys(choices).filter(() => whole || random() < 0.5);
  if (names.length === 0) names.push(pick(Object.keys(choices), random));
  const base = random() < 0.5 ? crowdedStamp(random) : undefined;
  return {
    version: 1,
    stamp,
    type,
    id,
    units: Object.fromEntries(
      names.map((name) => [
        name,
        base
          ? { value: pick(choices[name], random), base }
          : { value: pick(choices[name], random) },
      ]),
    ),
  };
}

interface RandomEvent {
  stamp: SyncStamp;
  type: string;
  id: string;
  units?: Record<string, { value: unknown }>;
}

/**
 * How many units, in records that are never deleted, have a latest stamp that events
 * setting different values share. Read from the events alone, without merging them.
 */
function unitsEndingOnASharedStamp(deliveries: readonly Delivery[]): number {
  const events = deliveries.map(({ content }) => content as RandomEvent);
  const isLater = (a: SyncStamp, b: SyncStamp) =>
    a.ms !== b.ms
      ? a.ms > b.ms
      : a.counter !== b.counter
        ? a.counter > b.counter
        : a.device > b.device;
  const deletedRecords = new Set(
    events.filter(({ units }) => !units).map(({ type, id }) => `${type}/${id}`),
  );
  const latest = new Map<string, { stamp: SyncStamp; values: Set<string> }>();
  for (const { stamp, type, id, units } of events) {
    if (deletedRecords.has(`${type}/${id}`)) continue;
    for (const [name, { value }] of Object.entries(units ?? {})) {
      const key = `${type}/${id}/${name}`;
      const found = latest.get(key);
      if (!found || isLater(stamp, found.stamp)) {
        latest.set(key, { stamp, values: new Set([JSON.stringify(value)]) });
      } else if (!isLater(found.stamp, stamp)) {
        found.values.add(JSON.stringify(value));
      }
    }
  }
  return [...latest.values()].filter(({ values }) => values.size > 1).length;
}

test('[SYNC-17.1] 150 random events with crowded stamps merge to one result in 50 shuffled orders', () => {
  const random = seeded(2026);
  const deliveries = Array.from({ length: 150 }, () => ({
    content: randomEvent(random),
    receivedAtMs: 2000,
  }));

  // The order of the merges can only matter where a unit's latest stamp is shared.
  expect(unitsEndingOnASharedStamp(deliveries)).toBe(7);

  for (const { content, receivedAtMs } of deliveries) {
    expect(checkSyncEvent(content, { receivedAtMs })).toEqual({
      status: 'valid',
      event: content,
    });
  }

  const reference = receiveAll(deliveries);
  expect(Object.keys(reference.records).sort()).toEqual(
    RANDOM_RECORDS.map(([type, id]) => `${type}/${id}`).sort(),
  );
  for (let run = 0; run < 50; run += 1) {
    expect(receiveAll(shuffledWithRepeats(deliveries, random))).toEqual(
      reference,
    );
  }
});

const TIED = at(2000, 0, 'phone-a');

/** An event at the shared stamp that sets one unit. */
const tied = (type: string, id: string, name: string, value: unknown) => ({
  version: 1,
  stamp: TIED,
  type,
  id,
  units: { [name]: { value } },
});

const FIRST_EVENTS: Record<string, unknown> = {
  'expense/dinner': dinnerCreated(),
  'category/cat-fuel': change('category', 'cat-fuel', CREATED, FUEL_CATEGORY),
  'group/brisbane': change('group', 'brisbane', CREATED, {
    name: 'Brisbane Trip',
  }),
  'member/blake': change('member', 'blake', CREATED, {
    name: 'Blake',
    removed: false,
  }),
};

const FOOD = DINNER.category;

// [what stays, record, unit, the smaller value, the larger value]
test.each<[string, string, string, unknown, unknown]>([
  [
    'the title whose first letter is larger',
    'expense/dinner',
    'title',
    'Late dinner',
    'Supper',
  ],
  [
    'the longer title when one starts with the other',
    'expense/dinner',
    'title',
    'Dinner',
    'Dinner at eight',
  ],
  [
    'a lowercase title over an uppercase one',
    'expense/dinner',
    'title',
    'Supper',
    'dinner',
  ],
  ['a title outside ASCII', 'expense/dinner', 'title', 'Supper', '晚餐'],
  [
    'the title with the larger code unit, not code point',
    'expense/dinner',
    'title',
    '😀',
    '～',
  ],
  ['the later date', 'expense/dinner', 'date', '2025-03-14', '2025-03-15'],
  ['a note over no note', 'expense/dinner', 'note', null, 'Window seat'],
  ['in the trash over out of it', 'expense/dinner', 'trashed', false, true],
  [
    'the category with the larger color, whatever its ID',
    'expense/dinner',
    'category',
    FUEL.category,
    FOOD,
  ],
  [
    'the category with the larger ID, whatever its name',
    'expense/dinner',
    'category',
    { ...FOOD, id: 'cat-a', name: 'Zoo' },
    { ...FOOD, id: 'cat-b', name: 'Apple' },
  ],
  [
    'the category with the larger name',
    'expense/dinner',
    'category',
    { ...FOOD, name: 'Dining' },
    { ...FOOD, name: 'Food' },
  ],
  [
    'the money with the larger amount, whatever its currency',
    'expense/dinner',
    'money',
    TEN_THOUSAND,
    money({ currency: 'JPY' }),
  ],
  [
    'the money with the larger currency, whatever its payments',
    'expense/dinner',
    'money',
    money({ currency: 'JPY', payments: [share('taylor', 10001)] }),
    DINNER_MONEY,
  ],
  [
    'the money with the larger payer, whatever its shares',
    'expense/dinner',
    'money',
    TWO_WAYS,
    money({ payments: [share('taylor', 10001)] }),
  ],
  [
    'the money whose first payment is larger, whoever made it',
    'expense/dinner',
    'money',
    money({ payments: [share('casey', 6000), share('taylor', 4001)] }),
    money({ payments: [share('blake', 10001)] }),
  ],
  [
    'the money whose first share is larger, however many shares',
    'expense/dinner',
    'money',
    DINNER_MONEY,
    TWO_WAYS,
  ],
  [
    'the money whose first share is held by the larger participant',
    'expense/dinner',
    'money',
    money({ shares: [share('blake', 5000), share('taylor', 5001)] }),
    money({ shares: [share('taylor', 5000), share('blake', 5001)] }),
  ],
  [
    'the money with one more payment',
    'expense/dinner',
    'money',
    DINNER_MONEY,
    money({ payments: [share('casey', 10001), share('taylor', 0)] }),
  ],
  ['the larger group name', 'group/brisbane', 'name', 'Brisbane', 'Brissie'],
  ['a removed member', 'member/blake', 'removed', false, true],
  ['an archived category', 'category/cat-fuel', 'archived', false, true],
  [
    'the larger category color',
    'category/cat-fuel',
    'color',
    '#1E88E5',
    '#43A047',
  ],
])(
  '[SYNC-19.1] two events with one stamp leave %s',
  (_case, key, name, smaller, larger) => {
    const [type, id] = key.split('/');
    const record = merged([FIRST_EVENTS[key]]);
    const events = bothOrders(
      tied(type, id, name, smaller),
      tied(type, id, name, larger),
    );

    for (const order of events) {
      expect(unit(merged(order, record), name)).toEqual({
        value: larger,
        stamp: TIED,
      });
    }
  },
);

test('[SYNC-19.1] three events with one stamp leave the largest value in all six orders', () => {
  const [supper, lateDinner, atEight] = [
    'Supper',
    'Late dinner',
    'Dinner at eight',
  ].map((title) => tied('expense', 'dinner', 'title', title));
  const orders = [
    [supper, lateDinner, atEight],
    [supper, atEight, lateDinner],
    [lateDinner, supper, atEight],
    [lateDinner, atEight, supper],
    [atEight, supper, lateDinner],
    [atEight, lateDinner, supper],
  ];

  for (const order of orders) {
    expect(unit(merged(order, dinner()), 'title')).toEqual({
      value: 'Supper',
      stamp: TIED,
    });
  }
});

test.each<[string, unknown]>([
  ['another expense', change('expense', 'fuel', at(2000), { title: 'Fuel' })],
  [
    'a category with the same id',
    change('category', 'dinner', at(2000), { name: 'Dinner' }),
  ],
  ['the deletion of another expense', deletion('expense', 'fuel', at(2000))],
])(
  '[SYNC-18.1] throws when asked to merge %s into Dinner',
  (_case, content) => {
    const record = dinner();
    const event = valid(content);

    expect(() => mergeSyncEvent({ record, event })).toThrow();
  },
);
