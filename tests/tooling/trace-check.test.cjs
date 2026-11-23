const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const script = path.join(__dirname, '../../scripts/trace_check.py');

let root;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-check-'));
  fs.mkdirSync(path.join(root, 'specs/shell'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'specs/shell/spec.md'),
    [
      '## Requirements',
      '### Requirement: SHELL-1.1 Loads',
      '### Requirement: SHELL-2.1 (manual) Feels smooth',
      '### Requirement: SHELL-3.1 (e2e) Snaps the picker',
      '### Requirement: SHELL-4.1 (e2e android) Opens the Material menu',
    ].join('\n'),
  );
  fs.mkdirSync(path.join(root, 'reports'));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

function trace(testcases, ...flags) {
  fs.writeFileSync(
    path.join(root, 'reports/junit.xml'),
    `<testsuite>${testcases}</testsuite>`,
  );
  return spawnSync(
    'python3',
    [
      '-I',
      script,
      '--specs',
      path.join(root, 'specs'),
      '--reports',
      path.join(root, 'reports'),
      ...flags,
    ],
    { encoding: 'utf8' },
  );
}

test('lists (e2e) requirements without failing when the flows did not run', () => {
  const result = trace('<testcase name="[SHELL-1.1] loads"/>');

  expect(result.stdout).toContain(
    'e2e (checked when the E2E flows run):\n  SHELL-3.1',
  );
  expect(result.status).toBe(0);
});

test('fails a run of the flows when an (e2e) requirement has no passing flow', () => {
  const result = trace(
    '<testcase name="[SHELL-3.1] snaps"><failure>App crashed</failure></testcase>',
    '--e2e',
  );

  expect(result.stdout).toBe('untested:\n  SHELL-3.1\n');
  expect(result.status).toBe(1);
});

test('passes a run of the flows when every (e2e) requirement has a passing flow, whatever the (e2e android) ones', () => {
  const result = trace(
    '<testcase name="[SHELL-3.1] snaps" status="SUCCESS"/>',
    '--e2e',
  );

  expect(result.stdout).toBe('');
  expect(result.status).toBe(0);
});

test('lists (e2e android) requirements apart from (e2e) ones when the flows did not run', () => {
  const result = trace('<testcase name="[SHELL-1.1] loads"/>');

  expect(result.stdout).toContain(
    'e2e (checked when the E2E flows run):\n  SHELL-3.1\ne2e android (checked when the E2E flows run on Android):\n  SHELL-4.1\n',
  );
  expect(result.status).toBe(0);
});

test('fails a run of the flows on Android when an (e2e android) requirement has no passing flow', () => {
  const result = trace(
    '<testcase name="[SHELL-3.1] [SHELL-4.1] opens the menu"><failure>Element not found</failure></testcase>',
    '--e2e',
    'android',
  );

  expect(result.stdout).toBe('untested:\n  SHELL-4.1\n');
  expect(result.status).toBe(1);
});

test('passes a run of the flows on Android when every (e2e android) requirement has a passing flow, whatever the (e2e) ones', () => {
  const result = trace(
    '<testcase name="[SHELL-4.1] opens the menu" status="SUCCESS"/>',
    '--e2e',
    'android',
  );

  expect(result.stdout).toBe('');
  expect(result.status).toBe(0);
});
