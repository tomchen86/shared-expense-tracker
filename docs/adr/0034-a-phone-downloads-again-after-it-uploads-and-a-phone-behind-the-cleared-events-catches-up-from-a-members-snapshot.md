# ADR-0034: A phone downloads again after it uploads, and a phone behind the cleared events catches up from a snapshot a member's phone makes when it syncs

- Date: 2026-11-23
- Status: Accepted

## Context

ADR-0033 has the API clear a group's events and answer a phone whose cursor is behind them that it needs a snapshot. It leaves to #156 what the phone then does, and names what the way out has to cover: a ledger with one member device whose data went back, a phone that needs a snapshot though it is the most complete, and a group whose phones all need one at once. It leaves to #141 and #156 how a new member asks again once the cleanup has taken the snapshot made for it. ADR-0028 builds the snapshot's upload and import, and nothing starts either. ADR-0016 has a returning phone merge the snapshot and flag an amount of its own that the snapshot replaced, and ADR-0029 leaves that flag to the first issue that hands a snapshot to a phone with changes of its own. ADR-0027 fixes a sync as a download followed by an upload, and the shape of a page for format version 1.

ADR-0033 also found that a phone's cursor does not cover the events it uploaded itself until a later sync downloads them. A phone that uploads and is then not opened for 30 days is told it needs a snapshot though it lacks nothing. The owner kept the cleanup's rules and opened #235 for the phone.

The earlier decisions leave open:

- How a phone that needs a snapshot asks for one, how the other phones learn of it, and what the API keeps for that.
- Which phone makes the snapshot, and when.
- What the waiting phone does with its unsent events, with a snapshot it cannot take in, and with one under a key epoch it has no key for.
- What happens when no phone can make the snapshot.
- How a phone's cursor comes to cover its own uploads, and what becomes of an upload the API confirmed and then cleared before any other phone had it.

What bounds the answers: a phone never polls (proposal); the API runs on free plans where every request counts (ADR-0007); a phone built from main takes anything but a page for no page (ADR-0027); and offline sync is a level-2 area (ADR-0001), where two phones that show different ledgers with nobody told is the worst outcome.

Also considered:

