const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  checkPlatformBoundaries,
} = require('../../scripts/check-platform-boundaries.cjs');

let mobile;
function write(file, content) {
  const target = path.join(mobile, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

beforeEach(() => {
  mobile = fs.mkdtempSync(path.join(os.tmpdir(), 'platform-boundary-'));
  write(
    'tsconfig.json',
    JSON.stringify({ compilerOptions: { paths: { '@/*': ['./src/*'] } } }),
  );
});
afterEach(() => fs.rmSync(mobile, { recursive: true, force: true }));

test.each([
  "import { Platform } from 'react-native';",
  "import { Platform as Device } from 'react-native';",
  "import * as Native from 'react-native';",
  "import Native from 'react-native';",
  "export { Platform as Device } from 'react-native';",
  "export * from 'react-native';",
  "import Platform from 'react-native/Libraries/Utilities/Platform';",
  "const Native = require('react-native');",
  "const Native = import('react-native');",
  "import Native = require('react-native');",
])('rejects Platform access outside UI: %s', (code) => {
  write('src/ledger/screen.tsx', code);
  expect(checkPlatformBoundaries(mobile)).toEqual([
    expect.stringContaining('Platform belongs in src/ui/'),
  ]);
});

test.each(['app/screen.ios.tsx', 'src/ledger/icon.android.png'])(
  'rejects platform file %s outside UI',
  (file) => {
    write(file, '');
    expect(checkPlatformBoundaries(mobile)).toEqual([
      expect.stringContaining('platform files belong in src/ui/'),
    ]);
  },
);

test.each([
  "import { value } from '../ledger/model';",
  "import { value } from '@/ledger/model';",
  "export { value } from '@/ledger/model';",
  "const model = import('@/ledger/model');",
  "const model = require('../ledger/model');",
  "type Model = import('@/ledger/model').Model;",
])('rejects UI dependency on a capability: %s', (code) => {
  write(
    'src/ledger/model.ts',
    'export const value = 1; export type Model = number;',
  );
  write('src/ui/card.tsx', code);
  expect(checkPlatformBoundaries(mobile)).toEqual([
    expect.stringContaining('src/ui/ must not import capability code'),
  ]);
});

test('allows UI platform adapters, UI-to-UI imports, and capabilities using UI', () => {
  write(
    'src/ui/card.ios.tsx',
    "import { Platform } from 'react-native'; export const value = Platform.OS;",
  );
  write('src/ui/card.tsx', "export const value = 'card';");
  write(
    'src/ui/nested/button.tsx',
    "import { value } from '../card'; export { value };",
  );
  write(
    'src/ledger/screen.tsx',
    "import { View } from 'react-native'; import { value } from '@/ui/card';",
  );
  write(
    'node_modules/example/broken.ios.ts',
    "import { Platform } from 'react-native';",
  );
  expect(checkPlatformBoundaries(mobile)).toEqual([]);
});
