// CI guard (RC2 + R5): the CURRENT / canonical docs an engineer follows must
// never re-acquire stale legacy claims. Scans the live-guidance doc set for the
// specific removed-tech / retired-job / wrong-architecture claims and fails if
// any returns:
//   • Fly / Railway / Render as a worker host
//   • the Revideo renderer
//   • the retired `autoedit` job type
//   • a top-level `transcribe` job in ANY form: `ingest/transcribe`,
//     `transcribe/ingest`, `transcribe or ingest`, quoted `'transcribe'`,
//     `transcribe job`, or a semantic "ingest-reference enqueues … transcribe"
//   • the old three-type registry `{ingest, build_voice, scrape_dna}`
//   • the legacy "one Scene Timeline drives the editor cuts/captions/B-roll"
//     model (Editor v2 uses one canonical EditPlan, not the timeline)
//
// FAIL-CLOSED: every canonical file is REQUIRED — a missing/unreadable/empty
// canonical doc fails the guard (it cannot silently skip). HISTORICAL / removal
// / evidence docs (BUILD_PLAN.md, the inventories, rebuild-status, SESSION_NOTES,
// the sign-off evidence, DEPLOY.md, and PRODUCT_VISION.md — which carries an
// explicit historical banner) are intentionally NOT canonical here.
//
//   node scripts/ci/check_docs_no_stale_claims.mjs            # PR guard
//   node scripts/ci/check_docs_no_stale_claims.mjs --selftest # unit-test the logic
import { readFileSync } from 'node:fs'

// Required current-guidance docs. A missing one is a FAILURE, not a skip.
const CANONICAL = ['ARCHITECTURE.md', 'README.md', 'ROADMAP.md', 'worker/README.md', 'worker/SCALING.md']

