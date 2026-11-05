# ADR-0012: E2E flows run once per PR, last, on a Release build

- Date: 2026-11-05
- Status: Accepted

## Context

ADR-0008 has the implementer run the flows on the debug build before marking a PR ready, and any later commit of the PR that changes the app outdates that record. Review often asks for such commits, and so does a PR that merges first and brings a conflict or a new rule. #87 ran its flows on `00b68c9`, and three later commits changed the app. A run takes about 20 minutes and is the heaviest load on a machine that several sessions share.

The debug build loads its JavaScript from Metro on port 8081, which those sessions also share. In #90, a run went to waste on a stale bundle.

Hand checks are different: they often find something that needs a code change, as with the three problems in #87, so they belong before review.

## Decision

- The implementer runs all the flows once per PR with `bash scripts/e2e-ios.sh`, which builds a Release app. It runs them after the reviewer has nothing left to change in the code and, while other PRs are also waiting to merge, after the owner says this one merges next. This replaces ADR-0008's run on the debug build before marking the PR ready.
- While developing, the implementer runs only the flow a change needs.
- After a fix for a failed flow, only that flow runs again, and the reviewer reads the fix.
- Merges from `main` still do not count, and hand checks stay before marking the PR ready. The spec author's run of a new flow does not change.

## Consequences

- Review changes and other PRs merging first no longer make the flows run again.
- A flow that fails does so after review, so a reviewed PR can change once more.
- Each PR's run builds the app, which takes longer than reusing the debug build, and a PR can wait for the owner's word.
- Code changed by a fix meets the other flows only in the workflow on `main`, so this depends on that workflow staying reliable.
