#!/usr/bin/env bash
# REMOTE COLLECTOR — runs ON the VPS over SSH, emits a tagged record stream on
# stdout that scripts/ci/build_resource_inventory.mjs turns into JSON + a table.
#
# STRICTLY READ-ONLY. The complete docker verb list used here is:
#   exec, images, info, inspect, logs, network, ps, system, volume
# and every one of those is used in a read subcommand (`ls`, `inspect`, `df`).
# There is no restart, stop, kill, rm, rmi, prune, update, create or run.
# scripts/ci/check_vps_retire_safety.mjs enforces that statically in CI.
#
# WHAT IS DELIBERATELY NOT COLLECTED
#   - container environment (.Config.Env) — that is where secrets live
#   - file contents of any .env / secret / key material
#   - unredacted logs (only sizes are reported here; the crash-loop tail in
#     vps-diag.yml is separately redacted on the host)
# Labels ARE collected because ownership attribution needs them, but they are
# passed through the same credential redactor before leaving the host.
#
# Output format: one record per line,
#   <SECTION>\t<field>\t<field>...
# Values are stripped of tabs and newlines so the framing cannot be broken by
# a hostile label or path.
set -uo pipefail

# Strip framing characters, then redact anything credential-shaped. Applied to
# every value that originates from container metadata rather than from us.
san() {
  printf '%s' "${1:-}" \
    | tr -d '\t\r\n' \
    | sed -E 's/(password|passwd|secret|token|api[_-]?key|apikey|authorization)[=:][^[:space:];]*/\1=[REDACTED]/gI' \
    | sed -E 's/eyJ[A-Za-z0-9._-]{20,}/[REDACTED_JWT]/g' \
    | sed -E 's#([a-z][a-z0-9+.-]*://)[^/[:space:]@]+@#\1[REDACTED]@#g'
}

row() { # row SECTION field...
  local sec="$1"; shift
  local out="$sec" f
  for f in "$@"; do out="$out$(printf '\t%s' "$(san "$f")")"; done
  printf '%s\n' "$out"
}

TW=twinai-worker

