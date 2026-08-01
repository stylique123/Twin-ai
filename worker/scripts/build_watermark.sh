#!/usr/bin/env bash
# Regenerate the free-tier watermark PNG from its vector source.
#
# THE PNG IS COMMITTED, and this script is why that is not a mystery binary in
# the tree: the asset is reproducible from `assets/twinai-mark.svg` plus the
# pinned DejaVu Sans Bold, and its sha256 is pinned in render_catalog_v1.json
# exactly the way the caption fonts are. A substituted watermark is then a
# `render_watermark_integrity_failed`, not a silent change to what every free
# user's video carries.
#
# WHY A RASTER AT ALL, given the mark is vector. ffmpeg's SVG decoding comes
# from librsvg, which is an OPTIONAL build flag — the production worker image
# is not guaranteed to have it, and a renderer whose watermark depends on an
# optional decoder is a renderer that silently stops watermarking on a rebuild.
# The PNG has no such dependency.
#
# WHY THE WORDMARK IS DRAWN RATHER THAN SET IN THE BRAND FACE. Only DejaVu is
# licensed into the container and pinned by digest (see the catalog's font
# comment). If the real brand face is ever added to that pin, change FONT here
# and regenerate — the catalog digest changing is the intended signal.
#
# Usage:  worker/scripts/build_watermark.sh
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(dirname "$here")"
svg="$root/assets/twinai-mark.svg"
out="$root/assets/twinai-watermark.png"

FONT="${WATERMARK_FONT:-/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf}"
[ -f "$svg" ]  || { echo "missing vector source: $svg" >&2; exit 1; }
[ -f "$FONT" ] || { echo "missing font: $FONT" >&2; exit 1; }

# Rendered at roughly 2x its largest intended display width so the graph's
# downscale stays crisp. The canvas is transparent; the overlay's opacity is
# applied by the render graph from the catalog, NOT baked in here — baking it
# would make the opacity unauditable and un-tunable without a new binary.
ffmpeg -hide_banner -loglevel error -nostdin -y \
  -f lavfi -i "color=c=black@0:s=660x180,format=rgba" \
  -i "$svg" \
  -filter_complex "\
[1:v]scale=144:144[m];\
[0:v][m]overlay=x=12:y=18[a];\
[a]drawtext=fontfile='$FONT':text='TwinAI':fontcolor=0xF6F1E9:fontsize=92:x=174:y=44" \
  -frames:v 1 -update 1 "$out"

echo "wrote $out"
echo "sha256: $(sha256sum "$out" | cut -d' ' -f1)"
echo
echo "Pin that digest at .watermark.sha256 in worker/render_catalog_v1.json."
