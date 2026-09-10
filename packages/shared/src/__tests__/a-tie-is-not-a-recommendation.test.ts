import { describe, it, expect } from 'vitest'
import { rankShapesForGoal, shapeForGoal, CORPUS_GOAL_FOR_VIDEO_GOAL, MIN_SHAPE_SUPPORT } from '../shapeForGoal'
import type { ShapeRow } from '../shapeLibrary'
import { VIDEO_GOALS } from '../videoIntent'
import { LIKELY_GOALS, CONTAINER_TYPES } from '../referenceContentProfile'

function rows(
  spec: ReadonlyArray<[ShapeRow['container'], string, number, ShapeRow['transferability']?]>,
): ShapeRow[] {
  const out: ShapeRow[] = []
  for (const [container, goal, n, transferability = 'high'] of spec) {
    for (let i = 0; i < n; i++) {
      out.push({
        container, hookMechanism: null, payoffType: null, ctaMechanism: null,
        beatRoles: [], beatCount: 0, transferability,
        // ⚠️ NULL, AND NOT A CONVENIENT BAND. These fixtures carry no duration,
        // so "nobody measured" is the honest value — the same state every
        // reference assessed before 0193 will hold forever. Filling it here
        // would make the tie-breaking tests below reason about a pacing signal
        // no fixture actually establishes.
        pacing: null,
        goals: [goal as never],
      })
    }
  }
  return out
}

// ⚠️ THE REAL COUNTS, RE-MEASURED 2026-09-09 over the assessed corpus, which has
// grown from 601 profiles to 1,099. The point of using them rather than round
// numbers is that one goal is decided and the rest are ties, and only real data
// has that texture.
//
// ⚠️ `authority` IS THE ROW THAT CHANGED, AND IT CHANGED DIRECTION. At 601
// profiles it read 51 vs 33 — 1.96 SE, a near-miss. At 1,099 it reads 61 vs 51
// — 0.94 SE. The gap did not close; the noise floor rose with n and the lead
// never kept pace. A near-miss invites "one more batch and it lands"; this is
// the opposite, and the fixture has to say so or the module's comment and its
// test disagree about the same corpus.
const CORPUS = rows([
  ['tutorial', 'education', 106], ['numbered_list', 'education', 98], ['framework', 'education', 69],
  ['story', 'growth', 88], ['numbered_list', 'growth', 82], ['tutorial', 'growth', 76],
  ['story', 'entertainment', 89], ['tutorial', 'entertainment', 22], ['recommendation', 'entertainment', 18],
  ['framework', 'authority', 61], ['numbered_list', 'authority', 51],
  ['tutorial', 'sales', 16], ['problem_solution', 'sales', 12],
])

// ⚖️ THE 1.96 CASE IS KEPT AS A SYNTHETIC BOUNDARY, NOT LOST WITH THE RE-MEASURE.
// It is the most valuable case in this file — the one that proves the bar is not
// rounded up to admit a favoured shape — and it stopped being a real corpus row
// only by accident of the corpus growing. Retiring a boundary test because the
// data moved off it would make this suite weaker for no reason.
const NEAR_MISS = rows([
  ['framework', 'authority', 51], ['numbered_list', 'authority', 33],
])

describe('the goal vocabularies line up, and the gap is admitted', () => {
  it('maps every one of Twin\'s goals', () => {
    for (const g of VIDEO_GOALS) {
      expect(CORPUS_GOAL_FOR_VIDEO_GOAL).toHaveProperty(g)
    }
  })

  it('maps only to goals the assessor can actually record', () => {
    for (const mapped of Object.values(CORPUS_GOAL_FOR_VIDEO_GOAL)) {
      if (mapped === null) continue
      expect(LIKELY_GOALS as readonly string[]).toContain(mapped)
    }
  })

  // ⚖️ THE ONE HONEST null. "Makes this creator memorable" is a property of the
  // creator, not the container, so the assessor has no equivalent. Mapping it
  // to `authority` because the words feel adjacent would put a real template
  // behind a goal nobody measured.
  it('gives personal_brand no shape rather than the nearest-sounding one', () => {
    expect(CORPUS_GOAL_FOR_VIDEO_GOAL.personal_brand).toBeNull()
    const r = rankShapesForGoal('personal_brand', CORPUS)
    expect(r.corpusGoal).toBeNull()
    expect(r.shapes).toEqual([])
    expect(shapeForGoal('personal_brand', CORPUS)).toBeNull()
  })
})

