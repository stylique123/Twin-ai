#!/usr/bin/env node
// A NEEDS_USER BEAT MUST CARRY ITS QUESTION IN `ask`, NEVER IN `line`.
//
// ⚠️ THE DEFECT, MEASURED IN A REAL RUN. `generate-blueprint` escalates a beat
// to `needs_user` in three places. Two set `b.ask` and EMPTY `b.line`; the
// third — the product-claim escalation — wrote the question into `b.line` and
// never set `ask` at all. `line` is the SPOKEN field: `recordingScriptAdapter`
// decides an ask card on `seg.ask` and knows nothing about `substance`, and the
// question is ordinary prose rather than a bracketed placeholder, so it passed
// every filter the adapter has. A creator was told to say, on camera:
//
//   "This beat needs a real detail about your product, and nothing about it was
//    supplied. What does it actually do here?"
//
// ⚖️ THREE WRITERS OF ONE STATE, AND ONLY THE TWO THAT AGREED WERE RIGHT. This
// is the shape the repo keeps paying for — the same fact written in more than
// one place, where the odd one out is invisible until a creator reads it aloud.
// The guard is on the INVARIANT, not on a string: every site that sets
// `substance = 'needs_user'` must also set `ask`, and must not leave a
// non-empty `line`.
//
// ⚠️ CODE LINES ONLY. A whole-line comment that merely NAMES `substance` is not
// a write — the mention-versus-call hazard that has bitten this repo twice.
import { readFileSync } from 'node:fs'

const ROOT = new URL('../..', import.meta.url).pathname
const FILE = 'supabase/functions/generate-blueprint/index.ts'

// ⚠️ THE FIRST VERSION REPORTED THE WRONG LINE NUMBER, which sends the next
// person to an unrelated comment. Filtering comments OUT of the array and then
// reporting the array index is not the file's line number: on the real file it
// named 4275, a comment about product claims, for a write at 7681. Keep the
// true line beside each kept line rather than recomputing it.
function scan(text) {
  const lines = text.split('\n')
    .map((l, i) => ({ l, no: i + 1 }))
    .filter(({ l }) => !/^\s*(\/\/|\*|\/\*)/.test(l))
  const bad = []
  lines.forEach(({ l, no }, i) => {
    if (!/\bsubstance\s*=\s*'needs_user'/.test(l)) return
    // The escalation's own statement group: look back and forward a little,
    // since assignment order varies between the three sites.
    const win = lines.slice(Math.max(0, i - 12), i + 12).map((x) => x.l).join('\n')
    const setsAsk = /\.ask\s*=/.test(win)
    const emptiesLine = /\.line\s*=\s*(''|""|`\`|kept \?\? ''|null)/.test(win)
    if (!setsAsk || !emptiesLine) {
      bad.push({ line: no, setsAsk, emptiesLine, text: l.trim().slice(0, 70) })
    }
  })
  return bad
}

if (process.argv.includes('--selftest')) {
  const cases = [
    ['a site that sets ask and empties the line passes', 0,
      "b.ask = q\nb.line = ''\nb.substance = 'needs_user'"],
    ['A SITE THAT PUTS THE QUESTION IN THE LINE FAILS', 1,
      "b.line = q\nb.substance = 'needs_user'\nb.substance_evidence = ''"],
    ['A SITE THAT SETS ask BUT KEEPS A LINE FAILS', 1,
      "b.ask = q\nb.line = q\nb.substance = 'needs_user'"],
    ['the scaffold form counts as emptying', 0,
      "b.ask = q\nconst kept = x\nb.line = kept ?? ''\nb.substance = 'needs_user'"],
    ['a WHOLE-LINE COMMENT naming the field is not a write', 0,
      "// b.substance = 'needs_user' is what we used to do"],
  ]
  let bad = 0
  for (const [name, expect, body] of cases) {
    const got = scan(body).length > 0 ? 1 : 0
    if (got !== expect) bad += 1
    console.log(`  ${got === expect ? 'ok  ' : 'FAIL'} ${name}`)
  }
  if (bad) { console.error(`ask-beat selftest: ${bad} wrong`); process.exit(1) }
  console.log(`ask-beat selftest: ${cases.length}/${cases.length}`)
  process.exit(0)
}

const found = scan(readFileSync(ROOT + FILE, 'utf8'))
if (found.length > 0) {
  console.error('A needs_user beat is being written with its question in the SPOKEN line:\n')
  for (const f of found) {
    console.error(`  ${FILE}:${f.line}  sets ask: ${f.setsAsk}  empties line: ${f.emptiesLine}`)
    console.error(`    ${f.text}`)
  }
  console.error('\n`line` is what the teleprompter says out loud. The question belongs in `ask`,')
  console.error('and the line must be emptied — the other escalation sites already do both.')
  process.exit(1)
}
console.log('ask-beats guard: OK (every needs_user escalation sets ask and empties the line)')
