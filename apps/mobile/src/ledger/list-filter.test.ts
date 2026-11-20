import { NO_FILTER, sameFilter } from './list-filter';

test.each(['categories', 'ledgers', 'payers'] as const)(
  'compares %s by membership regardless of selection order',
  (field) => {
    const filter = { ...NO_FILTER, [field]: ['a', 'b'] };
    expect(sameFilter(filter, { ...filter, [field]: ['b', 'a'] })).toBe(true);
    expect(sameFilter(filter, { ...filter, [field]: ['a', 'c'] })).toBe(false);
  },
);

test.each<[string, string, boolean]>([
  ['', '0', false],
  ['0.', '.000', true],
  ['.5', '000.500', true],
  ['9007199254740992', '9007199254740993', false],
  ['1.000000000000000001', '1.000000000000000002', false],
])('compares bounds %p and %p exactly', (left, right, equal) => {
  expect(
    sameFilter({ ...NO_FILTER, min: left }, { ...NO_FILTER, min: right }),
  ).toBe(equal);
});
