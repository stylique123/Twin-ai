#!/usr/bin/env node
// DERIVE REFERENCE CANDIDATES FROM A REAL CORPUS — and label what they are.
//
// ⚠️ THE CORRECTNESS PROBLEM THIS FILE EXISTS TO NOT PAPER OVER.
//
// The seven references in `creator-pack.json` have OBSERVED mechanisms: a human
// watched the video and wrote down how it works — "name the mistake (2nd
// person) -> why it fails -> concede the human reason -> one action". That is a
// claim about the video's structure, and it is true.
//
// A reference derived from a TITLE is a different object entirely. "I bought
// the most UNIQUE Samsung phone" tells you a promise was made. It does not tell
// you the beat order, where the re-hook lands, or what each beat owes the next
// — the whole content of a mechanism. Inferring one and storing it beside a
// real one would let the harness compare "reference" against "reference" while
// the two words mean different things, and every number after that is noise.
//
// This is the same rule as the evidence ladder one layer up: a title is a
// PROMISE, not a statement. So every reference produced here carries
// `mechanismSource: 'title_inferred'` and a `$limits` note, and the scorer is
// expected to hold the two families apart rather than pool them.
//
// ⚖️ WHAT IS HONESTLY DERIVABLE FROM A TITLE is the SHAPE OF THE PROMISE:
// whether a count is announced, whether it opens as a question, whether it
// leads with a purchase, whether it pits two things against each other. Those
// are decidable from the words, so they are what this reads — and nothing else
// is invented to fill the gaps.
//
//   node scripts/qa/derive-references.mjs [--min 3]
import { readFileSync, writeFileSync } from 'node:fs'

const CORPUS = 'scripts/qa/real/captions-2026-08-11.json'
const OUT = 'scripts/qa/real/derived-references.json'

const NUM = /\b(\d{1,2})\b/
const WORD_NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 }

/** Each shape is decidable from the title text alone. `mechanism` describes the
 *  PROMISE, never a beat order nobody observed. */
const SHAPES = [
  {
    id: 'ENUMERATED',
    test: (t) => /\b(top|best)\s+\d{1,2}\b|\b\d{1,2}\s+(things|products|items|tools|reasons|mistakes|ways)\b/i.test(t),
    mechanism: 'a COUNT is announced in the title and each item is delivered in turn',
    countFrom: (t) => {
      const m = t.match(/\b(top|best)\s+(\d{1,2})\b/i) ?? t.match(/\b(\d{1,2})\s+(things|products|items|tools|reasons|mistakes|ways)\b/i)
      const n = m ? Number(m[2] ?? m[1]) : null
      return Number.isFinite(n) ? n : null
    },
  },
  {
    id: 'QUESTION_TEST',
    test: (t) => /^(is|can|are|does|should|would|why|how)\b/i.test(t.trim()) || /\?/.test(t),
    mechanism: 'opens as a QUESTION about a specific thing and the video is the answer — the answer may be no',
  },
  {
    id: 'CONTRARIAN',
    test: (t) => /\bdoesn'?t want\b|\bstop (buying|doing)\b|\bdon'?t\b|\bnobody tells you\b|\bthe truth about\b|\bmistake/i.test(t),
    mechanism: 'asserts the common view is wrong, then supplies the correction',
  },
  {
    id: 'ACQUISITION',
    test: (t) => /^i (bought|got|tested|tried|drove|built)\b/i.test(t.trim()),
    mechanism: 'FIRST-PERSON acquisition or trial, then what was found by having it',
    // ⚠️ Only reachable by a creator with experience-level evidence. Anyone else
    // borrowing this shape is being invited to fabricate a personal history.
    needsExperience: true,
  },
  {
    id: 'HEAD_TO_HEAD',
    test: (t) => /\bvs\.?\b|\bversus\b|\bafter \d+ (days|weeks|months)\b|\bbetter than\b/i.test(t),
    mechanism: 'two named things compared on a stated basis, with a verdict',
  },
  {
    id: 'SUPERLATIVE',
    test: (t) => /\b(most|best|worst|coolest|scariest|ugliest|thinnest|biggest)\b/i.test(t),
    mechanism: 'a superlative claim about one named thing, then the evidence for it',
  },
]

const minSupport = Number(process.argv[process.argv.indexOf('--min') + 1]) || 3
const corpus = JSON.parse(readFileSync(CORPUS, 'utf8'))

const refs = {}
const perCreator = {}
for (const [handle, titles] of Object.entries(corpus)) {
  perCreator[handle] = {}
  for (const shape of SHAPES) {
    const hits = titles.filter((t) => shape.test(t))
    perCreator[handle][shape.id] = hits.length
    if (hits.length < minSupport) continue
    const key = `D_${handle.toUpperCase().replace(/[^A-Z0-9]/g, '')}_${shape.id}`
    const counts = shape.countFrom ? hits.map(shape.countFrom).filter(Boolean) : []
    refs[key] = {
      source: `@${handle}`,
      shape: shape.id,
      mechanism: shape.mechanism,
      // ⚖️ THE FIELD THAT KEEPS THIS HONEST. Never merge these with the
      // hand-observed references without splitting on this.
      mechanismSource: 'title_inferred',
      $limits: 'Derived from TITLES ONLY. The promise is observed; the beat order, '
        + 're-hook placement and beat debts are NOT — nobody watched the video. '
        + 'Do not compare this against a hand-observed reference without saying so.',
      support: hits.length,
      evidence: hits.slice(0, 4),
      ...(counts.length ? { enumeratedCount: counts.sort((a, b) => a - b)[Math.floor(counts.length / 2)] } : {}),
      ...(shape.needsExperience ? { requiresExperienceEvidence: true } : {}),
    }
  }
}

writeFileSync(OUT, JSON.stringify({
  $why: 'Reference candidates derived from the real scanned corpus, so the matrix can '
    + 'test shapes these creators ACTUALLY use rather than only seven shapes chosen by hand.',
  $limits: 'Every entry is title-inferred. See mechanismSource on each.',
  derivedFrom: CORPUS,
  minSupport,
  references: refs,
  shapeCountsPerCreator: perCreator,
}, null, 1))

console.log(`derived ${Object.keys(refs).length} reference candidates (min support ${minSupport})\n`)
const rows = Object.entries(refs).sort((a, b) => b[1].support - a[1].support)
for (const [k, r] of rows) {
  console.log(`${String(r.support).padStart(3)}x  ${k.padEnd(34)} ${r.source}${r.enumeratedCount ? ` (count ${r.enumeratedCount})` : ''}`)
}
console.log('\nshape coverage per creator:')
const ids = SHAPES.map((s) => s.id)
console.log('  ' + 'handle'.padEnd(20) + ids.map((i) => i.slice(0, 9).padStart(10)).join(''))
for (const [h, c] of Object.entries(perCreator)) {
  console.log('  ' + h.padEnd(20) + ids.map((i) => String(c[i] ?? 0).padStart(10)).join(''))
}
