#!/usr/bin/env bash
# READ-ONLY route-impact audit, executed ON THE HOST over the pinned-host-key SSH
# path (piped in via `ssh ... bash -s`, exactly like the inventory collector and
# the pre-stop probe).
#
# WHY THIS EXISTS
# ---------------
# The pre-stop audit answered "is anything still routed to stylique-os?" with a
# boolean, and the answer was YES (`routeMentionsUpstream: true`, run
# 30290680691). A boolean is the right shape for a GATE and the wrong shape for a
# REMEDY: it cannot tell you whether the route serves only stylique-os or also
# fronts stylique-dashboard, and therefore cannot tell you whether the route can
# be deleted or must be edited upstream-by-upstream.
#
# This probe returns the STRUCTURE needed to build that remedy — and nothing
# else. It still mutates nothing and still does not reload anything.
#
# SECRET SAFETY IS AN ALLOWLIST, NOT A REDACTION PASS
# ---------------------------------------------------
# Redaction is a denylist: it protects against the secrets you thought of. This
# emits ONLY four kinds of value, and everything else in the configuration is
# structurally incapable of reaching the output:
#
#   * route index          (an integer)
#   * host matchers        (the domain names the route answers on)
#   * path matchers        (the URL paths)
#   * handler type names   (`reverse_proxy`, `file_server`, … — the type only)
#   * upstream dials       (`host:port` of the backend)
#
# `basicauth` hashes, TLS key material, header values, environment values and
# request bodies are not in that list, so no future config shape can leak them
# through this script. Host matchers ARE emitted: they are the only way to name
# which route a patch would touch, and a patch that cannot be reviewed is not
# reversible. They are domain names, not credentials.
#
# Output is one JSON object on stdout. Every field is a definite value or null;
# the caller treats null as UNDETERMINED and fails closed.
set -uo pipefail

TARGET=stylique-os
TARGET_PORT=4100
CADDY_CTR=stylique-caddy
# Containers whose routes must survive untouched. Sourced from the founder's
# explicit do-not-touch list, not inferred from names at run time.
PROTECTED="stylique-dashboard postiz postiz-postgres postiz-redis twinai-worker infallible_hawking stylique-chrome"

j_str() { if [ -z "${1:-}" ]; then printf 'null'; else printf '"%s"' "$(printf '%s' "$1" | tr -d '"\\' | tr -d '\n')"; fi; }
j_bool() { case "${1:-}" in true) printf 'true' ;; false) printf 'false' ;; *) printf 'null' ;; esac; }

# ---- a JSON parser is required; without one the answer is UNDETERMINED -------
PARSER=""
if command -v python3 >/dev/null 2>&1; then PARSER=python3; fi

# ---- identify the target: its names, ips and networks -----------------------
target_ips="$(docker inspect "$TARGET" --format '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' 2>/dev/null | tr -s ' ')"
target_aliases="$(docker inspect "$TARGET" --format '{{range $k, $v := .NetworkSettings.Networks}}{{range $v.Aliases}}{{.}} {{end}}{{end}}' 2>/dev/null | tr -s ' ')"

# Each protected container's dial identities, so a shared route is detected by
# UPSTREAM rather than by guessing from the host matcher.
protected_ids=""
for c in $PROTECTED; do
  ips="$(docker inspect "$c" --format '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' 2>/dev/null | tr -s ' ')"
  protected_ids="$protected_ids $c $ips"
done

# ---- the LOADED configuration ----------------------------------------------
caddy_present=false
runtime_readable=""
runtime_sha=""
admin=""
disk_path=""
disk_sha=""
disk_is_source=""
routes_json="null"
parse_ok=""

