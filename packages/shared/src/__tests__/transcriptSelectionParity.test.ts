// THE SELECTION EXISTS THREE TIMES, AND ALL THREE DECIDE THE SAME THING.
//
// ⚠️ WHY IT MATTERS MORE THAN MOST PARITY. Transcripts are the ONLY source that
// can produce `stated` positions — captions are clamped to `demonstrated`, which
// resolves to COVERAGE, which licenses nothing personal. So which few videos get
// transcribed decides whether a creator's Twin can ever voice an opinion at all.
// If the TikTok path and the YouTube/Instagram path disagree about that, two
// creators with identical channels get different Twins for no stated reason.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const SHARED = readFileSync(join(REPO, 'packages/shared/src/transcriptSelection.ts'), 'utf8')
const WORKER = readFileSync(join(REPO, 'worker/src/transcriptSelection.ts'), 'utf8')
const EDGE = readFileSync(join(REPO, 'supabase/functions/_shared/dna.ts'), 'utf8')

/** Lift the selector body, whitespace-normalised: the three copies differ only
 *  in their headers, never in what they decide. */
function lift(src: string, where: string): string {
  const i = src.indexOf('export function selectVideosToTranscribe')
  if (i < 0) throw new Error(`could not find the selector in ${where} — fix the marker, do not inline the text`)
  const end = src.indexOf('\n}\n', i)
  if (end < 0) throw new Error(`unterminated selector in ${where}`)
  return src.slice(i, end).replace(/\s+/g, ' ').trim()
}

describe('all three copies select identically', () => {
  it('the worker matches shared, character for character', () => {
    expect(lift(WORKER, 'the worker')).toBe(lift(SHARED, 'shared'))
  })

  it('the edge matches shared, character for character', () => {
    expect(lift(EDGE, 'the edge shared/dna.ts')).toBe(lift(SHARED, 'shared'))
  })

  it('the budget is the same number everywhere', () => {
    for (const [src, where] of [[WORKER, 'worker'], [EDGE, 'edge']] as const) {
      expect(src, where).toMatch(/TRANSCRIPT_BUDGET = 5/)
    }
  })
})

describe('neither caller has kept a private top-N-by-reach shortcut', () => {
  it('the worker no longer sorts posts by plays to pick transcripts', () => {
    // ⚠️ THE EXACT LINE THIS REPLACED:
    //   [...posts].sort((a,b) => (b.plays||b.likes) - (a.plays||a.likes)).slice(0,5)
    const block = readFileSync(join(REPO, 'worker/src/jobs/scrapeDna.ts'), 'utf8')
    expect(block).toMatch(/selectVideosToTranscribe\(posts\.map/)
    expect(block).not.toMatch(/sort\(\(a, b\) => \(b\.plays \|\| b\.likes\) - \(a\.plays \|\| a\.likes\)\)[\s\S]{0,120}slice\(0, 5\)/)
  })

  it('the edge routes extractVideoUrls through the selector', () => {
    expect(EDGE).toMatch(/return selectVideosToTranscribe\(candidates, max\)/)
    // The permalink preference is load-bearing and must survive: Instagram CDN
    // links are IP-bound to the scraper and 403 from the worker.
    expect(EDGE).toMatch(/'webVideoUrl', 'url', 'postUrl', 'video\.url', 'videoUrl'/)
  })
})
