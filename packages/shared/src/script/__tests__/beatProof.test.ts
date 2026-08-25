import { describe, expect, it } from 'vitest'
import { shootingNote, shootingNoteAt } from '../beatProof'

/**
 * ⚠️ ALL TWENTY REAL PRODUCTION PROOFS, pinned. Twelve are things the creator
 * performs; eight ask for footage this product does not make. If the split ever
 * moves, one of these fails and somebody has to decide on purpose.
 */
const THE_CREATOR_PERFORMS = [
  'Creator looking directly into the lens with high energy, standing in a newly finished property.',
  'Creator stepping closer to the camera, lowering their voice slightly for a serious, coaching tone.',
  'Creator pointing directly at the camera, delivering the signature sign off.',
  'Intense eye contact and bold yellow text statement on screen.',
  'Aggressive hand gestures and fast zoom cuts.',
  'Straight to camera with large yellow text flashing instantly on screen.',
  'Camera pushes in slightly, creator holding intense eye contact.',
  'Quick jump cut to a slightly closer angle, maintaining direct address.',
  'Camera pulls back slightly to natural framing for the final takeaway.',
  'Straight to camera, tight framing.',
  'Straight to camera, wider framing to show hand gestures.',
  'Straight to camera, pointing directly at the lens.',
]

const SOMEBODY_ELSE_WOULD_FILM_IT = [
  'Fast paced visuals of an outdated house transforming into multiple modern private suites.',
  'Visuals of happy tenants or clean communal areas, reinforcing the affordable housing aspect.',
  'Visual graph showing a flatlined revenue chart.',
  'Contrasting text overlay crossing out a common guru phrase.',
  'Direct URL text burned onto the screen.',
  'Dynamic text pops up on screen emphasizing the word blame.',
  'Screen recording of a finger deleting a social media draft.',
  'B-roll of a boring, generic office cubicle setting.',
]

describe('what the creator performs is shown', () => {
  it.each(THE_CREATOR_PERFORMS)('shows: %s', (proof) => {
    expect(shootingNote(proof)).toBe(proof)
  })

  it('twelve of the twenty real proofs survive', () => {
    expect(THE_CREATOR_PERFORMS.filter((p) => shootingNote(p) !== null).length).toBe(12)
  })

  // ⚖️ RETURNED VERBATIM. The creator reads this while setting up a shot; a
  // reworded version is a different instruction.
  it('is not reworded, trimmed of meaning, or truncated', () => {
    const p = '  Straight to camera, tight framing.  '
    expect(shootingNote(p)).toBe('Straight to camera, tight framing.')
  })
})

describe('what somebody else would have to film is withheld', () => {
  it.each(SOMEBODY_ELSE_WOULD_FILM_IT)('withholds: %s', (proof) => {
    expect(shootingNote(proof)).toBeNull()
  })

  // ⚠️⚠️ THE TWO STANDING REFUSALS, IN REAL PRODUCTION DATA. Rendering the
  // field raw would instruct a creator to do exactly the two things this
  // product has decided it does not make.
  it('never asks for a screen recording', () => {
    expect(shootingNote('Screen recording of a finger deleting a social media draft.')).toBeNull()
    expect(shootingNote('Screen capture of the dashboard loading.')).toBeNull()
  })

  // ⚠️ THIS CASE EXISTS BECAUSE MUTATION TESTING CAUGHT THE GUARD BEING
  // REDUNDANT. Deleting 'screen recording' from the out-of-scope list left
  // every test green, because the two real proofs happen to mention no
  // performance either — so the SECOND rule was doing the work and the marker
  // was load-bearing for nothing. A note that names BOTH is the case that
  // needs the marker, and it had no test.
  it('withholds a screen recording even when the creator is also on camera', () => {
    expect(shootingNote('Screen recording of the dashboard, then straight to camera.')).toBeNull()
    expect(shootingNote('Creator points at the lens over a screen capture of the app.')).toBeNull()
  })

  it('never asks for b-roll', () => {
    expect(shootingNote('B-roll of a boring, generic office cubicle setting.')).toBeNull()
    expect(shootingNote('Stock footage of a city at night.')).toBeNull()
  })

  // ⚠️ ORDER IS THE RULE. A note can describe BOTH; the out-of-scope half must
  // win, or a b-roll instruction rides in on a legitimate one.
  it('a note that is half performance and half footage is withheld whole', () => {
    expect(shootingNote('Straight to camera, then b-roll of the empty office.')).toBeNull()
    expect(shootingNote('Creator points at the lens over visuals of the product.')).toBeNull()
  })
})

describe('nothing to act on', () => {
  it.each([
    ['a non-string', 7],
    ['null', null],
    ['undefined', undefined],
    ['an object', {}],
    ['an array', []],
    ['empty', ''],
    ['blank', '   '],
  ])('%s reads as no note', (_l, v) => {
    expect(shootingNote(v)).toBeNull()
  })

  // ⚖️ NEITHER LIST MATCHED IS SILENCE, NOT A COMPLAINT. A note we cannot
  // classify is simply absent — the creator loses nothing they had.
  it('an unclassifiable note is withheld without comment', () => {
    expect(shootingNote('Make it feel premium.')).toBeNull()
  })

  // ⚠️ ALSO FROM MUTATION TESTING. Replacing the type check with String(...)
  // left every test green, because String(7) matches nothing anyway. An ARRAY
  // is the input that breaks it: String(['Straight to camera']) is a perfectly
  // valid-looking note, so a coercion would render jsonb that was never a
  // string. THE TYPE CHECK MUST PRECEDE THE COERCION.
  it('an array that would coerce into a valid note is still not a note', () => {
    expect(shootingNote(['Straight to camera, tight framing.'])).toBeNull()
    expect(shootingNote({ toString: () => 'Straight to camera.' })).toBeNull()
  })
})

describe('reading it out of a stored beat_plan', () => {
  const plan = [
    { beat: 'Hook', proof: 'Straight to camera, tight framing.' },
    { beat: 'Setup', proof: 'B-roll of a boring, generic office cubicle setting.' },
  ]

  it('returns the filtered note for the beat at that index', () => {
    expect(shootingNoteAt(plan, 0)).toBe('Straight to camera, tight framing.')
    expect(shootingNoteAt(plan, 1)).toBeNull()
  })

  // ⚖️ ABSENT IS NOT EMPTY. 37 of 41 generations have no beat_plan at all.
  it.each([
    ['no plan', undefined],
    ['null', null],
    ['not an array', {}],
  ])('%s reads as no note', (_l, v) => {
    expect(shootingNoteAt(v, 0)).toBeNull()
  })

  it('an index past the end is not a crash', () => {
    expect(shootingNoteAt(plan, 9)).toBeNull()
  })
})
