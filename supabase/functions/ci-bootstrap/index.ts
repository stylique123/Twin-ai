// STAGING-ONLY keyless credential gate for editor-v2 phase-gate workflows.
// Version-controlled here; deployed ONLY to the staging project
// (twinai-phase1-staging, ref otgzjsagybpgtwweuptj). Never deployed to prod.
//
// Reusable policy (deliberately narrow):
//   - GitHub OIDC token REQUIRED, signed by GitHub's JWKS (unforgeable)
//   - repository MUST be stylique123/Twin-ai (forks present their own repo -> refused)
//   - workflow MUST be .github/workflows/staging-integration.yml in this repo
//   - ref MUST be an approved phase-gate branch (rebuild/editor-v2-*) or main
//   - audience pinned; issuer pinned
//   - returns ONLY this STAGING project's keys (its env has no production access)
//   - every decision is logged (visible in Supabase edge logs)
//   - kill switch: set CI_BOOTSTRAP_DISABLED=1 in function secrets, or delete
//     the function. Revocation = one action, no repo change.
//
// CREDENTIAL PATH (post JWT signing-key rotation): the legacy HS256 service_role
// JWT (SUPABASE_SERVICE_ROLE_KEY) is REJECTED by GoTrue once the project verifies
// with the new asymmetric (ES256) keys — the admin API (createUser) then fails
// with "unrecognized JWT kid <nil> for algorithm ES256". The fix is to hand out
// a NEW-FORMAT secret key (sb_secret_...), which the gateway maps to service_role
// without JWT verification (exactly as the anon path already uses the publishable
// sb_publishable_... key). Hosted Edge Functions are AUTOMATICALLY injected with
// SUPABASE_SECRET_KEYS — a JSON dictionary of the project's new sb_secret_... keys
// — so NO operator step (no minted/pasted custom secret) is required. This function
// selects the "default" (or sole valid) sb_secret_ value from that dictionary and
// FAILS CLOSED (503) if none is present. The legacy service_role fallback is
// removed entirely: on this rotated project it is a dead credential, so silently
// handing it out would only reintroduce the JWT failure.
import * as jose from 'https://esm.sh/jose@5.9.6'
import { selectSecretKey } from './keyselect.mjs'

const ISSUER = 'https://token.actions.githubusercontent.com'
const AUDIENCE = 'twinai-staging-integration'
const REPOSITORY = 'stylique123/Twin-ai'
const WORKFLOW_PATH = '.github/workflows/staging-integration.yml'
const REF_ALLOWED = /^refs\/heads\/(main|rebuild\/editor-v2-[a-z0-9-]+)$/

const JWKS = jose.createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks`))

function refuse(reason: string, detail: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ event: 'ci_bootstrap_refused', reason, ...detail }))
  return new Response(JSON.stringify({ error: `verification failed: ${reason}` }), { status: 403 })
}

// Select the post-rotation secret key from the auto-injected SUPABASE_SECRET_KEYS
// dictionary. Returns { key?, source } where `source` names only the outcome /
// key NAME (never key bytes), so callers can log it safely. No legacy fallback.
function serviceCredential(): { key?: string; source: string } {
  return selectSecretKey(Deno.env.get('SUPABASE_SECRET_KEYS'))
}

Deno.serve(async (req: Request) => {
  if (Deno.env.get('CI_BOOTSTRAP_DISABLED') === '1') return refuse('disabled')
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })
  let token = ''
  try {
    const body = await req.json()
    token = String(body?.token ?? '')
  } catch {
    return new Response(JSON.stringify({ error: 'json body with token required' }), { status: 400 })
  }
  if (!token) return new Response(JSON.stringify({ error: 'token required' }), { status: 400 })
  try {
    const { payload } = await jose.jwtVerify(token, JWKS, { issuer: ISSUER, audience: AUDIENCE })
    const repo = String(payload.repository ?? '')
    const ref = String(payload.ref ?? '')
    const workflowRef = String(payload.workflow_ref ?? '')
    if (repo !== REPOSITORY) return refuse('wrong repository', { repo })
    if (!workflowRef.startsWith(`${REPOSITORY}/${WORKFLOW_PATH}@`)) return refuse('wrong workflow', { workflowRef })
    if (!REF_ALLOWED.test(ref)) return refuse('ref not approved for phase gates', { ref })
    // Resolve the staging secret key AFTER the identity gate passes, and FAIL
    // CLOSED (503) with a non-secret error if the rotated project exposes no
    // valid sb_secret_ key — never fall back to the dead legacy service_role JWT.
    const cred = serviceCredential()
    if (!cred.key) {
      console.log(JSON.stringify({
        event: 'ci_bootstrap_no_credential', repo, ref, workflowRef,
        run_id: payload.run_id ?? null, actor: payload.actor ?? null,
        key_source: cred.source,
      }))
      return new Response(
        JSON.stringify({ error: `staging credential unavailable: ${cred.source}` }),
        { status: 503, headers: { 'Content-Type': 'application/json' } },
      )
    }
    console.log(JSON.stringify({
      event: 'ci_bootstrap_granted', repo, ref, workflowRef,
      run_id: payload.run_id ?? null, actor: payload.actor ?? null,
      key_source: cred.source,
    }))
    return new Response(
      JSON.stringify({
        url: Deno.env.get('SUPABASE_URL'),
        anonKey: Deno.env.get('SUPABASE_ANON_KEY'),
        serviceRoleKey: cred.key,
      }),
      { headers: { 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    return refuse(String(e).slice(0, 200))
  }
})
