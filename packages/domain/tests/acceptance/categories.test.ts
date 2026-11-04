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
  '#A66F5B',
  '#D99E77',
  '#A66A11',
  '#6C733F',
  '#8BD916',
  '#0B733C',
  '#36D9B8',
  '#1D6273',
  '#85BFF2',
  '#8861F2',
  '#DC85F2',
  '#F218B8',
  '#8C4D6F',
  '#F2858D',
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

// The palette's colors are told apart by CIEDE2000 (Sharma, Wu and Dalal 2005) on
// sRGB codes under D65, and seen against a background by WCAG 2's contrast ratio.

const channels = (code: string) =>
  [1, 3, 5].map((start) => {
    const value = parseInt(code.slice(start, start + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });

function cieLab(code: string) {
  const [r, g, b] = channels(code);
  const xyz = [
    (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047,
    0.2126729 * r + 0.7151522 * g + 0.072175 * b,
    (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883,
  ].map((t) =>
    t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116,
  );
  return [116 * xyz[1] - 16, 500 * (xyz[0] - xyz[1]), 200 * (xyz[1] - xyz[2])];
}

const radians = (degrees: number) => (degrees * Math.PI) / 180;
const degrees = (angle: number) => {
  const value = (angle * 180) / Math.PI;
  return value < 0 ? value + 360 : value;
};

function ciede2000(one: string, other: string) {
  const [l1, a1, b1] = cieLab(one);
  const [l2, a2, b2] = cieLab(other);
  const chroma = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2;
  const g = 0.5 * (1 - Math.sqrt(chroma ** 7 / (chroma ** 7 + 25 ** 7)));
  const [ap1, ap2] = [(1 + g) * a1, (1 + g) * a2];
  const [cp1, cp2] = [Math.hypot(ap1, b1), Math.hypot(ap2, b2)];
  const hp1 = cp1 === 0 ? 0 : degrees(Math.atan2(b1, ap1));
  const hp2 = cp2 === 0 ? 0 : degrees(Math.atan2(b2, ap2));
  let dhp = hp2 - hp1;
  if (cp1 * cp2 === 0) dhp = 0;
  else if (dhp > 180) dhp -= 360;
  else if (dhp < -180) dhp += 360;
  const dLp = l2 - l1;
  const dCp = cp2 - cp1;
  const dHp = 2 * Math.sqrt(cp1 * cp2) * Math.sin(radians(dhp / 2));
  const lp = (l1 + l2) / 2;
  const cp = (cp1 + cp2) / 2;
  let hp = hp1 + hp2;
  if (cp1 * cp2 !== 0)
    hp =
      Math.abs(hp1 - hp2) <= 180
        ? hp / 2
        : hp < 360
          ? (hp + 360) / 2
          : (hp - 360) / 2;
  const t =
    1 -
    0.17 * Math.cos(radians(hp - 30)) +
    0.24 * Math.cos(radians(2 * hp)) +
    0.32 * Math.cos(radians(3 * hp + 6)) -
    0.2 * Math.cos(radians(4 * hp - 63));
  const sl = 1 + (0.015 * (lp - 50) ** 2) / Math.sqrt(20 + (lp - 50) ** 2);
  const sc = 1 + 0.045 * cp;
  const sh = 1 + 0.015 * cp * t;
  const rt =
    -2 *
    Math.sqrt(cp ** 7 / (cp ** 7 + 25 ** 7)) *
    Math.sin(radians(60 * Math.exp(-(((hp - 275) / 25) ** 2))));
  return Math.sqrt(
    (dLp / sl) ** 2 +
      (dCp / sc) ** 2 +
      (dHp / sh) ** 2 +
      rt * (dCp / sc) * (dHp / sh),
  );
}

const luminance = (code: string) => {
  const [r, g, b] = channels(code);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (one: string, other: string) => {
  const [light, dark] = [luminance(one), luminance(other)].sort(
    (x, y) => y - x,
  );
  return (light + 0.05) / (dark + 0.05);
};

test('[CATEGORIES-1.2] has the 27 palette colors in order', () => {
  expect(CATEGORY_COLORS).toEqual(PALETTE);
});

test('[CATEGORIES-1.2] keeps every two palette colors at least 15.5 apart by CIEDE2000', () => {
  const pairs = CATEGORY_COLORS.flatMap((one, index) =>
    CATEGORY_COLORS.slice(index + 1).map((other) => ({
      pair: `${one} ${other}`,
      difference: ciede2000(one, other),
    })),
  );
  expect(pairs.filter(({ difference }) => difference < 15.5)).toEqual([]);
  // The closest pair, worked out by hand, keeps the formula honest.
  expect(ciede2000('#D81B60', '#C62828')).toBeCloseTo(15.56, 2);
});

test('[CATEGORIES-1.2] keeps every palette color in contrast with light and dark backgrounds', () => {
  expect(
    CATEGORY_COLORS.filter((color) => contrast(color, '#FFFFFF') < 1.65),
  ).toEqual([]);
  expect(
    CATEGORY_COLORS.filter((color) => contrast(color, '#1C1C1E') < 2.19),
  ).toEqual([]);
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

test('[CATEGORIES-5.2] offers all 27 colors when there are no other categories', () => {
  expect(availableCategoryColors([])).toEqual(PALETTE);
});

test('[CATEGORIES-5.2] offers the last 18 colors next to the default categories', () => {
  expect(availableCategoryColors(DEFAULTS)).toEqual(PALETTE.slice(9));
});

test('[CATEGORIES-5.2] keeps palette order when a color in the middle is taken', () => {
  expect(
    availableCategoryColors([...DEFAULTS, ...usingColors(['#00ACC1'])]),
  ).toEqual(PALETTE.slice(9).filter((color) => color !== '#00ACC1'));
});

test('[CATEGORIES-5.2] compares color codes regardless of case', () => {
  expect(availableCategoryColors(usingColors(['#43a047']))).toEqual(
    PALETTE.filter((color) => color !== '#43A047'),
  );
});

test('[CATEGORIES-5.2] offers no color once all 27 are taken', () => {
  expect(availableCategoryColors(usingColors(PALETTE))).toEqual([]);
});
