import { randomUUID } from 'node:crypto';
import { runMigrations } from '../../src/database/migrate';
import { migrations } from '../../src/migrations';
import { createGroup } from '../../src/sync/groups';
import { readSnapshot, storeChunk } from '../../src/sync/snapshots';
import { useTestDatabase } from '../support/database';

const database = useTestDatabase();

test('two replacements leave exactly one binary chunk, which a retry cannot overwrite', async () => {
  const { sql } = database;
  const [groupId, uploader, recipient] = [
    randomUUID(),
    randomUUID(),
    randomUUID(),
  ];
  await runMigrations(sql, migrations);
  await sql`INSERT INTO devices (id, public_key) VALUES
    (${uploader}, decode(${'ab'.repeat(32)}, 'hex')),
    (${recipient}, decode(${'cd'.repeat(32)}, 'hex'))`;
  await createGroup(sql, groupId, uploader);
  await sql`INSERT INTO group_members (group_id, device_id) VALUES (${groupId}, ${recipient})`;
  const metadata = { deviceId: recipient, sequence: 0, epoch: 1, count: 1 };
  const attempts = ['01', '02'].map((byte) => ({
    chunk: { snapshotId: randomUUID(), index: 0 },
    content: byte.repeat(41),
  }));
  const put = (attempt: (typeof attempts)[number]) =>
    storeChunk(sql, groupId, uploader, attempt.chunk, {
      ...metadata,
      content: attempt.content,
    });
  expect(await Promise.all(attempts.map(put))).toEqual(
    attempts.map(({ chunk }) => chunk),
  );
  const readChunks = () => sql<{ id: string; content: Buffer }[]>`
    SELECT snapshot_id AS id, content FROM snapshot_chunks WHERE group_id = ${groupId}`;
  const rows = await readChunks();
  expect(rows).toHaveLength(1);
  const winner = attempts.find(({ chunk }) => chunk.snapshotId === rows[0].id)!;
  expect(rows[0].content).toEqual(Buffer.from(winner.content, 'hex'));
  expect(await put({ ...winner, content: '03'.repeat(41) })).toEqual(
    winner.chunk,
  );
  expect(await readChunks()).toEqual(rows);
  expect(await readSnapshot(sql, groupId, recipient, winner.chunk)).toEqual({
    content: winner.content,
  });
});
