# Staging `ci-bootstrap` — keyless credential gate for phase workflows

The editor-v2 phase gates run their integration matrices on GitHub Actions
against the **dedicated staging Supabase project** (`twinai-phase1-staging`,
ref `otgzjsagybpgtwweuptj`). The runner needs the staging service-role key; the
repository is public, so **no secret may live in the repo**. `ci-bootstrap` is
a staging-only edge function that hands out the staging keys to a caller that
proves its identity with a **GitHub OIDC token** (keyless auth).

## Policy (enforced in the function, all checks logged)

| Check | Value |
| --- | --- |
| Issuer | `https://token.actions.githubusercontent.com` (signature verified against GitHub's JWKS) |
| Audience | `twinai-staging-integration` |
| Repository | exactly `stylique123/Twin-ai` (forks present their own repo claim → refused) |
| Workflow | exactly `.github/workflows/staging-integration.yml` in this repo (`workflow_ref` prefix pin) |
| Ref | `refs/heads/main` or `refs/heads/rebuild/editor-v2-*` (phase branches) |

- **Staging-only**: the function runs ON the staging project; its environment
  contains only that project's keys. It has **no production credential and no
  production mutation capability** — production (`jmdecibuytznsonrasxw`) is a
  different project it cannot see.
- **Audit log**: every grant and every refusal is logged
  (`ci_bootstrap_granted` / `ci_bootstrap_refused` with repo/ref/workflow/
  run_id/actor) — visible in the staging project's edge-function logs.
- **Live negative tests**: every staging-integration run first proves the gate
  refuses (a) no token, (b) a forged token, (c) a REAL GitHub OIDC token minted
  with the wrong audience — so "unauthorized is denied" is continuously
  verified, not assumed.

## Revocation (one action, no repo change)

Any one of:
1. Set the function secret `CI_BOOTSTRAP_DISABLED=1` on the staging project →
   every call returns 403 `disabled`.
2. Delete the `ci-bootstrap` function from the staging project.
3. Delete or pause the staging project entirely.

Rotating the staging service-role key (Supabase dashboard) additionally
invalidates anything previously handed out.

## Credential path after a JWT signing-key rotation

The function code lives in `supabase/functions/ci-bootstrap/index.ts` (deployed
ONLY to staging). When the staging project migrates to the new asymmetric JWT
signing keys (ES256), the **legacy HS256 `service_role` JWT** that Supabase
injects as `SUPABASE_SERVICE_ROLE_KEY` is rejected by GoTrue's admin API — the
harness's `admin.auth.admin.createUser` then fails, intermittently at first
(rotation in progress across nodes), with:

```
invalid JWT: … unrecognized JWT kid <nil> for algorithm ES256
```

The anon path already dodges this by using the new **publishable** key
(`sb_publishable_…`). The service path must do the same with a new **secret**
key (`sb_secret_…`), which the API gateway maps to `service_role` without JWT
verification. `ci-bootstrap` therefore hands out
`CI_STAGING_SECRET_KEY` when set, falling back to the legacy injected key
otherwise (so the deploy is a no-op until provisioned, and never weakens the
gate). The `ci_bootstrap_granted` log line records `key_source`
(`secret_key` vs `legacy_service_role`).

**One operator step (staging only, no repo change) to complete the repair:**
1. Supabase dashboard → the **staging** project → *Project Settings → API Keys*
   → create a **secret key** (`sb_secret_…`).
2. Set it as the `ci-bootstrap` function secret **`CI_STAGING_SECRET_KEY`**
   (`supabase secrets set CI_STAGING_SECRET_KEY=sb_secret_… --project-ref
   otgzjsagybpgtwweuptj`).

Do this on staging only — production is a different project and must not be
touched. Once set, every phase's `createUser` uses the new secret key and the
Phase 1–7 matrices run without the intermittent JWT failure.
