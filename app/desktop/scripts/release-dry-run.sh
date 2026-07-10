#!/usr/bin/env bash
set -euo pipefail

SPARKLE_VERSION="2.9.4"
SPARKLE_TARBALL_SHA256="ce89daf967db1e1893ed3ebd67575ed82d3902563e3191ca92aaec9164fbdef9"
REPO_SLUG="Innei/trade-skills"
DESKTOP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK_DIR="$(mktemp -d /tmp/trade-desktop-release-dry-run.XXXXXX)"
ACCOUNT="trade-dryrun-$$-$RANDOM"
RAM_DEV=""

log() { echo "[dry-run] $*"; }

cleanup() {
  log "cleaning up"
  if [ -n "$RAM_DEV" ]; then
    hdiutil detach "$RAM_DEV" >/dev/null 2>&1 || true
  fi
  security delete-generic-password -a "$ACCOUNT" -s "https://sparkle-project.org" >/dev/null 2>&1 || true
  if [ -n "${KEEP_WORK_DIR:-}" ]; then
    log "KEEP_WORK_DIR set, leaving artifacts at $WORK_DIR"
  else
    rm -rf "$WORK_DIR"
  fi
  # electron-builder.yml is restored even on failure so a dry run never leaves
  # a real key or a broken placeholder in the working tree.
  git -C "$DESKTOP_DIR" checkout -- electron-builder.yml package.json 2>/dev/null || true
}
trap cleanup EXIT

log "work dir: $WORK_DIR"

# electron-builder's `identity: null` leaves Electron's own ad-hoc signature on
# the main executable, but adding extraResources/asarUnpack after that breaks
# the bundle's CodeDirectory (resources hash no longer matches). Sparkle's
# generate_appcast refuses to read an archive whose .app doesn't pass
# `codesign --verify --deep --strict`, so the zip must be re-signed ad-hoc (no
# paid identity/cert needed) right after packaging, before it's fed to
# generate_appcast. Re-zip with ditto, not `zip`, so the resigned bundle's
# resource forks/xattrs survive.
#
# generate_appcast also turns out to only emit sparkle:edSignature for an
# archive whose .app declares SUPublicEDKey in Info.plist — it treats that key
# as the signal that the app expects signed updates. The Sparkle bridge task
# (electron-phase2-t6, landed on a sibling branch, not yet merged into this
# one) wires that key in via electron-builder.yml's extendInfo at build time;
# until this branch has it, PlistBuddy injects the same key post-build so the
# dry run still exercises the real "app declares SUPublicEDKey -> generate_appcast
# signs" path end to end, not a hand-waved stand-in.
#
# KNOWN GAP (see report): the .dmg electron-builder produces embeds the SAME
# broken-signature .app and is NOT re-signed here — rebuilding it via `hdiutil
# create` hit a reproducible, unexplained "No such file or directory" in this
# script's process tree (reliable here, but a bare repro of the identical
# hdiutil command outside the script succeeds every time). Given this is a
# CI-glue script and not the place to own electron-builder.yml's signing
# config, the fix belongs in an electron-builder `afterPack` hook (ad-hoc sign
# once, before both dmg and zip targets are built) — flagged for whoever owns
# electron-builder.yml next. Until then the dmg is upload-only, for reference;
# production auto-updates only ever consume the (correctly resigned) zip.
resign_zip() {
  local app_dir="$1" zip_path="$2" public_key="$3"
  local app_name plist
  app_name="$(basename "$app_dir")"
  plist="$app_dir/Contents/Info.plist"
  if ! /usr/libexec/PlistBuddy -c "Print :SUPublicEDKey" "$plist" >/dev/null 2>&1; then
    /usr/libexec/PlistBuddy -c "Add :SUPublicEDKey string $public_key" "$plist"
  fi
  codesign --force --deep --sign - "$app_dir" >/dev/null
  codesign --verify --deep --strict "$app_dir"
  rm -f "$zip_path"
  ( cd "$(dirname "$app_dir")" && ditto -c -k --sequesterRsrc --keepParent "$app_name" "$zip_path" )
}

