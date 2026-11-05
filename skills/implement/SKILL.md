---
name: implement
description: Make an issue's failing acceptance tests pass once its spec is published. Use when starting work on an issue as the implementer.
---

# Implement an issue

- Start only when `spec/<branch>` exists on the remote. Fetch with `git fetch --no-tags origin +refs/heads/main:refs/remotes/origin/main +refs/heads/spec/<branch>:refs/remotes/origin/spec/<branch>`; proceed only if it succeeds. Your work order is `git diff refs/remotes/origin/main...refs/remotes/origin/spec/<branch>`.
- Make the failing tests pass. Never edit `docs/specs/` or the acceptance tests, not even to add a line. Clean merges of main's changes are allowed. Put your own tests elsewhere, without requirement IDs. If a test looks wrong, stop and explain why.
- The spec author's updates arrive on `spec/<branch>`: take them with `git fetch --no-tags origin refs/heads/spec/<branch> && git merge FETCH_HEAD`. Never resolve a conflict in specs or acceptance tests yourself: the spec author resolves it on `spec/<branch>`, then you merge that update.
- Behavior the spec does not cover: if a user or another component would notice the choice (for example, who gets the remainder of an uneven split), stop and ask the spec author in a PR comment (`gh pr comment <N> --body "<question>"`), and meanwhile work on the parts that do not depend on the answer. Decide internal details yourself.
- Check by hand on iOS and Android with the debug builds from `expo run:ios` and `expo run:android` (Commands). When the PR changes `apps/mobile` outside `apps/mobile/tests/`, or changes an E2E flow, run the flows on the iOS one before marking it ready, and record under Verification the commit they ran on and each flow's result. This holds for changes made in one session too. The flows are acceptance tests, so never edit one: a flow that fails without a code change goes back to the spec author, and nobody reruns it until it passes.
- When the tests pass: fill the PR's What changed and Verification sections, then mark it ready for review with `gh pr ready <N>`.
- Never merge, and never push to the default branch.
