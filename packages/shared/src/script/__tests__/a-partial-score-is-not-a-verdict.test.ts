import { describe, it, expect } from 'vitest'
import { syncWhyItWorksToScript, MAX_CLAIMS } from '../whyItWorksSync.js'

/**
 * ⚠️ MEASURED IN PRODUCTION, generation 4608dc73: a SEVEN-beat script whose
 * panel read "It runs 2 spoken beats, each doing one job." Five beats were
 * unanswered asks carrying no line. Every number was true of the beats that
 * had words, and the sentence was still false about the script.
 */
const HOOK = { section: 'Hook', line: 'Three reasons your launch stalled.' }
const CTA = { section: 'CTA', line: 'Follow if you want the rest of this.' }
const ASK = { section: 'Body', line: '' }

describe('a partial script is scored, and says so', () => {
  it('leads with the denominator when beats are unanswered', () => {
    const r = syncWhyItWorksToScript([], [HOOK, ASK, ASK, ASK, ASK, ASK, CTA])
    expect(r.whyItWorks[0]).toMatch(/Scored on the 2 beats you have words for/)
    expect(r.whyItWorks[0]).toMatch(/other 5 are waiting on your answers/)
  })

  it('never claims a bare beat count when the script is partial', () => {
    // ⚠️ THIS FIXTURE IS CHOSEN SO THE COUNT SENTENCE IS ACTUALLY REACHED.
    // The obvious fixture (short numbered hook + CTA) produces four other
    // claims, which fill MAX_CLAIMS alongside the disclosure — so the count
    // never renders and an assertion that it is absent passes for the wrong
    // reason. That version of this test survived the mutation that restored
    // the shipped sentence, which is how it was caught.
    //   long hook  -> no length claim   no number -> no enumeration claim
    //   no CTA section -> no close claim
    const LONG = { section: 'Hook', line: 'This opening line deliberately keeps going well past the short cutoff so it earns no praise.' }
    const BODY = { section: 'Body', line: 'A written middle beat.' }
    const r = syncWhyItWorksToScript([], [LONG, ASK, ASK, BODY])
    const joined = r.whyItWorks.join(' | ')
    expect(joined).toMatch(/written beats of 4/)      // the count IS rendered
    expect(joined).not.toMatch(/spoken beats/)        // and never bare
  })

  it('says nothing about pending beats when every beat has words', () => {
    const r = syncWhyItWorksToScript([], [HOOK, { section: 'Body', line: 'A real middle beat with words in it.' }, CTA])
    const joined = r.whyItWorks.join(' | ')
    expect(joined).not.toMatch(/waiting on your answers/)
    expect(joined).not.toMatch(/of 3 so far/)
  })

  it('singular reads as English, not as a template', () => {
    const r = syncWhyItWorksToScript([], [HOOK, ASK, CTA])
    expect(r.whyItWorks[0]).toMatch(/other 1 is waiting/)
  })

  it('the panel never grows past its budget to fit the disclosure', () => {
    const r = syncWhyItWorksToScript([], [HOOK, ASK, ASK, ASK, ASK, ASK, CTA])
    expect(r.whyItWorks.length).toBeLessThanOrEqual(MAX_CLAIMS)
  })

  it('an entirely unwritten script still says nothing rather than something false', () => {
    const r = syncWhyItWorksToScript([], [ASK, ASK, ASK])
    expect(r.whyItWorks).toEqual([])
  })
})
