# ADR-0025: An import takes a phone's sync state back to the export, except its clock

- Date: 2026-11-20
- Status: Accepted

## Context

ADR-0020 makes the export file a copy of every table and an import a replacement of every row. It left open what an import does with sync state, for the change that adds those tables to decide. #131 to #133 added them without deciding (#190): which groups are shared ledgers and the device ID the phone uses in them, each record's units and stamps, tombstones, the latest stamp the phone has seen, the events it has not uploaded, and the events it refused (ADR-0016, ADR-0021). Two things did not fit:

- The `backup` spec refuses a file in which a group's expense is paid or shared by someone who is no member of that group. ADR-0021 accepts exactly such an expense after an event is applied. It takes no forgery: a member's first event is refused for its clock (ADR-0016) and an expense that names them applies. A phone in that state exported a file that no phone could import, its own included, and the user would learn it when replacing the phone.
- An import replaced the sync tables with the file's, with no rule for what that means to a phone that goes on syncing.

What the phone keeps outside the database decides which case matters. Seeds and group keys stay in `expo-secure-store` and are never in the file (ADR-0015, ADR-0020). So a file imported on another phone leaves that phone with a device ID it has no seed for: its authorization has lapsed and it cannot sync (`sharing` spec). A phone that imports a file it exported itself still has its seed and its keys, and goes on syncing. That is the case to decide. The event API stores an event ID once, and records the cursor a phone sends as its progress, also a lower one (ADR-0024).

The owner decided both points on 2026-11-20.

Also considered:

- Not applying an expense that names someone who is no member, or hiding it until the member arrives: a real expense would be missing on some phones and their balances would differ, against ADR-0016's rule that merging applies every event.
- Keeping the rule and telling the user at export that the file cannot be imported: the backup fails exactly when it is needed, and the user cannot repair it.
- Clearing the sync state on import and rebuilding each shared ledger from a snapshot (#139): the changes the file holds and the phone never uploaded would be lost, and the phone could not sync until snapshots for returning phones exist (#156).
- Replacing the latest stamp seen with the file's as well: a phone that follows a stamp ahead of its clock, as ADR-0016 has it do, could after an import stamp a new change earlier than one it already sent, and the new change would lose to the phone's own older one with nobody told.
- Keeping the unsent events the phone wrote after the export: they change data the import has just removed, and the confirmation says all the data on the phone is replaced.

## Decision

- The export file carries the sync state as it is, like every other table (ADR-0020).
- The rule that an expense is paid and shared by members of its group applies to groups that are not shared ledgers in the file. For a group the file records as a shared ledger, a payment or a share may name any ID. Every other rule applies to every expense. The rule for personal expenses does not change.
- An import replaces the sync state with the file's, in the transaction that replaces everything else. The phone is back at the moment of the export, as a phone that has been offline since then: the shared ledgers, the device ID used in them, the units and stamps, the tombstones, the unsent events with their IDs and order, and the refused events are the file's. Unsent events written after the export are gone, like every other change since.
- The one exception is the latest stamp the phone has seen: after an import it is the later of the file's and the phone's own from before the import. A phone's stamps therefore never go back, whatever it imports.
- What #135 adds to the database to follow a shared ledger, its cursor included, goes back with the rest, so the next sync downloads again from there. The phone's own events that it uploaded after the export come back that way and apply like anyone's. The unsent events of the file upload again under the IDs they have, and the API stores each once (ADR-0024).

## Consequences

- A phone that applied an event naming someone who is no member exports a file that imports, and the import equals the export.
- A file edited by hand can mark a group as a shared ledger and so bring in an expense that names a non-member. A forged event already does that (ADR-0021), and the screens show the ID.
- After an import on the phone that exported the file, a shared ledger returns to what the group holds now at the next sync. Only personal data, groups never shared, and changes that were never uploaded stay as the file had them. What the app says about that is for #135's spec; no phone syncs yet.
- A change made after the export and never uploaded is lost. No other phone ever had it.
- A change made after an import has a later stamp than everything the phone wrote or saw before, so it wins over the phone's own earlier changes when they come back, as the last thing the user did.
- A cursor from the file can be older than the events the API still holds once events are cleared (#155). That phone needs a snapshot, as any phone that was away too long (#156).
- A file exported before a group became a shared ledger, or before the phone joined one, leaves the phone holding that group's key and a place among its member devices while its data no longer marks the group as shared: its changes there would write no events. No phone can be in that state until a group can be shared from the app. The issues that store group keys and let phones join (#138, #141) decide how the phone finds such a group and comes back to it.
- On another phone an imported shared ledger cannot sync, because the authorization has lapsed. What that phone may still do with it is for #143, and the transfer code (#145), which moves the keys as well, decides what it adds to this.
- An import does not check that the sync rows are well formed or agree with the capability rows, as it does not check any value that stays within the rules (ADR-0020). An edited file can carry unsent events its holder never wrote, which a phone that has the seed and the keys would upload as its own.
- The import now has one row it does not copy, so the `backup` spec states the import as equal to the export except for that stamp. The code that keeps the stamp is offline sync, a level-2 area (`AGENTS.md` rule 8).
