# ADR-0008: Thin end-to-end tests with Maestro

- Date: 2026-10-29
- Status: Accepted

## Context

The mobile app's acceptance tests run in Jest on Node, in the `jest-expo/ios` and `jest-expo/android` presets, and CI runs `scripts/check.sh` on Ubuntu only. The tests render the app and read the props it gives native views: SHELL-10.1's test checks that each tab root asks for a large title, and SHELL-25.1's checks that the Settings content sits in the scroll view the large title follows. They cannot see what the native views do with those props:

- the native tab bar, large titles and their collapse on scroll, and the back button;
- the native segmented control that #10 adds through `@expo/ui`, and dragging its thumb so it snaps to an option;
- Liquid Glass surfaces, which #10 makes follow Reduce Transparency;
- the keyboard: tapping a row while it is open, and scrolling to every row at large text sizes;
- `expo-sqlite` itself, which no test runs (ADR-0006).

Two things cover these today. Implementers check by hand on simulators and record it under Verification: PRs #36, #38, and #40 did so in Expo Go 57.0.9 on an iPhone 17 with iOS 26.5. Each check runs once, on the commit at hand, and depends on someone remembering it: #38's simulator check predates its last change, and #40's Android check was done only after review pointed it out. In both, Verification said what was left out: the steps were missed, not misreported. A requirement no automated test can check is marked `(manual)`, such as CATEGORIES-20.1 from #13, and the trace check only lists it as the pre-release checklist. No automated test repeats either kind of check.

The trace check reads the JUnit XML in `reports/junit/` from its own run, and fails any requirement that no passing test cites unless it is `(manual)`.

The app runs only in Expo Go: the repo has no `ios/` or `android/` (both are in `.gitignore`), no `eas.json`, and no `expo-dev-client`, and `app.json` sets no bundle identifier or package name. The baseline builds the app itself instead: its `ios` and `android` scripts are `expo run:ios` and `expo run:android`, which generate the native projects (git ignores them) and make a debug build. Its earlier repository moved there from Expo Go in order to run Detox (commit `230f2eb8` of `/Users/tomchen/Codespace/shared-expense-tracker`). The baseline has Detox 20.51.4 and three E2E test files, configured for those generated projects. Its CI ran only the app's typecheck and unit tests, on Ubuntu, so the E2E tests never ran there; its `apps/mobile/scripts/test-all.sh` skips them with a warning when no iOS simulator is found.

This repository is public, so standard GitHub-hosted runners, macOS included, cost nothing. As of 2026-10-29 the options are these.

Tools:

- Maestro (CLI 2.12.0) drives a built app from outside, through the accessibility tree, with flows written in YAML. It adds nothing to the app, works with Expo Go and with builds, and runs iOS 26 simulators on macOS. Expo's E2E guide and EAS Workflows use it. `maestro test --format junit` reports each flow as a test case named after the flow's `name` (or its file name) and adds a `failure` element when the flow fails, so the trace check reads its reports as they are. It waits by watching the screen, not by knowing when the app is idle, and it sees appearance only in screenshots.
- Detox (20.51.4) runs Jest tests against a build and waits until the JavaScript thread and animations are idle. Set up for Expo, it adds native test code through a config plugin during `expo prebuild`, so it tests a build, not Expo Go. It officially supports React Native 0.77 to 0.84; the app is on 0.86.
- Appium (3.9.0) drives the app from outside through WebDriver, in any language, and most device clouds support it. It needs a server, a driver per platform, and WebDriverAgent built for iOS, and tests have to wait for the screen themselves.
- XCUITest and Espresso are Apple's and Google's own frameworks: two suites, in Swift and Kotlin, in UI test targets that the generated native projects do not have, so a config plugin would have to add them.

Builds:

- Expo Go needs no build and is what hand checks use. A flow cannot launch the app by its own ID and opens an `exp://` link instead, Metro has to run during the test, and clearing data clears all of Expo Go. It is not the app users install, and it stops working once the app needs native code that Expo Go does not include.
- A debug build from `expo run:ios`, without `expo-dev-client`, has the app's own native code and still loads the JavaScript from Metro, with Fast Refresh and no launcher screen. It needs no new dependency. The first build in each checkout takes minutes, a change to native configuration needs a rebuild, and the app needs its own bundle identifier.
- A development build adds `expo-dev-client` to that debug build: a launcher screen that tests have to get past, and a dependency.
- A release build for the simulator, which is what Expo's E2E guide builds, has the JavaScript inside: `expo prebuild` generates the native projects, and Xcode or Gradle builds them. It needs no Metro and no new dependency, but every run builds the app, and the app needs its own bundle identifier and package name.

Where they run:

- Only locally, on the implementer's simulator: free, but it depends on the implementer, and CI never sees the results.
- A GitHub-hosted `macos-26` runner, whose image has Xcode 26.6 and iOS 26 simulators: free in this public repository, with up to five macOS jobs at a time. Its standard machine has 3 M1 cores and 7 GB of memory, and each run builds the app from scratch. In a private repository it would cost $0.062 a minute, about $1.90 for a 30-minute run.
- EAS Workflows, whose Maestro job is in alpha and not on the Free plan. The Starter plan is $19 a month with $45 of build credit, and a run costs about $2.80: $2 for the iOS build, $0.05 for the test job, and $0.075 a minute on macOS for a 10-minute test. It also needs an Expo account, an `eas.json`, and Expo's GitHub app on the repository.

