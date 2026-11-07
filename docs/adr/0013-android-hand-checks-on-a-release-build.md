# ADR-0013: Android hand checks on a Release build

- Date: 2026-11-06
- Status: Accepted

## Context

ADR-0010 put Android hand checks on a debug build from `expo run:android`. Nothing else runs the Android app before a release: CI runs `scripts/check.sh` on Ubuntu, and the `e2e` workflow builds the app for iOS only. So every Android hand check runs a build that users never install, and nothing ever runs the one they do.

The final review of the rebuild phase found a crash that only the Release build has (#99). Saving a group form updates its header and closes it within one frame, and a debug build's JavaScript is too slow to do that. On one commit on Android 15, Release crashed in 2 of 6 saves and debug in 0 of 8. A Release build also runs R8, which removes and renames code that a debug build keeps.

A hand check on Release needs no Metro, so it does not meet the port problem of ADR-0012 either. It costs a Gradle run: 2 minutes 32 seconds for a JavaScript change on this repo's Mac while other sessions were building, and longer for the first build in a checkout.

Running Release only on PRs that touch navigation or native code would not have caught #99: its trigger is the timing of JavaScript that a PR can change without touching either. Running it only before a release would leave many PRs to search through when something crashes.

## Decision

- Android hand checks run on a Release build, on every PR that has one, before the PR is marked ready. This replaces the part of ADR-0010 that puts them on a debug build.
- While developing, a debug build from `expo run:android` stays available for Fast Refresh. It no longer counts as the hand check.
- iOS hand checks stay on a debug build, since the flows already run on a Release app before merge (ADR-0012). Android flows still come when an Android behavior needs one.

## Consequences

- Android hand checks run what users install, with R8 and at its real speed.
- A hand check has no Fast Refresh: each fix it leads to needs another Gradle run.
- After a pnpm patch changes, a checkout that already has `apps/mobile/android` must delete its `build/generated/autolinking`, or Gradle compiles the old package without an error (#99).
- A problem only a debug build has no longer shows up in a hand check. Users cannot meet one either.
- Physical phones are still not checked.
