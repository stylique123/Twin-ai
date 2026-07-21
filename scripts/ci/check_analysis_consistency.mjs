// CI guard (Phase 6): analysis-layer consistency as decidable facts.
//
//   1. NAMING: editor analysis code uses `face*` evidence naming — never
//      `subject*`, and never the decision-shaped fields the design forbade
//      (safeZoomWindows / cleanupRecommendations).
//   2. NO VERSION FALLBACK: the strict component loader must filter on the
//      exact bundle version AND legacy rows; the removed any-version fallback
//      pattern (`?? rows.find(...)`) must never return to editorSpeech.
//   3. SINGLE NUMERIC AUTHORITY: the TS analyzers load the frozen rules
//      document; the Python bridge takes `--rules` (no private copies).
//   4. MIGRATION 0086 keeps both partial-predicate ON CONFLICT targets and the
//      dedupe-key event accounting.
//
//   node scripts/ci/check_analysis_consistency.mjs            # PR guard
//   node scripts/ci/check_analysis_consistency.mjs --selftest
import { readFileSync } from 'node:fs'

const ANALYSIS_FILES = [
  'worker/src/jobs/editorAnalyze.ts', 'worker/src/jobs/editorVisual.ts',
  'worker/src/jobs/editorAudio.ts', 'worker/src/jobs/editorHook.ts',
  'worker/src/jobs/editorManifest.ts', 'worker/src/jobs/sourceSession.ts',
  'packages/shared/src/editor/contracts.ts', 'worker/editor_visual.py',
]
const SPEECH_FILE = 'worker/src/jobs/editorSpeech.ts'
const MIGRATION = 'supabase/migrations/0086_analysis_digest_and_manifest_pin.sql'

export function evaluate(files) {
  const reasons = []
  for (const p of [...ANALYSIS_FILES, SPEECH_FILE, MIGRATION]) {
    if (files[p] == null || files[p].trim() === '') {
      reasons.push(`${p}: REQUIRED file missing/empty (fail-closed)`)
    }
  }
  for (const p of ANALYSIS_FILES) {
    const c = files[p]
    if (c == null) continue
    if (/\bsubject[A-Z_]/.test(c)) reasons.push(`${p}: forbidden 'subject*' naming (evidence uses face*)`)
    if (/safeZoomWindows|cleanupRecommendations/.test(c)) {
      reasons.push(`${p}: forbidden decision-shaped field (safeZoomWindows/cleanupRecommendations)`)
    }
  }
  const speech = files[SPEECH_FILE]
  if (speech != null) {
    if (/\?\?\s*\(?rows\s*\??\s*\.\s*find/.test(speech) || /\?\?\s*rows\.find/.test(speech)) {
      reasons.push(`${SPEECH_FILE}: the any-version component fallback returned (strict versions only)`)
    }
    if (!/loadComponentStrict/.test(speech)
        || !/\.eq\('analyzer_bundle_version', bundleVersion\)/.test(speech)
        || !/\.is\('component_digest', null\)/.test(speech)) {
      reasons.push(`${SPEECH_FILE}: strict component loader lost its exact-version/legacy-row filters`)
    }
  }
  for (const p of ['worker/src/jobs/editorVisual.ts', 'worker/src/jobs/editorAudio.ts', 'worker/src/jobs/editorHook.ts']) {
    const c = files[p]
    if (c != null && !/editorManifest\.js'/.test(c)) {
      reasons.push(`${p}: no longer sources constants from editorManifest (single numeric authority)`)
    }
  }
  const py = files['worker/editor_visual.py']
  if (py != null && !/--rules/.test(py)) {
    reasons.push(`worker/editor_visual.py: no longer takes --rules (frozen rules document is the only numeric authority)`)
  }
  const sql = files[MIGRATION]
  if (sql != null) {
    if (!/on conflict \(source_asset_id, component, analyzer_bundle_version\)\s+where component_digest is null/.test(sql)) {
      reasons.push(`${MIGRATION}: legacy writer's ON CONFLICT lost its partial-index predicate`)
    }
    if (!/on conflict \(source_asset_id, component, component_digest\)\s+where component_digest is not null/.test(sql)) {
      reasons.push(`${MIGRATION}: digest writer's ON CONFLICT lost its partial-index predicate`)
    }
    if (!/'analysis:' \|\| p_component \|\| ':' \|\| p_component_digest/.test(sql)) {
      reasons.push(`${MIGRATION}: dedupe-key event accounting is gone`)
    }
  }
  return { ok: reasons.length === 0, reasons }
}

function selftest() {
  const good = () => {
    const f = {}
    for (const p of ANALYSIS_FILES) f[p] = "import { loadAnalysisRules } from './editorManifest.js'\nconst faceCoverage = 1"
    f['worker/editor_visual.py'] = 'ap.add_argument("--rules", required=True)'
    f['packages/shared/src/editor/contracts.ts'] = 'export interface VisualFaceDetection { x: number }'
    f[SPEECH_FILE] = [
      'export async function loadComponentStrict(',
      "  .eq('analyzer_bundle_version', bundleVersion)",
      "  .is('component_digest', null)",
    ].join('\n')
    f[MIGRATION] = [
      'on conflict (source_asset_id, component, analyzer_bundle_version)',
      '  where component_digest is null',
      'on conflict (source_asset_id, component, component_digest)',
      '  where component_digest is not null',
      "'analysis:' || p_component || ':' || p_component_digest",
    ].join('\n')
    return f
  }
  const cases = [
    ['healthy state passes', good(), true],
    ['subject* naming fails', (() => { const f = good(); f['worker/src/jobs/editorVisual.ts'] += '\nconst subjectBox = 1' ; return f })(), false],
    ['safeZoomWindows fails', (() => { const f = good(); f['packages/shared/src/editor/contracts.ts'] += '\nsafeZoomWindows: []' ; return f })(), false],
    ['any-version fallback returns fails', (() => { const f = good(); f[SPEECH_FILE] += "\nconst match = a ?? rows.find((r) => r.source_hash === h)"; return f })(), false],
    ['strict loader losing version filter fails', (() => { const f = good(); f[SPEECH_FILE] = 'export async function loadComponentStrict('; return f })(), false],
    ['legacy ON CONFLICT losing predicate fails', (() => { const f = good(); f[MIGRATION] = f[MIGRATION].replace('  where component_digest is null\n', ''); return f })(), false],
    ['missing migration fails closed', (() => { const f = good(); f[MIGRATION] = null; return f })(), false],
    ['python losing --rules fails', (() => { const f = good(); f['worker/editor_visual.py'] = 'no rules arg'; return f })(), false],
  ]
  let failed = 0
  for (const [name, input, exp] of cases) {
    const got = evaluate(input).ok
    if (got !== exp) { console.error(`SELFTEST FAIL: ${name} => ${got}, expected ${exp}`); failed++ }
    else console.log(`  ok: ${name}`)
  }
  if (failed) { console.error(`analysis-consistency selftest: ${failed} failed`); process.exit(1) }
  console.log('analysis-consistency selftest: all cases passed'); process.exit(0)
}

if (process.argv.includes('--selftest')) selftest()
else {
  const files = {}
  for (const p of [...ANALYSIS_FILES, SPEECH_FILE, MIGRATION]) {
    try { files[p] = readFileSync(p, 'utf8') } catch { files[p] = null }
  }
  const { ok, reasons } = evaluate(files)
  console.log(`analysis-consistency guard: ${ok ? 'OK' : 'FAIL'} (files: ${Object.keys(files).length})`)
  if (!ok) { for (const r of reasons) console.error(`::error::${r}`); process.exit(1) }
}
