#!/usr/bin/env node
// EVERY SOURCE A WRITER EMITS MUST BE A MEMBER OF THE READER'S UNION.
//
// ⚠️ THE DEFECT THIS EXISTS FOR, MEASURED 2026-09-05. `answer-beat-ask` has
// written `source: 'asked'` since migration 0128, describing it as "the only
// source in this product a creator STATED rather than a model inferred".
// `KNOWLEDGE_SOURCES` in packages/shared did not contain it. So
// `readKnowledgeItem` validated it away to `undefined`, and `filledFrom` turned
// that into the EMPTY STRING — `[undefined].join(', ')` is `''` — meaning the
// highest-provenance row in the product reached the writer indistinguishable
// from one with no source at all.
//
// ⚖️ AND NOTHING WAS BROKEN YET, WHICH IS WHY IT SURVIVED REVIEW. Production
// holds zero `asked` rows; the mismatch was waiting for the first creator to
// answer a beat ask. A guard is the only thing that catches a contract which is
// wrong but not yet exercised.
//
// ⚠️ THIS GUARD READS CODE LINES ONLY, NEVER COMMENTS. The repo has been bitten
// twice by a source-text guard counting a comment that merely NAMED a symbol as
// a use of it. Whole-line comments are dropped — never everything after `//`,
// which would delete a real write sitting after a string containing a URL.
import { readFileSync, readdirSync, statSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const ROOT = new URL('../..', import.meta.url).pathname

/** Whole-line comments only. See the header. */
function codeLines(text) {
  return text.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
}

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === 'dist' || e === '__tests__') continue
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(e) && !/\.test\.tsx?$/.test(e)) out.push(p)
  }
  return out
}

