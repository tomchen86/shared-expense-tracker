const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');

function postgresMajor(file) {
  const content = fs.readFileSync(path.join(root, file), 'utf8');
  return /image: postgres:(\d+)\s/.exec(content)?.[1];
}

test('compose.yaml names a major version', () => {
  expect(postgresMajor('apps/api/compose.yaml')).toMatch(/^\d+$/);
});

test.each(['.github/workflows/ci.yml', '.github/workflows/traced.yml'])(
  '%s runs the major version of compose.yaml',
  (workflow) => {
    expect(postgresMajor(workflow)).toBe(
      postgresMajor('apps/api/compose.yaml'),
    );
  },
);
