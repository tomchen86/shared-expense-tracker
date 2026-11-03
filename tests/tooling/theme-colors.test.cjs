const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { checkThemeColors } = require('../../scripts/check-theme-colors.cjs');

let mobile;
function write(file, content) {
  const target = path.join(mobile, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

beforeEach(() => {
  mobile = fs.mkdtempSync(path.join(os.tmpdir(), 'theme-colors-'));
});
afterEach(() => fs.rmSync(mobile, { recursive: true, force: true }));

test.each([
  '#fff',
  '#abcd',
  '#f2f2f7',
  '#AABBCCDD',
  'rgb(255, 255, 255)',
  'rgba(0, 0, 0, 0.5)',
  'rgb(0 0 0 / 50%)',
  'hsl(120, 50%, 50%)',
  'hsla(120, 50%, 50%, 0.5)',
  'hwb(120 0% 0%)',
  'white',
  'black',
  'rebeccapurple',
  'lightgrey',
  ' DARKSLATEGRAY ',
])('rejects a fixed color outside UI: %s', (color) => {
  write('src/categories/screen.tsx', `const color = ${JSON.stringify(color)};`);
  expect(checkThemeColors(mobile)).toEqual([
    expect.stringContaining('src/categories/screen.tsx:1: hard-coded color'),
  ]);
});

test.each([
  "const styles = StyleSheet.create({ row: { backgroundColor: '#fff' } });",
  '<TextInput placeholderTextColor="#767680" />;',
  '<Text style={{ color: "white" }} />;',
  "const color = active ? colors.text : 'black';",
  'const color = `#fff`;',
  'const color = `rgba(0, 0, 0, ${opacity})`;',
  'const color = "\\x23fff";',
])('checks styles, JSX and color constants: %s', (code) => {
  write('src/categories/screen.tsx', code);
  expect(checkThemeColors(mobile)).toEqual([
    expect.stringContaining('use useThemeColors()'),
  ]);
});

test.each([
  'app/(tabs)/index.tsx',
  'src/categories/screen.ts',
  'src/ui-other/screen.jsx',
  'src/categories/screen.js',
  'src/categories/palette.mjs',
  'src/categories/palette.cjs',
  'src/categories/palette.mts',
  'src/categories/palette.cts',
])('checks application source %s', (file) => {
  write(file, "const color = '#fff';");
  expect(checkThemeColors(mobile)).toHaveLength(1);
});

test.each([
  'src/ui/theme.ts',
  'src/ui/nested/theme.ios.ts',
  'tests/acceptance/categories.test.tsx',
  'src/categories/screen.test.tsx',
  'app/screen.spec.jsx',
  'src/categories/__tests__/fixture.ts',
  'src/categories/tests/fixture.ts',
  'src/categories/node_modules/example/index.js',
  'packages/domain/src/categories/palette.ts',
  'app.config.ts',
])('excludes UI, tests and files outside application source: %s', (file) => {
  write(file, "const color = '#fff';");
  expect(checkThemeColors(mobile)).toEqual([]);
});

test('allows theme colors, user data, transparency and unrelated text', () => {
  write(
    'src/categories/screen.tsx',
    `import { useThemeColors } from '../ui/theme';
     const colors = useThemeColors();
     const styles = { color: colors.text, backgroundColor: category.color, borderColor: 'transparent' };
     const label = 'white chocolate';
     const route = '#settings';
     // A color like '#fff' or 'white' belongs in the theme.
     /* backgroundColor: 'rgba(0, 0, 0, 0.5)' */
    `,
  );
  expect(checkThemeColors(mobile)).toEqual([]);
});

test('reports every fixed color with its file and line', () => {
  write(
    'app/screen.tsx',
    "const styles = {\n  color: 'white',\n  backgroundColor: '#000',\n};",
  );
  expect(checkThemeColors(mobile)).toEqual([
    'app/screen.tsx:2: hard-coded color "white" belongs in src/ui/; use useThemeColors()',
    'app/screen.tsx:3: hard-coded color "#000" belongs in src/ui/; use useThemeColors()',
  ]);
});
