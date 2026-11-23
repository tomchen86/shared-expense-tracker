# ADR-0039: A member admits a phone in one request, and a roster record says which member it is

- Date: 2026-11-23
- Status: Accepted

## Context

ADR-0015 decides how a new phone gets a shared ledger: a member approves its join request, puts the group key in a box for it, adds it to the roster, and the new phone starts from a snapshot. ADR-0016 has the snapshot carry the roster and gives a member's user ID on each phone to the roster. ADR-0028 builds the snapshot and leaves the roster, the box and "which member the new phone is" to #141. ADR-0032 builds the applicant's side and leaves to #141 the members' routes, how the applicant learns the answer, and the purpose of the handover salt. #141 is the first issue to let a second phone into a group. The earlier decisions leave open:

- What a roster entry is among the records of a shared ledger, who writes the first one, and what a phone does with it. On main a member has a user ID only on the phone that created the group.
- What "approving is one request" carries, and what makes two members answering at once end with one answer. A request's content can also change between the moment a member reads it and the moment that member approves.
- The order of the snapshot and the events of an approval. ADR-0016 and ADR-0028 upload the snapshot before the approval, and a phone makes a snapshot only when it has no unsent event. The Groups screen cannot show a group in which no member is "you".
- The bytes of the box, what the salt is derived with, and where the new phone gets the sender's public key.
- How long the API keeps a box, and what it keeps of a rejection.
- How a phone that waits learns anything, with no push before #152.
- What a member's phone does with a request that cannot be approved as it is: the chosen member got a phone meanwhile, a new member's name is taken, the group is full. And with a request that nobody can read, which ADR-0032 says anyone holding only the code can send.
- ADR-0027 has #141 check a key before it saves it, and its key-saving function only takes a group that is already a shared ledger on the phone.

Also considered:

- The roster as a unit of the member record, holding the member's one device: no new kind of record, and "one member, one phone" for free. An old device would no longer map to a member once another device takes its place, and the amount flag (ADR-0029) and the duplicate flag (#148) find the member behind a change by the device in its stamp.
- Writing the approving phone's own roster entry when its group becomes a shared ledger: every shared ledger would carry one more record from the start, and the tests of sharing and of snapshots on main count records.
- Sending the approval's events as ordinary unsent events after the API has admitted the device: a phone stopped in between leaves a member device that no roster names, and ADR-0015 has a phone refuse to rotate or approve while such a device exists. Writing them before the approval instead: a refused approval would leave a member and a roster entry that have to be taken back.
- Adding the new member as an ordinary change before the snapshot, so that the approval carries one event: a refused approval leaves a member nobody asked for, whose name then blocks the next approval of the same request.
- Approving first and uploading the snapshot afterwards, with the snapshot made from data that already holds the new records: an approving phone that stops in between leaves a new phone with a key and nothing to read. A list of devices that need a snapshot, which any member's phone answers, would close that, and it is what #156 builds for returning phones.
- Letting the new phone write its own roster entry after it has joined: a phone that is approved and never opened again would be a member device the roster does not name.
- A marker on the API for a rejected request: the applicant can already tell, since its request is gone while the invite is still active.
- Telling the applicant why a request cannot be approved through the API: the reason says whether the applicant picked a member, which ADR-0032 pads the request to hide.
- Letting the approving member switch a request to the member with the same name: who the new phone is would then be someone else's choice.
- Encrypting the sender's public key under a key derived from the invite's secret, so that the API never sees it: a public key gives the API nothing, and swapping it only makes the box fail to open.
- Checking a request's state on a timer: a timer that asks the server is polling, which the proposal rules out.
- Leaving out the check of the sender against the snapshot's roster: within what ADR-0015 holds against, the salt already proves what the check proves. It stays because it is one comparison before anything is written, and it makes sure the roster a phone starts from names the phone that let it in.

## Decision

The roster:

- A roster entry is a record of the shared ledger, of a kind of its own. Its ID is a device ID. Its one unit says which member the device represents, with that phone's user ID and its X25519 public key. It merges like any unit. Format version 1 has no event that deletes one: removing a device is #143's to decide.
- A phone derives the user ID each member has in its local data from the roster: the entry that names the member, and the one with the latest stamp when several do. A member no entry names keeps what the phone has, which is your own user ID for the member you were given when you created the group, and none for a member that an event or a snapshot brought.
- A member that a roster entry names is a member of the group on every phone, whatever their "removed" unit says, as ADR-0016 decided. The app offers no way to remove such a member until #143.
- A phone writes its own roster entry the first time it approves a request, in that approval. A group nobody has joined has none.

Approving, on the API:

- Three requests for member devices: list the requests of the group's active invite, reject one, approve one. A list is cut at 262,144 bytes of content, as a page of events is, and goes on after a device ID.
- Approving is one request and one transaction under the group's lock. It names the request by the SHA-256 of its content, and carries the approving phone's cursor, the ID of a complete snapshot for the applicant, the key epoch, the sender's public key, the box, and events. The API stores the events as an upload, makes the device a member device with its progress at the number the snapshot covers, keeps the handover, and deletes the request.
- The API refuses an approval whose cursor is below the group's last sequence number. Every roster entry is an event, so a phone that has every event has seen every entry. Two members who approve different requests at once cannot both succeed, and the one refused syncs before it tries again.
- A request that is gone, or whose content is no longer the one named, is refused in one way. So is one whose invite is no longer active. That is all "first one wins" needs.
- A group has at most 20 member devices. An approval's snapshot has to be the complete one the group stores for that device, and to cover no less than the group is cleared to (ADR-0033).
- Rejecting deletes the request and leaves nothing. The device can ask again.
- The applicant asks with `GET /invites/<code>/request`, a signed request: approved, with the handover; waiting; or no request. An invite that is no longer active is refused as naming no invite, unless the device was approved through it.
- The API deletes a handover when its device first downloads a page of the group's events: a phone downloads only after it has taken its snapshot in, which needs the key. When one nobody fetched goes is #234's to decide.

