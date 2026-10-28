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

test.each([
  'app/screen.ios.tsx',
  'src/ledger/icon.android.png',
  'app/screen.native.tsx',
  'src/ledger/icon.web.png',
])('rejects platform file %s outside UI', (file) => {
  write(file, '');
  expect(checkPlatformBoundaries(mobile)).toEqual([
    expect.stringContaining('platform files belong in src/ui/'),
  ]);
});

test.each([
  'const platform = process.env.EXPO_OS;',
  "const platform = process.env['EXPO_OS'];",
  "const platform = process['env'].EXPO_OS;",
  'const platform = process?.env?.EXPO_OS;',
  'const { EXPO_OS: platform } = process.env;',
])('rejects Expo platform access outside UI: %s', (code) => {
  write('src/ledger/screen.tsx', code);
  expect(checkPlatformBoundaries(mobile)).toEqual([
    expect.stringContaining('process.env.EXPO_OS belongs in src/ui/'),
  ]);
});

test('allows other environment variables and ignores platform names in strings and comments', () => {
  write(
    'src/ledger/config.ts',
    `const endpoint = process.env.EXPO_PUBLIC_API_URL;
     const description = 'process.env.EXPO_OS';
     // process.env.EXPO_OS is restricted to UI.
    `,
  );
  expect(checkPlatformBoundaries(mobile)).toEqual([]);
});

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
  write('src/ui/card.native.tsx', 'export const value = process.env.EXPO_OS;');
  write('src/ui/card.web.tsx', 'export const value = process.env.EXPO_OS;');
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

test.each([
  "import { openDatabaseAsync } from 'expo-sqlite';",
  "export * from 'expo-sqlite';",
  "const sql = import('expo-sqlite');",
  "const sql = require('expo-sqlite');",
  "import { SQLiteDatabase } from 'expo-sqlite/build/SQLiteDatabase';",
])('rejects SQLite access outside storage: %s', (code) => {
  write('src/shell/database.ts', code);
  expect(checkPlatformBoundaries(mobile)).toEqual([
    expect.stringContaining('only src/storage/ may import expo-sqlite'),
  ]);
});

test.each([
  "import { value } from '../shell/model';",
  "export { value } from '@/shell/model';",
  "const model = import('@/shell/model');",
])('rejects storage dependency on a capability: %s', (code) => {
  write('src/shell/model.ts', 'export const value = 1;');
  write('src/storage/connection.ts', code);
  expect(checkPlatformBoundaries(mobile)).toEqual([
    expect.stringContaining('src/storage/ must not import capability code'),
  ]);
});

test.each([
  "import { openNodeDatabase } from '../storage/node';",
  "export * from '@/storage/node';",
  "const sql = import('@/storage/node');",
])('rejects the Node adapter in app code: %s', (code) => {
  write('src/storage/node.ts', 'export const openNodeDatabase = () => {};');
  write('src/shell/database.ts', code);
  expect(checkPlatformBoundaries(mobile)).toEqual([
    expect.stringContaining('only tests may import src/storage/node.ts'),
  ]);
});

test('allows the phone adapter, capability queries through storage, and test-only Node adapter', () => {
  write(
    'src/storage/expo.ts',
    "import { openDatabaseAsync } from 'expo-sqlite';",
  );
  write('src/storage/index.ts', 'export const database = {};');
  write('src/storage/node.ts', 'export const openNodeDatabase = () => {};');
  write('src/shell/model.ts', "import { database } from '@/storage';");
  write(
    'tests/storage/connection.test.ts',
    "import { openNodeDatabase } from '@/storage/node';",
  );
  write(
    'src/storage/database.test.ts',
    "import { openNodeDatabase } from './node';",
  );
  expect(checkPlatformBoundaries(mobile)).toEqual([]);
});
