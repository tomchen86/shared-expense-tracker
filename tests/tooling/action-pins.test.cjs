const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const workflows = path.join(root, '.github/workflows');

// A tag can be moved to other code by whoever controls the action's repository, and the
// deploy job holds production's secrets. A commit SHA cannot; the comment names the exact
// release it is, which is what Dependabot (.github/dependabot.yml) reads and updates.
const pinned = /^[\w.-]+\/[\w.-]+(\/[\w./-]+)?@[0-9a-f]{40} # v\d+\.\d+\.\d+$/;

function references(text) {
  return text
    .split('\n')
    .filter((line) => /^\s*(- )?uses:/.test(line))
    .map((line) => line.replace(/^\s*(- )?uses:\s*/, '').trim());
}

// Local actions are code from this repository, so there is nothing to pin.
const isPinned = (reference) =>
  reference.startsWith('./') || pinned.test(reference);

const files = fs
  .readdirSync(workflows)
  .filter((name) => /\.ya?ml$/.test(name))
  .sort();

test('there are workflows that use actions', () => {
  expect(files.length).toBeGreaterThan(0);
  expect(
    files.flatMap((name) =>
      references(fs.readFileSync(path.join(workflows, name), 'utf8')),
    ).length,
  ).toBeGreaterThan(0);
});

test.each(files)(
  '%s pins every action to a commit SHA and names its release',
  (name) => {
    const unpinned = references(
      fs.readFileSync(path.join(workflows, name), 'utf8'),
    ).filter((reference) => !isPinned(reference));

    expect(unpinned).toEqual([]);
  },
);

test.each([
  'actions/checkout@v7',
  'actions/checkout@v7.0.1',
  "'actions/checkout@v7'",
  'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
  'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7',
  'actions/checkout@3d3c42e # v7.0.1',
  'actions/checkout@main # v7.0.1',
  'docker://alpine:3',
])('rejects %s', (reference) => {
  expect(isPinned(reference)).toBe(false);
});

test.each([
  'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1',
  'actions/cache/restore@55cc8345863c7cc4c66a329aec7e433d2d1c52a9 # v6.1.0',
  './.github/actions/setup',
])('accepts %s', (reference) => {
  expect(isPinned(reference)).toBe(true);
});

test('Dependabot updates the pins of the github-actions ecosystem', () => {
  const config = fs.readFileSync(
    path.join(root, '.github/dependabot.yml'),
    'utf8',
  );

  expect(config).toMatch(/^ {2}- package-ecosystem: github-actions$/m);
});
