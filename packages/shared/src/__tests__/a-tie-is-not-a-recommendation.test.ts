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
        goals: [goal as never],
      })
    }
  }
  return out
}

// ⚠️ THE REAL COUNTS, MEASURED 2026-09-05 over the assessed corpus. The point of
// using them rather than round numbers is that two of these goals are decided
// and one is a tie, and only real data has that texture.
const CORPUS = rows([
  ['tutorial', 'education', 94], ['numbered_list', 'education', 77], ['framework', 'education', 57],
  ['numbered_list', 'growth', 62], ['tutorial', 'growth', 58], ['story', 'growth', 57],
  ['story', 'entertainment', 60], ['tutorial', 'entertainment', 17], ['reaction', 'entertainment', 15],
  ['framework', 'authority', 51], ['numbered_list', 'authority', 33],
  ['tutorial', 'sales', 13], ['problem_solution', 'sales', 10],
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
  // ⚠️ 60 vs 17 is 4.9 standard errors. This is the only goal on today's corpus
  // where the leading container is distinguishable from the runner-up.
  it('entertainment resolves to story', () => {
    const r = rankShapesForGoal('entertain', CORPUS)
    expect(r.shapes[0]).toEqual({ container: 'story', transferable: 60 })
    expect(r.decisive).toBe(true)
    expect(shapeForGoal('entertain', CORPUS)).toBe('story')
  })

  // ⚠️ THE ONE THAT LOOKS LIKE A RESULT AND IS NOT. 94 against 77 is a
  // seventeen-reference lead out of 171 — 1.3 standard errors. My first draft
  // of this module shipped a ratio threshold chosen by eye that called this
  // decisive; the ratio had been fitted to the answer I expected.
  it('education RANKS tutorial first but refuses to recommend it', () => {
    const r = rankShapesForGoal('educate', CORPUS)
    expect(r.corpusGoal).toBe('education')
    expect(r.shapes[0]).toEqual({ container: 'tutorial', transferable: 94 })
    expect(r.decisive).toBe(false)
    expect(shapeForGoal('educate', CORPUS)).toBeNull()
  })

  // ⚖️ A NEAR MISS STAYS A MISS. 51 against 33 is 1.96 SE, just under the bar.
  // Moving the bar to admit it is how a threshold becomes a preference.
  it('authority misses the bar and is not rounded up to it', () => {
    expect(rankShapesForGoal('authority', CORPUS).decisive).toBe(false)
    expect(shapeForGoal('authority', CORPUS)).toBeNull()
  })
})

describe('a tie is not a recommendation', () => {
  // ⚠️ 62 / 58 / 57. Naming numbered_list "the shape for growth" would be
  // reporting a four-reference gap as a finding.
  it('growth ranks but does not recommend', () => {
    const r = rankShapesForGoal('followers', CORPUS)
    expect(r.corpusGoal).toBe('growth')
    expect(r.shapes.map((s) => s.container)).toEqual(['numbered_list', 'tutorial', 'story'])
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
