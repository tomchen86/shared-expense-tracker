import type { Migration } from '../database/migrate';

/**
 * What the API keeps about a group (SYNC-61.2), and nothing else:
 *
 * - `groups`: a group under the ID it has on its phones, with its key epoch, the last
 *   sequence number it has given an event, and how many bytes the contents of the events
 *   it has stored add up to. An upload locks this row, so the uploads of one group take
 *   turns (ADR-0016).
 * - `group_members`: a member device of a group, with its progress: the cursor of its
 *   latest download and the API's time then, both empty until it has downloaded.
 * - `group_events`: an event as it was uploaded, with what the API recorded about it. A
 *   group has each event ID once and each sequence number once.
 * - `group_snapshots` and `snapshot_chunks`: the envelope for one recipient and its
 *   encrypted chunks. A recipient can be named before its device is registered.
 *
 * The limits on an event, a page and a group are not written here: they are the ones in
 * `packages/domain`, which the routes check (ADR-0007, ADR-0024).
 */
export const syncMigrations: readonly Migration[] = [
  {
    name: 'sync/0001-create-groups',
    sql: `
      CREATE TABLE groups (
        id uuid PRIMARY KEY,
        epoch bigint NOT NULL DEFAULT 1,
        last_sequence bigint NOT NULL DEFAULT 0,
        stored_bytes bigint NOT NULL DEFAULT 0
      );

      CREATE TABLE group_members (
        group_id uuid NOT NULL REFERENCES groups (id),
        device_id uuid NOT NULL REFERENCES devices (id),
        progress_cursor bigint,
        progress_at_ms bigint,
        PRIMARY KEY (group_id, device_id),
        CHECK ((progress_cursor IS NULL) = (progress_at_ms IS NULL))
      );

      CREATE TABLE group_events (
        group_id uuid NOT NULL REFERENCES groups (id),
        sequence bigint NOT NULL,
        id uuid NOT NULL,
        device_id uuid NOT NULL REFERENCES devices (id),
        epoch bigint NOT NULL,
        received_at_ms bigint NOT NULL,
        content bytea NOT NULL,
        size integer GENERATED ALWAYS AS (octet_length(content)) STORED,
        PRIMARY KEY (group_id, sequence),
        UNIQUE (group_id, id)
      );
    `,
  },
  {
    name: 'sync/0002-create-snapshots',
    sql: `
      CREATE TABLE group_snapshots (
        group_id uuid NOT NULL REFERENCES groups (id),
        id uuid NOT NULL,
        uploader uuid NOT NULL REFERENCES devices (id),
        recipient uuid NOT NULL,
        epoch bigint NOT NULL,
        sequence bigint NOT NULL,
        chunk_count integer NOT NULL,
        PRIMARY KEY (group_id, id),
        UNIQUE (group_id, recipient)
      );

      CREATE TABLE snapshot_chunks (
        group_id uuid NOT NULL,
        snapshot_id uuid NOT NULL,
        chunk_index integer NOT NULL,
        content bytea NOT NULL,
        size integer GENERATED ALWAYS AS (octet_length(content)) STORED,
        PRIMARY KEY (group_id, snapshot_id, chunk_index),
        FOREIGN KEY (group_id, snapshot_id) REFERENCES group_snapshots (group_id, id)
          ON DELETE CASCADE
      );
    `,
  },
];
