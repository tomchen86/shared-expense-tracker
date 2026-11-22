# ADR-0031: The Android run traces the requirements that hold only on Android, and runs a failed flow once more

- Date: 2026-11-22
- Status: Accepted

## Context

ADR-0014 has a flow that must also hold on Android carry the tag `android`. iOS runs it like any other flow, `bash scripts/e2e-android.sh <serial>` runs each tagged flow once on an emulator, and the trace check sees only the iOS run. Two things have come up since:

- PR #216 (#200) added the first `(e2e)` requirements that hold only on Android: LEDGER-111.2, LEDGER-136.2, LEDGER-149.1 and LEDGER-150.1, each a `WHERE Android` sentence about a Material menu or sheet. Their flows also cite the iOS requirement for the same control, `list-period-menu.yaml` for example LEDGER-110.1 and LEDGER-111.2, and skip the other platform's steps with `when: platform`. So on iOS they pass without running the Android steps, and the iOS trace counts the Android requirements as checked. Their only evidence is the Android record in the PR that added them (#217).
- In PR #213, `full-swipe.yaml` failed on Android at its first run and passed when run alone, with nothing changed in between: the row had only slid open, so the drag the app received was short. The host's 1-minute load average was 11 when the run started and 28 to 40 when it ended, as other sessions started builds. Maestro swipes on Android with `adb shell input swipe`, which places each step by the time elapsed, so a stalled host shortens a drag (PR #115 measured this). `scripts/e2e-ios.sh` runs a failed flow once more and counts a pass in either run (ADR-0017). The Android script had no such rule, so the spec author judged that record case by case (#220).

Also considered:

- Treating an `(e2e)` requirement whose sentence starts with `WHERE Android` as Android-only, with no new marker: the trace check would depend on the wording, and rewording a sentence would move a requirement from one platform's trace to the other's without anyone noticing.
- Marking flows instead of requirements, as ADR-0014's rejected option did: a flow cites a control's iOS and Android requirements together, so a marker on the flow cannot say which of its IDs a run has checked.
- A CI job that runs the tagged flows on an emulator after each merge, as `e2e` does on iOS. Only Ubuntu runners can run an emulator (ADR-0014), so it needs an Android Release build on Linux, an emulator action and Maestro, and another slow job to keep reliable, on four cores: a busy host of the kind on which the swipe above came up short.
- Not starting a run while the load is high, and still sending every first-try failure back to the spec author: in PR #213 the load rose after the run had started, and an Android Release build on the same Mac on 2026-11-22 took the load from 5 when it started to 296 before it ended, so a check at the start sees neither.
- Keeping one run per flow and writing down that a rerun needs the spec author's word: that keeps the case-by-case judgment.

## Decision

- A requirement that only a flow's Android steps can check is marked `(e2e android)` instead of `(e2e)`. Its flow is a tagged flow like any other (ADR-0014) and cites it the same way.
- `scripts/trace_check.py --e2e`, the iOS run's trace, skips these requirements. `--e2e android` checks only them: each needs a passing flow in the Android run's reports. Without `--e2e`, the check in each PR lists them apart from the `(e2e)` ones. A requirement that holds only on iOS stays `(e2e)`, since the iOS run checks it where its steps run.
- `bash scripts/e2e-android.sh <serial>` runs each flow that failed once more, as `scripts/e2e-ios.sh` does, and a flow that passes in either run has passed. Its reports have the iOS script's names, so `scripts/e2e_flaky.py` counts first-try failures in them too. After a run of every tagged flow it runs the trace with `--e2e android`. Given flow paths, it runs only those, without the trace, as an iOS shard does.
- The script prints the host's load averages and core count when it starts, before the rerun and when it ends, and never stops because of them. The implementer's Verification names the flows that passed only when run again, with those numbers.
- A flow that fails both times has failed, as on iOS: the code is fixed, or the flow goes back to the spec author (ADR-0008).
- CI still does not run the Android flows.
- This supersedes ADR-0014's "the trace check still see[s] only iOS", and its one run of each flow.

## Consequences

- A PR that breaks a requirement that holds only on Android fails its own Android run, and the trace names the requirement. A change that breaks one without running the Android flows, such as one outside `apps/mobile`, still shows up only at the next PR's run, or at a release, as under ADR-0014.
- A spec author who writes a `WHERE Android` requirement that only a flow can check has to mark it `(e2e android)`. Marked `(e2e)`, it is counted by the iOS trace, where its steps do not run. `docs/specs/README.md` and `skills/write-spec/SKILL.md` say so.
- A flow that fails on Android because the host stalled passes when run again without anyone's judgment, and the record shows how busy the host was. A flow that keeps failing first shows up in `e2e_flaky.py`, and a flow that fails twice still stops the PR, which a host busy enough can cause.
