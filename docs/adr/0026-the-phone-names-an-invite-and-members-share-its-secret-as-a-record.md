# ADR-0026: The phone names an invite, and members share its secret as a record

- Date: 2026-11-20
- Status: Accepted

## Context

ADR-0015 decides what an invite is: a link `https://<domain>/i/<code>#<secret>`, a card the API stores that only the secret opens, one active invite for a group, a secret that reaches the other members in an encrypted group event, and an invite that any device losing access revokes. ADR-0016 has a group's first Invite make it a shared ledger, and ADR-0024 has the phone create the group on the API under its own ID. #138 is the first issue to build an invite, and #140 and #141 build on its routes and on what the phones hold. ADR-0015 leaves open:

- Who makes the code, and what a phone does when its request to create an invite gets no answer. The API may have created the invite, and only that phone knows the secret.
- What "one active invite" means between two phones that have not synced: one of them revokes, or both press Invite.
- What kind of event carries the secret, and how a revocation reaches the other phones, when merging lets the later stamp win and phones' clocks differ by minutes.
- Which request serves the card, and to whom.
- When a card is replaced, by which phone, and what its label is while a phone has no cursor yet (#135).
- Where the app learns the address of the API. Until now it never called it.

#138 leaves four choices open and recommends an answer to each, which this decision takes: one link for a group at a time, any member can revoke it, Invite sits in Members, and an archived group has to be restored first. The owner approves them by publishing the spec.

Also considered:

- A code the API hands out: a request whose answer is lost would leave an invite nobody can show, and the next attempt would be refused until it expires.
- Letting a new invite replace the active one: two members pressing Invite would silently end each other's links.
- Keeping the invite as a unit of the group record, set and cleared like a name: a revocation and a new invite made within the difference of two clocks could merge to "no invite" on every phone while the API holds one nobody knows the secret of.
- A revocation that names no code: a phone that has not heard of a newer invite would revoke it.
- Asking the API for the group's invite every time Invite opens: the link would not show without a network, and the answer could not carry the secret anyway.
- Serving the card without a signature: #140 has the applicant make its device identity only when it applies. A route that reads the database for anyone, with no limit of its own, is a question of cost and abuse that #140 can settle when it builds the applicant's side.

## Decision

On the API:

- The phone makes the code and the secret. It creates the invite with `PUT /groups/<group ID>/invites/<code>`, whose body is the card and the cursor the card is labelled with. The API sets the expiry, seven days from its own time, and answers with it.
- The same request for a code that is the group's active invite replaces the card when its cursor is not lower than the one stored, never moves the expiry, and answers the same. So a retry is safe, and it is also how a card is kept up to date.
- A code is used once. A code the API has seen that is not the group's active invite is refused as naming no invite, whether it expired, was revoked, or belongs to another group. A code it has not seen is refused while the group has another active invite.
- `DELETE /groups/<group ID>/invites/<code>` revokes that invite and nothing else, deletes its card, and answers the same whatever the code names.
- `GET /invites/<code>` gives any registered device the expiry and the card of an active invite, and one refusal for every other code. It is a signed request like every route that is not declared public (ADR-0022).
- A device that is no member device of the group is refused before the API looks at any invite, as the event API does.

On the phone:

- An invite is a record of the shared ledger, of a kind of its own: its ID is the code, and its one unit holds the secret and the expiry. Revoking is the record's permanent deletion, which beats every change whatever the stamps (ADR-0016). The phone writes either event only after the API has answered, in the transaction that stores or removes the invite.
- Before it sends the request that creates an invite, the phone stores the code and the secret, and drops them only in the transaction that stores the invite, or when the API refuses. With no answer, or with an invite the phone could not store, the next attempt sends the same ones.
- Invite shows the invite the phone holds without asking the API. When it holds more than one that has not expired, it shows the one that expires last.
- A group prepares one invite at a time. A phone replaces the card when the group's name or its members change on it while it holds an active invite, unless the new card would be over the limit, labelled with its cursor in the group, which is 0 until the sync loop gives it one (#135).
- The group's key for epoch 1 is made on the phone at the first Invite and kept in the secure store under an entry that names the group and the epoch.
- The app reads the API's address from `EXPO_PUBLIC_API_URL`, set when it is built. The invite link's host is that address's host (ADR-0023).

## Consequences

- #140 reads the card with a route that exists, and decides whether an applicant registers before it reads or the route becomes public. #141 finds the secret on every member's phone.
- A phone that has not synced can show a link another member revoked, or be told that another member already has one. Both end with its next sync.
- A lost answer, a failed write and an app that stops between the API's answer and the phone's own transaction all leave the stored code and secret in place, so the next attempt gets the same invite. An invite can still be left on the API with no phone showing it when a phone's local data is replaced in between, by an import or a restore. The group then cannot make another for up to seven days.
- Records of expired invites and the tombstones of revoked ones stay in the group, a few hundred bytes each. A snapshot carries only the active invite (ADR-0016, #139).
- The API keeps a row for every code it has seen, so that none is used twice, until #155 decides how long.
- A card's cursor decides between phones that have downloaded different amounts. Two phones at the same cursor replace each other's cards, and the next change puts that right.
- The event format gains a record kind. Nothing has been released, so format version 1 takes it (ADR-0016).
- Each build talks to one environment's API. A build with no address cannot invite, and says so as it does with no network.
- A device can still create any number of groups, each with an invite (#159).
