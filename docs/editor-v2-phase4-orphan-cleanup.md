# Phase 4 probe-object orphans — accepted & documented (Option B)

## Decision

**Accept and document** the two inert probe-object orphans left in the
production `takes` bucket. Do **not** provision production S3 access keys solely
to remove ~120 KB of controlled probe data — that credential is a larger
standing risk than the residue.

Decision owner: TwinAI owner / reviewer (approved in the Phase 5 gate decision).
Date recorded: 2026-07-20.

## What they are

Two source-probe recordings created by the Phase 4 production verification
smoke and then partially cleaned. The `media_assets`, `generations`, probe
`auth.users`/identity and `storage.objects` **rows** were all removed; the
backend blobs remained because the row delete was (incorrectly, at the time)
done via SQL, which stripped each object's `version` pointer.

| Field | Value |
|---|---|
| Bucket | `takes` |
| Object name 1 | `00000000-aaaa-4bbb-8ccc-000000000004/00000000-aaaa-4bbb-8ccc-000000000005/8b38ecca-fd4c-47f0-9f13-61d58e5291d7.webm` |
| Object name 2 | `00000000-aaaa-4bbb-8ccc-000000000004/00000000-aaaa-4bbb-8ccc-000000000006/e17d4f62-bbb4-4bc4-9ced-dfdce508cfd3.webm` |
| Backend key shape | `takes/<name>/<version>` — the `<version>` UUID is unknown (it lived only in the deleted rows) |
| Approx size | ~60 KB each, ~120 KB total (2 s 320×240 VP8 + Vorbis probe fixture) |
| Content class | **Probe-only** synthetic test media (ffmpeg `testsrc` + sine tone). No user data. |
| Cause | Direct SQL delete of `storage.objects` rows during Phase 4 cleanup, which orphaned the backend blobs. |
| DB reference | **None.** Verified: 0 `storage.objects` rows under the prefix, 0 `media_assets`, probe user/identity/generations absent. |
| Application access | **Impossible.** No row → the app and the path-based Storage API cannot list, sign, read, or delete them; no signed URL can be minted. |

## Why not remove them now

The supported path-based Storage API (and the CLI/dashboard, which are
row-based) locate a blob from its row's `version`. That pointer is gone, so the
only supported mechanism that can reach the orphans is the S3-compatible
protocol endpoint (ListObjectsV2 by prefix + DeleteObject), which requires
provisioning production S3 access keys. Creating a durable production credential
to delete 120 KB of inert probe data introduces more risk than the residue.

## Future deletion opportunity

Remove them opportunistically when an **already-approved backend maintenance
path** exists — e.g. a scheduled Supabase support/storage-maintenance action,
or the next time S3 access keys are provisioned for another approved reason. At
that point: S3-list the `takes/00000000-aaaa-4bbb-8ccc-000000000004/` prefix,
delete exactly the two keys above, confirm the prefix is empty, then revoke the
keys.

## Standing rule (enforced going forward)

**Never delete `storage.objects` rows directly (SQL).** Delete through the
supported Storage API while the row still exists — that removes the row *and*
the backend blob together. The `prod-source-smoke` workflow now self-cleans
this way in an `always()` step; `storage.protect_delete` remains the backstop
against direct row deletion, and `storage.allow_delete_query` is confirmed not
persistently enabled on any role/database/session.
