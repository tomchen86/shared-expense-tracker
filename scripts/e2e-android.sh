#!/usr/bin/env bash
# Runs E2E flows (ADR-0014) on the Release build already on that emulator, on a 360×640 dp screen.
#
#   bash scripts/e2e-android.sh <serial>            the flows tagged android
#   bash scripts/e2e-android.sh <serial> <flow>...  only those flows
#
# Needs Maestro on PATH; the report lands in reports/e2e-android/.
set -euo pipefail
[ $# -ge 1 ] || { echo "usage: bash scripts/e2e-android.sh <serial> [<flow>...]" >&2; exit 2; }
cd "$(dirname "$0")/.."
export MAESTRO_CLI_NO_ANALYTICS=1 MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED=true
serial=$1
shift
[ $# -ge 1 ] || set -- --include-tags android apps/mobile/tests/acceptance/e2e
rm -rf reports/e2e-android && mkdir -p reports/e2e-android

# A small screen, where the keyboard covers part of a form that fits on a bigger one.
trap 'adb -s "$serial" shell wm size reset; adb -s "$serial" shell wm density reset' EXIT
adb -s "$serial" shell wm size 1080x1920
adb -s "$serial" shell wm density 480

maestro test --device "$serial" --format junit --output reports/e2e-android/junit.xml \
  --test-output-dir reports/e2e-android/output "$@"
