#!/usr/bin/env bash
# READ-ONLY full-stack dependency audit, executed ON THE HOST.
#
# THE QUESTION
# ------------
# Retiring the Stylique stack while preserving TwinAI needs one thing the
# inventory does not give: EDGES. The inventory says what exists and classifies
# it by name; this says who references whom, so "no protected service depends on
# this" becomes a proven statement rather than an inference from naming.
#
# WHAT IT EMITS
# -------------
# A dependency graph as typed edges, plus ownership. Every value is a container
# name, image reference or digest, volume name, network name, host path,
# environment KEY name, or a count. Environment VALUES, file contents, secrets
# and page data are structurally incapable of reaching stdout: where a value
# matters (an env var holding a peer address) it is reduced to the KEY that
# holds it and the peer it names.
#
# EVERY CHANNEL CARRIES A STATUS
# ------------------------------
# read-complete | absent | unreadable | truncated. An absent channel is not a
# clean channel. A capped scan reports that it was capped. The classifier
# refuses to retire anything whose channels are not all read-complete, because
# "nothing references it" and "nothing was looked at" are the same empty list.
set -uo pipefail

# The only things that must survive. Everything else is CLASSIFIED, not assumed.
PROTECTED_CTRS="twinai-worker postiz postiz-postgres postiz-redis"
SCAN_DIRS="/root /etc/systemd/system /etc/cron.d /etc/crontab /opt/twinai-worker-src"
SCAN_CAP=60

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

ALL_CTRS="$(docker ps -a --format '{{.Names}}' 2>/dev/null | LC_ALL=C sort)"

# ---- nodes: containers, with ownership -------------------------------------
ctr_rows=""
for c in $ALL_CTRS; do
  st="$(docker inspect "$c" --format '{{.State.Status}}' 2>/dev/null)"
  img="$(docker inspect "$c" --format '{{.Config.Image}}' 2>/dev/null)"
  imgid="$(docker inspect "$c" --format '{{.Image}}' 2>/dev/null)"
  rp="$(docker inspect "$c" --format '{{.HostConfig.RestartPolicy.Name}}' 2>/dev/null)"
  proj="$(docker inspect "$c" --format '{{index .Config.Labels "com.docker.compose.project"}}' 2>/dev/null)"
  svc="$(docker inspect "$c" --format '{{index .Config.Labels "com.docker.compose.service"}}' 2>/dev/null)"
  cfg="$(docker inspect "$c" --format '{{index .Config.Labels "com.docker.compose.project.config_files"}}' 2>/dev/null)"
  ctr_rows="$ctr_rows$c|$st|$img|$imgid|$rp|${proj:-none}|${svc:-none}|${cfg:-none}
"
done

# ---- edges: container -> volume / network / image --------------------------
edge_rows=""
for c in $ALL_CTRS; do
  while IFS= read -r m; do
    [ -z "$m" ] && continue
    typ="$(printf '%s' "$m" | cut -d'|' -f1)"
    nm="$(printf '%s' "$m" | cut -d'|' -f2)"
    src="$(printf '%s' "$m" | cut -d'|' -f3)"
    case "$typ" in
      volume) [ -n "$nm" ] && edge_rows="$edge_rows$c|mounts-volume|$nm
" ;;
      bind)   [ -n "$src" ] && edge_rows="$edge_rows$c|binds-host-path|$src
" ;;
    esac
  done <<MEOF
