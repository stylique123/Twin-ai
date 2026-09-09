// BUILT, TESTED, GUARDED — AND READ BY NOTHING.
//
// ⚠️ `projectShape` AND `shapeStats` SHIPPED IN #675 AHEAD OF THEIR CONSUMERS.
// That was an ARGUED deferral, not an oversight — `check_symbol_readers` carried
// the reason and named the consumers: "WIRE with the gallery and angle engine".
// This is that change, and the exemption comes out in the same commit because
// the guard fails on a stale excuse: a registered symbol that acquires a reader
// is reported.
//
// ── WHAT THE CORPUS SUPPORTS, MEASURED 2026-09-09 ────────────────────────
//
// 5,579 distinct public gallery URLs · 1,772 with a profile (32%) · 1,098 with
// structure (20%) · 1,035 with a container (18.6%). Across the whole corpus,
// ranked by transferable count: story 127/170, tutorial 122/123,
// numbered_list 118/118, recommendation 88/90 — and `other` is the LARGEST
// bucket at 308 with only 92 transferable and a mean of 2.8 beats against 5–7
// for every real shape.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  shapeSummary, shapeSummaryLine, shapeLabel, MIN_SHAPES_FOR_A_CLAIM,
} from '../shapeSummary'
import type { ShapeRow } from '../shapeLibrary'

const row = (container: string | null, transferability: 'high' | 'low' | null = 'high', beats = 6): ShapeRow => ({
  container: container as ShapeRow['container'],
  hookMechanism: null,
  payoffType: null,
  ctaMechanism: null,
  beatRoles: Array.from({ length: beats }, () => 'setup'),
  beatCount: beats,
  transferability,
  goals: [],
})
const many = (container: string, n: number, t: 'high' | 'low' = 'high') =>
  Array.from({ length: n }, () => row(container, t))

describe('it refuses to speak below its sample', () => {
  it('says nothing under the threshold', () => {
    // ⚠️⚠️ THE LOAD-BEARING ONE. At 18.6% container coverage a page of fifty
    // cards carries about nine shapes, and nine rows across sixteen container
    // types is noise with a confident sentence wrapped round it.
    expect(shapeSummary(many('tutorial', MIN_SHAPES_FOR_A_CLAIM - 1))).toBeNull()
    expect(shapeSummaryLine(shapeSummary(many('tutorial', 5)))).toBeNull()
  })

  it('speaks at the threshold, and states its n in the sentence', () => {
    // ⚖️ 0191's RULE APPLIES TO EVERY AGGREGATE IN THIS PRODUCT: anything read
    // out of a thin table must state its n. In the sentence, not a tooltip — a
    // number somebody has to hover to find does not qualify the claim.
    const line = shapeSummaryLine(shapeSummary(many('tutorial', MIN_SHAPES_FOR_A_CLAIM)))
    expect(line).toContain(String(MIN_SHAPES_FOR_A_CLAIM))
    expect(line).toContain('tutorials')
  })

  it('rows with no container do not count toward the sample', () => {
    // ⚠️ ABSENT IS NOT ZERO AND IT IS NOT A SHAPE EITHER. Counting unshaped
    // rows would let a page of unassessed cards cross the threshold and then
    // describe the handful that happened to be read as if they were the page.
    const padded = [...many('tutorial', 5), ...Array.from({ length: 40 }, () => row(null))]
    expect(shapeSummary(padded)).toBeNull()
  })
})

describe('`other` is the largest bucket and is never recommended', () => {
  it('is excluded from what gets named', () => {
    // ⚠️ MEASURED: 308 rows, 92 transferable (30%), mean 2.8 beats against 5–7
    // for every real shape. It is where thin and failed assessments land, not a
    // structure anybody chose — recommending it is recommending "none of the
    // above", and the beat count is the tell.
    const rows = [...many('other', 100), ...many('tutorial', 30)]
    const s = shapeSummary(rows)!
    expect(s.top.map((t) => t.container)).not.toContain('other')
    expect(s.top[0].container).toBe('tutorial')
  })

  it('but it still counts toward n', () => {
    // ⚖️ DROPPING IT FROM THE DENOMINATOR would inflate how much of the page
    // the claim covers, which is the one number the creator judges it by.
    expect(shapeSummary([...many('other', 100), ...many('tutorial', 30)])!.n).toBe(130)
  })

  it('a page that is only `other` says nothing at all', () => {
    expect(shapeSummary(many('other', 200))).toBeNull()
  })
})

