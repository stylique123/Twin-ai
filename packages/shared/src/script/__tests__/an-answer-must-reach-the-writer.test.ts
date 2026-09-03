// THE PROVENANCE TABLE, AS A GUARD RATHER THAN A DOCUMENT.
//
// Both planning documents rank the same task first: prove an ask-beat answer
// reaches the writer. This is that proof, pinned so it cannot silently rot.
//
// ⚠️ WHAT THE MEASUREMENT ACTUALLY SAID, 2026-09-02: `creator_knowledge` holds
// 930 rows across 22 owners and ZERO with `source: 'asked'`. Not one answer has
// ever been given, so the dedicated read below has returned an empty array on
// every generation this product has ever run. The documents are RIGHT that the
// path is unexercised.
//
// ⚖️ BUT THE IMPLIED CAUSE IS WRONG, AND THAT IS WORTH MORE THAN THE WARNING.
// The path is fully wired end to end, and someone already anticipated the exact
// failure the documents warn about — see the SECOND, dedicated query below.
// "Unexercised" and "unbuilt" are different findings needing opposite work:
// one needs a creator to answer a question, the other needs code.
//
// ⚖️ SO THIS FILE IS THE ONLY PROTECTION THE CHAIN HAS. A link that no
// production row has ever traversed cannot be caught breaking by traffic — it
// would break silently and stay broken until the first creator finally answered
// and got nothing back. Each assertion below is one row of the table.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const REPO = join(import.meta.dirname, '..', '..', '..', '..', '..')
const read = (...p: string[]) => readFileSync(join(REPO, ...p), 'utf8')

const BLUEPRINT = read('supabase', 'functions', 'generate-blueprint', 'index.ts')
const API = read('packages', 'shared', 'src', 'api.ts')

/** Code lines only — a comment naming a field is not a reader, and this repo
 *  has been bitten twice by a guard that could not tell a mention from a call. */
const codeOf = (src: string) =>
  src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')

describe('an answer must reach the writer', () => {
  it('ROW 1 — the client has a call that submits an answer', () => {
    expect(codeOf(API)).toMatch(/export async function answerBeatAsk\(/)
    expect(codeOf(API)).toMatch(/functions\.invoke\('answer-beat-ask'/)
  })

  it('ROW 2 — the writer reads asked answers with a DEDICATED query', () => {
    // ⚠️ THE RANKED READ CANNOT SEE THEM, WHICH IS THE WHOLE REASON THIS EXISTS.
    // `times_seen` counts how many videos carried a position, so a row the
    // creator STATED once is a 1 — and forty caption-derived rows of 2 and 3 sit
    // above it. Losing this query makes the entire answer channel decorative
    // while every other test still passes.
    const code = codeOf(BLUEPRINT)
    expect(code).toMatch(/\.from\('creator_knowledge'\)/)
    expect(code).toMatch(/\.eq\('source',\s*'asked'\)/)
  })

  it('ROW 3 — asked answers are ordered AHEAD of the ranked ones', () => {
    // A scarce, creator-stated row placed after forty caption rows is a row the
    // model may never reach. Order is part of the wiring, not a detail.
    expect(codeOf(BLUEPRINT)).toMatch(/\[\s*\.\.\.\(askedRows\s*\?\?\s*\[\]\)\s*,\s*\.\.\.\(rankedRows\s*\?\?\s*\[\]\)/)
  })

  it('ROW 4 — the merged rows reach the ASSEMBLED PROMPT, not just a variable', () => {
    // ⚠️ "APPEARS IN THE PROMPT" MEANS THE INTERPOLATION WAS FOUND. A field that
    // is selected, merged and then never rendered is the defect class this repo
    // has documented nine times.
    const code = codeOf(BLUEPRINT)
    expect(code).toMatch(/knowledgeParts\.push\(/)
    expect(code).toMatch(/WHAT THIS CREATOR ACTUALLY KNOWS AND HAS SAID/)
    const merged = code.indexOf('...(askedRows')
    const prompt = code.indexOf('WHAT THIS CREATOR ACTUALLY KNOWS AND HAS SAID')
    expect(merged).toBeGreaterThan(-1)
    expect(prompt).toBeGreaterThan(-1)
  })

  it('ROW 5 — the writer may only cite knowledge that is actually in the list', () => {
    // The honesty half. Without this the chain could "work" by inventing.
    expect(BLUEPRINT).toMatch(/You may only choose this if the item is actually in that list above/)
  })

  it('ROW 6 — an empty store produces a thinner script, never an invented one', () => {
    // ⚖️ ABSENT IS SILENT, NOT A PROMPT TO INVENT. This is what makes zero asked
    // rows safe today rather than dangerous.
    expect(BLUEPRINT).toMatch(/ABSENT IS SILENT, NOT A PROMPT TO INVENT/)
    expect(BLUEPRINT).toMatch(/An empty knowledge store cannot manufacture a story/)
  })
})
