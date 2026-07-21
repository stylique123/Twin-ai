// CI guard (R5-7): while the production editor is DISABLED (no Director /
// EditPlan / renderer / output / production start), public product copy must not
// claim shipped editor OUTCOMES in the present tense. Current capabilities
// (script, hooks, shot list, teleprompter, recording, upload) may be stated;
// editor results must read "coming soon / being rebuilt". This guard scans the
// user-facing web app for the specific present-tense editor-output claims and
// FAILS if any is present. (B-roll as SHOT-LIST guidance for what to record is
// fine; only editor-OUTPUT claims are forbidden.)
//
//   node scripts/ci/check_product_truth.mjs            # PR guard
//   node scripts/ci/check_product_truth.mjs --selftest # unit-test the logic
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const ROOT = 'apps/web/src'

// Specific present-tense editor-OUTPUT claims (unambiguous "it's shipped").
const FORBIDDEN = [
  { re: /edits it for you/i, why: '"edits it for you" — editor output claimed as shipped' },
  { re: /fully edits it\b/i, why: '"fully edits it" — editor output claimed as shipped' },
  { re: /fully edit\b[^.\n]{0,40}\b(render|post)\b/i, why: '"fully edit → render/post" flow claimed as shipped' },
  { re: /dead air gone/i, why: '"dead air gone" — editor result claimed as shipped' },
  { re: /beat-timed cuts/i, why: '"beat-timed cuts" — editor result claimed as shipped' },
  { re: /exported ready to post/i, why: '"exported ready to post" — editor export claimed as shipped' },
  { re: /\bedit\s*\+\s*render\b/i, why: '"edit + render" shipped step' },
  { re: /captions[,\s]+b-?roll[,\s]+pacing\s*[—–-]\s*done/i, why: '"captions, B-roll, pacing — done" — editor output claimed as shipped' },
  { re: /\bb-?roll\b(?![^.\n]*\b(coming soon|being rebuilt|shot|record|film|capture)\b)[^.\n]*\bdone\b/i, why: 'B-roll claimed as a shipped/done editor output' },
]

export function evaluate(files) {
  const reasons = []
  for (const [path, content] of Object.entries(files)) {
    for (const { re, why } of FORBIDDEN) {
      if (re.test(content)) reasons.push(`${path}: ${why} (/${re.source}/)`)
    }
  }
  return { ok: reasons.length === 0, reasons }
}

function selftest() {
  const cases = [
    ['clean coming-soon copy passes', { 'a.tsx': 'One-click AI editing is being rebuilt — coming soon.' }, true],
    ['shot-list b-roll guidance passes', { 'a.tsx': "s.b_roll_type; 'Show this B-roll while talking' — film it" }, true],
    ['edits it for you fails', { 'a.tsx': 'TwinAI edits it for you.' }, false],
    ['fully edits it fails', { 'a.tsx': 'rebuilds it and fully edits it and posts' }, false],
    ['fully edit → render → post fails', { 'a.tsx': 'paste → record → fully edit → render → post' }, false],
    ['dead air gone fails', { 'a.tsx': 'Dead air gone, beat-timed cuts.' }, false],
    ['exported ready to post fails', { 'a.tsx': 'exported ready to post' }, false],
    ['edit + render fails', { 'a.tsx': 'Edit + render' }, false],
    ['captions, B-roll, pacing — done fails', { 'a.tsx': 'Captions, B-roll, pacing — done.' }, false],
  ]
  let failed = 0
  for (const [name, files, exp] of cases) {
    const got = evaluate(files).ok
    if (got !== exp) { console.error(`SELFTEST FAIL: ${name} => ${got}, expected ${exp}`); failed++ }
    else console.log(`  ok: ${name}`)
  }
  if (failed) { console.error(`product-truth selftest: ${failed} failed`); process.exit(1) }
  console.log('product-truth selftest: all cases passed'); process.exit(0)
}

function walk(dir, out = {}) {
  for (const e of readdirSync(dir)) {
    const p = `${dir}/${e}`
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (/\.(tsx?|jsx?)$/.test(e)) out[p] = readFileSync(p, 'utf8')
  }
  return out
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  if (process.argv.includes('--selftest')) selftest()
  else {
    let files = {}
    try { files = walk(ROOT) } catch (e) { console.error(`::error::cannot scan ${ROOT}: ${e.message}`); process.exit(1) }
    const { ok, reasons } = evaluate(files)
    console.log(`product-truth guard: ${ok ? 'OK' : 'FAIL'} (scanned ${Object.keys(files).length} files under ${ROOT})`)
    if (!ok) { for (const r of reasons) console.error(`::error::${r}`); process.exit(1) }
  }
}
