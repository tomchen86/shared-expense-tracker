import {
  GROUP_SNAPSHOT_LIMIT,
  type SnapshotChunkResponse,
  type SnapshotChunkStoredResponse,
  type SnapshotRefusal,
  type SnapshotResponse,
  type UploadSnapshotChunkRequest,
} from '@shared-expense/domain/api';
import type { Sql } from '../database/connect';
import type { EventApiRefusal } from './groups';

type Refusal = SnapshotRefusal | EventApiRefusal;

/** The group lock serializes retries, replacements, the byte limit, and deletion by cursor. */
export function storeChunk(
  sql: Sql,
  groupId: string,
  uploader: string,
  chunk: SnapshotChunkStoredResponse,
  upload: UploadSnapshotChunkRequest,
): Promise<SnapshotChunkStoredResponse | Refusal> {
  const { snapshotId, index } = chunk;
  const { deviceId: recipient, sequence, epoch, count, content } = upload;
  return sql.begin<SnapshotChunkStoredResponse | Refusal>(
    'isolation level read committed',
    async (tx) => {
      const [group] = await tx<{ epoch: string; last_sequence: string }[]>`
        SELECT g.epoch, g.last_sequence FROM groups g
        JOIN group_members m ON m.group_id = g.id
        WHERE g.id = ${groupId} AND m.device_id = ${uploader}
        FOR UPDATE OF g`;
      if (!group) return { error: 'not-a-member' };

      const [existing] = await tx<{ matches: boolean; stored: boolean }[]>`
        SELECT (s.uploader, s.recipient, s.epoch, s.sequence, s.chunk_count)
          = (${uploader}::uuid, ${recipient}::uuid, ${epoch}::bigint, ${sequence}::bigint, ${count}::int) AS matches,
          EXISTS (SELECT FROM snapshot_chunks c WHERE c.group_id = s.group_id
            AND c.snapshot_id = s.id AND c.chunk_index = ${index}) AS stored
        FROM group_snapshots s WHERE s.group_id = ${groupId} AND s.id = ${snapshotId}`;
      if (existing) {
        if (!existing.matches) return { error: 'request' };
        if (existing.stored) return chunk;
      } else {
        if (index !== 0) return { error: 'no-snapshot' };
        if (sequence > Number(group.last_sequence)) return { error: 'request' };
        if (epoch !== Number(group.epoch))
          return { error: 'epoch', epoch: Number(group.epoch) };
      }

      // Exclude only the snapshot a new chunk 0 would replace. A refusal leaves it intact.
      const [usage] = await tx<{ bytes: string }[]>`
        SELECT COALESCE(SUM(c.size), 0) AS bytes FROM group_snapshots s
        JOIN snapshot_chunks c ON c.group_id = s.group_id AND c.snapshot_id = s.id
        WHERE s.group_id = ${groupId} AND (s.recipient <> ${recipient} OR s.id = ${snapshotId})`;
      if (Number(usage.bytes) + content.length / 2 > GROUP_SNAPSHOT_LIMIT)
        return { error: 'snapshots-full' };
      if (!existing) {
        await tx`DELETE FROM group_snapshots WHERE group_id = ${groupId} AND recipient = ${recipient}`;
        await tx`INSERT INTO group_snapshots (group_id, id, uploader, recipient, epoch, sequence, chunk_count)
          VALUES (${groupId}, ${snapshotId}, ${uploader}, ${recipient}, ${epoch}, ${sequence}, ${count})`;
      }
      await tx`INSERT INTO snapshot_chunks (group_id, snapshot_id, chunk_index, content)
        VALUES (${groupId}, ${snapshotId}, ${index}, decode(${content}, 'hex'))`;
      return chunk;
    },
  ) as Promise<SnapshotChunkStoredResponse | Refusal>;
}

/** Reads membership, completeness and the requested content at the same database snapshot. */
export async function readSnapshot(
  sql: Sql,
  groupId: string,
  recipient: string,
  chunk?: SnapshotChunkStoredResponse,
): Promise<SnapshotResponse | SnapshotChunkResponse | Refusal> {
  const [row] = await sql<
    {
      id: string | null;
      uploader: string;
      epoch: string;
      sequence: string;
      chunk_count: number;
      content: string | null;
    }[]
  >`
    SELECT s.id, s.uploader, s.epoch, s.sequence, s.chunk_count, encode(c.content, 'hex') AS content
    FROM group_members m
    LEFT JOIN group_snapshots s ON s.group_id = m.group_id AND s.recipient = m.device_id
      AND s.chunk_count = (SELECT count(*) FROM snapshot_chunks
        WHERE group_id = s.group_id AND snapshot_id = s.id)
    LEFT JOIN snapshot_chunks c ON c.group_id = s.group_id AND c.snapshot_id = s.id
      AND c.snapshot_id = ${chunk?.snapshotId ?? null} AND c.chunk_index = ${chunk?.index ?? null}
    WHERE m.group_id = ${groupId} AND m.device_id = ${recipient}`;
  if (!row) return { error: 'not-a-member' };
  if (!row.id || (chunk && chunk.snapshotId !== row.id))
    return { error: 'no-snapshot' };
  if (chunk)
    return row.content === null
      ? { error: 'request' }
      : { content: row.content };
  return {
    snapshotId: row.id,
    deviceId: row.uploader,
    epoch: Number(row.epoch),
    sequence: Number(row.sequence),
    count: row.chunk_count,
  };
}
