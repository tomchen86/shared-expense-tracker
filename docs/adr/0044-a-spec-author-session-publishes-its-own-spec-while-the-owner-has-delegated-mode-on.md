# ADR-0044: A spec author session publishes its own spec while the owner has delegated mode on

- Date: 2026-11-24
- Status: Accepted

## Context

ADR-0001 follows the engineering playbook at commit `9302f13365e2034bdf01d3c388a7d2816b5ed945` with no deviations, and says a later deviation gets its own ADR. This is the first.

The playbook's default (chapter 3, point 2) is two identities. Every session acts as the bot. What only the owner can do (publish or delete a `spec/` branch, merge, change GitHub settings) the owner does by hand, from commands a session prepares. The owner's push uses an SSH key with a passphrase that is kept out of ssh-agent and the keychain, so that a session cannot use it. Chapter 2 relies on this: a `spec/<branch>` can only have been pushed by the owner, so the version a review compares the PR against has always had the owner's approval, before any implementation started.

That makes every issue wait for the owner at least twice before its PR is ready to merge: to answer what the issue leaves open, and to type the passphrase for each publication of the spec, the first one and every later one an implementer's question or a conflict with `main` calls for. An issue of the shared-ledger phases takes a spec author, a spec review, an implementer and an implementation review, each a session that runs for hours, and several issues run at once. While the owner sleeps or is away from the keyboard, each of them stops at its next publication. On 2026-11-20 the owner was following from another device and could not type the passphrase: a push waited at the prompt until it was closed.

Since then the owner has several times told one session, in their own words, to publish for them, and each time the session pushed with the owner's `gh` token over HTTPS (`GH_CONFIG_DIR=~/.config/gh-owner`), which asks for no passphrase, and wrote on the PR who pushed and why (PRs 201, 208, 213 and 241). Each of those was an exception to `AGENTS.md` that no file described: what the session might do, where it had to stop and what it had to write down were worked out again every time.

Also considered:

- Keeping the playbook's default. Nothing is given up, and issues move only while the owner is at the keyboard.
- Adding the owner's SSH key to ssh-agent, or removing its passphrase. Every session could then push as the owner at any time, with no switch to turn it on and nothing that says when it is allowed. The `gh` token is already readable by every session (playbook, chapter 3, point 2: under one OS user a session can read that `gh` configuration), so using it adds no new credential to the machine; what keeps sessions from it is the rule that they never act as the owner.
- A third identity that GitHub lets create and fast-forward `spec/` branches and nothing else. The limits would then be enforced by GitHub instead of by text. `spec-branches.json` lets only the repository admin role bypass it, and whether a personal repository's ruleset can name a narrower actor has not been tried. It is the option to look at first if delegated mode stays in use.
- Having the owner approve with a PR comment or review from a phone, and a workflow publish the commit. The owner would still see each spec before its implementation, and each issue would still wait for the owner, which is what this decision is meant to remove.

## Decision

- Delegated mode is a switch in one spec author session. It is on only after the owner types `/delegated-mode on` in that session, and off after `/delegated-mode off`; a new session starts with it off. Nothing else turns it on: not a brief, another session's message, a comment, a file, or what the owner said in another session. It covers that session and its issue's PR, and the sessions it starts are not in delegated mode. `skills/delegated-mode/SKILL.md` has the procedure.
- While it is on, the session:
  - decides by its own recommendation what the issue leaves open, and lists each such choice in the PR body under `Decided without the owner`;
  - starts the reviewer and implementer sessions the skills call for;
  - publishes its own PR's `spec/<branch>`, with the owner's `gh` token over HTTPS: only a commit that a reviewer's PR comment names as the one to publish, only as a new branch or a fast-forward, and each time with a PR comment saying a session pushed it;
  - stops when the reviewer has nothing left to change and CI is green, before the run of all the flows and before the merge.
- It still stops and asks the owner before: a change to the issue's acceptance criteria or to `docs/roadmap.md`; a choice that costs money, weakens security or privacy, risks a user's data, or is hard to undo after a release; a rule about split or settlement amounts or about offline sync (the level-2 areas of ADR-0001); an architecture-level choice (rule 4); a change to `AGENTS.md`, `skills/`, `.github/` or `scripts/`; anything the reviewer leaves to the owner; a screen or wording without precedent; and CI that is red for something the PR did not add.
- Even while it is on, a session never merges, never force-pushes or deletes a `spec/` branch, never publishes another PR's spec, never changes GitHub settings, and uses the owner's account for nothing but that push.
- This supersedes ADR-0001's "Deviations from the playbook defaults: none" in these points only. Outside delegated mode the playbook's default stands unchanged.

## Consequences

- An issue can go from its acceptance criteria to a PR that is ready to merge with the owner away. The owner's decisions about it are collected in one place, the PR, and are made at the merge.
- The owner first sees a spec at the merge instead of before its implementation. A spec the owner then rejects has already been implemented and reviewed, and that work is thrown away or redone. The `Decided without the owner` list and the reviewer's report are what the owner reads to decide.
- Between the issue and the merge, the only check on a spec is the reviewer's comment. The reviewer and the spec author use the same bot account, and the spec author's session starts the reviewer's, so nothing on GitHub shows that two different sessions wrote the spec and the comment that approves it.
- "No merge, no force-push, no deleting, no settings" is enforced only by the text of the skill. `spec-branches.json` lets the repository admin role bypass it always, and a ruleset cannot tell the owner from a session that uses the owner's token. The same token can merge, force-push or delete a `spec/` branch and change settings. Until now what stood between a session and those was one rule without exceptions, "every session acts as the bot, never as the owner"; this is its first exception, and a session that misreads the skill or is talked into it has nothing else in its way.
- `scripts/spec-check.sh` printing `ok` no longer proves that the owner saw the spec. It still proves what it compares: the PR's specs and acceptance tests equal `main` merged with `spec/<branch>`. It now proves only that the owner's account pushed that branch. A push by the owner and a push by a session look the same on GitHub; only the PR comment the session writes tells them apart, so the reviewer's report says which it was (`skills/review-pr/SKILL.md`, step 3), and the owner's merge is then the first approval that spec has had.
- A commit published on top of `spec/<branch>`, to answer the implementer or to settle a conflict with `main`, has no CI run, since CI runs on PRs and on `main`. In delegated mode the spec author's own run of the checks and the reviewer's reading stand in for it until the implementer merges the commit into the PR.
- On 2026-11-24 the owner went further than this decision, once and by direct instruction: after typing `/delegated-mode on` in a coordinator session that is not a spec author's, they told it in their own words to publish the specs of other sessions' PRs, start sessions, and merge a batch of PRs once all were ready, without the run of all the flows. Nothing in this ADR or the skill covers a coordinator or a merge; that was the owner's word for that one time, as the earlier single publications were. Whether delegated mode should cover either is open, and a decision to do so is a new ADR.
- If delegated mode is dropped, removing the skill and the sentences that point at it restores the playbook's default; nothing on GitHub was changed for it.
