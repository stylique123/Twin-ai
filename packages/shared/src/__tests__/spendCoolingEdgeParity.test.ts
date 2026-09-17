// THE EDGE COPY OF THE COOLING RULE, EXECUTED RATHER THAN READ — AND THE WIRING
// THAT DECIDES WHETHER IT DOES ANYTHING AT ALL.
//
// ⚖️ THE PARITY HALF FOLLOWS `freshnessEdgeParity`: the edge is Deno and cannot
// import @twinai/shared, so the rule is mirrored, and a TEXTUAL comparison would
// pass a mirror that sorted never-spent last or read a dateless count as fresh.
//
// ⚠️ THE WIRING HALF IS THE MORE IMPORTANT ONE. A correct cooling rule that runs
// over a candidate pool chosen before anything knows what was spent, or whose
// spend column is never written, is this repository's signature defect wearing a
// ranking improvement: right in the code, inert in production.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { transformSync } from 'esbuild'
import { coolBySpend, spendWear } from '../knowledgeSpend'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const EDGE = readFileSync(join(REPO, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')
const MIGRATION = readFileSync(
  join(REPO, 'supabase/migrations/0216_the_same_six_facts_won_every_time.sql'), 'utf8')

const START = '// ── WHAT HAS ALREADY BEEN SPENT, INLINED ─'
const END = '// ── END SPEND COOLING ─'

function loadInline() {
  const a = EDGE.indexOf(START)
  expect(a, 'spend block start marker missing — restore it, do not delete it').toBeGreaterThan(-1)
  const b = EDGE.indexOf(END, a)
  expect(b, 'spend block END marker missing — restore it').toBeGreaterThan(a)
  const js = transformSync(EDGE.slice(a, b), { loader: 'ts', format: 'cjs' }).code
  // eslint-disable-next-line no-new-func
  return new Function(`${js}; return { spendWearInline, coolBySpendInline }`)() as {
    spendWearInline: (last: unknown, count: unknown, nowMs: number) => number
    coolBySpendInline: <T>(rows: readonly T[], nowMs: number) => T[]
  }
}

const NOW = Date.parse('2026-09-17T12:00:00Z')
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString()

/** ⚠️ THE BOUNDARIES ARE THE TEST: never-spent, both sides of the 30-day
 *  cooldown, a contradictory pair, junk, and the wear tie-break. */
const CASES: Array<[string | null, number]> = [
  [null, 0], [null, 1], [null, 9],
  [daysAgo(0), 1], [daysAgo(1), 1], [daysAgo(29.5), 1], [daysAgo(30.5), 1],
  [daysAgo(200), 1], [daysAgo(200), 8], [daysAgo(1000), 1],
  ['not a date', 3],
]

describe('the edge computes the same wear as the shared rule', () => {
  const inline = loadInline()

  it('agrees on every case', () => {
    let compared = 0
    for (const [last, count] of CASES) {
      expect(
        inline.spendWearInline(last, count, NOW),
        `drift on ${String(last)} / ${count}`,
      ).toBe(spendWear({ lastSpentAt: last, spendCount: count }, new Date(NOW)))
      compared++
    }
    // Asserted so a refactor that empties CASES cannot leave a green test that
    // compares nothing.
    expect(compared).toBe(CASES.length)
  })

  it('orders a whole list identically, including the stability guarantee', () => {
    const shared = coolBySpend(
      CASES.map(([lastSpentAt, spendCount], i) => ({ i, lastSpentAt, spendCount })),
      new Date(NOW),
    ).map((r) => r.i)
    const edge = inline.coolBySpendInline(
      CASES.map(([last_spent_at, spend_count], i) => ({ i, last_spent_at, spend_count })),
      NOW,
    ).map((r) => (r as { i: number }).i)
    expect(edge).toEqual(shared)
  })
})

describe('the cooling can actually change what a script gets', () => {
  it('is applied within EQUAL hit counts, never across relevance levels', () => {
    // ⚠️ A FIRST DRAFT COOLED EVERYTHING WITH `hit > 0` AS ONE BLOCK, which
    // promoted an unspent one-word match above a spent five-word match — a
    // reordering across relevance levels, which is the one thing the design
    // forbids. Equal relevance means the same hit count.
    expect(EDGE).toMatch(/const byHit = new Map<number, typeof matched>\(\)/)
    expect(EDGE).toMatch(/\[\.\.\.byHit\.keys\(\)\]\.sort\(\(a, b\) => b - a\)/)
  })

  it('the unordered `hit === 0` group is cooled too', () => {
    // It is most of the store, it is where the filler comes from, and until this
    // change it had no ordering rule at all.
    expect(EDGE).toMatch(/coolBySpendInline\(scored\.filter\(\(x\) => x\.hit === 0\)/)
  })

  it('every knowledge read selects the two columns the cooling orders on', () => {
    // ⚠️ ONE SHARED CONSTANT, NOT THREE LITERALS, and that is stronger: a column
    // cannot be present in two reads and missing from the third when there is
    // only one list. The three reads are the times_seen-ranked one, the `asked`
    // one, and the unspent-supply one.
    const full = /const KNOWLEDGE_COLS_FULL =\s*'([^']*)'/.exec(EDGE)?.[1] ?? ''
    expect(full).toContain('last_spent_at')
    expect(full).toContain('spend_count')
    const uses = EDGE.match(/\.select\(KNOWLEDGE_COLS_FULL\)|\.select\(cols\)/g) ?? []
    expect(uses).toHaveLength(3)
  })

  it('a database without the columns loses the ranking, never the knowledge', () => {
    // ⚠️⚠️ THE HAZARD THESE MIGRATIONS INTRODUCED, AND IT IS WORSE THAN THE
    // DEFECT THEY FIX. PostgREST fails a SELECT naming an unknown column, and all
    // three reads discard their error and fall back to `?? []` — so an edge
    // deployed a minute ahead of 0215/0216 would lose EVERY ROW OF CREATOR
    // KNOWLEDGE, silently, and write every script from nothing. Additive change,
    // working feature removed.
    expect(EDGE).toMatch(/function knowledgeColumnMissing/)
    expect(EDGE).toMatch(/rankedQuery\(KNOWLEDGE_COLS_LEGACY\)/)
    expect(EDGE).toMatch(/askedQuery\(KNOWLEDGE_COLS_LEGACY\)/)
    expect(EDGE).toMatch(/event: 'knowledge_columns_absent'/)
  })

  it('the fallback does not swallow a real failure', () => {
    // A timeout or an RLS refusal must return as it always did; turning a broken
    // database into a creator with nothing to say is the same defect again.
    const fn = EDGE.slice(EDGE.indexOf('function knowledgeColumnMissing'))
    const body = fn.slice(0, fn.indexOf('\n}'))
    expect(body).toMatch(/42703/)
    expect(body).toMatch(/PGRST204/)
  })

  it('the unspent read has NO legacy form, because an arbitrary twenty is a wrong answer', () => {
    // It orders ON `last_spent_at`; without the column there is no such thing as
    // unused supply, and a fallback that dropped the ORDER would return twenty
    // arbitrary rows dressed as the least-used ones.
    expect(EDGE).not.toMatch(/unspentQuery\(KNOWLEDGE_COLS_LEGACY\)/)
  })

  it('a third read reaches the supply the times_seen cap hides', () => {
    // ⚠️⚠️ WITHOUT THIS THE COOLING IS DECORATIVE. The candidate pool is chosen
    // by `order('times_seen').limit(40)` BEFORE anything knows what was spent, so
    // a never-used row at 41st cannot be promoted by a rule that only reorders
    // the forty.
    expect(EDGE).toMatch(/\.order\('last_spent_at', \{ ascending: true, nullsFirst: true \}\)/)
  })

  it('the unspent read is deduped LAST, so it adds supply without reordering', () => {
    // The dedupe keeps the FIRST occurrence; ahead of `rankedRows` it would
    // replace the times_seen ordering with a spend ordering wholesale.
    expect(EDGE).toMatch(/\[\.\.\.\(askedRows \?\? \[\]\), \.\.\.\(rankedRows \?\? \[\]\), \.\.\.\(unspentRows \?\? \[\]\)\]/)
  })
})

describe('the spend is actually recorded, or the ranking never moves', () => {
  it('marks what the PROMPT carried, not what was selected upstream of it', () => {
    // `selectSpeakable` caps at ten; a row that lost its slot was not spent, and
    // marking it would retire material that never reached a writer.
    expect(EDGE).toMatch(/const spentIds = speakable/)
    expect(EDGE).not.toMatch(/const spentIds = ranked/)
  })

  it('does not spend anything for a script the creator was refunded', () => {
    // ⚖️ Retiring facts for OUR quality failure would take the creator's best
    // material off the table to pay for it. Same rule as `credits_spent`.
    const block = EDGE.slice(EDGE.indexOf('// ── WHAT THIS SCRIPT SPENT ─'))
    expect(block.slice(0, block.indexOf('const spentIds'))).toMatch(/if \(!unbillable\) \{/)
  })

  it('is owner-scoped end to end, so one account cannot age out another\'s', () => {
    expect(EDGE).toMatch(/p_owner: ownerId/)
    expect(MIGRATION).toMatch(/where owner_id = p_owner/)
  })

  it('a failed mark is logged, never silently swallowed', () => {
    // ⚠️ A permanently failing mark is indistinguishable from a store where
    // nothing has been used — precisely the state this change exists to end.
    expect(EDGE).toMatch(/event: 'knowledge_spend_unrecorded'/)
  })

  it('never fails the creator\'s response over bookkeeping', () => {
    // The script is already saved and already theirs.
    const block = EDGE.slice(EDGE.indexOf('// ── WHAT THIS SCRIPT SPENT ─'))
    expect(block.slice(0, block.indexOf('// Data layer'))).not.toMatch(/throw /)
  })

  it('an empty id list makes no call at all', () => {
    expect(EDGE).toMatch(/if \(spentIds\.length\) \{/)
  })
})

describe('the columns are honest about what they do not know', () => {
  it('never-spent is NULL and zero together, and that pair is true of every existing row', () => {
    expect(MIGRATION).toMatch(/add column if not exists last_spent_at timestamptz/)
    expect(MIGRATION).toMatch(/spend_count integer not null default 0/)
  })

  it('the RPC is service-role only', () => {
    expect(MIGRATION).toMatch(/revoke all on function public\.mark_knowledge_spent\(uuid, uuid\[\]\) from public, anon, authenticated/)
    expect(MIGRATION).toMatch(/grant execute on function public\.mark_knowledge_spent\(uuid, uuid\[\]\) to service_role/)
  })

  it('a null or empty id array is a no-op rather than a table-wide update', () => {
    expect(MIGRATION).toMatch(/if p_ids is null or array_length\(p_ids, 1\) is null then\s*\n\s*return 0;/)
  })
})
