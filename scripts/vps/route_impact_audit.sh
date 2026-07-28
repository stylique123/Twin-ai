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
# CLOSED ENUM, initialised on every path: ok | data_invalid |
# program_failed | unavailable. The category is secret-safe by construction —
# it is one of four fixed words and never carries parser output, which could
# contain configuration text.
parser_status=unavailable

# ---- PYTHON PROGRAMS, PASSED QUOTE-SAFELY ---------------------------------
#
# THE DEFECT THIS CLOSES. These programs were embedded as
# `python3 -c '...multi-line program...'`. A bash single-quoted string ENDS at
# the next apostrophe, and the route extractor's own prose contained several —
# "each handler's OWN upstream list", "the target's handler". Bash terminated
# the argument mid-docstring and handed python a mutilated program; python died
# with `unterminated triple-quoted string`, `2>/dev/null` swallowed the message,
# and the caller recorded an unexplained `null`. Every route fact this probe
# exists to produce was silently absent, and nothing said why.
#
# A quoted heredoc (<<'PY_EOF') performs NO expansion and NO quote processing,
# so apostrophes, $, backticks and backslashes are ordinary characters. The
# program is passed as one argument via "$VAR"; expanding a variable does not
# re-scan its value for quotes, so the text cannot be re-split however it is
# written. Runtime JSON still arrives on stdin.

