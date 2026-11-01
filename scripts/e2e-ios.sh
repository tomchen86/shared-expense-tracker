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

# The trace runs even when a flow fails, as in check.sh.
status=0
maestro test --device "$udid" --format junit --output reports/e2e/junit/maestro.xml \
  --test-output-dir reports/e2e/output apps/mobile/tests/acceptance/e2e || status=1
python3 scripts/trace_check.py --e2e --reports reports/e2e/junit || status=1
exit "$status"
