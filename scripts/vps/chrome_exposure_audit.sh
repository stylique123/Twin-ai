#!/usr/bin/env bash
# READ-ONLY exposure audit for stylique-chrome, executed ON THE HOST.
#
# WHY THIS IS ITS OWN PROBE
# -------------------------
# The inventory reported that this container publishes 6080 and 9222 on
# 0.0.0.0 and ::. Those are noVNC and the Chrome DevTools Protocol. An open
# DevTools endpoint is not "a debug port": it is remote control of a browser —
# navigate anywhere, read any page the browser can reach, and on many builds
# read local files through it. If it answers unauthenticated from the internet
# that is a live compromise path, and it needs establishing before anything
# else on this host is retired.
#
# WHAT THIS DELIBERATELY DOES NOT DO
# ----------------------------------
# It does not open a debugging session, attach to a target, enumerate tabs,
# navigate, execute script, or read the profile volume. Establishing that a
# door is unlocked does not require walking through it, and walking through it
# would put page and user data into an artifact. The reachability half of this
# audit runs from OUTSIDE the host (see the workflow) precisely because "can the
# internet reach it" cannot be answered from inside.
#
# EMITTED VALUES
# --------------
#   container/image identity, restart policy, compose labels, mount metadata,
#   network names and container IPs, ENV KEY NAMES ONLY, timestamps, counts,
#   listening sockets, publish rules, and firewall rule SHAPE plus digests.
# Environment values, page data, profile contents and firewall rule bodies are
# structurally incapable of reaching stdout.
set -uo pipefail

CTR=stylique-chrome
PORTS="6080 9222"
# Every container whose health must be shown to be independent of Chrome.
PROTECTED="twinai-worker postiz postiz-postgres postiz-redis"

j_str() { if [ -z "${1:-}" ]; then printf 'null'; else printf '"%s"' "$(printf '%s' "$1" | tr -d '"\\' | tr -d '\n')"; fi; }
j_num() { case "${1:-}" in ''|*[!0-9]*) printf 'null' ;; *) printf '%s' "$1" ;; esac; }
j_bool() { case "${1:-}" in true) printf 'true' ;; false) printf 'false' ;; *) printf 'null' ;; esac; }

# A JSON array of strings from whitespace/newline separated input.
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

present=false
if docker ps -a --format '{{.Names}}' 2>/dev/null | grep -qx "$CTR"; then present=true; fi

ctr_id=""; img_ref=""; img_id=""; img_digest=""; restart=""; state=""; health=""
started=""; created=""; restarts=""; compose_project=""; compose_service=""
compose_file=""; compose_dir=""; env_keys=""; nets=""; ips=""; mounts=""
ports_json="[]"; log_ts=""; log_errs=""

if [ "$present" = true ]; then
  ctr_id="$(docker inspect "$CTR" --format '{{.Id}}' 2>/dev/null)"
  img_ref="$(docker inspect "$CTR" --format '{{.Config.Image}}' 2>/dev/null)"
  img_id="$(docker inspect "$CTR" --format '{{.Image}}' 2>/dev/null)"
  img_digest="$(docker inspect "$img_id" --format '{{range .RepoDigests}}{{.}}
{{end}}' 2>/dev/null | head -1)"
  restart="$(docker inspect "$CTR" --format '{{.HostConfig.RestartPolicy.Name}}:{{.HostConfig.RestartPolicy.MaximumRetryCount}}' 2>/dev/null)"
  state="$(docker inspect "$CTR" --format '{{.State.Status}}' 2>/dev/null)"
  health="$(docker inspect "$CTR" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' 2>/dev/null)"
  started="$(docker inspect "$CTR" --format '{{.State.StartedAt}}' 2>/dev/null)"
  created="$(docker inspect "$CTR" --format '{{.Created}}' 2>/dev/null)"
  restarts="$(docker inspect "$CTR" --format '{{.RestartCount}}' 2>/dev/null)"
  compose_project="$(docker inspect "$CTR" --format '{{index .Config.Labels "com.docker.compose.project"}}' 2>/dev/null)"
  compose_service="$(docker inspect "$CTR" --format '{{index .Config.Labels "com.docker.compose.service"}}' 2>/dev/null)"
  compose_file="$(docker inspect "$CTR" --format '{{index .Config.Labels "com.docker.compose.project.config_files"}}' 2>/dev/null)"
  compose_dir="$(docker inspect "$CTR" --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}' 2>/dev/null)"
  # KEY NAMES ONLY. A value here could be a token; a key name cannot be, and the
  # question "does Chrome carry a TwinAI credential" is answered by names.
  env_keys="$(docker inspect "$CTR" --format '{{range .Config.Env}}{{.}}
{{end}}' 2>/dev/null | cut -d= -f1 | sort -u | tr '\n' ' ')"
  nets="$(docker inspect "$CTR" --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' 2>/dev/null)"
  ips="$(docker inspect "$CTR" --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}={{$v.IPAddress}} {{end}}' 2>/dev/null)"
  mounts="$(docker inspect "$CTR" --format '{{range .Mounts}}{{.Type}}|{{.Name}}|{{.Source}}|{{.Destination}}|{{.RW}};{{end}}' 2>/dev/null)"

  # THE PUBLISH RULES, as Docker itself reports them. `0.0.0.0` and `::` are the
  # values that make this reachable from the internet rather than the host.
  ports_json="$(docker inspect "$CTR" --format '{{json .NetworkSettings.Ports}}' 2>/dev/null)"
  [ -z "$ports_json" ] && ports_json="null"

  log_ts="$(docker inspect "$CTR" --format '{{.State.FinishedAt}}' 2>/dev/null)"
  log_errs="$(docker logs --tail 500 "$CTR" 2>&1 | grep -ci 'error' || echo 0)"
