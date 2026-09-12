// NINE OF TEN RUNS SHARED ONE PREMISE, AND THE CAUSE WAS UPSTREAM OF THE WRITER.
//
// ⚠️ THE OWNER'S MEASUREMENT, AND THE DIAGNOSIS IT FORCES. A creator picked
// "Launch it" or "Explain what it does" or "Say why I made it" — and every one
// of them was then asked the SAME generic claims question. The writer received
// the same material each time and, reasonably, wrote the same video with a
// different last line. No prompt change can fix that: the INPUT never changed.
//
// ⚖️ SO THE OBJECTIVE SELECTS THE QUESTION, and it does so by changing which
// sentence is asked for a field whose reader has been live for months
// (`answers.claims`). A new field would have needed a new server reader and a
// migration, and would have been this repo's standing defect — something
// written that nothing reads.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { assessReadiness, claimsQuestionFor } from '../generationReadiness'
import { OBJECTIVE_QUESTIONS, objectiveQuestion } from '../productObjectiveQuestion'
import { PRODUCT_OBJECTIVES } from '../videoIntent'

const repo = join(import.meta.dirname, '..', '..', '..', '..')

/** A promoting product build with no facts on record — the state that escalates
 *  `claims`, which is the only state in which any of this is visible. */
const build = (objective: string | null) => ({
  goal: 'sell', audience: 'founders', angle: 'why retainers beat projects',
  offer: 'Candle Kit', relationship: 'OWN_PRODUCT', cta: 'book a call',
  productFacts: [] as readonly string[], referenceRead: true, hasCreatorKnowledge: true,
  objective,
})

const claimsQ = (objective: string | null) =>
  assessReadiness(build(objective)).fields.find((f) => f.field === 'claims')?.question ?? null

describe('the fixture is real, or everything below passes vacuously', () => {
  it('claims actually escalates, so there is a question to compare', () => {
    const c = assessReadiness(build('sell')).fields.find((f) => f.field === 'claims')
    expect(c?.state).toBe('MISSING_REQUIRED')
    expect(c?.question).toBeTruthy()
  })
})

describe('every objective asks its own question', () => {
  // ⚠️ THE ASSERTION THE WHOLE BUILD EXISTS FOR. Before this, all five of these
  // returned one string.
  it('no two objectives are handed the same sentence', () => {
    const asked = PRODUCT_OBJECTIVES.map((o) => claimsQ(o.value))
    expect(asked.every((q) => typeof q === 'string' && q !== '')).toBe(true)
    expect(new Set(asked).size, `asked: ${JSON.stringify(asked)}`).toBe(PRODUCT_OBJECTIVES.length)
  })

  it('every objective on the sheet has one — none falls through', () => {
    // ⚖️ A SHEET ENTRY WITH NO QUESTION would silently get the generic wording
    // and rejoin the identical-script population without anything going red.
    for (const o of PRODUCT_OBJECTIVES) {
      expect(objectiveQuestion(o.value), o.label).toBeTruthy()
    }
  })

  it('each records why only that objective needs it', () => {
    // The reason is part of the data so a future edit argues with it rather
    // than overwriting a bare string.
    for (const [k, v] of Object.entries(OBJECTIVE_QUESTIONS)) {
      expect(v!.because.length, k).toBeGreaterThan(40)
    }
  })

  it('asks for material, never for a judgement about her audience', () => {
    // ⚖️ THE LINE THE OWNER DREW ON THE NICHE QUESTIONS, HELD HERE TOO. Twin may
    // ask what people misunderstand. It may never assert what her audience
    // believes and hand it back to her as her own answer.
    for (const [k, v] of Object.entries(OBJECTIVE_QUESTIONS)) {
      expect(v!.question, k).toMatch(/\?$/)
      expect(v!.question, k).not.toMatch(/your audience (believes|thinks|wants)/i)
      // Plain English: our internal words never reach her.
      expect(v!.question, k).not.toMatch(/objective|canonical|entity|corpus|beat/i)
    }
  })
})

describe('an objective changes the question and nothing else', () => {
  // ⚠️ THE NEGATIVE CONTROLS. An objective says what the video must DO. It does
  // not thereby say what the script may CLAIM about the product — which is the
  // entire reason the question is still asked.
  it('does not resolve claims, so she is still asked', () => {
    for (const o of PRODUCT_OBJECTIVES) {
      expect(assessReadiness(build(o.value)).fields
        .find((f) => f.field === 'claims')?.state, o.value).toBe('MISSING_REQUIRED')
    }
  })

  it('does not make a non-commercial video promoting', () => {
    const v = assessReadiness({
      goal: 'build authority', angle: 'a hot take', hasCreatorKnowledge: true, objective: 'educate',
    })
    for (const f of ['offer', 'relationship', 'claims'] as const) {
      expect(v.fields.find((x) => x.field === f)?.state, f).toBe('RESOLVED')
    }
  })

  it('leaves every other field on its generic wording', () => {
    const v = assessReadiness({ ...build('educate'), offer: null, relationship: null })
    const offerQ = v.fields.find((f) => f.field === 'offer')?.question
    if (offerQ) expect(offerQ).toBe('Which product or offer should this video point at?')
  })
})

describe('falling back is a real question, not a hole', () => {
  it('an unknown objective gets the named claims wording', () => {
    expect(claimsQ('a value nobody has shipped')).toBe(claimsQuestionFor('Candle Kit'))
  })

  it('no objective at all — every non-product build — is untouched', () => {
    expect(claimsQ(null)).toBe(claimsQuestionFor('Candle Kit'))
    expect(objectiveQuestion(null)).toBeNull()
    expect(objectiveQuestion('')).toBeNull()
    expect(objectiveQuestion('   ')).toBeNull()
  })
})

describe('the caller passes it, and only in the product door', () => {
  const src = readFileSync(join(repo, 'apps', 'web', 'src', 'pages', 'v2', 'V2Building.tsx'), 'utf8')

  it('passes the objective into assessReadiness', () => {
    expect(src).toMatch(/objective:\s*isProductSubject\s*\?/)
  })

  // ⚠️ THE GATE IS THE POINT, NOT DECORATION. `intentQuestionsFor` substitutes
  // PRODUCT_OBJECTIVES onto the SAME `video_goal` field, so an ungated read
  // would hand a product question to a creator who picked a generic goal that
  // happens to spell `educate`.
  it('never reads video_goal as an objective outside the product door', () => {
    expect(src).not.toMatch(/objective:\s*answersRef\.current\.video_goal/)
  })
})

describe('the edge asks the same questions — one authority, not two', () => {
  // ⚖️ THE EDGE CANNOT IMPORT THIS (Deno, no @twinai/shared) so the copy stays.
  // What must not stay is the copies disagreeing — the same guard that caught a
  // real divergence on the claims wording hours before this was written.
  const edge = readFileSync(
    join(repo, 'supabase', 'functions', 'generate-blueprint', 'index.ts'), 'utf8')

  it('carries its inlined twin', () => {
    expect(edge).toContain('READY_OBJECTIVE_QUESTIONS')
  })

  it('every sentence is byte-identical to the shared one', () => {
    for (const [k, v] of Object.entries(OBJECTIVE_QUESTIONS)) {
      expect(edge, k).toContain(`${k}: '${v!.question}'`)
    }
  })

  // ⚠️ AND THE EDGE GATES IT ON A PRODUCT BUILD TOO. Identical sentences applied
  // to a different population is still two behaviours.
  it('applies them only when the build has a product', () => {
    expect(edge).toMatch(/const readyObjective =[\s\S]{0,200}mentioned_product_id/)
  })
})
