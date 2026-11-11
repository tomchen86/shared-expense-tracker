import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

// Every extension lint reads, so that a file's extension cannot step around a boundary.
const lintedFiles = '**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}';
// ADR-0007: only one entry file per runtime may use what exists on just one runtime.
const apiEntryFiles = ['apps/api/src/node.ts', 'apps/api/src/workers.ts'];
const onlyInEntryFiles =
  'Only apps/api/src/node.ts and workers.ts may use what exists on just one runtime (ADR-0007).';
// Both runtimes have these. Listed rather than excluded, so that a new global gets asked
// this question, like a new library below.
const portableGlobals = new Set([
  'AbortController',
  'AbortSignal',
  'atob',
  'Blob',
  'btoa',
  'clearInterval',
  'clearTimeout',
  'console',
  'crypto',
  'CryptoKey',
  'DOMException',
  'Event',
  'EventTarget',
  'fetch',
  'File',
  'FormData',
  'Headers',
  'performance',
  'queueMicrotask',
  'ReadableStream',
  'Request',
  'Response',
  'setInterval',
  'setTimeout',
  'structuredClone',
  'SubtleCrypto',
  'TextDecoder',
  'TextEncoder',
  'TransformStream',
  'URL',
  'URLSearchParams',
  'WritableStream',
]);
const runtimeGlobals = new Set([
  ...Object.keys(globals.node),
  ...Object.keys(globals.serviceworker),
  // On Workers, but not in the globals package.
  'Body',
  'Cloudflare',
  'FixedLengthStream',
  'HTMLRewriter',
  'IdentityTransformStream',
  'ScheduledEvent',
  'TailEvent',
  'TraceEvent',
  'WebSocketPair',
  'WebSocketRequestResponsePair',
  // Reaches all of them without naming one.
  'globalThis',
]);
// ADR-0003, ADR-0007: the API imports request and response types, never bookkeeping rules.
const domainImports = {
  regex: '^@shared-expense/domain(?!/api$)|packages/domain',
  message:
    'apps/api imports only @shared-expense/domain/api, never bookkeeping rules (ADR-0003, ADR-0007).',
};
// In a selector, a regex ends at the first bare slash.
const domainSelector = domainImports.regex.replaceAll('/', '\\/');
// ADR-0019: a deploy runs the migrations before it uploads the Worker.
const runMigrationsImport = {
  regex: '(^|/)migrate(\\.[cm]?[jt]s)?$',
  importNames: ['runMigrations'],
  message:
    'A deploy runs the migrations, through apps/api/src/node.ts; no request does (ADR-0019).',
};
const domainApiStandsAlone =
  'The API imports this directory, so it stands alone and brings no bookkeeping rules with it (ADR-0003, ADR-0007).';

export default [
  {
    ignores: [
      '**/node_modules/**',
      '.pnpm-store/**',
      '**/.expo/**',
      '**/dist/**',
      '**/coverage/**',
      'reports/**',
      '**/.wrangler/**',
      'apps/mobile/android/**',
      'apps/mobile/ios/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { globals: globals.node } },
  {
    files: ['**/*.cjs'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    files: ['apps/mobile/**/*.{ts,tsx,js,jsx}'],
    languageOptions: { globals: { ...globals.browser, __DEV__: 'readonly' } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  {
    files: [`apps/api/${lintedFiles}`],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        { patterns: [domainImports] },
      ],
      'no-restricted-syntax': [
        'error',
        ...[
          `ImportExpression[source.value=/${domainSelector}/]`,
          `TSImportType[argument.literal.value=/${domainSelector}/]`,
          `CallExpression[callee.name='require'][arguments.0.value=/${domainSelector}/]`,
        ].map((selector) => ({ selector, message: domainImports.message })),
      ],
    },
  },
  {
    files: [`apps/api/src/${lintedFiles}`],
    ignores: apiEntryFiles,
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            domainImports,
            runMigrationsImport,
            {
              // Listed rather than excluded, so that a new library gets asked this question.
              regex:
                '^(?!\\.{1,2}(/|$)|hono(/|$)|postgres$|@shared-expense/domain/api$)',
              message: `${onlyInEntryFiles} A library must run on both; if this one does, add it to this list in eslint.config.mjs.`,
            },
            {
              regex:
                '^hono/(aws-lambda|bun|cloudflare-pages|cloudflare-workers|deno|lambda-edge|netlify|service-worker|vercel)(/|$)',
              message: onlyInEntryFiles,
            },
            {
              regex: '(^|/)(node|workers)(\\.[cm]?[jt]s)?$',
              message: `Entry files import the rest of the API, not the other way round. ${onlyInEntryFiles}`,
            },
            {
              regex: '^\\.{1,2}/(.*/)?(apps|mobile|packages|tests)(/|$)',
              message:
                'Relative imports in apps/api/src stay inside it: tests, the phone app, and packages are not part of what the entry files run (ADR-0007).',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        ...[...runtimeGlobals]
          .filter((name) => !portableGlobals.has(name))
          .map((name) => ({
            name,
            message: `${onlyInEntryFiles} If both runtimes have this one, add it to the list in eslint.config.mjs.`,
          })),
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "MetaProperty[meta.name='import']",
          message: onlyInEntryFiles,
        },
        ...['ImportExpression', 'TSImportType'].map((selector) => ({
          selector,
          message: `Import statically, so lint can read it. ${onlyInEntryFiles}`,
        })),
      ],
    },
  },
  {
    files: ['apps/api/src/workers.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        { patterns: [domainImports, runMigrationsImport] },
      ],
    },
  },
  {
    files: [`packages/domain/src/api/${lintedFiles}`],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^(?!\\./)|(^|/)\\.\\.(/|$)',
              message: domainApiStandsAlone,
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        ...[
          'ImportExpression',
          'TSImportType',
          "CallExpression[callee.name='require']",
        ].map((selector) => ({ selector, message: domainApiStandsAlone })),
      ],
    },
  },
  {
    files: ['**/*.{test,spec}.{ts,tsx,js,jsx,cjs}'],
    languageOptions: { globals: globals.jest },
  },
  prettier,
];
