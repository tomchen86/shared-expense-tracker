# ADR-0045: A phone shows sync only when something is wrong, and asks the API when each device last synced

- Date: 2026-11-25
- Status: Accepted

## Context

The cloud-sharing proposal says sync stays out of sight until something is wrong: a clock on an expense that has not been uploaded, one line above the group when the phone is offline or has not synced for long, a pull to sync, and each phone's last sync on the member list, because the API never removes a phone that stopped syncing. #151 builds this. ADR-0027 has a phone sync when the app opens and after a save, and show nothing when a sync does not finish. ADR-0034 leaves to #151 what a phone shows while it waits for a snapshot, and ADR-0041 what a phone shows that cannot rotate a key.

What was open:

- How a phone learns when the other phones last synced. The API already records, for each member device, the time of its last download that got a page (its progress, ADR-0024). No phone can read it.
- What "offline" and "not synced for long" mean on a phone that syncs only at certain moments, and when the phone decides them.
- Whether a phone that waits for a snapshot, or cannot rotate, gets words of its own.

Also considered:

- Sending every member device's time with each page, as a header beside `x-snapshot-needed-by`, and storing them on the phone: Members would show them offline, but every sync would carry the whole list, the phone would store other devices' activity and put it in export files, and a time shown offline can be days old without saying so.
- Recording a new "last seen" time on the API for every request of a device: the progress is already stored, and a time that moves on a request that downloads nothing would call a phone synced that only looked at Members.
- Reading the network state from the operating system: it needs a native module the app does not have, and it says whether the phone has a network, not whether a sync reached the API.
- A timer that puts the "not synced for long" line up while the app stays open: the app opens with a sync, so the line would appear for a moment at every start after three days away, before that sync has answered.
- A line of its own for a phone that cannot rotate the key: another member's phone rotates at its next sync, and the user of this phone can do nothing about it.
- Rounding the times the API gives to a day: the day depends on the reader's time zone.

## Decision

1. A member device asks `GET /groups/<group ID>/devices`, a signed request (ADR-0022). The API answers with every member device of the group and the time of its progress, or none while it has no progress. The API stores nothing for it, and the request changes nothing: asking is not syncing.
2. A phone asks when Members opens on a shared ledger in which someone else has a phone, and shows the answer there, by member, through the roster (ADR-0039). It keeps the answer only while Members is open. When the request fails in any way, Members shows what it showed before #151.
3. A phone's own state comes from its own syncs alone. It records, per shared ledger, when a download last got a page. When a sync ends it decides what the group's screen says until the next sync ends: nothing; that it has not synced for three days, with the date; or that the sync got no answer. The last two are not stored: after a restart the sync that opens the app decides again.
4. A ledger that waits for a snapshot says so for as long as it waits, from the moment it starts, and that line replaces the other two. A phone that cannot rotate has no line of its own: its changes show the clock, and after three days the line of item 3 appears.
5. An expense shows a clock while the phone holds an unsent event that changes it. Pulling down on a shared ledger's screen starts one sync of that ledger.

## Consequences

- Every member device can read when each other device of its groups last downloaded, to the millisecond, by asking the API. The proposal accepts that members see this; the API has always held it (ADR-0024).
- Members shows the times only while the phone reaches the API, and a moment after it opens. Until the answer arrives a row says "Joined", as before.
- "Not synced for long" and "no answer" appear only after a sync has ended, so a build with no API address never shows them, and neither does a phone in the seconds before its first sync of a start ends.
- A phone decides "three days" by its own clock at the two moments. A clock set back hides the line, and one set forward shows it early; the next sync that gets a page clears it either way.
- The time of the last page is new stored data in a level-2 area (ADR-0001). An export file carries it, so after an import a ledger says what the file knew until it syncs (ADR-0025).
- #152 wakes phones to sync without the app in front. Its syncs record the same time and decide the same line.