PROG_ROUTES=$(cat <<'PY_EOF'
import json, sys

try:
    cfg = json.load(sys.stdin)
except Exception:
    print("null"); sys.exit(0)

def upstreams(handler):
    """
    Each upstream as {index, dial, extraKeyCount}.

    THE INDEX IS THE POINT. A patch that rebuilds the array from dials alone
    destroys every other per-upstream field Caddy allows — `max_requests`,
    health-check overrides, dial timeouts — for the backends it was supposed to
    leave untouched. Recording the index lets the remedy DELETE the target
    entries by address and never rewrite the survivors at all.

    `extraKeyCount` is a COUNT, never the keys or values: it is the evidence that
    an entry is more than a dial, without emitting whatever that more is.
    """
    out = []
    for i, u in enumerate(handler.get("upstreams", []) or []):
        if not isinstance(u, dict):
            out.append({"index": i, "dial": None, "extraKeyCount": None})
            continue
        d = u.get("dial")
        out.append({
            "index": i,
            "dial": d if isinstance(d, str) else None,
            "extraKeyCount": len([k for k in u.keys() if k != "dial"]),
        })
    return out

def looks_like_handler_list(v):
    return isinstance(v, list) and any(
        isinstance(x, dict) and ("handler" in x or "handle" in x) for x in v)

MATCHER_KEYS_SUPPORTED = ("host", "path")


def matchers_of(route):
    """
    A route's OWN matchers, and any matcher shape this model cannot represent.

    Only `host` and `path` are emitted. Anything else — header, method,
    expression, client_ip, protocol — changes WHICH REQUESTS a route serves in a
    way this tool does not model, so it is reported as an unsupported key NAME
    (never its value) and the caller refuses rather than describing a route it
    does not actually understand.
    """
    hosts, paths, unsupported = [], [], []
    for m in route.get("match", []) or []:
        if not isinstance(m, dict):
            unsupported.append("<non-object-matcher>")
            continue
        for k in m.keys():
            if k not in MATCHER_KEYS_SUPPORTED and k not in unsupported:
                unsupported.append(k)
        for hh in m.get("host", []) or []:
            if isinstance(hh, str):
                hosts.append(hh)
        for pp in m.get("path", []) or []:
            if isinstance(pp, str):
                paths.append(pp)
    return {"host": hosts, "path": paths, "unsupportedMatcherKeys": unsupported}


def walk(handlers, base, acc, route_path, chain):
    """
    Descend the handler chain, recording each handler's OWN upstream list, its
    EXACT address, AND the nested route that owns it.

    WHY THE NESTED ROUTE IS THE UNIT. An earlier version recursed into
    `subroute.routes` but carried neither the nested route's own `match` nor its
    address. Every handler therefore inherited the OUTER route's matchers, and
    the live config is exactly the shape that breaks: one outer host route whose
    subroute holds three nested routes, with stylique-os and stylique-dashboard
    in DIFFERENT nested branches. The report then said "path matchers: none —
    all paths" for a handler that in fact serves one nested path, and offered no
    way to name the thing that would actually be removed.

    `routePath` is the admin-API path of the route object that directly owns this
    handle array. That object — not the handler, and not the outer host route —
    is the deletable unit when a nested route reaches only the target: removing
    it leaves its siblings untouched, where emptying a handler's upstream list
    would leave a route matching requests it can no longer serve.

    `chain` is the ancestor matcher context, outermost first, so a reviewer can
    see the full set of conditions under which a handler is reached.

    NESTING IS ONLY FOLLOWED WHERE IT IS CANONICALLY ADDRESSABLE. `subroute`
    exposes `routes[k].handle[m]` and that path is exact. Any OTHER key holding
    what looks like a handler list is a shape this script cannot address without
    guessing, so the handler is marked unaddressable and the caller refuses.
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
        ups = upstreams(h)
        acc.append({
            "handlerPath": path,
            "position": j,
            "handler": t if isinstance(t, str) else None,
            "upstreams": ups,
            "upstreamDials": [u["dial"] for u in ups if u["dial"] is not None],
            "upstreamCount": len(ups),
            "addressable": len(unknown_nesting) == 0,
            # The route object that owns this handler's handle array.
            "ownerRoutePath": route_path,
            "nestingDepth": len(chain) - 1,
            # Outermost-first matcher context, each entry naming its own route.
            "matcherChain": chain,
            "unsupportedMatcherKeys": sorted({
                k for c in chain for k in c.get("unsupportedMatcherKeys", [])
            }),
        })
        for k, sub in enumerate(h.get("routes", []) or []):
            if isinstance(sub, dict):
                sub_route_path = "%s/routes/%d" % (path, k)
                sub_ctx = matchers_of(sub)
                sub_ctx["routePath"] = sub_route_path
                sub_ctx["routeIndexInParent"] = k
                sub_ctx["parentRoutesArrayPath"] = "%s/routes" % path
                walk(sub.get("handle", []), sub_route_path + "/handle", acc,
                     sub_route_path, chain + [sub_ctx])


# ---- SHAPE EVIDENCE ------------------------------------------------------
# Run 30302057188 parsed ZERO routes from a readable config. "Zero routes" and
# "a shape this parser does not understand" are different facts with different
# remedies, and the old output could not tell them apart. So the structure is
# reported as KEY PATHS and COUNTS — names and sizes only, never values — which
# makes an unfamiliar shape diagnosable instead of silently empty.
# The ONLY key names that may be emitted. Everything else becomes "<key>",
# preserving shape and counts while emitting no name at all.
#
# This is not paranoia about the word "password". The first version of this
# function walked every key and printed its name, so `http_basic/accounts[0]/
# username` and `certificate` reached the output — and a config is free to use
# a secret AS a key (a token in a map, a header name, an internal hostname).
# An allowlist is the only version of this whose safety does not depend on
# guessing what a future config might be shaped like. The leak test caught this
# on the very first realistic fixture.
SAFE_KEYS = {
    "apps", "http", "servers", "routes", "handle", "match", "host", "path",
    "handler", "upstreams", "dial", "terminal", "listen", "group",
    "subroute", "reverse_proxy", "file_server", "static_response", "encode",
    "rewrite", "headers", "error", "vars", "tls", "automation", "policies",
}

def key_paths(node, prefix="", depth=0, out=None):
    if out is None:
        out = []
    if depth > 6 or len(out) > 400:
        return out
    if isinstance(node, dict):
        for k in sorted(node.keys()):
            v = node[k]
            safe = k if k in SAFE_KEYS else "<key>"
            path = prefix + "/" + safe
            if isinstance(v, dict):
                out.append("%s{%d}" % (path, len(v)))
                key_paths(v, path, depth + 1, out)
            elif isinstance(v, list):
                out.append("%s[%d]" % (path, len(v)))
                if v and isinstance(v[0], (dict, list)):
                    key_paths(v[0], path + "[0]", depth + 1, out)
            else:
                out.append(path)
    elif isinstance(node, list):
        out.append("%s[%d]" % (prefix, len(node)))
        if node and isinstance(node[0], (dict, list)):
            key_paths(node[0], prefix + "[0]", depth + 1, out)
    return out

rows = []
# Server names are DYNAMIC (srv0, or whatever the Caddyfile adapter emitted).
# Iterating the dict is what makes this work for any name; hard-coding one was
# never viable and assuming a familiar one is how zero routes gets reported.
servers = (((cfg.get("apps") or {}).get("http") or {}).get("servers") or {})
for srv_name, srv in servers.items():
    if not isinstance(srv, dict):
        continue
    for idx, route in enumerate(srv.get("routes", []) or []):
        if not isinstance(route, dict):
            continue
        route_path = "apps/http/servers/%s/routes/%d" % (srv_name, idx)
        outer = matchers_of(route)
        outer["routePath"] = route_path
        outer["routeIndexInParent"] = idx
        outer["parentRoutesArrayPath"] = "apps/http/servers/%s/routes" % srv_name
        hosts, paths = outer["host"], outer["path"]
        acc = []
        walk(route.get("handle", []), route_path + "/handle", acc, route_path, [outer])
        # ALLOWLIST: nothing but these keys is ever emitted, and every value in
        # them is a config path, a route index, a domain, a path, a handler TYPE
        # or a dial.
        rows.append({
            "server": srv_name,
            "routeIndex": idx,
            "routePath": route_path,
            "hostMatchers": hosts,
            "pathMatchers": paths,
            "unsupportedMatcherKeys": outer["unsupportedMatcherKeys"],
            "handlerOrder": [h["handler"] for h in acc],
            "handlers": acc,
            "upstreamDials": [d for h in acc for d in h["upstreamDials"]],
        })

print(json.dumps({"routes": rows, "keyPaths": key_paths(cfg),
                  "serverNames": sorted(servers.keys()),
                  "serverCount": len(servers),
                  "routeCountByServer": {k: len((v or {}).get("routes") or []) for k, v in servers.items() if isinstance(v, dict)}}))
PY_EOF
)

PROG_KEYPATHS=$(cat <<'PY_EOF'
import json,sys
d=json.load(sys.stdin)
print(json.dumps({"keyPaths":d["keyPaths"],"serverNames":d["serverNames"],
                  "serverCount":d["serverCount"],"routeCountByServer":d["routeCountByServer"]}))
PY_EOF
)

PROG_RESOLVE=$(cat <<'PY_EOF'
import os, sys, json

disk = os.environ["DISK_PATH"]
best = None
for line in sys.stdin:
    parts = line.rstrip("\n").split("\t")
    if len(parts) < 4:
        continue
    dest, src, rw, typ = parts[0], parts[1], parts[2], parts[3]
    if not dest or not src:
        continue
    d = dest.rstrip("/") or "/"
    # BOUNDARY-SAFE. "startswith(d)" alone would match /etc/caddy2 against a
    # /etc/caddy mount and resolve to a file that does not exist.
    if disk == d:
        rel = ""
    elif disk.startswith(d + "/"):
        rel = disk[len(d) + 1:]
    else:
        continue
    # Most specific mount wins: a /etc/caddy mount beats a / mount.
    if best is None or len(d) > len(best[0]):
        best = (d, src, rw, typ, rel)

if best is None:
    print(json.dumps({"mapped": False}))
else:
    d, src, rw, typ, rel = best
    host = src if rel == "" else os.path.join(src, rel)
    print(json.dumps({
        "mapped": True, "dest": d, "root": src, "rw": rw, "type": typ,
        "rel": rel, "host": host,
    }))
PY_EOF
)


# ---- identify the target: its names, ips and networks -----------------------
# STRICT: docker's template prints "invalid IP" (and older versions "<no value>")
# when a container has no current address — an EXITED container has none. Split on
# whitespace those become the identities "invalid" and "IP", and a dial of the
# form "IP:4100" would then MATCH the target by name. An absent address must be
# represented as absent, never as a literal that can be matched.
target_ips_raw="$(docker inspect "$TARGET" --format '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' 2>/dev/null | tr -s ' ')"
target_ips="$(printf '%s' "$target_ips_raw" | tr ' ' '\n' \
  | grep -E '^([0-9]{1,3}\.){3}[0-9]{1,3}$|^[0-9a-fA-F]*:[0-9a-fA-F:]+$' \
  | tr '\n' ' ' | sed 's/ *$//')"
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
boot_mount_root=""
boot_mount_dest=""
boot_mount_rw=""
boot_mount_type=""
boot_file_host=""
boot_file_regular=""
boot_file_readable=""
boot_file_writable=""
boot_file_sha=""
boot_compose_file=""
boot_compose_dir=""
boot_compose_resolved=""
caddy_pid=""
id_host_source=""
id_proc_root=""
id_container=""
findmnt_host=""
mountinfo_rel=""
caddy_argv=""
caddy_env_keys=""
keypaths_json="null"

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
      # Exit status separates a PROGRAM failure (syntax error, crash) from a DATA
      # failure (unparseable config, which the program reports as `null`, exit 0).
      # The old code could not tell them apart: a broken parser and an unreadable
      # config produced the same silent `null`.
      if routes_json="$(printf '%s' "$rt" | python3 -c "$PROG_ROUTES" 2>/dev/null)"; then
        parser_status=ok
      else
        parser_status=program_failed
        routes_json=null
      fi
      if [ -n "$routes_json" ] && [ "$routes_json" != "null" ]; then
        combined="$routes_json"
        routes_json="$(printf '%s' "$combined" | python3 -c 'import json,sys;print(json.dumps(json.load(sys.stdin)["routes"]))' 2>/dev/null)"
        keypaths_json="$(printf '%s' "$combined" | python3 -c "$PROG_KEYPATHS" 2>/dev/null)"
        [ -z "$keypaths_json" ] && keypaths_json="null"
        if [ -n "$routes_json" ] && [ "$routes_json" != "null" ]; then
          parse_ok=true
        else
          # The program ran and reported it could not read the config as routes.
          parse_ok=false; routes_json="null"
          [ "$parser_status" = ok ] && parser_status=data_invalid
        fi
      else parse_ok=false; routes_json="null"; fi
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
      # HASH THE FILE, NOT A COPY OF IT. This read the file with
      # `c="$(docker exec ... cat)"` and hashed `$c`. Command substitution STRIPS
      # TRAILING NEWLINES, so the digest described a byte string the file does not
      # contain: a newline-terminated Caddyfile hashing 9c234e40… on disk came back
      # as ec9b840b… here, and the probe reported a host/container DIVERGENCE that
      # does not exist. Two runs were spent treating a shell artifact as a live
      # configuration split. sha256sum runs INSIDE the container, on the path.
      s_in="$(docker exec "$CADDY_CTR" sh -c "sha256sum '$p' 2>/dev/null | cut -d' ' -f1" 2>/dev/null)"
      if [ -n "$s_in" ]; then
        disk_path="$p"
        disk_sha="$s_in"
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

  # ---- WHERE A DURABLE EDIT WOULD ACTUALLY BE WRITTEN -----------------------
  #
  # A container path is not an edit location, and NEITHER IS A MOUNT ROOT.
  # If /etc/caddy is bind-mounted from /root/caddy and the boot file is
  # /etc/caddy/Caddyfile, then the file to edit is /root/caddy/Caddyfile —
  # naming /root/caddy sends a reviewer to a DIRECTORY and any edit "there"
  # either fails or lands in the wrong place.
  #
  # So the container path is mapped through the mount to an exact HOST FILE:
  #   exact-file mount (Destination == disk path) -> Source
  #   directory mount  (disk path under Destination) -> Source + relative part
  # Matching is boundary-safe, so /etc/caddy2 never matches a /etc/caddy mount,
  # and the most specific (longest Destination) mount wins.
  #
  # The resolution is then PROVEN rather than asserted: the host path must be a
  # regular, readable, writable file, and its host-side sha256 must equal the
  # sha256 read from inside the container. If those two digests disagree, the
  # mapping is wrong — a different file — and the caller refuses.
  if [ -n "$disk_path" ] && [ -n "$PARSER" ]; then
    mounts_raw="$(docker inspect "$CADDY_CTR" \
      --format '{{range .Mounts}}{{.Destination}}	{{.Source}}	{{.RW}}	{{.Type}}
{{end}}' 2>/dev/null)"
    resolved="$(printf '%s' "$mounts_raw" | DISK_PATH="$disk_path" python3 -c "$PROG_RESOLVE" 2>/dev/null)"

    if [ -n "$resolved" ]; then
      boot_mount_root="$(printf '%s' "$resolved" | python3 -c 'import json,sys;d=json.load(sys.stdin);print(d.get("root") or "")' 2>/dev/null)"
      boot_mount_dest="$(printf '%s' "$resolved" | python3 -c 'import json,sys;d=json.load(sys.stdin);print(d.get("dest") or "")' 2>/dev/null)"
      boot_mount_type="$(printf '%s' "$resolved" | python3 -c 'import json,sys;d=json.load(sys.stdin);print(d.get("type") or "")' 2>/dev/null)"
      boot_mount_rw="$(printf '%s' "$resolved" | python3 -c 'import json,sys;d=json.load(sys.stdin);print(d.get("rw") or "")' 2>/dev/null)"
      boot_file_host="$(printf '%s' "$resolved" | python3 -c 'import json,sys;d=json.load(sys.stdin);print(d.get("host") or "")' 2>/dev/null)"
    fi

    # The resolved path must be a real, writable, regular file ON THE HOST.
    if [ -n "$boot_file_host" ]; then
      if [ -f "$boot_file_host" ]; then boot_file_regular=true; else boot_file_regular=false; fi
      if [ -r "$boot_file_host" ]; then boot_file_readable=true; else boot_file_readable=false; fi
      if [ -w "$boot_file_host" ]; then boot_file_writable=true; else boot_file_writable=false; fi
      if [ "$boot_file_regular" = true ] && [ "$boot_file_readable" = true ]; then
        boot_file_sha="$(sha256sum "$boot_file_host" 2>/dev/null | cut -d' ' -f1)"
      fi
    fi
  fi

  # ---- FILE IDENTITY TRIANGULATION -----------------------------------------
  #
  # Run 30302057188 found the host bind source and the container's file hashing
  # DIFFERENTLY across a direct bind mount. That is not a detail; it means an
  # edit to the "obvious" host path would land in a file Caddy is not reading.
  #
  # Three views of the same nominal file, each with dev:inode:size:mtime:sha256:
  #
  #   A. the host bind SOURCE                    /srv/caddy/Caddyfile
  #   B. the container's root as the HOST sees it /proc/<PID>/root/etc/caddy/Caddyfile
  #   C. the container's own view                 docker exec cat /etc/caddy/Caddyfile
  #
  # A FILE bind is pinned to an inode at container start. If the host file was
  # later replaced atomically (write-temp + rename, which every sane editor and
  # config manager does), the container keeps reading the ORIGINAL inode while
  # the host path now names a NEW one. Then A != B == C, and the inodes differ.
  # That single comparison distinguishes it from mount layering, from a second
  # writer inside the container, and from a wrong path — which need different
  # remedies. Collecting more facts would not separate them; this does.
  stat_id() {  # dev:inode:size:mtime:sha256 for a path, or "absent"
    if [ -e "$1" ]; then
      printf '%s:%s' "$(stat -c '%d:%i:%s:%Y' "$1" 2>/dev/null)" \
        "$(sha256sum "$1" 2>/dev/null | cut -d' ' -f1)"
    else
      printf 'absent'
    fi
  }

  caddy_pid="$(docker inspect "$CADDY_CTR" --format '{{.State.Pid}}' 2>/dev/null)"

  if [ -n "$boot_mount_root" ]; then
    id_host_source="$(stat_id "$boot_mount_root")"
  fi
  if [ -n "$caddy_pid" ] && [ "$caddy_pid" != "0" ] && [ -n "$disk_path" ]; then
    id_proc_root="$(stat_id "/proc/$caddy_pid/root$disk_path")"
    # The container's OWN view, via its filesystem rather than the host's.
    c_in="$(docker exec "$CADDY_CTR" sh -c "sha256sum '$disk_path' 2>/dev/null | cut -d' ' -f1" 2>/dev/null)"
    c_st="$(docker exec "$CADDY_CTR" sh -c "stat -c '%d:%i:%s:%Y' '$disk_path' 2>/dev/null" 2>/dev/null)"
    [ -n "$c_st" ] && id_container="$c_st:$c_in"
  fi

  # ---- MOUNT LAYERING ------------------------------------------------------
  # A second mount over the same target explains a divergence that inodes alone
  # would not. Paths and filesystem types only; no file contents.
  if [ -n "$boot_mount_root" ] && command -v findmnt >/dev/null 2>&1; then
    findmnt_host="$(findmnt -T "$boot_mount_root" -no TARGET,SOURCE,FSTYPE 2>/dev/null | tr -s ' ' | head -3 | tr '\n' ';')"
  fi
  if [ -n "$caddy_pid" ] && [ -r "/proc/$caddy_pid/mountinfo" ] && [ -n "$disk_path" ]; then
    # Only lines whose mount point is at or above the config path.
    mountinfo_rel="$(awk -v p="$disk_path" '{ mp=$5; if (index(p, mp)==1 || mp==p) print $5" "$4" "$(NF-2) }' \
      "/proc/$caddy_pid/mountinfo" 2>/dev/null | sort -u | head -6 | tr '\n' ';')"
  fi

  # ---- HOW CADDY WAS ACTUALLY STARTED --------------------------------------
  # `--config` and `--adapter` decide WHICH file is authoritative. Argv is
  # emitted; environment is emitted as KEY NAMES ONLY, never values.
  caddy_argv="$(docker inspect "$CADDY_CTR" --format '{{.Path}} {{range .Args}}{{.}} {{end}}' 2>/dev/null)"
  caddy_env_keys="$(docker inspect "$CADDY_CTR" --format '{{range .Config.Env}}{{.}}
{{end}}' 2>/dev/null | cut -d= -f1 | sort -u | tr '\n' ' ')"

  # Compose provenance. `config_files` is often RELATIVE to the project working
  # dir; presenting a relative label as a path sends people to a file that does
  # not exist from where they are standing. Resolve it when both halves are
  # known, and mark it unresolved otherwise rather than guessing.
  boot_compose_file="$(docker inspect "$CADDY_CTR" \
    --format '{{index .Config.Labels "com.docker.compose.project.config_files"}}' 2>/dev/null)"
  boot_compose_dir="$(docker inspect "$CADDY_CTR" \
    --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}' 2>/dev/null)"
  case "$boot_compose_file" in
    /*) boot_compose_resolved="$boot_compose_file" ;;
    '') boot_compose_resolved="" ;;
    *)  if [ -n "$boot_compose_dir" ]; then
          boot_compose_resolved="$boot_compose_dir/$boot_compose_file"
        else
          boot_compose_resolved=""
        fi ;;
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
printf '"parserStatus":%s,' "$(j_str "$parser_status")"
printf '"caddyDiskConfigSha256":%s,' "$(j_str "$disk_sha")"
printf '"caddyDiskConfigIsBootSource":%s,' "$(j_bool "$disk_is_source")"
printf '"caddyBootMountRoot":%s,' "$(j_str "$boot_mount_root")"
printf '"caddyBootMountDest":%s,' "$(j_str "$boot_mount_dest")"
printf '"caddyBootMountType":%s,' "$(j_str "$boot_mount_type")"
printf '"caddyBootMountWritable":%s,' "$(j_bool "$(printf '%s' "$boot_mount_rw" | tr 'A-Z' 'a-z')")"
printf '"caddyBootFileHostPath":%s,' "$(j_str "$boot_file_host")"
printf '"caddyBootFileIsRegular":%s,' "$(j_bool "$boot_file_regular")"
printf '"caddyBootFileReadable":%s,' "$(j_bool "$boot_file_readable")"
printf '"caddyBootFileWritable":%s,' "$(j_bool "$boot_file_writable")"
printf '"caddyBootFileSha256":%s,' "$(j_str "$boot_file_sha")"
printf '"caddyComposeFileLabel":%s,' "$(j_str "$boot_compose_file")"
printf '"caddyComposeDir":%s,' "$(j_str "$boot_compose_dir")"
printf '"caddyComposeFileResolved":%s,' "$(j_str "$boot_compose_resolved")"
printf '"caddyPid":%s,' "$(j_str "$caddy_pid")"
printf '"fileIdHostSource":%s,' "$(j_str "$id_host_source")"
printf '"fileIdProcRoot":%s,' "$(j_str "$id_proc_root")"
printf '"fileIdContainer":%s,' "$(j_str "$id_container")"
printf '"findmntHostSource":%s,' "$(j_str "$findmnt_host")"
printf '"mountinfoRelevant":%s,' "$(j_str "$mountinfo_rel")"
printf '"caddyArgv":%s,' "$(j_str "$caddy_argv")"
printf '"caddyEnvKeys":%s,' "$(j_str "$caddy_env_keys")"
printf '"configKeyPaths":%s,' "$keypaths_json"
printf '"parserAvailable":%s,' "$(if [ -n "$PARSER" ]; then printf 'true'; else printf 'false'; fi)"
printf '"parsed":%s,' "$(j_bool "$parse_ok")"
printf '"routes":%s' "$routes_json"
printf '}\n'