$(docker inspect "$c" --format '{{range .Mounts}}{{.Type}}|{{.Name}}|{{.Source}}
{{end}}' 2>/dev/null)
MEOF
  for n in $(docker inspect "$c" --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' 2>/dev/null); do
    edge_rows="$edge_rows$c|joins-network|$n
"
  done
  img="$(docker inspect "$c" --format '{{.Config.Image}}' 2>/dev/null)"
  [ -n "$img" ] && edge_rows="$edge_rows$c|uses-image|$img
"
done

# ---- edges: container -> container, via env VALUES ---------------------------
# THE VALUE MATTERS BUT MUST NOT TRAVEL. `WORKER_BROWSER=ws://stylique-chrome:9222`
# is a dependency edge; the edge is emitted as (source, key name, peer name) and
# the URL itself never leaves. Peers are matched against the ACTUAL container
# name list, so a coincidental word cannot invent an edge.
env_status=read-complete
for c in $ALL_CTRS; do
  envs="$(docker inspect "$c" --format '{{range .Config.Env}}{{.}}
{{end}}' 2>/dev/null)" || { env_status=unreadable; continue; }
  for peer in $ALL_CTRS; do
    [ "$peer" = "$c" ] && continue
    keys="$(printf '%s' "$envs" | grep -F "$peer" | cut -d= -f1 | sort -u | tr '\n' ',')"
    [ -n "$keys" ] && edge_rows="$edge_rows$c|env-references|$peer|$keys
"
  done
done

# ---- edges: host files -> container/service ---------------------------------
# A systemd unit or cron job that names a container is a caller the container
# graph cannot see.
hostref_rows=""; hostref_status=absent
EXIST=""
for d in $SCAN_DIRS; do [ -e "$d" ] && EXIST="$EXIST $d"; done
if [ -n "$EXIST" ]; then
  for c in $ALL_CTRS; do
    if hits="$(grep -rl --binary-files=without-match -F "$c" $EXIST 2>/dev/null)"; then
      n="$(printf '%s' "$hits" | grep -c . || echo 0)"
      capped="$(printf '%s' "$hits" | head -"$SCAN_CAP" | tr '\n' ',')"
      hostref_rows="$hostref_rows$c|$n|$capped
"
      if [ "$n" -gt "$SCAN_CAP" ]; then hostref_status=truncated
      elif [ "$hostref_status" = absent ]; then hostref_status=read-complete; fi
    else
      rc=$?
      if [ "$rc" -gt 1 ]; then hostref_status=unreadable
      elif [ "$hostref_status" = absent ]; then hostref_status=read-complete; fi
    fi
  done
fi

# ---- nodes: volumes / networks / images, with reference counts --------------
vol_rows=""
for v in $(docker volume ls --format '{{.Name}}' 2>/dev/null | LC_ALL=C sort); do
  users="$(printf '%s' "$edge_rows" | awk -F'|' -v V="$v" '$2=="mounts-volume" && $3==V {print $1}' | LC_ALL=C sort -u | tr '\n' ',')"
  mp="$(docker volume inspect "$v" --format '{{.Mountpoint}}' 2>/dev/null)"
  kb=""; [ -n "$mp" ] && [ -d "$mp" ] && kb="$(du -sk "$mp" 2>/dev/null | awk '{print $1}')"
  # DATABASE SIGNATURE, not contents. Deleting a volume that holds a database is
  # a different act from deleting a cache, and the difference must be visible.
  db=""; [ -n "$mp" ] && [ -d "$mp" ] && db="$(find "$mp" -maxdepth 3 \( -name 'PG_VERSION' -o -name '*.sqlite' -o -name '*.db' -o -name 'dump.rdb' -o -name 'mysql' \) 2>/dev/null | head -3 | tr '\n' ',')"
  vol_rows="$vol_rows$v|${users:-none}|${kb:-0}|${db:-none}
"
done

net_rows=""
for n in $(docker network ls --format '{{.Name}}' 2>/dev/null | LC_ALL=C sort); do
  members="$(printf '%s' "$edge_rows" | awk -F'|' -v N="$n" '$2=="joins-network" && $3==N {print $1}' | LC_ALL=C sort -u | tr '\n' ',')"
  drv="$(docker network inspect "$n" --format '{{.Driver}}' 2>/dev/null)"
  net_rows="$net_rows$n|$drv|${members:-none}
"
done

img_rows=""
for id in $(docker images -q --no-trunc 2>/dev/null | LC_ALL=C sort -u); do
  tags="$(docker inspect "$id" --format '{{range .RepoTags}}{{.}},{{end}}' 2>/dev/null)"
  users="$(docker ps -a --filter "ancestor=$id" --format '{{.Names}}' 2>/dev/null | LC_ALL=C sort -u | tr '\n' ',')"
  sz="$(docker inspect "$id" --format '{{.Size}}' 2>/dev/null)"
  img_rows="$img_rows$id|${tags:-none}|${users:-none}|${sz:-0}
"
done

# ---- published ports, per container ----------------------------------------
port_rows=""
for c in $ALL_CTRS; do
  p="$(docker inspect "$c" --format '{{range $k,$v := .NetworkSettings.Ports}}{{$k}}={{range $v}}{{.HostIp}}:{{.HostPort}} {{end}};{{end}}' 2>/dev/null)"
  [ -n "$p" ] && port_rows="$port_rows$c|$p
"
done

printf '{'
printf '"schema":"stack-dependency/1",'
printf '"protectedContainers":%s,' "$(printf '%s' "$PROTECTED_CTRS" | tr ' ' '\n' | j_arr)"
printf '"containers":%s,' "$(printf '%s' "$ctr_rows" | j_arr)"
printf '"edges":%s,' "$(printf '%s' "$edge_rows" | j_arr)"
printf '"envEdgeStatus":%s,' "$(j_str "$env_status")"
printf '"hostFileRefs":%s,' "$(printf '%s' "$hostref_rows" | j_arr)"
printf '"hostFileStatus":%s,' "$(j_str "$hostref_status")"
printf '"volumes":%s,' "$(printf '%s' "$vol_rows" | j_arr)"
printf '"networks":%s,' "$(printf '%s' "$net_rows" | j_arr)"
printf '"images":%s,' "$(printf '%s' "$img_rows" | j_arr)"
printf '"publishedPorts":%s' "$(printf '%s' "$port_rows" | j_arr)"
printf '}\n'
