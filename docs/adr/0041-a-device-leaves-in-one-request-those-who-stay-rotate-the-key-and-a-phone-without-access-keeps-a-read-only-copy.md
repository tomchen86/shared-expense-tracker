# ADR-0041: A device leaves in one request, those who stay rotate the key, and a phone without access keeps a read-only copy

- Date: 2026-11-24
- Status: Accepted

## Context

ADR-0015 decides that a group's key changes whenever a device loses access: removing a device is one request that carries the membership revision, the new epoch, a box for each device that stays and the events that say what changed; leaving is one request that carries events under the current key and marks the group as needing rotation; a box waits on the server for at most 30 days, after which a returning phone asks a phone on its old roster for another; and losing access revokes the group's invite. ADR-0027 leaves to #143 the check of a key before it is saved and the refusal of an event in a lower epoch than one already applied. #143 is the first issue to take a device out of a group. Since ADR-0015, three decisions changed what it has to fit:

- ADR-0039 made the roster a record of the ledger whose format version 1 has no delete, wrote approvals without a membership revision, and left a member who has a phone impossible to remove.
- ADR-0033 and ADR-0034 clear a group's events and bring a phone that is behind them back from a snapshot. ADR-0034 leaves two things here: how the key of a newer epoch reaches a phone that was away, and that a phone which is itself behind the cleared events has to be able to remove a device, because removing is the only way a person says a phone will not come back.
- ADR-0039 keeps a handover for a device that was approved and has not joined. Its box holds the keys up to the approval's epoch, and a snapshot made for that device after a rotation is under a newer one.

The earlier decisions leave open:

- What a removed device's roster entry becomes, and when the member behind it stops being a member.
- What stands in for the membership revision, which no request carries.
- Whether a leaving phone can always leave: it may lack the current key, and its group may be full (ADR-0024).
- How a phone that stays learns that the group needs a new key, with no push and no polling.
- How a phone trusts a box from a device that joined while it was away, whose roster entry it never applied.
- What a phone does when the API tells it that it is no member device, and what "authorization lapsed" (ADR-0015) means for the shared ledgers on that phone.
- Who revokes the invite, the API in the removal's transaction or a phone.

