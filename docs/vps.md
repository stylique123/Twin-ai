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

## 4. AFTER — to be filled by the post-retirement run

_Not yet executed. This section stays empty until the sweep has run, and is
filled from the after-inventory rather than from expectation._

| | Before | After | Δ |
|---|---|---|---|
| Disk used | 61.00 GiB (43%) | _pending_ | _pending_ |
| Containers | 9 | _pending_ (expect 4) | _pending_ |
| Images | 48 | _pending_ (expect ~8) | _pending_ |
| Volumes | 11 | _pending_ (expect 4) | _pending_ |
| Networks | 7 | _pending_ (expect 4) | _pending_ |
| TwinAI health | running/healthy | _pending_ | must be unchanged |
| Postiz | 3 running | _pending_ | must be unchanged |

Expected reclaim: **≈25–30 GiB**.

Acceptance requires: TwinAI running and healthy, its model present, ffprobe
usable, zero structural change to any preserved resource, and the after
inventory digest recorded here.

---

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
