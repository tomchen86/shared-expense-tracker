# ADR-0016: Sync events and how they merge

- Date: 2026-11-07
- Status: Accepted

## Context

The cloud sharing proposal decides how phones merge a shared ledger: field by field, the later change wins, time follows the latest time a phone has seen, ties go by device ID, the amount and its payments and shares change together, and a delete beats a change. ADR-0003 makes the API a relay that reads nothing, and ADR-0015 encrypts what it relays, so the phones alone have to reach one result, whatever order events reach them in. Offline sync is a level-2 area (ADR-0001).

The proposal leaves open what an event looks like, how events are ordered, which columns sync, and what happens when phones run different app versions. The phone's tables, written for one phone, add these constraints:

- `position` is unique across the app for `categories` and `groups`, and within a group for `group_members`; `trashOrder` is unique across the app. Each phone hands out the next number by itself.
- A member's `position` also carries meaning: removing a member or adding them back moves them to the end. A category's is its creation order (CATEGORIES-7.4).
- Titles, notes, and group names have no length limit, while the proposal limits an event to 64 KB.

Also considered:

- Letting the server's order decide who wins, with no clocks: simpler, but an edit made offline three days ago would beat yesterday's.
- Lowering a too-new time when an event arrives, to a bound taken from the time the server received it: a phone's own unsent change would compare one way before its upload and another way after, by which time the phone has dropped the value it beat.
- Judging each event against the state at its place in the server's order: phones would have to keep confirmed state apart from their own unsent changes, and replay on every download.
- A CRDT library such as Automerge: it keeps its own document as the source of truth, a role ADR-0002 gives to SQLite tables.

## Decision

Envelope and order:

- For each event the API sees its ID, group, author device, key epoch (ADR-0015), size, sequence number, and the time it was received. Everything else is in the ciphertext.
- Phones create event IDs. An ID the group already has is answered with its sequence number, whatever epoch the retry used, so a retried upload is stored once (ADR-0003).
- Each group has its own sequence. An upload transaction locks the group's row, checks the key epoch, gives its events the next numbers, and records one receive time. Commit order therefore equals sequence order, so a cursor can never pass a number that commits later, as it could with one PostgreSQL sequence shared by all groups.
- A phone uploads its events in the order it wrote them and applies downloads in sequence order, so whatever an event refers to, such as its category, has arrived before it.
- A phone downloads in small pages by cursor, including its own events, which change nothing when applied. Applying a page and moving the cursor are one SQLite transaction. The cursor a phone sends is what the API records as its progress, so a page the phone has not committed never counts as received.

Time:

- Every change carries a stamp: milliseconds, a counter, and the device ID, compared in that order, device IDs byte by byte. This is a hybrid logical clock. A write takes the larger of the phone's corrected time (ADR-0015) and its last stamp, raising the counter on a tie; applying an event raises the last stamp to the event's. So a change made after seeing another always has the later stamp. The last stamp is saved in the transaction of the write.
- Before every upload attempt, a phone re-stamps its unsent events that are more than 5 minutes ahead of its corrected time, along with the local stamps and bases that name them, and lowers its last stamp to the highest one left. Nobody has seen those stamps: snapshots hold only uploaded changes, and an event whose earlier attempt got no answer may have reached the API, so it keeps its stamp.
- Every phone refuses an event stamped more than 10 minutes after its receive time. That is twice the window for signed requests (ADR-0015), so a phone that follows the rule above never trips it. The check depends only on the event and its envelope, so every phone reaches the same verdict, and no phone adopts a refused stamp: one wrong clock cannot drag the others forward or keep winning.

Merging:

- A shared record is made of units, each merged whole: the later stamp wins. Which columns sync:

  | Record | Units | Stays on each phone |
  |---|---|---|
  | Expense | title; date; note; category, with its name and color at that save; money: amount, currency, payments and shares in order; whether it is in the trash | `trashOrder` |
  | Category | name; color; archived | `position` |
  | Group | name | `position`, `archived` |
  | Member | name; removed | `position`, `userId` (from the roster, ADR-0015) |

