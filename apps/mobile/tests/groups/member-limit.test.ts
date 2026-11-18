import {
  addGroupMember,
  createGroup,
  listFormerMembers,
  listGroups,
  removeGroupMember,
} from '../../src/groups';
import { ensureLocalIdentity } from '../../src/shell/identity';
import { appMigrations } from '../../src/shell/migrations';
import { initializeDatabase } from '../../src/storage';
import { openNodeDatabase } from '../../src/storage/node';
import { listUnsentSyncEvents, shareGroup } from '../../src/sync';

test('a new member and a returning member cannot both take the last place in a shared group', async () => {
  const database = openNodeDatabase(':memory:');
  try {
    const identity = await initializeDatabase(
      database,
      appMigrations,
      false,
      ensureLocalIdentity,
    );
    await createGroup(database, 'Trip', { ...identity, name: 'Taylor' });
    const [{ id }] = await listGroups(database);
    for (let n = 1; n < 20; n += 1)
      await addGroupMember(database, id, `Member ${n}`);
    const [{ members }] = await listGroups(database);
    const former = members.at(-1)!;
    await removeGroupMember(database, id, former.id);
    await shareGroup(database, { groupId: id, device: 'phone-a' });

    const results = await Promise.allSettled([
      addGroupMember(database, id, 'Tina'),
      addGroupMember(database, id, former.name, former.id),
    ]);

    expect(results.map(({ status }) => status)).toEqual([
      'fulfilled',
      'rejected',
    ]);
    const [group] = await listGroups(database);
    expect(group.members).toHaveLength(20);
    expect(group.members.at(-1)?.name).toBe('Tina');
    expect(await listFormerMembers(database, id)).toEqual([former]);
    const events = await listUnsentSyncEvents(database);
    expect(events.map(({ content }) => content.id)).toEqual([
      group.members.at(-1)!.id,
    ]);
  } finally {
    await database.close();
  }
});
