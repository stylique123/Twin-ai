import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// ⚠️ THE COUNTING RULE NOW EXISTS TWICE: `worker/src/ctaEvidence.ts` (which the
// edge function cannot import, exactly as it cannot import from this workspace)
// and `ctaEvidenceForInline` in generate-blueprint. Two spellings of "does this
// creator actually say this" is how the worker's stored count and the edge's
// live count end up quietly disagreeing about the same creator.
//
// ⚠️ AND THE LIVE COPY IS THE ONE THAT MATTERS TODAY. Measured 2026-09-07:
// 49 brand_voices, 45 carrying `recurring_ctas`, 106 CTA entries, and
// `recurring_ctas_evidence` present on ZERO of them. The worker writes it only
// on a scrape; nothing had been scraped since the counter shipped, so the count
// reached no creator at all.
const url = (p: string) => fileURLToPath(new URL(p, import.meta.url))
const edge = readFileSync(url('../../../../supabase/functions/generate-blueprint/index.ts'), 'utf8')
const worker = readFileSync(url('../../../../worker/src/ctaEvidence.ts'), 'utf8')

/** ⚠️ RETURNS null WHEN THE BLOCK IS ABSENT, never a passing "identical". A
 *  guard that reports a missing thing as an agreeing thing is worse than none. */
function body(src: string, name: string): string | null {
  const start = src.indexOf(name)
  if (start < 0) return null
  const open = src.indexOf('{', start)
  if (open < 0) return null
  let depth = 0
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') {
      depth--
      if (depth === 0) return src.slice(open, i + 1)
    }
  }
  return null
}

/** Compare the RULE, not the spelling: strip comments, the `Inline` suffix the
 *  edge copy carries, and whitespace. */
function rule(s: string): string {
  return s
    .split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*'))
    .join('\n')
    .replace(/normaliseSpeechInline/g, 'normaliseSpeech')
    .replace(/\s+/g, ' ')
    .trim()
}

describe('the worker copy and the edge copy count the same thing', () => {
  it('both normalisers exist', () => {
    expect(body(worker, 'export function normaliseSpeech')).not.toBeNull()
    expect(body(edge, 'function normaliseSpeechInline')).not.toBeNull()
  })

  it('the normalisers are the same rule', () => {
    expect(rule(body(edge, 'function normaliseSpeechInline')!))
      .toBe(rule(body(worker, 'export function normaliseSpeech')!))
  })

  it('the counters are the same rule', () => {
    expect(rule(body(edge, 'function ctaEvidenceForInline')!))
      .toBe(rule(body(worker, 'export function ctaEvidenceFor')!))
  })

  // ⚖️ THREE WORDS IS THE WHOLE REASON "subscribe" alone does not match every
  // transcript that mentions subscribing. A copy that drifted to 2 would report
  // a habit nobody has.
  it('both hold MIN_VERIFIABLE_WORDS at 3', () => {
    expect(worker).toMatch(/export const MIN_VERIFIABLE_WORDS = 3/)
    expect(edge).toMatch(/const MIN_VERIFIABLE_WORDS = 3/)
  })
})

describe('the live count is wired, which the stored one never was', () => {
  it('it is computed from the creator\'s OWN speech, not a reference', () => {
    expect(edge).toMatch(/liveCtaEvidence = ctaEvidenceForInline\(\s*\(vp\?\.recurring_ctas \?\? \[\]\) as unknown\[\],\s*\(ownSpeech \?\? \[\]\)/)
  })

  // ⚠️ A COUNT NOBODY RENDERS IS A FIELD WRITTEN AND NEVER READ — the defect
  // class this repo keeps finding. This is the reader.
  it('it reaches the prompt line', () => {
    expect(edge).toContain('renderRecurringCtasInline(vp, liveCtaEvidence)')
  })

  it('the live count wins over the stored array', () => {
    expect(edge).toMatch(/\(Array\.isArray\(live\) && live\.length > 0\)/)
  })

  it('the counter is emitted so zero and absent stay distinguishable', () => {
    expect(edge).toContain('cta_evidence_counted: ctaEvidenceCounted')
  })

  // ⚖️ NULL, NOT []. An empty array would say "checked, nothing recurs" about a
  // creator whose speech was never read.
  it('the holder starts null, because absent is not zero', () => {
    expect(edge).toMatch(/let liveCtaEvidence: CtaEvidenceInline\[\] \| null = null/)
  })
})
