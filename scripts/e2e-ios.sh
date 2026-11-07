#!/usr/bin/env bash
# Runs the E2E flows (ADR-0008), then checks that each (e2e) requirement has a passing flow.
#
#   bash scripts/e2e-ios.sh          build a Release app and run on a new simulator
#   bash scripts/e2e-ios.sh <udid>   run on the app already on that simulator, such as the
#                                    debug build of iOS hand checks (AGENTS.md, Commands)
#
# The e2e workflow splits the first of these across runners (ADR-0015):
#
#   bash scripts/e2e-ios.sh --build  only build the Release app
#   bash scripts/e2e-ios.sh --repack put this checkout's JavaScript into the Release app built
#                                    earlier, as Xcode's bundle phase would
#   bash scripts/e2e-ios.sh --app <path> --shard <i>/<n>
#                                    run every n-th flow from the i-th on a new simulator with
#                                    that app, without the trace, which needs every shard
#
# Needs Xcode, CocoaPods, and Maestro on PATH; the reports land in reports/e2e/.
set -euo pipefail
cd "$(dirname "$0")/.."
export MAESTRO_CLI_NO_ANALYTICS=1 MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED=true
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 # CocoaPods fails without a UTF-8 locale
app=SharedExpenseTracker
products=$PWD/apps/mobile/ios/build/Build/Products/Release-iphonesimulator
rm -rf reports/e2e && mkdir -p reports/e2e/junit

udid= built= shard= build_only= repack=
while [ $# -gt 0 ]; do
  case $1 in
    --build) build_only=1 ;;
    --repack) repack=1 ;;
    --app) built=$2; shift ;;
    --shard) shard=$2; shift ;;
    *) udid=$1 ;;
  esac
  shift
done

# The two steps of Xcode's bundle phase in a Release build (react-native-xcode.sh), with the
# same arguments and paths, so main.jsbundle comes out byte for byte as a new build's would.
# @expo/repack-app does the same job, but compiles without -O.
if [ -n "$repack" ]; then
  cd apps/mobile
  entry=$(node -e "require('expo/scripts/resolveAppEntry')" "$PWD" ios absolute | tail -n 1)
  hermesc=$(node --print "require('path').join(require('path').dirname(require.resolve('hermes-compiler/package.json', \
    {paths: [require('path').dirname(require.resolve('react-native/package.json'))]})), 'hermesc', 'osx-bin', 'hermesc')")
  npx expo export:embed --entry-file "$entry" --platform ios --dev false --reset-cache --minify false \
    --bundle-output "$products/main.jsbundle" --assets-dest "$products/$app.app"
  "$hermesc" -emit-binary -max-diagnostic-width=80 -O -out "$products/$app.app/main.jsbundle" "$products/main.jsbundle"
  exit 0
fi

if [ -z "$udid" ] && [ -z "$built" ]; then
  (cd apps/mobile && npx expo prebuild --platform ios)
  xcodebuild -quiet -workspace "apps/mobile/ios/$app.xcworkspace" -scheme "$app" \
    -configuration Release -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
    -derivedDataPath apps/mobile/ios/build CODE_SIGNING_ALLOWED=NO
  built=$products/$app.app
fi
if [ -n "$build_only" ]; then exit 0; fi

fresh=
if [ -z "$udid" ]; then
  # A simulator of its own, so a run never disturbs one that someone else is using.
  fresh=1
  udid=$(xcrun simctl create e2e "iPhone 17")
  trap 'xcrun simctl shutdown "$udid" 2>/dev/null; xcrun simctl delete "$udid"' EXIT
  xcrun simctl boot "$udid"
  xcrun simctl bootstatus "$udid" >/dev/null
  # On a CI runner, a new simulator's push daemon retries Apple's servers without pause and logs
  # thousands of lines a second for as long as it runs, on a runner with three cores. The app
  # uses no push notifications.
  xcrun simctl spawn "$udid" launchctl bootout user/foreground/com.apple.apsd || echo "Could not stop apsd" >&2
  xcrun simctl install "$udid" "$built"
fi

# On a CI runner, the first start of Maestro's iOS driver on a new simulator can take minutes.
export MAESTRO_DRIVER_STARTUP_TIMEOUT=${MAESTRO_DRIVER_STARTUP_TIMEOUT:-300000} # ms

# On CI, the first flow on a new simulator failed three times as often as the others: the first
# keyboard, sheet, menu and swipe stall there. A walk through them first takes that cost.
if [ -n "$fresh" ]; then
  echo "Warming up the new simulator" >&2
  maestro test --device "$udid" scripts/e2e-ios-warmup.yaml >/dev/null 2>&1 || true
fi

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

# A shard takes every n-th flow file from the i-th, in the order the shell sorts them.
# ponytail: that balances the shards only roughly (with the flow times of 2026-11-07, the
# slowest of four takes 23 minutes, against 17 for the best split); split by recent flow
# times if one shard keeps the others waiting.
flows=(apps/mobile/tests/acceptance/e2e)
if [ -n "$shard" ]; then
  all=(apps/mobile/tests/acceptance/e2e/*.yaml) flows=()
  for k in "${!all[@]}"; do
    if [ $((k % ${shard#*/})) -eq $((${shard%/*} - 1)) ]; then flows+=("${all[k]}"); fi
  done
fi

# A flow that fails runs once more, since a slow runner sometimes misses a gesture or loses
# the simulator. The trace counts a flow that passes in either run, as each report is read.
status=0
if ! run maestro "${flows[@]}"; then
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
# The trace runs even when a flow fails, as in check.sh. A shard has only part of the
# reports, so the workflow runs the trace once every shard is done.
if [ -z "$shard" ]; then
  python3 scripts/trace_check.py --e2e --reports reports/e2e/junit || status=1
fi
exit "$status"
