# ADR-0021: What a phone does with a shared ledger's events

- Date: 2026-11-18
- Status: Accepted

## Context

ADR-0016 decides how sync events merge and leaves what the phone does around the merge to the specs of #131 to #133. Writing them raised choices that other phones, later app versions, snapshots (#139) and the sync loop (#135) depend on:

- ADR-0016 limits an event to 64 KB once encrypted and has a change that is too large fail to save. No decision says what an event's plaintext is, so a phone cannot tell how large an event will be.
- Each capability table has one key for every space: an expense, a category and a member are found by ID alone. A phone can hold several groups, and a member knows the IDs of every group they are in. An event in one group that names a record of another group, or a personal one, would change it. ADR-0015 leaves a member acting against their own group out of scope, but not a member of one group changing another group's ledger or someone's personal data.
- ADR-0016 shows an expense whose category is gone as "its group's Uncategorized, which cannot be deleted". The event format lets an event rename, archive or delete any category.
- ADR-0016 sorts categories by their creation stamp. A merged record keeps only the latest stamp of each unit, so the creation stamp is lost once every unit has changed.
- The owner decided on 2026-11-18 that a group's expense can only be moved to the trash and restored, in every group (#186). The epic's rule that a delete beats a change would otherwise let one member's Empty Trash delete expenses for everyone.

Also considered:

- A binary encoding such as CBOR for the plaintext: smaller, at the cost of a dependency. Events are about 620 bytes and ADR-0015 measured decrypting and parsing 100 of them at 31 ms, so size is not what limits sync.
- Keying the capability tables by space and ID, so that one ID could exist in two spaces: ADR-0016 keeps the capability tables' shape.
- Refusing an event that names another space's record, or that changes Uncategorized, as events that break a rule are refused: a rule about other records cannot be judged per event (ADR-0016), since each phone holds different records.

## Decision

- An event's plaintext is its content as JSON, as `JSON.stringify` writes it with no added whitespace, in UTF-8. An event's size is the length of that in bytes plus the 41 bytes encryption adds: the format version byte, the 24-byte nonce and the 16-byte tag (ADR-0015). The limit is 65,536 bytes. Before saving a change, the phone measures every event the change would write, and saves nothing when one is over the limit.
- A phone applies an event only to records of the group it arrived for. An event that names an expense, a category or a member belonging to another space on that phone, or a group event that names another group, changes nothing on that phone.
- No event changes a group's Uncategorized on a phone: it keeps its name and color, is never archived and never deleted.
- A record's creation stamp is the earliest stamp among the events merged into it. A record that existed when its group became a shared ledger has the stamp it got then (ADR-0016). Categories sort by it.
- An edit writes an expense's category unit only when it moves the expense to another category, with that category's name and color at that save. An edit that leaves the category alone would otherwise write the unit again whenever the category had been renamed or recolored, and could put back the category that another phone had just changed, with nobody told. The screens show a category's current name and color, so nothing on screen depends on the stored ones (owner, 2026-11-18).
- The app writes no event that permanently deletes an expense: Delete Permanently and Empty Trash act on personal expenses only. The format still allows such an event, and a phone that receives one applies it (ADR-0016).
- Within one date, an expense sits where it arrived on each phone, as ADR-0016 already has for the trash: the expense list mixes in personal expenses that only this phone has.
- A phone keeps each event it refused, with its envelope and the reason, so the app can tell its author (#149).

## Consequences

- Format version 1 fixes the plaintext. Another encoding needs a new format version (ADR-0016). #134 and #135 use the same limit and the same size.
- A phone that is in two groups can show less than a phone that is in one, but only for an event with a forged ID: IDs are random UUIDs, which do not collide by accident. No one is told.
- A snapshot carries each category's creation stamp besides its units' stamps (#139).
- Expenses of one date can be in a different order on two phones.
- A group's deleted expenses stay in the trash for good, on every phone. #186 moves them to a list in the group before the first public release. An expense tombstone can still arrive from a phone running other code, and lasts as long as the group.
- A hostile member can still rename or archive every other category, as ADR-0015 accepts. An event can also name a payer or a sharer who is no member of the group on a phone, and the screens then show that ID instead of a name; only a forged event does this.
- A phone looks at what it holds when it applies an event. A forged record applied first therefore collides later, when the phone joins the group that owns the ID, and an event carries no mark of which category is the group's Uncategorized: both are for the snapshot to settle (#139).
