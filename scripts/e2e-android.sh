#!/usr/bin/env bash
# Runs E2E flows (ADR-0014) on the Release build already on that emulator, on a 360×640 dp screen,
# then checks that each (e2e android) requirement has a passing flow (ADR-0031).
#
#   bash scripts/e2e-android.sh <serial>            the flows tagged android, then the trace
#   bash scripts/e2e-android.sh <serial> <flow>...  only those flows, without the trace
#
# Needs Maestro on PATH; the reports land in reports/e2e-android/.
set -euo pipefail
[ $# -ge 1 ] || { echo "usage: bash scripts/e2e-android.sh <serial> [<flow>...]" >&2; exit 2; }
cd "$(dirname "$0")/.."
export MAESTRO_CLI_NO_ANALYTICS=1 MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED=true
serial=$1
shift
trace=
[ $# -ge 1 ] || { set -- --include-tags android apps/mobile/tests/acceptance/e2e; trace=1; }
rm -rf reports/e2e-android && mkdir -p reports/e2e-android/junit

# A small screen, where the keyboard covers part of a form that fits on a bigger one.
trap 'adb -s "$serial" shell wm size reset; adb -s "$serial" shell wm density reset' EXIT
adb -s "$serial" shell wm size 1080x1920
adb -s "$serial" shell wm density 480

# A busy host shortens Maestro's swipes on Android, so the record shows how busy it was.
load() { echo "$1: load averages $(uptime | sed 's/.*load averages*: //') on $(getconf _NPROCESSORS_ONLN) cores" >&2; }

# run <name> <flow>...: one Maestro run, reported as reports/e2e-android/junit/<name>.xml.
run() {
  local name=$1
  shift
  maestro test --device "$serial" --format junit --output "reports/e2e-android/junit/$name.xml" \
    --test-output-dir "reports/e2e-android/output/$name" "$@"
}

# A flow that fails runs once more, as in e2e-ios.sh. The trace counts a flow that passes in
# either run, as each report is read.
load Start
status=0
if ! run maestro "$@"; then
  failed=()
  while IFS= read -r flow; do failed+=("$flow"); done < <(python3 -c '
import sys, xml.etree.ElementTree as ET
for case in ET.parse(sys.argv[1]).iter("testcase"):
    if any(c.tag in ("failure", "error") for c in case):
        print(case.get("file"))' reports/e2e-android/junit/maestro.xml 2>/dev/null)
  if [ ${#failed[@]} -gt 0 ]; then
    load "Running the ${#failed[@]} failed flow(s) again"
    run maestro-rerun "${failed[@]}" || status=1
  else
    status=1
  fi
fi
load End
# The trace runs even when a flow fails, as in check.sh. Given flow paths, the reports have
# only part of the flows.
if [ -n "$trace" ]; then
  python3 scripts/trace_check.py --e2e android --reports reports/e2e-android/junit || status=1
fi
exit "$status"
