#!/usr/bin/env bash
# The E2E flows on a Release build for the iOS simulator, as the e2e workflow runs them
# after each merge to main (ADR-0008). Implementers run the same flows on their debug
# build instead (AGENTS.md, Commands). Needs Xcode, CocoaPods, and Maestro on PATH; the
# reports land in reports/e2e/.
set -euo pipefail
cd "$(dirname "$0")/.."
export MAESTRO_CLI_NO_ANALYTICS=1 MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED=true
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 # CocoaPods fails without a UTF-8 locale
app=SharedExpenseTracker
rm -rf reports/e2e && mkdir -p reports/e2e

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

maestro test --device "$udid" --format junit --output reports/e2e/junit.xml \
  --test-output-dir reports/e2e/output apps/mobile/e2e
