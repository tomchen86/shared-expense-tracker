# ADR-0018: E2E flows start from data written at launch

- Date: 2026-11-09
- Status: Accepted

## Context

ADR-0008 has flows reach data only through the screens, "so they stay few and short". On `fa23cf1` the 27 flow files had 1,446 steps written out, and more as they ran, since several repeat a form 7 to 12 times to fill a list and 13 type the name "Taylor". Most of those steps only built the data a flow needs before the behavior it checks: `full-swipe` added 8 expenses and 7 groups through their forms, about 150 commands, to check one swipe of each. On CI's slow runners typing loses letters and presses miss (#169), so each of those steps was a chance to fail a flow before it checked anything.

The options as of 2026-11-09:

- Keep building data through the screens, and type again what typing garbles, as #170 does. Every flow still pays for its setup in time and in failures.
- Pass the data at launch. Maestro's `launchApp` sends `arguments`, which an iOS app reads from its user defaults for that launch only (`Settings` in React Native). On Android they arrive as intent extras, which React Native cannot read without native code; `react-native-launch-arguments` 4.1.1 reads them, but says nothing about the New Architecture the app runs on. An Android app can read the link that started it (`Linking.getInitialURL`), which Maestro's `openLink` sends there without a prompt. On iOS, a link to the app's own scheme waits behind a system prompt.
- Write the database file before the app starts. That needs the simulator's app container or the emulator's `run-as`, which a flow cannot reach.

## Decision

- A flow may start from a seed: `runFlow` with `common/launch-with-seed.yaml` and `SEED`, JSON in the shape of `Seed` in `apps/mobile/src/shell/e2e-seed.ts`. The subflow clears the app's data and starts the app with the seed: as the `seed` launch argument on iOS, and in the link `shared-expense-tracker://?seed=<seed>` on Android. A flow that needs other launch arguments too, such as a locale, passes `seed` itself, encoded by `common/encode-seed.js`.
- Only a bundle made with `EXPO_PUBLIC_E2E=1` reads a seed. `scripts/e2e-ios.sh` sets it for the Release build and its repack, a debug build gets it from Metro as for LogBox (ADR-0008), and the Android Release build for the flows is built with it. Metro inlines the variable, so a store build never reads a seed.
- The app writes the seed once the database is open and before the first screen shows, through the functions the screens call, in the order of `Seed`'s fields, so the data ends up as the screens would leave it. A seed that names a group, category or member it does not create, or has a field that `Seed` does not, stops the app on "Unable to Load Local Data", so the flow fails at its first step.
- A flow still enters through the screens what its requirements are about, such as the name in `name-after-restart` and the group in `create-group`.
- A flow that checks many requirements is split by them, each part starting from the data it needs.
- This supersedes ADR-0008's "Flows reach data only through the screens".

## Consequences

- Flows spend their steps on the behavior they check. Counting `repeat` loops and subflows as they run, the 27 flows on `fa23cf1` ran 2,117 commands, 169 of them typing; with seeds, and five long flows split into thirteen, the 35 flows run 1,416, 32 of them typing.
- The build the flows run on differs from a store build by one inlined variable. The seed code is in both, but runs only in the first.
- A seed writes data directly, so a flow could start from a state the screens cannot make. It writes through the screens' own functions, and `apps/mobile/tests/shell/e2e-seed.test.ts` checks that a seed comes out as the screens would leave it.
- A flow that needs data `Seed` cannot describe, such as a former member, builds it through the screens until a field is added to `Seed` and `applySeed`. That is app code, which a spec author does not write, so it comes with the implementation or with a PR that changes no behavior.
- A plain `launchApp` later in a flow restarts on the same data and does not apply the seed again: on iOS the argument lasts one launch, and on Android the launcher starts the app without the link.
- On Android the app starts from a link, which `apps/mobile/app/+native-intent.tsx` routes to `/`.
- Maestro reads `${…}` in a value up to the value's last `}`, so a seed with computed values, such as dates, is built in one `evalScript` with `JSON.stringify`; a fixed seed is literal JSON.
