const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '../..');
const portable = 'apps/api/src/devices/routes.ts';
const onlyInEntryFiles = 'Only apps/api/src/node.ts and workers.ts';
const onlyDomainApi = 'imports only @shared-expense/domain/api';

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
  [portable, "import worker from '../workers';", onlyInEntryFiles],
  [portable, 'process.env.DATABASE_URL;', onlyInEntryFiles],
  [portable, "Buffer.from('text');", onlyInEntryFiles],
  [portable, '__dirname;', onlyInEntryFiles],
  [portable, 'setImmediate(() => {});', onlyInEntryFiles],
  [portable, 'globalThis.process;', onlyInEntryFiles],
  [portable, 'import.meta.dirname;', onlyInEntryFiles],
  [portable, 'caches.default;', onlyInEntryFiles],
  [portable, 'new WebSocketPair();', onlyInEntryFiles],
  [portable, 'new HTMLRewriter();', onlyInEntryFiles],
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
    'packages/domain/src/api/any.ts',
    "import { sum } from '../ledger/money';",
    'stands alone',
  ],
  [
    'packages/domain/src/api/any.ts',
    "import { Hono } from 'hono';",
    'stands alone',
  ],
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
  [portable, 'const process = () => 1; process();'],
  [
    'apps/api/src/node.ts',
    "import { serve } from '@hono/node-server'; process.env.PORT;",
  ],
  ['apps/api/src/workers.ts', "import { connect } from 'cloudflare:sockets';"],
  ['apps/api/tests/any.test.ts', "import fs from 'node:fs'; process.env.CI;"],
  ['packages/domain/src/api/any.ts', "import { other } from './other';"],
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
      .filter((message) => /ADR-000|add it to this list/.test(message)),
  ).toEqual([]);
});
