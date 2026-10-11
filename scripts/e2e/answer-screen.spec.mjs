#!/usr/bin/env node
// END-TO-END CHECK OF THE "NEEDS ONE ANSWER" SCREEN, AGAINST THE LIVE SITE.
//
// Owner ask (13 Oct): before any rollout, use the screen in the running app —
// answer, skip, general version, unchecked refresh — and confirm on ONE real
// request that the rewritten script uses her answers.
//
// ⚖️ TWO PARTS, AND ONLY THE SECOND SPENDS.
//   --ui    Opens /result/<id> for a trial generation in each state. It prefers
//           an EXISTING generation; when none exists for a state it seeds a COPY
//           of an existing blueprint with fictional gate questions and a
//           placeholder line (service key, deleted afterwards). It never clicks
//           the final submit, so it makes no model call.
//   --real  One regenerate through `generate-blueprint` with readiness_answers,
//           exactly as the screen sends it (~1 generation). Verifies the
//           answer was used and the skipped question was not asked again.
//
// ⚠️ OUTPUT IS PASS/FAIL ONLY. The repo is public, so its Actions logs are
// too: no tokens, ids, script text or screenshots are printed or uploaded.
//
// Sign-in is the heartbeat's: password sign-in as the test account with the
// anon key (generate-blueprint needs a real user). For the browser, that same
// session is written into localStorage under supabase-js's own key before the
// app boots, so the app starts signed in.

import { createClient } from '@supabase/supabase-js'

const RUN_UI = process.argv.includes('--ui')
const RUN_REAL = process.argv.includes('--real')

function needEnv(k) {
  const v = process.env[k]
  if (!v) throw new Error(`missing ${k}`)
  return v
}

let failures = 0
function check(name, ok, why = '') {
  if (ok) console.log(`::notice title=pass::${name}`)
  else { failures++; console.log(`::error title=fail::${name}${why ? ` — ${why}` : ''}`) }
}

const SUPABASE_URL = needEnv('SUPABASE_URL')
const ANON = needEnv('SUPABASE_ANON_KEY')

async function signIn() {
  const auth = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } })
  const { data, error } = await auth.auth.signInWithPassword({
    email: needEnv('HEARTBEAT_USER_EMAIL'),
    password: needEnv('HEARTBEAT_USER_PASSWORD'),
  })
  if (error || !data?.session?.access_token) throw new Error('test account could not sign in')
  return data.session
}

const statusOf = (bp) => {
  const cs = bp?.check_status
  if (['checked', 'needs_answers', 'general', 'unchecked'].includes(cs)) return cs
  const o = bp?.invention_gate?.outcome
  return o === 'needs_answers' || o === 'general' ? o : 'checked'
}
const questionsOf = (bp) => (Array.isArray(bp?.gate_questions) ? bp.gate_questions : [])
  .filter((q) => q && typeof q.text === 'string' && typeof q.writes_to === 'string').slice(0, 3)
const scriptText = (bp) => (Array.isArray(bp?.script) ? bp.script : []).map((s) => String(s?.line ?? '')).join(' ')

// ── UI ─────────────────────────────────────────────────────────────────────

const FICTIONAL_QUESTIONS = [
  { scope: 'script', kind: 'event', text: 'What happened the first time you tried the blue lantern trick?', writes_to: 'e2e_lantern' },
  { scope: 'script', kind: 'number', text: 'How many paper cranes were on the shelf that week?', writes_to: 'e2e_cranes' },
]

function seededBlueprint(base, state) {
  const bp = structuredClone(base ?? {})
  const script = Array.isArray(bp.script) && bp.script.length ? bp.script : [{ line: 'Here is the idea.' }]
  script[0] = { ...(script[0] ?? {}), line: 'The first time I tried it [Your answer: what happened with the blue lantern] and I never looked back.' }
  bp.script = script
  bp.gate_questions = FICTIONAL_QUESTIONS
  bp.check_status = state
  bp.invention_gate = { ...(bp.invention_gate ?? {}), outcome: state }
  return bp
}

