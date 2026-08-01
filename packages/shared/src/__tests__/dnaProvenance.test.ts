// The rule this file protects, from the build plan:
//
//   Inferred information may suggest, but it may not decide products, prices,
//   claims, audience truth, or offers.
//
// Until now that was a sentence in a document. These tests are what make it a
// property of the system — so they assert REFUSALS as hard as they assert
// happy paths, and each one names the real-world failure it prevents.
import { describe, it, expect } from 'vitest'
import {
  resolve, reconcile, assertDecidable, canDecide, isConflicted,
  isWellEvidenced, needsConfirmation, DnaProvenanceError,
  DECIDING_FIELDS, MIN_EVIDENCE_SEEN,
  type DnaFact,
} from '../dnaProvenance'

const DAY = '2026-08-01'
const said = <T>(value: T): DnaFact<T> => ({ value, source: 'user_answer', updated: DAY })
const saw = <T>(value: T, seen = 9, of = 12): DnaFact<T> =>
  ({ value, source: 'observed', evidence: { seen, of }, updated: DAY })
const guessed = <T>(value: T): DnaFact<T> => ({ value, source: 'inferred', updated: DAY })

describe('an inference may not decide what it may not decide', () => {
  it('refuses a guessed offer — the live defect this file exists for', () => {
    // TODAY: the synthesis prompt forbids blanks, so a creator whose captions
    // never mention what they sell gets an INVENTED offer, and that invented
    // offer writes the CTA on every video they make. Nothing can currently
    // tell it apart from one they typed.
    const err = (() => {
      try { resolve('offer', guessed('a $49/mo productivity app')); return null }
      catch (e) { return e as DnaProvenanceError }
    })()
    expect(err).toBeInstanceOf(DnaProvenanceError)
    expect(err!.code).toBe('dna_inferred_may_not_decide')
    expect(err!.field).toBe('offer')
  })

  it('refuses every deciding field, not just the one I thought of', () => {
    for (const field of DECIDING_FIELDS) {
      expect(() => resolve(field, guessed('x')), field).toThrow(DnaProvenanceError)
    }
  })

  it('CONTROL: the SAME value is fine when the creator supplied it', () => {
    // Proves the refusal is about PROVENANCE and not about the field or the
    // value — otherwise the guard could be rejecting something incidental.
    const r = resolve('offer', said('a $49/mo productivity app'))
    expect(r.value).toBe('a $49/mo productivity app')
    expect(r.source).toBe('user_answer')
  })

  it('CONTROL: an inference is fine on a field it is allowed to shape', () => {
    // Tone, pacing and vocabulary are exactly what inference is FOR. A guard
    // that blocked everything would be useless in a different way.
    expect(resolve('tone', guessed('direct, analytical')).value).toBe('direct, analytical')
    expect(resolve('audience_pain', guessed('cannot ship fast enough')).source).toBe('inferred')
  })

  it('observed material may decide — it is evidence, not a guess', () => {
    expect(resolve('audience', saw('non-technical founders')).source).toBe('observed')
  })

  it('canDecide answers without throwing, for callers that branch', () => {
    expect(canDecide('offer', guessed('x'))).toBe(false)
    expect(canDecide('offer', said('x'))).toBe(true)
    expect(canDecide('tone', guessed('x'))).toBe(true)
  })
})

