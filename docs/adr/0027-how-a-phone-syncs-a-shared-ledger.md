# ADR-0027: How a phone syncs a shared ledger

- Date: 2026-11-20
- Status: Accepted

## Context

ADR-0016 decides how events merge and how a phone's clock is kept honest, ADR-0015 how they are encrypted, ADR-0024 what the event API takes and gives back, and ADR-0022 that one function sends every request. #135 is the first issue to join them: the phone's sync loop. They leave open:

- The exact bytes an event is encrypted with, and where a phone keeps a group's keys.
- What a phone does with what it cannot use: an answer that is no page, an event it cannot decrypt, an event in a key epoch it has no key for, and an event in a format version it does not know.
- Two rules about one event. ADR-0016 lists the size limit among the rules every phone judges, and `packages/domain` judges only an event's content and receive time. And nothing ties the device ID in an event's stamp, which is inside the ciphertext, to the device that uploaded it: a member can write events that name another member's phone (#135, comment of 2026-11-18).
- What starts a sync, and what happens after one that could not finish.
- How the stamp checks of ADR-0016 happen. A phone has one last stamp for all its shared ledgers, and syncs them one at a time. ADR-0016 has the phone lower that stamp "to the highest one left" when it replaces a stamp, without saying which stamps those are. ADR-0015 has the phone check the stamps of a request's events again when the API refused the request for its clock, and the request function of ADR-0022 sends the same bytes again by itself.
- What ADR-0025 leaves to this issue about an import: what the app says once a phone that imported a file syncs on, and whether the stamp an import keeps counts as left when a stamp is replaced.
- How to test the loop. #135 asks for two phones in Node against the API's Node entry and a real PostgreSQL, and `pnpm test:mobile` promises a run without Docker.

Also considered:

- A verdict for the size of a received event, as #135 first proposed: the answer check of ADR-0024 already takes a page whose event is over 65,536 bytes for no page at all, so no phone ever judges such an event. A second rule would need that check loosened first.
- Having the API check the stamp's device: the API cannot read a stamp. Signing each event with its author's key: ADR-0015 measured it at 1.5 s for a page of 100.
- Trying a failed sync again on a timer, with a growing wait: a timer that asks the server is polling, which the proposal rules out, and a phone suspends it with the app anyway.
- Telling the user with an alert: a sync runs in the background, and an alert would come up over whatever the user is typing.
- Resending the same bytes after a clock refusal, as the request function does today: an event written with a clock that jumped between a sync's download and its upload would be stored with a stamp that every other phone refuses, while its author keeps the change.
- Checking a shared ledger's unsent events only when that ledger syncs: another ledger's stamp, written with the same wrong clock and not checked yet, would stay the highest one left, and the new stamps would be taken after it, as far ahead as before.
- Counting the phone's stored last stamp among the stamps left: one that no record holds would never come down, so a last stamp far ahead, which an import can keep (ADR-0025), would put every later change of that phone as far ahead, and every other phone would refuse them.
- A notice after an import that the shared ledgers will catch up with their groups: #143 has yet to decide whether such a phone may import at all, and sync says nothing anywhere else until #151.
- A stand-in for the API in every test of the loop: the loop exists to work with the real one, and a stand-in would have to copy ADR-0024's rules to be worth anything.

## Decision

Encryption:

