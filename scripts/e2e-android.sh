#!/usr/bin/env bash
# Runs the E2E flows tagged android (ADR-0014) on the app already on that emulator, on a
# 360×640 dp screen: bash scripts/e2e-android.sh <serial>
#
# Needs Maestro on PATH; the report lands in reports/e2e-android/.
set -euo pipefail
[ $# -eq 1 ] || { echo "usage: bash scripts/e2e-android.sh <serial>" >&2; exit 2; }
cd "$(dirname "$0")/.."
export MAESTRO_CLI_NO_ANALYTICS=1 MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED=true
serial=$1
rm -rf reports/e2e-android && mkdir -p reports/e2e-android

# A small screen, where the keyboard covers part of a form that fits on a bigger one.
adb -s "$serial" shell wm size 1080x1920
adb -s "$serial" shell wm density 480
trap 'adb -s "$serial" shell wm size reset; adb -s "$serial" shell wm density reset' EXIT

maestro test --device "$serial" --include-tags android --format junit \
  --output reports/e2e-android/junit.xml --test-output-dir reports/e2e-android/output \
  apps/mobile/tests/acceptance/e2e
