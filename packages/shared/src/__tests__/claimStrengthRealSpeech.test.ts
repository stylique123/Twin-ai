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

// ── THE THREE MISSES I DECLINED TO RUSH, NOW MEASURED ────────────────────────
//
// ⚠️ RARE AND SEVERE, AND BOTH HALVES DECIDE THIS. Across 2,857 beats in four
// runs these fire three times: 0.07% and 0.04%. Each one was scored
// `discussion` — "carries no claim about this person" — which is the verdict
// that lets a beat speak on coverage-only evidence.
//
// ⚖️ A PATTERN EARNS ITS PLACE BY WHAT IT CATCHES, NOT BY HOW OFTEN. A claimed
// career is the most expensive thing this file can miss, and it appeared on a
// line a creator would read to camera.
describe('stances and credentials the detector used to wave through', () => {
  it('reads "my take is" and "my answer is" as positions', () => {
    // Verbatim from the corpus.
    expect(claimStrength('My take is that Rockstar indeed lost the plot with GTA 6.')).toBe('position')
    expect(claimStrength("My answer is yes, for most people, it's actually the smarter move right now.")).toBe('position')
  })

  it('reads a claimed career as a history', () => {
    // Verbatim. It invents a business history for whoever reads it.
    expect(claimStrength("Look, as someone who's built stores and made viral AI ads, I can tell you, that promise? It's usually clickbait."))
      .toBe('history')
    expect(claimStrength('as someone who has spent ten years in professional kitchens')).toBe('history')
  })

  it("does NOT read \"who's <adjective>\" as a career", () => {
    // ⚠️ `who's` IS AMBIGUOUS AND THIS IS THE FALSE POSITIVE IT WOULD CAUSE.
    // "who's built" is HAS built; "who's passionate about tech" is IS
    // passionate — a self-description, not a life event. Reading the
    // contraction as perfect everywhere would fabricate a history out of every
    // ordinary introduction.
    expect(claimStrength("as someone who's passionate about tech, this update excites me"))
      .not.toBe('history')
    expect(claimStrength("as someone who's really into 3D printing")).not.toBe('history')
  })

  it('moves nothing else: the false-positive set is untouched', () => {
    // The widening is worth having only if it costs nothing. These are the
    // narration lines the whole file is calibrated against.
    for (const l of [
      "In this video, I'm going to be breaking down the top seven products.",
      "I'll have the link in the description.",
      'Let us talk about what actually changed in this update.',
      'Most people leave Smart HDR on auto.',
    ]) expect(claimStrength(l), l).toBe('discussion')
  })
})
