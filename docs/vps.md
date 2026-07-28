# VPS — 138.201.119.239

The single authoritative record of this host: what is on it, what stays, what
goes, and the before/after of the retirement.

Everything below is from READ-ONLY audited runs, not from memory. Sources are
named per section so any line can be re-checked.

- Inventory + classification: run `30349406302`, inventory sha256
  `dfb4a9685fa8113150272f52c62e00aa8312c830df8d33f2b46730c89c4d8c9c`
- Dependency graph (edges, not names): run `30348365132`, **zero blockers**
- Chrome exposure: run `30347868884`
- Caddy route structure: run `30342631711`, artifact `8681656696`

---

## 1. Decision

**Keep TwinAI. Keep Postiz. Retire everything else.**

Postiz is kept because it is not connected to TwinAI in any way (separate
network, no shared volumes, no environment reference either direction, no proxy
route) and its Postgres holds connected social accounts and scheduled posts.
The founder has accepted that if it is lost it can be rebuilt — so its presence
must not be allowed to stall the retirement.

---

## 2. BEFORE — host state

Captured 2026-07-28 ~10:07 UTC.

### Disk

| | |
|---|---|
| Root filesystem | 149.89 GiB total · **61.00 GiB used (43%)** · 82.74 GiB free |
| ⚠ at sweep time | The host moved between this capture and execution: by 11:37 UTC it read **64.00 GiB used (45%)**, 79.74 free, with the build cache grown 0 → 2.26 GB. The AFTER table below is anchored to that later figure, not this one. |
| Inodes | 1,237,538 / 9,849,520 (13%) |
| Images | 48 total, 9 active, 53.13 GB, **31.43 GB reclaimable (59%)** |
| Containers | 9 total, 7 active, 377.9 MB |
| Volumes | 11 total, 8 active, 79.5 MB |
| Build cache | 0 B |
| `/var/lib/containerd` | 49.52 GiB — the bulk of usage |
| `/var/log/journal` | 3.60 GiB |
| `/opt/scrapling-test` | 0.35 GiB |

### Containers (9)

| Container | State | Image | Verdict |
|---|---|---|---|
| `twinai-worker` | running, healthy | `twinai-worker:latest` | **KEEP** |
| `postiz` | running | `ghcr.io/gitroomhq/postiz-app:latest` | **KEEP** |
| `postiz-postgres` | running | `postgres:17-alpine` | **KEEP** |
| `postiz-redis` | running | `redis:7.2` | **KEEP** |
| `stylique-os` | exited | `stylique-os:latest` | RETIRE |
| `stylique-caddy` | running | `caddy:2-alpine` | RETIRE |
| `stylique-dashboard` | running | `nginx:alpine` | RETIRE |
| `stylique-chrome` | running | `ghcr.io/browserless/chromium:latest` | RETIRE |
| `infallible_hawking` | exited | `ghcr.io/eracle/openoutreach:latest` | RETIRE |

### Volumes (11)

| Volume | Size | Mounted by | Verdict |
|---|---|---|---|
| `postiz_postiz-pg` | 0.06 GiB | postiz-postgres | **KEEP** (database) |
| `postiz_postiz-config` | 0.00 | postiz | **KEEP** |
| `postiz_postiz-redis` | 0.00 | postiz-redis | **KEEP** |
| `postiz_postiz-uploads` | 0.00 | postiz | **KEEP** |
| `caddy_config` | 0.00 | stylique-caddy | RETIRE |
| `caddy_data` | 0.00 | stylique-caddy | RETIRE |
| `deploy_chrome-profile` | 0.00 | stylique-chrome | RETIRE |
| `oo-data` | 0.00 | stylique-os + infallible_hawking | RETIRE (both mounters retiring) |
| `deploy_oo-data` | 0.00 | nothing | RETIRE |
| `stylique-crm-data` | 0.00 | nothing | RETIRE |
| `supabase_edge_runtime_twinai` | 0.01 GiB | nothing | RETIRE (orphaned despite the name) |

### Networks (7)

