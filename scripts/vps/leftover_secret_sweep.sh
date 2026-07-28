#!/usr/bin/env bash
# READ-ONLY sweep of the host paths the retirement did not delete.
#
# THE QUESTION
# ------------
# The Stylique retirement removed every container, image, volume and network in
# scope, but there is no command family for deleting HOST PATHS, so /srv/caddy,
# /srv/dashboard and /opt/scrapling-test survive. They are inert — nothing runs
# that reads them — but "inert" and "harmless" are different claims. A Caddyfile
# is exactly the kind of file that carries basicauth hashes, upstream tokens or
# API keys, and leaving credentials on disk is a finding whether or not anything
# is currently serving them.
#
# WHAT IT EMITS, AND WHAT IT CANNOT
# ---------------------------------
# Shapes and counts. Every value that could BE a secret is reduced to
# (file, matched pattern name, count) — never the matched text, never a
# surrounding line, never the file. A sweep that printed what it found would
# copy the credentials it is warning about into a CI log that is far more widely
# readable than the file was.
#
# File names and sizes DO travel: they are the thing the founder acts on, and a
# path is not a secret.
#
# EVERY CHANNEL CARRIES A STATUS
# ------------------------------
# read-complete | absent | unreadable | truncated. An absent path is not a clean
# path, and a path that could not be read is not an empty one. "No matches" and
# "nothing was looked at" produce the same empty list, so the status is the only
# thing that tells them apart.
set -uo pipefail

PATHS="/srv/caddy /srv/dashboard /opt/scrapling-test"
# Bounded so a directory full of node_modules cannot turn this into an
# unbounded read. A cap that is hit is REPORTED, never silently applied.
FILE_CAP=400
SIZE_CAP_KB=512

j_str() { if [ -z "${1:-}" ]; then printf 'null'; else printf '"%s"' "$(printf '%s' "$1" | tr -d '"\\' | tr -d '\n')"; fi; }
j_num() { case "${1:-}" in ''|*[!0-9]*) printf 'null' ;; *) printf '%s' "$1" ;; esac; }
j_arr() {
  printf '['
  local first=1 x
  while IFS= read -r x; do
    [ -z "$x" ] && continue
    [ $first -eq 0 ] && printf ','
    printf '%s' "$(j_str "$x")"
    first=0
  done
  printf ']'
}

# PATTERN NAME -> regex. The NAME travels; the match never does.
#
# Deliberately shape-based rather than keyword-based where it matters: a line
# reading `password` may be a comment, while a 40-char base64 run assigned to a
# variable is a credential whatever it is called.
PAT_NAMES="basicauth private_key_block aws_key_id bearer_token long_secret_assignment env_secret_key url_with_credentials"
pat_for() {
  case "$1" in
    basicauth)                printf '%s' 'basic_?auth|htpasswd' ;;
    private_key_block)        printf '%s' 'BEGIN (RSA |EC |OPENSSH |PGP )?PRIVATE KEY' ;;
    aws_key_id)               printf '%s' 'AKIA[0-9A-Z]{16}' ;;
    bearer_token)             printf '%s' '[Bb]earer [A-Za-z0-9._~+/-]{20,}' ;;
    long_secret_assignment)   printf '%s' '(secret|token|passwd|password|apikey|api_key)[^=:]{0,12}[=:][[:space:]]*[A-Za-z0-9+/_.=-]{24,}' ;;
    env_secret_key)           printf '%s' '^[[:space:]]*[A-Z0-9_]*(SECRET|TOKEN|PASSWORD|APIKEY|API_KEY|CREDENTIAL)[A-Z0-9_]*[[:space:]]*=' ;;
    url_with_credentials)     printf '%s' '[a-zA-Z][a-zA-Z0-9+.-]*://[^/[:space:]:@]+:[^/[:space:]@]+@' ;;
  esac
}

path_rows=""
finding_rows=""
overall=read-complete

for p in $PATHS; do
  if [ ! -e "$p" ]; then
    path_rows="$path_rows$p|absent|0|0
"
    continue
  fi
  if [ ! -r "$p" ]; then
    path_rows="$path_rows$p|unreadable|0|0
"
    overall=unreadable
    continue
  fi

  kb="$(du -sk "$p" 2>/dev/null | awk '{print $1}')"
  # Regular files only, and only ones small enough to be configuration. A
  # 2 GB blob is not a Caddyfile and reading it proves nothing.
  files="$(find "$p" -type f -size -"${SIZE_CAP_KB}"k 2>/dev/null | LC_ALL=C sort)"
  n="$(printf '%s' "$files" | grep -c . || echo 0)"
  st=read-complete
  if [ "$n" -gt "$FILE_CAP" ]; then
    st=truncated
    overall=truncated
    files="$(printf '%s\n' "$files" | head -"$FILE_CAP")"
  fi
  path_rows="$path_rows$p|$st|${kb:-0}|$n
"

  while IFS= read -r f; do
    [ -z "$f" ] && continue
    for name in $PAT_NAMES; do
      re="$(pat_for "$name")"
      # -I skips binaries. The COUNT is taken; the matching text is discarded by
      # never being substituted anywhere. -c prints a number and nothing else.
      c="$(grep -I -c -a -E "$re" "$f" 2>/dev/null)" || c=0
      case "$c" in ''|*[!0-9]*) c=0 ;; esac
      [ "$c" -gt 0 ] && finding_rows="$finding_rows$f|$name|$c
"
    done
  done <<EOF
$files
EOF
done

printf '{'
printf '"schema":"leftover-secret-sweep/1",'
printf '"paths":%s,' "$(printf '%s' "$path_rows" | j_arr)"
printf '"findings":%s,' "$(printf '%s' "$finding_rows" | j_arr)"
printf '"patternNames":%s,' "$(printf '%s' "$PAT_NAMES" | tr ' ' '\n' | j_arr)"
printf '"fileCap":%s,' "$(j_num "$FILE_CAP")"
printf '"sizeCapKb":%s,' "$(j_num "$SIZE_CAP_KB")"
printf '"status":%s' "$(j_str "$overall")"
printf '}\n'
