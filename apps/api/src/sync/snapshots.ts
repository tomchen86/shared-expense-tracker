import {
  GROUP_SNAPSHOT_LIMIT,
  type SnapshotChunkResponse,
  type SnapshotChunkStoredResponse,
  type SnapshotRefusal,
  type SnapshotResponse,
  type UploadSnapshotChunkRequest,
} from '@shared-expense/domain/api';
import type { ISql } from 'postgres';
import type { Sql } from '../database/connect';
import { lockMemberGroup, type EventApiRefusal } from './groups';

type Refusal = SnapshotRefusal | EventApiRefusal;

/** The group lock serializes chunk writes with replacements, cursor downloads and cleanup. */
export function storeChunk(
  sql: Sql,
  groupId: string,
  uploader: string,
  chunk: SnapshotChunkStoredResponse,
  upload: UploadSnapshotChunkRequest,
  now: () => number,
): Promise<SnapshotChunkStoredResponse | Refusal> {
  const { snapshotId, index } = chunk;
  const { deviceId: recipient, sequence, epoch, count, content } = upload;
  return sql.begin<SnapshotChunkStoredResponse | Refusal>(
    'isolation level read committed',
    async (tx) => {
      const group = await lockMemberGroup(tx, groupId, uploader);
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
        await tx`INSERT INTO group_snapshots
          (group_id, id, uploader, recipient, epoch, sequence, chunk_count, started_at_ms)
          VALUES (${groupId}, ${snapshotId}, ${uploader}, ${recipient}, ${epoch}, ${sequence}, ${count}, ${now()})`;
      }
      await tx`INSERT INTO snapshot_chunks (group_id, snapshot_id, chunk_index, content)
        VALUES (${groupId}, ${snapshotId}, ${index}, decode(${content}, 'hex'))`;
      return chunk;
    },
  ) as Promise<SnapshotChunkStoredResponse | Refusal>;
}

/** Each member device and, when all its chunks are stored, the snapshot for it. */
export function membersWithSnapshots(sql: ISql, groupId: string) {
  return sql`
    SELECT m.device_id, m.progress_cursor, m.snapshot_needed_at_ms,
      s.id, s.uploader, s.epoch, s.sequence, s.chunk_count
    FROM group_members m
    LEFT JOIN group_snapshots s ON s.group_id = m.group_id AND s.recipient = m.device_id
      AND s.chunk_count = (SELECT count(*) FROM snapshot_chunks c
        WHERE c.group_id = s.group_id AND c.snapshot_id = s.id)
    WHERE m.group_id = ${groupId}`;
}

/** A question for the snapshot carries the API's time. A chunk read has no side effects. */
export async function readSnapshot(
  sql: Sql,
  groupId: string,
  recipient: string,
  request: number | SnapshotChunkStoredResponse,
): Promise<SnapshotResponse | SnapshotChunkResponse | Refusal> {
  const member = sql`
    SELECT * FROM (${membersWithSnapshots(sql, groupId)}) m
    WHERE m.device_id = ${recipient}`;
  if (typeof request !== 'number') {
    const [row] = await sql<{ id: string | null; content: string | null }[]>`
      SELECT m.id, encode(c.content, 'hex') AS content FROM (${member}) m
      LEFT JOIN snapshot_chunks c ON c.group_id = ${groupId} AND c.snapshot_id = m.id
        AND c.snapshot_id = ${request.snapshotId} AND c.chunk_index = ${request.index}`;
    if (!row) return { error: 'not-a-member' };
    if (row.id !== request.snapshotId) return { error: 'no-snapshot' };
    return row.content === null
      ? { error: 'request' }
      : { content: row.content };
  }

  const [row] = await sql<
    {
      id: string | null;
      uploader: string;
      epoch: string;
      sequence: string;
      chunk_count: number;
    }[]
  >`
    WITH member AS (${member}), marked AS (
      UPDATE group_members m SET snapshot_needed_at_ms = ${request}
      FROM member WHERE m.group_id = ${groupId} AND m.device_id = member.device_id
        AND member.id IS NULL
    )
    SELECT id, uploader, epoch, sequence, chunk_count FROM member`;
  if (!row) return { error: 'not-a-member' };
  if (!row.id) return { error: 'no-snapshot' };
  return {
    snapshotId: row.id,
    deviceId: row.uploader,
    epoch: Number(row.epoch),
    sequence: Number(row.sequence),
    count: row.chunk_count,
  };
}
