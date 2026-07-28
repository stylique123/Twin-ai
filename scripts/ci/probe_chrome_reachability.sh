#!/usr/bin/env bash
# EXTERNAL reachability probe for the Chrome edge. Runs ON THE CI RUNNER, which
# is outside the VPS — "can the internet reach this" is not a question the host
# can answer about itself.
#
# THE LINE THIS DOES NOT CROSS
# ----------------------------
# It establishes that a door is unlocked. It does not walk through it. No
# DevTools session is opened, no target attached, no tab enumerated, no page
# navigated, nothing executed, no credential guessed. The only bytes recorded
# from any response are a status code, a small set of headers that bear on
# authentication and CORS, a byte count, and a digest.
#
# WHY A DIGEST AND A BOOLEAN INSTEAD OF THE BODY
# ---------------------------------------------
# `/json/version` on an open DevTools endpoint returns a webSocketDebuggerUrl —
# a live control handle. Printing it into an artifact would publish the key to
# the browser. So the body is hashed, its length recorded, and the one fact that
# matters is reduced to a boolean.
#
# `000` IS NOT A STATUS CODE
# --------------------------
# curl's `-w '%{http_code}'` prints `000` when no HTTP response was ever parsed
# — DNS failure, refused connection, timeout, TLS error. An earlier revision
# treated "the substitution produced something" as "HTTP answered", so a port
# that opened TCP and then never spoke HTTP was recorded as reached. That is
# false-safe in the worst direction: it manufactures evidence of a service. A
# response now counts only when curl exits 0 AND the code parses as 1xx-5xx,
# and every other outcome is an allowlisted error class.
set -uo pipefail

HOST="${VPS_HOST:?VPS_HOST is required}"
PORTS="${CHROME_PORTS:-6080 9222}"
CONNECT_TIMEOUT="${CONNECT_TIMEOUT:-5}"
MAX_TIME="${MAX_TIME:-8}"
# A version banner is a few hundred bytes. Anything larger is not the thing we
# asked for, and reading it would be reading a page.
MAX_BODY_BYTES="${MAX_BODY_BYTES:-16384}"

j_str() { if [ -z "${1:-}" ]; then printf 'null'; else printf '"%s"' "$(printf '%s' "$1" | tr -d '"\\' | tr -d '\n')"; fi; }
j_num() { case "${1:-}" in ''|*[!0-9]*) printf 'null' ;; *) printf '%s' "$1" ;; esac; }
j_bool() { case "${1:-}" in true) printf 'true' ;; *) printf 'false' ;; esac; }

# curl exit code -> allowlisted class. A fixed vocabulary, so no message text
# (which can echo server output) ever reaches the artifact.
err_class() {
  case "$1" in
    0)  printf 'none' ;;
    6)  printf 'dns' ;;
    7)  printf 'connect-refused' ;;
    28) printf 'timeout' ;;
    35|60|77) printf 'tls' ;;
    52) printf 'empty-reply' ;;
    56) printf 'recv-error' ;;
    1|2) printf 'protocol' ;;
    63) printf 'body-too-large' ;;
    *)  printf 'other' ;;
  esac
}

printf '{'
printf '"schema":"chrome-reachability/2",'
printf '"probedFrom":"github-actions-runner",'
printf '"maxBodyBytes":%s,' "$(j_num "$MAX_BODY_BYTES")"
printf '"ports":['

first=1
for p in $PORTS; do
  [ $first -eq 0 ] && printf ','
  first=0

  tcp_open=false
  if command -v nc >/dev/null 2>&1; then
    nc -z -w "$CONNECT_TIMEOUT" "$HOST" "$p" >/dev/null 2>&1 && tcp_open=true
  else
    (exec 3<>"/dev/tcp/$HOST/$p") >/dev/null 2>&1 && tcp_open=true
  fi

  http_reached=false; http_status=""; http_bytes=""; http_sha=""
  www_auth=""; cors=""; ctype=""; server_hdr=""
  has_ws_handle=false; curl_rc=""; error_class="not-attempted"; oversize=false

  if [ "$tcp_open" = true ]; then
    hdrs_file="$(mktemp)"; body_file="$(mktemp)"; code_file="$(mktemp)"
    # --max-filesize makes curl ABORT rather than download an oversize body, so
    # a hostile or unexpected endpoint cannot stream a page into the runner.
    curl -sS -o "$body_file" -D "$hdrs_file" -w '%{http_code}' \
      --connect-timeout "$CONNECT_TIMEOUT" --max-time "$MAX_TIME" \
      --max-filesize "$MAX_BODY_BYTES" \
      "http://$HOST:$p/json/version" > "$code_file" 2>/dev/null
    curl_rc=$?
    error_class="$(err_class "$curl_rc")"
    raw_code="$(tr -dc '0-9' < "$code_file" 2>/dev/null)"

    # BOTH conditions. A zero exit with `000` still means no response was parsed.
    case "$raw_code" in
      [1-5][0-9][0-9])
        if [ "$curl_rc" -eq 0 ]; then
          http_reached=true
          http_status="$raw_code"
        fi
        ;;
    esac

    if [ "$http_reached" = true ]; then
      http_bytes="$(wc -c < "$body_file" 2>/dev/null | tr -d ' ')"
      if [ "${http_bytes:-0}" -gt "$MAX_BODY_BYTES" ]; then
        oversize=true
      else
        http_sha="$(sha256sum "$body_file" 2>/dev/null | cut -d' ' -f1)"
        # THE FINDING, AS A BOOLEAN. Matched case-insensitively on the property
        # NAME and on either scheme; the handle itself is never printed.
        if grep -qiE 'websocketdebuggerurl|wss?://' "$body_file" 2>/dev/null; then has_ws_handle=true; fi
      fi
      www_auth="$(grep -iE '^www-authenticate:' "$hdrs_file" 2>/dev/null | head -1 | cut -d: -f2- | tr -d '\r' | sed 's/^ *//')"
      cors="$(grep -iE '^access-control-allow-origin:' "$hdrs_file" 2>/dev/null | head -1 | cut -d: -f2- | tr -d '\r' | sed 's/^ *//')"
      ctype="$(grep -iE '^content-type:' "$hdrs_file" 2>/dev/null | head -1 | cut -d: -f2- | tr -d '\r' | sed 's/^ *//')"
      server_hdr="$(grep -iE '^server:' "$hdrs_file" 2>/dev/null | head -1 | cut -d: -f2- | tr -d '\r' | sed 's/^ *//')"
    fi
    rm -f "$hdrs_file" "$body_file" "$code_file"
  fi

  printf '{'
  printf '"port":%s,' "$(j_num "$p")"
  printf '"tcpOpen":%s,' "$(j_bool "$tcp_open")"
  printf '"httpReached":%s,' "$(j_bool "$http_reached")"
  printf '"errorClass":%s,' "$(j_str "$error_class")"
  printf '"curlExit":%s,' "$(j_num "$curl_rc")"
  printf '"httpStatus":%s,' "$(j_num "$http_status")"
  printf '"bodyBytes":%s,' "$(j_num "$http_bytes")"
  printf '"bodyOversize":%s,' "$(j_bool "$oversize")"
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
