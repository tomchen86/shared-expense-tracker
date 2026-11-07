# ADR-0010: Android hand checks on a debug build

- Date: 2026-11-01
- Status: Accepted; parts are superseded by ADR-0013

## Context

ADR-0008 moved hand checks on iOS from Expo Go to a debug build from `expo run:ios`, and kept Android hand checks in Expo Go until Android flows come. So nothing builds the Android app: CI runs `scripts/check.sh` on Ubuntu, the `e2e` workflow builds the app for iOS only, and `app.json` sets no package name, which an Android build needs.

Expo Go is not the app users install (ADR-0008), and #59 showed that it can also have bugs the app does not. On Android, Expo Go started the app on Groups, the first tab, instead of Expenses (SHELL-6.1): there, Expo Router turns the URL of the app's root into an empty path, and with no path the tabs start on their first one. Builds that are not Expo Go, and Expo Go on iOS, start on Expenses. #61 fixed it with a patch to Expo Router, but the patch would have to be redone whenever Expo Router is upgraded, so it was not merged.

A debug build from `expo run:android` works as the iOS one does in ADR-0008: it has the app's own native code, loads the JavaScript from Metro, and needs no new dependency.

## Decision

- Android hand checks move from Expo Go to a debug build from `expo run:android`, on an emulator of one's own. This replaces the part of ADR-0008 that keeps them in Expo Go; Android flows still come when an Android behavior needs one.
- `app.json` sets the Android package name, which the owner picks, since it cannot change once a release ships. The mobile app's `android` script becomes `expo run:android`.

## Consequences

- Android hand checks see the app's own native code, so they no longer report bugs that only Expo Go has.
- Each Android hand check builds the app, so a change that breaks the Android build shows up at the next one rather than at the first release.
- Android hand checks take longer to start: the first build in each checkout takes minutes, a change to native configuration needs a rebuild, and the build and the emulator use more disk and memory than Expo Go. JavaScript changes still reload through Metro.
- Implementers who check Android need the Android SDK, a JDK, and an emulator.
- Expo Go can still open the app, but no hand check relies on it. On Android it still starts the app on Groups (#59), a bug that is left unfixed.
