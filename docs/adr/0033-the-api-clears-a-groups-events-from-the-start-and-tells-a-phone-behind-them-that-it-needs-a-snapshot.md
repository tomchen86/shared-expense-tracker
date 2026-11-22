# ADR-0033: The API clears a group's events from the start, and tells a phone behind them that it needs a snapshot

- Date: 2026-11-23
- Status: Accepted

## Context

The cloud sharing proposal decides that the server does not keep events for good: an event goes once every phone in the group has it, and after 30 days at the latest. ADR-0016 has a phone that comes back later than that start again from a snapshot. ADR-0024 records each phone's progress and limits what a group stores "until some are cleared (#155)". ADR-0015, ADR-0022 and ADR-0026 each leave rows behind for #155 to clear: a nonce for every accepted request, the keyed hash of an IP for every registration, and a row for every invite code. #155 builds the cleanup. The earlier decisions leave open:

- What "every phone has it" means to an API that knows only the cursor a phone last sent.
- Which events go when the 30 days are up. A group's receive times need not rise with its sequence numbers: a receive time is the clock of the Worker that stored the event.
- How a phone learns that events after its cursor are gone, and what the API records about a phone it tells so.
- What an upload does with the ID of an event that was cleared. A phone uploads an event again after an answer it never got, and after its local data went back (ADR-0025).
- What a request gets that arrives while a cleanup runs. A download reads the group, then the events, then writes its progress, in statements of their own.
- How long the rows of ADR-0015, ADR-0022 and ADR-0026 stay.
- What starts the cleanup and how often. As of 2026-11, on the free plans a Cron invocation of a Worker has 10 ms of CPU, waiting for the database apart, and Neon's compute sleeps after five minutes without a query and runs 400 hours a month at its smallest size.
- Snapshots (ADR-0028), join requests (ADR-0032) and transfer bundles (#145), which #155 also names, are not on main. ADR-0028 and ADR-0032 leave to #155 when a snapshot nobody fetched and the requests of an expired invite go.

Also considered:

- Deleting exactly the events that qualify, wherever they are in the sequence: an event that stays behind a deleted one can never be handed out, because a page has no gap (ADR-0024), so it would be kept for nobody.
- Remembering the IDs of cleared events, so that a late retry is answered with its old number: a row for good for every event ever uploaded, to spare the phones one more download of an event whose merge changes nothing (ADR-0016).
- An empty page with a flag, or one more field in a page, for "snapshot needed": a page's shape is fixed for format version 1 (ADR-0027), and a phone built before would read an empty page as being in sync.
- Counting "snapshot needed" among the refusals, which change nothing: the progress of a phone whose data went back would stay ahead of what the phone holds, and the events it needs after its snapshot could be cleared as delivered before it gets to them.
- Keeping an event for some days after every phone has it, so that a phone whose data went back catches up without a snapshot: #155 says an event goes when every phone has it, and a period of grace would be the owner's to add.
- Holding the events after the number a stored snapshot covers, which ADR-0028 says #155 can do: approving a join records the new device's cursor at that number (ADR-0016). Before that, only a cleanup in the moments between the upload and the approval takes them, and the approval is then refused and a new snapshot made.
- Forgetting an invite's code some time after it expires, as ADR-0026 expected: a phone whose local data went back to a code it had prepared could create that invite again, under a secret that was shared and then revoked. A row without its card is a random code and four values.
- Clearing from the routes, such as when an upload finds its group full: every upload would pay for it, and #155 asks for Cron.
- Running it every hour: with nobody syncing, the database would wake 24 times a day, about 60 of Neon's 400 free hours a month, and nothing here needs it sooner than a day.

## Decision

Events:

- A member device has an event when the progress the API has recorded for it in the group (ADR-0024) has a cursor at or past the event's number. A member device with no progress recorded has none. So the API takes a phone to have an event only once the phone has sent a cursor that covers it, which is one download later than the page that carried it (ADR-0016).
- A cleanup clears each group from the start of its sequence up to one number: the higher of the lowest cursor among its member devices' progress, and the number of the last event received more than 30 days before the cleanup's time. Every event up to that number goes, also one that is younger than 30 days and numbered before an older one. An event received exactly 30 days before stays.
- The events a group stores are therefore always the ones after some number, up to its last. The number a group is cleared to is the highest one deleted. What the group stores already says it, so the API need not keep it.
- A cleared event is gone. Its content is deleted, its size no longer counts towards the group's limit (ADR-0024), and its ID is no longer one the group has: an upload that carries it stores it as a new event under the next number. The group's last sequence number never goes back, so no number is given twice.
- A download with a cursor below the number the group is cleared to is answered with status 410 and `{"error":"snapshot-needed"}`, never with a page. A cursor at that number gets a page as before. The answer says `Cache-Control: no-store`, as a page does. `packages/domain` defines it beside the event API's bodies (ADR-0007), apart from the refusals.
- That answer records the cursor and the API's time as the device's progress, as a page does. ADR-0024 records a lower cursor so that the events a phone needs again are not cleared under it, and a phone that needs a snapshot needs the events after its snapshot for the same reason.
- A device that is no member device is refused as before, whatever the group has cleared (ADR-0024), and a cursor past the group's last number is still a request written wrongly.
- A request that arrives while a cleanup runs is answered as if the cleanup of its group had finished before it or had not begun. A download gets a page that starts right after its cursor and has no gap, or the answer that a snapshot is needed. Cleanups that run together take each event's size off the group's count once.
- The cleanup removes no device, no member device, no group and no progress, however long a phone has been away (proposal).

Other rows:

- An invite's card is deleted once the invite has expired. Its row stays, so its code stays used (ADR-0026 left the time to this issue).
- The record of an accepted request, its nonce and its times (ADR-0015), is deleted once the request was accepted more than 10 minutes before the cleanup's time. A request passes with a request time at most 5 minutes after the API's time, and a nonce matters while its request time is within 5 minutes of the API's (ADR-0022), so nothing older can be replayed. The limit of 60 requests counts one minute.
- The record of a registration, the keyed hash of its IP and its time, is deleted an hour after the registration, when the limit no longer counts it (ADR-0022). The device ID and the public key stay.

How it runs:

- The cleanup is one function of the API that takes a database client and the API's time, and nothing else (ADR-0007). The Workers entry file exports the `scheduled` handler that Cloudflare calls for a Cron trigger, and runs the cleanup once with a client on the environment's Hyperdrive. Lint already keeps what exists on one runtime out of every other file. Tests call the function on Node.
- Each environment's Worker has one Cron trigger, once a day.
- The rules look only at what the database holds and at the time given, so a run that is missed, late or repeated needs no making up: the next run does what is due.

What is not on main:

- Snapshots and join requests are specified on branches that are not on main, and transfer bundles are not specified at all, so this decision has no rule for them yet: no test of one could run. Each gets its rule once it is on main, as an addition to #155's spec while #155 is open, and otherwise with an issue of its own.

## Consequences

- A phone built from main before #156 that is told it needs a snapshot ends its sync there, as after any answer to a download that is no page (ADR-0027). It applies nothing, uploads nothing, keeps its unsent events and its cursor, and shows nothing. Every later sync ends the same way until a build with #156 fetches a snapshot. No release exists yet.
- An event is cleared a day at most after the last phone has sent a cursor that covers it, and a phone sends that cursor at its next sync after the one that downloaded the event. A phone that is opened once a week holds its group's events for a week.
- A group that is full (ADR-0024) has room again at the first cleanup after its phones have caught up, so up to a day later, or after 30 days when one of them stays away.
- A group with one member device loses its events at the next cleanup after that phone's next sync. If the phone's local data then goes back, by an import (ADR-0025) or a restored backup, nobody holds what it uploaded since: the phone is told it needs a snapshot, and no phone can make one. The same holds when every other phone of a group is gone (#156, comment of 2026-11-08). #156 decides the way out. Until then such a ledger records and does not sync.
- A phone that is told it needs a snapshot keeps its group from clearing delivered events until it has caught up, as a phone that is offline does. The 30 days still bound what the group keeps.
- An upload can store an event a second time: when its first answer was lost and a cleanup ran before the retry, or when the phone's data went back. Every phone merges it again and nothing changes (ADR-0016). Its second receive time is later, so an event the phones refused for its stamp the first time (ADR-0016) can be applied the second time, by every phone alike.
- A phone whose local data went back, and that holds as unsent an event the API has cleared, uploads it as a new event under whatever stamp its check gives it now (ADR-0027). What a phone does with its unsent events when it takes a snapshot in is #156's to decide.
- Where two Workers' clocks differ, an event can go that much before its 30 days are up.
- What stays for good is a group, its member devices and their progress, a device's ID and public key, and an invite's row without its card. A device that creates invites in a loop still adds rows (#159).
- An expired invite's card stays until the next cleanup, a day at most. Nobody can read it meanwhile (ADR-0026).
- Until snapshots and join requests have their rules, a snapshot nobody fetched and the requests of an expired invite stay as ADR-0028 and ADR-0032 leave them. A snapshot's rule will need the time the snapshot was begun, which ADR-0028 does not keep: in a group that gets no new event, a snapshot that is never fetched is otherwise never out of date.
- #141 refuses an approval whose snapshot covers less than the group is cleared to (ADR-0016), and records the new device's progress at the snapshot's number. From then on the cleanup keeps the events after it, for up to 30 days. #156 can rely on the progress this decision records for a returning phone.
- A group's cleanup has to shut out the group's uploads and be seen whole by its downloads. An upload already holds the group's row lock across its statements (ADR-0016), and since PR 210 the check of `AGENTS.md` rule 9 sends uploads that arrive together through the real Hyperdrive. That check does not run the cleanup: only a deployed Worker's Cron runs it through Hyperdrive. Whether the check should run it too is the owner's to decide.
- A Worker from before this change does not know that events can be missing. Rolled back (ADR-0019) onto a database a cleanup has run on, it would answer a phone behind the deleted events with a page that has a gap, or with an empty page that looks like being in sync. After the first cleanup in an environment, a bad deploy is put right by a new deploy, not by a rollback past this change.
- A change to a Cron trigger takes up to 15 minutes to reach Cloudflare's network after a deploy, and a run can be missed meanwhile.
- With 10 ms of CPU for a run, the cleanup does its work in SQL statements, not row by row in the Worker.
- With nobody syncing, the daily run wakes Neon's compute once a day, about 2.5 of the 400 free hours a month.
- The change adds a Cron trigger to `wrangler.jsonc` and a handler to the Workers entry file, so the owner runs rule 9's check on staging before the merge.
- The cleanup is offline sync, a level-2 area: its paths get branch coverage thresholds as they are added (`AGENTS.md` rule 8).
