# ADR-0047: A new phone takes a member's place in one request, a request says that it takes over, and the API tells the old phone

- Date: 2026-11-25
- Status: Accepted

## Context

The proposal gives a member who lost their phone one way back: the new phone is invited again and takes over the member, the old phone loses access at once, and the member's records stay with them. ADR-0015 lists a takeover among the changes that rotate the group's key in one request. Since then:

- ADR-0039 built the approval: one request that carries the approving phone's cursor, a snapshot, a box and the roster entries, and that the API refuses for a member who has a phone. It leaves to #144 how a roster entry is replaced.
- ADR-0041 built removal: one rotation request with no cursor, a roster entry that names nobody, and a read-only copy on the phone that lost access. It says #144 can use the rotation request.
- ADR-0042 lets a phone that holds a copy ask again, and has the snapshot replace the copy.

The earlier decisions hand these to #144:

- How the old device's roster entry is replaced (ADR-0039), and whether approving and removing are one request (ADR-0041). #144's criteria ask for one.
- How a phone whose authorization lapsed gets an identity again (ADR-0022), which ADR-0015 expects a member to need before a takeover: a phone restored from a backup holds the old device ID and no seed. ADR-0042 notes that such a phone cannot even ask to join.
- That a phone which was behind the cleared events can approve a takeover once it has gone on (ADR-0034).
- What a phone that takes another's place does with that device's unsent events (ADR-0027), its refused events (ADR-0043) and the expenses it recorded (ADR-0035).

ADR-0032 expected a takeover to need no new field in a request, since a request names its member by ID.

What bounds the answers: the API sees no member, only devices (ADR-0015); a phone that leaves must not choose the next key (ADR-0015); a phone makes a snapshot only when it keeps up and has nothing unsent (ADR-0028, ADR-0034); a refusal's body is fixed by `packages/domain` and judged by its exact shape (ADR-0027); and nothing has been released, so format version 1 can still take a field (ADR-0016).

Also considered:

- Two requests, the approval of ADR-0039 and then a rotation that removes the old device: between them two devices represent the member, the lost phone still reads everything written, and a phone that stops after the first leaves that state until someone removes the device by hand.
- One route with two shapes, an approval that may carry devices to remove or a rotation that may carry a request to approve: the checks of both, and the order in which they are reported, would have to merge in requirements that already hold for the plain cases. A route of its own leaves both as they are.
- A rotation box for the new device as well: its handover already carries the key of every epoch from its snapshot's to the approval's (ADR-0039), which here is the new one.
- A takeover with no cursor, as a rotation has none, so that a phone behind the cleared events could approve: that phone cannot make the snapshot. It may hold unsent events, and a snapshot from behind the cleared events is one the API refuses for an approval (ADR-0039).
- Approving first and letting the next phone that syncs make the snapshot (ADR-0034): a second order of things for one kind of approval, and a new phone that holds a key and waits for another member's sync.
- Reading a takeover from the roster alone, as ADR-0032 expected: a request sent while its member had no phone would turn into a takeover the moment another phone is approved as that member, and the member who approves would take a phone out that its applicant never asked for.
- The request naming the device it replaces: the card lists members, not devices (ADR-0026), and listing devices would tell everyone who holds the link how many phones each member has.
- Telling the old phone nothing but "no member device": a person whose place was taken by mistake reads that a member removed them, while every other phone still shows them in the group.
- A refusal with a reason of its own for a device that was replaced, or one more field in the refusal: every place a phone judges a refusal, and the three requirements that end a sync on "no member device", would change. A header leaves the body as it is, and a phone that does not know it sees the refusal it knows (ADR-0034 did the same for a page).
- Keeping what the API remembers of a replaced device for 30 days only: a phone found after that would be told less than one found before, to save one row for each device.
- Letting the member's own old phone approve its replacement: the phone that leaves would choose the key. A phone still in hand is #145's case.
- A second confirmation before a takeover is approved: the menu already names the applicant, the member and what the old phone loses.
- Leaving a phone whose authorization lapsed unable to ask, until #145: #145 moves a membership from a phone still in hand. A lost phone's backup is the case a takeover exists for (ADR-0015), and a person who restores it first could then neither ask to join nor, after joining from a clean install, import it (ADR-0042).
- Giving such a phone a new identity when it imports: an import connects to no server (ADR-0005), and a phone makes an identity only when it first needs the server (ADR-0015).

