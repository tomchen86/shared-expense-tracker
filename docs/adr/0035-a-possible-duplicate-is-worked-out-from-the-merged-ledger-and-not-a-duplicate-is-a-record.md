# ADR-0035: A possible duplicate is worked out from the merged ledger, and "not a duplicate" is a record

- Date: 2026-11-23
- Status: Accepted

## Context

Two people who share a ledger can each record the same dinner. #148 has the app mark an expense as a possible duplicate when its amount, currency and date equal those of one "you recorded", lets the user delete one of the two or say it is not a duplicate, and has that decision reach the other members. It leaves open:

- Who "you" is. A phone cannot tell which member wrote an event: the roster that maps a device to a member comes with #141.
- Which of the two expenses carries the mark, and on which phones.
- What raises the mark. The criteria name one moment, the arrival of someone else's new expense. Two expenses can also become equal through an edit, come back from the trash, or reach a phone in a snapshot instead of an event (ADR-0028).
- What "not a duplicate" is in the synced data, and how it merges with a delete and with the same decision made on another phone.
- What an app built before this decision does with it.

#147 already marks an expense whose amount another phone replaced (ADR-0029), with a line on its card, a block on its details and a number under the group's title. That mark depends on what one phone had typed, so it is kept on that phone. Whether two expenses look alike depends only on what every phone ends up holding.

Also considered:

- Marking when an event arrives, and keeping the mark in a local table as ADR-0029 does: an expense from a snapshot, an edit that makes two expenses equal and a restore from the trash would each need a rule of their own, and two phones could disagree on which expense is marked.
- Marking the expense that arrived, on each phone: each of the two phones would mark the other's expense, the delete the mark offers would remove a different expense on each, and two people who each tidy up at the same moment would put both in the trash.
- Marking both expenses of a pair: the group's number would count one problem twice.
- Showing the mark on every member's phone: a member who recorded neither expense would be asked to judge them, and ADR-0016 shows a flag only to the author it concerns.
- Counting an expense as "yours" when you paid or share in it: #148 says "recorded", and a member's phone does not know which member it is before #141.
- Keeping "not a duplicate" as a unit of the expense, a list of the expenses it was told apart from: a unit merges whole (ADR-0016), so two members settling different pairs of one expense at the same time would lose one decision, and every expense's first event would have to hold a seventh unit.
- Giving the record an ID made from the two expense IDs, so that two phones write the same record: the check of one event would have to take an ID apart, and two records that say the same thing do no harm.
- A new event format version: every phone on an older app would stop applying the group's events until it updates (ADR-0016). Nothing has been released.
- Letting a user take "not a duplicate" back: #148 does not ask for it.

## Decision

Which expenses are possible duplicates:

- Two expenses of one shared ledger are alike when their date, amount and currency are equal. Payments, shares, title, note and category are not compared.
- A phone recorded an expense when the expense's creation stamp names its device. An expense that was there when the group became a shared ledger was recorded by the phone that shared the group, which stamped it (ADR-0016).
- A pair is two alike expenses that different phones recorded, both complete and out of the trash, with no record saying they are not duplicates. The one with the later creation stamp is the possible duplicate, and the other is the expense it is compared with. Every phone works this out the same way, so every phone that shows the mark shows it on the same expense.
- A phone shows only the pairs of which it recorded one expense. A third member's phone holds the same data and shows nothing.
- `packages/domain` holds the rule as a pure function of the ledger's expenses, the pairs said not to be duplicates, and the phone's device ID. The phone runs it on what it stores now and keeps no mark of its own. So the mark comes and goes with the data, however the data got there: an event, a snapshot, the phone's own save, the trash.

"Not a duplicate":

- It is a record of the shared ledger, of a kind of its own. Its one unit holds the IDs of two expenses, in either order. The phone that writes it gives it a new ID. It is written once, never changed by the app, and cannot be deleted for good.
- It is an event like any other: encrypted, relayed, merged by stamp, and carried in snapshots. The API sees nothing new.
- It changes neither expense. It is judged alone, like every event (ADR-0016), so it may name an expense a phone does not hold: the phone stores it, and it takes effect if that expense arrives.
- A decision is about one pair. An expense alike to two others keeps its mark until each pair is settled.

Handling it on the screens:

- The mark's block names the other expense, opens it, and offers "not a duplicate" and the deletion of the expense the block is on. That deletion is the ordinary move to the trash, of that one expense.
- A group's number of expenses to review counts an expense with either mark once.
- In an archived group the block shows, and neither button that writes an event works, as ADR-0029 has it for "use mine".

## Consequences

- Both phones' own delete button removes the same expense, so two people who each press it at the same moment delete one expense, not two. Someone can still delete the other expense through its own screen while the other person deletes the marked one. Both are then in the trash, where nothing is removed without a person doing so, and the mark is gone on both phones without a notice.
- The mark also appears in cases #148 does not name: an edit makes two expenses alike, or a user adds an expense alike to one that had already reached their phone. It goes when an edit makes them differ, and comes back if they are alike again, unless the pair was settled.
- A settled pair stays settled, also when both expenses are later changed to another equal amount.
- Two expenses the same phone recorded are never a pair, so someone who records two equal expenses on purpose is not asked. Neither are two alike expenses from before the group was shared.
- A phone that gets a new device identity, or takes over for another (#144, #145), did not record the earlier expenses of its user. The pairs of those expenses are no longer shown on it, and still are on the other recorder's phone. Once the roster exists (#141), "recorded by you" can follow the member instead of the device with no change to the stored data.
- The phones do not say who recorded the other expense, for the same reason ADR-0029 names no one.
- The event format gains a record kind. Nothing has been released, so format version 1 takes it, as it took the invite (ADR-0026). An app built before this decision refuses such an event for its structure and moves on, and cannot take in a snapshot that holds such a record; it shows no mark either. After the first release, a new record kind needs a new format version.
- "Not a duplicate" records are never removed, a few hundred bytes each, like the records of expired invites (ADR-0026). Two phones that settle the same pair leave two.
- A forged record can say that any two expenses are not duplicates and hide a mark. A member can already write any event (ADR-0015).
- The rule runs over a ledger's expenses whenever a screen reads them. Grouping them by date, amount and currency keeps its cost growing with the number of expenses, not its square.
- The rule and the paths that write and apply the record are offline sync, and get branch coverage thresholds as they are added (`AGENTS.md` rule 8).
