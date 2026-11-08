const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const script = path.join(__dirname, '../../scripts/e2e_flaky.py');

let root;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-flaky-'));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

/** One run's shard reports; each flow maps to whether it failed. */
function run(name, first, again = {}) {
  const junit = path.join(root, name, 'e2e-reports-1/junit');
  fs.mkdirSync(junit, { recursive: true });
  const write = (file, flows) =>
    fs.writeFileSync(
      path.join(junit, file),
      `<testsuites><testsuite>${Object.entries(flows)
        .map(
          ([flow, bad]) =>
            `<testcase name="[X-1.1] ${flow}" file="apps/mobile/tests/acceptance/e2e/${flow}">${
              bad ? '<failure>Element not found</failure>' : ''
            }</testcase>`,
        )
        .join('')}</testsuite></testsuites>`,
    );
  write('maestro.xml', first);
  if (Object.keys(again).length) write('maestro-rerun.xml', again);
  return path.join(root, name);
}

function flaky(...runs) {
  return spawnSync('python3', ['-I', script, ...runs], { encoding: 'utf8' });
}

test('counts first-try failures and failures on the second try per flow', () => {
  const result = flaky(
    run(
      '1',
      { 'a.yaml': false, 'b.yaml': true, 'c.yaml': false },
      { 'b.yaml': false },
    ),
    run(
      '2',
      { 'a.yaml': true, 'b.yaml': true, 'c.yaml': false },
      { 'a.yaml': false, 'b.yaml': true },
    ),
  );

  expect(result.stdout).toBe(
    [
      '### First-try failures in 2 e2e runs',
      '',
      '| Flow | Runs | Failed first | Failed again |',
      '| --- | ---: | ---: | ---: |',
      '| `b.yaml` | 2 | 2 (100%) | 1 |',
      '| `a.yaml` | 2 | 1 (50%) | 0 |',
      '',
      '1 of 3 flows passed every first try.',
      '',
    ].join('\n'),
  );
  expect(result.status).toBe(0);
});

test('skips a run without reports and says when every first try passed', () => {
  fs.mkdirSync(path.join(root, 'empty'));

  const result = flaky(run('1', { 'a.yaml': false }), path.join(root, 'empty'));

  expect(result.stdout).toBe(
    '### First-try failures in 1 e2e run\n\nNo flow failed its first try.\n',
  );
});
