---
name: start-phase
description: Move a roadmap phase into Now by turning its proposal section into a milestone and parent issues. Use when the owner says a phase starts, or asks to plan the work for the next phase.
---

# Start a phase

## Steps

1. Read the phase's section of its proposal (linked from `docs/roadmap.md`), plus the proposal's Principles and Open questions.
2. Settle the open questions that affect this phase with the owner:
   - Record each answer in the issue it affects.
   - Architecture-level decisions get an ADR (`docs/adr/template.md`).
   - Principles that code written from now on must obey are now present tense: write an ADR and add them to the principles in `docs/architecture.md`.
3. Draft, and show the owner before creating anything:
   - A milestone named after the phase. Its description holds the phase's validation question.
   - One parent issue per feature, shaped like `.github/ISSUE_TEMPLATE/feature.yml`: goal, acceptance criteria as EARS sentences (rough is fine), affected capabilities, out of scope. Split a large feature into sub-issues one level deep, each small enough for its own PR.
   - Which issues cannot start before others are done.
4. After the owner approves, create them:
   - Milestone: `gh api repos/{owner}/{repo}/milestones -f title="<phase>" -f description="<validation question>"`
   - Parent issue: `gh issue create --title "<title>" --body-file <file> --label enhancement --milestone "<phase>"`
   - Sub-issue: the same, plus `--parent <parent number>`.
   - Order: `gh issue edit <N> --add-blocked-by <M>` when N cannot start before M is done.
5. Move the phase's roadmap line to Now and make it link the milestone.

## Closing a phase

When every issue in the phase's milestone is closed:

1. Answer the milestone's validation question with the owner, and write the answer in the PR description of step 3.
2. Close the milestone: `gh api -X PATCH repos/{owner}/{repo}/milestones/<number> -f state=closed`.
3. Open a PR that removes the phase's line from `docs/roadmap.md`. If the answer changes the plan, update the plan as well (record-plan).

## Never

- Create issues for phases that are not moving to Now.
- Edit the proposal. It stays frozen; from now on the issues are the source of truth for this phase.
- Touch the specs. They change when behavior is built (write-spec).