async function runUi(session, admin) {
  const BASE = needEnv('E2E_BASE_URL').replace(/\/+$/, '')
  const userId = session.user.id
  const { data: rows, error } = await admin.from('generations')
    .select('id, reference_url, reference_note, fidelity, transcript_id, blueprint')
    .eq('user_id', userId).order('created_at', { ascending: false }).limit(60)
  if (error || !rows?.length) { check('ui: test account has generations to read', false); return }

  const { chromium } = await import('playwright')
  const browser = await chromium.launch()
  const ref = new URL(SUPABASE_URL).hostname.split('.')[0]
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  await context.addInitScript(([k, v]) => { try { localStorage.setItem(k, v) } catch { /* ignore */ } }, [`sb-${ref}-auth-token`, JSON.stringify(session)])

  const seeded = []
  try {
    for (const state of ['needs_answers', 'general', 'unchecked']) {
      let row = rows.find((r) => statusOf(r.blueprint) === state && (state === 'unchecked' || questionsOf(r.blueprint).length > 0))
      let isSeed = false
      if (!row) {
        const base = rows.find((r) => Array.isArray(r.blueprint?.script) && r.blueprint.script.length) ?? rows[0]
        const { data: ins, error: insErr } = await admin.from('generations').insert({
          user_id: userId, reference_url: base.reference_url, reference_note: base.reference_note,
          fidelity: base.fidelity, transcript_id: base.transcript_id ?? null,
          blueprint: seededBlueprint(base.blueprint, state), credits_spent: 0,
        }).select('id, blueprint').single()
        if (insErr || !ins) { check(`${state}: seed a copy`, false, 'insert refused'); continue }
        seeded.push(ins.id); row = ins; isSeed = true
      }
      console.log(`::notice title=source::${state} uses ${isSeed ? 'a seeded copy' : 'an existing generation'}`)
      const page = await context.newPage()
      try { await checkState(page, `${BASE}/result/${row.id}`, state, row, isSeed, admin) }
      catch (e) { check(`${state}: page ran`, false, String(e?.name ?? 'error')) }
      finally { await page.close() }
    }
  } finally {
    await browser.close()
    if (seeded.length) {
      const { error: delErr } = await admin.from('generations').delete().in('id', seeded)
      check('cleanup: seeded copies deleted', !delErr)
    }
  }
}

const vis = (page, sel) => page.locator(`${sel}:visible`)

async function checkState(page, url, state, row, isSeed, admin) {
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  // A fresh script first shows the practice-viewer wait screen; a creator
  // clicks "Show me the draft now" to see it. Do the same before checking.
  const draftNow = page.getByRole('button', { name: /show me the draft now/i })
  if (await draftNow.waitFor({ timeout: 15_000 }).then(() => true, () => false)) await draftNow.click()
  if (state === 'unchecked') {
    const banner = vis(page, '[data-testid="gate-unchecked"]').first()
    await banner.waitFor({ timeout: 45_000 }).catch(() => {})
    check('unchecked: "still checking" banner shown', await banner.isVisible())
    check('unchecked: record locked', await vis(page, '[data-testid="record-locked"]').count() > 0 && await page.locator('a[href^="/record/"]:visible').count() === 0)
    // Refresh: the card re-reads the row every 10s. A seeded row is flipped to
    // checked and the banner must go; a real row is watched for the re-read.
    if (isSeed) {
      const bp = { ...row.blueprint, check_status: 'checked', invention_gate: { ...(row.blueprint.invention_gate ?? {}), outcome: 'final' }, gate_questions: [] }
      await admin.from('generations').update({ blueprint: bp }).eq('id', row.id)
      const gone = await banner.waitFor({ state: 'hidden', timeout: 35_000 }).then(() => true, () => false)
      check('unchecked: refreshes on its own and clears when checked', gone)
    } else {
      let reads = 0
      page.on('request', (r) => { if (r.url().includes('/rest/v1/generations')) reads++ })
      await page.waitForTimeout(25_000)
      check('unchecked: re-reads the script while checking', reads > 0)
    }
    return
  }

  const cardSel = state === 'needs_answers' ? '[data-testid="gate-needs-answers"]' : '[data-testid="gate-general"]'
  const card = vis(page, cardSel).first()
  await card.waitFor({ timeout: 45_000 }).catch(() => {})
  if (!await card.isVisible()) {
    check(`${state}: answer card shown`, false, 'not rendered; is VITE_TRIAL_USER_ID the test account?')
    return
  }
  check(`${state}: answer card shown`, true)
  if (state === 'general') check('general: "general version" banner shown', /general version/i.test(await card.innerText()))

  const qs = card.locator('[data-testid="gate-question"]')
  const n = await qs.count()
  check(`${state}: questions render`, n > 0 && n <= 3)
  let skips = 0
  for (let i = 0; i < n; i++) skips += await qs.nth(i).getByRole('button', { name: /^Skip this one/ }).count()
  check(`${state}: every question has Skip`, n > 0 && skips === n)
  check(`${state}: "Write the general version" button`, await card.getByRole('button', { name: 'Write the general version' }).count() === 1)

  if (state === 'needs_answers') {
    check('needs_answers: record locked', await vis(page, '[data-testid="record-locked"]').count() > 0 && await page.locator('a[href^="/record/"]:visible').count() === 0)
    const tp = vis(page, '[data-testid="focus-mode-open"]')
    check('needs_answers: teleprompter locked', await tp.count() === 0 || await tp.first().isDisabled())
    const hasPh = /\[Your answer:[^\]]*\]/.test(scriptText(row.blueprint))
    if (hasPh) {
      check('needs_answers: placeholders shown as gaps', await vis(page, '[data-testid="script-gap"]').count() > 0)
      check('needs_answers: no raw placeholder text on screen', !(await page.locator('body').innerText()).includes('[Your answer:'))
    } else {
      check('needs_answers: script shown in gap view', await vis(page, '[data-testid="script-with-gaps"]').count() > 0)
    }
  }

  const submit = card.getByRole('button', { name: /Send answers and rewrite/ })
  check(`${state}: submit disabled before any answer`, await submit.isDisabled())
  // Skip the first, answer the rest — submit must enable. It is NOT clicked.
  await qs.nth(0).getByRole('button', { name: /^Skip this one/ }).click()
  check(`${state}: skipped input is disabled`, await qs.nth(0).locator('input').isDisabled())
  for (let i = 1; i < n; i++) await qs.nth(i).locator('input').fill('A made-up answer about the blue lantern')
  if (n === 1) {
    check(`${state}: skip alone settles the only question`, await submit.isEnabled())
    await qs.nth(0).getByRole('button', { name: /^Answer this one/ }).click()
    await qs.nth(0).locator('input').fill('A made-up answer about the blue lantern')
  }
  check(`${state}: skip one + answer one enables submit`, await submit.isEnabled())
}

