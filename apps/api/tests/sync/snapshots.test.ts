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
    storeChunk(
      sql,
      groupId,
      uploader,
      attempt.chunk,
      { ...metadata, content: attempt.content },
      () => 1_000,
    );
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

test('the start-time migration dates existing snapshots and accepts inserts from the previous Worker', async () => {
  const { sql } = database;
  await runMigrations(sql, migrations.slice(0, 4));
  const groupId = randomUUID();
  const uploader = randomUUID();
  await sql`INSERT INTO devices (id, public_key) VALUES (${uploader}, decode(repeat('ab', 32), 'hex'))`;
  await createGroup(sql, groupId, uploader);

  const insertWithOldColumns = (id: string) => sql<{ inserted_at: Date }[]>`
    INSERT INTO group_snapshots (group_id, id, uploader, recipient, epoch, sequence, chunk_count)
    VALUES (${groupId}, ${id}, ${uploader}, ${randomUUID()}, 1, 0, 1)
    RETURNING statement_timestamp() AS inserted_at`;
  const existingId = randomUUID();
  const [before] = await insertWithOldColumns(existingId);
  await runMigrations(sql, migrations.slice(0, 5));

  const [existing] = await sql<{ started_at_ms: string; checked_at: Date }[]>`
    SELECT started_at_ms, statement_timestamp() AS checked_at FROM group_snapshots
    WHERE group_id = ${groupId} AND id = ${existingId}`;
  expect(Number(existing.started_at_ms)).toBeGreaterThanOrEqual(
    before.inserted_at.getTime(),
  );
  expect(Number(existing.started_at_ms)).toBeLessThanOrEqual(
    existing.checked_at.getTime(),
  );

  const nextId = randomUUID();
  const [insert] = await insertWithOldColumns(nextId);
  const [next] = await sql<{ started_at_ms: string }[]>`
    SELECT started_at_ms FROM group_snapshots WHERE group_id = ${groupId} AND id = ${nextId}`;
  expect(Number(next.started_at_ms)).toBe(insert.inserted_at.getTime());
});