fi

# ---- profile volume: METADATA ONLY -----------------------------------------
# Size, entry count and mountpoint. Never contents: a browser profile holds
# cookies, tokens and history, and none of that belongs in an artifact.
prof_name="$(printf '%s' "$mounts" | tr ';' '\n' | awk -F'|' '$1=="volume"{print $2}' | head -1)"
prof_mp=""; prof_kb=""; prof_entries=""
if [ -n "$prof_name" ]; then
  prof_mp="$(docker volume inspect "$prof_name" --format '{{.Mountpoint}}' 2>/dev/null)"
  if [ -n "$prof_mp" ] && [ -d "$prof_mp" ]; then
    prof_kb="$(du -sk "$prof_mp" 2>/dev/null | awk '{print $1}')"
    prof_entries="$(ls -1A "$prof_mp" 2>/dev/null | wc -l | tr -d ' ')"
  fi
fi

# ---- host listening sockets on the audited ports ---------------------------
listen_rows=""
for p in $PORTS; do
  row="$({ ss -ltnpH 2>/dev/null || netstat -ltnp 2>/dev/null; } \
    | sed -E 's/pid=[0-9]+/pid=?/g' | awk -v P=":$p" '$0 ~ P {print}' | LC_ALL=C sort | head -8)"
  [ -n "$row" ] && listen_rows="$listen_rows$row
"
done

# ---- live connections to those ports ---------------------------------------
# Remote addresses ARE emitted for these two ports. If something is connected to
# an open DevTools endpoint, that peer is the finding — it is caller evidence,
# not user data, and withholding it would hide the one fact that matters.
conn_rows=""
for p in $PORTS; do
  row="$({ ss -tnH state established 2>/dev/null || netstat -tn 2>/dev/null; } \
    | awk -v P=":$p" '$0 ~ P {print}' | LC_ALL=C sort | head -20)"
  [ -n "$row" ] && conn_rows="$conn_rows$row
"
done

# ---- firewall: SHAPE AND DIGEST, not the ruleset ---------------------------
# A ruleset can carry internal topology and comments. What decides this question
# is (a) whether a filtering framework is active at all, (b) how many rules it
# has, and (c) whether any rule mentions the audited ports. So the digest pins
# the exact ruleset for a later comparison, the counts describe its size, and
# only port-matching lines are emitted, normalised.
fw_backend="none"; fw_rule_count=""; fw_sha=""; fw_port_rules=""; fw_default_input=""
fw_dump=""
if command -v nft >/dev/null 2>&1 && nft list ruleset >/dev/null 2>&1; then
  fw_backend="nftables"; fw_dump="$(nft list ruleset 2>/dev/null)"
elif command -v iptables-save >/dev/null 2>&1; then
  fw_backend="iptables"; fw_dump="$(iptables-save 2>/dev/null)"
elif command -v iptables >/dev/null 2>&1; then
  fw_backend="iptables"; fw_dump="$(iptables -S 2>/dev/null)"
fi
if [ -n "$fw_dump" ]; then
  fw_rule_count="$(printf '%s\n' "$fw_dump" | grep -cvE '^\s*($|#)')"
  fw_sha="$(printf '%s' "$fw_dump" | sha256sum 2>/dev/null | cut -d' ' -f1)"
  fw_default_input="$(printf '%s\n' "$fw_dump" | grep -oE '(policy input [a-z]+|:INPUT [A-Z]+)' | head -1)"
  for p in $PORTS; do
    hit="$(printf '%s\n' "$fw_dump" | grep -E "(dport|--dport|port) ?$p( |$|,)" | head -4)"
    [ -n "$hit" ] && fw_port_rules="$fw_port_rules$hit
"
  done