describe('one goal in seven actually separates', () => {
  // ⚠️ 89 vs 22 is 6.36 standard errors. Still the only goal on the corpus where
  // the leading container is distinguishable from the runner-up — and it
  // STRENGTHENED as the corpus grew, from 4.90, which is what a real effect does.
  it('entertainment resolves to story', () => {
    const r = rankShapesForGoal('entertain', CORPUS)
    expect(r.shapes[0]).toEqual({ container: 'story', transferable: 89 })
    expect(r.decisive).toBe(true)
    expect(shapeForGoal('entertain', CORPUS)).toBe('story')
  })

  // ⚠️ THE ONE THAT LOOKS LIKE A RESULT AND IS NOT. 106 against 98 is an
  // eight-reference lead out of 273 — 0.56 standard errors, and it got WEAKER as
  // the corpus grew (it was 1.30). My first draft of this module shipped a ratio
  // threshold chosen by eye that called this decisive; the ratio had been fitted
  // to the answer I expected.
  it('education RANKS tutorial first but refuses to recommend it', () => {
    const r = rankShapesForGoal('educate', CORPUS)
    expect(r.corpusGoal).toBe('education')
    expect(r.shapes[0]).toEqual({ container: 'tutorial', transferable: 106 })
    expect(r.decisive).toBe(false)
    expect(shapeForGoal('educate', CORPUS)).toBeNull()
  })

  // ⚖️ A NEAR MISS STAYS A MISS. 51 against 33 is 1.96 SE, just under the bar.
  // Moving the bar to admit it is how a threshold becomes a preference. Held as
  // a synthetic case now that the real corpus has moved off it.
  it('a 1.96 SE lead is not rounded up to the bar', () => {
    expect(rankShapesForGoal('authority', NEAR_MISS).decisive).toBe(false)
    expect(shapeForGoal('authority', NEAR_MISS)).toBeNull()
  })

  // ⚠️ AND ON THE CURRENT CORPUS IT IS NOT EVEN CLOSE. 61 vs 51 is 0.94 SE. The
  // module's comment recorded 1.96 for months after this stopped being true — a
  // stale number in the comment that justifies a shipping decision, which is
  // exactly the defect class this codebase keeps finding one layer out.
  it('authority moved AWAY from decisive as the corpus grew', () => {
    expect(rankShapesForGoal('authority', CORPUS).decisive).toBe(false)
    expect(shapeForGoal('authority', CORPUS)).toBeNull()
    // the lead is still framework — it is the separation that fails, not the order
    expect(rankShapesForGoal('authority', CORPUS).shapes[0])
      .toEqual({ container: 'framework', transferable: 61 })
  })
})

describe('a tie is not a recommendation', () => {
  // ⚠️ 88 / 82 / 76. Naming story "the shape for growth" would be reporting a
  // six-reference gap as a finding.
  //
  // ⚠️⚠️ AND THE LEADER CHANGED, WHICH IS THE ARGUMENT FOR THE TIE RULE ITSELF.
  // At 601 profiles growth read numbered_list 62 / tutorial 58 / story 57; at
  // 1,099 it reads story 88 / numbered_list 82 / tutorial 76. The winner and the
  // loser swapped places. Anything shipped off the 2026-09-05 ranking would now
  // be recommending the shape that came LAST — which is what a 0.37 SE lead was
  // always worth, and why `decisive` gates the recommendation rather than the
  // ordering.
  it('growth ranks but does not recommend', () => {
    const r = rankShapesForGoal('followers', CORPUS)
    expect(r.corpusGoal).toBe('growth')
    expect(r.shapes.map((s) => s.container)).toEqual(['story', 'numbered_list', 'tutorial'])
    expect(r.decisive).toBe(false)
    expect(shapeForGoal('followers', CORPUS)).toBeNull()
  })

  it('a lone shape above the floor is decisive on its own', () => {
    const r = rankShapesForGoal('educate', rows([['tutorial', 'education', 9]]))
    expect(r.decisive).toBe(true)
    expect(shapeForGoal('educate', rows([['tutorial', 'education', 9]]))).toBe('tutorial')
  })
})

