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
verification.

**No operator step and no minted/pasted custom secret are required.** Per the
current Supabase docs, hosted Edge Functions are AUTOMATICALLY injected with
**`SUPABASE_SECRET_KEYS`** — a JSON dictionary of the project's new
`sb_secret_…` keys. `ci-bootstrap` parses that dictionary
(`supabase/functions/ci-bootstrap/keyselect.mjs`, `selectSecretKey`) and
deterministically selects the key named `default`, or the sole valid
`sb_secret_…` value if the dictionary uses another shape. The selected value is
validated to start with `sb_secret_`.

- **No legacy fallback.** On this rotated project the legacy HS256
  `service_role` JWT is a dead credential, so it is **not** used at all —
  handing it out would only reintroduce the JWT failure.
- **Fail closed.** If `SUPABASE_SECRET_KEYS` is missing, malformed, empty,
  holds no `sb_secret_…` value, or is ambiguous (multiple secrets, none named
  `default`), the function returns **503** with a non-secret error
  (`staging credential unavailable: <source>`) instead of a bad key.
- **No byte leakage.** The `ci_bootstrap_granted` (and the
  `ci_bootstrap_no_credential`) log line records only `key_source` — the
  selection outcome / key NAME (`secret_key:default`, `no_valid_secret`,
  `malformed_json`, …) — never any key bytes.

The selection logic is proven offline (no network, no secrets) by
`scripts/ci/check_ci_bootstrap_keyselect.mjs`, which runs in `pr-checks.yml`
and covers: valid `default` (object-map and array shapes), sole valid
non-default key, malformed JSON, empty dictionary, non-`sb_secret_` value,
legacy-only (unset) environment, ambiguous multiple secrets, and the
never-leak-bytes invariant.

Production (`jmdecibuytznsonrasxw`) is a different project and is never touched.
With the auto-injected dictionary in place, every phase's `createUser` uses the
new secret key and the Phase 1–7 matrices run without the intermittent JWT
failure.
