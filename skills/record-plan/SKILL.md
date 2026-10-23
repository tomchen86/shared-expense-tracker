---
name: record-plan
description: Record the outcome of a planning discussion as one proposal per phase plus a roadmap update, or change the plan for phases that have not started. Use when the owner wants a discussion about future phases written down or a Next or Later phase redesigned, or when a phase about to start has no proposal.
---

# Record a plan

A proposal is the plan for one phase, written before the phase starts: decided direction for work not started yet. It is not current behavior and not a work order. It also carries the discussion over to the next session or agent.

## Steps

1. For each phase the discussion decided something about, copy `docs/proposals/template.md` to `docs/proposals/YYYY-MM-DD-<phase>.md`. A phase that was only named gets a roadmap line and no proposal.
2. Fill each proposal from the discussion:
   - What the phase delivers, roughly how, and its validation question: what must be true before moving on.
   - Principles code must follow once the phase starts.
   - Not doing.
   - Everything undecided goes under Open questions. Nothing outside that section may be tentative.
3. In the same PR, update `docs/roadmap.md`: one line per phase in Now, Next, or Later, saying why it sits there and linking its proposal if it has one. Add Not doing items that constrain work today.
4. Open the PR. The owner accepts each proposal as a whole by merging; anything the owner rejects is removed or moved to Not doing before the merge.

## Changing a plan

- A phase that has not started: write a new proposal that supersedes the phase's old one. In the old proposal change only the Status line, to `Superseded by <new file>`. Point the phase's roadmap line at the new proposal.
- Work already in Now, before specs or acceptance tests exist: update the affected issue.
- Specs or acceptance tests drafted but not approved: update the issue and have the spec author revise them in the draft PR, following `skills/write-spec/SKILL.md` for approval.
- Specs already approved: once the owner confirms the new behavior, update the issue and have the spec author update the specs and acceptance tests on `spec/<branch>`. The implementer merges that update before continuing affected work.

## Never

- Edit an accepted proposal beyond its Status line.
- Open issues for Next or Later phases.
- Put status, dates, or progress in a proposal or the roadmap.
- Put future principles into `docs/architecture.md` or the specs. Those describe the system as it is now.