The owner decided on 2026-11-18 that a copy stays read-only, that leaving needs no settling up, and that a group has no "ended" state (#143). What a copy can do afterwards, being deleted or replaced when its phone joins again, and what an import does with a shared ledger, are a separate issue.

Also considered:

- A delete for roster entries, as invites have: a tombstone beats every later change (ADR-0016), so a device that joins again could never get an entry back, and ADR-0015 has every join write one.
- A second unit on the roster entry, or a record of its own that says a device left: an entry that names nobody says the same in the unit that already exists, and a later join overwrites it by the stamp.
- A counter on the API as the membership revision, with a request to read it: every change of membership is already visible in the list of member devices and the epoch. A request that names every device that stays, under the next epoch, is refused exactly when either changed.
- Requiring the removing phone's cursor to be the group's last number, as an approval does (ADR-0039): a phone behind the cleared events can never reach it, and that phone is the one ADR-0034 needs to be able to remove a device.
- A request that lists the member devices, asked before every removal: the phone's roster names them once it has synced, and the API's refusal carries the list in the one case where they differ.
- Leaving with events under the current key, as ADR-0015 wrote: a phone that lacks that key, or whose group is full, could not leave, and a second path would be needed for it. The phone that rotates has to reconcile its roster with the API's devices anyway, for a leave whose events never arrived.
- Telling phones that a rotation is due in a header of every page, or by an event the leaving phone writes: the first needs every answer to carry it, the second is not there when the leaving phone could not write it.
- Refusing every download while a rotation is due: a phone that is behind could not fetch the roster entries it needs to make the boxes, and a group whose only caught-up phone had left would stop for good.
- Rotating only when a phone next uploads or approves: until then the others would go on seeing the person who left as a member with a phone.
- Keeping a box for 30 days and having a returning phone ask a phone on its old roster for another (ADR-0015): one more request and one more answer for members to give, and a phone whose old roster is gone could not come back at all. A box is about 150 bytes.
- Accepting a box only from a device on the receiver's roster (ADR-0015): a phone that was away, or one that has not joined yet, does not hold the entry of a device that joined meanwhile.
- One box that carries every epoch's key, replaced at each rotation: the sender cannot know which epochs a receiver holds, and a receiver could not check a box with a key it has.
- Having the API revoke the invite in the transaction that removes a device: the phones hold the invite as a record (ADR-0026), and an invite the API revoked while a phone still shows it leaves a dead link that nothing deletes. A phone whose answer was lost would not know what was revoked.
- Deleting the group's data from a phone that lost access: the owner decided the copy stays, and the phone may hold changes it never sent.
- Treating a copy as an archived group that cannot be restored: it would move to Archived Groups in Settings, and the person would find the group gone with nothing said.

## Decision

The roster and the member:

- A roster entry's one unit holds a member, a user ID and a public key, or says that the device represents nobody. A device that leaves gets that value, by an ordinary event with a base, and a device that joins again gets a member back by a later one. Format version 1 takes the value, since nothing has been released (ADR-0016).
- A member is represented by another device when another device's entry names it, whatever user ID that entry carries. Such a member, and the member that is you, stay members whatever their "removed" unit says (ADR-0016). Once every entry that named a member names nobody, the unit decides again. This replaces "stores a user ID" where ADR-0039 used it for that rule, so two phones that share a user ID reach the same members.
- Removing a member who is represented by other devices removes those devices. The phone that rotates writes, for each device that leaves, the entry that names nobody, and for each member no staying device represents, "removed". The member is then a former member like one removed without a phone: nothing else is shown about who left or who removed whom.

Removing and rotating, on the API:

- One request, `POST /groups/<group ID>/rotation`, in one transaction under the group's lock. It carries the next epoch, the devices to remove, the sender's public key, one box for every device that stays, the sender included, and events encrypted under the new key. The API takes the devices off with their progress, snapshots, boxes and handovers, moves to the new epoch, stores the boxes, and stores the events as an upload under that epoch.
- The API refuses it unless the boxes name exactly the member devices that stay, and the answer lists the group's member devices. It refuses any epoch but the next. Together these are the membership revision of ADR-0015: a device that was approved, left or was removed since the phone looked makes the request fail, and two phones that rotate at once cannot both succeed.
- The request carries no cursor. A phone that is behind, also behind the cleared events, can remove a device.
- A request with no device to remove is accepted only while the group needs a rotation.
- A device that is no member device any more is refused on every route of the group, in the same way as a device that never was one (ADR-0024). It keeps its identity, and can ask to join again.

Leaving:

- One request, `POST /groups/<group ID>/leave`, with no content. The API takes the device off at once and marks the group as needing a rotation. Nothing can stop it: not the key epoch, not a full group, not the device's progress. This replaces ADR-0015's events under the current key.
- When the last member device leaves, the API deletes the group and everything it stores for it, except that the codes of its invites stay used (ADR-0033). The group's ID is then free, as before the group was created.
- While a group needs a rotation the API refuses, with the list of its member devices, an upload of new events, an approval, and a download whose cursor is the group's last number. A download from behind that number gets its page. So a phone that is behind catches up first, and the first phone that syncs while caught up is told to rotate. Nothing new is ever stored under the key the leaving phone knows.
- That phone rotates with the request above and no device to remove. Its events say who left: every device on its roster that the API no longer lists.

Boxes:

- A rotation's box is the box of ADR-0015 from the sender's X25519 key to the receiver's key on the roster. Its salt is derived from the group key of the epoch before, with the purpose `shared-expense/group-key/rotation/v1`, and its context names the group, the receiver and the new epoch. It holds the new epoch's key.
- A phone that opens a box therefore knows that the sender held the previous key, which only a member device of that epoch did, and that the box was made for this group, this device and this epoch. It needs no roster entry of the sender. This replaces ADR-0015's rule that a phone accepts a box only from a device on its roster; a phone still sends boxes only to devices on its roster.
- The sender boxes the key for itself as well. A phone whose answer was lost, or that could not save the key, gets it back the way every other phone does, and keeps nothing between the request and the answer.
- The API keeps a box until its device asks for the keys after an epoch at or past the box's, or stops being a member device. No time limit applies, and the cleanup (ADR-0033) does not take boxes. This replaces ADR-0015's 30 days and the request to a phone on the old roster.
- A phone asks with `GET /groups/<group ID>/keys?after=<epoch>`, naming the highest epoch it has saved a key for. It opens the boxes in order, each with the key before it, and saves each through the `sync` capability (ADR-0027). It asks after a sync that stopped at an event in an epoch it has no key for, after an upload refused for its epoch, and after a rotation of its own that was refused for its epoch; then it syncs again.
- Before it saves a key it has stopped for, the phone checks that the key decrypts the event it stopped at. A wrong key would make it pass every event of that epoch as empty (ADR-0027), and it would not get them back.
- A phone that was approved and has not joined asks for the keys after the last epoch in its handover when its snapshot is under a newer one, and opens them starting from the handover's key. Its handover stays as ADR-0039 made it.

What a phone refuses:

- An event in a lower epoch than the highest one among the events the phone has stored pages of is not applied, and is recorded as refused. The API takes uploads only in the current epoch and epochs only go up, so an API that follows the protocol never sends one.

Invites:

- The API revokes nothing when a device leaves. After each sync whose download finished, a phone revokes every invite it holds that was created before the stamp of a roster entry that names nobody: the device that left knows that link. It deletes the invite and writes the event when the API answers that it is revoked or that there is no such invite, so the first phone to ask wins and the others agree. This replaces ADR-0015's "also revokes" by the phones doing it.

A phone that lost access:

- A shared ledger becomes a read-only copy on a phone in three ways: a download or an upload of its sync is refused because the phone is no member device; the person leaves; or the phone's authorization has lapsed (ADR-0015). Nothing turns a copy back.
- A copy keeps its records, its cursor and its unsent events, sends no request and takes no change. The phone deletes the group's keys from its secure store (ADR-0015). The reason is kept with it, and an export carries both (ADR-0020).
- A copy stays where its group was, on the Groups screen or among the archived groups. Its screens are the read-only screens of an archived group without the way back, with a line that says why and how many changes were never sent.

## Consequences

- Removing a member who has a phone, leaving, and the rotation after a leave need the server (ADR-0015). Removing a member with no phone stays local.
- The API learns which devices were removed and which left, when, and which device rotated. It sees no member, no name and no key. A box's length is fixed, so it says nothing.
- A phone that removes a device while behind writes its events from what it holds. They are stamped like any change and merge the same way (ADR-0016).
- Until a caught-up phone of those who stay syncs, the group takes no uploads and no approvals, and the others still see the person who left. With one staying phone that never opens the app, the group waits for it; removing that device from another phone rotates as well.
- A phone can only rotate when its roster names every device that stays. A device the API lists and the roster does not, which takes an approval whose events no phone applied, leaves the rotation to a phone that has the entry; if none has, the group cannot rotate until that device is removed, which needs no box for it.
- A removal whose answer was lost shows as failed. The next sync fetches the phone's own box and applies its own events, and the member is gone.
- A box that was never fetched stays for as long as its device is a member device: about 150 bytes for each rotation it missed. #234 can add a limit; a device that then has no box can only come back through a new invite.
- A phone that holds a wrong key for an epoch it did not stop at, because it fetched the key after an upload was refused, is not caught by the check. It takes a sender that sealed a key it did not use.
- An invite created after a device left and stamped before the event that says so is revoked with the older ones. The person who shared it makes another.
- Between a device leaving and a phone's next sync the invite still works: the device that left can read its card and ask to join, and a member would have to approve.
- A phone learns that it was removed at its next sync. Until then it shows the ledger as it was and records changes that will never be sent; the copy keeps them and says how many.
- A phone whose authorization lapsed, such as one that imported another phone's export file (ADR-0025), shows every shared ledger as a copy. It is still a member device on the API, which cannot know; another member removes it.
- A copy cannot be deleted, and its phone cannot join the group again while it holds the copy (ADR-0039). The issue that follows #143 decides both, and what an import does with a shared ledger on a phone that still has its keys.
- ADR-0034's snapshot for a phone that is behind is under the current epoch. A phone that lacks that key asks for its boxes as above; the spec that lands second adds the sentence.
- #144 replaces a device's roster entry in an approval and has the old device removed; it can use the rotation request. #145 moves a membership to a new device and has to say what the old device's entry becomes.
- The API gains two refusals of its own, the list of member devices in two answers, and one more reason for which a download is no page. A phone built from main takes that answer for no page (ADR-0027) and never rotates; no release exists.
- The paths this adds on the phone, in the API and in `packages/domain` are offline sync, and get branch coverage thresholds as they are added (`AGENTS.md` rule 8).