const FORBIDDEN = [
  { re: /\brevideo\b/i, why: 'Revideo renderer (removed with the old editor)' },
  { re: /\bfly\.io\b/i, why: 'Fly.io as a worker host (VPS+Docker is the only path)' },
  { re: /\bfly (launch|deploy|secrets)\b/i, why: 'Fly CLI deploy instruction' },
  { re: /fly\s*\/\s*railway/i, why: 'Fly/Railway worker-host listing' },
  { re: /railway\s*\/\s*render/i, why: 'Railway/Render worker-host listing' },
  { re: /\brender\.ya?ml\b/i, why: 'render.yaml worker deploy manifest' },
  { re: /\bautoedit\b/i, why: 'retired `autoedit` job type' },
  // top-level `transcribe` job — every ordering / separator / form:
  { re: /\b(ingest|transcribe)\s*\/\s*(transcribe|ingest)\b/i, why: '`transcribe` job listed with ingest (either slash ordering)' },
  { re: /\b(ingest|transcribe)\s+(?:or|and)\s+(transcribe|ingest)\b/i, why: '`transcribe` job listed with ingest (or/and)' },
  { re: /\benqueues?\s+(?:[a-z-]+\s+){0,3}[`'"]?transcribe\b/i, why: 'a `transcribe` job described as enqueued (transcribe was retired; only ingest is enqueued)' },
  { re: /['"]transcribe['"]/, why: 'top-level `transcribe` job as current' },
  { re: /\btranscribe job\b/i, why: 'top-level `transcribe` job as current' },
  { re: /\{\s*ingest,\s*build_voice,\s*scrape_dna\s*\}/, why: 'old three-type registry (missing validate_source/editor_v2)' },
  // legacy editor architecture (Editor v2 uses one canonical EditPlan):
  { re: /scene timeline[^.\n]*\b(drives?|drive)\b[^.\n]*\b(editor|cuts?|captions?|b-?roll)\b/i, why: 'legacy "Scene Timeline drives the editor" model (Editor v2 uses one canonical EditPlan)' },
]

// EVIDENCE CONSISTENCY (Phase-5 closure): once a doc records an item as CLOSED,
// it must not simultaneously carry the matching OPEN/pending claim. Each rule
// fires ONLY when BOTH the closed marker AND the open marker are present in the
// same file (a contradiction) — deliberately-open blockers (pre-beta recordings
// task #115, filler-removal #117/#194/#195) are untouched by these patterns.
// The listed files are REQUIRED: a missing one fails (the check cannot skip).
const EVIDENCE_FILES = ['docs/phase5-production-signoff-evidence.md', 'docs/editor-v2-phase5-speech-eval.md']
const CONTRADICTIONS = [
  {
    file: 'docs/phase5-production-signoff-evidence.md',
    closed: /# A1\/A2 CLOSED/,
    open: /OPEN \(operator-run|Remaining to fully close \(operator|Not "fully verified" until|operator-run-pending|is therefore \*\*not closed/,
    why: 'A1/A2 recorded CLOSED but an operator-pending/OPEN claim remains',
  },
  {
    file: 'docs/phase5-production-signoff-evidence.md',
    closed: /Authoritative VPS benchmark — CLOSED/,
    open: /benchmark[^\n]{0,80}\bPENDING\b/i,
    why: 'VPS benchmark recorded CLOSED but a benchmark-PENDING claim remains',
  },
  {
    file: 'docs/editor-v2-phase5-speech-eval.md',
    closed: /Task #116[^\n]{0,80}\bCLOSED\b/,
    open: /Task #116[^\n]{0,80}\bPENDING\b|until[^.\n]{0,80}benchmark \(#116\) is recorded/i,
    why: 'task #116 recorded CLOSED but a #116-pending claim remains',
  },
]

// PURE decision over a { path: content|null } map (null = missing/unreadable).
// Returns { ok, reasons }.
export function evaluate(files) {
  const reasons = []
  for (const path of CANONICAL) {
    const content = files[path]
    if (content == null || content.trim() === '') {
      reasons.push(`${path}: REQUIRED canonical doc is missing/unreadable/empty (fail-closed)`)
      continue
    }
    for (const { re, why } of FORBIDDEN) {
      if (re.test(content)) reasons.push(`${path}: stale claim — ${why} (/${re.source}/)`)
    }
  }
  for (const path of EVIDENCE_FILES) {
    if (!(path in files)) continue // caller may run canonical-only maps (selftest fixtures)
    const content = files[path]
    if (content == null || content.trim() === '') {
      reasons.push(`${path}: REQUIRED evidence doc is missing/unreadable/empty (consistency check cannot skip)`)
      continue
    }
    for (const c of CONTRADICTIONS) {
      if (c.file !== path) continue
      if (c.closed.test(content) && c.open.test(content)) {
        reasons.push(`${path}: CONTRADICTORY evidence — ${c.why} (closed=/${c.closed.source}/ open=/${c.open.source}/)`)
      }
    }
  }
  return { ok: reasons.length === 0, reasons }
}

function selftest() {
  const okFiles = () => Object.fromEntries(CANONICAL.map((p) => [p, 'VPS+Docker only. Registry: ingest, build_voice, scrape_dna, validate_source, editor_v2. ingest-reference enqueues `ingest` (transcribe was retired).']))
  const withClaim = (claim) => { const f = okFiles(); f['ARCHITECTURE.md'] += '\n' + claim; return f }
  const cases = [
    ['clean canonical set passes', okFiles(), true],
    ['missing required file fails', (() => { const f = okFiles(); f['README.md'] = null; return f })(), false],
    ['empty required file fails', (() => { const f = okFiles(); f['ROADMAP.md'] = '   '; return f })(), false],
    ['ingest/transcribe', withClaim('handlers: ingest/transcribe'), false],
    ['transcribe/ingest (reverse ordering)', withClaim('enqueues transcribe/ingest'), false],
    ['transcribe or ingest', withClaim('enqueues transcribe or ingest'), false],
    ['semantic enqueues a top-level transcribe job', withClaim('ingest-reference enqueues a top-level transcribe job'), false],
    ["quoted 'transcribe'", withClaim("a 'transcribe' job"), false],
    ['transcribe job phrase', withClaim('the transcribe job runs whisper'), false],
    ['revideo returns', withClaim('premium Revideo renderer'), false],
    ['fly.io host returns', withClaim('Worker host (Fly.io/Railway/Render)'), false],
    ['render.yaml returns', withClaim('add a render.yaml'), false],
    ['autoedit returns', withClaim('the autoedit job'), false],
    ['three-type registry returns', withClaim('registry is {ingest, build_voice, scrape_dna}'), false],
    ['legacy scene-timeline-drives-editor returns', withClaim('the Scene Timeline drives editor cuts and captions and B-roll'), false],
    ['clean removal prose allowed', withClaim('the old auto-edit job and premium renderer were removed; `transcribe` was retired'), true],
    // Evidence OPEN/CLOSED consistency (contradiction = fail; either alone = pass):
    ['evidence CLOSED + operator-OPEN contradiction fails', (() => { const f = okFiles(); f['docs/phase5-production-signoff-evidence.md'] = '# A1/A2 CLOSED\n## A2 — OPEN (operator-run; not complete)'; f['docs/editor-v2-phase5-speech-eval.md'] = 'Task #116 gate: CLOSED.'; return f })(), false],
    ['evidence CLOSED + "Remaining to fully close (operator" fails', (() => { const f = okFiles(); f['docs/phase5-production-signoff-evidence.md'] = '# A1/A2 CLOSED\n## Remaining to fully close (operator/reviewer)'; f['docs/editor-v2-phase5-speech-eval.md'] = 'Task #116 gate: CLOSED.'; return f })(), false],
    ['benchmark CLOSED + PENDING contradiction fails', (() => { const f = okFiles(); f['docs/phase5-production-signoff-evidence.md'] = '# A1/A2 CLOSED\nAuthoritative VPS benchmark — CLOSED\nbenchmark: PENDING'; f['docs/editor-v2-phase5-speech-eval.md'] = 'Task #116 gate: CLOSED.'; return f })(), false],
    ['speech-eval #116 CLOSED + PENDING contradiction fails', (() => { const f = okFiles(); f['docs/phase5-production-signoff-evidence.md'] = '# A1/A2 CLOSED\nAuthoritative VPS benchmark — CLOSED'; f['docs/editor-v2-phase5-speech-eval.md'] = 'Task #116 (gate): CLOSED.\nTask #116 (gate): PENDING.'; return f })(), false],
    ['evidence CLOSED only (no open claims) passes', (() => { const f = okFiles(); f['docs/phase5-production-signoff-evidence.md'] = '# A1/A2 CLOSED\nAuthoritative VPS benchmark — CLOSED\npre-beta task #115 remains MANDATORY; filler removal #194/#195 open.'; f['docs/editor-v2-phase5-speech-eval.md'] = 'Task #116 gate: CLOSED. Task #115 remains mandatory before beta.'; return f })(), true],
    ['evidence OPEN only (never closed) passes', (() => { const f = okFiles(); f['docs/phase5-production-signoff-evidence.md'] = '## A2 — OPEN (operator-run; not complete)'; f['docs/editor-v2-phase5-speech-eval.md'] = 'Task #116 gate: PENDING.'; return f })(), true],
    ['missing evidence doc fails (consistency cannot skip)', (() => { const f = okFiles(); f['docs/phase5-production-signoff-evidence.md'] = null; f['docs/editor-v2-phase5-speech-eval.md'] = 'Task #116 gate: CLOSED.'; return f })(), false],
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
  for (const p of [...CANONICAL, ...EVIDENCE_FILES]) {
    try { files[p] = readFileSync(p, 'utf8') } catch { files[p] = null } // null → REQUIRED-file failure
  }
  const { ok, reasons } = evaluate(files)
  console.log(`docs-no-stale-claims guard: ${ok ? 'OK' : 'FAIL'} (required canonical docs: ${CANONICAL.length}; evidence-consistency docs: ${EVIDENCE_FILES.length})`)
  if (!ok) { for (const r of reasons) console.error(`::error::${r}`); process.exit(1) }
}