## Decision

- The mobile app gets a thin end-to-end layer: Maestro flows on an iOS simulator. The first flows check behavior already implemented: the app starts on its tabs (SHELL-6.1), a name saved with Return is still there after a restart (SHELL-18.1 and SHELL-17.1, the only test of `expo-sqlite` itself), and with the keyboard open, one tap on a Settings row opens it (SHELL-24.1). Next is #10's picker, tapped and dragged to an option.
- Flows are acceptance tests. Each cites the requirement IDs it checks in its `name`, lives in `apps/mobile/tests/acceptance/e2e/`, and belongs to the spec author, who writes it before the implementation and sees it fail for the missing behavior, as with the Jest acceptance tests. A flow finds elements only by the text and accessibility labels its requirements state. Implementers run the flows and never edit them.
- A requirement that only a flow can check is marked `(e2e)` in the spec, where `(manual)` marks one that no automated test can check. The trace check in each PR lists `(e2e)` requirements without failing, since PRs do not run the flows. A run of the flows passes only when each `(e2e)` requirement has a passing flow that cites it. A `(manual)` requirement that a flow can check becomes `(e2e)`.
- Hand checks on iOS move from Expo Go to a debug build from `expo run:ios`, as in the baseline, so implementers check the app's own native code and the flows can run on the same build. Android hand checks stay in Expo Go until Android flows come.
- On `main`, the flows run against a release build for the simulator, generated with `expo prebuild`. The native projects stay out of git, as `.gitignore` already has them.
- Maestro is installed at a pinned version on the machine that runs the flows. It is not a dependency of the app.
- A workflow of their own runs them on a GitHub-hosted `macos-26` runner after each merge to `main`, and when started by hand. It runs outside PR checks, so it never blocks a merge, and it keeps Maestro's JUnit report and screenshots as the run's artifacts. It runs after each merge rather than nightly, so a failure points to the merge that caused it, and not on PRs, where it would build the app again on every push.
- When a PR changes `apps/mobile` outside `apps/mobile/tests/`, or changes a flow, the implementer runs the flows on the debug build they checked by hand, before marking the PR ready, and records under Verification the commit they ran on and each flow's result. The reviewer checks that this record is there and that none of the PR's own later commits changes those paths. Merges from `main` do not count, since the workflow on `main` tests the merged code. Agents forget steps more often than they misreport them, so the reviewer's check catches the usual failure, and the workflow on `main` catches the rest.
- A flow that fails without a code change goes back to the spec author, who fixes or removes it; nobody reruns it until it passes.
- iOS comes first, since most of what only the native views show is iOS-only. Android flows, on an emulator, come when an Android behavior needs one.

## Consequences

- Each hand check that a flow covers becomes a command anyone can rerun, and every merge to `main` runs on a simulator with the real native views and `expo-sqlite`.
- Behavior that only the native views show is specified and tested before it is implemented, like any other. `(manual)` is left for what no flow can check, such as a gesture that has to land while a save is still running (CATEGORIES-20.1).
- A change that breaks what a flow covers and gets past the implementer's run is found only after it merges, and `main` stays broken until a fix merges. GitHub notifies whoever triggered the failed run, which after a merge is the owner.
- Every run on `main` builds the app natively, so a change that breaks the build shows up long before the first external release needs one. It also makes the workflow much slower than `check`.
- Hand checks on iOS take longer to start: the first debug build in each checkout takes minutes, and a change to native configuration needs a rebuild. JavaScript changes still reload through Metro.
- Spec authors and implementers both need a Mac with Xcode, a simulator, and Maestro: the spec author to see a new flow fail on a debug build of the current app, the implementer to see it pass.
- The implementer's run uses a debug build and the one on `main` a release build, so a problem that only a release build has shows up after the merge.
- A debug build loads its JavaScript from Metro, and its LogBox shows warnings over the bottom of the screen, where they can cover the tab bar. The change that adds the flows keeps LogBox out of their way, for example with `LogBox.ignoreAllLogs()` behind an environment variable, and says to start Metro before running them.
- The change that adds the first flows also sets the bundle identifier in `app.json`, which both builds need, and changes the mobile app's `ios` script to `expo run:ios`. The owner picks the identifier, since it cannot change once a release ships.
- Since flows use only what the spec states, a requirement that a flow checks names the text and labels it needs, and screens need no `testID`s for the flows. A flow written before its screen exists can still miss a detail of the finished screen, and only the spec author can change it, so that costs a round trip, as with the Jest acceptance tests.
- Flows reach data only through the screens, so they stay few and short; rules stay in Jest.
- The look of native views, such as Liquid Glass and the picker, is still checked by eye, with the flows' screenshots as an aid.
- The change that adds the flows also writes these steps where agents read their instructions, which is not in ADRs: `docs/specs/README.md` gets the `(e2e)` marker and how a flow cites IDs, `skills/write-spec/SKILL.md` how to write a flow and see it fail, the Implementing section of `AGENTS.md` the debug build for hand checks and how and when to run the flows, and `skills/review-pr/SKILL.md` the reviewer's check. `scripts/trace_check.py` learns the `(e2e)` marker.
- If this repository becomes private, the workflow costs about $0.062 a minute.
- The baseline's Detox setup is not moved.
