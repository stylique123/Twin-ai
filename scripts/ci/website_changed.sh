#!/usr/bin/env bash
# Prints deploy=true|false for deploy-production. FAIL OPEN: anything unsure prints true.
# Usage: website_changed.sh <event_name> <before_sha> <after_sha>
set -u
event="${1:-}"; before="${2:-}"; after="${3:-}"
# The paths the website build reads (vercel.json: npm install, then build @twinai/web).
PATHS=(apps/web packages/shared package.json package-lock.json vercel.json)

yes() { echo "reason: $1" >&2; echo "deploy=true"; exit 0; }

[ "$event" = "push" ] || yes "not a push ($event): always deploy"
case "$before" in ''|0000000000000000000000000000000000000000) yes "no base commit";; esac
git cat-file -e "${before}^{commit}" 2>/dev/null || yes "base commit not available"
changed="$(git diff --name-only "$before" "$after" -- "${PATHS[@]}" 2>/dev/null)" || yes "git diff failed"
if [ -n "$changed" ]; then
  yes "website paths changed: $(echo "$changed" | wc -l) file(s)"
fi
echo "reason: no website path changed" >&2
echo "deploy=false"
