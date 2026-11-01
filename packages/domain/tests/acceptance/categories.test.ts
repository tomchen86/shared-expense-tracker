import {
  CATEGORY_COLORS,
  DEFAULT_CATEGORIES,
  availableCategoryColors,
  categoryNameProblem,
} from '../../src';

const PALETTE = [
  '#D81B60',
  '#1E88E5',
  '#FBC02D',
  '#00897B',
  '#8E24AA',
  '#F4511E',
  '#3949AB',
  '#6D4C41',
  '#757575',
  '#43A047',
  '#00ACC1',
  '#C62828',
  '#9E9D24',
];

const DEFAULTS = [
  { name: 'Food & Dining', color: '#D81B60' },
  { name: 'Transportation', color: '#1E88E5' },
  { name: 'Shopping', color: '#FBC02D' },
  { name: 'Entertainment', color: '#00897B' },
  { name: 'Bills & Utilities', color: '#8E24AA' },
  { name: 'Health', color: '#F4511E' },
  { name: 'Travel', color: '#3949AB' },
  { name: 'Other', color: '#6D4C41' },
  { name: 'Uncategorized', color: '#757575' },
];

const usingColors = (colors: string[]) => colors.map((color) => ({ color }));

test('[CATEGORIES-1.1] has the 13 palette colors in order', () => {
  expect(CATEGORY_COLORS).toEqual(PALETTE);
});

test('[CATEGORIES-2.1] has the nine default categories in order, in the first nine colors', () => {
  expect(
    DEFAULT_CATEGORIES.map(({ name, color }) => ({ name, color })),
  ).toEqual(DEFAULTS);
});

test.each<[string, string, string]>([
  ['an empty name', '', 'empty'],
  ['a name of only spaces', '   ', 'empty'],
  ['51 characters', 'a'.repeat(51), 'tooLong'],
  ['26 emoji, which are 52 characters', '😀'.repeat(26), 'tooLong'],
])('[CATEGORIES-3.1] rejects %s', (_case, name, problem) => {
  expect(categoryNameProblem(name, [])).toBe(problem);
});

test.each<[string, string]>([
  ['50 characters', 'a'.repeat(50)],
  ['50 characters with a space on each side', ` ${'a'.repeat(50)} `],
  ['25 emoji, which are 50 characters', '😀'.repeat(25)],
])('[CATEGORIES-3.1] accepts %s', (_case, name) => {
  expect(categoryNameProblem(name, [])).toBeUndefined();
});

test.each<[string, string, { name: string }[]]>([
  ['a default name in lowercase', 'food & dining', DEFAULTS],
  ['a default name in capitals with spaces', ' FOOD & DINING ', DEFAULTS],
  ['a name that differs only in the case of É', 'CAFÉ', [{ name: 'Café' }]],
  ['the trimmed name of another category', 'gym', [{ name: ' Gym ' }]],
])('[CATEGORIES-4.1] rejects %s as a duplicate', (_case, name, others) => {
  expect(categoryNameProblem(name, others)).toBe('duplicate');
});

test('[CATEGORIES-4.1] accepts a name no other category has', () => {
  expect(categoryNameProblem('Food', DEFAULTS)).toBeUndefined();
  expect(categoryNameProblem('Food & Dining', [])).toBeUndefined();
});

test('[CATEGORIES-5.1] offers all 13 colors when there are no other categories', () => {
  expect(availableCategoryColors([])).toEqual(PALETTE);
});

test('[CATEGORIES-5.1] offers the last four colors next to the default categories', () => {
  expect(availableCategoryColors(DEFAULTS)).toEqual([
    '#43A047',
    '#00ACC1',
    '#C62828',
    '#9E9D24',
  ]);
});

test('[CATEGORIES-5.1] keeps palette order when a color in the middle is taken', () => {
  expect(
    availableCategoryColors([...DEFAULTS, ...usingColors(['#00ACC1'])]),
  ).toEqual(['#43A047', '#C62828', '#9E9D24']);
});

test('[CATEGORIES-5.1] compares color codes regardless of case', () => {
  expect(availableCategoryColors(usingColors(['#43a047']))).toEqual(
    PALETTE.filter((color) => color !== '#43A047'),
  );
});

test('[CATEGORIES-5.1] offers no color once all 13 are taken', () => {
  expect(availableCategoryColors(usingColors(PALETTE))).toEqual([]);
});
