# ADR-0031: The E2E build is signed for the simulator, and flows reach a local API

- Date: 2026-11-22
- Status: Accepted

## Context

A phone keeps its device seed and group keys in `expo-secure-store` (ADR-0015, ADR-0027), and sends its requests to the API that `EXPO_PUBLIC_API_URL` names; a build that names none never syncs (ADR-0027). `scripts/e2e-ios.sh` built the Release app that the flows run on, locally and in the `e2e` workflow (ADR-0017), with `CODE_SIGNING_ALLOWED=NO`, and named no API. On the iOS simulator a keychain item needs the app's `application-identifier` entitlement, so no flow could reach a screen that makes a device identity, a group key or an invite, or one that syncs (#221).

Tried on 2026-11-22 on a Mac with no signing certificate, as the runner has none, with Xcode 26.6 (17F113) and the iOS 26.5 simulator, as on the `macos-26` runner image. A probe bundle, not in the repo, wrote, read back and deleted a secure store entry with the seed's options, then made a device identity with the app's own functions:

- The app of `e2e` run 44848974511 failed both: "A required entitlement isn't present."
- Without `CODE_SIGNING_ALLOWED=NO`, Xcode signs the simulator build to run locally (ad hoc), with no certificate or Apple account, although the project names a team. It links the entitlements, `application-identifier` and the associated domains of `app.json`, into the executable's `__TEXT,__entitlements` section; the signature itself has none. Both steps succeeded, also after `--repack` put other JavaScript into that app, which leaves the signature not matching the app's files: the simulator does not check that. Signing took half a second.
- Signing the unsigned app afterwards with `codesign --sign - --entitlements` and the same entitlements: the simulator refused to start it.
- The same Release build reached a server on the Mac at `http://127.0.0.1:<port>`, since its `Info.plist` allows local networking.

`expo run:ios`, which builds the debug build of iOS hand checks, leaves signing on.

The other options as of 2026-11-22:

- Keep the screens that need the secure store out of the flows. CI pays nothing, but the real keychain, and opening the app from an invite link, are left to hand checks.
- Give the E2E bundle a fake secure store. The flows reach those screens but never the keychain, and the E2E build differs from a store build by more than the one inlined variable that ADR-0018 accepts.
- Keep `CODE_SIGNING_ALLOWED=NO` and link the entitlements in by hand: what Xcode does, with a second copy of the entitlements in the repo.
- For the API, staging: nothing to set up, and Android needs no cleartext traffic. But a merge that changes both the API and the app starts `e2e` while `deploy` runs, so a flow can reach the old API; an implementer's run has a PR's app talk to `main`'s API; every run leaves devices and groups in staging's database; and a flow fails whenever staging or the network does.

## Decision

- `scripts/e2e-ios.sh` lets Xcode sign the Release build for the simulator, and fails the build when the executable has no `application-identifier` entitlement. No certificate, secret or account is involved, and the `e2e` workflow is unchanged.
- A flow that reaches the API reaches one that the run starts from the same checkout, with a database of its own, at `http://127.0.0.1:<port>`. The E2E bundle names it in `EXPO_PUBLIC_API_URL`, at build and at `--repack`. On Android the emulator reaches it through `adb reverse`, and only the build for the flows allows cleartext traffic, and only to `127.0.0.1`. The scripts and the `e2e` workflow get this with the first flow that needs the API.

## Consequences

- A flow can make a device identity, group keys and invites in the simulator's real keychain, as the app does on a phone.
- The first `e2e` run on `main` after this change builds the app, 17 to 40 minutes, since the cache key holds the script (ADR-0017); later runs reuse it as before. Signing adds half a second to a build.
- The check reads the executable, not the keychain: nothing writes the secure store on CI until the first flow that needs a device identity.
- The E2E build has the associated domains that a store build has, so a flow that opens an `https` invite link may open the app instead of Safari. No flow does yet, and it was not tried.
- A flow that reaches the API tests the same commit's API, shares no state with other runs, and needs no secret. Locally the API's database is in the PostgreSQL of `apps/api/compose.yaml`. On CI each `flows` job also installs Node, the dependencies and PostgreSQL (the runner image has Homebrew, but neither PostgreSQL nor Docker), runs the migrations and starts the API: an estimated 3 to 5 minutes per shard, not measured.
- Android's part was not tried.
