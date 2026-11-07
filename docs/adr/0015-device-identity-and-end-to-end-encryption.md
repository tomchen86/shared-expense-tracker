# ADR-0015: Device identity and end-to-end encryption

- Date: 2026-11-07
- Status: Accepted

## Context

The cloud sharing proposal promises no sign-up and a server that cannot read a ledger: a phone proves who it is with a key of its own, and a ledger's events are encrypted on the phone with one key per group, using well-known libraries and standard methods. It leaves open which libraries and formats, how a signed request resists replay, and how keys change hands.

Its one open question was how to hide the name in a join request from the server. The owner settled it on 2026-11-07 (#125): an invite link carries a random secret after the `#`, which is never sent to a server and cannot open the ledger. The cost, which the owner accepted, is that whoever holds the link can read the group's name and its members' names before applying.

What this has to hold against:

- Anyone who reads the server's database or logs must not read a ledger or forge a change.
- A server must not be able to swap a public key in what it relays to get a ledger's key.
- A phone that lost access must not read what is written afterwards, as long as the server follows the protocol.

Not covered:

- A member acting against the group: members are equal and can already change everything.
- Someone holding an unlocked phone, whose ledger is plain text in SQLite.
- A server that actively attacks. It can withhold or reorder events, hide a rotation from other phones so that a removed phone keeps reading, or serve a download page that reads the secret from a link opened in a browser. Whoever controls the server and the domain also ships the app, so this design does not try to stop them.

JavaScript on the phone runs on Hermes, which has no Web Crypto. The API verifies on Node and on Workers, with 10 ms of CPU per request on the free plan (ADR-0007). Tests run on Node (ADR-0006), so a cipher that exists only in native code would not be the one they exercise.

Measured on Hermes with no JIT, in a Release build on React Native 0.88 with the audited noble libraries at 2.4.0:

| | iPhone 14 Pro Max | Simulator on an M5 Mac |
|---|---|---|
| Encrypt or decrypt 1 KB | PENDING | 0.4 ms |
| Decrypt and parse 100 events of about 620 bytes | PENDING | 23 ms |
| Encrypt or decrypt 64 KB, the largest event | PENDING | 19 ms |
| Encrypt or decrypt 256 KB | PENDING | 80 ms |
| Encrypt or decrypt 5 MB | PENDING | 1.5 s |
| SHA-256 of 256 KB | PENDING | 83 ms |
| Ed25519 sign | PENDING | 4.7 ms |
| Ed25519 verify | PENDING | 15 ms |
| X25519 agreement | PENDING | 12 ms |
| First Ed25519 key after the app starts | PENDING | 102 ms |
| AES-GCM in native code through `expo-crypto`, 5 MB | PENDING | 2 to 4 ms |

On Node, Web Crypto verified a noble signature in 0.07 ms and hashed 64 KB in 0.04 ms.

Also considered:

- Encrypting in native code, with `expo-crypto`'s AES-GCM or libsodium in a native module: hundreds of times faster on a snapshot, but event-sized data is already fast enough, Jest could not run it, and AES-GCM's 12-byte nonce limits how many random nonces one key can safely take.
- Signing each event with its author's key, so a member cannot write as another: a page of 100 events would take over a second more to check, to guard against members who can already change every record.
- Ratcheting group keys as Signal and MLS do: forward secrecy for events the server deletes within 30 days and the phones hold in plain text, at the cost of much more state to keep in step.
- HPKE (RFC 9180) for boxes: its authenticated mode with a pre-shared key does what a box does here, for one more dependency.

## Decision

Libraries and algorithms:

- XChaCha20-Poly1305 for encryption, Ed25519 for signatures, X25519 for key agreement, and HKDF with SHA-256 for deriving keys, where each derived key's `info` names its use. A 24-byte random nonce makes it safe for many phones to encrypt under one key with no coordination.
- `@noble/ciphers`, `@noble/curves`, and `@noble/hashes`, pinned to exact versions. The same code runs on Hermes and in Jest.
- The encryption tools live in `packages/domain`, behind their own entry point, which only the mobile app imports. They take random bytes from the caller.
- Every device ID, key, nonce, invite code, secret, and transfer code comes from `expo-crypto`'s `randomUUID`, `getRandomValues`, or `getRandomBytesAsync`, never `getRandomBytes`, which falls back to `Math.random` under a debugger, and never noble's own helper, which needs Web Crypto. `createUuid` draws on SQLite's `randomblob` and stays for IDs only.
- Ciphertext starts with a format version byte.

Device identity:

- The first time a phone needs the server, it makes a device ID and a 32-byte seed. From the seed, HKDF derives its Ed25519 signing key and its X25519 box key, so one secret is written in one step and a failed registration retries with the same identity.
- The device ID lives in SQLite. The seed lives in `expo-secure-store`, under a key that names the device ID, readable after first unlock and only on this device (`AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`), so background sync can read it and a backup restored to another phone cannot. Its config plugin stays on so Android's Auto Backup skips it. An entry left behind by an earlier install, which iOS may keep, names a device ID the new database does not have and is ignored.
- The API stores the device ID and the Ed25519 public key. Registering is a signed request checked against the public key in its own body, which proves the phone holds the private key. To limit registrations per IP, it keeps a keyed hash of the IP for as long as the limit lasts, never the IP itself.

Signed requests:

- A phone signs a fixed label, the method, the path with its query, the SHA-256 of the body, its device ID, a timestamp, and a random nonce. `packages/domain` holds the plain function that builds these bytes, and both sides use it, which adds it to what ADR-0007 lets the API import.
- The API hashes the body as received and verifies with Web Crypto's `Ed25519`, before reading the body. Node and Workers both support it, and a signature from noble verifies with it.
- The API refuses a timestamp more than 5 minutes from its own time, and a nonce it has seen from that device. It keeps nonces in PostgreSQL for as long as they could pass the time check. The same rows give the limit of 60 requests a minute.
- A refused timestamp comes back with the server's time. The phone keeps the difference as its clock offset, signs again, and retries once. It uses its corrected time, the device clock plus this offset, for later requests and for sync stamps (ADR-0016). A false time from the server can only make its own check fail.
- Responses are not signed: TLS protects them in transit, and encryption protects what matters in them.

Group keys:

- A shared group has one 256-bit key per epoch, counting up from 1. The API knows only the current epoch's number.
- A phone keeps each epoch's key it has received in `expo-secure-store`, and deletes them all when it stops being a member. Events still waiting for it may be in an older epoch, rotations are rare, and old keys protect nothing that the phone does not already hold in the clear.
- Each event and snapshot chunk is encrypted under the current epoch's key, with its label, group ID, its own ID, the author device ID, and the epoch as associated data, so the server cannot move it to another place.
- Snapshots and transfer bundles are split into chunks of 256 KB, each encrypted and uploaded on its own, and the phone yields between chunks. A chunk also binds its position and the chunk count, so the server cannot reorder or cut one. A 5 MB snapshot is 20 requests, within the limit of 60 a minute.
- Unsent events stay as plain text on the phone and are encrypted at upload. The API refuses an upload in any epoch but the current one, under the same lock that gives out sequence numbers (ADR-0016). The phone then gets the new key, encrypts again, and uploads with the same event ID. So epochs never go down along a group's sequence, and a phone refuses an event whose epoch is lower than one it has already applied.

Rotation, whenever a device loses access:

- Removing or replacing a device is one API request, in one transaction under the group's lock. It carries the membership revision the phone last saw, the new epoch, one box for each device that stays, and the events, encrypted under the new key, that say what changed. The API refuses it if the revision differs or the boxes do not match the group's devices exactly.
- Leaving and finishing a transfer are also one request each, carrying the events that say what changed, encrypted under the current key: a leaving phone must not choose the next key, and a phone finishing a transfer may not have caught up. The API takes the old device off at once and marks the group as needing rotation, and refuses uploads and approvals until a staying phone has rotated with the request above. The first phone to sync does it, and any other loses on the revision check and syncs again.
- Removing a member with no phone changes no device and rotates nothing.
- Any device losing access also revokes the group's invite, because that phone knows the link, and with it the invite's pending requests. Any member can create a new invite.
- A box waits on the server until its device has fetched it, for at most the 30 days events last. After that, a returning phone needs a new box, sent with its snapshot, from a phone on its old roster, the only ones it can verify, so its request names those phones. If none of them is still in the group, it stays a read-only copy and its member comes back through a new invite.

Boxes and the roster:

- A box carries a key to one device. Its key comes from HKDF over the X25519 agreement between the sender's secret key and the receiver's public key, with both public keys, the group, and the epoch in `info`; it is then encrypted with XChaCha20-Poly1305. This is NaCl's `crypto_box` built from the primitives above. Only those two phones can compute the key, so a receiver knows the sender by its public key.
- The roster lists each device that represents a member, with its member, user ID, and X25519 public key. It travels only in encrypted group events, and in snapshots, so the server holds none of it and cannot swap a key. A phone sends boxes only to devices on its roster, and accepts a box only from one. If the API names a device the phone cannot find on its roster once caught up, the phone refuses to rotate or approve. Each join writes a new entry, so a phone can come back after being removed.

Invites:

- The link is `https://<domain>/i/<code>#<secret>`. The 128-bit code is what the API sees. The 256-bit secret stays after the `#`.
- HKDF derives three values from the secret: the card key, the request key, and the handover salt. None of them opens the ledger.
- The card, encrypted with the card key and stored by the API, holds the group's name and each member's ID, name, and whether they have a phone. After a sync that changed any of these while an invite is active, a phone uploads a new card labelled with its cursor. The API keeps the highest, so several phones doing this is harmless.
- A join request, encrypted with the request key, holds the name, the applicant's choice of member, its user ID, and its X25519 public key. The server cannot swap that key, because it does not have the secret.
- The approving phone adds the handover salt to the box as HKDF's salt, so the new phone can tell the key came from someone holding the secret, before it has a roster. Once it has the snapshot, it also checks the sender against the roster.
- The secret reaches the other members in an encrypted group event, and new members in a snapshot, so any member can read and answer a request. A group has one active invite; a second attempt to create one is refused and told to sync. Approving is one API request carrying the revision, the box, and the events that add the device to the roster, so two members answering at once cannot both succeed.

Transfer codes:

- A code has at least 128 random bits, about 26 characters. HKDF derives from it a token and a bundle key. The API stores only the token's SHA-256, so reading its database lets nobody fetch the bundle or finish the transfer, and it never sees the bundle key.
- A slow key derivation exists to stretch a guessable password. A 128-bit random code has nothing to stretch, and a slow one would only make phones wait.
- The bundle is the export file (#122) plus the group keys, never the seed. The new phone makes its own identity. Finishing the transfer is one request, signed by the new device and presenting the token. It moves the old device's memberships to the new one, ends the old device's access, deletes the bundle, and carries, for each shared group, the events that replace the old device's roster entry, so the other phones can rotate to the new device.
- If a group has rotated since the bundle was made, those events are in an old epoch and the API refuses the whole request. The old phone keeps its access, and the user makes a new code on it.

## Consequences

- The API and its database hold nothing that opens a ledger. They see which devices belong to which group, when they sync, and how much data moves.
- A member can write an event that names another device; the API's check that the uploader is the device named stops this unless the server helps. So a name on a change, as in 「Bob 改成 350」, is trusted as far as the members trust each other.
- Whoever holds a leaked link can read the group's name and its members' names and apply under any name. The person approving sees only a name, so approval is the only gate, and approving a stranger hands them the ledger.
- Encryption runs on the JavaScript thread, so a chunk holds it for up to the measured time. Android hardware has not been measured; #126 measures it on a real Android phone. If a slow phone needs it, the version byte lets snapshots move to a native cipher without changing anything else.
- JavaScript cannot promise constant time, as noble's README says. A timing attack needs code running on the same phone, which could read SQLite instead.
- A phone that loses the seed, through a restore onto another phone or a reinstall on Android, loses its access and keeps its data. The member comes back through takeover.
- Each request writes a nonce row to PostgreSQL, which counts against Hyperdrive's free query limit. The rows are cleared with the other expired data (#155).
- The audits cover earlier versions: `@noble/ciphers` and `@noble/hashes` at 1.0.0, and `@noble/curves` at 2.3.0. An upgrade is a change someone reads, which is why the versions are pinned.
- `packages/domain` adds `@noble/ciphers`, `@noble/curves`, and `@noble/hashes`, and `apps/mobile` adds `expo-crypto` and `expo-secure-store`, with its config plugin.