| Network | Members | Verdict |
|---|---|---|
| `bridge` | twinai-worker | **KEEP** (built-in) |
| `host`, `none` | — | **KEEP** (built-in) |
| `postiz_default` | postiz, postiz-redis, postiz-postgres | **KEEP** |
| `styliquenet` | stylique-caddy, stylique-dashboard | RETIRE |
| `deploy_default` | stylique-chrome | RETIRE |
| `supabase_network_twinai` | none attached | RETIRE (orphaned despite the name) |

### Images

**KEEP (5):** `twinai-worker:latest` (in use), `twinai-worker:prev`,
`twinai-worker:new`, `twinai-discovery:latest` (rollback),
plus the three Postiz bases (`postiz-app`, `postgres:17-alpine`, `redis:7.2`).

**RETIRE (~40):** 33 × `stylique-os:*`, `deploy-stylique-os:latest`,
`caddy:2-alpine`, `nginx:alpine`, `ghcr.io/browserless/chromium:latest`,
`ghcr.io/eracle/openoutreach:latest`, `scrapling-probe:latest`,
`python:3.12-bookworm`, `node:20-bookworm-slim`,
`public.ecr.aws/supabase/edge-runtime:v1.74.1`.

### TwinAI — the complete footprint

| | |
|---|---|
| Container | `twinai-worker`, on `bridge` only |
| Model | `/opt/models/faster-whisper-small` — 474,892 KB |
| Source SHA | `7559776802d42052951452b68f8a35c49eb235bb` |
| Job registry | ingest, build_voice, scrape_dna, validate_source, editor_v2 |
| Health | running · healthy · restarts 0 · ffprobe ok · model present |
| Database | **Supabase — REMOTE, not on this host** |
| Storage | **Remote** |
| Host volumes | **none** |
| Inbound routes | **none** — Caddy carries zero TwinAI upstreams |

This is why the retirement cannot touch TwinAI: nothing being deleted is
attached to it.

### Caddy — proven Stylique-only

One server (`srv0`), one route, host `138-201-119-239.sslip.io`, three nested
routes: an inert `headers`+`encode`, `stylique-os` on
`/api/*` `/health` `/readyz` `/metrics`, and `stylique-dashboard` catch-all.
Both nested routes are in one **route group**.

Zero TwinAI upstreams. Zero Postiz upstreams. Retiring the whole edge therefore
needs no route edit and no reload.

### Chrome exposure

**MEDIUM — not critical.** 6080 (noVNC) and 9222 (DevTools) published on
`0.0.0.0` and `::`, but external TCP from outside the VPS **did not open** —
something upstream (likely a Hetzner cloud firewall) blocks it. Real at the
Docker level, not reachable from the internet.

---

## 3. Order of removal, and why it cannot be shortcut

Discovered by dispatching the stages, not by reading the code:

```
reclaim (images)  ←  remove-container  ←  stop  ←  the Caddy route is gone
```

`stop` refuses while a live Caddy route reaches `stylique-os`.
`reclaim` refuses while the `stylique-os` container exists.

So the images cannot be freed first. Retiring the Caddy edge unblocks
everything behind it.

Sequence:

1. caddy · chrome · dashboard — stop, then remove
2. `stylique-os` — now unblocked — stop, then remove
3. `infallible_hawking` — remove
4. volumes · networks · images — reclaim

### One-way, and accepted

The 33 `stylique-os:*` images appear locally built, not pulled. If they were
never pushed to a registry there is no tag to pull back. Flagged and accepted.

---

## 4. AFTER — the retirement, as it actually ran

Executed 2026-07-28 11:37–12:04 UTC across five workflow runs. Every figure
below is transcribed from the post-stage inventory, not from expectation.

Final inventory sha256 `8570cd3eb67ef81773acc65e9fe278be0b652f3d77ed8eb8bb1752beb849e787`
(run `30357291959`).

