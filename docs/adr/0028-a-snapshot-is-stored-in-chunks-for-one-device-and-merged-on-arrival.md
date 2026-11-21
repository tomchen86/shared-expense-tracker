# ADR-0028: A snapshot is stored in chunks for one device and merged on arrival

- Date: 2026-11-21
- Status: Accepted

## Context

ADR-0016 decides what a snapshot holds and that the receiving phone merges it, ADR-0015 that it travels in encrypted chunks of 256 KB, and ADR-0021 leaves three things for the snapshot to settle. #139 is the first issue to build one: a phone makes a snapshot of a shared ledger and uploads it, the API keeps it, and another phone downloads it and takes it in. When a snapshot is made (#141, #156) and when one nobody fetched expires (#155) are not this issue's. The earlier decisions leave open:

- Which requests carry a snapshot, who may fetch one, and how the API knows that the phone is done with it. #139 asks that the API delete a snapshot once the phone has downloaded it, and that a download that fails halfway can be tried again.
- How large a snapshot may be and how much a group may store. A merged expense with its stamps is about 900 bytes as JSON, so a ledger of 5,000 expenses is about 4.5 MB. On the free plans a Worker has 10 ms of CPU for a request (ADR-0007), a request's body is at most 1 MiB (`sharing` spec), and as of 2026-11 Neon stores 1 GB for a project. The limit on a group's events (ADR-0024) does not bound a snapshot: it holds the merged state, which grows for as long as the group lives.
- The plaintext, and the exact bytes a chunk is encrypted with.
- What a phone does with a snapshot it cannot use.
- The three points of ADR-0021 and of the review of #131: a record's creation stamp, and whether it was there when the group became a shared ledger, which fixes that stamp; which category is the group's Uncategorized; and a record whose ID this phone already holds in another space.
- How a phone that joins learns which member it is, and gets its keys. Both come with the roster and the box, which #141 builds.

Also considered:

- One request for the whole snapshot: over the body limit for all but small ledgers.
- The chunk as the request's raw bytes: half the size, but every other byte string on this wire is hexadecimal in JSON (ADR-0024), the answers would need a second shape, and a chunk in hexadecimal still fits the body limit.
- Deleting the snapshot when the API has served its last chunk: a phone whose import then fails, or that never got the answer, could not try again.
- A request by which the phone says it is done: one more route, and when its answer is lost the phone has to remember to say it again.
- A snapshot any member device may fetch: the API would hand a group's whole ledger to a device for which no member made it.
- One snapshot per uploader and recipient: two members answering one request to join would each leave one, and only one is ever used.
- A limit on how many snapshots a group stores, with no limit on their bytes: the size is what fills the database.
- Refusing an import when any record's ID is held by another space on the phone: one forged event in one group would keep its members' phones out of another group.
- Replacing the phone's data for the group with the snapshot's: the changes a returning phone has not uploaded would be lost, against ADR-0016.
- Resuming an upload that stopped: the phone would have to keep the snapshot, or make the same one again from data that may have changed.

## Decision

On the API:

