#!/usr/bin/env bash
# Explicit notarization, replacing electron-builder's built-in path (pinned off
# via mac.notarize: false in apps/desktop/electron-builder.yml): builder shells
# out to `notarytool submit --wait` with NO timeout, and a slow Apple queue hung
# the package step until the job's 60-minute limit killed the whole build
# (2026-07-29, run 30435930188). Owning the wait here bounds it, keeps the
# submission id in the step log, and prints the notarytool log on rejection.
set -euo pipefail

APP_PATH="${1:?usage: notarize-and-staple.sh <path/to/App.app>}"
: "${APPLE_ID:?APPLE_ID env var is required}"
: "${APPLE_APP_SPECIFIC_PASSWORD:?APPLE_APP_SPECIFIC_PASSWORD env var is required}"
: "${APPLE_TEAM_ID:?APPLE_TEAM_ID env var is required}"
WAIT_TIMEOUT="${NOTARY_WAIT_TIMEOUT:-20m}"

AUTH=(--apple-id "$APPLE_ID" --password "$APPLE_APP_SPECIFIC_PASSWORD" --team-id "$APPLE_TEAM_ID")

UPLOAD_ZIP="$(mktemp -d)/notarize-upload.zip"
ditto -c -k --keepParent "$APP_PATH" "$UPLOAD_ZIP"

SUBMISSION_ID="$(xcrun notarytool submit "$UPLOAD_ZIP" "${AUTH[@]}" --output-format json | jq -r '.id')"
if [ -z "$SUBMISSION_ID" ] || [ "$SUBMISSION_ID" = "null" ]; then
  echo "::error::notarytool submit returned no submission id"
  exit 1
fi
echo "notarization submission id: $SUBMISSION_ID"

# wait exits non-zero on timeout; the info call below is the authority on what
# actually happened, so the wait itself must not fail the step.
xcrun notarytool wait "$SUBMISSION_ID" "${AUTH[@]}" --timeout "$WAIT_TIMEOUT" || true

STATUS="$(xcrun notarytool info "$SUBMISSION_ID" "${AUTH[@]}" --output-format json | jq -r '.status')"
echo "notarization status: $STATUS"
case "$STATUS" in
  Accepted) ;;
  'In Progress')
    echo "::error::notarization still In Progress after $WAIT_TIMEOUT — the submission stays queued at Apple; check \`xcrun notarytool history\` and re-run the workflow once it clears (submission $SUBMISSION_ID)"
    exit 1
    ;;
  *)
    xcrun notarytool log "$SUBMISSION_ID" "${AUTH[@]}" || true
    echo "::error::notarization finished as '$STATUS' — see the notarytool log above (submission $SUBMISSION_ID)"
    exit 1
    ;;
esac

xcrun stapler staple "$APP_PATH"
