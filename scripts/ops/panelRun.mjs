// THE FICTIONAL CREATOR PANEL RUN (owner, 13 Oct): `scriptBatch.mjs --group=panel`.
//
// 40 requests (scripts/ops/fixtures/fictional-panel.json), each run AS its own
// fictional creator account — not the heartbeat — so each script sees only that
// creator's voice, stories and products. The accounts and their owner ids live
// in one PRIVATE `test_run_files` row (kind 'other', written by
// seedFictionalPanel.mjs); only that row's id travels through the workflow.
//
// ⚖️ CURRENT PIPELINE, GATE IN MEASURE MODE. The edge treats these accounts as
// test accounts by identity (app_metadata), so the invention gate classifies
// and records (blueprint.invention_gate, gate_ledger, writer_supply) and never
// repairs. Nothing here asks for repair.
//
// ⚖️ A CREATOR WHO IS ASKED, SKIPS. When the writer asks first (409
// READINESS_INCOMPLETE), the stand-in answers "Nothing specific, keep it
// general." and picks the request's own product (or none), so the only material
// is what is on file. Answers are marked simulated in the results.
//
// ⚖️ BUDGET. After every script the estimated spend so far (ai_cost_by_stage_script,
// UNCONFIRMED prices) is read; past PANEL_BUDGET_USD (default 2.5) the run stops.
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { templateOf } from './templateOf.mjs'

export const PANEL_SKIP_ANSWER = 'Nothing specific, keep it general.'
// A request's duration profile (templateData.ts DURATION_PROFILES) sets its target length.
export const PROFILE_SECONDS = { sprint: 30, standard: 60, deep: 90 }
const FIXTURE = new URL('./fixtures/fictional-panel.json', import.meta.url)

/** The panel scenarios (40 in the fixture), in fixture order, with the account and product resolved.
 * `limit` is applied BEFORE resolving accounts, so a limited run only needs its own creators seeded. */
export function panelScenarios(fixture, accountsDoc, limit = Infinity) {
  const byKey = new Map((accountsDoc?.accounts ?? []).map((a) => [a.key, a]))
  return fixture.requests.slice(0, limit).map((r, n) => {
    const acct = byKey.get(r.creator)
    if (!acct) throw new Error(`panel: no seeded account for creator ${r.creator}`)
    const productId = r.product ? acct.products?.[r.product] : null
    if (r.product && !productId) throw new Error(`panel: creator ${r.creator} has no seeded product ${r.product}`)
    const body = { goal: r.goal, door: productId ? 'product' : 'idea', reference_note: r.note, target_seconds: PROFILE_SECONDS[r.profile] ?? [30, 45, 60][n % 3],
      ...(productId ? { selected_product_id: productId } : {}) }
    return { n, group: 'panel', label: `${r.creator} ${r.kind}`, id: r.id ?? null, template: r.template ?? null, profile: r.profile ?? null, lacks: r.lacks ?? [], creator: r.creator, kind: r.kind, product: r.product ?? null, owner_id: acct.owner_id, email: acct.email, body }
  })
}

/** Answers for a 409: skip every question; the product pick is the request's own product, else the last option (none). */
export function skipAnswers(questions, body) {
  const out = { ...(body.readiness_answers ?? {}) }
  let selected = body.selected_product_id ?? null
  for (const q of questions ?? []) {
    if (q?.field === 'selected_product' && Array.isArray(q.options) && q.options.length) {
      const opts = q.options.map((o) => String(o.value))
      selected = (selected && opts.includes(selected)) ? selected : opts[opts.length - 1]
      continue
    }
    if (q?.field) out[q.field] = PANEL_SKIP_ANSWER
  }
  return { readiness_answers: out, ...(selected ? { selected_product_id: selected } : {}) }
}

async function signInAs(url, anon, admin, email) {
  // One-time admin magic link: no password exists anywhere.
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  if (error || !data?.properties?.hashed_token) throw new Error(`panel: link failed: ${error?.message ?? 'no token'}`)
  const client = createClient(url, anon, { auth: { persistSession: false } })
  const { data: s, error: e2 } = await client.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: 'magiclink' })
  if (e2 || !s?.session) throw new Error(`panel: sign-in failed: ${e2?.message ?? 'no session'}`)
  return client
}

