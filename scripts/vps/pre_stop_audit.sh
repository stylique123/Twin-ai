#!/usr/bin/env bash
# READ-ONLY pre-stop audit, executed ON THE HOST over the existing pinned-host-key
# SSH path (piped in via `ssh ... bash -s`, exactly like the inventory collector).
#
# It answers the two questions that must be settled before `stop` is ever
# authorised, and it answers them with evidence rather than assertion:
#
#   A. CAN THE CONTAINER BE REBUILT? The rollback manifest records image, mounts,
#      networks, ports and labels but NOT command or env, and it merely NAMES a
#      compose file. A name is not a reconstruction path. So: prove the file
#      exists, hash it, prove `docker compose config` validates it, and prove the
#      `stylique-os` service is actually in it.
#
#   B. IS ANYTHING STILL ROUTED TO IT? The inventory reports that stylique-caddy
#      references /etc/caddy/Caddyfile and stops there. Stopping a container that
#      still serves a live route is a user-visible outage. The answer comes from
#      the proxy's LOADED configuration via its admin API — not from a file on
#      disk, which may be one `import` among several and is adapted before use.
#
# TWO RULES GOVERN THE OUTPUT:
#
#  * NOTHING MUTATES. Only read verbs: test, sha256sum, docker inspect/exec/ps,
#    and `docker compose config`, which renders and validates without starting
#    anything.
#  * NO SECRETS LEAVE THE HOST. `docker compose config` interpolates .env values
#    into its output, so the full render is NEVER printed — only `-q` (validate,
#    no output) and `--services` (names only). The Caddy configuration is never
#    printed either: it is matched HERE and only booleans plus a sha256 are
#    returned. Hostnames and credentials therefore never reach a CI log.
#
# Output is one JSON object on stdout. Every field is either a definite value or
# null; the caller treats null as UNDETERMINED and fails closed.
set -uo pipefail

COMPOSE_FILE=/root/24_Backend/deploy/docker-compose.yml
TARGET=stylique-os
TARGET_PORT=4100

j_str() { if [ -z "${1:-}" ]; then printf 'null'; else printf '"%s"' "$(printf '%s' "$1" | tr -d '"\\' | tr -d '\n')"; fi; }
j_bool() { case "${1:-}" in true) printf 'true' ;; false) printf 'false' ;; *) printf 'null' ;; esac; }

# ---- A. reconstruction path ------------------------------------------------
compose_exists=false
compose_sha=""
compose_validates=""
compose_has_service=""
compose_service_count=""

if [ -f "$COMPOSE_FILE" ]; then
  compose_exists=true
  compose_sha="$(sha256sum "$COMPOSE_FILE" 2>/dev/null | cut -d' ' -f1)"

  # `config -q` renders the full model — including interpolated env — and prints
  # NOTHING on success. Output is discarded regardless, so an error message that
  # happened to echo a value cannot leak either.
  if docker compose -f "$COMPOSE_FILE" config -q >/dev/null 2>&1; then
    compose_validates=true
    # Service NAMES only. This never contains an env value.
    services="$(docker compose -f "$COMPOSE_FILE" config --services 2>/dev/null)"
    if [ -n "$services" ]; then
      compose_service_count="$(printf '%s\n' "$services" | grep -c . )"
      if printf '%s\n' "$services" | grep -qx "$TARGET"; then
        compose_has_service=true
      else
        compose_has_service=false
      fi
    fi
  else
    compose_validates=false
  fi
fi

# ---- B. live-route dependency ----------------------------------------------
#
# THE ACTIVE CONFIG, NOT A FILE THAT MIGHT FEED IT.
#
# The first version of this probe read /etc/caddy/Caddyfile and called that the
# routing evidence. It is not. A Caddyfile may `import` other files, and Caddy
# ADAPTS it into a JSON config at load time — so the text on disk is neither
# complete nor necessarily what the running process holds. A route defined in an
# imported snippet, or added at runtime through the admin API, would be invisible
# and the probe would report "clear" for a container that is still serving.
#
# So the verdict comes from the admin API's live configuration. If that cannot be
# queried, the answer is UNDETERMINED and the caller blocks — an unreadable
# runtime config is not evidence of absence.
target_ips="$(docker inspect "$TARGET" --format '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' 2>/dev/null | tr -s ' ')"
target_nets="$(docker inspect "$TARGET" --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' 2>/dev/null | tr -s ' ')"

caddy_present=false
caddy_runtime_readable=""
caddy_runtime_sha=""
caddy_admin=""
caddyfile_sha=""
route_name=""
route_port=""
route_ip=""
route_net=""
route_upstream=""