## Decision

The request to join:

- A request's content gains `takeover`, present and `true` only when the person chose a member who has a phone. Format version 1 takes it. A request without it is what it was. This replaces ADR-0032's "needs no new field".
- The join form lets a person choose a member who has a phone, and says that the member's current phone will lose access. It takes the request only when the card shows another member with a phone: only another member's phone can approve.
- A request to take over fits its card while the member is on it with a phone and another member has one too. A request that names a member without saying so fits while that member has none, as before. One that no longer fits asks the person to choose again (ADR-0039).

A phone whose authorization lapsed:

- When its user sends a request, the phone first makes a new device identity, as a phone with none does (ADR-0015): a new device ID and seed. In one transaction with the new device ID, every shared ledger it still holds that is no copy becomes a read-only copy for the reason "authorization lapsed" (ADR-0041), and the other requests it stored are deleted, with the group keys an approved one had put in the secure store: they belong to an identity that can never ask about them or finish them. If the change cannot be stored, the new seed is deleted again.
- Nothing else brings such a phone an identity. An import still leaves it without one, and it still sends nothing for the copies it holds.

Approving, on the member's phone:

- A member "has a phone" when they store a user ID or another device's roster entry names them, whatever user ID that entry carries: two phones restored from one export share a user ID and each stores none for the other's member (ADR-0039), and the card and the check of a plain request must still see that phone. A takeover can be approved while another device's roster entry names the chosen member, and the member is not the approving phone's own. A request to take over a member no other device represents cannot be approved, and neither can a plain request for a member who has a phone.
- The phone does what an approval does (ADR-0039) up to the snapshot: it syncs, and in one transaction checks the request, takes its cursor, stamps the events and reads the snapshot. It then makes a new group key and the boxes, and sends one request.
- The events are the approving phone's own roster entry where it has none, the applicant's entry, which names the chosen member, and for every other device that named that member an entry that names nobody (ADR-0041). No event touches the member: a device represents them before and after.
- The boxes are those of a rotation (ADR-0041), one for every device that stays, the approving phone included. The applicant's box is the handover of ADR-0039, under the new epoch, with the key of every epoch from the snapshot's to the new one. The snapshot is under the epoch before, since the API takes a snapshot only under the current one (ADR-0028).

Taking over, on the API:

- One request, `POST /groups/<group ID>/requests/<device ID>/takeover`, in one transaction under the group's lock. It carries what an approval carries, with the next epoch in place of the current one, and the devices to remove and the boxes of a rotation. The API stores the events under the new epoch, takes the devices off as a rotation does, moves to the new epoch, stores the boxes, admits the applicant with its progress at the snapshot's number, keeps the handover and deletes the request.
- It is refused for whatever refuses an approval (no such request, a cursor behind the group's last number, a group that needs a rotation, no snapshot) and for whatever refuses a rotation (boxes that do not name exactly the devices that stay, any epoch but the next). It has to remove at least one device, so the limit of 20 member devices does not apply.
- The API still sees no member. It learns that one request took devices out and let one in.

The old phone:

- The API remembers each device a takeover removed, by group and device ID, until that device is a member device of the group again or the group is deleted. While it does, the refusals "no member device" it gives that device's uploads and downloads for that group carry the header `x-replaced: takeover`: a sync is where a phone learns that it is out. Its other requests, its leave request among them, are refused exactly as any other device's, so the requirements that make "no member device" and "no such group" one answer hold as they are for every route but those two. `packages/domain` holds the name and the value (ADR-0007).
- A phone whose ledger becomes a read-only copy on such a refusal records, with the copy, that it was taken over. The copy's reason stays "no member device", and its banner says that another phone took the member's place. Any other value says nothing.

The new phone:

- It joins as ADR-0039 and ADR-0042 say, with no change: it opens the handover, takes the snapshot in, and replaces a copy of the group it holds. It is the chosen member because its roster entry names them, so the member ID, the name, the payments and the splits are the ones the group has.
- It takes nothing over from the old device: no device ID, no unsent event, no refused event (ADR-0027, ADR-0043). "Recorded by you" stays a matter of the device (ADR-0035).

A phone that was behind:

- A phone that has gone on (ADR-0034) keeps up, and approves a takeover like any other. A phone that still waits for a snapshot cannot: it says so, and that removing the member whose phone is gone lets it go on (ADR-0041 lets a phone that is behind remove a device). The person then asks again as a new member and is added back (ADR-0042).

## Consequences

- Whoever holds an invite link and gets one member's approval can put a member's phone out and act as that member. The approval was already the only gate (ADR-0015); it now also decides who a phone is. The person who was replaced is told on their phone, can ask again, and any member can remove the device that took the place.
- A takeover takes effect at once, also when the old phone is still in use. That phone learns it at its next sync; what it recorded meanwhile stays in its copy and is never sent (ADR-0041).
- The API keeps one row for each replaced device until that device is a member device of the group again or the group is deleted, and learns which request replaced which devices. It could already infer that from a rotation that follows an approval.
- A group in which only one member has a phone cannot be taken over once that phone is lost: nobody can approve, and nobody else holds the key. The form says so. Recovery without another member needs accounts, which the proposal leaves out.
- A phone that lost its seed and tries a stored, unsent request again sends it under the new identity. If the old identity's attempt had reached the API, the group's members see two requests they cannot tell apart. Either can be handled: approving the old one admits an identity nobody holds, after which the new request is one for a member who has a phone, or one under an invite that is due to be revoked, which no phone approves, and the applicant asks again and takes that identity over. Whichever of two requests to take over is approved first stands: the other cannot replace it. It costs a second approval, not access or data.
- A phone that lost its seed while a request of its was approved and not joined cannot finish that request, and sees it when it opens the same link. Its way on is a new invite link: sending a request through it changes the identity and drops the old request and its keys. #234, which settles what an approved device that never joins leaves on the API, covers the member device the old identity still is there.
- After a takeover every phone revokes the invites created before it (ADR-0041), since the old phone knows those links. Other requests under them are gone, and their applicants ask again.
- A phone that waits for a snapshot only the lost phone could make needs two steps, a removal and an approval, and the person who comes back asks twice. Anything the lost phone alone held is gone either way (ADR-0034).
- A phone that restored the old phone's backup gets a new device ID the first time it asks to join, and loses the requests the backup carried. Its copies stay copies until a snapshot replaces them, and their unsent changes are lost then, after the question ADR-0042 asks.
- Two phones restored from one backup share a user ID (ADR-0039). A takeover's entry carries the applicant's user ID like any approval's, and the rules of ADR-0041 already go by the device.
- A takeover's events are stamped before the request is sent, like an approval's (ADR-0039), and a request that is refused for its time is sent again with the same content (ADR-0015). #252 covers both.
- A phone built from main ignores the header and shows a replaced phone the banner of a removed one. It ignores `takeover` in a request too and reads it as a plain request for that member: it cannot approve it while it stores a user ID for the member, and would approve it as a plain request, leaving the old phone in, where the member's phone carries its own user ID. No release exists, so no such phone does.
- #145 moves a membership to a new device from a phone that is still in hand. It can give its old device the same kind of entry, and the same header with a value of its own; it decides what that phone shows, and how its new phone gets an identity while it still holds the ledgers.
- The Worker deployed before this change has no takeover route and sends no header; the table it adds is new (ADR-0019). A deploy changes neither `wrangler.jsonc`, the Workers entry file nor the database client, so rule 9's check is not due for it.
- The paths this adds on the phone, in the API and in `packages/domain` are offline sync, and get branch coverage thresholds as they are added (`AGENTS.md` rule 8).