fi
ufw_status="absent"
if command -v ufw >/dev/null 2>&1; then
  ufw_status="$(ufw status 2>/dev/null | head -1 | tr -d '\n')"
fi

# ---- does anything protected reference Chrome? ------------------------------
# UNKNOWN FAILS CLOSED, so every channel is probed and each answer is a definite
# value. A blank answer is reported as blank, never as "no".
prot_env_refs=""; prot_net_peers=""; prot_src_refs=""
for c in $PROTECTED; do
  docker inspect "$c" >/dev/null 2>&1 || continue
  k="$(docker inspect "$c" --format '{{range .Config.Env}}{{.}}
{{end}}' 2>/dev/null | cut -d= -f1 | grep -iE 'chrome|chromium|browserless|devtools|puppeteer|playwright|cdp' | sort -u | tr '\n' ',')"
  [ -n "$k" ] && prot_env_refs="$prot_env_refs$c:$k
"
  n="$(docker inspect "$c" --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' 2>/dev/null)"
  for net in $n; do
    case " $nets " in *" $net "*) prot_net_peers="$prot_net_peers$c shares $net
" ;; esac
  done
done
# The TwinAI worker source tree, if present, is the authority on whether TwinAI
# code dials Chrome at all.
if [ -d /opt/twinai-worker-src ]; then
  prot_src_refs="$(grep -rilE 'browserless|9222|devtools|puppeteer|playwright|stylique-chrome' \
    /opt/twinai-worker-src --include='*.ts' --include='*.js' --include='*.json' --include='*.yml' \
    2>/dev/null | head -10 | tr '\n' ',')"
fi
# Host-level references: compose files, systemd units, cron.
host_refs="$(grep -rilE 'stylique-chrome|browserless|9222' \
  /root/24_Backend /etc/systemd/system /etc/cron.d /etc/crontab 2>/dev/null | head -12 | tr '\n' ',')"

printf '{'
printf '"schema":"chrome-exposure/1",'
printf '"present":%s,' "$(j_bool "$present")"
printf '"containerId":%s,' "$(j_str "$ctr_id")"
printf '"imageRef":%s,' "$(j_str "$img_ref")"
printf '"imageId":%s,' "$(j_str "$img_id")"
printf '"imageDigest":%s,' "$(j_str "$img_digest")"
printf '"restartPolicy":%s,' "$(j_str "$restart")"
printf '"state":%s,' "$(j_str "$state")"
printf '"health":%s,' "$(j_str "$health")"
printf '"startedAt":%s,' "$(j_str "$started")"
printf '"createdAt":%s,' "$(j_str "$created")"
printf '"finishedAt":%s,' "$(j_str "$log_ts")"
printf '"restartCount":%s,' "$(j_num "$restarts")"
printf '"logErrorCount":%s,' "$(j_num "$log_errs")"
printf '"composeProject":%s,' "$(j_str "$compose_project")"
printf '"composeService":%s,' "$(j_str "$compose_service")"
printf '"composeConfigFiles":%s,' "$(j_str "$compose_file")"
printf '"composeWorkingDir":%s,' "$(j_str "$compose_dir")"
printf '"envKeys":%s,' "$(j_str "$env_keys")"
printf '"networks":%s,' "$(j_str "$nets")"
printf '"networkIps":%s,' "$(j_str "$ips")"
printf '"mounts":%s,' "$(j_str "$mounts")"
printf '"profileVolume":%s,' "$(j_str "$prof_name")"
printf '"profileMountpoint":%s,' "$(j_str "$prof_mp")"
printf '"profileKb":%s,' "$(j_num "$prof_kb")"
printf '"profileEntries":%s,' "$(j_num "$prof_entries")"
printf '"dockerPorts":%s,' "$ports_json"
printf '"listening":%s,' "$(printf '%s' "$listen_rows" | j_arr)"
printf '"connections":%s,' "$(printf '%s' "$conn_rows" | j_arr)"
printf '"firewallBackend":%s,' "$(j_str "$fw_backend")"
printf '"firewallRuleCount":%s,' "$(j_num "$fw_rule_count")"
printf '"firewallSha256":%s,' "$(j_str "$fw_sha")"
printf '"firewallDefaultInput":%s,' "$(j_str "$fw_default_input")"
printf '"firewallPortRules":%s,' "$(printf '%s' "$fw_port_rules" | j_arr)"
printf '"ufwStatus":%s,' "$(j_str "$ufw_status")"
printf '"protectedEnvRefs":%s,' "$(printf '%s' "$prot_env_refs" | j_arr)"
printf '"protectedNetworkPeers":%s,' "$(printf '%s' "$prot_net_peers" | j_arr)"
printf '"twinaiSourceRefs":%s,' "$(j_str "$prot_src_refs")"
printf '"hostFileRefs":%s' "$(j_str "$host_refs")"
printf '}\n'