// ── SELFTEST ───────────────────────────────────────────────────────────────
//
// ⚠️ THE CASES THAT MUST FAIL ARE THE POINT. A guard validated only against
// code that is already correct has been validated against nothing — the
// correction from `check_error_matchers_resolve`, where I "reproduced" a
// failure on a branch where the class still existed and learned nothing.
//
// ⚠️ AND CASE 3 IS THE ONE THIS GUARD PERSONALLY GOT WRONG. Its first version
// flagged eleven correct sites because three unrelated vocabularies spell a
// field `source`. That case must PASS, or the guard is back to accusing code
// that was never broken.
function selftest() {
  const dir = mkdtempSync(join(tmpdir(), 'ks-'))
  const write = (rel, body) => {
    const full = join(dir, rel)
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, body)
    return full
  }
  const scan = (files, declared) => {
    const found = new Map()
    for (const f of files) {
      const raw = readFileSync(f, 'utf8')
      if (!raw.includes('creator_knowledge')) continue
      const lines = codeLines(raw)
      for (let i = 0; i < lines.length; i += 1) {
        if (/\.from\(['"]creator_knowledge['"]\)/.test(lines[i])) {
          let depth = 0, opened = false
          for (let j = i; j < Math.min(lines.length, i + 40); j += 1) {
            for (const ch of lines[j]) {
              if (ch === '{') { depth += 1; opened = true } else if (ch === '}') depth -= 1
            }
            for (const h of lines[j].matchAll(/\bsource:\s*['"]([a-z_]+)['"]/g)) found.set(h[1], f)
            if (opened && depth <= 0) break
          }
        }
      }
      for (const line of lines) {
        for (const h of line.matchAll(/__source:\s*['"]([a-z_]+)['"]/g)) found.set(h[1], f)
      }
    }
    return [...found.keys()].filter((k) => !declared.has(k))
  }

  const cases = [
    ['a declared source passes', 0, ["await db.from('creator_knowledge').insert({ source: 'asked', text: 'x' })"], ['asked']],
    ['AN UNDECLARED SOURCE FAILS', 1, ["await db.from('creator_knowledge').insert({ source: 'invented', text: 'x' })"], ['asked']],
    // The false-positive class this guard shipped once and had to fix.
    ['an unrelated `source:` in the same file is IGNORED', 0,
      ["// creator_knowledge\nconst plan = { source: 'product_dna' }\nconst route = { source: 'local_whisper' }"], ['asked']],
    ['AN UNDECLARED WORKER TAG FAILS', 1, ["// creator_knowledge\nconst r = { __source: 'captions' }"], ['caption']],
    ['a declared worker tag passes', 0, ["// creator_knowledge\nconst r = { __source: 'caption' }"], ['caption']],
    // A comment naming a source is not a write. Bitten twice in this repo.
    ['a WHOLE-LINE COMMENT naming a source is not a write', 0,
      ["// creator_knowledge\n// source: 'invented' is what we used to write"], ['asked']],
  ]

  let bad = 0
  cases.forEach(([name, expected, bodies, declared], i) => {
    const files = bodies.map((b, k) => write(`c${i}_${k}.ts`, b))
    const got = scan(files, new Set(declared)).length > 0 ? 1 : 0
    const ok = got === expected
    if (!ok) bad += 1
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}`)
  })
  rmSync(dir, { recursive: true, force: true })
  if (bad > 0) { console.error(`knowledge-sources selftest: ${bad} case(s) wrong`); process.exit(1) }
  console.log(`knowledge-sources selftest: ${cases.length}/${cases.length}`)
  process.exit(0)
}
if (process.argv.includes('--selftest')) selftest()

// The union, read from its declaration rather than restated here — a guard that
// restates the list it checks is a second copy that can drift from the first.
const src = readFileSync(join(ROOT, 'packages/shared/src/creatorKnowledge.ts'), 'utf8')
const m = /export const KNOWLEDGE_SOURCES = \[([^\]]*)\]/.exec(src)
if (!m) {
  console.error('knowledge-sources guard: could not find KNOWLEDGE_SOURCES. Did it move?')
  process.exit(1)
}
const declared = new Set([...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]))

// ⚠️ THE FIRST VERSION OF THIS SCAN WAS USELESS, AND ITS FAILURE IS THE REASON
// FOR THIS ONE. It matched every `source: '<x>'` in any file that MENTIONED
// creator_knowledge, and reported eleven violations that were all correct code:
// `knowledgeResolver`'s resolution sources (product_dna, research, needs_user,
// unresolved), `media.ts`'s transcript ACQUISITION routes (local_whisper,
// youtube_captions_paid), `api.ts`'s user_confirmed. Three unrelated
// vocabularies that happen to spell a field `source`. A guard that accuses
// correct code is how a guard teaches people to ignore it -- the lesson
// `check_column_readers` already paid for at 29-apparent-versus-7-real.
//
// ⚖️ SO THE SCAN IS ANCHORED ON THE WRITE, NOT ON THE FILE. Only a `source:`
// inside the object literal of a `.from('creator_knowledge')` statement counts.
// The window closes at the statement's end, so a later unrelated `source:` in
// the same function cannot be swept in.
const found = new Map()
for (const dir of ['supabase/functions', 'worker/src', 'apps/web/src', 'packages/shared/src']) {
  for (const file of walk(join(ROOT, dir))) {
    const raw = readFileSync(file, 'utf8')
    if (!raw.includes('creator_knowledge')) continue
    const lines = codeLines(raw)
    for (let i = 0; i < lines.length; i += 1) {
      if (!/\.from\(['"]creator_knowledge['"]\)/.test(lines[i])) continue
      // The write's own statement: from the `.from(` line until braces balance
      // back to zero after having opened at least one.
      let depth = 0, opened = false
      for (let j = i; j < Math.min(lines.length, i + 40); j += 1) {
        for (const ch of lines[j]) {
          if (ch === '{') { depth += 1; opened = true }
          else if (ch === '}') depth -= 1
        }
        for (const hit of lines[j].matchAll(/\bsource:\s*['"]([a-z_]+)['"]/g)) {
          if (!found.has(hit[1])) found.set(hit[1], `${file.slice(ROOT.length)}:${j + 1}`)
        }
        if (opened && depth <= 0) break
      }
    }
    // ⚠️ THE WORKER TAGS BEFORE IT WRITES, SO THE STATEMENT SCAN CANNOT SEE IT.
    //  `voice.ts` stamps `__source: 'transcript' | 'caption'` onto rows that
    //  reach `creator_knowledge` several functions later via `knowledgeInsert`.
    //  Covered explicitly rather than left out: a guard whose stated scope is
    //  "every writer" while it reads one idiom is a guard that will one day be
    //  cited as proof of something it never checked.
    for (const line of lines) {
      for (const hit of line.matchAll(/__source:\s*['"]([a-z_]+)['"]/g)) {
        if (!found.has(hit[1])) found.set(hit[1], file.slice(ROOT.length))
      }
    }
  }
}

const missing = [...found].filter(([s]) => !declared.has(s))
console.log(`  ${declared.size} declared sources · ${found.size} written by code`)
for (const [s, f] of found) console.log(`    ${declared.has(s) ? 'ok  ' : 'MISS'} ${s.padEnd(16)} ${f}`)

if (missing.length > 0) {
  console.error('\nA writer emits a source the reader\'s union does not contain:')
  for (const [s, f] of missing) console.error(`  '${s}' written at ${f}`)
  console.error('\n`readKnowledgeItem` validates an unknown source away to `undefined`, and the')
  console.error('provenance is then lost for every row carrying it. Add it to KNOWLEDGE_SOURCES,')
  console.error('or change the writer — but do not leave the two disagreeing.')
  process.exit(1)
}
console.log('knowledge-sources guard: OK')