CADDY_CTR=stylique-caddy
if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$CADDY_CTR"; then
  caddy_present=true
  # The admin endpoint serves the LOADED configuration as JSON. wget is present
  # in the caddy images; curl is tried as a fallback. Output is captured, never
  # printed.
  for ep in http://localhost:2019/config/ http://127.0.0.1:2019/config/; do
    rt="$(docker exec "$CADDY_CTR" sh -c "wget -qO- '$ep' 2>/dev/null || curl -sS '$ep' 2>/dev/null" 2>/dev/null)"
    if [ -n "$rt" ] && printf '%s' "$rt" | head -c 1 | grep -q '[{[]'; then
      caddy_admin="$ep"
      break
    fi
    rt=""
  done

  if [ -n "$rt" ]; then
    caddy_runtime_readable=true
    caddy_runtime_sha="$(printf '%s' "$rt" | sha256sum | cut -d' ' -f1)"

    # MATCHED HERE. Only the booleans below cross the wire.
    if printf '%s' "$rt" | grep -q "$TARGET"; then route_name=true; else route_name=false; fi
    if printf '%s' "$rt" | grep -qE '"dial":"[^"]*:'"$TARGET_PORT"'"'; then route_port=true; else route_port=false; fi
    if printf '%s' "$rt" | grep -qE "(:|[^0-9])$TARGET_PORT([^0-9]|$)"; then route_port=true; fi

    # UPSTREAMS SPECIFICALLY. A reverse_proxy records its backend as
    # {"dial":"host:port"}; that is the field that decides whether traffic
    # actually reaches this container. Network-name presence is NOT a substitute
    # for it — a network can be referenced by config that routes nowhere near the
    # target — so it is reported separately and never stands in for this check.
    dials="$(printf '%s' "$rt" | grep -o '"dial":"[^"]*"' | sed 's/.*:"//; s/"$//')"
    route_upstream=false
    if [ -n "$dials" ]; then
      while IFS= read -r d; do
        [ -z "$d" ] && continue
        case "$d" in *"$TARGET"*) route_upstream=true ;; esac
        case "$d" in *":$TARGET_PORT") route_upstream=true ;; esac
        for ip in $target_ips; do
          [ -z "$ip" ] && continue
          case "$d" in *"$ip"*) route_upstream=true ;; esac
        done
      done <<EOF_DIALS
$dials
EOF_DIALS
    else
      # No upstream could be extracted at all. That is not "no upstreams"; it is
      # an unparsed config, and it must not read as clear.
      route_upstream=""
    fi

    route_ip=false
    for ip in $target_ips; do
      [ -z "$ip" ] && continue
      if printf '%s' "$rt" | grep -qF "$ip"; then route_ip=true; fi
    done
    route_net=false
    for n in $target_nets; do
      [ -z "$n" ] && continue
      if printf '%s' "$rt" | grep -qF "$n"; then route_net=true; fi
    done
  else
    # Admin API unreachable or not serving JSON.
    caddy_runtime_readable=false
  fi

  # SECONDARY, INFORMATIONAL ONLY. Recorded so a reviewer can tell whether the
  # on-disk source changed between runs. It is NOT the verdict source and no
  # route decision is derived from it.
  cf="$(docker exec "$CADDY_CTR" cat /etc/caddy/Caddyfile 2>/dev/null)"
  [ -n "$cf" ] && caddyfile_sha="$(printf '%s' "$cf" | sha256sum | cut -d' ' -f1)"
else
  # No proxy container at all: a definite answer about the proxy, and the caller
  # still requires the per-marker flags, which stay null here.
  caddy_runtime_readable=false
fi

# ---- current restart policy, for the rollback command ----------------------
restart_policy="$(docker inspect "$TARGET" --format '{{.HostConfig.RestartPolicy.Name}}' 2>/dev/null)"
target_present=false
docker ps -a --format '{{.Names}}' 2>/dev/null | grep -qx "$TARGET" && target_present=true

printf '{'
printf '"target":%s,' "$(j_str "$TARGET")"
printf '"targetPresent":%s,' "$(j_bool "$target_present")"
printf '"restartPolicy":%s,' "$(j_str "$restart_policy")"
printf '"composePath":%s,' "$(j_str "$COMPOSE_FILE")"
printf '"composeExists":%s,' "$(j_bool "$compose_exists")"
printf '"composeSha256":%s,' "$(j_str "$compose_sha")"
printf '"composeValidates":%s,' "$(j_bool "$compose_validates")"
printf '"composeHasService":%s,' "$(j_bool "$compose_has_service")"
printf '"composeServiceCount":%s,' "${compose_service_count:-null}"
printf '"caddyPresent":%s,' "$(j_bool "$caddy_present")"
printf '"caddyRuntimeReadable":%s,' "$(j_bool "$caddy_runtime_readable")"
printf '"caddyAdminEndpoint":%s,' "$(j_str "$caddy_admin")"
printf '"caddyRuntimeConfigSha256":%s,' "$(j_str "$caddy_runtime_sha")"
printf '"caddyfileSha256":%s,' "$(j_str "$caddyfile_sha")"
printf '"routeMentionsName":%s,' "$(j_bool "$route_name")"
printf '"routeMentionsPort":%s,' "$(j_bool "$route_port")"
printf '"routeMentionsIp":%s,' "$(j_bool "$route_ip")"
printf '"routeMentionsNetwork":%s,' "$(j_bool "$route_net")"
printf '"routeMentionsUpstream":%s' "$(j_bool "$route_upstream")"
printf '}\n'