log "== fetch Sparkle $SPARKLE_VERSION tools =="
SPARKLE_BIN="$WORK_DIR/sparkle/bin"
mkdir -p "$WORK_DIR/sparkle"
curl -sSL -o "$WORK_DIR/sparkle.tar.xz" \
  "https://github.com/sparkle-project/Sparkle/releases/download/${SPARKLE_VERSION}/Sparkle-${SPARKLE_VERSION}.tar.xz"
echo "${SPARKLE_TARBALL_SHA256}  $WORK_DIR/sparkle.tar.xz" | shasum -a 256 -c -
tar -xf "$WORK_DIR/sparkle.tar.xz" -C "$WORK_DIR/sparkle" bin/
chmod +x "$SPARKLE_BIN"/*
export PATH="$SPARKLE_BIN:$PATH"

log "== generate throwaway EdDSA keypair (Keychain account: $ACCOUNT) =="
generate_keys --account "$ACCOUNT" >/dev/null
PUBLIC_KEY="$(generate_keys --account "$ACCOUNT" -p)"
generate_keys --account "$ACCOUNT" -x "$WORK_DIR/ed_private_key"
log "public key: $PUBLIC_KEY"

log "== inject SUPublicEDKey placeholder (best-effort — Sparkle bridge lands in a sibling task) =="
PLACEHOLDER="SPARKLE_ED_PUBLIC_KEY_PLACEHOLDER"
if grep -q "$PLACEHOLDER" "$DESKTOP_DIR/electron-builder.yml"; then
  sed -i '' "s|$PLACEHOLDER|$PUBLIC_KEY|" "$DESKTOP_DIR/electron-builder.yml"
  log "placeholder replaced"
else
  log "WARNING: placeholder not present in electron-builder.yml yet (expected until the Sparkle bridge task lands) — skipping, this step is a hard failure in real CI"
fi

log "== build an OLD version first, to give generate_appcast a delta base =="
OLD_VERSION="0.0.1-dryrun-old"
NODE_VERSION="$(node -p "require('$DESKTOP_DIR/package.json').version")"
node -e "
const fs = require('node:fs');
const p = '$DESKTOP_DIR/package.json';
const pkg = JSON.parse(fs.readFileSync(p, 'utf8'));
pkg.version = '$OLD_VERSION';
fs.writeFileSync(p, JSON.stringify(pkg, null, 2) + '\n');
"
rm -rf "$DESKTOP_DIR/node_modules/better-sqlite3/build" "$HOME/Library/Caches/electron-rebuild"
( cd "$DESKTOP_DIR" && pnpm package )
OLD_ZIP_PATH="$(ls "$DESKTOP_DIR"/release/*.zip)"
resign_zip "$DESKTOP_DIR/release/mac-arm64"/*.app "$OLD_ZIP_PATH" "$PUBLIC_KEY"
mkdir -p "$WORK_DIR/archive"
cp "$OLD_ZIP_PATH" "$WORK_DIR/archive/"
rm -rf "$DESKTOP_DIR/release"

log "== restore real version ($NODE_VERSION) and build the NEW build =="
node -e "
const fs = require('node:fs');
const p = '$DESKTOP_DIR/package.json';
const pkg = JSON.parse(fs.readFileSync(p, 'utf8'));
pkg.version = '$NODE_VERSION';
fs.writeFileSync(p, JSON.stringify(pkg, null, 2) + '\n');
"
rm -rf "$DESKTOP_DIR/node_modules/better-sqlite3/build" "$HOME/Library/Caches/electron-rebuild"
( cd "$DESKTOP_DIR" && pnpm package )
NEW_ZIP_PATH="$(ls "$DESKTOP_DIR"/release/*.zip)"
NEW_DMG_PATH="$(ls "$DESKTOP_DIR"/release/*.dmg)"
resign_zip "$DESKTOP_DIR/release/mac-arm64"/*.app "$NEW_ZIP_PATH" "$PUBLIC_KEY"
NEW_DMG="$(basename "$NEW_DMG_PATH")"
NEW_ZIP="$(basename "$NEW_ZIP_PATH")"
cp "$NEW_ZIP_PATH" "$WORK_DIR/archive/"
mkdir -p "$WORK_DIR/upload"
cp "$NEW_DMG_PATH" "$NEW_ZIP_PATH" "$WORK_DIR/upload/"

log "built: $NEW_DMG, $NEW_ZIP (delta base: $(ls "$WORK_DIR/archive"/*.zip | wc -l | tr -d ' ') zip(s) in archive)"

log "== sign + generate appcast on a RAM disk (private key never touches persistent storage) =="
RAM_DEV="$(hdiutil attach -nomount ram://16384 | awk '{print $1}')"
diskutil erasevolume HFS+ SparkleKeyDryRun "$RAM_DEV" >/dev/null
KEY_FILE="/Volumes/SparkleKeyDryRun/ed_private_key"
cp "$WORK_DIR/ed_private_key" "$KEY_FILE"

generate_appcast \
  --ed-key-file "$KEY_FILE" \
  --download-url-prefix "https://github.com/${REPO_SLUG}/releases/download/desktop-v${NODE_VERSION}/" \
  "$WORK_DIR/archive"

dd if=/dev/urandom of="$KEY_FILE" bs=1024 count=4 conv=notrunc 2>/dev/null
rm -f "$KEY_FILE"
hdiutil detach "$RAM_DEV" >/dev/null
RAM_DEV=""

log "== validate appcast.xml =="
APPCAST="$WORK_DIR/archive/appcast.xml"
test -f "$APPCAST" || { log "FAIL: appcast.xml not produced"; exit 1; }
if xmllint --noout "$APPCAST"; then
  log "appcast.xml is well-formed XML"
else
  log "FAIL: appcast.xml is not valid XML"
  exit 1
fi

python3 - "$APPCAST" "$REPO_SLUG" <<'PY'
import sys
import xml.etree.ElementTree as ET

path, repo_slug = sys.argv[1], sys.argv[2]
ns = {"sparkle": "http://www.andymatuschak.org/xml-namespaces/sparkle"}
tree = ET.parse(path)
items = tree.findall(".//item")
assert items, "no <item> entries in appcast.xml"

sparkle_ns = "{http://www.andymatuschak.org/xml-namespaces/sparkle}"
# newest item is whichever has the highest sparkle:version, not list order
def item_version(it):
    v = it.find(f"{sparkle_ns}version")
    return v.text if v is not None else ""

item = max(items, key=item_version)
enclosure = item.find("enclosure")
assert enclosure is not None, "missing <enclosure>"

version_el = item.find(f"{sparkle_ns}version")
short_version_el = item.find(f"{sparkle_ns}shortVersionString")
version = version_el.text if version_el is not None else None
short_version = short_version_el.text if short_version_el is not None else None
url = enclosure.get("url", "")
ed_sig = enclosure.get(f"{sparkle_ns}edSignature")
length = enclosure.get("length")

assert f"github.com/{repo_slug}/releases/download/" in url, f"unexpected enclosure url: {url}"
assert version, "missing sparkle:version"
assert short_version, "missing sparkle:shortVersionString"
assert ed_sig, "missing sparkle:edSignature"
assert length and int(length) > 0, "missing/invalid length"

deltas = item.findall(".//sparkle:deltas/enclosure", ns)
print(f"OK: enclosure url={url}")
print(f"OK: sparkle:version={version} shortVersionString={short_version}")
print(f"OK: sparkle:edSignature present (len={len(ed_sig)}) length={length}")
print(f"OK: {len(deltas)} delta enclosure(s) present")
assert len(deltas) >= 1, "expected at least one delta enclosure"
PY

DELTA_COUNT="$(find "$WORK_DIR/archive" -maxdepth 1 -name '*.delta' | wc -l | tr -d ' ')"
log "== summary =="
log "dmg: $NEW_DMG"
log "zip: $NEW_ZIP"
log "appcast.xml: valid, ${DELTA_COUNT} delta file(s) on disk"
log "archive dir: $WORK_DIR/archive (kept only if KEEP_WORK_DIR=1 was set)"
log "DRY RUN PASSED"
