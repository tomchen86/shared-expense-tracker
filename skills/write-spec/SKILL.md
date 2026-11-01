---
name: write-spec
description: Turn an issue's acceptance criteria into spec requirements and failing tests before anyone implements it. Use when starting work on an issue as the spec author.
---

# Write the spec

Format, IDs, EARS sentences, and how tests cite requirements: `docs/specs/README.md`.

## Steps

1. If `gh issue view <N> --json blockedBy` lists an open issue, stop and tell the owner. Otherwise: `gh issue develop <N> --checkout`. Then confirm that no `spec/<branch>` is left over from an earlier PR with the same branch name: `git ls-remote --exit-code origin refs/heads/spec/<branch>` must exit with 2 (no such branch). If it finds one, stop and tell the owner: the implementer would take it as this PR's approved spec.
2. Edit every capability the issue touches (`docs/specs/<capability>/spec.md`):
   - New behavior: a new requirement with the next unused number.
   - Changed meaning: bump the version (`LEDGER-2.1` → `LEDGER-2.2`) and update every test that cites it.
   - Removed behavior: delete the requirement and every test that cites it.
   - Bug (the code breaks a requirement that already exists): leave the spec as is, and add a failing test that cites the existing ID and reproduces the bug. If the bug shows the spec itself is wrong, it is changed meaning instead.
   - Name the component ("the API", "the mobile app"), not "the system".
3. Write failing tests that cite the IDs, in the acceptance test paths (`AGENTS.md`). Cover the edge cases where implementers would otherwise invent rules: uneven division, empty, zero, limits, duplicates. Test through the component's public boundary (HTTP route, CLI, exported API), never its internals; if that boundary does not exist yet, add the smallest stub that lets the suite build. A red test fails on its assertion, not at compile time: otherwise `check.sh` stops before any test runs and the trace check lists every requirement as untested.

   What only the native views show (a native control, a gesture, the keyboard, `expo-sqlite` itself) gets a Maestro flow in `apps/mobile/tests/acceptance/e2e/` that cites the ID in its `name` (ADR-0008); if Jest cannot check the requirement at all, mark it `(e2e)` (`docs/specs/README.md`). The flow finds elements only by the text and accessibility labels its requirements state, so the implementer can make it pass without editing it. Run it on a debug build of the current code (`AGENTS.md`, Commands) and confirm it fails at the step the missing behavior should make pass, not earlier.
4. Architecture-level choice: write an ADR.
5. Run `bash scripts/check.sh`. Its requirement trace lists the new IDs as untested until the implementation makes their tests pass, and lists `(e2e)` IDs apart, since only a run of the flows checks them; anything else the trace reports is a mistake to fix now.
6. Commit. Write the PR body into a file from `.github/pull_request_template.md` (`gh` skips the template when given a body): fill `Closes #<N>` and Requirements, and leave the implementer's sections. Then open the draft PR: `gh pr create --draft --title "<title>" --body-file <file> --label enhancement` (or `--label bug`).
7. Ask the owner to review the spec diff in the draft PR, name the commit you are asking about (`git rev-parse HEAD`), and wait. If they want changes, revise the spec and the tests first.
8. The owner approves by publishing exactly that commit as the approved spec. Give them the command to run in this repository, `git push owner <approved SHA>:refs/heads/spec/<branch>`, and wait until `git ls-remote --exit-code origin refs/heads/spec/<branch>` finds it. Then hand off the branch name. Fetch the exact branches with `git fetch --no-tags origin +refs/heads/main:refs/remotes/origin/main +refs/heads/spec/<branch>:refs/remotes/origin/spec/<branch>`; proceed only if it succeeds. The work order is `git diff refs/remotes/origin/main...refs/remotes/origin/spec/<branch>`, not the issue text.

## Answering the implementer

When the implementer asks about behavior the spec does not cover: decide it with the owner, then commit the requirement and a failing test on top of `spec/<branch>`, and have the owner publish that commit. Never commit them on the PR branch: it now carries the implementer's commits.

```bash
git fetch --no-tags origin refs/heads/spec/<branch> && git switch --detach FETCH_HEAD
# edit the spec and the acceptance tests, commit; then the owner runs, in this repository:
git push owner <commit SHA>:refs/heads/spec/<branch>
```

The implementer takes your commit with `git fetch --no-tags origin refs/heads/spec/<branch> && git merge FETCH_HEAD`.

Independent changes on main are combined automatically during review, and a conflict only in code is the implementer's to settle. If the approved version conflicts with main in the specs or acceptance tests, check it out as above, run `git fetch --no-tags origin refs/heads/main && git merge FETCH_HEAD`, settle the conflict with the owner, and have the owner publish the result as above. The implementer then merges your update.

## Never

- Put behavior this issue does not build into the specs.
- Implement the task in the same session. The implementer is a separate session.
