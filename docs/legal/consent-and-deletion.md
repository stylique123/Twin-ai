# Consent record, data deletion and privacy notice (Task D item 8)

**State: built behind a flag that defaults OFF. The migration is a file, not applied.**

## What existed before

- `eval_consents` (eval participants only; 0 rows in production).
- `delete_generation` (one script) and `enqueue_media_purge` (media files). No account-wide deletion.
- No privacy notice in the app; no consent record for users.

## What this adds

| Piece | File | Notes |
|---|---|---|
| Consent table | `supabase/migrations/0294_consent_records_and_data_deletion.sql` | `consent_records`: owner, kind, notice version, granted/withdrawn time. No content. Kept after deletion as proof, so no FK to `auth.users`. RLS: a user reads, inserts and withdraws only their own rows |
| Deletion request | same migration | `data_deletion_requests` + `request_data_deletion()` RPC for the signed-in user. A request deletes nothing |
| Deletion processor | same migration | `process_data_deletion(request_id)`, service role only. Deletes rows keyed by `owner_id` / `user_id` in every public table (new tables are covered automatically), except the retained list: billing, subscriptions, credit events, spend ledgers, admin roles, consent records, the request log. Stores per-table counts only. On error, rolls back and marks the request failed |
| Notice + buttons | `apps/web/src/lib/privacyNotice.ts`, `apps/web/src/components/PrivacyNotice.tsx`, mounted in Settings → Account | Renders nothing unless `VITE_PRIVACY_NOTICE=1` |
| Tests | `apps/web/src/components/PrivacyNotice.test.tsx` (15) | flag off by default and renders/calls nothing; consent row shape; failure states; two-step deletion; Settings mount (disconnect test); migration safety (RLS, processor not grantable, retained tables, request deletes nothing) |
| CI | `scripts/ci/check_staging_migration_coverage.mjs` | 0294 listed as file-only with its reason |

## To turn it on (owner)

1. Counsel reviews the notice wording in `privacyNotice.ts` (`NOTICE_SECTIONS`) and the retained-table list.
2. Apply migration 0294 by hand.
3. Set `VITE_PRIVACY_NOTICE=1` for the web build.
4. Runbook per request: run `process_data_deletion(<id>)` as service role, then purge the user's
   storage objects (`enqueue_media_purge`), then delete the auth user. Steps 2 and 3 are manual today.

## Left to do

- Counsel sign-off on wording and retention.
- Storage and auth-user removal are manual; an operator script could automate them.
- The worker's derived rows that are keyed by other ids (for example corpus reads) are not
  user-owned and are not touched; confirm with counsel that this is correct.
