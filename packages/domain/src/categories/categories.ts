/** Why a category name cannot be used (CATEGORIES-3.1, CATEGORIES-4.1). */
export type CategoryNameProblem = 'empty' | 'tooLong' | 'duplicate';

/** The category colors, in palette order. */
export const CATEGORY_COLORS: readonly string[] = Object.freeze([]);

/** The categories the phone starts with, in order. */
export const DEFAULT_CATEGORIES: readonly {
  readonly name: string;
  readonly color: string;
}[] = Object.freeze([]);

/** Why `name` cannot be used next to the other categories, if it cannot. */
export function categoryNameProblem(
  name: string,
  others: readonly { name: string }[],
): CategoryNameProblem | undefined {
  throw new Error(
    `Not implemented: categoryNameProblem(${name.length} characters, ${others.length} others)`,
  );
}

/** The palette colors no other category uses, in palette order. */
export function availableCategoryColors(
  others: readonly { color: string }[],
): string[] {
  throw new Error(
    `Not implemented: availableCategoryColors(${others.length} others)`,
  );
}
