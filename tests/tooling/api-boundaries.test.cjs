const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '../..');
const portable = 'apps/api/src/devices/routes.ts';
const onlyInEntryFiles = 'Only apps/api/src/node.ts and workers.ts';
const onlyDomainApi = 'imports only @shared-expense/domain/api';
const onlySrc = 'Relative imports in apps/api/src stay inside it';
const standsAlone = 'stands alone';
const noRequestMigrates = 'no request does';

// Each exists on just one of Node 26.13 and workerd with wrangler.jsonc's settings, as
// measured by walking globalThis on both. Those up to WorkerGlobalScope have types in the
// `lib` that portable code compiles with, so lint is all that stops them.
const oneRuntimeGlobals = [
  'BroadcastChannel',
  'self',
  'addEventListener',
  'removeEventListener',
  'dispatchEvent',
  'scheduler',
  'reportError',
  'origin',
  'caches',
  'EventSource',
  'PromiseRejectionEvent',
  'ExtendableEvent',
  'FetchEvent',
  'Cache',
  'CacheStorage',
  'ServiceWorkerGlobalScope',
  'WorkerGlobalScope',
  'Temporal',
  'localStorage',
  'sessionStorage',
  'Storage',
  'QuotaExceededError',
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
];

const rejected = [
  [portable, "import { readFile } from 'node:fs';", onlyInEntryFiles],
  [portable, "import fs from 'fs';", onlyInEntryFiles],
  [portable, "import type { Socket } from 'node:net';", onlyInEntryFiles],
  [portable, "export { readFile } from 'node:fs';", onlyInEntryFiles],
  [portable, "import fs = require('node:fs');", onlyInEntryFiles],
  [portable, "const fs = require('node:fs');", onlyInEntryFiles],
  [portable, "const fs = import('node:fs');", onlyInEntryFiles],
  [portable, "let socket: import('node:net').Socket;", onlyInEntryFiles],
  [portable, "import { connect } from 'cloudflare:sockets';", onlyInEntryFiles],
  [
    portable,
    "import { handle } from 'hono/cloudflare-workers';",
    onlyInEntryFiles,
  ],
  [portable, "import { serve } from '@hono/node-server';", onlyInEntryFiles],
  [portable, "import library from 'a-new-library';", 'add it to this list'],
  [portable, "import { startServer } from '../node';", onlyInEntryFiles],
  [portable, "import { startServer } from '../node.js';", onlyInEntryFiles],
  [portable, "import worker from '../workers';", onlyInEntryFiles],
  [portable, "import { useApi } from '../../tests/support/api';", onlySrc],
  [portable, "import * as m from '../../../mobile/src/any';", onlySrc],
  [portable, 'process.env.DATABASE_URL;', onlyInEntryFiles],
  [portable, "Buffer.from('text');", onlyInEntryFiles],
  [portable, '__dirname;', onlyInEntryFiles],
  [portable, 'setImmediate(() => {});', onlyInEntryFiles],
  [portable, 'globalThis.process;', onlyInEntryFiles],
  [portable, 'import.meta.dirname;', onlyInEntryFiles],
  [portable, 'caches.default;', onlyInEntryFiles],
  [portable, 'new WebSocketPair();', onlyInEntryFiles],
  [portable, 'new HTMLRewriter();', onlyInEntryFiles],
  ...oneRuntimeGlobals.map((name) => [portable, `${name};`, onlyInEntryFiles]),
  [portable, "new BroadcastChannel('x').close();", onlyInEntryFiles],
  [portable, "await self.caches.open('x');", onlyInEntryFiles],
  [portable, "typeof process === 'undefined';", onlyInEntryFiles],
  // Both runtimes have this one, but it has not been added to the list.
  [portable, 'navigator.userAgent;', 'add it to the list'],
  [portable, "import { sum } from '@shared-expense/domain';", onlyDomainApi],
  [
    portable,
    "import * as m from '@shared-expense/domain/ledger';",
    onlyDomainApi,
  ],
  [
    portable,
    "import * as m from '../../../../packages/domain/src/ledger/money';",
    onlyDomainApi,
  ],
  [
    'apps/api/src/node.ts',
    "import { sum } from '@shared-expense/domain';",
    onlyDomainApi,
  ],
  [
    'apps/api/src/workers.ts',
    "import { sum } from '@shared-expense/domain';",
    onlyDomainApi,
  ],
  [
    'apps/api/tests/any.test.ts',
    "import { sum } from '@shared-expense/domain';",
    onlyDomainApi,
  ],
  [
    'apps/api/src/node.ts',
    "await import('@shared-expense/domain');",
    onlyDomainApi,
  ],
  [
    'apps/api/src/workers.ts',
    "await import('@shared-expense/domain');",
    onlyDomainApi,
  ],
  [
    'apps/api/tests/any.test.ts',
    "await import('../../../packages/domain/src/ledger/money');",
    onlyDomainApi,
  ],
  [
    'apps/api/tests/any.test.ts',
    "let sum: import('@shared-expense/domain').Sum;",
    onlyDomainApi,
  ],
  [
    'apps/api/tests/any.cjs',
    "const domain = require('@shared-expense/domain');",
    onlyDomainApi,
  ],
  [
    'packages/domain/src/api/any.ts',
    "import { sum } from './../ledger/money';",
    standsAlone,
  ],
  [
    'packages/domain/src/api/any.ts',
    "import { sum } from './nested/../../ledger/money';",
    standsAlone,
  ],
  [
    'packages/domain/src/api/any.ts',
    "await import('../ledger/money');",
    standsAlone,
  ],
  [
    'packages/domain/src/api/any.ts',
    "let sum: import('../ledger/money').Sum;",
    standsAlone,
  ],
  [
    'packages/domain/src/api/any.cjs',
    "const money = require('../ledger/money');",
    standsAlone,
  ],
  [
    'packages/domain/src/api/any.ts',
    "import { Hono } from 'hono';",
    standsAlone,
  ],
  [
    portable,
    "import { runMigrations } from '../database/migrate';",
    noRequestMigrates,
  ],
  [portable, "import * as m from '../database/migrate';", noRequestMigrates],
  [
    'apps/api/src/app.ts',
    "import { runMigrations } from './database/migrate.ts';",
    noRequestMigrates,
  ],
  [
    'apps/api/src/workers.ts',
    "import { runMigrations } from './database/migrate';",
    noRequestMigrates,
  ],
  // A file's extension does not change which boundary it is inside.
  ...['js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'mts', 'cts'].flatMap(
    (extension) => [
      [
        `apps/api/src/devices/routes.${extension}`,
        "import os from 'node:os';",
        onlyInEntryFiles,
      ],
      [
        `apps/api/src/devices/routes.${extension}`,
        'process.env.CI;',
        onlyInEntryFiles,
      ],
      [
        `apps/api/setup.${extension}`,
        "import { sum } from '@shared-expense/domain';",
        onlyDomainApi,
      ],
      [
        `packages/domain/src/api/any.${extension}`,
        "import { sum } from '../ledger/money';",
        standsAlone,
      ],
    ],
  ),
];

