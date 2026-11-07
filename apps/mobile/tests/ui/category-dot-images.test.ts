import { CATEGORY_COLORS } from '@shared-expense/domain';
import { CATEGORY_DOT_IMAGES } from '../../src/ui/category-dot-images';

test('has a dot for each color of the palette, and no others', () => {
  expect(Object.keys(CATEGORY_DOT_IMAGES).sort()).toEqual(
    [...CATEGORY_COLORS].sort(),
  );
});
