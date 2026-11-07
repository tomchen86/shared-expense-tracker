---
name: implement
description: Make an issue's failing acceptance tests pass once its spec is published. Use when starting work on an issue as the implementer.
---

# Implement an issue

- Start only when `spec/<branch>` exists on the remote. Fetch with `git fetch --no-tags origin +refs/heads/main:refs/remotes/origin/main +refs/heads/spec/<branch>:refs/remotes/origin/spec/<branch>`; proceed only if it succeeds. Your work order is `git diff refs/remotes/origin/main...refs/remotes/origin/spec/<branch>`.
- Make the failing tests pass. Never edit `docs/specs/` or the acceptance tests, not even to add a line. Clean merges of main's changes are allowed. Put your own tests elsewhere, without requirement IDs. If a test looks wrong, explain why in one PR comment with any others you find, and keep working on what does not depend on it.
- The spec author's updates arrive on `spec/<branch>`: take them with `git fetch --no-tags origin refs/heads/spec/<branch> && git merge FETCH_HEAD`. Never resolve a conflict in specs or acceptance tests yourself: the spec author resolves it on `spec/<branch>`, then you merge that update.
- Behavior the spec does not cover: if a user or another component would notice the choice (for example, who gets the remainder of an uneven split), stop and ask the spec author in a PR comment (`gh pr comment <N> --body "<question>"`), and meanwhile work on the parts that do not depend on the answer. Decide internal details yourself.
- Check by hand before marking the PR ready: on iOS with the debug build from `expo run:ios`, and on Android with the Release build (Commands).
- When the PR changes `apps/mobile` outside `apps/mobile/tests/`, or changes a flow, run all the flows once with `bash scripts/e2e-ios.sh` (ADR-0012): after the reviewer, if any, has nothing left to change in the code and, while other PRs are also waiting to merge, after the owner says this one merges next. If a flow fails, fix the code and rerun only that flow. Record under Verification the commit they ran on, each flow's result, and any fix with the flows it reran. This holds for changes made in one session too. The flows are acceptance tests, so never edit one: a flow that fails without a code change goes back to the spec author, and nobody reruns it until it passes.
- At the same point, also run the flows tagged `android` once on a Release build with `bash scripts/e2e-android.sh <serial>` (ADR-0014; Commands), and record each flow's result under Verification too. After a fix, rerun only the flow that failed.
- While working, run `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, and only the tests and the E2E flow your change touches. Leave the full check to CI. Run `pnpm test:traced` only to set or raise a coverage threshold.
- When CI is green on your last commit: fill the PR's What changed and Verification sections, then mark it ready for review with `gh pr ready <N>`.
- Never merge, and never push to the default branch.