- A snapshot belongs to one group and is for one device, the recipient, which the uploading phone names. It has an ID the uploading phone makes, the uploader's device ID, the key epoch its chunks are encrypted under, the sequence number it covers, and its number of chunks, 1 to 64. A chunk's content is 41 to 262,144 bytes, in the JSON bodies as lowercase hexadecimal, so a snapshot is at most 16 MiB and a chunk's request about 525 KB.
- A phone uploads one chunk per request, `PUT /groups/<group ID>/snapshots/<snapshot ID>/chunks/<index>`, and every request repeats what the snapshot is. Chunk 0 begins the snapshot and takes the place of whatever the group stored for that recipient, complete or not. Another chunk is stored only into a snapshot that has begun and that it matches. A chunk the snapshot already has is answered as stored and not stored again, so a retry is safe.
- A snapshot is begun only under the group's current key epoch, as an event is uploaded (ADR-0015), and only when it covers no more than the group's last sequence number. A group that rotates afterwards keeps the snapshot: the box carries its epoch's key (ADR-0015).
- The chunks a group has stored add up to at most 16,777,216 bytes (16 MiB) of content, across its snapshots. A chunk that would go past that is refused with a reason of its own. The snapshot a new one replaces does not count.
- Only the recipient fetches a snapshot, only while it is a member device of the group, and only once every chunk is stored: `GET /groups/<group ID>/snapshot` says what the group stores for the asking device, and `GET /groups/<group ID>/snapshots/<snapshot ID>/chunks/<index>` hands out one chunk. The recipient need not be a member device, or registered, when the snapshot is uploaded: a phone that asks to join is neither until it is approved (#141).
- The API deletes a device's snapshot in a group when that device downloads the group's events with a cursor that is not below the number the snapshot covers. The cursor a phone sends is what it has stored (ADR-0016), so this is the first moment the API knows the phone no longer needs the snapshot, and every later download says it again. Nothing else deletes one but a new snapshot for the same recipient (#155 adds the expiry).
- A device that is no member device is refused as for the event API, whether or not the group or the snapshot exists. A member device that asks for a snapshot that is not there for it, or uploads a later chunk of one, is told there is no snapshot.
- The bodies, the limits, the refusals and their statuses are in `packages/domain`'s API entry (ADR-0007, ADR-0024), and the routes run after the checks of ADR-0022.

The content:

- The plaintext is the snapshot as JSON, as `JSON.stringify` writes it, in UTF-8, cut into pieces of 262,103 bytes, the last one whatever is left. Each piece is encrypted on its own as ADR-0015 says, under a nonce of its own, with seven lines of ASCII joined by line feeds as associated data: `shared-expense/snapshot/v1`, the group ID, the snapshot ID, the uploader's device ID, the key epoch, the chunk's index and the number of chunks, the last three in decimal.
- Snapshot format version 1 holds: that version, the highest event format version among what it covers, the group ID, the sequence number it covers, the ID of the group's Uncategorized category, and every record of the group the phone holds: each unit's value and stamp, or the tombstone, the record's creation stamp, and whether the record was there when the group became a shared ledger. It holds nothing a phone keeps to itself (ADR-0016), and no refused event.
- The roster and the active invite (ADR-0016) are not in it yet: neither exists on main. #138 makes the invite a kind of record, which a snapshot then carries with the others; #141 adds the roster.
- A phone makes a snapshot in one read of its data, at a moment when the ledger has no unsent event (ADR-0016). The number it covers is the phone's cursor at that moment. It may hold more than the events up to that number, namely the phone's own events that the API has stored and the phone has not downloaded again; merging those a second time changes nothing.
- An upload that stops leaves nothing on the phone, and what it left on the API is never handed out. Trying again makes a new snapshot under a new ID, which takes the old one's place.

Taking one in:

- The phone keeps the chunks in memory until it has them all, so a download that stops leaves nothing behind. It then judges the whole snapshot with one function in `packages/domain`: any record that is not valid makes the snapshot unusable, as a working app never writes one. A snapshot in a format version the phone does not know, or that covers events in one, is not taken in and waits for an app update.
- The import is one SQLite transaction. Each record is merged into what the phone holds by a pure function in `packages/domain` that gives what merging the same events would give: a unit's later stamp wins, a tombstone beats every unit, and equal stamps keep the larger value. A phone that never held the group gets it as a new shared ledger; a phone that holds it keeps its unsent events and whatever of its own changes are later.
- The creation stamp of a record in a snapshot marked as there when the group became a shared ledger is the snapshot's, and stays. Otherwise the phone keeps a stamp of its own that is fixed that way, or else the earlier of the two.
- The cursor becomes the number the snapshot covers, unless the phone's is higher. The phone's key epoch for the ledger becomes the snapshot's, unless its own is higher. Its latest stamp seen is not earlier than any stamp in the snapshot.
- A record whose ID this phone holds in another space is left out, as an event for it would be (ADR-0021). Two cases cannot be left out, and make the snapshot unusable on that phone: the group's Uncategorized, without which the ledger cannot hold an expense, and a group ID the phone holds as a group that is not a shared ledger.
- A member the phone first sees in a snapshot has no user ID, as one first seen in an event (ADR-0016). Which member the phone represents comes from the roster (#141).
- The phone reads the key of the snapshot's epoch from the secure store, where the box's keys are written before the snapshot is taken in (#141).
- What the screens show while or after a snapshot is taken in is for the issues that start one (#141, #156).

## Consequences

- #141 uploads the snapshot before it approves, names it in the approval, and has the API check that it is still the group's complete snapshot for that device: another member's snapshot for the same device takes its place. It writes the box's keys to the secure store before the new phone takes the snapshot in, saves later epochs through the `sync` capability afterwards (ADR-0027), and sets which member the phone is.
- #155 expires snapshots nobody fetched, and can keep the events after the number a stored snapshot covers. Until then a snapshot for a device that never fetches it stays, and counts towards the group's 16 MiB. A group whose snapshots are full takes no new one for another recipient.
- #156 has a returning phone merge, so its unsent changes survive. Where the snapshot beats the phone's own money change, #147 flags it (ADR-0016).
- A ledger whose merged state passes 16 MiB, about 17,000 expenses, cannot be given to a new member or a returning phone. Raising the two limits needs nothing else. A more compact plaintext needs a new snapshot format version.
- A snapshot of 64 chunks is more requests than a device may send in a minute, so its upload waits once for the limit (`sharing` spec).
- A recipient that syncs with a cursor at or past a snapshot's number deletes it without having fetched it. Such a phone has stored every event the snapshot covers.
- A phone that shows less because of a forged ID (ADR-0021) makes snapshots without that record, and the phones that start from them never get it.
- Two phones that each made the group a shared ledger hold different creation stamps for the same record; a snapshot settles them on its maker's. Only the tests' stand-in for joining does this (ADR-0027).
- A member can upload a snapshot whose content is not the group's, as it can write any event (ADR-0015). The new phone checks that it decrypts under the group key, names this group and is well formed, and nothing more.
- Every chunk is hashed for its signature and encrypted or decrypted on the JavaScript thread (ADR-0015).
- The paths that make, merge and import a snapshot are offline sync, and get branch coverage thresholds as they are added (`AGENTS.md` rule 8).