describe('it ranks on what travels, not on what is common', () => {
  it('a big untransferable bucket loses to a smaller transferable one', () => {
    // ⚠️ THE REASON `shapeStats` SORTS ON transferableHigh. A library ranked on
    // frequency would recommend whatever is most numerous, which in this corpus
    // is the bucket that means "we could not tell".
    const rows = [...many('story', 60, 'low'), ...many('framework', 25, 'high')]
    expect(shapeSummary(rows)!.top[0].container).toBe('framework')
  })

  it('a shape nothing transfers is never named', () => {
    expect(shapeSummary(many('story', 40, 'low'))).toBeNull()
  })

  it('names at most two, because six is a taxonomy dump', () => {
    const rows = ['story', 'tutorial', 'numbered_list', 'framework']
      .flatMap((c) => many(c, 25))
    expect(shapeSummary(rows)!.top).toHaveLength(2)
  })
})

describe('a creator never reads our vocabulary', () => {
  it('translates the assessor snake_case', () => {
    expect(shapeLabel('numbered_list')).toBe('list videos')
    expect(shapeLabel('problem_solution')).toBe('problem-and-fix videos')
    // An unknown container degrades to readable words rather than raw enum.
    expect(shapeLabel('some_new_thing')).toBe('some new thing')
    expect(shapeLabel('numbered_list')).not.toMatch(/_/)
  })

  it('the sentence carries no underscores or internal words', () => {
    const line = shapeSummaryLine(shapeSummary([...many('numbered_list', 25), ...many('problem_solution', 25)]))!
    expect(line).not.toMatch(/_|container|transferab|corpus|null/i)
  })
})

// ── AND THE GALLERY ACTUALLY READS IT ─────────────────────────────────────
const GALLERY = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..',
    'apps', 'web', 'src', 'pages', 'Gallery.tsx'), 'utf8')
const GUARD = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..',
    'scripts', 'ci', 'check_symbol_readers.mjs'), 'utf8')

describe('the named consumer exists now', () => {
  it('projects each card and renders the shape', () => {
    expect(GALLERY).toMatch(/projectShape\(p\)/)
    expect(GALLERY).toMatch(/shapeLabel\(sh\.container\)/)
  })

  it('summarises the page and renders the line', () => {
    // ⚠️ A COMPUTED VALUE NOTHING RENDERS is the defect this whole PR closes;
    // tsc caught exactly that on the first draft (`shapeLine` declared, never
    // read) and it is pinned here so the next edit cannot quietly undo it.
    expect(GALLERY).toMatch(/shapeSummaryLine\(/)
    expect(GALLERY).toMatch(/\{shapeLine\}<\/p>/)
  })

  it('adds no second query — it projects what the page already loaded', () => {
    // ⚖️ `profiles` IS ALREADY FETCHED for every card, once, after the cards
    // are on screen. A separate fetch for the same rows would make the page
    // slower than the one it replaced.
    const block = GALLERY.slice(GALLERY.indexOf('const shapesByCardId'), GALLERY.indexOf('const decisions'))
    expect(block).toMatch(/profiles\.get\(c\.url\)/)
    expect(block).not.toMatch(/await|loadReferenceProfiles|supabase/)
  })

  it('the exemption is gone, because the guard fails on a stale excuse', () => {
    // ⚖️ A SELF-EXPIRING EXCUSE IS THE ONLY KIND WORTH HAVING. The guard
    // reports a registered symbol that has acquired a reader, so leaving this
    // in would break the build — which is the design working.
    expect(GUARD).not.toMatch(/'shapeLibrary\.ts':/)
    expect(GUARD).not.toMatch(/WIRE with the gallery and angle engine/)
  })

  it('the stale 97% claim is corrected', () => {
    // ⚠️ THIS ASSERTION WAS WRONG FIRST TIME, IN THE WAY THIS REPO KEEPS
    // GETTING WRONG. It read `not.toMatch(/97% of cards/)` and failed on the
    // CORRECTION, which quotes the old figure to say it is out of date — a
    // guard that greps source text telling a MENTION from a CLAIM, which the
    // standing note records this codebase mis-handling twice already.
    //
    // ⚖️ SO IT ASSERTS THE SUBSTANCE INSTEAD: the old number must be marked as
    // superseded, and the current share must be stated with the date it was
    // measured. Deleting the quotation would also pass — and should, because
    // then the stale claim is simply gone.
    const stale = GALLERY.indexOf('97% of cards')
    if (stale !== -1) {
      const around = GALLERY.slice(Math.max(0, stale - 400), stale + 200)
      expect(around, 'the old figure must be marked as superseded').toMatch(/USED TO SAY|NOW WRONG|stale/i)
    }
    expect(GALLERY).toMatch(/Measured 2026-09-09/)
    expect(GALLERY).toMatch(/18\.6%/)
  })
})
