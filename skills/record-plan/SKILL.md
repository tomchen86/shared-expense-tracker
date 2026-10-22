---
name: record-plan
description: Record the outcome of a planning discussion as a proposal plus roadmap update, or change the plan for phases that have not started. Use when the owner wants a discussion about future phases written down, or a Next or Later phase redesigned.
---

# Record a plan

A proposal is future tense: decided direction for work not started yet. It is not current behavior and not a work order.

## Steps

1. Copy `docs/proposals/template.md` to `docs/proposals/YYYY-MM-DD-<topic>.md`.
2. Fill it from the discussion:
   - One section per phase under Phases, each ending with its validation question: what must be true before moving on.
   - Principles every phase must follow once it starts.
   - Not doing.
   - Everything undecided goes under Open questions. Nothing outside that section may be tentative.
3. In the same PR, update `docs/roadmap.md`: one line per phase in Now, Next, or Later, saying why it sits there and linking its section of the proposal. Add Not doing items that constrain work today.
4. Open the PR. The owner accepts the whole proposal by merging; anything the owner rejects is removed or moved to Not doing before the merge.

## Changing a plan

- A phase that has not started: write a new proposal that supersedes the old one. In the old proposal change only the Status line, to `Superseded by <new file>`. Point the roadmap links at the new proposal.
- Work already in Now, before specs or acceptance tests exist: update the affected issue.
- Specs or acceptance tests drafted but not approved: update the issue and have the spec author revise them in the draft PR, following `skills/write-spec/SKILL.md` for approval.
- Specs already approved: once the owner confirms the new behavior, update the issue and have the spec author update the specs and acceptance tests on `spec/<branch>`. The implementer merges that update before continuing affected work.

## Never

- Edit an accepted proposal beyond its Status line.
- Open issues for Next or Later phases.
- Put status, dates, or progress in a proposal or the roadmap.
- Put future principles into `docs/architecture.md` or the specs. Those describe the system as it is now.