if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$CADDY_CTR"; then
  caddy_present=true
  for ep in http://localhost:2019/config/ http://127.0.0.1:2019/config/; do
    rt="$(docker exec "$CADDY_CTR" sh -c "wget -qO- '$ep' 2>/dev/null || curl -sS '$ep' 2>/dev/null" 2>/dev/null)"
    if [ -n "$rt" ] && printf '%s' "$rt" | head -c 1 | grep -q '[{[]'; then admin="$ep"; break; fi
    rt=""
  done

  if [ -n "$rt" ]; then
    runtime_readable=true
    runtime_sha="$(printf '%s' "$rt" | sha256sum | cut -d' ' -f1)"

    if [ -n "$PARSER" ]; then
      # The extraction runs HERE, on the host, and prints only allowlisted
      # fields. The full configuration never crosses the wire.
      routes_json="$(printf '%s' "$rt" | python3 -c '
import json, sys

try:
    cfg = json.load(sys.stdin)
except Exception:
    print("null"); sys.exit(0)

def dials(handler):
    """Every upstream dial under one handler, at any nesting depth."""
    out = []
    for u in handler.get("upstreams", []) or []:
        d = u.get("dial")
        if isinstance(d, str):
            out.append(d)
    return out

def looks_like_handler_list(v):
    return isinstance(v, list) and any(
        isinstance(x, dict) and ("handler" in x or "handle" in x) for x in v)

def walk(handlers, base, acc):
    """
    Descend the handler chain, recording each handler's OWN upstream list AND its
    EXACT address in the loaded configuration.

    Two reasons the address matters, both learned the hard way:

    * Grouping per handler is what makes the remedy decidable. If the target and
      a protected backend share ONE reverse_proxy's upstream list, dropping the
      target entry leaves the protected one serving. If they sit in DIFFERENT
      handlers, dropping the target's handler leaves that path with no upstream
      at all.
    * A patch that says "the handler" is not a patch. With two reverse_proxy
      handlers each pairing the target with a DIFFERENT protected backend, a
      route-level view produces one instruction and one fused keep-list, which
      would cross-wire both handlers. Each handler needs its own address and its
      own keep-list.

    `base` is the admin-API path of the containing `handle` array, so a handler's
    address is exactly what `PATCH /config/<path>` would take.

    NESTING IS ONLY FOLLOWED WHERE IT IS CANONICALLY ADDRESSABLE. `subroute`
    exposes `routes[k].handle[m]` and that path is exact. Any OTHER key holding
    what looks like a handler list is a shape this script cannot address without
    guessing, so the handler is marked unaddressable and the caller refuses
    rather than emitting a patch aimed at a path that may not exist.
    """
    for j, h in enumerate(handlers or []):
        if not isinstance(h, dict):
            continue
        path = "%s/%d" % (base, j)
        t = h.get("handler")
        unknown_nesting = [
            k for k, v in h.items()
            if k not in ("routes",) and looks_like_handler_list(v)
        ]
        acc.append({
            "handlerPath": path,
            "position": j,
            "handler": t if isinstance(t, str) else None,
            "upstreamDials": dials(h),
            "addressable": len(unknown_nesting) == 0,
        })
        for k, sub in enumerate(h.get("routes", []) or []):
            if isinstance(sub, dict):
                walk(sub.get("handle", []), "%s/routes/%d/handle" % (path, k), acc)

rows = []
servers = (((cfg.get("apps") or {}).get("http") or {}).get("servers") or {})
for srv_name, srv in servers.items():
    if not isinstance(srv, dict):
        continue
    for idx, route in enumerate(srv.get("routes", []) or []):
        if not isinstance(route, dict):
            continue
        hosts, paths = [], []
        for m in route.get("match", []) or []:
            if not isinstance(m, dict):
                continue
            for hh in m.get("host", []) or []:
                if isinstance(hh, str):
                    hosts.append(hh)
            for pp in m.get("path", []) or []:
                if isinstance(pp, str):
                    paths.append(pp)
        route_path = "apps/http/servers/%s/routes/%d" % (srv_name, idx)
        acc = []
        walk(route.get("handle", []), route_path + "/handle", acc)
        # ALLOWLIST: nothing but these keys is ever emitted, and every value in
        # them is a config path, a route index, a domain, a path, a handler TYPE
        # or a dial.
        rows.append({
            "server": srv_name,
            "routeIndex": idx,
            "routePath": route_path,
            "hostMatchers": hosts,
            "pathMatchers": paths,
            "handlerOrder": [h["handler"] for h in acc],
            "handlers": acc,
            "upstreamDials": [d for h in acc for d in h["upstreamDials"]],
        })