- A request of its own by which a phone asks for a snapshot, stored until it is answered, cancelled or expired: the API already knows which phone it told so, and one mark beside the progress it records (ADR-0024) says it. A stored request would need two routes, an expiry and one more rule in the cleanup.
- Taking a phone to wait whenever its recorded cursor is below what the group is cleared to: the recorded cursor is the one a download carried, a page behind what the phone holds (ADR-0016). A phone that got its last page and was then cleared past would be named though it needs nothing.
- A route every phone asks at every sync for the devices that wait: one more signed request for every sync of every phone, answered with nobody nearly every time.
- The list in the page's body, on a new route: two page shapes for one download. A header leaves the body as ADR-0027 fixed it, and a phone that does not know the header ignores it.
- Naming a waiting device for as long as it waits: a phone that asked once and never came back would have a snapshot of the whole ledger made for it every time the last one expired, for good.
- Leaving a member device that holds no ledger to #141: it would need this decision's mark, set from a request of its own. The question a phone already asks for its snapshot says the same.
- Recording progress when a device is told there is no snapshot, so that one time serves both: the cleanup would then keep events for a phone that holds none of them.
- Uploading the waiting phone's unsent events before it has its snapshot: the other phones would see its changes sooner. #156 has the phone merge first, a key that changed while it was away comes with the snapshot's box (ADR-0015), and the loop stays one download, then one upload.
- Moving the cursor from the upload's answer when its numbers follow the cursor directly, with no second download: it saves a request for most syncs. It is a second way to move a cursor, which then has to be right about events from other phones in between and about stamps the API holds (ADR-0027). The download does both already; the shortcut can be added later without changing what a phone ends up holding.
- Dropping the invites a snapshot lacks from the phone that takes it in: ADR-0028's reason stands, the phone cannot tell an invite revoked while it was away from one of its own.
- A request by which a phone discards a snapshot it cannot use: only a forged snapshot, or one from a newer app, is unusable, and the cleanup takes it after 30 days (ADR-0033).
- For a group where no phone can make the snapshot, a button on the waiting phone, "continue from this phone's data" (#156, comment of 2026-11-08): the phone that did not come back may come back. It then holds changes the group went on without, its cursor is past them, and nothing tells either side. Making that safe takes a second protocol in which phones exchange what they hold, which is an issue of its own.
- Letting a member device that has not synced for some time stop counting, so that the others go on without it: the same, with a clock in place of the button.
- Telling only the one member device of a group to go on: two phones that both stayed away after an upload whose second download did not finish would each wait for the other for good, with nothing lost that the rule below cannot bring back.
- Remembering, after a snapshot is deleted, the number it covered for its recipient, so that a phone that took a snapshot in and then stayed away still counts as holding it: one more value that only this rule reads, for a case that also takes another phone's data to go back. While the snapshot is stored the rule sees it.
- Dropping an event from the phone the moment the API confirms it, as before: a phone whose second download did not finish, and whose event the cleanup then took before any other phone had it, would hold a change nobody else can get.

## Decision

A sync, once it has uploaded:

- A sync whose upload the API confirmed downloads again from the cursor, page by page to the end, before it ends. The pages are stored like any others, so the cursor passes the phone's own events, and the next sync starts after them. A sync that uploaded nothing, or had no upload confirmed, sends no second download.
- After the second download the sync downloads no more and uploads no more events. All that can follow is the snapshots it makes for the devices its last page names (below), and it ends once they are uploaded. A change saved meanwhile waits for the next sync. An answer that is no page ends the sync at once, with no snapshot made, and the confirmed upload stands.

A phone's own events until its cursor covers them:

- An event the API confirmed under a number past the phone's cursor stays with the phone, apart from its unsent events, until a page brings it back, which is when the cursor covers it. Until then it is not sent again, and does not keep the phone from making a snapshot.
- A phone that moves its cursor any other way, by taking a snapshot in or on the API's "continue", makes those events unsent again, as they were. The API answers the ones it still stores with their numbers, and stores the cleared ones as new events (ADR-0033); every phone merges them again and nothing changes (ADR-0016).
- So no change a phone made is left on that phone alone because the API cleared its event before any other phone had it.

Who needs a snapshot:

- The API marks a member device as waiting for a snapshot, with the time, when it answers that device's download with "snapshot needed" or "continue", and when it answers that device's question for its snapshot with "no snapshot". It takes the mark off when it answers the device with a page. Nothing else changes the mark. This is one more value the API keeps about a member device (ADR-0024).
- The last of these is for a member device that holds no ledger yet, and so downloads no events: a new member whose snapshot the cleanup took before its phone fetched it (ADR-0033). It asks again by asking for its snapshot again, which the screen that finishes a join does (#141).
- With every page, the API names the member devices a snapshot is needed by, in a header of the answer, `x-snapshot-needed-by`: device IDs joined by commas. `packages/domain` writes and reads the value (ADR-0007), and a value written any other way names nobody.
- A device is named while it waits, the API last marked it no more than 30 days ago, and the group stores no complete snapshot for it that covers what the group is cleared to. The device that asks is not named to itself.
- So a phone that holds the ledger asks by downloading, and asks again by syncing again. The API stores nothing it could not already work out but the mark and its time, and the cleanup has nothing new to delete. The answer "no snapshot" records no progress: the cleanup goes by downloads alone (ADR-0033).

The phone that keeps up:

- A phone whose sync got a page that names devices makes a snapshot of the ledger for each of them, in the order named, once its downloads and uploads are done, and uploads it as ADR-0028 says. It goes by the last page of the sync. A sync that ended early, at a download or an upload that failed, makes none. A snapshot that does not upload ends this for the sync; the next sync is told again who still needs one.
- The first phone to sync after a device was told makes the snapshot. Two phones that sync at once both upload, and the later chunk 0 replaces the other (ADR-0028). Once a complete snapshot is stored the device is no longer named, so no third follows.

The phone that is behind:

- When the download that begins a sync is answered with "snapshot needed", the phone records that the ledger waits for a snapshot, asks the API for its snapshot, and takes it in when it covers more than the phone's cursor. It then downloads from the new cursor, uploads, and downloads again, in the same sync. One snapshot a sync: if the download after it needs a snapshot again, the sync ends.
- With no snapshot, or one it cannot take in, the sync ends with nothing uploaded and every unsent event kept. Each later sync does the same again, which is also what keeps the device named.
- The ledger waits from that answer until one of its downloads gets a page. It records changes as before. The `sync` capability says whether a ledger waits; what a screen shows of it is #151's.
- A snapshot under a key epoch the phone has no key for is not taken in. Once the key is saved (ADR-0027), the next sync takes the snapshot in and uploads under that epoch. How a new key reaches a phone that was away is #143's.
- A snapshot in a format version the phone does not know shows the line that an event in one shows (ADR-0027), until a sync finds another snapshot.

Taking a snapshot in, for a phone that holds the ledger:

- The phone marks an expense as overridden (ADR-0029) when the snapshot holds its money under a later stamp than the phone's own money change, and the two differ. It does not look at what the merge keeps, as an event's mark does not. This is the flag ADR-0016 decided and ADR-0029 left open.
- Unsent events stay as they are, checked or not, and upload after the import (ADR-0028). An invite the snapshot lacks stays (ADR-0028).

When no phone can make the snapshot:

- The API answers a download whose cursor is behind the cleared events with "continue" instead of "snapshot needed" when three things hold. Every other member device of the group is marked as waiting. Each of them has no recorded progress, or a recorded cursor no larger than the one this download carries. And the group stores no complete snapshot, for any member device, that covers more than this cursor.
- Then no other member device holds an event from the API that this phone lacks, and none can make a snapshot that would bring this phone what it lacks. A device that does not wait may hold more, also one that has never downloaded. A stored snapshot may already be in its recipient's hands, and one for this phone is to be taken in first.
- The API reads the three from one moment of the group, in the transaction that records the device's progress and mark.
- "Continue" is status 410 with the number the group is cleared to, and no page. That number is not the group's last: the phone still downloads what the group stores after it. Like "snapshot needed" it records the device's progress and marks it as waiting, and `packages/domain` decides what is that answer (ADR-0007).
- A phone that gets it when a sync begins moves its cursor to that number, in one transaction with making its confirmed events unsent again, and syncs on: it downloads from there, uploads, and downloads again. It moves once a sync, and never back; a sync may take one snapshot in and move once, in either order. It is then a phone that keeps up, and makes the snapshots the others wait for.
- A ledger with one member device is the same rule with no other device.
- No person decides this, and the phone shows nothing for it. A member device that was not told it needs a snapshot keeps the others waiting, however long it stays away: it may hold what they lack. Removing it (#143) is how a person says it will not come back.

## Consequences

- Every sync that uploads sends one more download. A sync after a save is three requests where it was two.
- A phone that uploads and is then away for more than 30 days is no longer told it needs a snapshot for its own events. When its upload's answer was lost, or the second download did not finish, its cursor stays before its events and it is still told so, or told to go on; either way its event goes up again and nothing is lost.
- A phone keeps the events of a confirmed upload a little longer: until the second download of the same sync in nearly every sync.
- A phone that is behind catches up when a phone that keeps up next syncs, which is when that phone's app opens or saves a change (ADR-0027). #152's push can wake it. Until then the ledger shows what it held, and records.
- A waiting phone sends two requests a sync, a download and the question for its snapshot, and uploads nothing: the other phones do not see its changes until it has caught up.
- The API tells every member device which devices of the group are behind, by their IDs. Members already see each device's ID on its events (ADR-0016), and #151 shows each phone's last sync.
- A device that asked and never returns is named for 30 days. A snapshot made for it stays until the cleanup takes it (ADR-0033), and counts towards the group's 16 MiB (ADR-0028).
- Any member device can have a snapshot made for it by asking for one. It could already, by downloading from behind the cleared events, and it holds the group's key either way.
- A snapshot the waiting phone cannot use keeps it from being named, since the API cannot tell: the phone waits until the cleanup takes that snapshot, 30 days at most, or another replaces it. Only a forged snapshot, or one from a newer app than the phone's, does this (ADR-0028).
- A cleanup between a phone's page and its snapshot's first chunk can leave a snapshot that covers less than the group is cleared to. The waiting phone takes it in, is still behind, and is named again; the next cleanup deletes that snapshot (ADR-0033).
- A returning phone gets a flag on every expense whose money it last changed itself and another phone changed after, also where that phone had seen its change (ADR-0016).
- An unsent event that the API had stored and cleared is uploaded again as a new event under the stamp it has (ADR-0033). The gap ADR-0027 accepts for local data that went back stays as it is.
- A group whose phones were all behind goes on from the phone with the largest cursor. What only a phone that never comes back held past that cursor is lost, as it was the moment the API cleared it. What a phone's restored backup no longer holds, and no other phone has, is lost the same way.
- A phone that never comes back keeps its group waiting until #143 removes it, in two cases: it was not told it needs a snapshot, or it was told and holds the largest recorded cursor, so that the others wait for a snapshot only it could make. #143 has to let a phone that is itself behind remove a device, and #144 has to let it approve a takeover once it has gone on.
- The API knows a waiting phone by the cursor it sent last. Two things move a phone's cursor without a download: an import of a backup file that holds a larger one (ADR-0025), and a snapshot it took in whose next download did not reach the API, also on a phone that held no ledger before. Until that phone's next sync, another phone can be told to go on though this one holds more, and the two then differ with nobody told. The first takes an import on a waiting phone and a sync of another phone before its own. The second takes more: the phone that made the snapshot holds all the other took in, so its own local data has to go back behind the snapshot's number, and the snapshot has to be gone, which the cleanup sees to after 30 days.
- Requests can reach the API out of order. A download the phone gave up after 60 seconds can arrive after a later one, within the five minutes the clock check allows, and leave an older cursor and a mark recorded until the phone's next download. It is the same kind of gap, and far less likely.
- A member device that holds no ledger and whose local data went back to before it joined asks for nothing: the API tells it that it is a member already (#141), and it has neither the ledger nor the key. Nothing here brings it back; #143 can remove it, and #144 hands a ledger to another phone.
- Once #141 records a new device's progress at its snapshot's number, a device that was approved and never joined counts with that number. Where it is larger than every other phone's cursor and all of them are behind, nobody is told to go on until #143 removes it.
- A phone built from main ignores the header and makes no snapshot, takes "continue" for no page, drops its events when they are confirmed, and uploads and stops as before. No release exists yet.
- The Worker deployed before this change sends no header, marks no device and never answers "continue", so nothing is named while it runs; the mark's column has a default (ADR-0019). A deploy needs no change to `wrangler.jsonc`, the Workers entry file or the database client, so rule 9's check is not due for it.
- The paths this adds on the phone, in the API and in `packages/domain` are offline sync, and get branch coverage thresholds as they are added (`AGENTS.md` rule 8).
