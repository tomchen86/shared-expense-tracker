import { migrations } from '../src/migrations';

// A database has recorded each migration it ran by its place in the list, and refuses a
// list that has another one there. A new database runs the list in any order, so no
// other test tells when one that has merged moves: a new migration goes at the end, in
// the list and here.
test('the migrations that have merged keep their names and their order', () => {
  expect(migrations.map(({ name }) => name)).toEqual([
    'sharing/0001-create-devices',
    'sync/0001-create-groups',
    'sharing/0002-create-invites',
    'sync/0002-create-snapshots',
    'sync/0003-add-snapshot-start-time',
  ]);
});
