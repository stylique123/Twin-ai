#!/usr/bin/env bash
# READ-ONLY exposure audit for stylique-chrome, executed ON THE HOST.
#
# stylique-chrome publishes 6080 (noVNC) and 9222 (Chrome DevTools Protocol) on
# 0.0.0.0 and ::. An open DevTools endpoint is remote control of a browser, not
# a debug port, so whether it answers decides whether containment happens now.
#
# WHAT THIS DOES NOT DO
# ---------------------
# It opens no debugging session, attaches to no target, enumerates no tab, and
# reads no profile data. Reachability from the internet is answered by a
# separate probe running OUTSIDE this host, because a host cannot answer that
# about itself.
#
# EVERY ANSWER CARRIES A STATUS
# -----------------------------
# An earlier revision emitted an empty string when /opt/twinai-worker-src did
# not exist, and the classifier read empty as "no reference found". Absent is
# not clean. Every dependency channel now reports read-complete | absent |
# unreadable | truncated, and anything but read-complete blocks downstream.
#
# NOTHING RAW LEAVES THIS HOST
# ----------------------------
# Firewall rules are reduced to ordered semantic facts — index, chain, action,
# protocol, whether the rule restricts by source — plus a digest of the whole
# ruleset. Rule bodies, comments and addresses do not travel. Connections are
# reduced to counts by scope and family. Environment VALUES are reduced to
# booleans and key names. A value that points at Chrome is reported as the KEY
# that holds it, never as the value.
set -uo pipefail

CTR=stylique-chrome
PORTS="6080 9222"
PROTECTED="twinai-worker postiz postiz-postgres postiz-redis"
# What a reference to Chrome looks like, wherever it appears.
CHROME_PAT='chrome|chromium|browserless|devtools|puppeteer|playwright|cdp|9222|6080'
GREP_CAP=25

j_str() { if [ -z "${1:-}" ]; then printf 'null'; else printf '"%s"' "$(printf '%s' "$1" | tr -d '"\\' | tr -d '\n')"; fi; }
j_num() { case "${1:-}" in ''|*[!0-9]*) printf 'null' ;; *) printf '%s' "$1" ;; esac; }
j_bool() { case "${1:-}" in true) printf 'true' ;; false) printf 'false' ;; *) printf 'null' ;; esac; }
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
ports_json="null"; log_last_ts=""; log_ts_status="absent"; log_errs=""

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
  env_keys="$(docker inspect "$CTR" --format '{{range .Config.Env}}{{.}}
{{end}}' 2>/dev/null | cut -d= -f1 | sort -u | tr '\n' ' ')"
  nets="$(docker inspect "$CTR" --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' 2>/dev/null)"
  ips="$(docker inspect "$CTR" --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}={{$v.IPAddress}} {{end}}' 2>/dev/null)"
  mounts="$(docker inspect "$CTR" --format '{{range .Mounts}}{{.Type}}|{{.Name}}|{{.Source}}|{{.Destination}}|{{.RW}};{{end}}' 2>/dev/null)"
  ports_json="$(docker inspect "$CTR" --format '{{json .NetworkSettings.Ports}}' 2>/dev/null)"
  [ -z "$ports_json" ] && ports_json="null"

  # LAST USE, NOT LAST EXIT. `.State.FinishedAt` is the zero time for a running
  # container, so an earlier revision reported "1970" as recency for a live
  # service. The last LOG TIMESTAMP is the closest available proxy, and only the
  # timestamp is taken — the line content never leaves the host.
  if raw_last="$(docker logs --timestamps --tail 1 "$CTR" 2>/dev/null)"; then
    log_last_ts="$(printf '%s' "$raw_last" | awk '{print $1}' | head -1)"
    case "$log_last_ts" in
      ????-??-??T*) log_ts_status=read-complete ;;
      '') log_ts_status=absent; log_last_ts="" ;;
      *) log_ts_status=unreadable; log_last_ts="" ;;
    esac
  else
    log_ts_status=unreadable
  fi
  log_errs="$(docker logs --tail 500 "$CTR" 2>&1 | grep -ci 'error' || echo 0)"
fi

# ---- profile volume: METADATA ONLY -----------------------------------------
prof_name="$(printf '%s' "$mounts" | tr ';' '\n' | awk -F'|' '$1=="volume"{print $2}' | head -1)"
prof_mp=""; prof_kb=""; prof_entries=""
if [ -n "$prof_name" ]; then
  prof_mp="$(docker volume inspect "$prof_name" --format '{{.Mountpoint}}' 2>/dev/null)"
  if [ -n "$prof_mp" ] && [ -d "$prof_mp" ]; then
    prof_kb="$(du -sk "$prof_mp" 2>/dev/null | awk '{print $1}')"
    prof_entries="$(ls -1A "$prof_mp" 2>/dev/null | wc -l | tr -d ' ')"
  fi
fi

