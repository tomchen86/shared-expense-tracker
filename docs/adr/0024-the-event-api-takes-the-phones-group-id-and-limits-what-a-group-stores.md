# ADR-0024: The event API takes the phone's group ID and limits what a group stores

- Date: 2026-11-20
- Status: Accepted

## Context

ADR-0003 makes the API a relay for each shared ledger's events. ADR-0016 decides what the API sees of an event, how it numbers a group's events, and how a phone downloads them by cursor. #134 is the first issue to build the relay, and #135, #138 and #139 build on its routes. ADR-0016 leaves open:

- Who names a group on the API, and what happens when a request to create one arrives twice, or for an ID that is taken.
- What a phone that is no member of a group is told.
- What an upload does when only some of its events are new, or when one of them is wrong.
- How many events one upload may carry, how large a page is, and how much a group may store. The proposal limits an event to 64 KB and a device to 60 requests a minute, which alone lets one phone store about 165 GB in a group in 30 days. On the free plans, a Worker has 10 ms of CPU for a request (ADR-0007), and as of 2026-11 Neon stores 1 GB for a project and then refuses the writes that add to it.
- What the API records as a phone's progress when the phone sends a cursor lower than its last one.
- How a refusal by a route relates to the checks every request passes first (ADR-0022).

The owner decided the three sizes on 2026-11-20, that #134 adds no limit on how many groups a device creates (recorded on #159), and, after the spec review, that an event's content is at least 41 bytes.

Also considered:

- A group ID the API hands out: creating a group again after a lost answer would make a second group, and every phone would keep another ID for each ledger beside the one its events already carry.
- Telling a non-member that a group does not exist, apart from telling it that it is no member: anyone could test which group IDs exist.
- Storing the new events of an upload that fit and refusing the rest: the phone would have to work out from the answer which events to send again.
- Content as Base64, a third smaller than hexadecimal: every other byte string on this wire is hexadecimal, PostgreSQL's Base64 breaks its output into lines, and at about 620 bytes an event (ADR-0015) the difference does not decide how many requests a sync takes.
- A group limit of 100 MB, as #134 first proposed: ten full groups would fill the database, and a test cannot fill 100 MB through the API at a reasonable cost.
- Content of any length from one byte: the limit counts content, so a group of one-byte events is 10,485,760 rows, which with what each row and its index entries take is an estimated 1.5 to 2 GB.
- Keeping the highest cursor a phone has sent as its progress: a phone whose data went back, after an import or a restore, would have the events it needs again cleared under it (#155).

## Decision

- A phone creates a group with `PUT /groups/<group ID>`, under the ID the group has on the phone, which its events and their associated data already carry (ADR-0015). The request has no body, so it can carry no name. The device becomes the group's only member device, and the key epoch is 1. A member device that asks again gets the same answer and nothing changes, so a retry is safe. A device that is no member device is refused.
- An upload or a download from a device that is no member device of the group is refused in one way, whether the group exists or not. Creating a group cannot hide that: an ID that is taken is refused, and a free one becomes a group.
- An upload is one transaction under the group's lock (ADR-0016): every new event of it is stored, or none. An event ID the group has is answered with its number and otherwise ignored, whatever content, key epoch or device it comes with. An upload with nothing new is therefore never refused for its key epoch or for room.
- An event's content is 41 to 65,536 bytes (ADR-0021), written in the JSON bodies as lowercase hexadecimal. The API measures bytes. 41 bytes are what encryption adds to any plaintext: the format version byte, the nonce and the tag (ADR-0015). Nothing shorter is an encrypted event, and the API still reads nothing of the content.
- One upload carries at most 100 events. A page holds at most 100 events and at most 262,144 bytes of content, which the largest event fits four times, and says whether more follow.
- The events a group has stored add up to at most 10,485,760 bytes (10 MiB) of content. An upload that would go past that is refused with a reason of its own, so that the phone can say why. Only content counts, not what a row takes besides.
- A download records the cursor it carries and the API's time as that device's progress in the group, in place of what was recorded, also when the cursor is lower. A cursor past the last sequence number the group has given is refused: a phone that follows the protocol never has one.
- The answer to a download says `Cache-Control: no-store`. A phone that is up to date asks for the same URL every time, and a stored answer would tell it nothing is new.
- The event API is these three requests. Another method on one of their paths, `HEAD` included, has no route. A create or an upload whose URL carries a query is refused as written wrongly, as a download with a wrong query is: a phone that put a name there would otherwise take it for sent (owner, 2026-11-20, on the implementer's question).
- These routes run after the checks of ADR-0022. A request one of them refuses was accepted as a request: its nonce is used, and it counts towards the device's limit. What a route refuses leaves every group as it was.
- A request that is written wrongly is refused before the API looks at membership, and membership comes before whatever depends on the group's state, so a non-member learns nothing about a group.
- The bodies, the limits, these refusals with their statuses, and the functions that check an upload and each answer are defined once, in `packages/domain`'s API entry (ADR-0007).
- Until a route lets a second device into a group (#141), acceptance tests add one through a function in the API's test support, which the implementer of #134 writes against the tables it adds.

## Consequences

- #135 uploads in batches of at most 100 events, and each request's body also has to fit the limit #205 sets.
- #138 creates the group under the phone's group ID, and can send the request again when no answer came.
- A group at its limit takes no new event until some are cleared (#155). Until #155 exists nothing clears them, so the limit is all a group can ever upload. Raising the limit later needs nothing else; lowering it leaves groups over it.
- Hexadecimal doubles what content takes in a body: a page of the largest events is about 525 KB, and seven of them fit an upload of 1 MiB.
- The limit holds one group, not one device: a device can create any number of groups (#159).
- With the smallest content a full group is about 256,000 rows, an estimated 50 to 60 MB with what the rows themselves take.
- Whoever knows a group's ID before its phone creates the group, such as someone holding an export file (ADR-0020), can create it first. The phone is then refused as no member device, and the group cannot become a shared ledger under that ID. A group ID is a random UUID, which nobody guesses: this needs the ID itself. What the app says then is for #138's spec.
- A phone that sends a lower cursor keeps the events after it from being cleared, for as long as #155 lets an event stay.
- A member device can take another member's event ID before that member uploads it only by guessing a random UUID. That member's event is then answered as stored and never is.
- The test-support function goes once #141's route does what it does.
