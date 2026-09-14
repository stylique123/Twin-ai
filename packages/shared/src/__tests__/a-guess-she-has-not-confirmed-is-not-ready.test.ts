// "READY" OVER TWO SENTENCES TWIN WROTE FOR ITSELF.
//
// ⚠️⚠️ THE SAME FAILURE `hasConfirmedCta` EXISTS TO STOP, IN A NEW FIELD. Its own
// rule: "the meter must not tick off a sentence Twin wrote for itself" — which is
// how the old palette meter came to report brand colours nobody chose.
// `audience_pain` and `dream_outcome` are READ FROM HER OWN POSTS, which makes
// them a good guess and still a guess.
//
// ⚠️ AND THE CARD GAVE HER NO REASON TO OPEN IT. It said "Ready" with two
// questions sitting inside, so a creator would never tap it, the confirmations
// would stay unconfirmed forever, and the writer would keep treating them as
// guesses rather than as things she has said.
import { describe, expect, it } from 'vitest'
import { setupAreas, type SetupInput } from '../setupAreas'

/** A profile with nothing missing, so the only thing moving the state is the
 *  pending count. */
const COMPLETE: SetupInput = {
  // Every gap `contentProfile` counts, filled — so the ONLY thing that can move
  // the state below is the pending count.
  answers: {
    audience: 'busy families',
    workKind: 'service',
    contentGoals: ['sell'],
    desiredFormats: ['talking_head'],
    commercialTies: ['own_product'],
  } as unknown as SetupInput['answers'],
  dnaReady: true,
  dnaConfirmed: true,
  cta: 'Book a tasting',
  productCount: 1,
}
const area = (input: SetupInput) =>
  setupAreas(input).find((a) => a.id === 'content_profile')!

describe('three states, not two', () => {
  it('nothing pending is Ready', () => {
    const a = area({ ...COMPLETE, audienceFactsPending: 0 })
    expect(a.state).toBe('ready')
    expect(a.pending).toBeUndefined()
  })

  it('⚠️ guesses waiting is NOT Ready', () => {
    const a = area({ ...COMPLETE, audienceFactsPending: 2 })
    expect(a.state).not.toBe('ready')
    expect(a.state).toBe('needs_review')
    expect(a.pending).toBe(2)
  })

  it('and a missing answer still outranks a pending guess', () => {
    // Nothing stored is a bigger gap than something unconfirmed; a card that
    // said "2 to confirm" while her audience was blank would hide the real work.
    const a = area({
      ...COMPLETE,
      answers: { ...(COMPLETE.answers as object), audience: '' } as unknown as SetupInput['answers'],
      audienceFactsPending: 2,
    })
    expect(a.state).toBe('needs_setup')
  })
})

describe('the count is never rendered as a lie', () => {
  it('zero carries no badge at all', () => {
    expect(area({ ...COMPLETE, audienceFactsPending: 0 }).pending).toBeUndefined()
  })

  it('absent and null behave as zero', () => {
    expect(area({ ...COMPLETE }).state).toBe('ready')
    expect(area({ ...COMPLETE, audienceFactsPending: null }).state).toBe('ready')
  })

  it('⚠️ a negative or broken count never becomes a badge', () => {
    // It arrives from a caller that counted rows. "-1 to confirm" must not reach
    // a creator.
    for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const a = area({ ...COMPLETE, audienceFactsPending: bad })
      expect(a.state, `${bad} moved the state`).toBe('ready')
      expect(a.pending).toBeUndefined()
    }
  })

  it('a fractional count is floored, not shown as a fraction', () => {
    expect(area({ ...COMPLETE, audienceFactsPending: 2.7 }).pending).toBe(2)
  })
})

describe('it does not disturb the card that already had three states', () => {
  it('creator_dna is unaffected by the pending count', () => {
    const withPending = setupAreas({ ...COMPLETE, audienceFactsPending: 2 })
      .find((a) => a.id === 'creator_dna')!
    const without = setupAreas({ ...COMPLETE, audienceFactsPending: 0 })
      .find((a) => a.id === 'creator_dna')!
    expect(withPending.state).toBe(without.state)
    expect(withPending.pending).toBeUndefined()
  })
})
