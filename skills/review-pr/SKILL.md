---
name: review-pr
description: Review a pull request before merge, and merge only the reviewed commit once the owner approves. Use when asked to review or merge a pull request.
---

# Review a pull request

Check the PR out in its own worktree so your other work stays untouched: `git worktree add --detach ../review-<N>`, then run `gh pr checkout <N> --detach` inside it.

Take one PR at a time through the final stretch (update, check, report, merge). Each merge leaves every other open PR behind main, and a review finished before that merge has to be redone on the updated head. Other PRs can keep being implemented meanwhile.

## Checklist

1. The PR is marked ready (not a draft) and up to date with main. If it is behind, run `gh pr update-branch <N>` and refresh this worktree with `gh pr checkout <N> --detach`; send conflicts in specs or acceptance tests to the spec author, and code conflicts to the implementer. Wait for CI on the updated head: `gh pr checks <N> --watch --fail-fast`.
2. The description has `Closes #<N>` or `No issue: <reason>`, every template section is filled, and it describes the final diff without the template's comments: it becomes the squash commit's message.
3. The specs and acceptance tests are the ones the owner approved. With Git 2.43+, inside the PR's worktree, run main's copy of the check. Never take the script from the worktree's own files: the PR can edit them.

   ```bash
   f=$(mktemp) && git fetch -q --no-tags origin refs/heads/main && git show FETCH_HEAD:scripts/spec-check.sh > "$f" && bash "$f" <branch>
   ```

   It passes only when it exits successfully and prints an `ok` line; keep that line, including main's SHA, for your report. Differences in specs or acceptance tests go to the spec author. A PR that changes specs or acceptance tests without changing what they require (`AGENTS.md`, Roles) has no `spec/<branch>`, so this step flags those files. List them in your report as changes the owner's merge will approve, and confirm that every acceptance test kept its cases, assertions, and IDs.
4. Spec, code, and tests say the same thing, and every test that cites a requirement actually checks it. No test outside the acceptance test paths cites an ID: the implementer's own tests are not evidence for a requirement.
5. "Rules discovered during implementation": each must already be in the spec with a test, added by the spec author before it was implemented. Send back any behavior a user or another component would notice that exists only in the code.
6. Traced coverage (its command is in `AGENTS.md`): run only the tests that cite IDs, with coverage on, and list the new branches none of them executes. Each is a missing requirement, dead code, or defensive code. Read function and branch coverage, not line coverage. For text-only documentation changes that do not affect code, tests, or how they run, report `N/A` with a reason instead. Refactors and dependency updates do not qualify for this exception.
7. Read every change to `AGENTS.md`, `CLAUDE.md`, `skills/`, `.github/`, `scripts/`, test configuration, and dependency files line by line. The first three are the instructions for every later session.
8. Report to the owner: what changed, the risks, the reviewed head SHA, the spec SHA step 3 compared it with, and the Merge commands below, filled in. Cite code with links pinned to that SHA: `gh browse <path>:<line> --commit <sha> --no-browser`.

## Merge

Only the owner merges, by running the commands from your report in this repository:

```bash
GH_CONFIG_DIR=~/.config/gh-owner gh pr merge <N> --squash --admin --match-head-commit <reviewed SHA>
git push owner --delete refs/heads/spec/<branch>
```

Leave out the second line when there is no spec branch. `--admin` is required, since only the owner may update main, and safe: it cannot skip a failing `check` or merge a branch behind main. If the head moved after the review, the merge fails; if the PR fell behind main, update it as in step 1, review the new commits, and report again.

Afterwards, remove the review worktree: `git worktree remove ../review-<N>`. When a PR is closed without merging, give the owner the second line for its spec branch.
