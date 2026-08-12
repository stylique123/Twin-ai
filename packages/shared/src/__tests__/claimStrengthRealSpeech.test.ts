// THE DETECTOR, MEASURED AGAINST SPEECH IT DID NOT AUTHOR.
//
// ⚠️ `claimStrength` decides, in production, whether a beat needs
// experience-level evidence. Its original tests used sentences I wrote, in the
// shapes the pattern already matched — so it scored 17/37 on the first real
// transcripts, missing 20 first-person claims and zero of the honest lines.
// Every failure was under-detection, which in production means a fabricated
// personal history waved through on coverage-only evidence.
import { describe, expect, it } from 'vitest'
import { claimStrength } from '../claimEntitlement'
import { REAL_SPEECH } from './fixtures/realSpeech'
import { HELD_OUT_SPEECH } from './fixtures/heldOutSpeech'

describe('claimStrength against 37 real, hand-labelled lines', () => {
  for (const l of REAL_SPEECH) {
    it(`${l.expect.padEnd(10)} ${l.text.slice(0, 62)}`, () => {
      expect(claimStrength(l.text), l.because ?? '').toBe(l.expect)
    })
  }

  it('never escalates a narration line — the expensive false positive', () => {
    // ⚖️ THE ASYMMETRY. A missed claim ships one fabrication. A false positive
    // escalates an honest beat into a question, and a script full of questions
    // is refunded — so a widening that catches narration costs more than the
    // gap it closes.
    const narration = REAL_SPEECH.filter((l) => l.expect === 'discussion')
    expect(narration.length).toBeGreaterThan(8)
    for (const l of narration) expect(claimStrength(l.text), l.text).toBe('discussion')
  })

  it('the fixture is real speech, not sentences written to pass', () => {
    // The failure this file exists for. If someone adds invented lines the
    // corpus stops being a ruler.
    for (const l of REAL_SPEECH) expect(['transcript', 'generated']).toContain(l.source)
    expect(REAL_SPEECH.filter((l) => l.source === 'transcript').length).toBeGreaterThan(15)
  })
})

// ── THE HELD-OUT SET: DOES ANY OF THIS GENERALISE? ───────────────────────────
describe('claimStrength on two creators it was never tuned against', () => {
  it('reports the score and holds a floor, because 39/39 in-sample proved nothing', () => {
    // ⚠️ 39/39 on the tuned set, 14/25 here. That gap IS the finding: an
    // in-sample score is not evidence a detector generalises. The floor stops
    // regression; raising it is a real change and needs its blast radius
    // measured against the stored runs first.
    const ok = HELD_OUT_SPEECH.filter((l) => claimStrength(l.text) === l.expect).length
    // eslint-disable-next-line no-console
    console.log(`      held-out generalisation: ${ok}/${HELD_OUT_SPEECH.length}`)
    expect(ok).toBeGreaterThanOrEqual(29)
  })

  it('still never escalates a narration line on unseen data', () => {
    // The floor that actually protects creators: under-detection ships one bad
    // line, over-detection refunds a good script.
    for (const l of HELD_OUT_SPEECH.filter((x) => x.expect === 'discussion')) {
      expect(claimStrength(l.text), l.text).toBe('discussion')
    }
  })
})

// ── THE APOSTROPHE THAT WAVED EVERY CLAIM THROUGH ────────────────────────────
//
// ⚠️ EVERY LINE IN THIS BLOCK USES U+2019, VERBATIM AS THE WRITER EMITTED IT.
// Do not "tidy" them to straight quotes — the curl IS the test. The patterns
// spell contractions with U+0027, the writer emits U+2019 whenever it feels
// like prose, and 29 of 705 beats in the last matrix carry one.
//
// ⚖️ WHY THIS HID FOR SO LONG. The fixtures were typed by hand with straight
// quotes, so a detector measured only against text we wrote passed cleanly
// while missing real output — which is the exact failure `realSpeech.ts` was
// created to prevent, reappearing one layer down as an encoding assumption.
describe('a typographic apostrophe is not a different claim', () => {
  it('classifies the curly and straight forms identically', () => {
    for (const [curly, straight] of [
      ['I’ve been using this for months.', "I've been using this for months."],
      ['I’m going to show you three things.', "I'm going to show you three things."],
      ['I’d never buy a Chromebook.', "I'd never buy a Chromebook."],
      ['I don’t know if any of you have tried this.', "I don't know if any of you have tried this."],
    ]) {
      expect(claimStrength(curly), curly).toBe(claimStrength(straight))
    }
  })

  it('the corpus line this was found from is a history, not discussion', () => {
    // Verbatim from matrix-112. It read `discussion` — meaning "carries no claim
    // about this person" — and in production that is what licenses a beat to
    // speak on coverage-only evidence.
    expect(claimStrength('This is easily the most insane tech I’ve seen all year, no contest.'))
      .toBe('history')
  })

  it('does not turn narration into a claim on the way past', () => {
    // The normalisation must fix the miss without moving anything else: these
    // are the same false-positive set the widening was measured against.
    expect(claimStrength('This is the MOST underrated product you should be selling. And I’m going to show you.'))
      .toBe('discussion')
    expect(claimStrength('I’ll have the link in the description.')).toBe('discussion')
  })
})
