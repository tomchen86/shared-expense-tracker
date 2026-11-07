# ADR-0014: Flows tagged android also run on an emulator

- Date: 2026-11-06
- Status: Accepted

## Context

ADR-0008 and ADR-0010 leave Android flows for when an Android behavior needs one. #103 and #104 do. In #103, Android's native scroll view takes a slanted drag in `onInterceptTouchEvent` before JavaScript hears of it, so an open row stays open while the list moves. In #104, the category form's `Modal` is a window of its own, and the keyboard covers its palette on a 360×640 dp screen. Jest renders no native view, and `scripts/e2e-ios.sh` runs only on iOS, where #104 does not show and #103 shows differently: the row closes, but the list still moves. The flows in `apps/mobile/tests/regression/` that run on Android cite no requirement, and nothing runs them.

The options as of 2026-11-06:

- Keep it to hand checks. Each runs once, and #104's only shows on a small screen, which is easy to forget.
- Android-only flows in a folder of their own, with their own marker in the trace check. That is a new marker and a new way to count coverage for three flows, and those flows would not guard iOS, where the same rules hold.
- A CI job with an Android emulator. GitHub's macOS runners do not offer the nested virtualization an emulator needs; its Ubuntu runners do, at the cost of another slow job to keep reliable.

## Decision

- A flow that must also hold on Android stays in `apps/mobile/tests/acceptance/e2e/` and gets `tags: [android]`. iOS runs it like any other flow, so it has to make sense on both platforms, and the trace check counts it as usual.
- `bash scripts/e2e-android.sh <serial>` runs the tagged flows on the app already on that emulator, on a 360×640 dp screen, then puts the screen back. A script sets the size because a flow cannot. Given flow paths after the serial, it runs only those, so a fix reruns only its flow, as in ADR-0012.
- The app on the emulator is a Release build. It needs no Metro (ADR-0012), and `clearState` in these flows would wipe the Metro host of a debug build using a port of its own.
- The implementer runs it once per PR, whenever ADR-0012 calls for `bash scripts/e2e-ios.sh`, and records the results under Verification. The reviewer checks that record like the iOS one. The spec author sees a new tagged flow fail there when that is where the behavior is missing.
- CI does not run it.

## Consequences

- A rule that only Android's native views break gets a test that anyone can rerun, and iOS checks the same rule at no extra cost.
- The `e2e` workflow and the trace check still see only iOS, so a passing iOS run says nothing about Android. A change that breaks a tagged flow on Android and gets past the implementer's run shows up at the next PR's run, or at a release.
- Each such PR needs an Android Release build as well as an iOS one.
- A tagged flow can use only what works on both platforms, and has to say so where they differ: on Android, Maestro reads the button behind a closed row, so these flows look for an open row's button with `enabled: true`, and the requirements say a closed row's button is disabled.
