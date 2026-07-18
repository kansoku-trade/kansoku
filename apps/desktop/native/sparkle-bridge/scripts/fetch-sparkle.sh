#!/usr/bin/env bash
set -euo pipefail

SPARKLE_VERSION="2.9.4"
SPARKLE_URL="https://github.com/sparkle-project/Sparkle/releases/download/${SPARKLE_VERSION}/Sparkle-${SPARKLE_VERSION}.tar.xz"
SPARKLE_SHA256="ce89daf967db1e1893ed3ebd67575ed82d3902563e3191ca92aaec9164fbdef9"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRIDGE_DIR="$(dirname "$SCRIPT_DIR")"
VENDOR_DIR="$BRIDGE_DIR/vendor"
STAMP_FILE="$VENDOR_DIR/.sparkle-${SPARKLE_VERSION}.stamp"

if [ -f "$STAMP_FILE" ] && [ -d "$VENDOR_DIR/Sparkle.framework" ]; then
  echo "[fetch-sparkle] Sparkle ${SPARKLE_VERSION} already vendored, skipping"
  exit 0
fi

rm -rf "$VENDOR_DIR"
mkdir -p "$VENDOR_DIR"

TARBALL="$VENDOR_DIR/Sparkle-${SPARKLE_VERSION}.tar.xz"
echo "[fetch-sparkle] downloading $SPARKLE_URL"
curl -fsSL -o "$TARBALL" "$SPARKLE_URL"

ACTUAL_SHA256="$(shasum -a 256 "$TARBALL" | awk '{print $1}')"
if [ "$ACTUAL_SHA256" != "$SPARKLE_SHA256" ]; then
  echo "[fetch-sparkle] sha256 mismatch: expected $SPARKLE_SHA256, got $ACTUAL_SHA256" >&2
  rm -f "$TARBALL"
  exit 1
fi

echo "[fetch-sparkle] extracting"
tar -xf "$TARBALL" -C "$VENDOR_DIR" "Sparkle.framework" "bin/generate_keys" "bin/sign_update"
rm -f "$TARBALL"

touch "$STAMP_FILE"
echo "[fetch-sparkle] done — Sparkle.framework + generate_keys/sign_update at $VENDOR_DIR"
