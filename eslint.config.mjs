import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

// ADR-0007: only one entry file per runtime may use what exists on just one runtime.
const apiEntryFiles = ['apps/api/src/node.ts', 'apps/api/src/workers.ts'];
const onlyInEntryFiles =
  'Only apps/api/src/node.ts and workers.ts may use what exists on just one runtime (ADR-0007).';
// ADR-0003, ADR-0007: the API imports request and response types, never bookkeeping rules.
const domainImports = {
  regex: '^@shared-expense/domain(?!/api$)|packages/domain',
  message:
    'apps/api imports only @shared-expense/domain/api, never bookkeeping rules (ADR-0003, ADR-0007).',
};

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
    files: ['apps/api/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        { patterns: [domainImports] },
      ],
    },
  },
  {
    files: ['apps/api/src/**/*.ts'],
    ignores: apiEntryFiles,
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            domainImports,
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
              regex: '(^|/)(node|workers)(\\.ts)?$',
              message: `Entry files import the rest of the API, not the other way round. ${onlyInEntryFiles}`,
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        ...[
          // Node, and the ways to reach its globals without naming them.
          'process',
          'Buffer',
          'require',
          'module',
          'exports',
          '__dirname',
          '__filename',
          'setImmediate',
          'clearImmediate',
          'global',
          'globalThis',
          // Workers.
          'caches',
          'WebSocketPair',
          'HTMLRewriter',
        ].map((name) => ({ name, message: onlyInEntryFiles })),
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
    files: ['packages/domain/src/api/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^(?!\\./)',
              message:
                'The API imports this directory, so it stands alone and brings no bookkeeping rules with it (ADR-0003, ADR-0007).',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.{test,spec}.{ts,tsx,js,jsx,cjs}'],
    languageOptions: { globals: globals.jest },
  },
  prettier,
];
