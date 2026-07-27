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
#      still serves a live route is a user-visible outage.
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
# The container's own identity, so a route referencing it by IP rather than by
# name is still caught.
target_ips="$(docker inspect "$TARGET" --format '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' 2>/dev/null | tr -s ' ')"
target_nets="$(docker inspect "$TARGET" --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' 2>/dev/null | tr -s ' ')"

caddy_readable=""
caddy_sha=""
route_name=""
route_port=""
route_ip=""
route_net=""

CADDY_CTR=stylique-caddy
if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$CADDY_CTR"; then
  # Read the ACTIVE configuration from inside the running proxy, not a copy on
  # disk that may not be what it loaded.
  cfg="$(docker exec "$CADDY_CTR" cat /etc/caddy/Caddyfile 2>/dev/null)"
  if [ -n "$cfg" ]; then
    caddy_readable=true
    caddy_sha="$(printf '%s' "$cfg" | sha256sum | cut -d' ' -f1)"
    # MATCHED HERE, NEVER SHIPPED. Only the verdicts below cross the wire.
    if printf '%s' "$cfg" | grep -q "$TARGET"; then route_name=true; else route_name=false; fi
    if printf '%s' "$cfg" | grep -qE "(:|[^0-9])$TARGET_PORT([^0-9]|$)"; then route_port=true; else route_port=false; fi
    route_ip=false
    for ip in $target_ips; do
      [ -z "$ip" ] && continue
      if printf '%s' "$cfg" | grep -qF "$ip"; then route_ip=true; fi
    done
    route_net=false
    for n in $target_nets; do
      [ -z "$n" ] && continue
      if printf '%s' "$cfg" | grep -qF "$n"; then route_net=true; fi
    done
  else
    caddy_readable=false
  fi
else
  # No proxy container at all. That is a definite answer, not an unknown.
  caddy_readable=false
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
printf '"caddyReadable":%s,' "$(j_bool "$caddy_readable")"
printf '"caddyConfigSha256":%s,' "$(j_str "$caddy_sha")"
printf '"routeMentionsName":%s,' "$(j_bool "$route_name")"
printf '"routeMentionsPort":%s,' "$(j_bool "$route_port")"
printf '"routeMentionsIp":%s,' "$(j_bool "$route_ip")"
printf '"routeMentionsNetwork":%s' "$(j_bool "$route_net")"
printf '}\n'
