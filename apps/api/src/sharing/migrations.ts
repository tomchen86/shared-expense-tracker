import type { Migration } from '../database/migrate';

/**
 * What the API keeps about a phone (SHARING-42.1), and nothing else:
 *
 * - `devices`: a registered device's ID and the Ed25519 public key that verifies its
 *   requests.
 * - `device_requests`: one row for each request that passed the checks. Its nonce tells a
 *   replay for as long as its request time could pass the clock check again, and the time
 *   the API accepted it counts towards the device's limit. A device accepts a nonce and a
 *   request time together only once, since a second one is a replay or off the clock.
 * - `device_registrations`: for each new device, when it registered and the keyed hash that
 *   stands for the IP it came from, never the IP itself, to count that IP's new devices.
 */
export const sharingMigrations: readonly Migration[] = [
  {
    name: 'sharing/0001-create-devices',
    sql: `
      CREATE TABLE devices (
        id uuid PRIMARY KEY,
        public_key bytea NOT NULL CHECK (octet_length(public_key) = 32)
      );

      CREATE TABLE device_requests (
        device_id uuid NOT NULL REFERENCES devices (id),
        nonce bytea NOT NULL CHECK (octet_length(nonce) = 16),
        request_time_ms bigint NOT NULL,
        accepted_at_ms bigint NOT NULL,
        PRIMARY KEY (device_id, nonce, request_time_ms)
      );
      CREATE INDEX device_requests_accepted
        ON device_requests (device_id, accepted_at_ms);

      CREATE TABLE device_registrations (
        device_id uuid PRIMARY KEY REFERENCES devices (id),
        ip_hash bytea NOT NULL CHECK (octet_length(ip_hash) = 32),
        registered_at_ms bigint NOT NULL
      );
      CREATE INDEX device_registrations_ip
        ON device_registrations (ip_hash, registered_at_ms);
    `,
  },
  {
    name: 'sharing/0002-create-invites',
    sql: `
      CREATE TABLE group_invites (
        code text PRIMARY KEY,
        group_id uuid NOT NULL REFERENCES groups (id),
        created_at_ms bigint NOT NULL,
        expires_at_ms bigint NOT NULL,
        revoked boolean NOT NULL DEFAULT false,
        card bytea,
        cursor bigint,
        CHECK ((card IS NULL) = (cursor IS NULL)),
        CHECK (NOT revoked OR card IS NULL)
      );

      CREATE UNIQUE INDEX group_invites_one_card
        ON group_invites (group_id) WHERE card IS NOT NULL;
    `,
  },
];
