const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const flows = 'apps/mobile/tests/acceptance/e2e';

let root;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-android-'));
  for (const dir of ['scripts', 'bin', 'docs/specs/ledger', flows]) {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
  }
  for (const script of ['e2e-android.sh', 'trace_check.py']) {
    fs.copyFileSync(
      path.join(__dirname, '../../scripts', script),
      path.join(root, 'scripts', script),
    );
  }
  fs.writeFileSync(
    path.join(root, 'docs/specs/ledger/spec.md'),
    [
      '## Requirements',
      '### Requirement: LEDGER-1.1 (e2e) Swipes the period',
      '### Requirement: LEDGER-2.1 (e2e) The system menu on iOS',
      '### Requirement: LEDGER-3.1 (e2e android) The Material menu on Android',
    ].join('\n'),
  );
  flow('menu.yaml', '[LEDGER-2.1] [LEDGER-3.1] Opens the menu');
  flow('swipe.yaml', '[LEDGER-1.1] Swipes the period');
  // A Maestro that runs the flows it is given, or a folder's, and fails those
  // named in FAIL, or in FAIL_FIRST on the first run only.
  tool(
    'maestro',
    `#!/usr/bin/env python3
import os, pathlib, sys
args = sys.argv[1:]
with open("calls", "a") as log:
    log.write("maestro " + " ".join(args) + "\\n")
if os.environ.get("NO_DEVICE"):
    sys.exit(1)
output = pathlib.Path(args[args.index("--output") + 1])
paths = [pathlib.Path(a) for a in args if a.endswith(".yaml") or os.path.isdir(a)]
files = [f for p in paths for f in (sorted(p.glob("*.yaml")) if p.is_dir() else [p])]
failing = os.environ.get("FAIL", "").split()
if output.name == "maestro.xml":
    failing += os.environ.get("FAIL_FIRST", "").split()
cases = ""
for f in files:
    name = f.read_text().split("name: ", 1)[1].splitlines()[0]
    failure = "<failure>Element not found</failure>" if f.name in failing else ""
    cases += f'<testcase name="{name}" classname="{name}" file="{f}">{failure}</testcase>'
output.write_text(f"<testsuites><testsuite>{cases}</testsuite></testsuites>")
sys.exit(1 if any(f.name in failing for f in files) else 0)
`,
  );
  tool('adb', '#!/usr/bin/env bash\necho "adb $*" >> calls\n');
  tool(
    'uptime',
    '#!/usr/bin/env bash\necho "10:00  up 2 days,  3:04, 2 users, load averages: 12.50 9.75 6.20"\n',
  );
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

function flow(file, name) {
  fs.writeFileSync(
    path.join(root, flows, file),
    `appId: app\nname: ${name}\ntags:\n  - android\n---\n- launchApp\n`,
  );
}

function tool(name, source) {
  fs.writeFileSync(path.join(root, 'bin', name), source);
  fs.chmodSync(path.join(root, 'bin', name), 0o755);
}

function e2eAndroid(env, ...args) {
  const result = spawnSync(
    'bash',
    ['scripts/e2e-android.sh', 'emulator-5554', ...args],
    {
      cwd: root,
      env: {
        ...process.env,
        PATH: `${path.join(root, 'bin')}:${process.env.PATH}`,
        ...env,
      },
      encoding: 'utf8',
    },
  );
  const calls = fs.readFileSync(path.join(root, 'calls'), 'utf8').trim();
  return { ...result, calls: calls.split('\n') };
}

const maestro = (name, ...flowArgs) =>
  `maestro test --device emulator-5554 --format junit --output reports/e2e-android/junit/${name}.xml --test-output-dir reports/e2e-android/output/${name} ${flowArgs.join(' ')}`;
const screen = [
  'adb -s emulator-5554 shell wm size 1080x1920',
  'adb -s emulator-5554 shell wm density 480',
];
const screenBack = [
  'adb -s emulator-5554 shell wm size reset',
  'adb -s emulator-5554 shell wm density reset',
];

test('runs a flow that failed once more and counts its pass in the Android trace', () => {
  const result = e2eAndroid({ FAIL_FIRST: 'menu.yaml' });

  expect(result.calls).toEqual([
    ...screen,
    maestro('maestro', '--include-tags android', flows),
    maestro('maestro-rerun', `${flows}/menu.yaml`),
    ...screenBack,
  ]);
  const cores = '\\d+';
  expect(result.stderr).toMatch(
    new RegExp(
      [
        `Start: load averages 12.50 9.75 6.20 on ${cores} cores`,
        `Running the 1 failed flow\\(s\\) again: load averages 12.50 9.75 6.20 on ${cores} cores`,
        `End: load averages 12.50 9.75 6.20 on ${cores} cores`,
      ].join('\n'),
    ),
  );
  expect(result.stdout).toBe('');
  expect(result.status).toBe(0);
});

test('fails when a flow fails again, and the trace names its Android-only requirement', () => {
  const result = e2eAndroid({ FAIL: 'menu.yaml' });

  expect(result.calls).toEqual([
    ...screen,
    maestro('maestro', '--include-tags android', flows),
    maestro('maestro-rerun', `${flows}/menu.yaml`),
    ...screenBack,
  ]);
  expect(result.stdout).toBe('untested:\n  LEDGER-3.1\n');
  expect(result.status).toBe(1);
});

test('fails when no flow cites an Android-only requirement', () => {
  fs.rmSync(path.join(root, flows, 'menu.yaml'));

  const result = e2eAndroid({});

  expect(result.calls).toEqual([
    ...screen,
    maestro('maestro', '--include-tags android', flows),
    ...screenBack,
  ]);
  expect(result.stdout).toBe('untested:\n  LEDGER-3.1\n');
  expect(result.status).toBe(1);
});

test('runs only the flows given, once more if they fail, without the trace', () => {
  const result = e2eAndroid(
    { FAIL_FIRST: 'swipe.yaml' },
    `${flows}/swipe.yaml`,
  );

  expect(result.calls).toEqual([
    ...screen,
    maestro('maestro', `${flows}/swipe.yaml`),
    maestro('maestro-rerun', `${flows}/swipe.yaml`),
    ...screenBack,
  ]);
  expect(result.stdout).toBe('');
  expect(result.status).toBe(0);
});

test('fails without a rerun when Maestro reports no flow', () => {
  const result = e2eAndroid({ NO_DEVICE: '1' }, `${flows}/swipe.yaml`);

  expect(result.calls).toEqual([
    ...screen,
    maestro('maestro', `${flows}/swipe.yaml`),
    ...screenBack,
  ]);
  expect(result.status).toBe(1);
});
