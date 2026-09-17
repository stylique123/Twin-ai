// THE WRITER NEVER KNEW HOW OLD ANY OF IT WAS.
//
// ⚠️ MEASURED 2026-09-16. `freshness()` has existed in `creatorKnowledge.ts` and
// is rendered by `knowledgePromptLine` — which has NO PRODUCTION READER. Its only
// reference outside its own module is a COMMENT in `scripts/qa/run-eval.mjs:340`
// saying the harness renders it "exactly as" that function does. Meanwhile
// `generate-blueprint` had ZERO occurrences of `freshness`, `last_observed_at`,
// `ageing` or `undated`, and its knowledge read did not even SELECT the column.
//
// ⚖️ SO BOTH COPIES ARE EXECUTED AND COMPARED, never read. The boundaries are
// where a month arithmetic bug lives, and a textual comparison would pass a
// mirror that used 30 days where the original uses 30.44.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { transformSync } from 'esbuild'
import { freshness } from '../creatorKnowledge'
import type { KnowledgeItem } from '../creatorKnowledge'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const EDGE = readFileSync(join(REPO, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')

const START = '// ── HOW RECENTLY SHE WAS HEARD SAYING IT, INLINED ─'
const END = '// ── END FRESHNESS ─'

function loadInline() {
  const a = EDGE.indexOf(START)
  expect(a, 'freshness block start marker missing — restore it, do not delete it').toBeGreaterThan(-1)
  const b = EDGE.indexOf(END, a)
  expect(b, 'freshness block END marker missing — restore it').toBeGreaterThan(a)
  const js = transformSync(EDGE.slice(a, b), { loader: 'ts', format: 'cjs' }).code
  // eslint-disable-next-line no-new-func
  return new Function(`${js}; return { freshnessInline, freshnessTagInline }`)() as {
    freshnessInline: (v: unknown, nowMs: number) => string
    freshnessTagInline: (v: unknown, nowMs: number) => string
  }
}

const NOW = Date.parse('2026-09-16T12:00:00Z')
const MONTH = 1000 * 60 * 60 * 24 * 30.44
const at = (months: number) => new Date(NOW - months * MONTH).toISOString()
const item = (lastObservedAt: string | null): KnowledgeItem =>
  ({ kind: 'claim', text: 't', basis: 'stated', lastObservedAt } as unknown as KnowledgeItem)

/** ⚠️ THE BOUNDARIES ARE THE TEST. 6 and 18 months are the two thresholds, and
 *  either side of each is where a 30-vs-30.44-day mirror diverges. */
const AGES = [0, 0.5, 1, 3, 5.9, 6, 6.01, 12, 17.9, 18, 18.01, 24, 60, 240]

describe('the edge copy of the freshness rule matches the shared one', () => {
  const inline = loadInline()

  it('agrees at every age, including both boundaries', () => {
    let compared = 0
    const seen = new Set<string>()
    for (const m of AGES) {
      const iso = at(m)
      const a = freshness(item(iso), new Date(NOW))
      const b = inline.freshnessInline(iso, NOW)
      expect(b, `drift at ${m} months`).toBe(a)
      seen.add(a)
      compared++
    }
    expect(compared).toBe(AGES.length)
    // Guards the guard: a table that only ever produced one verdict would agree
    // with anything.
    expect([...seen].sort()).toEqual(['ageing', 'established', 'recent'])
  })

  it('agrees that a missing, blank or unparseable date is undated', () => {
    for (const v of [null, undefined, '', '   ', 'not a date', 42, {}, []]) {
      expect(inline.freshnessInline(v, NOW), `drift at ${JSON.stringify(v)}`).toBe('undated')
    }
    // And the shared copy says the same for its own null case.
    expect(freshness(item(null), new Date(NOW))).toBe('undated')
  })

  it('uses the same month length, which is where a hand-copy diverges', () => {
    // 30 days vs 30.44 puts ~6-month and ~18-month items on opposite sides.
    const justInside = at(5.99)
    const justOutside = at(6.02)
    expect(inline.freshnessInline(justInside, NOW)).toBe('recent')
    expect(inline.freshnessInline(justOutside, NOW)).toBe('established')
    expect(inline.freshnessInline(justInside, NOW)).toBe(freshness(item(justInside), new Date(NOW)))
    expect(inline.freshnessInline(justOutside, NOW)).toBe(freshness(item(justOutside), new Date(NOW)))
  })
})

describe('an undated item carries NO tag, and that is the whole design', () => {
  const inline = loadInline()

  it('renders nothing for undated rather than the word', () => {
    // ⚠️⚠️ THE REGRESSION THIS PREVENTS, MEASURED: 407 of 585 substance rows are
    // undated (70%). The shared module's prompt text says "[undated] means nobody
    // recorded when — treat it as ageing", which would instruct the writer to
    // hedge on more than two thirds of a creator's own material. A depth
    // regression dressed as caution.
    for (const v of [null, undefined, '', 'not a date']) {
      expect(inline.freshnessTagInline(v, NOW)).toBe('')
    }
  })

  it('tags the dated ones, with the trailing space that keeps the line readable', () => {
    expect(inline.freshnessTagInline(at(1), NOW)).toBe('[recent] ')
    expect(inline.freshnessTagInline(at(12), NOW)).toBe('[established] ')
    expect(inline.freshnessTagInline(at(36), NOW)).toBe('[ageing] ')
  })

  it('never emits the word undated into a prompt', () => {
    for (const m of [...AGES, 999]) {
      expect(inline.freshnessTagInline(at(m), NOW)).not.toContain('undated')
    }
    expect(inline.freshnessTagInline(null, NOW)).not.toContain('undated')
  })
})

// ── THE PART A PURE FUNCTION CANNOT PROVE ────────────────────────────────────
//
// ⚠️ A RULE NOTHING CALLS IS THE DEFECT THIS PR EXISTS TO FIX, so the wiring is
// asserted against the edge source. Comments are stripped first: this file's own
// prose names every symbol it checks.
const CODE = EDGE.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ')

describe('the tag actually reaches the prompt', () => {
  it('selects the column — without this nothing else can work', () => {
    // ⚠️ THREE KNOWLEDGE READS NOW: the `times_seen`-ranked one, the `asked`
    // one, and the unspent-supply one 0216 added so the spend cooling can reach
    // past the top-40 cap. Every one of them must carry the date, or the tag is
    // absent on whatever that read contributed — a partial failure, which is
    // worse than a total one because it looks like the feature working.
    const selects = CODE.match(/\.select\('id, kind, text, basis, times_seen, confidence, source[^']*'\)/g) ?? []
    expect(selects.length).toBe(3)
    for (const sel of selects) expect(sel).toContain('last_observed_at')
  })

  it('is interpolated into the line the writer reads', () => {
    expect(CODE).toMatch(/freshnessTagInline\(\(k as \{ last_observed_at\?: unknown \}\)\.last_observed_at, nowMsForFreshness\)/)
    expect(CODE).toMatch(/speakable\.map\(\(k\) =>/)
  })

  it('reads the clock ONCE for the whole block', () => {
    // ⚖️ Date.now() per item could put two items either side of a month boundary
    // inside one prompt — a difference no reader could explain.
    expect(CODE).toMatch(/const nowMsForFreshness = Date\.now\(\)/)
    expect((CODE.match(/nowMsForFreshness = Date\.now\(\)/g) ?? []).length).toBe(1)
  })

  it('explains the tags to the writer, and does NOT say to treat untagged as ageing', () => {
    expect(CODE).toMatch(/neither fresher nor staler/)
    // ⚠️ THE CLAUSE THAT MUST NOT COME BACK.
    expect(CODE).not.toMatch(/treat it as ageing/)
    expect(CODE).not.toMatch(/\[undated\]/)
  })

  it('⚠️ says OBSERVED, never claims the item is CURRENTLY TRUE', () => {
    // Every dated row is stamped `new Date()` at extraction time
    // (worker/src/jobs/voice.ts:315) — the SCRAPE date. The post's publish date is
    // recorded NOWHERE: ScrapedPost carries only text/likes/plays/hashtags/url/
    // cover and scraped_posts has only observed_at. galleryRank.ts:169 already
    // warns against "a confident freshness claim on a scrape date".
    //
    // ⚠️ MY FIRST VERSION SAID "[recent] is safe to state flatly", which would
    // have had the writer assert a three-year-old position as current because we
    // read it last month. The post's age is an honest UNKNOWN and is not checkable
    // from what is stored, so the instruction describes the OBSERVATION — which is
    // true — and not the claim's currency, which is not knowable yet.
    // ⚠️ MATCHED WITHIN LINES. The instruction is built by string concatenation,
    // so a phrase that reads contiguously in the prompt is SPLIT across source
    // lines — my first version of this assertion spanned the break between
    // `'…the date we'` and `' read it, …'` and failed on correct code. Fifth time
    // today that the test was wrong and the code was right.
    expect(CODE).toMatch(/when we last OBSERVED her saying it/)
    expect(CODE).toMatch(/not necessarily when she first said it/)
    expect(CODE).not.toMatch(/safe to state flatly/)
  })
})
