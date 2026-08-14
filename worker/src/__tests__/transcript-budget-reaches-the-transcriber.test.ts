// THE BUDGET IS DECIDED IN ONE PLACE AND SPENT IN ANOTHER.
//
// ⚠️ TWO RAISES SHIPPED AND NEITHER REACHED PRODUCTION. `TRANSCRIPT_BUDGET` went
// 5→10 in #366 and TikTok's went to 25 in #377, both argued at length as lifting
// the ceiling on the only input measured to change script quality. The consumer
// of those URLs — `handleBuildVoice` — carried its own `.slice(0, 5)`, so the
// selector picked twenty-five videos and five were transcribed. Every test
// passed the whole time, because they all tested the SELECTOR.
//
// ⚖️ THE PARITY TESTS DID NOT COVER IT EITHER, AND COULD NOT HAVE. They check
// that the worker's copy of the selector matches shared's. Both copies were
// correct. What was wrong was a number in a different file that no longer agreed
// with either — the same shape as #385, where lifted constants sat next to a
// hand-written rule.
//
// So this guards the SEAM rather than the rule: whatever the producer decides,
// the transcriber must not quietly keep less.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { selectVideosToTranscribe, transcriptBudgetFor, FREE_TRANSCRIPT_BUDGET, TRANSCRIPT_BUDGET } from '../transcriptSelection.js'

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..')
const VOICE = readFileSync(join(SRC, 'jobs', 'voice.ts'), 'utf8')
/** ⚠️ PROSE IS NOT BEHAVIOUR. A comment naming the old shape made one assertion
 *  below fail against a correct file, which is the kind of guard that gets
 *  loosened until it no longer guards anything. Assertions about what the code
 *  does NOT do read this; assertions about what it does may read the source. */
const CODE = VOICE.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ')

describe('the transcriber keeps every video the selector paid to choose', () => {
  it('caps by the platform budget rather than a number of its own', () => {
    expect(VOICE).toMatch(/const budget = transcriptBudgetFor\(p\.platform\)/)
    expect(VOICE).toMatch(/p\.urls\.slice\(0, budget\)/)
  })

  it('has no hard-coded cap left anywhere in the handler', () => {
    // ⚠️ THE OLD LINE MUST BE GONE, NOT BYPASSED. A surviving second slice would
    // be the defect intact with a passing test above it.
    expect(CODE).not.toMatch(/urls\.slice\(0,\s*\d/)
  })

  it('reads the RAW platform, so an unrecorded one gets the paid budget', () => {
    // `platform` in that file defaults to 'tiktok' for voice synthesis. Passing
    // it here would hand the FREE budget — 25 videos — to any payload that
    // arrived without the field, on a platform billed per video.
    expect(CODE).not.toMatch(/transcriptBudgetFor\(platform\)/)
    expect(transcriptBudgetFor(undefined)).toBe(TRANSCRIPT_BUDGET)
    expect(transcriptBudgetFor('instagram')).toBe(TRANSCRIPT_BUDGET)
  })
})

describe('the two ends agree on a case that separates them', () => {
  const candidates = Array.from({ length: 40 }, (_, i) => ({
    url: `https://example.com/v${i}`, plays: 40 - i, text: `why thing ${i}`, postedAt: 1_700_000_000_000 + i,
  }))

  it('a free platform transcribes everything it selected — not five', () => {
    const picked = selectVideosToTranscribe(candidates, transcriptBudgetFor('tiktok'))
    expect(picked).toHaveLength(FREE_TRANSCRIPT_BUDGET)
    // The seam, stated as the property that failed: nothing is dropped between
    // choosing and transcribing.
    expect(picked.slice(0, transcriptBudgetFor('tiktok'))).toEqual(picked)
    expect(picked.length).toBeGreaterThan(5)
  })

  it('a paid platform still stops at the paid budget', () => {
    const picked = selectVideosToTranscribe(candidates, transcriptBudgetFor('instagram'))
    expect(picked).toHaveLength(TRANSCRIPT_BUDGET)
  })
})
