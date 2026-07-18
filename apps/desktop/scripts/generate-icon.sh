#!/usr/bin/env bash
# Rebuild macOS app icons from the web brand SVG.
# Prefers macOS qlmanage for SVG fidelity (ImageMagick's internal SVG
# renderer drops some strokes on this asset). Requires iconutil + magick.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${ROOT}/../web/public/brand/kansoku-icon.svg"
OUT_DIR="${ROOT}/build"
ICONSET="${OUT_DIR}/icon.iconset"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

if [[ ! -f "$SRC" ]]; then
  echo "source SVG missing: $SRC" >&2
  exit 1
fi
if ! command -v magick >/dev/null 2>&1; then
  echo "ImageMagick (magick) required" >&2
  exit 1
fi
if ! command -v iconutil >/dev/null 2>&1; then
  echo "macOS iconutil required" >&2
  exit 1
fi

mkdir -p "$OUT_DIR" "$ICONSET"

CANVAS_SIZE=1024
# macOS Big Sur icon grid: the rounded-rect body occupies ~80.5% of the canvas
# (824 of 1024) with the remaining ~100px each side left transparent, so the app
# icon reads at the same visual size as its dock neighbors. Rendering full-bleed
# makes this icon look oversized. We render the mark into the body square, then
# center it on a transparent canvas with that padding.
BODY_SIZE=824
# Rounded-corner radius in body pixels, kept in sync with the source SVG
# (rx=112 within a 512 viewBox). Color-keying white out of the corners aliases
# the arc and leaves a gray fringe; instead we cut the corners with a
# supersampled rounded-rect mask so the edge is anti-aliased and the base pure.
CORNER_RADIUS=$(( BODY_SIZE * 112 / 512 ))
MASK="$TMP_DIR/mask.png"
magick -size "$((BODY_SIZE * 4))x$((BODY_SIZE * 4))" xc:black \
  -fill white -draw "roundrectangle 0,0 $((BODY_SIZE * 4 - 1)),$((BODY_SIZE * 4 - 1)) $((CORNER_RADIUS * 4)),$((CORNER_RADIUS * 4))" \
  -filter Lanczos -resize "${BODY_SIZE}x${BODY_SIZE}" "$MASK"

BODY="$TMP_DIR/body.png"
# qlmanage writes <basename>.png into -o dir; it renders the mark on an opaque
# white canvas. We keep its stroke fidelity (ImageMagick's SVG renderer drops
# the yellow mid-stroke) and punch the transparent corners with the mask above.
if command -v qlmanage >/dev/null 2>&1; then
  qlmanage -t -s "$BODY_SIZE" -o "$TMP_DIR" "$SRC" >/dev/null
  RAW="$TMP_DIR/$(basename "$SRC").png"
  if [[ ! -f "$RAW" ]]; then
    echo "qlmanage did not produce a thumbnail" >&2
    exit 1
  fi
  magick "$RAW" "$MASK" -alpha Off -compose CopyOpacity -composite -depth 8 "$BODY"
else
  echo "warning: qlmanage missing, falling back to ImageMagick (may drop strokes)" >&2
  magick -background none -density "$BODY_SIZE" "$SRC" -resize "${BODY_SIZE}x${BODY_SIZE}" \
    "$MASK" -alpha Off -compose CopyOpacity -composite -depth 8 "$BODY"
fi

magick "$BODY" -background none -gravity center -extent "${CANVAS_SIZE}x${CANVAS_SIZE}" -depth 8 "$OUT_DIR/icon.png"

for size in 16 32 128 256 512; do
  magick "$OUT_DIR/icon.png" -resize "${size}x${size}" "$ICONSET/icon_${size}x${size}.png"
  magick "$OUT_DIR/icon.png" -resize "$((size * 2))x$((size * 2))" "$ICONSET/icon_${size}x${size}@2x.png"
done

iconutil -c icns "$ICONSET" -o "$OUT_DIR/icon.icns"
rm -rf "$ICONSET"

echo "wrote $OUT_DIR/icon.png and $OUT_DIR/icon.icns"
