// A COLUMN WRITTEN AND NEVER READ IS THIS REPOSITORY'S SIGNATURE DEFECT.
//
// ⚠️ THE LEDGER RECORDS IT NINE TIMES IN ONE SESSION, and §K1 is the most
// expensive instance: `freshness()` existed, was rendered by a function with NO
// production reader, and the edge function's knowledge query did not even SELECT
// the column — so no amount of correct dating could ever have reached a prompt.
// `evidence` (0215) is the same shape of change and would fail the same way by
// default: the extractor would copy real sentences, the merge would store them,
// and the writer would go on seeing "she cares about pricing".
//
// So these tests are about the SELECT and the RENDER, not about the column.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const EDGE = readFileSync(join(REPO, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')
const MIGRATION = readFileSync(
  join(REPO, 'supabase/migrations/0215_a_conclusion_without_the_sentence_it_came_from.sql'), 'utf8')

describe('the writer can see the sentence', () => {
  it('every knowledge query selects it — all three of them', () => {
    // ⚠️ §K1's lesson was that one unselected column makes the whole chain
    // inert, and a codebase with several read paths gets one of them updated.
    // This asserted TWO when it was written and 0216 added a third; the count is
    // kept rather than relaxed to a `>= 1`, because "every read carries it" is
    // the claim and a count is the only way to check it.
    //
    // ⚠️ RE-ANCHORED ON THE CONSTANT THE THREE READS NOW SHARE. That is stronger
    // than counting literals: the column cannot be present in two reads and
    // absent from the third if there is only one list.
    expect(/const KNOWLEDGE_COLS_FULL =\s*'([^']*)'/.exec(EDGE)?.[1] ?? '').toContain('evidence')
    const uses = EDGE.match(/\.select\(KNOWLEDGE_COLS_FULL\)|\.select\(cols\)/g) ?? []
    expect(uses).toHaveLength(3)
  })

  it('renders it on the item, not as a second list', () => {
    // ⚖️ The cost/consensus argument, already settled in `creatorKnowledge.ts`:
    // a conclusion and its evidence are halves of one sentence, and splitting
    // them hands the writer back the fragments this change exists to rejoin.
    expect(EDGE).toMatch(/she said: "\$\{ev\}"/)
    expect(EDGE).toMatch(/\$\{k\.text\}\$\{said\}/)
  })

  it('an absent sentence renders nothing at all, never an empty label', () => {
    // A dangling `she said: ""` would tell the writer the creator said nothing,
    // which is a claim; absent is silence, which is the truth.
    expect(EDGE).toMatch(/const said = ev \? .* : ''/)
  })
})

describe('the sentence may not become a fabricated quotation', () => {
  it('the prompt forbids reproducing it verbatim as dialogue', () => {
    // ⚠️ A LINE LABELLED "she said" IS A LICENCE THE WRITER TAKES LITERALLY
    // unless something says otherwise.
    expect(EDGE).toMatch(/WRITE YOUR OWN LINE from it/)
    expect(EDGE).toMatch(/Never reproduce it verbatim as/)
  })

  it('forbids the more dangerous case: altering it and still attributing it', () => {
    // §G8 — a true citation attached to an invented number — is open and caught
    // by nothing. A smoothed quotation is that defect with better grammar.
    expect(EDGE).toMatch(/never alter\s*'\s*\+\s*'\s*it and present it as hers|never alter it and present it as hers/)
  })
})

describe('the merge keeps the sentence tied to the video it came from', () => {
  it('the FIRST recorded sentence wins, unlike every other field here', () => {
    // ⚠️ THE ONE COLUMN THAT IS NOT `coalesce(excluded, stored)`. Overwriting
    // with a sentence from a DIFFERENT video would leave the row pointing at one
    // video and quoting another: a citation individually true and jointly false.
    expect(MIGRATION).toMatch(/evidence = coalesce\(public\.creator_knowledge\.evidence, excluded\.evidence\)/)
    expect(MIGRATION).not.toMatch(/evidence = coalesce\(excluded\.evidence/)
  })

  it('is capped in the schema, so the table cannot become a transcript store', () => {
    // 0121's whole design rests on `text` being CHECK-capped. So does this.
    expect(MIGRATION).toMatch(/length\(btrim\(evidence\)\) between 1 and 400/)
  })

  it('is nullable, because absent is the ordinary answer', () => {
    // Requiring it would either fail the caption rows or invite a manufactured
    // quotation.
    expect(MIGRATION).not.toMatch(/evidence text not null/)
  })

  it('the merge function carries it in both halves', () => {
    // 0178 and 0214 each paid for 0123 enumerating its columns by hand.
    expect(MIGRATION).toMatch(/nullif\(btrim\(r->>'evidence'\), ''\)\s+as evidence/)
    expect(MIGRATION).toMatch(/extractor_version, evidence\)\s*\n\s*select/)
  })
})
