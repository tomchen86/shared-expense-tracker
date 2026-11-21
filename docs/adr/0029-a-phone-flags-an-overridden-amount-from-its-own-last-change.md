# ADR-0029: A phone flags an overridden amount from its own last change, and an edit bases on what its form opened with

- Date: 2026-11-21
- Status: Accepted

## Context

ADR-0016 decides when an incoming change overrode a phone's own money change: its stamp is later, and its base is earlier than the stamp of that change. Only that change's author sees the flag. `packages/domain` holds the comparison (#130), and #147 is the first issue to show a flag. The earlier decisions leave open:

- What a phone keeps as its own money change, and for how long. ADR-0016 names it, and no table holds it.
- What the flag says. The proposal's example names a person ("Bob changed it to 350"), and a phone cannot tell which member wrote an event: the roster that maps a device to a member comes with #141.
- What the flag shows once more events arrive. The overriding change can itself be replaced, by a change that saw it or by one that did not.
- What "keep" and "change back" do to the ledger, and what stops the same event from raising the flag again: applying an event twice must change nothing (ADR-0016).
- What an edit's base is. ADR-0016 has each changed unit record "the stamp it replaced". Edit Expense reads the expense when it opens, and an open form does not follow the events applied meanwhile (#131 to #133). Since #135 a sync can apply another phone's change while the form is open. A save that compares the form with what is stored at that moment writes back fields the user never touched, each with the other phone's stamp as its base. The other phone's amount is replaced, every phone concludes that the editor had seen it, and nobody is told (#147, comments of 2026-11-18).

Also considered:

- Keeping the overriding event's money in the flag, and showing that: after a later change that saw the overriding one, the flag would name an amount the expense no longer has, and "keep" would keep another.
- Raising the flag only when the overriding event is the one the merge keeps: the flag would depend on the order events arrive in.
- Deriving the flag from the event that holds the money unit now: it would vanish, unhandled, as soon as anyone changed the amount again, and #147 keeps it until the user handles it.
- Counting an event the phone downloads back, which it wrote itself, as its own money change: after an import of older data (ADR-0025), flags the user had settled with "keep" would come back.
- Having "keep" adopt the current money as the phone's own change, so that a later change that had not seen it is flagged too: the phone would hold as its own a change another device stamped, and "change back" would later restore an amount the user never entered.
- Having "change back" name the user's old change as its base, so that the phone that wrote the current amount gets a flag in turn: the user has seen that amount, and a base says what its author had seen.
- Refusing a save when the expense changed while its form was open, and reloading the form: the user types the change again, also when the other phone changed a field they never touched.
- Updating the open form when events are applied: #131 to #133 decided that an open form keeps what the user sees and has typed.

## Decision

A phone's own money change:

- For each expense of a shared ledger, a phone keeps the stamp and the money of the last event it wrote itself that held the expense's money unit: adding the expense, an edit that changed the money, and "use mine" below. It is local. No event carries it, an export file carries it as it carries every row (ADR-0020, ADR-0025), and no event the phone downloads sets it, its own events included.
- When a check replaces the stamp of an unsent event (ADR-0027), the own money change that holds that stamp is renamed with it, in the same transaction.

The flag:

- When a phone applies an event that overrode its own money change of that expense (ADR-0016), it marks the expense as overridden, in the transaction that stores the event. Whether the merge kept that event's money does not matter, so neither does the order events arrive in.
- An expense needs review while it is marked, is not in the trash, and its money differs from the phone's own money change. The screens show the two side by side: the money the expense has now, and the money the user entered. The app does not say who changed it.
- "Keep current" writes no event. The phone forgets its own money change of that expense, and the mark with it.
- "Use mine" writes an ordinary event that sets the money to the user's, based on the stamp the money has now. That event becomes the phone's own money change, which clears the mark.
- Any later event of the phone that holds the expense's money unit replaces its own money change and clears the mark the same way.
- A permanently deleted expense has neither.

An edit's base:

- An edit made in a form bases on what the form opened with. A save writes the units whose value on the form differs from the value the expense had when the form opened, each with the stamp that unit had then as its base. It leaves every other unit as the merge left it, and does not fail over them.
- This narrows ADR-0016's "the stamp it replaced": for a change made in a form, that is the stamp of what the user was looking at. It differs from the stored one only when an event was applied while the form was open.

## Consequences

- The author of an overridden change gets the flag also when the amount they see now is a third person's. A and B change an amount without seeing each other, and C, who saw A's, changes it after both: A's phone flags the expense for B's change, though C's amount is the one kept. ADR-0016 already accepts a flag that was not strictly needed.
- After "keep current" the phone holds no own money change for that expense. A change that arrives later, from a phone that had seen neither amount, is not flagged on this phone. It is flagged on the phone whose amount it replaced.
- "Use mine" does not flag the phone whose amount it replaces. Its user finds the amount changed back, as after any edit made in sequence.
- A flag whose two sides become equal again, because someone set the money back to exactly the user's, is not shown, and shows again if the money changes before the user changes it themselves.
- The app can name the member behind the current amount once the roster exists (#141): the money unit's stamp holds the device that wrote it. Flags raised before then need no migration.
- A flag on an expense in the trash is not shown, and comes back when the expense is restored. An archived group shows it and offers "keep current" only.
- Local data that went back (ADR-0025, ADR-0027) holds the own money changes and the marks of that moment. A change made after that moment and overridden since is not flagged again when its events come back.
- A snapshot merged into a phone that already holds the ledger (ADR-0028) can replace a money unit the phone changed itself, and ADR-0016 has the phone flag that. The import is not on `main` yet, and nothing hands a snapshot to a phone that holds changes of its own before a phone comes back (#156) or takes the place of a read-only copy (#141): the issue that first does adds that flag, on what this issue keeps.
- Other screens that are open while an event changes what they hold are not decided here: a member or a category the user picked on an open expense form that another phone has since removed or deleted, and Rename Group, Rename Member, the category form and a Move list. They are recorded on #171.
- The paths that keep the own money change and raise the flag are offline sync, and get branch coverage thresholds as they are added (`AGENTS.md` rule 8).
