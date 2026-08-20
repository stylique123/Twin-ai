#!/usr/bin/env bash
# CACHE THE PACKAGES, NOT THE PACKAGE LISTS.
#
# ⚠️ APT FAILED SIX TIMES ON 2026-08-19 AND PASSED FAST THREE TIMES. 51s, 27s,
# dead, dead, dead, 14s, 80s, dead, 26s. Every failure was Debian's mirror being
# unreachable, and every one of them blocked a merge for twenty minutes while
# three bounded retries waited politely. The retry loop is a bandage on somebody
# else's uptime: it converts an outage into a delay, and a long outage back into
# a blocked merge.
#
# ⚖️ SO THE MIRROR LEAVES THE HOT PATH. On a cache hit nothing is downloaded and
# no index is refreshed — the .deb files are already on disk and `dpkg -i`
# installs them offline. The mirror is consulted only when the cache misses,
# which is a first run or a deliberate key rotation.
#
# ⚠️ AND THE RETRY STAYS. Do not remove the bandage in the same commit that
# transplants the artery: a cache miss still needs a working install path, and
# the miss is exactly the moment the mirror might be down. `apt_get_retry` is
# unchanged and still the fallback.
#
# ⚖️ ARCHIVES, NOT INDEXES. Caching `/var/lib/apt/lists` would cache the thing
# that goes stale and still require downloading every .deb. Caching
# `/var/cache/apt/archives` caches the bytes we actually install.
#
# ⚠️ ONE CACHE PER PACKAGE SET, DELIBERATELY. ffmpeg and espeak-ng are cached
# under separate keys so a change to one cannot invalidate the other, and a miss
# on one does not re-download both. They fail independently because they are
# independent.
#
# ⚖️ WHAT THIS DOES AND DOES NOT PROVE. The digest file records the sha256 of
# every .deb this cache holds, and a restore that does not match it is refused —
# so a corrupted or tampered cache cannot install silently. It does NOT pin to an
# upstream version: the runner image moves, apt resolves what it resolves, and
# claiming otherwise would be the same "declared is not installed" mistake that
# cost this project months. What is pinned is the CONTENTS OF THIS CACHE.
set -euo pipefail

CACHE_ROOT="${APT_ARTIFACT_CACHE_ROOT:-$HOME/.apt-artifacts}"

# Download a package set into its own cache directory, and record what landed.
apt_artifacts_fetch() {
  local set_name="$1"; shift
  local dir="$CACHE_ROOT/$set_name"
  mkdir -p "$dir"
  # ⚠️ `--download-only` INTO OUR OWN ARCHIVE DIR, so nothing is installed yet and
  # nothing lands in the system cache that a later step might clear.
  sudo apt-get install -y -qq --no-install-recommends \
    -o "Dir::Cache::archives=$dir" --download-only "$@"
  sudo chown -R "$(id -u):$(id -g)" "$dir"
  # `partial/` and `lock` are apt's bookkeeping, not artifacts.
  rm -rf "$dir/partial" "$dir/lock"
  ( cd "$dir" && sha256sum ./*.deb | sort -k2 > .sha256 )
  echo "cached $(ls -1 "$dir"/*.deb 2>/dev/null | wc -l) .deb(s) for $set_name"
}

# Install a package set from its cache, verifying every byte first.
# Returns non-zero if the cache is absent or does not verify — the caller then
# falls back to the network path rather than proceeding on a bad cache.
apt_artifacts_install() {
  local set_name="$1"
  local dir="$CACHE_ROOT/$set_name"
  [ -d "$dir" ] || { echo "no cache dir for $set_name"; return 1; }
  [ -f "$dir/.sha256" ] || { echo "no digest file for $set_name"; return 1; }
  ls "$dir"/*.deb >/dev/null 2>&1 || { echo "cache for $set_name holds no .deb"; return 1; }

  # ⚠️ VERIFY BEFORE INSTALLING, NOT AFTER. A cache that fails its own digest is
  # refused outright: installing it and checking later would mean the check
  # reports on a machine that has already changed.
  if ! ( cd "$dir" && sha256sum -c --quiet .sha256 ); then
    echo "::warning::apt artifact cache for $set_name FAILED its digest check — ignoring it and falling back to the network"
    return 1
  fi

  # ⚖️ `dpkg -i` RATHER THAN `apt-get install`, because apt would contact the
  # mirror to plan, which is the whole thing being avoided. The .debs already
  # include their dependencies (apt resolved them when the cache was built), so
  # dpkg has everything it needs locally.
  sudo dpkg -i "$dir"/*.deb >/dev/null 2>&1 || {
    # A partial dpkg run can leave unconfigured packages; this fixes them up
    # WITHOUT the network when it can.
    sudo dpkg --configure -a >/dev/null 2>&1 || true
  }
  echo "installed $set_name from the artifact cache (no mirror contact)"
}
