# VPS retirement scope — founder decision, 2026-07-28

Host `138.201.119.239`. **Keep TwinAI and Postiz. Retire everything else.**

This is the authoritative target list. It was produced by the read-only
dependency probe (`stage=stack-dependency`, run 30348365132, **zero blockers**),
which proves ownership by EDGES rather than by name prefix.

## PRESERVE — TwinAI

TwinAI's entire footprint on this host. Its database is **Supabase, remote**;
its storage is remote; it has no host volumes and nothing routes inward to it.

| Kind | Resource |
|---|---|
| container | `twinai-worker` (on `bridge`) |
| image | `twinai-worker:latest` |
| image | `twinai-worker:prev`, `twinai-worker:new`, `twinai-discovery:latest` — rollback |
| path | `/opt/models/faster-whisper-small` (≈475 MB, pinned ASR model) |

## PRESERVE — Postiz

Self-hosted social scheduling (`gitroomhq/postiz-app`). **Not connected to
TwinAI**: separate network, no shared volumes, no env reference in either
direction, no Caddy route. Kept on the founder's decision because the Postgres
holds connected social accounts (OAuth tokens) and scheduled posts, which are
expensive to rebuild and cheap to leave alone.

`postiz`, `postiz-postgres`, `postiz-redis` · volumes `postiz_postiz-{config,pg,redis,uploads}`
· network `postiz_default` · images `ghcr.io/gitroomhq/postiz-app`, `postgres:17-alpine`, `redis:7.2`

## RETIRE

**Containers** `stylique-os`, `stylique-caddy`, `stylique-chrome`,
`stylique-dashboard`, `infallible_hawking` (OpenOutreach)

**Volumes** `caddy_config`, `caddy_data`, `deploy_chrome-profile`,
`stylique-crm-data`, `deploy_oo-data`, `oo-data`,
`supabase_edge_runtime_twinai`

**Networks** `styliquenet`, `deploy_default`, `supabase_network_twinai`

**Images** 33 × `stylique-os:*`, `deploy-stylique-os:latest`, `caddy:2-alpine`,
`nginx:alpine`, `ghcr.io/browserless/chromium:latest`,
`ghcr.io/eracle/openoutreach:latest`, `scrapling-probe:latest`, and the unused
base images (`python:3.12-bookworm`, `node:20-bookworm-slim`,
`public.ecr.aws/supabase/edge-runtime`)

**Host paths** `/srv/caddy`, `/srv/dashboard`, `/opt/scrapling-test`

Approximately 25–30 GB.

## ONE-WAY, AND KNOWN

The 33 `stylique-os:*` images appear to be **locally built, not pulled**. If
they were never pushed to a registry, deletion is irreversible — there is no tag
to pull back. Flagged and accepted.

## ORDER, AND WHY IT CANNOT BE SHORTCUT

The stages form a hard chain, discovered by dispatching them:

    reclaim (images)  ←  remove-container  ←  stop  ←  the Caddy route is gone

`stop` refuses while a live Caddy route reaches `stylique-os` on `/api/*`,
`/health`, `/readyz`, `/metrics`. `reclaim` refuses while the container exists.
So the images cannot be freed first; retiring the Caddy edge is what unblocks
everything behind it.

Caddy is proven Stylique-only: its runtime config has ONE server, ONE route, and
zero TwinAI and zero Postiz upstreams. Retiring the whole edge therefore needs
no route edit and no reload.

## WHAT BLOCKS EXECUTION TODAY

Every mutating stage in `vps-retire.yml` is hardcoded to a single target
(`TARGET = 'stylique-os'` in `plan_retirement.mjs`). Nothing in the tooling can
act on caddy, chrome, dashboard or OpenOutreach. **Extending the stages from one
hardcoded container to the proven target set is the work that unlocks the whole
sweep**, and it must keep every existing property: typed plan resources, the
argv bijection, the confirm phrase on mutating stages, least-privilege
structural authorisation, and byte-exact rollback evidence.

## HELD — NOTHING BELOW IS AUTHORISED

Nothing outside the RETIRE list moves. `oo-data` is on the retire list only
because `stylique-os` and `infallible_hawking` — its only two mounters — are
both retiring; if either survives, it stays.

## STATE AT TIME OF WRITING

- `stylique-os` restart policy set to `no` (only mutation performed; reversible)
- Disk 61.00 GiB used of 149.89 (43%), 82.74 GiB free
- TwinAI `running` / `healthy`, restarts 0, ffprobe ok, model present
- Every run's structural delta clean; nothing deleted
- Chrome exposure: **medium, not critical** — 6080/9222 published on
  `0.0.0.0` but external TCP did not open from outside the VPS
- Whisper model identity remains UNPROVEN (`test -d` is a path check, not
  identity) and still gates the Render deploy — unrelated to this cleanup
