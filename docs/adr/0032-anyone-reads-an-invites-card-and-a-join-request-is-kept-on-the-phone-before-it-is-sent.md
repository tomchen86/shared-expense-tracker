# ADR-0032: Anyone reads an invite's card, and a join request is kept on the phone before it is sent

- Date: 2026-11-23
- Status: Accepted

## Context

ADR-0015 decides what a join request is: the applicant's name, its choice of member, its user ID and its X25519 public key, encrypted with a key derived from the secret after the `#` of the invite link, so that the API cannot read it or swap the key. ADR-0026 gives the API a route that serves an invite's card to any registered device, and leaves to #140 whether an applicant registers before it reads the card or the route becomes public. #140 is the first issue to build the applicant's side: opening a link, seeing the group, choosing a member, sending the request and waiting. Its acceptance criteria have the phone make its device identity when the user sends, and leave no data behind when a link cannot be used. The earlier decisions leave open:

- Whether reading a card needs a device identity.
- Which requests carry a join request, what the API keeps of it, and how many an invite takes.
- What ties a request to the device that sent it, when the API relays it to the members.
- Where the box key of ADR-0015 comes from. ADR-0022 leaves it to the first issue that uses it.
- What the applicant's phone holds while it waits, and what happens when the answer to its request is lost.
- How a phone knows it already belongs to the group of a link. The card carries no group ID, and the API's answer does not either (ADR-0026).
- What a full group means for an applicant. The limit of 20 counts members, and an applicant who picks a member that is already in the group adds none.
- How to keep an applicant from becoming a second member with the name of one who has no phone yet (#132, #184).

Also considered:

- Registering the phone when it opens a link, and keeping the read a signed request: no route changes, but tapping a link would create an identity and register it with the API before the person has decided anything, and a link that has expired would leave that identity behind. The API would also learn which device looked at which invite.
- A limit of its own for the public read, by IP: every read would then write to the database. A request with four well-formed fields already costs a read of the device's key before it is refused, so a public read by primary key adds no new kind of load.
- Sending the request first and storing it once the API has answered: if the answer is lost and the person gives up, the API holds a request that no phone knows of. A member who approves it would hand the group's key to a phone that is not waiting, and the chosen member would count as having a phone.
- Putting the group ID in the card, to tell a member's phone from an applicant's: it changes a format that member IDs in the card already make unnecessary.
- Letting the API say that a device is a member and name the group: a phone whose local data lacks the group cannot open it anyway.
- Refusing every applicant once the card lists 20 members: a full group could never get its members without a phone onto their own phones.
- Keeping a request after its invite expired, until someone answers it: a second lifetime to explain, for the half day it would save.
- Checking the request's state from the applicant's phone, and sending an unsent request again when the app opens: both belong with learning the answer, which #141 builds.

## Decision

On the API:

- `GET /invites/<code>` is a public route, which supersedes ADR-0026's decision that it is a signed request. It takes no signature, ignores one that is sent, counts towards no device's limit, and changes nothing in the database. It answers as before: the expiry and the card of an active invite, and one refusal for every other code.
- A join request belongs to an invite and a device. `PUT /invites/<code>/request` stores the request of the device that signed it, or replaces the content of the one it has, so a retry is safe. `DELETE /invites/<code>/request` removes it, and answers the same when there is none.
- The API keeps the invite's code, the device ID, the time and the content, which it cannot read: 41 to 65,536 bytes, as an event or a card.
- An invite has requests only while it is active. Revoking an invite deletes its requests. An expired invite's requests no longer count, and how long their rows stay is for #155.
- An invite holds at most 20 requests, the number of members a group can have. A device that is a member device of the invite's group is refused, with a reason of its own.
- A refusal names the first of: the checks every signed request passes (ADR-0022), how the request is written, no such invite, already a member, too many requests.

On the phone:

- A link is usable only when its code is 16 bytes and its secret 32 bytes in base64url. Anything else is refused before any request is sent.
- The phone reads an invite from the API its build names (ADR-0026), whatever host the link has, without an identity.
- A phone already belongs to a link's group when it holds an invite with the same code and secret, which needs no network, or when a member ID on the card is one of a shared ledger it holds. It then opens that group instead of asking to join.
- The request key is derived from the secret with HKDF, as the card key is, with the purpose `shared-expense/invite/request/v1`. The associated data is that purpose, the code and the applicant's device ID, each on its own line, so a request moved to another invite or another device does not open.
- The request's plaintext is JSON with the name, the chosen member's ID or `null` for a new member, the phone's user ID, and the box key in hexadecimal, followed by spaces up to a multiple of 256 bytes.
- The box key is an X25519 key derived from the device seed with the purpose `shared-expense/device/box/v1`.
- The phone makes its identity, then stores the request in its local data, then sends it. The request stays there, marked as not sent, until the API has confirmed it or has refused it in a way that sending it again cannot cure: for a reason of the request API's own, or because its body is too large. Sending it again is the person's step: the app does not retry by itself.
- Cancelling asks the API first, also for a request the API never confirmed, and removes the local request only once the API has answered.
- With 20 or more members on the card, an applicant can only pick a member without a phone. With none of those either, the group is full.
- The form preselects a member without a phone whose name is the applicant's, and does not send a request for a new member whose name is a member's.
- Each request of joining is given up after 60 seconds, as ADR-0027 does for a sync's.

## Consequences

- Tapping a link makes one request and leaves nothing on the phone or on the API. The first identity is made when the person sends a request, as the proposal says.
- Anyone who has a code can fetch the encrypted card, as any registered device could before, and learns its size and when the invite expires. Without the secret the card does not open.
- The API learns that a device asked to join a group and when, before any member has approved. It learns a request's length only in steps of 256 bytes: without the padding, the length would give away how long the name is and, for a name of up to 34 bytes, whether the applicant asked for a new member or picked one, since `null` and a member's ID differ by 34 bytes.
- A phone that holds a request the API never received shows it as not sent until the person tries again or cancels. A request the API received and the phone thinks unsent is confirmed by the next try, and removed by a cancel.
- Cancelling needs the network. A phone that has lost its authorization (ADR-0022) removes its own request without asking.
- An applicant's phone does not learn that its invite was revoked or expired, or that a member answered, until #141 builds how it asks. Until then a request waits until the person cancels it.
- A card can be older than the group. An applicant can pick a member who has got a phone since, or apply to a group that has filled up. The approving phone has the last word (#141).
- A request names a member by ID, so taking over a member who has a phone (#144) needs no new field, only a form that lets the person pick one.
- Filling an invite's 20 requests takes 20 registered devices and the invite's code, not its secret: the API cannot read a request, so it takes 41 random bytes as one. The code is in the link's path, which reaches whoever serves or fetches the link without what follows the `#`: this API's download page, and a chat app's servers when they fetch a link preview. Applicants are then refused until a member clears those requests or revokes the invite, and a new invite starts empty. Members see requests that do not open, which #141 has to let them tell apart and clear. Making a request prove that its sender holds the secret would need the invite to carry a second value derived from it, which changes how an invite is created (ADR-0026); it is left out.
- The pending request is local data, so an export carries it, with the secret of the invite it used. An export already carries the secrets of the invites of the phone's own groups.
- #141 reads the requests of a group and answers them: those routes, and the handover salt of ADR-0015, are its to define.
- The flow that checks that a link's secret reaches the app (ADR-0008) now tells it from what Join Group shows: a whole link goes on to read the invite, and half a link is refused. It relies on the E2E build naming no API. When that build names one (#221), the flow needs an invite that exists.