describe('what it refuses to count', () => {
  it('drops a container below the support floor', () => {
    const thin = rows([['tutorial', 'education', MIN_SHAPE_SUPPORT - 1]])
    expect(rankShapesForGoal('educate', thin).shapes).toEqual([])
    expect(shapeForGoal('educate', thin)).toBeNull()
  })

  // ⚠️ `other` IS THE BIGGEST BUCKET IN THE CORPUS AND IS NOT A SHAPE. There is
  // no template for it and there could not be one.
  it('never recommends `other`, however many carry it', () => {
    const r = rankShapesForGoal('educate', rows([['other', 'education', 500]]))
    expect(r.shapes).toEqual([])
    expect(shapeForGoal('educate', rows([['other', 'education', 500]]))).toBeNull()
  })

  it('ignores a container the assessor did not judge transferable', () => {
    const untransferable = rows([['tutorial', 'education', 50, 'low'],
      ['numbered_list', 'education', 50, null]])
    expect(rankShapesForGoal('educate', untransferable).shapes).toEqual([])
  })

  it('ignores rows carrying a different goal', () => {
    expect(rankShapesForGoal('sell', rows([['tutorial', 'education', 90]])).shapes).toEqual([])
  })

  it('a null goal and an empty corpus both yield nothing', () => {
    expect(rankShapesForGoal(null, CORPUS).shapes).toEqual([])
    expect(rankShapesForGoal('educate', []).shapes).toEqual([])
    expect(shapeForGoal(null, [])).toBeNull()
  })

  // ⚖️ EVERY SHAPE IT CAN RETURN MUST HAVE A TEMPLATE TO CASH IT. A container
  // with no entry in containerTemplates would reach generate-blueprint and
  // resolve to nothing, which is worse than making no suggestion.
  it('only ever names a container the assessor knows', () => {
    for (const g of VIDEO_GOALS) {
      for (const s of rankShapesForGoal(g, CORPUS).shapes) {
        expect(CONTAINER_TYPES as readonly string[]).toContain(s.container)
        expect(s.container).not.toBe('other')
      }
    }
  })
})

// ── THE DEFERRAL, AS A TRIPWIRE RATHER THAN A COMMENT ─────────────────────
//
// ⚠️ A COMMENT SAYING "RE-OPEN LATER" IS READ ONCE AND THEN NEVER AGAIN.
// `shapeForGoal` is deliberately uncalled: wiring it costs 311ms on every
// generation (measured, sequential scan over `profile`) to serve ONE goal in
// seven. The header names the condition to re-open it. This turns that
// condition into something that FAILS when it is met, so the decision is
// revisited by CI rather than by somebody remembering.
describe('the deferral trigger — this test failing is GOOD NEWS', () => {
  it('still separates fewer than 4 of the 7 goals', () => {
    const decisive = VIDEO_GOALS.filter((g) => rankShapesForGoal(g, CORPUS).decisive)
    expect(
      decisive.length,
      `${decisive.length} goals now separate (${decisive.join(', ')}). If this is 4 or more on the`
      + ' REAL corpus, the trade in shapeForGoal.ts has changed: re-open the wiring, or move the'
      + ' corpus read to an aggregate refreshed by the assess job. Update CORPUS here first —'
      + ' this fixture is a 2026-09-09 snapshot, not live data.',
    ).toBeLessThan(4)
  })

  // ⚖️ AND THE FIXTURE MUST NOT SILENTLY BECOME THE ARGUMENT. If someone edits
  // CORPUS to make the tripwire pass, that is a fixture change, not a finding.
  // Pinning the snapshot's own shape makes such an edit visible in review.
  //
  // ⚠️ THIS PIN DID ITS JOB ON 2026-09-09 AND THE EDIT IS DECLARED HERE. The
  // fixture moved from the 2026-09-05 snapshot (601 profiles) to a re-measure at
  // 1,099. It was NOT edited to make a tripwire pass — the tripwire counts
  // decisive goals and the count is unchanged at one. It was edited because the
  // module's comment claimed `authority` sat at 1.96 SE when it had fallen to
  // 0.94, and a fixture that disagrees with its own module's stated measurement
  // is the two-authorities defect inside a test file.
  it('is measured against the 2026-09-09 snapshot, not an invented one', () => {
    expect(rankShapesForGoal('entertain', CORPUS).shapes[0])
      .toEqual({ container: 'story', transferable: 89 })
    expect(rankShapesForGoal('educate', CORPUS).shapes[0])
      .toEqual({ container: 'tutorial', transferable: 106 })
  })
})
