// THE LEDGER IS ONLY WORTH HAVING IF THE WRITER READS IT AND THE GENERATION WRITES IT.
//
// ⚠️ THE DEFECT CLASS THIS FILE EXISTS FOR IS NOT THE RANKING, IT IS THE WIRING.
// `openingSetFor`, the `commentsDatasetUrl` prose, `knowledgePromptLine` — each
// correct, each read by nothing. A rotation rule with no caller would leave the
// same ten items reaching every script while every unit test passed.
//
// ⚖️ AND IT COUNTS CODE, NOT COMMENTS. A guard that greps source text must tell a
// mention from a call: this has bitten twice in this repo, once because a comment
// protecting an assertion satisfied it. Whole-line comments are dropped — never
// everything after `//`, which would delete a real read that happens to sit after
// a string containing a URL.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const EDGE_SRC = readFileSync(join(REPO, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')
const MIG = readFileSync(
  join(REPO, 'supabase/migrations/0215_the_store_never_recorded_what_it_had_already_spent.sql'), 'utf8')

/** Code lines only: drop whole-line `//` comments and block-comment bodies. */
const codeOf = (src: string): string => src
  .split('\n')
  .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
  .join('\n')
const EDGE = codeOf(EDGE_SRC)

describe('the rotation reaches the selection', () => {
  it('the supply order is the rotated one, not the old two-line partition', () => {
    expect(EDGE).toMatch(/const relevanceOrdered = orderForSupplyInline\(/)
    // ⚠️ THE LINE IT REPLACED, WHICH IS THE DEFECT ITSELF. Sorting by hit and
    // taking the first ten is deterministic over a static store, so the same
    // items won every time.
    expect(EDGE).not.toMatch(/const relevanceOrdered = \[\s*\n\s*\.\.\.scored\.filter/)
  })

  it('the columns it ranks on are actually selected', () => {
    expect(EDGE).toMatch(/KNOWLEDGE_COLS_ROTATION = `\$\{KNOWLEDGE_COLS_BASE\}, used_count, last_used_at`/)
    expect(EDGE).toMatch(/readKnowledge\(/)
  })

  // ⚠️ A SELECT NAMING A COLUMN THAT DOES NOT EXIST FAILS THE WHOLE READ, and
  // this read IS the creator's knowledge. Between deploying and applying 0215 by
  // hand, a naive widened select would hand the writer NOTHING — the empty-store
  // defect, caused by an improvement to ranking.
  it('an unapplied 0215 costs the rotation, never the knowledge', () => {
    expect(EDGE).toMatch(/KNOWLEDGE_COLS_BASE\)/)
    expect(EDGE_SRC).toMatch(/event: 'knowledge_rotation_columns_absent'/)
  })
})

describe('the spend is recorded on every path that delivers a script', () => {
  // ⚠️ THE RESCUE BRANCH RECORDED NEITHER CHOICE ROW AND 13 OF 13 GENERATIONS ON
  // 2026-09-10 CAME THROUGH IT. A rescued script is delivered and charged for, so
  // the items it spent are spent; recording only the happy path would leave the
  // busiest branch reporting an untouched runway.
  it('both persistence sites call it, not just the happy one', () => {
    expect((EDGE.match(/await recordKnowledgeSpend\(admin, \{/g) ?? []).length).toBe(2)
    expect((EDGE.match(/await recordWhatWasChosen\(admin, \{/g) ?? []).length).toBe(2)
  })

  it('it is read at the write site, not captured into a literal early', () => {
    const decl = EDGE.indexOf('let suppliedKnowledgeIds')
    const write = EDGE.indexOf('suppliedKnowledgeIds = speakable')
    const read = EDGE.lastIndexOf('ids: suppliedKnowledgeIds')
    expect(decl).toBeGreaterThan(-1)
    expect(write).toBeGreaterThan(decl)
    // ⚖️ A COUNTER READ INTO AN OBJECT LITERAL BEFORE ITS VALUE IS COMPUTED
    // STORES NOTHING — `beat_audit` paid for that lesson.
    expect(read).toBeGreaterThan(write)
  })

  it('a bookkeeping failure never costs the creator the script', () => {
    const from = EDGE_SRC.indexOf('async function recordKnowledgeSpend')
    expect(from).toBeGreaterThan(-1)
    // ⚠️ CODE ONLY. The first version of this assertion read the whole slice and
    // failed on the word "thrown" inside a comment — the mention-versus-call
    // failure this file's own header warns about, committed in the file that
    // warns about it.
    const fn = codeOf(EDGE_SRC.slice(from, from + EDGE_SRC.slice(from).indexOf('\n}\n')))
    expect(fn).toMatch(/try \{/)
    expect(fn).toMatch(/catch \(err\)/)
    expect(fn).not.toMatch(/\bthrow\s/)
  })
})

describe('the ledger cannot be inflated, and cannot be aimed at someone else', () => {
  it('one row per item per generation', () => {
    expect(MIG).toMatch(/create unique index if not exists creator_knowledge_uses_once/)
    expect(MIG).toMatch(/on conflict do nothing/)
  })

  // ⚠️ THE COUNTER IS DERIVED FROM THE LEDGER, so a retry that inserted nothing
  // must bump nothing. Bumping unconditionally would make a retried generation
  // look twice as spent forever.
  it('the counter moves only for rows the ledger accepted', () => {
    expect(MIG).toMatch(/where k\.id in \(select knowledge_id from inserted\)/)
  })

  it('an id that is not this owner\'s is ignored rather than trusted', () => {
    expect(MIG).toMatch(/k\.owner_id = p_owner/)
  })

  it('nothing a creator controls may write it', () => {
    expect(MIG).toMatch(/enable row level security/)
    expect(MIG).toMatch(/revoke all on table public\.creator_knowledge_uses from public, anon, authenticated/)
    expect(MIG).toMatch(/grant select, insert on table public\.creator_knowledge_uses to service_role/)
  })
})
