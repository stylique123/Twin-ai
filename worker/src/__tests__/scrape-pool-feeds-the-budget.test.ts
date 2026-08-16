// THE TRANSCRIPT BUDGET CANNOT BE SPENT ON VIDEOS NOBODY SCRAPED.
//
// ⚠️ MEASURED IN PRODUCTION, NOT REASONED ABOUT. A TikTok scan carrying
// FREE_TRANSCRIPT_BUDGET = 25 reported `videos_offered: 12`. The budget was
// raised, shipped, deployed and instrumented — and capped the whole time by a
// default argument in a different file: `scrape_dna` called
// `scrapeProfile(handle, platform)` and that parameter defaults to 12.
//
// The cost of that is not only unspent budget. `selectVideosToTranscribe`
// chooses across four axes — reach, stance, recency, density — and every axis is
// inert when the candidate count is at or below the budget, because taking all
// of them is the only available move. The stance axis exists specifically to
// find videos carrying a POSITION rather than a spectacle, and it can only do
// that when it is allowed to reject something.
//
// ⚖️ THIS FILE GUARDS THE RELATIONSHIP, NOT THE NUMBERS. Asserting `pool === 20`
// would pin an arithmetic result and fail the day someone tunes a budget for a
// good reason. What must never regress is that the pool EXCEEDS the budget it
// feeds, on every platform, including ones added later.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  scrapePoolFor,
  transcriptBudgetFor,
  selectVideosToTranscribe,
  TRANSCRIPT_BUDGET,
  FREE_TRANSCRIPT_BUDGET,
} from '../transcriptSelection.js'

const SCAN = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'jobs', 'scrapeDna.ts'),
  'utf8',
)

describe('the scrape pool feeds the transcript budget', () => {
  it('scrapes strictly more than it can transcribe, on every platform', () => {
    // 'unknown' stands in for a platform added later, which inherits the paid
    // budget by design — it must inherit a workable pool too.
    for (const p of ['tiktok', 'youtube', 'instagram', 'unknown', null, undefined]) {
      const pool = scrapePoolFor(p)
      const budget = transcriptBudgetFor(p)
      expect(pool, `${p}: pool ${pool} must exceed budget ${budget}`).toBeGreaterThan(budget)
    }
  })

  it('never scrapes fewer than the 12 that were being scraped before', () => {
    // A "fix" that reduced any platform's pool would be a regression wearing the
    // fix's name.
    for (const p of ['tiktok', 'youtube', 'instagram', 'unknown']) {
      expect(scrapePoolFor(p)).toBeGreaterThanOrEqual(12)
    }
  })

  it('bounds the pool, because the profile scrape is billed per item', () => {
    // Transcription being free on TikTok does not make SCRAPING free.
    for (const p of ['tiktok', 'youtube', 'instagram']) {
      expect(scrapePoolFor(p)).toBeLessThanOrEqual(50)
    }
  })

  it('leaves the paid transcript budgets exactly where they were', () => {
    // ⚖️ THE POINT OF THE CHANGE IS BETTER SELECTION, NOT MORE SPEND. Three
    // measured scans put the marginal substance of videos 6+ at 12, 2 and 0
    // items, so nothing here argues for transcribing more of them.
    expect(TRANSCRIPT_BUDGET).toBe(10)
    expect(FREE_TRANSCRIPT_BUDGET).toBe(25)
  })
})

describe('the scan actually passes the pool', () => {
  it('does not call scrapeProfile with the default limit', () => {
    // The whole defect was an omitted third argument. Matching the CALL, not the
    // prose that explains it.
    expect(SCAN).toMatch(/await scrapeProfile\(handle, platform, scrapePoolFor\(platform\)\)/)
    expect(SCAN).not.toMatch(/await scrapeProfile\(handle, platform\)/)
  })
})

describe('a bigger pool actually changes what gets selected', () => {
  // ⚠️ THE ASSERTION THAT MAKES THE OTHERS WORTH HAVING. A pool the selector
  // cannot use is a cost with no benefit, so prove the extra candidates reach
  // the choice rather than merely existing.
  const candidate = (i: number, text: string, plays: number) => ({
    url: `https://example.com/v${i}`, text, plays, likes: 0, postedAt: null,
  })

  it('rejects spectacle in favour of stance when given the room', () => {
    // Ten high-reach spectacles, then two low-reach videos whose titles carry a
    // position. With a pool of 10 the stance videos are never seen at all.
    const spectacles = Array.from({ length: 10 }, (_, i) =>
      candidate(i, `I built a PC in a volcano part ${i}`, 1_000_000 - i))
    const stances = [
      candidate(90, 'Why RGB lighting is a scam', 10),
      candidate(91, 'The biggest mistake beginners make', 9),
    ]

    const narrow = selectVideosToTranscribe(spectacles, 5)
    const wide = selectVideosToTranscribe([...spectacles, ...stances], 5)

    // Same budget in both cases — only the pool differs.
    expect(narrow).toHaveLength(5)
    expect(wide).toHaveLength(5)
    // The stance videos lose on reach by five orders of magnitude and still get
    // picked, which is the axis doing its job.
    expect(wide).toContain('https://example.com/v90')
    expect(wide).toContain('https://example.com/v91')
    expect(narrow).not.toContain('https://example.com/v90')
  })
})