export async function runPanel({ url, anon, service, batch, limit = Infinity, paceMs = 15000 }) {
  const admin = createClient(url, service, { auth: { persistSession: false } })
  const fileId = Number(process.env.PANEL_FILE_ID || 0)
  if (!fileId) throw new Error('panel: PANEL_FILE_ID (the private test_run_files row from seedFictionalPanel.mjs) is required')
  const { data: row, error } = await admin.from('test_run_files').select('kind, content').eq('id', fileId).single()
  if (error || !row || row.kind !== 'other') throw new Error(`panel: test_run_files row ${fileId} not found or not kind=other`)
  const accounts = JSON.parse(row.content)
  const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8'))
  const budget = Number(process.env.PANEL_BUDGET_USD || 2.5)
  const list = panelScenarios(fixture, accounts, limit)
  const { data: doneRows } = await admin.from('script_batch_results').select('n').eq('batch', batch).eq('status', 200)
  const done = new Set((doneRows ?? []).map((x) => x.n))
  console.log(`panel ${batch}: ${list.length} scenarios, ${done.size} already done, budget $${budget}`)
  const clients = new Map()
  const spent = async () => {
    const { data: rs } = await admin.from('script_batch_results').select('generation_id').eq('batch', batch).gte('n', 0).not('generation_id', 'is', null)
    const ids = (rs ?? []).map((r) => r.generation_id)
    if (!ids.length) return { usd: 0, scripts: 0 }
    const { data: cost } = await admin.from('ai_cost_by_stage_script').select('est_usd').in('generation_id', ids)
    return { usd: (cost ?? []).reduce((a, r) => a + Number(r.est_usd ?? 0), 0), scripts: ids.length }
  }
  for (const sc of list) {
    if (done.has(sc.n)) continue
    const before = await spent()
    if (before.usd >= budget) { console.log(`::warning title=panel-budget::stopped at $${before.usd.toFixed(3)} after ${before.scripts} scripts (budget $${budget})`); break }
    if (!clients.has(sc.creator)) clients.set(sc.creator, await signInAs(url, anon, admin, sc.email))
    const client = clients.get(sc.creator)
    const token = async () => (await client.auth.getSession()).data?.session?.access_token
    await new Promise((r) => setTimeout(r, paceMs))
    // The model lengthen pass is OFF on panel measure runs unless BATCH_LENGTHEN=on
    // (cost). The deterministic word-budget repair runs either way.
    let body = { ...sc.body, ...(process.env.BATCH_LENGTHEN === 'on' ? {} : { lengthen: false }), idempotency_key: `${batch}-${sc.n}` }
    const post = async () => {
      const t0 = Date.now()
      const res = await fetch(`${url}/functions/v1/generate-blueprint`, {
        method: 'POST', headers: { authorization: `Bearer ${await token()}`, apikey: anon, 'content-type': 'application/json' },
        body: JSON.stringify(body), signal: AbortSignal.timeout(240_000),
      })
      const text = await res.text()
      let json = null
      try { json = JSON.parse(text) } catch { /* not JSON */ }
      return { status: res.status, ok: res.ok, json, text, ms: Date.now() - t0 }
    }
    let r
    try { r = await post() } catch (e) { r = { status: 0, ok: false, json: null, text: `network: ${String(e?.message ?? e).slice(0, 120)}`, ms: 0 } }
    const asked = []
    for (let round = 0; round < 3 && r.status === 409 && r.json?.code === 'READINESS_INCOMPLETE' && Array.isArray(r.json.questions); round++) {
      asked.push(...r.json.questions.map((q) => q.question))
      body = { ...body, ...skipAnswers(r.json.questions, body) }
      await new Promise((res) => setTimeout(res, 6000))
      try { r = await post() } catch (e) { r = { status: 0, ok: false, json: null, text: `network: ${String(e?.message ?? e).slice(0, 120)}`, ms: 0 } }
    }
    const bp = r.json?.blueprint ?? null
    const lines = Array.isArray(bp?.script) ? bp.script.map((b) => String(b?.line ?? '')).filter(Boolean) : []
    // No viewer panel on a measure run: claim the script before the worker's poll can.
    if (r.json?.id) await admin.from('audience_tests').upsert({ generation_id: r.json.id, owner_id: sc.owner_id, status: 'failed', failure: 'skipped: fictional panel measure run', created_at: new Date().toISOString() }, { onConflict: 'generation_id', ignoreDuplicates: true })
    await admin.from('script_batch_results').insert({
      batch, n: sc.n,
      scenario: { group: 'panel', label: sc.label, creator: sc.creator, kind: sc.kind, product: sc.product, fictional: true, answers_simulated: asked.length > 0, answer_style: asked.length ? 'skip' : null, template: templateOf(bp), word_budget: bp?.word_budget ?? null, body },
      status: r.status, code: r.json?.code ?? null, reason: r.ok ? null : String(r.json?.error ?? r.text).slice(0, 400),
      generation_id: r.json?.id ?? null, duration_ms: r.ms,
      findings: [
        ...(bp ? [{ k: `template_${templateOf(bp)}`, d: bp?.word_budget ? `${bp.word_budget.action} ${bp.word_budget.words_before}->${bp.word_budget.words_after}/${bp.word_budget.budget}` : '' }] : []),
        ...(asked.length ? [{ k: 'asked_first', d: asked.join(' | ').slice(0, 300) }] : []),
        ...(bp?.invention_gate ? [{ k: `gate_${bp.invention_gate.outcome}`, d: JSON.stringify(bp.invention_gate.before ?? {}) }] : bp ? [{ k: 'gate_missing', d: '' }] : []),
      ],
      script_text: lines.length ? lines.map((l, i) => `${i + 1}. ${l}`).join('\n') : null,
      hooks: Array.isArray(bp?.hook_options) ? bp.hook_options : null,
      judge: null,
    })
    console.log(`#${sc.n} panel/${sc.label}/${sc.body.goal} → ${r.status} gate=${bp?.invention_gate?.outcome ?? '-'} I=${bp?.invention_gate?.before?.I ?? '-'}`)
  }
  const end = await spent()
  console.log(`::notice title=panel-cost::est $${end.usd.toFixed(3)} for ${end.scripts} scripts, $${(end.usd / Math.max(1, end.scripts)).toFixed(4)}/script (UNCONFIRMED prices)`)
}