describe('what the creator said beats what their posts show — without losing either', () => {
  const stated = said('startup founders')
  const observed = saw('students', 8, 12)
  const field = reconcile(stated, observed, (a, b) => a === b)

  it('is a conflict, holding both', () => {
    expect(isConflicted(field)).toBe(true)
  })

  it('resolves to what they SAID', () => {
    // "History is not destiny" — someone who has always taught students and
    // now wants founders must not be held to their archive.
    const r = resolve('audience', field)
    expect(r.value).toBe('startup founders')
    expect(r.hasDisagreement).toBe(true)
  })

  it('hands back what was set aside, so the disagreement can be SAID', () => {
    // Twin can only write "your content reads student-focused, and you told us
    // founders" while it still holds both. This is the whole point of not
    // collapsing to one value.
    const r = resolve('audience', field)
    expect(r.setAside?.value).toBe('students')
    expect(r.setAside?.source).toBe('observed')
  })

  it('MUTATION: agreement is NOT a conflict', () => {
    // A confirm prompt for something nobody disagrees about trains people to
    // dismiss the confirm screen, which is how the real ones get missed.
    const agreed = reconcile(said('founders'), saw('founders'), (a, b) => a === b)
    expect(isConflicted(agreed)).toBe(false)
    expect(resolve('audience', agreed).hasDisagreement).toBe(false)
  })

  it('no observation at all is not a conflict either', () => {
    expect(isConflicted(reconcile(said('founders'), null, (a, b) => a === b))).toBe(false)
  })

  it('sameness is the caller\'s to define — overlapping lists are not a disagreement', () => {
    const overlaps = (a: string[], b: string[]) => a.some((x) => b.includes(x))
    const f = reconcile(
      said(['talking head', 'software explanation']),
      saw(['talking head', 'lifestyle']),
      overlaps,
    )
    expect(isConflicted(f)).toBe(false)
  })

  it('a conflict on a deciding field still refuses an inferred STATED side', () => {
    // The stated side is normally user_answer. If it ever is not, the rule
    // must still hold — a conflict is not a way around it.
    const f = { stated: guessed('founders'), observed: saw('students') }
    expect(() => resolve('audience', f)).toThrow(DnaProvenanceError)
  })
})

describe('evidence is a count, never a score', () => {
  it('counts what supports an observation', () => {
    expect(saw('x', 9, 12).evidence).toEqual({ seen: 9, of: 12 })
  })

  it('one post out of twelve is noise, not a finding', () => {
    // Surfacing weak observations as disagreements is how the confirm screen
    // becomes the JSON audit nobody wanted.
    expect(isWellEvidenced(saw('x', 1, 12))).toBe(false)
    expect(isWellEvidenced(saw('x', MIN_EVIDENCE_SEEN, 12))).toBe(true)
  })

  it('refuses impossible counts rather than trusting them', () => {
    expect(isWellEvidenced(saw('x', 13, 12))).toBe(false)  // seen > of
    expect(isWellEvidenced(saw('x', 5, 0))).toBe(false)    // of = 0
    expect(isWellEvidenced(saw('x', -1, 12))).toBe(false)
    expect(isWellEvidenced(saw('x', 4.5, 12))).toBe(false) // not a count
  })

  it('a fact with no evidence is not an observation, whatever it claims', () => {
    expect(isWellEvidenced({ value: 'x', source: 'observed', updated: DAY })).toBe(false)
  })

  it('user answers and inferences are never "well evidenced"', () => {
    // The creator IS the evidence for what they said — the concept does not
    // apply. And an inference citing sources does not become an observation.
    expect(isWellEvidenced(said('x'))).toBe(false)
    expect(isWellEvidenced(guessed('x'))).toBe(false)
  })
})

describe('only what matters reaches the creator', () => {
  it('asks about a well-evidenced disagreement and a blocked guess, and nothing else', () => {
    const fields = {
      audience: reconcile(said('founders'), saw('students', 8, 12), (a, b) => a === b),
      offer: guessed('a $49/mo app'),
      tone: guessed('direct, analytical'),
      niche: saw('AI productivity'),
      vocabulary: said(['ship', 'leverage']),
      formats: reconcile(said(['talking head']), saw(['lifestyle'], 1, 12), (a, b) => a === b),
    }
    // audience: a real disagreement, 8 of 12. offer: a guess that may not
    // decide. formats: a disagreement seen once — noise, left alone.
    expect(needsConfirmation(fields)).toEqual(['audience', 'offer'])
  })

  it('asks nothing when everything is settled', () => {
    expect(needsConfirmation({
      offer: said('Twin, a video tool'),
      tone: guessed('direct'),
      niche: saw('AI productivity'),
    })).toEqual([])
  })
})

describe('assertDecidable is usable before a plan is built, not only during', () => {
  it('throws on the same condition resolve does', () => {
    expect(() => assertDecidable('offer', guessed('x'))).toThrow(DnaProvenanceError)
    expect(() => assertDecidable('offer', said('x'))).not.toThrow()
    expect(() => assertDecidable('tone', guessed('x'))).not.toThrow()
  })
})
