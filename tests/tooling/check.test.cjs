const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

let root;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'check-pipeline-'));
  fs.mkdirSync(path.join(root, 'scripts'));
  fs.mkdirSync(path.join(root, 'bin'));
  fs.mkdirSync(path.join(root, 'reports/junit'), { recursive: true });
  fs.writeFileSync(path.join(root, 'reports/junit/stale.xml'), '<testsuite/>');
  fs.copyFileSync(
    path.join(__dirname, '../../scripts/check.sh'),
    path.join(root, 'scripts/check.sh'),
  );
  fs.writeFileSync(
    path.join(root, 'bin/pnpm'),
    `#!/usr/bin/env bash
echo "$*" >> steps
if [ "$1" = "$FAIL_STEP" ]; then exit 7; fi
`,
  );
  fs.chmodSync(path.join(root, 'bin/pnpm'), 0o755);
  fs.writeFileSync(
    path.join(root, 'scripts/trace_check.py'),
    `import os
from pathlib import Path
assert not Path('reports/junit/stale.xml').exists()
with Path('steps').open('a') as log:
    log.write('trace\\n')
raise SystemExit(1 if os.environ.get('FAIL_STEP') == 'trace' else 0)
`,
  );
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

test.each(['', 'lint', 'format:check', 'typecheck', 'test', 'trace'])(
  'preserves failure status and runs trace last when %s fails',
  (failure) => {
    const result = spawnSync('bash', ['scripts/check.sh'], {
      cwd: root,
      env: {
        ...process.env,
        PATH: `${path.join(root, 'bin')}:${process.env.PATH}`,
        FAIL_STEP: failure,
      },
      encoding: 'utf8',
    });
    const steps = ['lint', 'format:check', 'typecheck', 'test --coverage'];
    const failingStep = steps.findIndex(
      (step) => step.split(' ')[0] === failure,
    );
    expect(result.stderr).toBe('');
    expect(result.status).toBe(failure === 'trace' ? 1 : failure ? 7 : 0);
    expect(
      fs.readFileSync(path.join(root, 'steps'), 'utf8').trim().split('\n'),
    ).toEqual([
      ...(failingStep < 0 ? steps : steps.slice(0, failingStep + 1)),
      'trace',
    ]);
  },
);
