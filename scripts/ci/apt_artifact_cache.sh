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

# ⚖️ THE INSTALL COMMAND IS INJECTABLE, AND THAT IS WHAT MAKES THE HIT PATH
# TESTABLE. Actually running `sudo dpkg -i` needs root and a Debian runner, so
# for years only the REFUSALS were tested — the half that says no. A cache that
# wrongly says YES was never exercised, which is precisely the defect this file
# shipped with. Overriding this in a test costs nothing and mutates nothing.
APT_DPKG_CMD="${APT_DPKG_CMD:-sudo dpkg}"

# Download a package set into its own cache directory, and record what landed.
#
# ⚠️ ZERO ARTIFACTS IS A FAILURE, AND IT USED TO BE A SHELL ACCIDENT. If the
# packages are ALREADY INSTALLED, apt considers them satisfied and
# `--download-only` downloads NOTHING. `sha256sum ./*.deb` then ran on an
# unmatched glob — sha256sum received the literal string `./*.deb`, errored, and
# the subshell returned non-zero, which the caller's `|| echo "::warning::"`
# swallowed. The cache could therefore never populate, forever, and the only
# trace was a warning nobody reads. Counting real files first is the difference
# between a cache that reports a miss and a cache that pretends.
apt_artifacts_fetch() {
  local set_name="$1"; shift
  local dir="$CACHE_ROOT/$set_name"
  # ⚖️ CLEAR THIS SET'S OWN ARTIFACTS, AND ONLY THIS SET'S. A failed second warm
  # must not leave last week's .debs beside this week's and then digest the
  # Frankenstein package set that results — a digest over a mixture verifies
  # perfectly and installs something nobody chose.
  rm -rf "$dir"
  mkdir -p "$dir"
  # ⚠️ `--download-only` INTO OUR OWN ARCHIVE DIR, so nothing is installed yet and
  # nothing lands in the system cache that a later step might clear.
  sudo apt-get install -y -qq --no-install-recommends \
    -o "Dir::Cache::archives=$dir" --download-only "$@"
  sudo chown -R "$(id -u):$(id -g)" "$dir"
  # `partial/` and `lock` are apt's bookkeeping, not artifacts.
  rm -rf "$dir/partial" "$dir/lock"

  local debs
  shopt -s nullglob
  debs=("$dir"/*.deb)
  shopt -u nullglob
  if (( ${#debs[@]} == 0 )); then
    echo "::warning::no .deb artifacts downloaded for $set_name — the cache was NOT warmed (are the packages already installed?)"
    return 1
  fi

  # The digest is computed from the concrete array, never from a glob that might
  # not have matched.
  ( cd "$dir" && sha256sum "${debs[@]##*/}" | sort -k2 > .sha256 )
  echo "apt_cache_warmed set=$set_name artifacts=${#debs[@]}"
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
  #
  # ⚠️ THE SUCCESS LINE USED TO BE UNCONDITIONAL, AND THAT IS THE WHOLE BUG. The
  # old body ended `|| { dpkg --configure -a || true; }` and then printed
  # "installed … from the artifact cache" whatever had happened. A cache that
  # failed to install reported success, this function returned 0, and the
  # caller's network fallback — which exists precisely for this — never ran. The
  # invariant now is: verify bytes, install bytes, PROVE the install succeeded,
  # and only then return 0. Nothing that decides whether the caller falls back is
  # allowed to be `|| true`.
  local debs
  shopt -s nullglob
  debs=("$dir"/*.deb)
  shopt -u nullglob
  if ! $APT_DPKG_CMD -i "${debs[@]}" >/dev/null 2>&1; then
    # A partial dpkg run can leave unconfigured packages; recovery is allowed to
    # try, WITHOUT the network — but it must succeed, and the retry must then
    # actually install.
    if ! $APT_DPKG_CMD --configure -a >/dev/null 2>&1; then
      echo "::warning::apt artifact cache for $set_name failed to install and dpkg --configure -a could not recover — falling back to the network"
      return 1
    fi
    if ! $APT_DPKG_CMD -i "${debs[@]}" >/dev/null 2>&1; then
      echo "::warning::apt artifact cache for $set_name still failed to install after recovery — falling back to the network"
      return 1
    fi
  fi
  echo "apt_route set=$set_name route=cache_hit"
}

# THE ONE ORDERING, IN ONE PLACE.
#
# ⚠️ THE MISS PATH MUST BUILD THE EXACT ARTIFACT THE HIT PATH INSTALLS, AND IT
# DID NOT. The old callers ran `apt_get_retry` (which INSTALLS) and only then
# `apt_artifacts_fetch`, by which point apt considered the packages satisfied and
# downloaded nothing. Warming and cached installation were never exercised
# together, so the cache could look correct on every run and serve nothing on
# any of them.
#
# ⚖️ SO WARM, THEN INSTALL FROM WHAT WAS WARMED. On a miss this downloads the
# .debs and immediately installs those same bytes — the identical code path a
# later cache hit takes. The network fallback stays as the last rung, because a
# miss is exactly when the mirror might be down.
#
# Requires the caller to define `apt_get_retry` (the bounded mirror install).
apt_ensure() {
  local set_name="$1"; shift
  if apt_artifacts_install "$set_name"; then
    return 0
  fi
  # A stale index is the ordinary reason a first warm cannot resolve packages,
  # and it is cheap to rule out once before spending the fallback.
  if apt_artifacts_fetch "$set_name" "$@" \
     || { timeout 180 sudo apt-get update -qq && apt_artifacts_fetch "$set_name" "$@"; }; then
    if apt_artifacts_install "$set_name"; then
      echo "apt_route set=$set_name route=cache_warmed_then_installed"
      return 0
    fi
  fi
  # ⚠️ SAID OUT LOUD, NOT INFERRED FROM SILENCE. A run that reaches here left the
  # cache cold, and the next run will pay the mirror again.
  echo "apt_route set=$set_name route=cache_miss_network_fallback"
  if ! command -v apt_get_retry >/dev/null 2>&1; then
    echo "::error::apt_ensure needs apt_get_retry to be defined by the caller"; return 1
  fi
  apt_get_retry "$@"
}
