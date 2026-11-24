# ADR-0046: A screen that shows what its user waits for asks the API again on a timer

- Date: 2026-11-25
- Status: Accepted

## Context

The cloud sharing proposal (2026-11-01) says under sync status and notifications that the app does not poll: a change wakes the other phones through a push, and opening the app syncs once. It gives no reason, and neither does the pull request that recorded it. ADR-0007 wants a relay that costs almost nothing while idle, which is the nearest thing to one. Two later decisions took the sentence as a rule for every request: ADR-0027 rejected trying a failed sync again on a timer, and ADR-0039 rejected checking a join request's state on a timer, each with "a timer that asks the server is polling, which the proposal rules out".

On 2026-11-24 the owner tried inviting, asking and approving on two real phones, on `main` at `94ee0a2`. Everything worked as specified, and two screens stood still:

- The member's phone lists a ledger's join requests when a sync of it ends and when its Members opens (SHARING-190.2). With the group's screen or Members left open, a request that arrives is not shown until the user closes and opens Members again.
- The applicant's phone asks what became of its request when the app opens and when Join Group opens for it (SHARING-210.1). With "Waiting for Approval" left open, an approval is not shown until the user leaves the app and comes back.

Joining is the one moment in this app when two people look at their phones at once and each waits for the other. The pushes that would tell them are not built (#152, #153), need accounts and keys the project does not have yet, and are delivered at the platform's discretion; a user can also turn notifications off.

What a request costs: the API takes a lock on the device and writes a row for every signed request it accepts (ADR-0022), against a limit of 60 requests a minute for a device. Counted by reading `apps/api/src/sharing/devices.ts` and the routes, not measured, that is about six to nine statements a request. The managed database is billed by the time it is awake (ADR-0007); its provider's documentation says the free plan suspends it after five idle minutes, which nobody has checked on this project's database.

Also considered:

- Waiting for the pushes: the screens stay as they are until then, and afterwards for every push that does not arrive.
- Asking again whenever the app is in the foreground and something is pending, on any screen: an invite lasts seven days and every member's phone holds it, so every session of every member would ask for a week, mostly with nobody waiting.
- Asking for a fixed time after an act that starts a wait, such as sending a request or sharing a link: it needs the phone to remember acts, and a screen left open past that time stands still again.
- One interval that never grows: a phone left on such a screen with its display kept on would send a request every few seconds for as long as it stays there.
- Syncing a shared ledger on a timer while its screen is open: that is the polling the proposal meant. A ledger changes at any time, so the cost would follow the time the app is open; pulling down (#151) and the pushes cover it.
- A connection the API keeps open, or a request it holds until something changes: on Workers either needs a Durable Object, which the Node entry file cannot run (ADR-0007), or has the API ask the database in a loop, which costs more than the phone asking.
- Pull to refresh on Members and on "Waiting for Approval": nobody expects to pull on a screen that says it is waiting.

## Decision

- The proposal's sentence is read as a rule about syncing a shared ledger: no timer starts a sync, as ADR-0027 has it (SYNC-89.2). A request that syncs no ledger may be sent on a timer where a requirement says so. This supersedes the rejection in ADR-0039 of checking a request's state on a timer; the rest of ADR-0039 and all of ADR-0027 stand.
- Two screens ask again on a timer, and only while the user sees them and the app is in the foreground:
  - A shared ledger's screen and its Members list the ledger's join requests again, under the conditions of SHARING-190.2 (SHARING-290.1).
  - Join Group, while it shows a request that waits for approval, asks what became of that request again, as SHARING-210.1 does (SHARING-291.1).
- The next time is 3 seconds after the last one ended while the screen has been showing for under 2 minutes, and 30 seconds after it from then on. Counting from the end of the last one keeps one such request under way at a time, however slow the answers are.
- The timer adds no request of a new kind and no new answer: each time is the list or the question the phone already sends, with every condition it already has. Nothing is shown when one fails.
- The intervals, and that both the member's screens and the applicant's do this, are the spec author's recommendation in #256. The owner decided to build this on 2026-11-25 and has yet to confirm those two.
- A screen that is closed or covered, and an app in the background, send nothing. Showing the screen again starts the 2 minutes anew.

## Consequences

- A request that arrives, and an approval or a refusal, show within about 3 seconds on a screen that was just opened, and within 30 seconds on one left open. Nobody has to know to reopen a screen.
- While such a screen shows, the phone sends 20 signed requests a minute for the first 2 minutes, 40 in all, and 2 a minute after that, 120 an hour, when a list fits one page. A list goes on for as many pages as the API says follow (SHARING-171.1), and whoever holds the link can fill them: at three pages a time the first 2 minutes reach the limit of 60 a minute, and the phone's own sync or approval waits once as the API tells it (SHARING-28.1). A phone that is a member of one group and waits to join another runs both timers, 40 signed requests a minute. A question that is answered with "waiting" also reads the invite's card (SHARING-211.1), a public request that counts towards no device's limit (ADR-0032). A phone that stays on such a screen for a day with its display on sends 2,916.
- These requests run only while the app is open, which a sync has already woken the database for. For a wait of a minute or two they add little to the time it is awake. A screen left open keeps it awake for as long as it stays open, since 30 seconds is less than the idle time after which the database sleeps: the phone left on such a screen for a day keeps it awake that day.
- When the pushes exist (#152, #153), this is what remains for a push that did not arrive and for a user who turned notifications off. A push received in the foreground can run the same list or question at once.
- A phone still learns nothing while its app is closed or in the background, or while its user is on another screen: the card on the Groups root and the count on a group's screen change at the next sync or when their screen is opened. That is for #152 and #153.
- "No timer asks the API" no longer holds as a general rule. A later issue that wants another request on a timer needs its own requirement and has to say why that screen is one a user waits on.
- A cancellation that got no answer may have reached the API (SHARING-143.2). The question that follows a few seconds later then finds no request, and Join Group says the request was declined (SHARING-211.1), where before it said so only the next time the app or the request was opened. This is not changed here.
- SYNC-89.1 said that the app asks the API for nothing on a timer while it is open. It becomes SYNC-89.2, which says that no timer starts a sync and names these two requirements as the only requests sent on one.
- The existing tests of the two give-up rules (SHARING-145.1, SHARING-204.1) let more than 60 seconds pass on these screens, so they were changed to hold whatever the timer sends meanwhile.
