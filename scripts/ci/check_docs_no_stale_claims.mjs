// CI guard (RC2): the CURRENT / canonical docs an engineer follows must never
// re-acquire stale legacy claims. It scans the live-guidance doc set for the
// specific removed-tech claims and fails if any returns:
//   • Fly / Railway / Render as a worker host (`fly launch|deploy|secrets`,
//     `fly.io`, `railway`, `render.yaml`, `Fly/Railway/Render`)
//   • the Revideo renderer
//   • the retired `autoedit` job type, or a top-level `transcribe` job
//   • the old three-type registry `{ingest, build_voice, scrape_dna}`
//
// HISTORICAL / removal / evidence docs (BUILD_PLAN.md, the removal + remnant
// inventories, the rebuild-status snapshot, SESSION_NOTES, the sign-off
// evidence, and DEPLOY.md — which documents the removals + scrub) are NOT
// scanned: they legitimately describe what was removed. They carry an explicit
// HISTORICAL banner instead.
//
//   node scripts/ci/check_docs_no_stale_claims.mjs            # PR guard
//   node scripts/ci/check_docs_no_stale_claims.mjs --selftest # unit-test the logic
import { readFileSync } from 'node:fs'

// The canonical, current-guidance docs. Kept deliberately small and precise.
const CANONICAL = ['ARCHITECTURE.md', 'README.md', 'ROADMAP.md', 'worker/README.md', 'worker/SCALING.md']

const FORBIDDEN = [
  { re: /\brevideo\b/i, why: 'Revideo renderer (removed with the old editor)' },
  { re: /\bfly\.io\b/i, why: 'Fly.io as a worker host (VPS+Docker is the only path)' },
  { re: /\bfly (launch|deploy|secrets)\b/i, why: 'Fly CLI deploy instruction' },
  { re: /fly\s*\/\s*railway/i, why: 'Fly/Railway worker-host listing' },
  { re: /railway\s*\/\s*render/i, why: 'Railway/Render worker-host listing' },
  { re: /\brender\.ya?ml\b/i, why: 'render.yaml worker deploy manifest' },
  { re: /\bautoedit\b/i, why: 'retired `autoedit` job type' },
  { re: /ingest\s*\/\s*transcribe/i, why: '`transcribe` listed as a live job type' },
  { re: /['"]transcribe['"]/, why: 'top-level `transcribe` job as current' },
  { re: /\{\s*ingest,\s*build_voice,\s*scrape_dna\s*\}/, why: 'old three-type registry (missing validate_source/editor_v2)' },
]

// PURE decision over a { path: content } map. Returns { ok, reasons }.
export function evaluate(files) {
  const reasons = []
  for (const [path, content] of Object.entries(files)) {
    for (const { re, why } of FORBIDDEN) {
      if (re.test(content)) reasons.push(`${path}: stale claim — ${why} (/${re.source}/)`)
    }
  }
  return { ok: reasons.length === 0, reasons }
}

function selftest() {
  const clean = 'The worker deploys only to the VPS + Docker. Registry: ingest, build_voice, scrape_dna, validate_source, editor_v2.'
  const cases = [
    ['clean canonical doc passes', { 'a.md': clean }, true],
    ['revideo returns', { 'a.md': 'premium Revideo renderer burns captions' }, false],
    ['fly.io host returns', { 'a.md': 'Worker host (Fly.io/Railway/Render)' }, false],
    ['fly deploy instruction returns', { 'a.md': 'run `fly deploy` to ship the worker' }, false],
    ['render.yaml returns', { 'a.md': 'add a render.yaml for the worker' }, false],
    ['autoedit returns', { 'a.md': 'the autoedit job renders the edit' }, false],
    ['ingest/transcribe returns', { 'a.md': 'handlers: ingest/transcribe/build_voice' }, false],
    ["'transcribe' job returns", { 'a.md': "enqueue a 'transcribe' job" }, false],
    ['three-type registry returns', { 'a.md': 'registry is {ingest, build_voice, scrape_dna}' }, false],
    ['mentions removal in prose (allowed clean form)', { 'a.md': 'the old auto-edit job type and premium renderer were removed' }, true],
  ]
  let failed = 0
  for (const [name, files, exp] of cases) {
    const got = evaluate(files).ok
    if (got !== exp) { console.error(`SELFTEST FAIL: ${name} => ${got}, expected ${exp}`); failed++ }
    else console.log(`  ok: ${name}`)
  }
  if (failed) { console.error(`docs-no-stale-claims selftest: ${failed} failed`); process.exit(1) }
  console.log('docs-no-stale-claims selftest: all cases passed'); process.exit(0)
}

if (process.argv.includes('--selftest')) selftest()
else {
  const files = {}
  for (const p of CANONICAL) { try { files[p] = readFileSync(p, 'utf8') } catch { /* absent file: skip */ } }
  const { ok, reasons } = evaluate(files)
  console.log(`docs-no-stale-claims guard: ${ok ? 'OK' : 'FAIL'} (scanned ${Object.keys(files).length} canonical docs)`)
  if (!ok) { for (const r of reasons) console.error(`::error::${r}`); process.exit(1) }
}
