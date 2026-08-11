// WHICH ANSWER WINS — and the one case where a fallback would undo a decision.
import { describe, expect, it } from 'vitest'
import {
  resolveProductEvidence, productEvidenceState, type ProductEvidence,
} from '../productEvidence'

const CAPTURE: ProductEvidence = {
  form: 'link',
  linkRole: 'on_screen',
  sections: [{ order: 1, label: 'Pricing — three tiers, cheapest is free' }],
} as ProductEvidence

describe('entity evidence beats the brief, except when it says nothing', () => {
  it('an unanswered entity defers to the brief — the migration path', () => {
    // Creators who answered before the column moved must not lose their answer.
    expect(resolveProductEvidence(null, CAPTURE)).toBe(CAPTURE)
    expect(resolveProductEvidence(undefined, CAPTURE)).toBe(CAPTURE)
  })

  it('an answered entity wins over a stale brief', () => {
    expect(resolveProductEvidence(CAPTURE, 'declined')).toBe(CAPTURE)
  })

  it('DECLINED IS AN ANSWER and never falls through to a capture', () => {
    // ⚖️ The expensive direction. "There is nothing to show" is a decision the
    // creator made; a fallback that reaches past it hands back a capture they
    // withdrew, and the writer puts it on screen.
    expect(resolveProductEvidence('declined', CAPTURE)).toBe('declined')
    expect(productEvidenceState(resolveProductEvidence('declined', CAPTURE))).toBe('declined')
  })

  it('nothing anywhere stays nothing, and reads as unanswered', () => {
    // Not 'declined'. Silence must never be read as a refusal either.
    expect(productEvidenceState(resolveProductEvidence(null, null))).toBe('unanswered')
  })
})