// ── ONE REAL REQUEST ──────────────────────────────────────────────────────

const TOKEN = 'Quillmarsh'

async function runReal(session, admin) {
  const { data: rows } = await admin.from('generations')
    .select('id, reference_url, reference_note, fidelity, transcript_id, blueprint')
    .eq('user_id', session.user.id).order('created_at', { ascending: false }).limit(60)
  const src = (rows ?? []).find((r) => statusOf(r.blueprint) === 'needs_answers' && questionsOf(r.blueprint).length > 0)
  if (!src) { check('real: an existing needs_answers generation to answer', false, 'none on the test account; nothing spent'); return }
  check('real: an existing needs_answers generation to answer', true)

  const qs = questionsOf(src.blueprint)
  const answered = qs[0].writes_to
  const skipped = qs.slice(1).map((q) => q.writes_to)
  const answers = { [answered]: `The ${TOKEN} market on a rainy Tuesday was where it clicked for me.` }
  for (const k of skipped) answers[k] = 'Nothing specific, keep it general' // SKIP_ANSWER, as the screen sends it

  // Exactly the body `submitGateAnswers` in Result.tsx sends.
  const body = {
    reference_url: src.reference_url ?? '', reference_note: src.reference_note ?? '', fidelity: src.fidelity,
    ...(src.transcript_id ? { transcript_id: src.transcript_id } : {}),
    readiness_answers: answers,
  }
  const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-blueprint`, {
    method: 'POST',
    headers: { apikey: ANON, authorization: `Bearer ${session.access_token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10 * 60_000),
  })
  let out = null
  try { out = await res.json() } catch { /* below */ }
  if (!res.ok || !out?.id) { check('real: rewrite returned a script', false, `status ${res.status}${out?.code ? ` ${out.code}` : ''}`); return }
  check('real: rewrite returned a script', true)

  const { data: next } = await admin.from('generations').select('blueprint').eq('id', out.id).maybeSingle()
  const bp = next?.blueprint ?? out.blueprint
  const inScript = new RegExp(TOKEN, 'i').test(scriptText(bp))
  const sentences = Array.isArray(bp?.invention_gate?.sentences) ? bp.invention_gate.sentences : []
  const inLedger = sentences.some((s) => Array.isArray(s?.item_ids) && s.item_ids.includes(`answer:${answered}`))
  check('real: rewritten script uses the answer', inScript || inLedger, `token in script: ${inScript}, ledger cites answer: ${inLedger}`)
  const reasked = questionsOf(bp).filter((q) => skipped.includes(q.writes_to) || q.writes_to === answered).length
  check('real: answered/skipped questions not asked again', reasked === 0)
  console.log(`::notice title=real::outcome ${statusOf(bp)}`)
}

// ── MAIN ───────────────────────────────────────────────────────────────────

const session = await signIn()
const admin = createClient(SUPABASE_URL, needEnv('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })
if (RUN_UI) await runUi(session, admin)
if (RUN_REAL) await runReal(session, admin)
if (!RUN_UI && !RUN_REAL) throw new Error('pass --ui and/or --real')
console.log(failures ? `::error::${failures} check(s) failed` : '::notice::all checks passed')
process.exit(failures ? 1 : 0)