# ---- listening sockets: PORT AND COUNT, no process detail ------------------
listen_rows=""
for p in $PORTS; do
  n="$({ ss -ltnH 2>/dev/null || netstat -ltn 2>/dev/null; } | awk -v P=":$p" '$0 ~ P' | wc -l | tr -d ' ')"
  v4="$({ ss -ltnH 2>/dev/null || netstat -ltn 2>/dev/null; } | awk -v P="0.0.0.0:$p" '$0 ~ P' | wc -l | tr -d ' ')"
  v6="$({ ss -ltnH 2>/dev/null || netstat -ltn 2>/dev/null; } | awk -v P="\\[::\\]:$p" '$0 ~ P' | wc -l | tr -d ' ')"
  listen_rows="$listen_rows$p:total=$n,wildcard_v4=$v4,wildcard_v6=$v6
"
done

# ---- connections: COUNTS AND SCOPE BUCKETS, never a peer address -----------
# An address is a client identity. The question here is "is anything connected,
# and from where in the address space" — which counts answer, and which raw
# addresses would answer while also exporting who.
conn_rows=""
for p in $PORTS; do
  raw="$({ ss -tnH state established 2>/dev/null || netstat -tn 2>/dev/null; } | awk -v P=":$p" '$0 ~ P')"
  tot="$(printf '%s' "$raw" | grep -c . || echo 0)"
  loop="$(printf '%s' "$raw" | grep -cE '(127\.0\.0\.1|\[::1\])' || echo 0)"
  priv="$(printf '%s' "$raw" | grep -cE '(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)' || echo 0)"
  pub=$(( tot - loop - priv ))
  [ "$pub" -lt 0 ] && pub=0
  conn_rows="$conn_rows$p:established=$tot,loopback=$loop,private=$priv,other=$pub
"
done

# ---- firewall: ORDERED SEMANTIC FACTS + DIGEST -----------------------------
# THE DOCKER BYPASS. Published container ports are DNAT'd and traverse FORWARD,
# not INPUT. A ufw/INPUT drop therefore does NOT block a published port — the
# single most common reason a host is believed firewalled and is not. So the
# CHAIN each rule sits in is emitted, and the classifier refuses to call a port
# blocked on the strength of an INPUT rule.
fw_backend="none"; fw_rule_count=""; fw_sha=""; fw_default_input=""; fw_default_forward=""
fw_facts=""; fw_read_status="absent"; fw_dump=""
if command -v nft >/dev/null 2>&1 && nft list ruleset >/dev/null 2>&1; then
  fw_backend="nftables"; fw_dump="$(nft list ruleset 2>/dev/null)"
elif command -v iptables-save >/dev/null 2>&1; then
  fw_backend="iptables"; fw_dump="$(iptables-save 2>/dev/null)"
elif command -v iptables >/dev/null 2>&1; then
  fw_backend="iptables"; fw_dump="$(iptables -S 2>/dev/null)"
fi
if [ -n "$fw_dump" ]; then
  fw_read_status=read-complete
  fw_rule_count="$(printf '%s\n' "$fw_dump" | grep -cvE '^\s*($|#)')"
  fw_sha="$(printf '%s' "$fw_dump" | sha256sum 2>/dev/null | cut -d' ' -f1)"
  fw_default_input="$(printf '%s\n' "$fw_dump" | grep -oiE '(policy input [a-z]+|:INPUT [A-Z]+)' | head -1 | awk '{print tolower($NF)}')"
  fw_default_forward="$(printf '%s\n' "$fw_dump" | grep -oiE '(policy forward [a-z]+|:FORWARD [A-Z]+)' | head -1 | awk '{print tolower($NF)}')"
  # One fact per port-matching rule, IN FILE ORDER, carrying no rule text.
  idx=0
  while IFS= read -r line; do
    idx=$((idx+1))
    for p in $PORTS; do
      case "$line" in
        *dport*"$p"*|*"--dport $p"*|*"port $p"*)
          chain="$(printf '%s' "$line" | grep -oiE '(^-A [A-Za-z0-9_-]+|chain [A-Za-z0-9_-]+)' | head -1 | awk '{print tolower($NF)}')"
          [ -z "$chain" ] && chain=unknown
          action=unknown
          printf '%s' "$line" | grep -qiE '\b(drop|reject)\b' && action=drop
          printf '%s' "$line" | grep -qiE '\b(accept|allow)\b' && action=accept
          proto=any
          printf '%s' "$line" | grep -qiE '\b(tcp)\b' && proto=tcp
          srcres=false
          printf '%s' "$line" | grep -qiE '(-s |saddr|source )' && srcres=true
          fw_facts="$fw_facts$p|$idx|$chain|$action|$proto|$srcres
"
          ;;
      esac
    done
  done <<FWEOF
$fw_dump
FWEOF
fi
ufw_status="absent"
if command -v ufw >/dev/null 2>&1; then
  ufw_status="$(ufw status 2>/dev/null | head -1 | awk '{print tolower($NF)}')"
fi

