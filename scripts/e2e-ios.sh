#!/usr/bin/env bash
# Runs the E2E flows (ADR-0008), then checks that each (e2e) requirement has a passing flow.
#
#   bash scripts/e2e-ios.sh          build a Release app and run on a new simulator, as the
#                                    e2e workflow does after each merge to main
#   bash scripts/e2e-ios.sh <udid>   run on the app already on that simulator, such as the
#                                    debug build of iOS hand checks (AGENTS.md, Commands)
#
# Needs Xcode, CocoaPods, and Maestro on PATH; the reports land in reports/e2e/.
set -euo pipefail
cd "$(dirname "$0")/.."
export MAESTRO_CLI_NO_ANALYTICS=1 MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED=true
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 # CocoaPods fails without a UTF-8 locale
app=SharedExpenseTracker
rm -rf reports/e2e && mkdir -p reports/e2e/junit

if [ $# -ge 1 ]; then
  udid=$1
else
  (cd apps/mobile && npx expo prebuild --platform ios)
  xcodebuild -quiet -workspace "apps/mobile/ios/$app.xcworkspace" -scheme "$app" \
    -configuration Release -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
    -derivedDataPath apps/mobile/ios/build CODE_SIGNING_ALLOWED=NO

  # A simulator of its own, so a run never disturbs one that someone else is using.
  udid=$(xcrun simctl create e2e "iPhone 17")
  trap 'xcrun simctl shutdown "$udid" 2>/dev/null; xcrun simctl delete "$udid"' EXIT
  xcrun simctl boot "$udid"
  xcrun simctl bootstatus "$udid" >/dev/null
  xcrun simctl install "$udid" "apps/mobile/ios/build/Build/Products/Release-iphonesimulator/$app.app"
fi

# On a CI runner, the first start of Maestro's iOS driver on a new simulator can take minutes.
export MAESTRO_DRIVER_STARTUP_TIMEOUT=${MAESTRO_DRIVER_STARTUP_TIMEOUT:-300000} # ms

# run <name> <flow>...: one Maestro run, reported as reports/e2e/junit/<name>.xml. When
# Maestro cannot start on the simulator, it reports no flow at all, so it tries again.
run() {
  local name=$1 attempt
  shift
  for attempt in 1 2 3; do
    rm -f "reports/e2e/junit/$name.xml"
    maestro test --device "$udid" --format junit --output "reports/e2e/junit/$name.xml" \
      --test-output-dir "reports/e2e/output/$name" "$@" && return 0
    grep -q '<testcase' "reports/e2e/junit/$name.xml" 2>/dev/null && return 1
    echo "Maestro did not start on the simulator (attempt $attempt of 3)" >&2
  done
  return 1
}

# A flow that fails runs once more, since a slow runner sometimes misses a gesture or loses
# the simulator. The trace counts a flow that passes in either run, as each report is read.
status=0
if ! run maestro apps/mobile/tests/acceptance/e2e; then
  failed=()
  while IFS= read -r flow; do failed+=("$flow"); done < <(python3 -c '
import sys, xml.etree.ElementTree as ET
for case in ET.parse(sys.argv[1]).iter("testcase"):
    if any(c.tag in ("failure", "error") for c in case):
        print(case.get("file"))' reports/e2e/junit/maestro.xml 2>/dev/null)
  if [ ${#failed[@]} -gt 0 ]; then
    echo "Running the ${#failed[@]} failed flow(s) again" >&2
    run maestro-rerun "${failed[@]}" || status=1
  else
    status=1
  fi
fi
# The trace runs even when a flow fails, as in check.sh.
python3 scripts/trace_check.py --e2e --reports reports/e2e/junit || status=1
exit "$status"
