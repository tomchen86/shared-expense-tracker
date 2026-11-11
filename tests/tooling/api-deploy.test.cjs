const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

// wrangler.jsonc has comments and trailing commas, which TypeScript's reader accepts.
const wrangler = ts.parseConfigFileTextToJson(
  'wrangler.jsonc',
  read('apps/api/wrangler.jsonc'),
).config;
const workflow = read('.github/workflows/deploy.yml');
const environments = ['staging', 'production'];

test('wrangler.jsonc has the two environments of ADR-0019', () => {
  expect(Object.keys(wrangler.env)).toEqual(environments);
});

test.each(environments)(
  '%s binds a real Hyperdrive configuration of its own',
  (environment) => {
    const others = [
      wrangler,
      ...environments
        .filter((name) => name !== environment)
        .map((name) => wrangler.env[name]),
    ].map((config) => config.hyperdrive[0].id);
    const [binding, ...rest] = wrangler.env[environment].hyperdrive;

    expect(rest).toEqual([]);
    expect(binding).toEqual({
      binding: 'HYPERDRIVE',
      // No localConnectionString: only the top level, which is never deployed, runs locally.
      id: expect.stringMatching(/^[0-9a-f]{32}$/),
    });
    expect(others).not.toContain(binding.id);
  },
);

test('the deploy workflow offers the environments wrangler.jsonc has', () => {
  expect(/options: \[(.*)\]/.exec(workflow)?.[1].split(', ')).toEqual(
    environments,
  );
});

test('a deploy runs the migrations before it uploads the Worker', () => {
  const migrate = workflow.indexOf('pnpm --filter api migrate');
  const upload = workflow.indexOf('wrangler deploy');

  expect(migrate).toBeGreaterThan(-1);
  expect(upload).toBeGreaterThan(migrate);
});

test('only a job that names its environment reads secrets', () => {
  const jobs = workflow.slice(workflow.indexOf('\njobs:'));
  const withSecrets = jobs
    .split(/\n {2}(?=\S)/)
    .filter((job) => job.includes('secrets.'));

  expect(withSecrets).toHaveLength(1);
  expect(withSecrets[0]).toMatch(
    /\n {4}environment: \$\{\{ inputs\.environment \|\| 'staging' \}\}\n/,
  );
});