The box:

- It is the box of ADR-0015, from the approving phone's X25519 key to the key in the request. Its salt is derived from the invite's secret with the purpose `shared-expense/invite/handover/v1`. Its context names the invite's code, the group and the newest key epoch it carries. It holds the group key of every epoch from the snapshot's to that one.
- The API passes on the sender's public key in the clear. A phone that opens the box knows the sender holds the invite's secret, because the salt cannot be computed without it, and that the box was made for this invite and this group.
- Before it takes the snapshot in, the new phone checks that the snapshot's roster names the approving device with that public key, and names itself with its own user ID, its own public key and a member the snapshot holds.

The order of things:

- The approving phone syncs, builds the approval's events without storing them, uploads a snapshot that holds its records and the records those events make, and then approves. Until the API has accepted, its local data is unchanged. It then syncs, and gets the new member and the roster entries as events it downloads.
- The new phone writes the box's keys to the secure store, takes the snapshot in, and deletes its request in the same transaction. "You" is the member its roster entry names, from the first moment the group is on the phone. It then syncs from the number the snapshot covers, and the approval's events change nothing.
- A key is saved through the `sync` capability (ADR-0027) only for epochs later than the snapshot's, after the import. The key of the snapshot's epoch is verified by the box that carried it and by the snapshot it decrypts: a phone that cannot decrypt the snapshot holds no shared ledger to judge events with that key.

What members and applicants see, with no push:

- A member's phone lists a ledger's requests after each sync whose download finished and when Members opens, while it holds an invite of that ledger that has not expired. It keeps them in memory only.
- A request the phone cannot open with the invite's secret, or whose content is not a request, is rejected by the phone at once and never shown. One in a ciphertext version the phone does not know, or under a code it holds no invite for, is left alone.
- A request cannot be approved while the chosen member has a phone or is no member, while a new member's name is a member's, or while the group has 20 members. The member can only reject it.
- The applicant's phone asks when the app opens and when the request is opened. While the request waits it also reads the card again, and when the request no longer fits the card it asks the person to choose again.
- A phone that learns of a rejection, or that its invite is gone, keeps the group's name and nothing else, until the person has seen it.

## Consequences

- The event format gains a record kind, and so does the snapshot. Nothing has been released, so format version 1 takes it (ADR-0016). A build from before this change refuses a roster entry for its structure and passes it, and does not get it back; a phone on such a build cannot join or approve anyway.
- The API learns which device approved or rejected which, and when; the approving phone's X25519 public key; the box's length; and how many events an approval carried. One event is a member who was already in the group, two a new member, and one more the approving phone's own entry. ADR-0032's padding hides that only while the request waits. It still sees no name, no member ID and no key.
- Whoever holds the invite's secret and is a member device can hand a phone any key and any snapshot, as a member can write any event (ADR-0015).
- A phone that approves has to be online and caught up, and to have no unsent event it cannot upload: a full group (ADR-0024) cannot take a new member until events are cleared.
- An approval costs a sync, a snapshot of up to 64 requests, one request, and another sync. A snapshot uploaded for an approval that is then refused stays until another replaces it or the cleanup takes it (ADR-0033).
- An approval that the API accepted and whose answer was lost shows as "already answered" when it is tried again. The next sync brings the new member.
- A member device that is approved and never fetches its handover keeps a box on the API until #234 gives it a limit, and keeps the group's events from being cleared for up to 30 days (ADR-0033).
- A phone whose snapshot the cleanup deleted, or that cannot use its snapshot, is a member device without the ledger. It keeps its request and says so. Nothing gives it another snapshot yet: #156 has the API name a member device to the others only once a download of its own was answered with "snapshot needed" (ADR-0033), and a phone downloads nothing before it holds the ledger. A person who is approved and does not open the app for 30 days is in that state. Until an issue decides it, the way out is to remove that device (#143) and invite again.
- A phone that cancels its request just after a member approved it is a member device and holds nothing. Opening the link again and sending a request finds the approval and joins.
- An applicant that never opens the app is not told anything, and a request that needs another choice waits until it does. #153 adds the notification.
- A local data that went back to before the join (ADR-0025) holds a request the API answers with "already a member" once the handover is gone. That phone needs a snapshot and a box again. ADR-0015 leaves that to a returning phone's request, which no issue builds yet: #156 gives a returning phone a snapshot, not a box.
- Two entries can name one member after a merge. Every phone picks the same one. The approval's cursor check keeps the app from writing that.
- `packages/domain` and the snapshot gain the roster's rules; the approving and the joining paths are offline sync and get branch coverage thresholds as they are added (`AGENTS.md` rule 8).
- Removing a device (#143) has to say what happens to its roster entry, and taking over a member (#144) how an entry is replaced. The acceptance criterion about a read-only copy belongs with #143, which creates that state.
- The test support that adds a member device (ADR-0024) and the stand-in for joining in the loop's tests (ADR-0027) can go once those tests join through an approval.
