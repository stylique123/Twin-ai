#!/usr/bin/env bash
# Regenerate the offline quality replays in docs/quality/offline-replays/.
# No model call, no network, no database. Plan v6.6 §32: every switch stays OFF.
#
#   bash scripts/quality/run-all.sh [<panel-index.json> [<panel12-snapshot.json>]]
#
# Both arguments are LOCAL files that are never committed: the hashes-only panel
# index (gives panels 5-8 their request goal) and panel 12's stored blueprints.
# Without them the reports cover what the repo fixtures hold (panels 10 and 11,
# and the labeled scripts matched by creator only).
set -euo pipefail
cd "$(dirname "$0")/../.."
OUT=docs/quality/offline-replays
mkdir -p "$OUT"
INDEX_ARG=()
P12_ARG=()
if [ "${1:-}" != "" ]; then INDEX_ARG=("--index=$1"); fi
if [ "${2:-}" != "" ]; then P12_ARG=("--p12=$2"); fi
run() { node --experimental-strip-types --no-warnings --import ./scripts/quality/tsLoader.mjs "$@"; }
run scripts/quality/refillV2Replay.mjs "${P12_ARG[@]}" --json > "$OUT/refill-v2.json"
run scripts/quality/spineBestOfReplay.mjs "${INDEX_ARG[@]}" "${P12_ARG[@]}" --json > "$OUT/spine-best-of-n.json"
run scripts/quality/structureReport.mjs "${INDEX_ARG[@]}" "${P12_ARG[@]}" --json > "$OUT/structure-checks.json"
run scripts/quality/flagsV2Report.mjs "${INDEX_ARG[@]}" --json > "$OUT/flags-v2.json"
echo "wrote $OUT/{refill-v2,spine-best-of-n,structure-checks,flags-v2}.json"