# ---- dependency channels, each with a STATUS -------------------------------
# `scan` runs a grep, caps it, and reports whether the cap was hit — a capped
# result is TRUNCATED, and truncated is not "read completely".
prot_env_keys=""; prot_env_status="read-complete"
prot_net_peers=""; prot_net_status="read-complete"
found_any_protected=false
for c in $PROTECTED; do
  docker inspect "$c" >/dev/null 2>&1 || continue
  found_any_protected=true
  # KEY NAMES that look like Chrome…
  k="$(docker inspect "$c" --format '{{range .Config.Env}}{{.}}
{{end}}' 2>/dev/null | cut -d= -f1 | grep -iE "$CHROME_PAT" | sort -u | tr '\n' ',')"
  [ -n "$k" ] && prot_env_keys="$prot_env_keys$c:key:$k
"
  # …AND generic keys whose VALUES point at Chrome. The value is reduced to the
  # KEY that holds it: `BROWSER_URL=ws://stylique-chrome:9222` is a dependency,
  # and its key name says so without the endpoint travelling.
  vk="$(docker inspect "$c" --format '{{range .Config.Env}}{{.}}
{{end}}' 2>/dev/null | grep -iE "=.*($CHROME_PAT)" | cut -d= -f1 | sort -u | tr '\n' ',')"
  [ -n "$vk" ] && prot_env_keys="$prot_env_keys$c:value:$vk
"
  n="$(docker inspect "$c" --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' 2>/dev/null)"
  for net in $n; do
    case " $nets " in *" $net "*) prot_net_peers="$prot_net_peers$c shares $net
" ;; esac
  done
done
[ "$found_any_protected" = false ] && { prot_env_status=absent; prot_net_status=absent; }

src_refs=""; src_status="absent"
if [ -d /opt/twinai-worker-src ]; then
  if src_hits="$(grep -rilE "$CHROME_PAT" /opt/twinai-worker-src \
      --include='*.ts' --include='*.js' --include='*.json' --include='*.yml' 2>/dev/null)"; then
    n="$(printf '%s' "$src_hits" | grep -c . || echo 0)"
    src_refs="$(printf '%s' "$src_hits" | head -"$GREP_CAP" | tr '\n' ',')"
    if [ "$n" -gt "$GREP_CAP" ]; then src_status=truncated; else src_status=read-complete; fi
  else
    # grep exits 1 for "no match" and >1 for an error. Only the former is clean.
    if [ $? -gt 1 ]; then src_status=unreadable; else src_status=read-complete; fi
  fi
fi

host_refs=""; host_status="absent"
HOST_SCAN=""
for d in /root/24_Backend /etc/systemd/system /etc/cron.d /etc/crontab; do
  [ -e "$d" ] && HOST_SCAN="$HOST_SCAN $d"
done
if [ -n "$HOST_SCAN" ]; then
  if host_hits="$(grep -rilE "$CHROME_PAT" $HOST_SCAN 2>/dev/null)"; then
    n="$(printf '%s' "$host_hits" | grep -c . || echo 0)"
    host_refs="$(printf '%s' "$host_hits" | head -"$GREP_CAP" | tr '\n' ',')"
    if [ "$n" -gt "$GREP_CAP" ]; then host_status=truncated; else host_status=read-complete; fi
  else
    if [ $? -gt 1 ]; then host_status=unreadable; else host_status=read-complete; fi
  fi
fi

printf '{'
printf '"schema":"chrome-exposure/2",'
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
printf '"lastLogTimestamp":%s,' "$(j_str "$log_last_ts")"
printf '"lastLogStatus":%s,' "$(j_str "$log_ts_status")"
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
printf '"listenCounts":%s,' "$(printf '%s' "$listen_rows" | j_arr)"
printf '"connectionCounts":%s,' "$(printf '%s' "$conn_rows" | j_arr)"
printf '"firewallBackend":%s,' "$(j_str "$fw_backend")"
printf '"firewallReadStatus":%s,' "$(j_str "$fw_read_status")"
printf '"firewallRuleCount":%s,' "$(j_num "$fw_rule_count")"
printf '"firewallSha256":%s,' "$(j_str "$fw_sha")"
printf '"firewallDefaultInput":%s,' "$(j_str "$fw_default_input")"
printf '"firewallDefaultForward":%s,' "$(j_str "$fw_default_forward")"
printf '"firewallFacts":%s,' "$(printf '%s' "$fw_facts" | j_arr)"
printf '"ufwStatus":%s,' "$(j_str "$ufw_status")"
printf '"protectedEnvRefs":%s,' "$(printf '%s' "$prot_env_keys" | j_arr)"
printf '"protectedEnvStatus":%s,' "$(j_str "$prot_env_status")"
printf '"protectedNetworkPeers":%s,' "$(printf '%s' "$prot_net_peers" | j_arr)"
printf '"protectedNetworkStatus":%s,' "$(j_str "$prot_net_status")"
printf '"twinaiSourceRefs":%s,' "$(j_str "$src_refs")"
printf '"twinaiSourceStatus":%s,' "$(j_str "$src_status")"
printf '"hostFileRefs":%s,' "$(j_str "$host_refs")"
printf '"hostFileStatus":%s' "$(j_str "$host_status")"
printf '}\n'
