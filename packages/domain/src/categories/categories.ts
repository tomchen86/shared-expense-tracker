/** Maximum trimmed length of a category name, in UTF-16 code units. */
export const MAX_CATEGORY_NAME_LENGTH = 50;

/** Why a category name cannot be used (CATEGORIES-3.1, CATEGORIES-4.1). */
export type CategoryNameProblem = 'empty' | 'tooLong' | 'duplicate';

/** The category colors, in palette order. */
export const CATEGORY_COLORS: readonly string[] = Object.freeze([
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
]);

const DEFAULT_CATEGORY_NAMES = [
  'Food & Dining',
  'Transportation',
  'Shopping',
  'Entertainment',
  'Bills & Utilities',
  'Health',
  'Travel',
  'Other',
  'Uncategorized',
] as const;

/** The categories the phone starts with, in order. */
export const DEFAULT_CATEGORIES: readonly {
  readonly name: string;
  readonly color: string;
}[] = Object.freeze(
  DEFAULT_CATEGORY_NAMES.map((name, index) =>
    Object.freeze({ name, color: CATEGORY_COLORS[index] }),
  ),
);

/** Why `name` cannot be used next to the other categories, if it cannot. */
export function categoryNameProblem(
  name: string,
  others: readonly { name: string }[],
): CategoryNameProblem | undefined {
  const trimmed = name.trim();
  if (trimmed.length === 0) return 'empty';
  if (trimmed.length > MAX_CATEGORY_NAME_LENGTH) return 'tooLong';

  const normalized = trimmed.toLowerCase();
  if (others.some((other) => other.name.trim().toLowerCase() === normalized)) {
    return 'duplicate';
  }
  return undefined;
}

/** The palette colors no other category uses, in palette order. */
export function availableCategoryColors(
  others: readonly { color: string }[],
): string[] {
  const used = new Set(others.map((other) => other.color.toUpperCase()));
  return CATEGORY_COLORS.filter((color) => !used.has(color.toUpperCase()));
}
