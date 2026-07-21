// CI guard (R5-7 / hardened R6-5): while the production editor is DISABLED (no
// Director / EditPlan / renderer / output / production start), public product
// copy must not claim shipped editor OUTCOMES in the present tense. Current
// capabilities (script, hooks, shot list, teleprompter, recording, upload) may
// be stated; editor RESULTS must read "coming soon / being rebuilt".
//
// R6-5 hardening — the old guard only matched exact phrases on raw source, so an
// equivalent claim split across JSX elements, or a checkmarked "done" list, slid
// through. This version:
//   1. NORMALIZES JSX (strips tags/entities, collapses whitespace) before phrase
//      matching, so a claim split across <span>s is caught the same as inline.
//   2. Adds adversarial PARAPHRASE patterns for the editor-output claims.
//   3. Adds a STRUCTURAL completion-marker check: a ✓/Check/"done"/"complete"
//      marker rendered next to an editor-output list (jump cuts, B-roll, pacing,
//      captions) WITHOUT a "coming soon / being rebuilt" qualifier fails —
//      catching the "captions ✓ jump cuts ✓ b-roll ✓" affordance.
// (B-roll as SHOT-LIST guidance for what to record is fine; only editor-OUTPUT
// claims are forbidden.)
//
//   node scripts/ci/check_product_truth.mjs            # PR guard
//   node scripts/ci/check_product_truth.mjs --selftest # unit-test the logic
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const ROOT = 'apps/web/src'

// Present-tense editor-OUTPUT claims (matched against JSX-NORMALIZED text).
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
  // R6-5 adversarial paraphrases of "scripting + editing, gone":
  { re: /\bediting\b[\s,;:.–—-]{1,4}\bgone\b/i, why: '"editing … gone" — editing claimed as a shipped, eliminated step' },
  { re: /scripting\s*\+\s*editing[\s,;:.–—-]{0,4}\b(gone|done|handled|automated|finished)\b/i, why: '"scripting + editing, gone/done" — editing claimed as shipped' },
  { re: /\bediting\b[^.\n]{0,15}\b(is\s+)?(gone|handled for you|fully automated|done for you)\b/i, why: 'editing claimed as a shipped/eliminated outcome' },
  // R7-3 rendered user-story claims (audit the whole sentence, not a phrase):
  { re: /\beditor\b[^.\n]{0,80}\ball\s+done\b/i, why: '"editor … all done" — the editor is listed among jobs claimed as shipped/done' },
  { re: /all\s+done\s+from\s+a\s+single\s+paste/i, why: '"all done from a single paste" — full pipeline (incl. editor) claimed as shipped' },
  { re: /\bedit it\b[\s,]*\bpost it\b/i, why: '"edit it, post it" — present-tense editing claimed as shipped' },
]

// Structural completion-marker check (runs on RAW source, not normalized).
const MARKER = /<Check\b|[✓✔]|\bdone\b|\bcomplete\b/ig
const STRONG = [/\bjump[\s-]?cuts?\b/i, /\bb-?roll\b/i, /\bdead air\b/i, /\bbeat-timed\b/i, /\bpacing\b/i]
const QUALIFIER = /coming soon|being rebuilt|rebuilt|\bsoon\b|waitlist|not yet|\bcoming\b|disabled|in progress/i

function normalizeJsx(s) {
  return s
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ') // {/* jsx comments */}
    .replace(/<[^>]*>/g, ' ')              // strip JSX/HTML tags → joins split copy
    .replace(/&[a-z]+;/gi, ' ')            // decode entities to space
    .replace(/\s+/g, ' ')                  // collapse whitespace
}

function markerHits(path, raw) {
  const reasons = []
  let m
  MARKER.lastIndex = 0
  while ((m = MARKER.exec(raw))) {
    const win = raw.slice(Math.max(0, m.index - 240), Math.min(raw.length, m.index + 240))
    const text = normalizeJsx(win)
    const strong = STRONG.filter((r) => r.test(text)).length
    const hasCaptions = /\bcaptions?\b/i.test(text)
    const nearEditorList = strong >= 2 || (strong >= 1 && hasCaptions)
    if (nearEditorList && !QUALIFIER.test(win)) {
      reasons.push(`${path}: completion marker ("${m[0]}") rendered next to an editor-output list with no coming-soon qualifier`)
    }
  }
  return reasons
}

export function evaluate(files) {
  const reasons = []
  for (const [path, content] of Object.entries(files)) {
    const norm = normalizeJsx(content)
    for (const { re, why } of FORBIDDEN) {
      if (re.test(norm)) reasons.push(`${path}: ${why} (/${re.source}/)`)
    }
    reasons.push(...markerHits(path, content))
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
    // R6-5 adversarial paraphrases:
    ['"scripting + editing, gone" fails', { 'a.tsx': "sub: 'scripting + editing, gone'" }, false],
    ['"editing, gone" fails', { 'a.tsx': 'Your editing, gone.' }, false],
    ['scripting + recording, editing coming soon passes', { 'a.tsx': "sub: 'scripting + recording — AI editing coming soon'" }, true],
    // R6-5 JSX-split (claim spread across tags) must be caught after normalize:
    ['JSX-split "editing, gone" fails', { 'a.tsx': 'scripting + editing,</span><span> gone' }, false],
    ['JSX-split captions/b-roll/pacing done fails', { 'a.tsx': 'Captions,</b> B-roll, <i>pacing</i> — done' }, false],
    // R6-5 completion-marker structural check:
    ['checkmarked editor-output list fails', { 'a.tsx': "['Captions','Jump cuts','B-roll'].map(t => <span><Check/>{t}</span>)" }, false],
    ['checkmarked list WITH coming-soon qualifier passes', { 'a.tsx': "AI edit — coming soon ['Captions','Jump cuts','B-roll'].map(t => <span><Clock/>{t}</span>)" }, true],
    ['unicode ✓ near jump cuts + b-roll fails', { 'a.tsx': '✓ Jump cuts ✓ B-roll' }, false],
    // R7-3 exact rendered user-story examples must fail:
    ['"strategist … editor … all done from a single paste" fails', { 'a.tsx': "Five jobs you'd normally hire a team for — strategist, writer, producer, editor, copywriter — all done from a single paste, in minutes." }, false],
    ['"Paste it, edit it, post it" fails', { 'a.tsx': "Paste it, edit it, post it — tonight, from one app." }, false],
    ['corrected four-jobs copy (editor coming soon) passes', { 'a.tsx': "Four jobs you'd normally hire a team for — strategist, writer, producer, copywriter — handled from a single paste, in minutes. The AI editor is being rebuilt — coming soon." }, true],
    ['corrected paste/script/record copy passes', { 'a.tsx': "Paste it, script it, record it — tonight, from one app. AI editing is coming soon." }, true],
    // marker near a single non-editor status is fine (clipboard/post status):
    ['Check near "caption copied · ready to post" passes', { 'a.tsx': '<Check/> Caption copied · ready to post; Add to your niche gallery; Log what you ship' }, true],
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