print(json.dumps(rows))
' 2>/dev/null)"
      if [ -n "$routes_json" ] && [ "$routes_json" != "null" ]; then parse_ok=true; else parse_ok=false; routes_json="null"; fi
    else
      # No parser: structure is unavailable. NOT "no routes".
      parse_ok=false
    fi
  else
    runtime_readable=false
  fi

  # ---- WHERE THE LOADED CONFIG CAME FROM ------------------------------------
  # An admin-API change does not survive a restart if the container boots from a
  # Caddyfile. Knowing the source decides whether the durable patch is a file
  # edit or an API call, so it is recorded as a fact rather than assumed.
  for p in /etc/caddy/Caddyfile /etc/caddy/Caddyfile.json /config/caddy/autosave.json; do
    if docker exec "$CADDY_CTR" test -f "$p" 2>/dev/null; then
      c="$(docker exec "$CADDY_CTR" cat "$p" 2>/dev/null)"
      if [ -n "$c" ]; then
        disk_path="$p"
        disk_sha="$(printf '%s' "$c" | sha256sum | cut -d' ' -f1)"
        break
      fi
    fi
  done
  # The container's declared command tells us whether it BOOTS from that file.
  cmd="$(docker inspect "$CADDY_CTR" --format '{{join .Config.Cmd " "}}' 2>/dev/null)"
  case "$cmd" in
    *Caddyfile*) disk_is_source=true ;;
    *' run'*|*'caddy run'*) disk_is_source=true ;;
    '') disk_is_source="" ;;
    *) disk_is_source=false ;;
  esac
else
  runtime_readable=false
fi

restart_policy="$(docker inspect "$TARGET" --format '{{.HostConfig.RestartPolicy.Name}}' 2>/dev/null)"
target_present=false
docker ps -a --format '{{.Names}}' 2>/dev/null | grep -qx "$TARGET" && target_present=true

printf '{'
printf '"target":%s,' "$(j_str "$TARGET")"
printf '"targetPort":%s,' "$TARGET_PORT"
printf '"targetPresent":%s,' "$(j_bool "$target_present")"
printf '"restartPolicy":%s,' "$(j_str "$restart_policy")"
printf '"targetIps":%s,' "$(j_str "$(printf '%s' "$target_ips" | tr -s ' ')")"
printf '"targetAliases":%s,' "$(j_str "$(printf '%s' "$target_aliases" | tr -s ' ')")"
printf '"protectedIdentities":%s,' "$(j_str "$(printf '%s' "$protected_ids" | tr -s ' ')")"
printf '"caddyPresent":%s,' "$(j_bool "$caddy_present")"
printf '"caddyAdminEndpoint":%s,' "$(j_str "$admin")"
printf '"caddyRuntimeReadable":%s,' "$(j_bool "$runtime_readable")"
printf '"caddyRuntimeConfigSha256":%s,' "$(j_str "$runtime_sha")"
printf '"caddyDiskConfigPath":%s,' "$(j_str "$disk_path")"
printf '"caddyDiskConfigSha256":%s,' "$(j_str "$disk_sha")"
printf '"caddyDiskConfigIsBootSource":%s,' "$(j_bool "$disk_is_source")"
printf '"parserAvailable":%s,' "$(if [ -n "$PARSER" ]; then printf 'true'; else printf 'false'; fi)"
printf '"parsed":%s,' "$(j_bool "$parse_ok")"
printf '"routes":%s' "$routes_json"
printf '}\n'