| | Before | After | Δ |
|---|---|---|---|
| Root disk used | 64.00 GiB (45%) | **≈33.9 GiB (≈23%)** | **≈30 GiB reclaimed** |
| Root disk free | 79.74 GiB | **109.82 GiB** | +30.08 GiB |
| Containers | 9 | **4** | −5 |
| Images | 48 | **15** | −33 |
| Volumes | 11 | **4** | −7 |
| Networks | 7 | **4** | −3 |
| TwinAI | running / healthy | running / healthy | unchanged |
| Postiz | 3 running | 3 running | unchanged |

Free space is the directly measured number (`ctr_tmp_avail_kb`, which tracks the
root filesystem exactly — 79.74 GiB matched it before the sweep). The used
figure is derived from it against the 143.73 GiB usable total, so it carries one
step of arithmetic that the free-space figure does not.

### What survives

**Containers (4):** `twinai-worker`, `postiz`, `postiz-postgres`, `postiz-redis`
**Volumes (4):** the four `postiz_postiz-*`
**Networks (4):** `bridge`, `host`, `none`, `postiz_default`
**Images (15):** 4 TwinAI (1 active + 3 rollback), 3 Postiz bases, and 8 unused
base images the derivation cannot reach — see below.

Final classification: `active-twinai=2 · twinai-rollback=3 ·
shared-do-not-touch=3 · unknown-do-not-touch=19 · retire-scope=0 ·
proven-orphaned=0`.

Nothing remains in scope. Every preserved resource is preserved because a rule
declined to clear it, not because the sweep ran out of things to do.

### Acceptance

- TwinAI `running` / `healthy`, restarts 0, all five job types registered,
  ffprobe ok, model present, storage reachable
- Model `/opt/models/faster-whisper-small` — 474,892 KB, byte-identical before
  and after
- Worker source SHA `7559776802d42052951452b68f8a35c49eb235bb`, unchanged
- Postiz untouched: 3 containers, 4 volumes, its network, its 3 images
- Every mutating stage ended with **"no unauthorised structural change; every
  authorisation was exercised"**

### What it cost to get here

Four defects surfaced during execution, each caught before it did damage:

1. **The backup step saved one volume of four and exited 0.** `ssh` inside a
   `while read` loop consumes the loop's own stdin. `reclaim` would have deleted
   `oo-data`, `caddy_data` and `deploy_chrome-profile` while the evidence said
   they were saved. Fixed with `ssh -n` plus a planned-vs-produced count.
2. **`stop` was failed by its own verifier.** Stopping a container also unbinds
   its ports, releases its endpoints, kills its listeners and hides it from the
   proxy probe — seven consequences the stage modelled as zero.
3. **`remove-container` would have thrown for all five.** Docker reports a
   stopped container's networks differently in two places, and the comparator
   read that as corruption.
4. **`docker rmi <id>` cannot delete a multi-tagged image.** One image carried
   both `stylique-os:20260612-124314` and `stylique-os:latest`; 25 single-tag
   deletions succeeded, then the remote `set -e` halted the rest.

None produced a wrong deletion. Each was a halt.

### Still out of scope

Eight images (~4.6 GB) no rule can reach: `caddy:2-alpine`, `nginx:alpine`,
`ghcr.io/browserless/chromium`, `ghcr.io/eracle/openoutreach`,
`scrapling-probe`, `python:3.12-bookworm`, `node:20-bookworm-slim`,
`public.ecr.aws/supabase/edge-runtime`.

The first four *were* in scope before the sweep — they were "in use only by
retiring containers". Removing those containers destroyed the evidence that
justified retiring their images, so they fell out of scope mid-sweep. That is
the classifier being consistent rather than convenient, and it needs a separate
explicit pass.

Host paths `/srv/caddy`, `/srv/dashboard`, `/opt/scrapling-test` (0.35 GiB) also
remain: there is no command family for deleting host paths.

Build cache holds 2.257 GB with 36.86 kB reclaimable — not worth a stage.

### Are the leftover paths carrying secrets? — answered

Run `30359814967`, stage `leftover-secrets`, channel status **read-complete**
(the stage warns loudly on any other status, and did not).

- **`/srv/caddy` — no credential-shaped content.** This was the one that
  mattered: a Caddyfile is where basicauth hashes and upstream tokens live. It
  is clean, and the channel proves it was actually read rather than skipped.