const allowed = [
  [portable, "import { Hono } from 'hono';"],
  [portable, "import { cors } from 'hono/cors';"],
  [portable, "import postgres from 'postgres';"],
  [portable, "import { isHealthResponse } from '@shared-expense/domain/api';"],
  [portable, "import { app } from '../app';"],
  [portable, "import { health } from './health';"],
  [
    portable,
    "new Response(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('a')));",
  ],
  [portable, "void fetch(new Request('https://example.com'));"],
  [portable, "console.log(new URL('https://example.com'));"],
  [portable, 'clearTimeout(setTimeout(() => {}, 1));'],
  [portable, 'let response: Response; let init: RequestInit;'],
  [
    portable,
    'new Map([[1, new Uint8Array(1)]]); JSON.stringify(Promise.resolve()); Symbol.iterator;',
  ],
  [portable, 'const process = () => 1; process();'],
  [portable, 'const self = 1; self;'],
  [
    'apps/api/src/node.ts',
    "import { serve } from '@hono/node-server'; process.env.PORT;",
  ],
  ['apps/api/src/node.ts', "await import('node:fs');"],
  [
    'apps/api/src/node.ts',
    "import { runMigrations } from './database/migrate';",
  ],
  [portable, "import type { Migration } from '../database/migrate';"],
  [
    'apps/api/tests/any.test.ts',
    "import { runMigrations } from '../src/database/migrate';",
  ],
  ['apps/api/src/workers.ts', "import { connect } from 'cloudflare:sockets';"],
  ['apps/api/src/workers.ts', 'self; caches.default; new WebSocketPair();'],
  ['apps/api/tests/any.test.ts', "import fs from 'node:fs'; process.env.CI;"],
  [
    'apps/api/tests/any.test.ts',
    "await import('@shared-expense/domain/api'); await import('../src/app');",
  ],
  ['packages/domain/src/api/any.ts', "import { other } from './other';"],
  ['packages/domain/src/api/any.ts', "import { other } from './nested/other';"],
  [
    'packages/domain/src/ledger/any.ts',
    "import { other } from '../groups/other';",
  ],
];

// ESLint loads its config with import(), which Jest's module system does not support, so
// one child process lints every case.
function lint(cases) {
  const script = `
    import { ESLint } from 'eslint';
    const eslint = new ESLint();
    const results = [];
    for (const [filePath, code] of JSON.parse(process.argv[1])) {
      const [result] = await eslint.lintText(code, { filePath });
      results.push(result.messages.map((message) => message.message));
    }
    console.log(JSON.stringify(results));
  `;
  const result = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', script, JSON.stringify(cases)],
    { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
  );
  if (result.status !== 0) throw new Error(result.stderr);
  return JSON.parse(result.stdout);
}

const messages = new Map();
beforeAll(() => {
  const cases = [...rejected, ...allowed];
  lint(cases.map(([file, code]) => [file, code])).forEach((found, index) =>
    messages.set(`${cases[index][0]}: ${cases[index][1]}`, found),
  );
}, 120000);

test.each(rejected)('%s rejects %s', (file, code, reason) => {
  expect(messages.get(`${file}: ${code}`)).toContainEqual(
    expect.stringContaining(reason),
  );
});

test.each(allowed)('%s allows %s', (file, code) => {
  // Only the rules under test matter here: unused-variable reports are beside the point.
  expect(
    messages
      .get(`${file}: ${code}`)
      .filter((message) => /ADR-00|add it to th/.test(message)),
  ).toEqual([]);
});
