import {
  CATEGORY_COLORS,
  DEFAULT_CATEGORIES,
  MAX_CATEGORY_NAME_LENGTH,
  availableCategoryColors,
  categoryNameProblem,
} from './categories';

test('palette and default categories are frozen against accidental mutation', () => {
  expect(Object.isFrozen(CATEGORY_COLORS)).toBe(true);
  expect(Object.isFrozen(DEFAULT_CATEGORIES)).toBe(true);
  for (const category of DEFAULT_CATEGORIES) {
    expect(Object.isFrozen(category)).toBe(true);
  }
});

test('length checks run before duplicate comparison', () => {
  const longName = 'a'.repeat(MAX_CATEGORY_NAME_LENGTH + 1);
  expect(categoryNameProblem('   \t\n  ', [{ name: '' }])).toBe('empty');
  expect(categoryNameProblem(longName, [{ name: longName }])).toBe('tooLong');
});

test('ignores non-palette or duplicate used colors while keeping palette order', () => {
  expect(
    availableCategoryColors([
      { color: '#123456' },
      { color: '#d81b60' },
      { color: '#D81B60' },
    ]),
  ).toEqual(CATEGORY_COLORS.slice(1));
});
