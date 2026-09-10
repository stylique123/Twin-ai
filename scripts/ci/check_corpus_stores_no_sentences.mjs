#!/usr/bin/env node
// THE CORPUS STORES SHAPES. IT MUST NEVER STORE SENTENCES.
//
// ⚠️⚠️ THIS IS THE GUARD THAT DEFINES THE PRODUCT, and it is a product rule
// before it is a legal one. Every competitor in this market stores hook TEXT —
// "a library of 1,000+ proven viral hooks", "remix, mimic". Their customers in
// one niche therefore draw from one pool of sentences, and their outputs
// converge. That is the "everything sounds like AI TikTok" complaint, baked
// into an architecture.
//
// ⚠️ AND THE FAILURE MODE IS GRAVITY, NOT DESIGN. Zero borrowing across four
// cross-domain adaptations is this project's best measured result. If a source
// creator's sentences sit in the store, the writer reaches for them — not
// because anyone decided it should, but because that is what a model does with
// text in its context. The win reverses quietly.
//
// ⚖️ SO THE RULE IS ENFORCED ON THE CODE, NOT PROMISED IN A COMMENT. A corpus
// module may hold a taxonomy, a count, a ratio or a capped fragment. It may not
// hold a field that carries a source's prose.
//
// ⚠️ WHAT THIS CAN AND CANNOT SEE, STATED PLAINLY. It reads SOURCE, not the
// database — a static check cannot query production rows. So it enforces the
// two things that are checkable statically and that every past leak went
// through: an evidence field must be length-capped, and no corpus module may
// declare a field whose name promises prose. A row-level check belongs in the
// ingestion path and is filed separately; claiming this covers it would be the
// "absence of a finding is not evidence a check ran" defect.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const CORPUS_DIR = join(ROOT, 'packages/shared/src/corpus')

/** ⚠️ FIELD NAMES THAT PROMISE PROSE. A field called `hook_text` or
 *  `transcript_excerpt` is a sentence store whatever its comment says. */
const PROSE_FIELD = /\b(hook_text|hookText|caption_text|captionText|transcript_excerpt|transcriptExcerpt|full_text|fullText|sentence|sentences|verbatim|quote|quotes|phrasing|opening_line|openingLine)\s*[?:]/

/** ⚖️ AND AN EVIDENCE FIELD MUST BE CAPPED. Every module that returns an
 *  `evidence` string must slice it — a regex can match a long run, and "it is
 *  only ever short" is a promise about patterns, not a property of the code. */
const HAS_EVIDENCE = /\bevidence\s*[?:]\s*string/
const HAS_CAP = /\.slice\(0,\s*[A-Z_0-9]+\)|\.slice\(0,\s*\d+\)/

const files = []
const walk = (dir) => {
  let entries
  try { entries = readdirSync(dir) } catch { return }
  for (const e of entries) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) { if (e !== '__tests__') walk(p); continue }
    if (e.endsWith('.ts')) files.push(p)
  }
}
walk(CORPUS_DIR)

// ⚠️ AN EMPTY SWEEP IS A FAILURE, NOT A PASS. If the corpus directory is moved
// or renamed, a guard that silently checks nothing reports OK forever — which
// is exactly the shape of every "the check had never examined a beat" defect in
// this codebase.
if (files.length === 0) {
  console.error('corpus-no-sentences guard: FAIL — no corpus modules found under')
  console.error(`  ${CORPUS_DIR}`)
  console.error('  A guard that checks nothing must not report OK. If the corpus moved,')
  console.error('  point CORPUS_DIR at it; do not delete this check.')
  process.exit(1)
}

/** Comments quote the very field names this guard bans, so strip them first —
 *  WHOLE-LINE comments only. Dropping everything after `//` would delete a real
 *  declaration sitting after a string containing a url. */
const codeOf = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '\n')
  .split('\n')
  .filter((l) => !/^\s*\/\//.test(l))
  .join('\n')

const failures = []
for (const f of files) {
  const rel = f.slice(ROOT.length + 1)
  const code = codeOf(readFileSync(f, 'utf8'))

  const prose = code.match(PROSE_FIELD)
  if (prose) failures.push(`${rel}: declares \`${prose[0].trim()}\` — a field that holds a source's prose`)

  if (HAS_EVIDENCE.test(code) && !HAS_CAP.test(code)) {
    failures.push(`${rel}: has an \`evidence: string\` field with no .slice(0, N) cap`)
  }
}

console.log(`  ${files.length} corpus module(s) scanned`)
if (failures.length > 0) {
  console.error('corpus-no-sentences guard: FAIL')
  for (const x of failures) console.error(`  · ${x}`)
  console.error('')
  console.error('  The corpus stores SHAPES, never words. Store a taxonomy value, a count,')
  console.error('  a ratio, or a length-capped fragment. Never a source sentence.')
  process.exit(1)
}
console.log('corpus-no-sentences guard: OK')
