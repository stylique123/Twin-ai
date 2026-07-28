#!/usr/bin/env bash
# EXTERNAL reachability probe for the Chrome edge. Runs ON THE CI RUNNER, which
# is outside the VPS — "can the internet reach this" is not a question the host
# can answer about itself.
#
# THE LINE THIS DOES NOT CROSS
# ----------------------------
# It establishes that a door is unlocked. It does not walk through it. No
# DevTools session is opened, no target is attached to, no tab is enumerated, no
# page is navigated, no script is executed, and no credential is guessed. The
# only bytes recorded from any response are a status line, a small set of
# headers that bear on authentication and CORS, a byte count, and a digest.
#
# WHY A DIGEST AND A BOOLEAN INSTEAD OF THE BODY
# ---------------------------------------------
# `/json/version` on an open DevTools endpoint returns a webSocketDebuggerUrl —
# a live control handle. Printing it into an artifact would publish the key to
# the browser. So the body is hashed, its length recorded, and the one fact that
# matters is reduced to a boolean: does a control handle appear at all.
#
#   VPS_HOST=1.2.3.4 bash scripts/ci/probe_chrome_reachability.sh
set -uo pipefail

HOST="${VPS_HOST:?VPS_HOST is required}"
PORTS="${CHROME_PORTS:-6080 9222}"
CONNECT_TIMEOUT="${CONNECT_TIMEOUT:-5}"
MAX_TIME="${MAX_TIME:-8}"

j_str() { if [ -z "${1:-}" ]; then printf 'null'; else printf '"%s"' "$(printf '%s' "$1" | tr -d '"\\' | tr -d '\n')"; fi; }
j_num() { case "${1:-}" in ''|*[!0-9]*) printf 'null' ;; *) printf '%s' "$1" ;; esac; }
j_bool() { case "${1:-}" in true) printf 'true' ;; *) printf 'false' ;; esac; }

printf '{'
printf '"schema":"chrome-reachability/1",'
printf '"probedFrom":"github-actions-runner",'
printf '"ports":['

first=1
for p in $PORTS; do
  [ $first -eq 0 ] && printf ','
  first=0

  # --- TCP: does anything accept a connection at all? ---
  tcp_open=false
  if command -v nc >/dev/null 2>&1; then
    nc -z -w "$CONNECT_TIMEOUT" "$HOST" "$p" >/dev/null 2>&1 && tcp_open=true
  else
    (exec 3<>"/dev/tcp/$HOST/$p") >/dev/null 2>&1 && tcp_open=true
  fi

  http_status=""; http_bytes=""; http_sha=""; www_auth=""; cors=""; ctype=""; server_hdr=""
  has_ws_handle=false; http_reached=false

  if [ "$tcp_open" = true ]; then
    # ONE unauthenticated GET of the version endpoint. No credentials are sent,
    # none are guessed, and nothing else is requested.
    hdrs_file="$(mktemp)"; body_file="$(mktemp)"
    http_status="$(curl -sS -o "$body_file" -D "$hdrs_file" -w '%{http_code}' \
      --connect-timeout "$CONNECT_TIMEOUT" --max-time "$MAX_TIME" \
      "http://$HOST:$p/json/version" 2>/dev/null || printf '')"
    if [ -n "$http_status" ]; then
      http_reached=true
      http_bytes="$(wc -c < "$body_file" 2>/dev/null | tr -d ' ')"
      http_sha="$(sha256sum "$body_file" 2>/dev/null | cut -d' ' -f1)"
      # Headers that bear on whether this is protected. Values are emitted for
      # these three only, because they ARE the authentication posture.
      www_auth="$(grep -iE '^www-authenticate:' "$hdrs_file" 2>/dev/null | head -1 | cut -d: -f2- | tr -d '\r' | sed 's/^ *//')"
      cors="$(grep -iE '^access-control-allow-origin:' "$hdrs_file" 2>/dev/null | head -1 | cut -d: -f2- | tr -d '\r' | sed 's/^ *//')"
      ctype="$(grep -iE '^content-type:' "$hdrs_file" 2>/dev/null | head -1 | cut -d: -f2- | tr -d '\r' | sed 's/^ *//')"
      server_hdr="$(grep -iE '^server:' "$hdrs_file" 2>/dev/null | head -1 | cut -d: -f2- | tr -d '\r' | sed 's/^ *//')"
      # THE FINDING, AS A BOOLEAN. The handle itself is never printed.
      if grep -qi 'webSocketDebuggerUrl' "$body_file" 2>/dev/null; then has_ws_handle=true; fi
    fi
    rm -f "$hdrs_file" "$body_file"
  fi

  printf '{'
  printf '"port":%s,' "$(j_num "$p")"
  printf '"tcpOpen":%s,' "$(j_bool "$tcp_open")"
  printf '"httpReached":%s,' "$(j_bool "$http_reached")"
  printf '"httpStatus":%s,' "$(j_num "$http_status")"
  printf '"bodyBytes":%s,' "$(j_num "$http_bytes")"
  printf '"bodySha256":%s,' "$(j_str "$http_sha")"
  printf '"wwwAuthenticate":%s,' "$(j_str "$www_auth")"
  printf '"accessControlAllowOrigin":%s,' "$(j_str "$cors")"
  printf '"contentType":%s,' "$(j_str "$ctype")"
  printf '"serverHeader":%s,' "$(j_str "$server_hdr")"
  printf '"containsWebSocketDebuggerUrl":%s' "$(j_bool "$has_ws_handle")"
  printf '}'
done

printf ']}'
printf '\n'
