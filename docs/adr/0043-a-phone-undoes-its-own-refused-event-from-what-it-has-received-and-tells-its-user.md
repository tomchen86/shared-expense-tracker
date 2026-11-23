# ADR-0043: A phone undoes its own refused event from what it has received, and tells its user

- Date: 2026-11-23
- Status: Accepted

## Context

ADR-0016 has every phone refuse an event that breaks a rule about that event alone, as if it never existed. ADR-0021 has a phone keep each event it refused, with its envelope and the reason, "so the app can tell its author (#149)". #149 asks for that notice, and for the record to show the same result as on every other phone.

A phone applies its own change when it saves it (ADR-0005), before any phone has judged the event with its envelope. Two of the rules need the envelope: the stamp bound, which compares the stamp with the time the API received the event, and the rule that the stamp names the device that uploaded it. A working app does not write an event that breaks them: a phone checks its unsent stamps against a corrected time the API has just accepted (ADR-0027), and it uploads under the device ID it stamps with. So a refusal of a phone's own event follows a fault, an app from another build, a database changed by hand, or a later change of device identity (#144, #145). When it happens, though, nothing on `main` takes the change back: the phone keeps a title, an amount or a whole expense that no other phone has, for good, and nobody is told.

What was open:

- Which refused events are the phone's own. A phone forgets an unsent event once the API confirms it, and after an import (ADR-0025) it may download events it no longer remembers writing.
- How to take a change back. A merged record keeps one value and one stamp per unit (ADR-0016), not the value the change replaced, and an event from another phone that arrived meanwhile and lost to the refused stamp is gone.
- What the user sees, where, and until when. ADR-0029 and ADR-0035 put a line on an expense's card and a block on its details. A refused new expense has no card once it is taken back, and a refused change to a group, a member or a category never had one.

Also considered:

- Keeping, with each unsent event, the values it replaced, and putting them back: an event of another phone that arrived in between, earlier than the refused stamp and later than the replaced one, would be lost on this phone only. That is the ordinary case of two people changing one field.
- Not applying a change locally until it comes back: recording would need the network (ADR-0005).
- Dropping the record and asking another phone for a snapshot (ADR-0028, #156): it needs another member online, and a snapshot merges by stamp, so the refused stamp would still win.
- Writing an event that sets the old value back: it would change the other phones' data, with a new stamp, to repair something only this phone has.
- Sending the change again with a new stamp: #149 rules out a retry the user did not ask for, and a change refused for its sums or structure would be refused again.
- Calling a refused event the phone's own when its stamp names the phone's device: a forged event uploaded by someone else can carry that stamp, and the phone's own upload under a changed identity would not.
- Showing the notice on the expense's card and details, as the other two marks do, and a list only for changes without a card: two places to look and to dismiss, for a notice a working app never raises. The owner can still ask for the card line.
- Clearing the notice when the user opens it: a user who opens the list by accident loses the values they would need to enter the change again.

## Decision

Which events:

- A refused event is the phone's own when the device that uploaded it is the phone's device in that shared ledger. The envelope says so on every phone, and the phone needs no memory of the event.
- Only the per-event rules of ADR-0016 refuse an event. A change that merges and then has no effect, such as a change to a record deleted for good, is not refused and raises no notice.
- A change that is still unsent has no envelope and passes the phone's own check, so nothing is known about it until the event comes back in a download. A snapshot carries merged records, never refused events, so importing one raises no notice.

Taking it back:

- Beside each record's merged result, a phone keeps the result of merging only what it has received: the values the group had when it was shared, every applicable event it has downloaded, its own included, and the snapshots it has imported. Phones that have received the same events hold the same received result. A record's merged result is its received result plus the phone's own events that have not come back.
- When a phone's own event is refused, each unit that still holds that event's stamp takes the unit of the received result, or goes when the received result has none. A unit that holds another stamp stays. A tombstone the event left is undone the same way, and the record's creation stamp follows. The capability tables and the open screens follow in the same transaction, as for an applied event.
- The event leaves the unsent events if it is still there. The phone forgets an own money change (ADR-0029) that holds its stamp. The latest stamp the phone has seen does not go back.

Telling the user:

- The phone keeps each of its own refused events as a change that was not applied, until the user dismisses it. It is local, no event carries it, and an export file carries it as it carries every row (ADR-0020, ADR-0025). A dismissed one does not come back when the same event is downloaded again.
- A shared ledger's screen counts them under its title, on a line of their own below the count of expenses to review. The line opens a list with one block per change: what it was, why it did not take effect, the values the user entered when it was an expense, and a button that dismisses it. Dismissing writes no event, so it works in an archived group.
- The reason is spelled out for the clock, which the user can set right. Every other reason reads as one sentence: they follow faults the user cannot act on.
- The app does not send the change again. The user enters it again if they still want it.

## Consequences

- After a refusal the phone shows what every phone shows that has received the same events, also when another phone changed the same field meanwhile.
- A phone stores more per record. The received result differs from the merged result only while the phone has events that have not come back, so it can be kept only for those records. The whole-database comparisons in the tests of an own event coming back no longer hold, and the `sync` spec now says what stays the same instead (SYNC-28.3).
- A refused new expense disappears from every screen, and a refused deletion of a category brings the category back. The list is the only place that says so. Nothing tells a user who never opens that group's screen; a notification is for #153.
- A change that names a record this phone no longer holds is listed without the record's name.
- A refused event that made an invite takes the invite off the phone that made it, as no other phone ever had it. A link already handed out stops being approvable, and the user makes a new one.
- A snapshot is still the merged result of the phone that makes it (ADR-0028), so it holds that phone's own events that have not come back. One of those that is refused afterwards stays on the phone that imported the snapshot: that phone did not upload it, so it takes nothing back. The flows that send a snapshot do so only once the sender has downloaded what it uploaded: an approval names a cursor equal to the group's latest event (#141, ADR-0039), and a sync sends snapshots after its last download (#156, ADR-0034). Making snapshots from the received result instead would close this for any caller, and is left for whoever next changes what a snapshot holds.
- An event refused once is refused for good on the phone that uploaded it: it is not uploaded again. If the API has cleared it and a phone that still holds it as unsent uploads it again (ADR-0033), every phone judges it anew by the new receive time, and it can then apply while a notice about it is still listed. Only a phone whose data went back to before the refusal (ADR-0025) uploads it again.
- After the refusal of a money change the phone holds no own money change for that expense, as after "keep current" (ADR-0029): a later change from a phone that had seen neither amount is not flagged here.
- ADR-0016 also promises a notice to whoever removes a member that a roster entry keeps in the group. No roster exists on `main`; it comes with #141 (ADR-0039). That removal is not a refused event, so it needs a rule of its own on the merged state, and an issue of its own once the roster is merged.
- With #156 (ADR-0034) a phone downloads again right after it uploads, so a refusal is known within the same sync, and the events it turns back into unsent ones after importing a snapshot are judged like any other when they come back. Nothing in this decision changes.
- A phone that gets a new device identity (#144, #145) does not treat the old device's refused events as its own when it downloads them. Those issues decide what moves with the identity.
- The paths that keep the received result, undo a refused event and keep the notices are offline sync, and get branch coverage thresholds as they are added (`AGENTS.md` rule 8).
