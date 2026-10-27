// AN ANGLE ANSWER MUST COUNT (plan v7.1 WP1, Q1–Q4).
//
// ⚠️ FOUR SEPARATE DROPS, ONE SYMPTOM: she answered, and Twin asked again or
// wrote as if she had not.
//   Q1 the next angle plan read her answer back as an "unconfirmed claim";
//   Q2 an answered key was not closed, only skipped ones;
//   Q3 the answer was saved with no voice id, and the writer reads by voice;
//   Q4 with a product picked, her answer for THAT product failed a word match.
// The checks read the edge source, because that is the copy that runs.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { answerFactRow } from '../script/questionUsefulness'
import { itemFromCreatorKnowledge } from '../script/itemFormat'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const EDGE = readFileSync(join(REPO, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')
const angleBlock = (): string => {
  const start = EDGE.indexOf("if (specMode === 'angle_plan' || specMode === 'angle_answer')")
  const end = EDGE.indexOf("if (specMode === 'spec_questions'", start)
  expect(start, 'the angle block moved — re-anchor, do not delete').toBeGreaterThan(0)
  expect(end).toBeGreaterThan(start)
  return EDGE.slice(start, end)
}

describe('Q1: a typed, confirmed answer is her fact on the next plan', () => {
  it('the shared adapter still calls a claim unconfirmed, so the edge must override it', () => {
    const row = answerFactRow({ ownerId: 'o', key: 'mn:proof', piece: 'proof', answer: 'I tested it for a month.', now: '2026-01-01T00:00:00Z' })
    expect(row?.kind).toBe('claim')
    expect(itemFromCreatorKnowledge({ ...row, id: 'x' })?.status).toBe('unconfirmed')
  })
  it('the angle plan lets a stated, confirmed answer through', () => {
    expect(angleBlock()).toMatch(/it\.status === 'unconfirmed' && !answeredByHer\(r\)/)
    expect(EDGE).toMatch(/function answeredByHer[\s\S]{0,200}r\.basis === 'stated'[\s\S]{0,120}creator_confirmed_at/)
  })
})

describe('Q2: an answered key is never asked again', () => {
  it('answered outcomes close the key, like skips', () => {
    expect(angleBlock()).toMatch(/skippedKeys: rows\.filter\(\(r\) => [^\n]*r\.outcome === 'answered'/)
  })
})

describe('Q3: the answer is saved under her ready voice', () => {
  it('angle_answer passes a voice id, read from her ready brand voice', () => {
    expect(EDGE).toMatch(/answerFactRow\(\{[^}]*voiceId: [^,]*readyVoiceId\(sb, user\.id\)/)
    expect(EDGE).toMatch(/async function readyVoiceId[\s\S]{0,300}\.eq\('status', 'ready'\)/)
  })
})

describe('Q4: an answer typed for this product passes the off-ask test', () => {
  it('the relevantToAsk exemption covers asked:mn: rows for the chosen product only', () => {
    expect(EDGE).toMatch(/exempt: \(r\) => [\s\S]{0,300}answerForThisProduct\(r, /)
    expect(EDGE).toMatch(/function answerForThisProduct[\s\S]{0,250}startsWith\('asked:mn:'\)[\s\S]{0,150}r\.product_entity_id === productId/)
  })
})