- An event is encrypted as ADR-0015 and ADR-0021 say. Its associated data is five lines of ASCII joined by line feeds, with none after the last: `shared-expense/event/v1`, the group ID, the event ID, the ID of the device that uploads it, and the key epoch in decimal. The nonce is 24 new bytes from `expo-crypto` for every encryption, also when an event is encrypted again for another try.
- A group key lives in the secure store, in an entry of its own for each group and key epoch, named after both and kept as the seed is kept (ADR-0015). Whatever makes a key or receives one writes that entry (#138, #141, #143); the loop only reads it. A phone encrypts under the highest epoch it has a key for, and uploads nothing for a group it has no key of.

One sync of one shared ledger:

- It downloads until the API says no events follow, then uploads. A ledger has one sync at a time; a change saved while one runs is followed by one more.
- A sync starts when the app starts, when it comes back from the background, and after the phone has saved an unsent event of that ledger, whatever wrote it. Nothing else starts one, and nothing repeats one: a sync that cannot go on ends, and the next start carries on from the local data.
- A page is what `packages/domain` accepts as a page (ADR-0024) and starts right after the cursor. Anything else is not applied, and the sync ends without uploading.
- Applying a page and moving the cursor are one transaction (ADR-0016), so a phone stopped in between has done neither.
- An event the phone has the key for and still cannot decrypt, or whose plaintext is not JSON, is judged as empty content: refused for its structure, recorded, and passed.
- An event in a key epoch the phone has no key for stops the applying there, with the cursor before it. So does an event in a format version the phone does not know, in its content or in its ciphertext; that one also shows the update notice. Either way the sync goes on to upload (ADR-0016).
- A phone uploads its unsent events in the order it wrote them, in requests of at most 100 events and at most 1,048,576 bytes (ADR-0024). An event leaves the unsent ones only when the API's answer to its upload names it.
- An upload refused for its key epoch is sent again in the same sync, encrypted under the epoch the API named, when the phone has that key, and otherwise waits. One refused because the group is full waits and shows a notice. Any other refusal, and no answer, ends the sync with the events kept.

Rules about one event:

- Every phone refuses an event whose stamp names another device than the one that uploaded it, by the envelope the API relays. `packages/domain` judges it with the other rules, after the structure and before the clock. A phone therefore stamps with the device ID of its device identity (ADR-0015).
- The size of a received event gets no verdict: the answer check above covers it.

Stamps:

- The checks of ADR-0016 run in the loop: when the phone applies a page, before it merges the page's events, and before it first sends an event. A checked stamp is final.
- A check covers every unsent event the phone has not checked, of all its shared ledgers, because they share the phone's one last stamp.
- The stamps left, the highest of which the last stamp is lowered to (ADR-0016), are the ones the phone's records hold, as a unit's stamp, a tombstone or the stamp a record was created with, and the stamps and bases of its unsent events, without the ones being replaced. The stored last stamp is not one of them, and neither is a stamp in a refused event. So a last stamp that nothing holds does not outlive a replacement: the one an import kept (ADR-0025), or that of an event that changed nothing.
- The request function (ADR-0022) lets its caller give the content again after a clock refusal, once the new offset is saved. The loop uses it to check the stamps of that upload's events again and to encrypt them again, so the one resend carries what the corrected clock allows.

What the user is told:

- A shared ledger's screen shows one line under its title while the ledger waits for an app update, and one while its last upload was refused because the group is full. Nothing else about sync is shown here (#151).

Where the API is:

- A build names the API it talks to in `EXPO_PUBLIC_API_URL`. A build that names none never syncs.

Older local data:

- ADR-0025 decides what an export carries of the sync state and what an import does with it. What this issue adds to the database is rows like the rest, which go back with an import: the cursor, which unsent events are checked, and what the notices need.
- A phone syncs from whatever its local data holds, after an import and after a restore of the phone's backup alike. The cursor is lower and the unsent events may be ones the API already has: the API takes the lower cursor (ADR-0024), applying an event again changes nothing, and uploading one again stores nothing.
- The app says nothing about shared ledgers after an import. The next sync brings them to what their groups hold, as on a phone that was offline since the export (ADR-0025).

Tests:

- The loop's acceptance tests run the phone's code in Node, one SQLite file and one set of modules for each phone, against the API's Node entry and a real PostgreSQL. They are a Jest project of their own, `mobile-api`, for files named `*-api.test.*` under `apps/mobile/tests`. `pnpm test:mobile` leaves it out.
- Until a phone can join a group (#141), a test's second phone starts from a copy of the first one's database made before the group was shared, and becomes a member device through the API's test support (ADR-0024). The test puts the group key in both phones' secure stores.

## Consequences

- With the app left open in front, a phone receives nothing until it comes back from the background or saves a change. #152 wakes it, and #151 adds a pull to sync.
- A sync that fails is not tried again until the next start, so a change saved offline goes up when the app is next opened or the next change is saved.
- A group at its limit costs every sync one refused upload until #155 clears events.
- #138 stamps a group's records with the device identity's ID, and writes the group's first key where the loop reads it.
- A phone that takes over another phone's unsent events (#145) gives them stamps of its own device before it uploads them, or waits until none is unsent: every phone would refuse them otherwise.
- A phone without the key of an event's epoch stops there until the key arrives, which #141 and #143 build. Refusing an event in a lower epoch than one already applied (ADR-0015) comes with rotation, in #143.
- A stamp replaced by the check moves the change to the corrected time. It still comes after what the change replaced, and no other phone has seen the old stamp (ADR-0016).
- An event that reached the API under a stamp the phone later would not choose stays as it is: a checked stamp never changes, even when the phone's clock is corrected afterwards.
- The request function's callers that do not give content again are resent as before.
- A file imported from another phone brings that phone's unsent events with it, and they stay unsent: that phone's authorization has lapsed (ADR-0025).
- A sync of one shared ledger can give new stamps to the unsent events and records of another. They are uploaded when that ledger syncs.
- After an import or a restore, the events the phone uploaded since the export are in none of its records until a download brings them back. A change made before then whose stamp is replaced can get a stamp earlier than one of those events, and loses to it where both changed the same unit. An import keeps the phone's last stamp so that this cannot happen (ADR-0025); a replacement gives that up, because the phone cannot tell a last stamp it has sent from one it never sent. It takes a stamp more than 5 minutes ahead of the corrected time: a last stamp kept from a clock that ran fast, or a clock set ahead after the import.
- The phone's tests against the API need Docker, as the API's own do. A session that only changes screens still runs `pnpm test:mobile` without it.
- The paths of the loop get branch coverage thresholds as they are added (`AGENTS.md` rule 8).