- An ID and what a record is created with, such as an expense's group or a category's `isDefault`, never change. Roster entries and invites (ADR-0015) are set once.
- One event changes one record: its first event holds every unit, a later one only the units that changed. An action on many records, such as moving a category's expenses, writes one event each. A record appears on screen once a phone has all its units, so a change to one whose first event was refused stays out of sight.
- Each changed unit records the stamp it replaced, its base. An incoming change E overrode my money change M when E's stamp is later than M's and E's base is earlier than M's stamp: a phone's stamp for a unit only goes up, so E's author had not seen M. This depends only on the two events, so arrival order cannot change it. Only M's author sees the flag (#147). Other units merge silently.
- Permanently deleting a record leaves a tombstone, its ID and stamp, which beats every change, earlier or later. Moving to and from the trash is an ordinary unit, so a later restore beats an earlier move to the trash. Tombstones last as long as the group, on every phone and in every snapshot: no deadline exists after which a returning phone could bring a record back.
- `packages/domain` holds the merge as a pure function of the current state and an event: no clock, no randomness, no locale-dependent comparison. Applying events in any order, any number of times, gives one result.
- The `sync` capability keeps units, stamps, tombstones, unsent events, cursors, and the last stamp in its own tables. The capability tables keep their shape and hold the merged result, written in the same transaction (ADR-0005). Personal data and groups never shared carry none of this.
- A group's first Invite gives each of its records units and stamps in one transaction, in the order of their `position` columns. It writes no events: the first snapshot carries them.

Order on screen:

- Order columns are never in an event. Each phone derives them:
  - Members sort by the stamp of their `removed` unit, which creation sets first. That keeps today's meaning, and every phone shows one order.
  - Categories sort by their creation stamp within a space. A phone renumbers the space's rows using numbers the space already holds, plus the next free ones.
  - A group's `position` follows when it arrived on this phone, and `trashOrder` when its trashed state did. The trash mixes in personal expenses that only this phone has, so its order may differ between phones.
  - The `position` of a payment or share is its place in the money unit.

Rules:

- A rule about one event alone, such as its structure, money that adds up, a known currency, or the stamp bound above, is a pure function of the event and its envelope. Every phone refuses a breaking event as if it never existed and moves its cursor on. A phone runs the same check before saving a change, so a working app never writes one. That includes the size limit: a change too large for 64 KB once encrypted fails to save and says why, instead of becoming an event that can never upload.
- A rule that depends on other records cannot be judged per event, because phones hold different records at different moments. Such a rule applies only when a person acts. Merging applies every event, and the result is a pure function of the merged state:
  - A category that was deleted while in use, or that the group does not have: the expense shows its group's Uncategorized, which cannot be deleted.
  - A member with a roster entry is not removed, whatever their `removed` unit says. Whoever removed them gets a notice (#149).
  - Categories with one name or color, and members with one name: all stay. Uniqueness is checked at input only, which narrows ADR-0011 for shared groups.
  - The limit of 20 members: checked at input. Merging can go over it; the API enforces it only for devices.
  - A share held by a removed member stays (GROUPS-66.1).

Versions:

- Each event carries a format version inside its ciphertext, which also selects the rules that judge and merge it. Changing what a rule decides means a new version, and the old rule's code stays, so every phone judges an event by the rules it was written under.
- An app that meets a newer version stops applying that group's events there: its cursor stays, it asks the user to update, and it keeps recording and uploading. Its other groups are unaffected. After the update it carries on from its cursor. The server holds those events for up to 30 days; after that the phone gets a snapshot. So an old app never guesses at rules it does not know, and phones reach one result once they have all caught up.

Snapshots:

- A snapshot holds a group's merged state with every stamp, its tombstones, roster, and active invite, its format version, and the sequence number it covers. It is encrypted chunk by chunk (ADR-0015). A phone makes one only at a moment when it has no unsent events for that group, so a snapshot holds only uploaded changes.
- The receiving phone merges it with the same function, so changes it has not uploaded survive, and continues from that number. When a snapshot beats the phone's own money change, the phone flags it: a snapshot has no history to tell whether the other side had seen that change, so a returning phone may get a flag it did not strictly need rather than miss one.
- Approving a join records the new device's cursor at the snapshot's number, so the API keeps every event after it. The API refuses the approval if events after that number are already gone, and the approving phone makes a new snapshot.

## Consequences

- The merge has one implementation, tested on its own with events in shuffled orders, with no phone or server. Its paths get branch coverage thresholds as they are added (`AGENTS.md` rule 8).
- A phone stores a stamp for each unit of each shared record, and snapshots carry them, so a snapshot of a large group runs to several MB (ADR-0015 measures this).
- Merging can leave duplicate names, more than 20 members, or an expense in Uncategorized that nobody put there. We accept these rather than lose a change.
- An edit to a record someone else deleted is lost with no flag, as the proposal decided. A phone with a slow clock loses to concurrent changes, and one up to 5 minutes fast wins them.
- A new format version stops every phone on an older app until it updates, so format changes should be rare, and old rule code stays for good.
- The specs of #131 to #133 have to say what the user sees when a save fails for size.
- A server that shows phones different receive times can split their results, as it can by withholding events. ADR-0015 accepts this.
