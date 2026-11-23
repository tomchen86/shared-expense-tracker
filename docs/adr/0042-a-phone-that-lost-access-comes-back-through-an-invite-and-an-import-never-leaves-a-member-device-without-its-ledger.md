# ADR-0042: A phone that lost access comes back through an invite, and an import never leaves a member device without its ledger

- Date: 2026-11-24
- Status: Accepted

## Context

ADR-0041 leaves a phone that lost access with a read-only copy and stops there. ADR-0025 leaves to #143 whether a phone that is in a shared ledger may import, and whether a shared ledger that came from a file syncs or is a read-only copy; #143's criteria make every imported shared ledger a read-only copy "because this phone is no member". ADR-0039 (#141) refuses a phone that holds its own editable copy of a group, because the snapshot cannot be imported over it, and moved to #143 the criterion that a snapshot replaces a read-only copy. The owner decided on 2026-11-18 that a copy may be deleted, and on 2026-11-24 that #143 settles all of this in one spec.

Four questions follow:

- What an import may do on a phone that the API counts as a member device.
- What a shared ledger from a file is on the phone that imports it.
- How a phone that holds a copy of a group gets into the group again, and what happens to the copy.
- Who a person is who left and comes back. The card lists members only, so they can only ask to join as a new member.

Also considered:

- Refusing every import on a phone that is in a shared ledger, as the issue proposes: restoring yesterday's own backup, the common case, would mean leaving, being invited and being approved again.
- Refusing no import: the phone's data forgets a ledger the API still counts it in. Other members see a device that never syncs and have to remove it, and the phone's later request to join is answered "already a member".
- Syncing before an import so that unsent changes are not lost: an import connects to no server (ADR-0005), and a sync is nothing an import can wait for.
- Making every imported shared ledger a copy, as the criterion is worded: a phone that still holds its seed and keys, and that the API still counts as a member device, would lock itself out and need to be removed and invited again.
- Leaving an imported ledger alone until the next sync finds the seed missing (ADR-0041): until then it can be edited, and those changes can never be sent.
- Deleting the copy when the request is sent, or asking the user to delete it first: a request can be declined or never answered, and the phone would have neither the copy nor the group. The app also cannot delete a group that is no read-only copy.
- Merging the snapshot into the copy and uploading what it never sent: #143 decides those changes are not sent, and a member may have been removed to stop them.
- The card listing former members, so that the person picks who they were: it changes the card and the join form (ADR-0026, ADR-0032), shows the names of people who left to everyone who holds the link, has no bound on its size, and still needs the rule below for a person who picks "New Member" anyway.
- Refusing a request whose name matches a former member until a member adds that person back in Members: no new flow, but two more steps on each side.
- Matching by name without asking: two former members can share a name, and a newcomer can share one too.

## Decision

- An import is refused while it would leave a member device without its ledger. Every shared ledger that is no read-only copy on the phone has to be, in the file, a shared ledger that is no copy and has the same device ID. Otherwise the app names those groups and tells the user to leave them first. Leaving makes them copies, and a copy never stops an import.
- An import does not sync. Its confirmation counts the unsent events of the phone's shared ledgers that the file does not hold, and says how to send them first.
- A shared ledger from a file is what the phone's secure store makes it. Where the file's device ID has a seed on the phone, it stays a shared ledger and syncs on (ADR-0025). Where it has none, every shared ledger of the file becomes a read-only copy in the import's transaction, for the reason "authorization lapsed". This keeps the criterion's reason in place of its wording: a ledger is a copy exactly where the phone is no member device.
- A phone's key epoch follows the events it can open: when a page holds an opened event of a later epoch than the local data records, the record moves to it. Local data that went back to before a rotation would otherwise ask for boxes after an epoch whose boxes the API has discarded (ADR-0041), and could store none.
- A read-only copy is the one group the app deletes. Its screen has Delete Copy, which removes the group and everything the local data holds for it, in one transaction and with no request.
- A phone that holds a copy of a group, read-only or its own editable one, asks to join like any phone. A read-only copy is no membership: its invite links open the join form. Before the request is sent the app asks once where something can be lost: always for an editable copy, whose differences from the group it cannot count, and for a read-only copy that has unsent events, with their number.
- The copy is replaced when the snapshot is imported, in the same transaction: the group is deleted as Delete Copy deletes it, the snapshot is imported as on a phone that never had the group, and the request is deleted. Until then the copy is untouched.
- A person who comes back is the member they were, and a member says so. Approving a request to join as a new member whose name matches a former member first asks "Add <name> Back?", as Members does. Add Back approves with an event that sets that member's "removed" to no in place of a new member record, and the phone's roster record names that member. Cancel approves nothing.
- The Add Back alert says the person "was in this group before", in Members too: since ADR-0041 a former member may have left.

## Consequences

- A phone that restores its own older file keeps syncing, also across rotations whose keys it holds. A file from before the phone joined a ledger, or before it shared one, cannot be imported until the phone leaves that ledger, which closes the state ADR-0025 describes in its Consequences.
- A new phone that imports the old phone's file holds copies and no seed. It cannot send a request (ADR-0015), so it cannot ask to join either. #144 and #145 are where a new phone gets back in; this ADR does not change that.
- A user who leaves a ledger in order to import loses nothing the group has, but the unsent changes of that ledger stay in the copy and are never sent.
- The import check compares the file's sync rows with the phone's. A file edited by hand can pass it, as it can pass every other check (ADR-0020), and leave the phone a member device whose ledger is gone; another member removes it.
- Deleting a copy removes the only place its unsent changes existed. The confirmation says how many.
- A request sent from a phone with an editable copy can be approved days later. The copy and whatever was added to it since are replaced then, with no second question; the confirmation says so and points to Export.
- A copy none of whose members is on the card is not recognised when the request is sent, so nothing is asked; the snapshot still replaces it.
- The rule for a returning person goes by name. Someone who types another name becomes a second member; adding them back in Members before they ask, or merging members (#184), repairs it. A newcomer who shares a former member's name has to pick another, as in Members.
- An approval can carry a change to an existing member record. The snapshot uploaded with the approval holds it like the new member's record.
- A replaced copy comes back as a new group: at the end of the list, not archived, without its own sort order, filters and "my own change" marks.
- The paths this adds on the phone, the import check, the copy an import makes, the deletion and the replacement, are offline sync, and get branch coverage thresholds as they are added (`AGENTS.md` rule 8).