# ---------------------------------------------------------------- containers
# Fields are selected individually; the full inspect JSON is never emitted
# because it carries .Config.Env.
for n in $(docker ps -a --format '{{.Names}}' 2>/dev/null); do
  meta=$(docker inspect "$n" --format \
'{{.State.Status}}#{{.RestartCount}}#{{.HostConfig.RestartPolicy.Name}}:{{.HostConfig.RestartPolicy.MaximumRetryCount}}#{{.Config.Image}}#{{.Image}}#{{.Created}}#{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}#{{.HostConfig.Memory}}#{{.State.ExitCode}}' 2>/dev/null || true)
  labels=$(docker inspect "$n" --format '{{range $k,$v := .Config.Labels}}{{$k}}={{$v}};{{end}}' 2>/dev/null || true)
  project=$(docker inspect "$n" --format '{{index .Config.Labels "com.docker.compose.project"}}' 2>/dev/null || true)
  mounts=$(docker inspect "$n" --format '{{range .Mounts}}{{.Type}}|{{.Name}}|{{.Source}}|{{.Destination}}|{{.RW}};{{end}}' 2>/dev/null || true)
  ports=$(docker inspect "$n" --format '{{range $p, $c := .NetworkSettings.Ports}}{{$p}}->{{range $c}}{{.HostIp}}:{{.HostPort}} {{end}};{{end}}' 2>/dev/null || true)
  nets=$(docker inspect "$n" --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' 2>/dev/null || true)
  # Per-container JSON log size: the single most common cause of a Docker root
  # filling up, and invisible to `docker system df`.
  lp=$(docker inspect "$n" --format '{{.LogPath}}' 2>/dev/null || true)
  lsz=0
  if [ -n "$lp" ] && [ -f "$lp" ]; then lsz=$(du -sk "$lp" 2>/dev/null | awk '{print $1}' || echo 0); fi
  row CONTAINER "$n" "$meta" "$project" "$labels" "$mounts" "$ports" "$nets" "${lsz:-0}"
done

# ------------------------------------------------------------------- images
# RepoDigests is the pull-by-digest identity needed to restore an image that we
# delete; without it a "rollback image" is only a local tag.
for id in $(docker images -q --no-trunc 2>/dev/null | sort -u); do
  info=$(docker inspect "$id" --format \
'{{range .RepoTags}}{{.}},{{end}}#{{range .RepoDigests}}{{.}},{{end}}#{{.Size}}#{{.Created}}' 2>/dev/null || true)
  row IMAGE "$id" "$info"
done

# ------------------------------------------------------------------ volumes
for v in $(docker volume ls --format '{{.Name}}' 2>/dev/null); do
  mp=$(docker volume inspect "$v" --format '{{.Mountpoint}}' 2>/dev/null || true)
  drv=$(docker volume inspect "$v" --format '{{.Driver}}' 2>/dev/null || true)
  lbl=$(docker volume inspect "$v" --format '{{range $k,$e := .Labels}}{{$k}}={{$e}};{{end}}' 2>/dev/null || true)
  sz=0
  if [ -n "$mp" ] && [ -d "$mp" ]; then sz=$(du -sk "$mp" 2>/dev/null | awk '{print $1}' || echo 0); fi
  # Persistent-data signature: does this volume hold a database?
  dbf=$(find "$mp" -maxdepth 2 \( -name 'PG_VERSION' -o -name '*.sqlite' -o -name '*.db' -o -name 'mysql' -o -name 'dump.rdb' \) 2>/dev/null | head -5 | tr '\n' ',' || true)
  row VOLUME "$v" "$drv" "$mp" "${sz:-0}" "$lbl" "$dbf"
done

# ----------------------------------------------------------------- networks
for nid in $(docker network ls -q 2>/dev/null); do
  ninfo=$(docker network inspect "$nid" --format '{{.Name}}#{{.Driver}}#{{range $k,$v := .Containers}}{{$v.Name}},{{end}}' 2>/dev/null || true)
  row NETWORK "$nid" "$ninfo"
done

# --------------------------------------------------------- docker disk usage
# `docker system df` is the authority on build cache, which nothing else reports.
docker system df --format '{{.Type}}#{{.TotalCount}}#{{.Active}}#{{.Size}}#{{.Reclaimable}}' 2>/dev/null \
  | while IFS= read -r l; do row DOCKERDF "$l"; done

# ------------------------------------------------------------- host capacity
row FS root "$(df -Pk / 2>/dev/null | awk 'NR==2{print $2"#"$3"#"$4"#"$5}')"
DR=$(docker info --format '{{.DockerRootDir}}' 2>/dev/null || echo /var/lib/docker)
row FS docker "$(df -Pk "$DR" 2>/dev/null | awk 'NR==2{print $2"#"$3"#"$4"#"$5}')" "$DR"
row INODES root "$(df -Pi / 2>/dev/null | awk 'NR==2{print $2"#"$3"#"$4"#"$5}')"
row INODES docker "$(df -Pi "$DR" 2>/dev/null | awk 'NR==2{print $2"#"$3"#"$4"#"$5}')"

# ------------------------------------------------------ largest host directories
# -x stays on the root filesystem so a bind-mounted network share cannot make
# this hang or double-count.
du -xk --max-depth=1 / 2>/dev/null | sort -rn | head -25 \
  | while read -r kb path; do row HOSTDIR "$path" "$kb"; done
for sub in /var/lib /var/log /opt /root /home /usr; do
  [ -d "$sub" ] || continue
  du -xk --max-depth=1 "$sub" 2>/dev/null | sort -rn | head -12 \
    | while read -r kb path; do row HOSTDIR2 "$path" "$kb"; done
done

# ------------------------------------------------------------ TwinAI specifics
# Model cache and worker temp usage measured INSIDE the container, which is the
# only place the numbers mean anything for a render.
mp=$(docker exec "$TW" printenv EDITOR_SPEECH_MODEL_PATH 2>/dev/null || echo /opt/models/faster-whisper-small)
row TWINAI model_path "$mp"
row TWINAI model_cache_kb "$(docker exec "$TW" du -sk "$mp" 2>/dev/null | awk '{print $1}')"
row TWINAI models_root_kb "$(docker exec "$TW" du -sk /opt/models 2>/dev/null | awk '{print $1}')"
row TWINAI tmp_kb "$(docker exec "$TW" du -sk /tmp 2>/dev/null | awk '{print $1}')"
row TWINAI tmp_entries "$(docker exec "$TW" sh -c 'ls -1 /tmp 2>/dev/null | wc -l' 2>/dev/null)"
row TWINAI ctr_tmp_avail_kb "$(docker exec "$TW" df -Pk /tmp 2>/dev/null | awk 'NR==2{print $4}')"
row TWINAI src_sha "$(git -C /opt/twinai-worker-src rev-parse HEAD 2>/dev/null)"
# Rollback candidates: every local image tagged for the worker, newest first.
docker images --format '{{.Repository}}:{{.Tag}}#{{.ID}}#{{.CreatedAt}}#{{.Size}}' 2>/dev/null \
  | grep -i 'twinai' | while IFS= read -r l; do row TWINAIIMAGE "$l"; done

# ------------------------------------------------- live-route dependency probe
# A4.1 needs proof that nothing successfully routes to stylique-os. Reverse
# proxies are the only way traffic reaches it; read their config for references.
for c in $(docker ps --format '{{.Names}}' 2>/dev/null); do
  case "$c" in
    *caddy*|*nginx*|*traefik*|*proxy*)
      # ONE LINE PER ROW. `grep -rl` returns one path per line, and a newline
      # inside a value splits the TSV record: the second path is then read as a
      # section name and the reference is silently truncated. The inventory
      # comparator treats proxy references as structural topology, so a mangled
      # record here is bad evidence downstream, not just untidy output.
      hits=$(docker exec "$c" sh -c 'grep -rl "stylique-os" /etc/caddy /etc/nginx /etc/traefik 2>/dev/null | sort | head -5' 2>/dev/null \
        | tr '\n' ',' | sed 's/,$//' || true)
      row PROXYREF "$c" "${hits:-none}"
      ;;
  esac
done
# Listening sockets: which ports are actually bound, and by what.
# SORTED BEFORE THE CAP. The kernel does not promise an order, so an unsorted
# `head -40` samples a different 40 rows run to run and the inventory comparator
# would report listeners appearing and vanishing on a host where nothing moved.
{ ss -ltnpH 2>/dev/null || netstat -ltnp 2>/dev/null; } \
  | sed -E 's/pid=[0-9]+/pid=?/g' | LC_ALL=C sort | head -40 \
  | while IFS= read -r l; do row LISTEN "$l"; done

row META collected_by vps-diag
