// THE BUDGET IS THE CEILING ON THE ONLY INPUT MEASURED TO CHANGE QUALITY.
//
// Production: transcript items are 78% substance against 13% for captions, and
// scripts built on transcript-only stores scored 73% grounded / 8% generic
// against 58% / 23% for the same creators' full stores. So how many videos get
// transcribed decides how much of the good material exists at all — and a
// constant nobody passes to the selector is a constant that does nothing.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { transcriptBudgetFor, TRANSCRIPT_BUDGET, FREE_TRANSCRIPT_BUDGET } from '../transcriptSelection.js'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const SHARED = readFileSync(join(REPO, 'packages/shared/src/transcriptSelection.ts'), 'utf8')
const WORKER = readFileSync(join(REPO, 'worker/src/transcriptSelection.ts'), 'utf8')
const SCAN = readFileSync(join(REPO, 'worker/src/jobs/scrapeDna.ts'), 'utf8')

describe('worker ↔ shared budget parity', () => {
  const lift = (s: string, name: string) => {
    const i = s.search(new RegExp(`export function ${name}[<(]`))
    if (i < 0) throw new Error(`could not lift ${name}`)
    const at = s.indexOf('\n}', i)
    return s.slice(i, at < 0 ? s.length : at).replace(/\s+/g, ' ').trim()
  }

  it('decides the budget by the same rule', () => {
    expect(lift(WORKER, 'transcriptBudgetFor')).toBe(lift(SHARED, 'transcriptBudgetFor'))
  })

  it('carries the same two numbers', () => {
    const nums = (s: string) => [
      s.match(/TRANSCRIPT_BUDGET = (\d+)/)![1],
      s.match(/FREE_TRANSCRIPT_BUDGET = (\d+)/)![1],
    ]
    expect(nums(WORKER)).toEqual(nums(SHARED))
  })

  it('agrees on which platforms are free', () => {
    const set = (s: string) => s.slice(s.indexOf('FREE_TRANSCRIPT_PLATFORMS'))
      .match(/'[a-z]+'/g)?.slice(0, 3)
    expect(set(WORKER)).toEqual(set(SHARED))
  })
})

describe('the scan actually passes it', () => {
  it('hands the platform budget to the selector', () => {
    // ⚠️ WITHOUT THIS ARGUMENT THE SELECTOR USES ITS DEFAULT and the whole
    // change is inert — the tenth write-only field in a repo that has now
    // shipped nine.
    expect(SCAN).toMatch(/selectVideosToTranscribe\([\s\S]{0,200}?transcriptBudgetFor\(platform\)\)/)
  })

  it('imports it rather than hard-coding a number', () => {
    // ⚖️ THE CLAIM IS "IMPORTED, NOT HARD-CODED" — not "these two names in this
    // order". Pinning the exact import list made this fail when `scrapePoolFor`
    // joined it, which is a passing test breaking on a change it has no opinion
    // about. Assert what the name is and where it comes from.
    expect(SCAN).toMatch(/import \{[^}]*\btranscriptBudgetFor\b[^}]*\} from '\.\.\/transcriptSelection\.js'/)
    expect(SCAN).not.toMatch(/transcriptBudgetFor\s*=\s*\d/)
  })
})

describe('the numbers themselves', () => {
  it('free is larger than paid, or the split achieves nothing', () => {
    expect(FREE_TRANSCRIPT_BUDGET).toBeGreaterThan(TRANSCRIPT_BUDGET)
  })

  it('an unknown platform costs the paid budget', () => {
    expect(transcriptBudgetFor('mastodon')).toBe(TRANSCRIPT_BUDGET)
  })
})
