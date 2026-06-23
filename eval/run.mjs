#!/usr/bin/env node
// Blueprint-quality eval — gates prompt changes.
//
// Runs each golden-set reference through the live generate-blueprint edge function
// and scores the returned blueprint's STRUCTURE + basic quality against a rubric.
// A change that drops below the threshold (default 0.8) exits non-zero, so it can
// gate a deploy in CI or a pre-push hook.
//
// Usage:
//   SUPABASE_URL=https://<ref>.supabase.co \
//   SUPABASE_ANON_KEY=<anon> \
//   TEST_JWT=<a test user's access token, with credits> \
//   node eval/run.mjs
//
// The JWT is a real signed-in test user (the function spends a credit per run), so
// keep a dedicated eval account topped up. Node 18+ (global fetch).

import { readFile } from 'node:fs/promises'

const { SUPABASE_URL, SUPABASE_ANON_KEY, TEST_JWT } = process.env
if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !TEST_JWT) {
  console.error('Set SUPABASE_URL, SUPABASE_ANON_KEY and TEST_JWT. See header.')
  process.exit(2)
}

const set = JSON.parse(await readFile(new URL('./golden-set.json', import.meta.url), 'utf8'))
const threshold = set.threshold ?? 0.8

// Structural + quality rubric. Each check is 0..1; the case score is their mean.
function scoreBlueprint(b) {
  if (!b) return { score: 0, checks: { exists: 0 } }
  const hooks = b.hook_options ?? []
  const script = String(b.script ?? b.full_script ?? '')
  const shots = b.shot_list ?? b.shots ?? []
  const publish = b.publish_plan ?? []
  const rr = b.reference_read ?? {}
  const checks = {
    hooks_3plus: hooks.length >= 3 ? 1 : hooks.length / 3,
    script_len: script.length >= 200 ? 1 : script.length / 200,
    shot_list: Array.isArray(shots) && shots.length >= 2 ? 1 : 0,
    caption_pack: Array.isArray(publish) && publish.length >= 1 ? 1 : 0,
    reference_read: rr && (rr.format_label || rr.retention_map) ? 1 : 0,
  }
  const score = Object.values(checks).reduce((a, c) => a + c, 0) / Object.keys(checks).length
  return { score, checks }
}

async function gen(url) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-blueprint`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TEST_JWT}`, apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`)
  const data = await res.json()
  return data.blueprint ?? data.generation?.blueprint ?? data
}

let total = 0
let passed = 0
for (const c of set.cases) {
  total++
  try {
    const b = await gen(c.url)
    const { score, checks } = scoreBlueprint(b)
    const ok = score >= threshold
    if (ok) passed++
    console.log(`${ok ? 'PASS' : 'FAIL'} ${score.toFixed(2)}  ${c.niche.padEnd(10)} ${c.note}`)
    if (!ok) console.log(`      checks: ${JSON.stringify(checks)}`)
  } catch (e) {
    console.log(`ERR        ${c.niche.padEnd(10)} ${c.note} — ${e.message}`)
  }
}

const rate = total ? passed / total : 0
console.log(`\n${passed}/${total} passed (${(rate * 100).toFixed(0)}%) · threshold ${(threshold * 100).toFixed(0)}%`)
process.exit(rate >= threshold ? 0 : 1)
