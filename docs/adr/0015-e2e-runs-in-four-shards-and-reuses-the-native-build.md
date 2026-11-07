# ADR-0015: The e2e workflow runs four shards and reuses the native build

- Date: 2026-11-08
- Status: Accepted

## Context

ADR-0008 runs the flows in one job on a GitHub-hosted `macos-26` runner after each merge to `main`, and the job builds the app natively every time. The flows have grown from 3 to 26. On `9f7b07e` ([run 42359724374](https://github.com/tomchen86/shared-expense-tracker/actions/runs/42359724374)) the job took 100 minutes: 17.5 to build, 68 to run the flows one after another, and 14 to rerun the 4 that failed. On `9757aa4` ([run 42358446018](https://github.com/tomchen86/shared-expense-tracker/actions/runs/42358446018)) the build took 33 minutes, and the job reached its 120-minute limit before the first round of flows ended, so that merge has no result. The longest flow, `category-vertical-scroll`, takes 13 minutes there; locally, all 26 take about 31.

The runner has 3 M1 cores and 7 GB of memory. In this public repository, standard runners cost nothing, and up to five macOS jobs run at a time (ADR-0008).

The options as of 2026-11-08:

- Maestro's own sharding, `--shard-split`, needs one running simulator per shard on the same machine. On 3 cores they would slow each other down.
- Several jobs, each on its own runner with its own simulator, each running part of the flows. Each needs the app.
- `@expo/repack-app` puts a new JavaScript bundle and its assets into an app built earlier. Expo's docs call that safe only while the app's native side is unchanged, which they check with `@expo/fingerprint`; they do not say whether pnpm patches count, and `patches/react-native-screens@4.30.1.patch` changes native code. It also compiles the bundle to Hermes bytecode without the `-O` that a Release build passes, so its app is not a Release one.
- The two steps of Xcode's bundle phase in a Release build (`react-native-xcode.sh`), `expo export:embed` and then `hermesc -O`, do the same job. Run with the same arguments and paths, they give a new build's `main.jsbundle`: locally the bundle's source hash matched a CI build's, and only the path that the bytecode records differed. They need neither `expo prebuild` nor the `ios` folder, and take seconds.
- Faster paid runners, Maestro Cloud, and EAS Workflows cost money every month, as ADR-0008 found.
- Data seeded at launch would shorten the longest flows, but ADR-0008 has flows reach data only through the screens.

Maestro also names a folder in its output after each flow, and `actions/upload-artifact` refuses paths with characters such as `:` and `?`. The name of `form-menus.yaml` has a colon, so neither run above kept its reports.

## Decision

- The `e2e` workflow has three jobs. `app` prepares the Release app for the simulator. Four `flows` jobs each install it on a simulator of their own and run every fourth flow with `bash scripts/e2e-ios.sh --app <path> --shard <i>/4`, which still runs a failed flow once more. `trace` reads all their JUnit reports and runs the trace check.
- `app` reuses the native build while what it is built from stays the same: the lockfile, `pnpm-workspace.yaml` (which lists the patches), `patches/`, both `package.json` files, `apps/mobile/app.json`, `apps/mobile/assets/`, `scripts/e2e-ios.sh`, and the Xcode build. A hash of these keys an Actions cache that holds the built app. On a hit, `bash scripts/e2e-ios.sh --repack` puts the pushed commit's JavaScript into it with those two steps. On a miss, the job builds as before, saves the app, and runs the same step, which must leave `main.jsbundle` unchanged, so a change in how Xcode bundles fails the run instead of going unnoticed. This key is coarser than `@expo/fingerprint`'s: it also rebuilds after a dependency bump that changes no native code, and it needs no list of what the tool hashes.
- A push to `main` starts the workflow only when it changes something the flows run on: the app outside its Jest tests, the flows, the packages' sources, `patches/`, the package manifests and lockfile, `.nvmrc`, `docs/specs/` (which the trace check reads), `scripts/e2e-ios.sh`, `scripts/trace_check.py`, or the workflow. It still runs when started by hand.
- Each shard keeps its reports as `e2e-reports-<i>`, with Maestro's output folder packed into `output.tgz`, so no flow name can stop the upload.
- `bash scripts/e2e-ios.sh`, with or without a `<udid>`, still runs every flow in one place, as implementers do (ADR-0012).

## Consequences

- The shards run side by side, so a run takes about as long as preparing the app plus the slowest shard, instead of the build plus every flow.
- A push that changes only docs, skills, or Jest tests gets no run. Every other merge still gets its own, so a failure still points to the merge that caused it.
- Two runs close together need eight macOS jobs, more than the five that run at a time, so the second one's shards wait.
- Each shard starts a new simulator, and on CI the first flow on a new simulator fails more often than the others (6 of 24 tries against about 8%), on its first keyboard, sheet, menu or swipe; the rerun of failed flows covers it. A warm-up flow before the real ones cost each shard about four minutes and gave no clear drop in two runs. `scripts/e2e-ios.sh` stops the simulator's push daemon, which on CI retries Apple's servers without pause and writes most of the simulator's log.
- A flow may run on a native build from an earlier merge, with this merge's JavaScript. If a native change gets past the key, the flows run on a stale native side until the key changes. A build that breaks only in Release, which ADR-0008 counted on every run to find, shows up only when the key changes.
- GitHub drops a cache unused for 7 days, and a run on `main` cannot read one made on another branch, so the first run on `main` after a key change builds.
- The shards split the flows in the order the shell sorts their files, not by how long they take, so one shard can take noticeably longer than the others. Splitting by recent flow times is the next step if that matters.
- Reading a run's reports takes one more step: `gh run download <id> --pattern 'e2e-reports-*'`, then `tar -xzf output.tgz` in each folder.
