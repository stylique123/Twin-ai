// A TICK IS A STATEMENT OF FACT.
//
// These assert the two properties that matter and nothing else: every claim
// that ships is TRUE of the script it was derived from, and no claim survives
// from the model's original list, which describes the reference video.
import { describe, it, expect } from 'vitest'
import { syncWhyItWorksToScript, MAX_CLAIMS } from '../whyItWorksSync'

const REFERENCE_CLAIMS = [
  'The creator opens with a personal loss, which buys the next ten seconds.',
  'The lead magnet in the caption converts the comment section.',
]

describe('why it works describes the script that ships', () => {
  it('carries not one word of the model\'s reference-describing prose', () => {
    // ⚠️ THE WHOLE POINT. Run B's shipped CTA says "save this" while its
    // reference read describes a lead magnet; a tick claiming the lead magnet
    // sits beside the creator's own script with a green check next to it.
    const { whyItWorks, dropped } = syncWhyItWorksToScript(REFERENCE_CLAIMS, [
      { section: 'Hook', line: 'Most home studios fail for one boring reason' },
      { section: 'Setup', line: 'It is never the camera. It is the room.' },
      { section: 'CTA', line: 'Save this for the next time you set up.' },
    ])
    expect(dropped).toBe(2)
    for (const original of REFERENCE_CLAIMS) {
      expect(whyItWorks).not.toContain(original)
    }
    expect(whyItWorks.some((c) => /lead magnet/i.test(c))).toBe(false)
  })

  it('never claims a short hook for a long one', () => {
    const long = syncWhyItWorksToScript(null, [
      {
        section: 'Hook',
        line: 'I want to talk to you today about something that I think a lot of people'
          + ' get wrong when they are first starting out with this whole thing',
      },
      { section: 'CTA', line: 'Follow for more.' },
    ])
    expect(long.whyItWorks.some((c) => /lands before anyone decides/.test(c))).toBe(false)

    const short = syncWhyItWorksToScript(null, [
      { section: 'Hook', line: 'Your room is the problem, not your mic' },
      { section: 'CTA', line: 'Follow for more.' },
    ])
    expect(short.whyItWorks.some((c) => /lands before anyone decides/.test(c))).toBe(true)
  })

  it('claims the question only when the hook actually asks one', () => {
    const asks = syncWhyItWorksToScript(null, [
      { section: 'Hook', line: 'Why does your audio sound cheap?' },
      { section: 'CTA', line: 'Follow for more.' },
    ])
    expect(asks.whyItWorks.some((c) => /open on a question/.test(c))).toBe(true)

    const states = syncWhyItWorksToScript(null, [
      { section: 'Hook', line: 'Your audio sounds cheap for one reason.' },
      { section: 'CTA', line: 'Follow for more.' },
    ])
    expect(states.whyItWorks.some((c) => /open on a question/.test(c))).toBe(false)
  })

  it('counts a spelled-out number as a number', () => {
    // "three ways" names a size exactly as much as "3 ways"; checking digits
    // alone would call the commoner spelling a miss.
    const spelled = syncWhyItWorksToScript(null, [
      { section: 'Hook', line: 'Three things ruin home audio' },
      { section: 'CTA', line: 'Follow for more.' },
    ])
    expect(spelled.whyItWorks.some((c) => /names a number/.test(c))).toBe(true)
  })

  it('never praises the pace, at any beat length', () => {
    // ⚠️ THE CLAIM PRAISED THE VIOLATION IT EXISTED TO CATCH. It fired whenever
    // the longest beat was <= 40 words, so a 21-word opener — reported from
    // production — was ticked as a virtue. 40 words is about SIXTEEN SECONDS on
    // one beat at the recorder's own WPM, so a sentence claiming the pace "never
    // stalls" was gated on a threshold permitting a sixteen-second stall.
    //
    // ⚖️ PINNED AT THREE LENGTHS, not just the long one. The old test only
    // checked silence at 55 words — above the threshold — so it would have
    // passed unchanged while the defect shipped. The 21-word case is the one
    // that was actually wrong, and a guard that misses it is not a guard.
    for (const n of [7, 21, 55]) {
      const r = syncWhyItWorksToScript(null, [
        { section: 'Hook', line: Array.from({ length: n }, () => 'word').join(' ') },
        { section: 'CTA', line: 'Follow for more.' },
      ])
      expect(
        r.whyItWorks.some((c) => /pace never stalls|No single beat runs longer/.test(c)),
        `a pace claim came back for a ${n}-word beat`,
      ).toBe(false)
    }
  })

  it('still says something about a real script, so the panel is never empty', () => {
    // Removing a claim must not empty the panel — claim 7 is the floor.
    const { whyItWorks } = syncWhyItWorksToScript(null, [
      { section: 'Hook', line: 'Three things ruin home audio' },
      { section: 'CTA', line: 'Save this for later.' },
    ])
    expect(whyItWorks.length).toBeGreaterThan(0)
  })

  it('an empty script produces an empty panel, never a reassuring one', () => {
    // ⚖️ Fix 5's doctrine, applied here: nothing to say and a tick saying
    // something are not equally wrong.
    const { whyItWorks, dropped } = syncWhyItWorksToScript(REFERENCE_CLAIMS, [])
    expect(whyItWorks).toEqual([])
    expect(dropped).toBe(2)
  })

  it('every claim it makes is checkable against the script it was given', () => {
    // The totality guard. Each shipped claim must quote a number that the
    // script actually has, or name a property the script actually shows.
    const script = [
      { section: 'Hook', line: 'Three things ruin home audio' },
      { section: 'Re-hook', line: 'And here is the part nobody mentions.' },
      { section: 'CTA', line: 'Save this for later.' },
    ]
    const { whyItWorks } = syncWhyItWorksToScript(null, script)
    expect(whyItWorks.length).toBeGreaterThan(0)
    expect(whyItWorks.length).toBeLessThanOrEqual(MAX_CLAIMS)

    // ⚠️ THE ALLOWED SET IS DERIVED FROM THE SCRIPT, NOT HAND-LISTED. A first
    // version enumerated the numbers it expected and missed the CTA's own word
    // count, so it failed a correct claim. A guard that needs updating whenever
    // a true claim is added is a guard that will be loosened rather than read.
    const wordCounts = script.map((b) => b.line.trim().split(/\s+/).length)
    const measurable = new Set<number>([
      ...wordCounts,                       // any beat's own length
      Math.max(...wordCounts),             // the longest
      script.length,                       // the beat count
    ])
    for (const claim of whyItWorks) {
      for (const n of claim.match(/\d+/g) ?? []) {
        expect(
          measurable.has(Number(n)),
          `claim quotes a number nothing in the script measures: ${claim}`,
        ).toBe(true)
      }
    }
  })
})