- **`/srv/dashboard` — no findings.** Static files.
- **`/opt/scrapling-test/run.py` — 1 match, `env_secret_key`.** One line whose
  left-hand side is a SECRET/TOKEN/PASSWORD-shaped name. That is a shape, not a
  verdict: it may be a real key or an `os.environ` read. Worth thirty seconds of
  a human's eyes, which is exactly what a shape-based sweep is for.

Findings are (file, pattern name, count). No matched text ever entered the log.

The TLS material is separately accounted for: it lived in the `caddy_data`
volume, which was backed up and then deleted.

An earlier run reported 7 findings and status `truncated` — all seven inside a
Python venv, and the venv's file count blew the scan cap, which made the
`/srv/caddy` answer meaningless in both directions. Vendored trees are now
excluded.

## 5. The commands that will run

The tooling used to act on one hardcoded container (`TARGET = 'stylique-os'`).
It now derives the whole sweep from one imported, ordered list, so the
classifier and the planner cannot disagree about what is in scope.

Nothing below is typed by hand. Each line is generated from the live
classification, and the workflow prints the list again before executing it.

```
disable-restart   docker update --restart=no stylique-caddy
                  docker update --restart=no stylique-dashboard
                  docker update --restart=no stylique-chrome
                  docker update --restart=no stylique-os
                  docker update --restart=no infallible_hawking

stop              docker stop --time 30 stylique-caddy
                  docker stop --time 30 stylique-dashboard
                  docker stop --time 30 stylique-chrome
                  docker stop --time 30 stylique-os
                  docker stop --time 30 infallible_hawking

remove-container  docker rm stylique-caddy
                  docker rm stylique-dashboard
                  docker rm stylique-chrome
                  docker rm stylique-os
                  docker rm infallible_hawking

reclaim           docker rmi <each retiring image, BY ID — ~40 of them>
                  docker network rm styliquenet
                  docker network rm deploy_default
                  docker network rm supabase_network_twinai
                  docker volume rm caddy_config
                  docker volume rm caddy_data
                  docker volume rm deploy_chrome-profile
                  docker volume rm oo-data
                  docker volume rm deploy_oo-data
                  docker volume rm stylique-crm-data
                  docker volume rm supabase_edge_runtime_twinai
                  journalctl --vacuum-size=200M
```

There is no `docker system prune` and no `docker image prune -a` anywhere in
it. Those act on a CATEGORY — "everything unused" — and the category includes
whatever nobody classified. Every line above names one exact resource, and
images are named by ID rather than tag so the thing deleted and the thing
authorised are the same string.

Caddy goes first because it is the edge: `stop` refuses while a live route
still reaches `stylique-os`.

Each mutating stage requires the phrase **`RETIRE-STYLIQUE-STACK`**. It used to
be `RETIRE-STYLIQUE-OS`, which named one container out of five — whoever typed
it was attesting to something narrower than what would happen.

### What this sweep does NOT reach

Four images on the approved list stay behind, and it is worth being exact about
why. `scrapling-probe:latest`, `python:3.12-bookworm`, `node:20-bookworm-slim`
and `public.ecr.aws/supabase/edge-runtime` are unused AND tagged, so no rule
derives them: nothing references them, and their tags are not the retiring
stack's. Sweeping "unused and tagged" as a category would reach anything, which
is the one thing this tooling refuses to do. They need a second, explicit pass.

The host paths `/srv/caddy`, `/srv/dashboard` and `/opt/scrapling-test` (0.35
GiB) also stay: there is no command family for deleting host paths, and adding
one is a larger decision than this cleanup.

Neither gap is large. The bulk — the 33 `stylique-os` images — is in scope.

---

## 6. Unrelated, still open

**Whisper model identity is UNPROVEN.** The deployed check is `test -d` on the
model directory — a path check, not an identity check. `verify_dir` and
`manifest_sha256` exist in `worker/scripts/fetch_model.py` but run only at build
time. This gates the Render deploy and has nothing to do with this cleanup; a
healthy transcription is not proof of model convergence.
