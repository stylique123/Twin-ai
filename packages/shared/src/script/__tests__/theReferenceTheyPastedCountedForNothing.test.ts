import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  referencePointsFromTranscriptStructure,
  referenceUrlKey,
} from '../transcriptReferencePoints'

/**
 * ⚠️⚠️ ONE OF THE THREE SUBSTANCE INPUTS HAS BEEN NULL ON 153 OF 154 REAL
 * GENERATIONS.
 *
 *   generations carrying a reference ............................ 154
 *   whose reference has ANY `reference_content_profiles` row ...... 3
 *   whose reference has a `structure` there ....................... 1
 *
 * The budget reads the scraped GALLERY table (2,393 rows, all gallery URLs)
 * while creators paste their own URLs. The two corpora are disjoint.
 *
 * ⚠️ AND THE ANSWER WAS ALREADY STORED. `transcripts.structure` holds the beat
 * breakdown of what creators actually paste — 113 rows carry one — and nothing
 * had ever read it for the budget.
 *
 * The shapes below are taken from real stored rows. Run over all 113, this
 * counter returns: 113 counted, 0 null, mean 2.98, range 0–7.
 */

// The shape `transcripts.structure` really stores — beats with `beat`, `goal`
// and `at_sec`, and NO `role`, which is why `referencePointsFrom` cannot read it.
const real = {
  beats: [
    { beat: 'Introduce the bold claim and the physical gadget', goal: 'Hook', at_sec: 0.1 },
    { beat: 'Show the problem', goal: 'Establish stakes', at_sec: 4 },
    { beat: 'Demonstrate the fix', goal: 'Proof', at_sec: 9 },
    { beat: 'Show the result', goal: 'Payoff', at_sec: 15 },
    { beat: 'Ask for the follow', goal: 'CTA', at_sec: 22 },
  ],
  cta: 'Follow for more builds',
  hook_window_sec: 3.6,
}

describe('counting the points in a reference the creator pasted', () => {
  it('excludes the hook and the CTA, never counting bare beats', () => {
    // 5 beats · 1 inside the hook window · 1 CTA = 3 points.
    expect(referencePointsFromTranscriptStructure(real)).toBe(3)
    expect(referencePointsFromTranscriptStructure(real)).not.toBe(real.beats.length)
  })

  // ⚠️ THE RULE `SubstanceSources.referencePoints` STATES IN ITS OWN DOCSTRING:
  // every script gets a hook and a CTA regardless, so counting them would
  // "credit the budget for structure it always has and let a reference with
  // nothing in it look full".
  it('gives a hook-and-CTA-only reference no points at all', () => {
    expect(referencePointsFromTranscriptStructure({
      beats: [{ at_sec: 0 }, { at_sec: 6 }],
      cta: 'Link in bio',
      hook_window_sec: 3,
    })).toBe(0)
  })

  // ⚖️ WITHOUT A MEASURED WINDOW THE OPENING BEAT IS STILL THE HOOK. Counting
  // it would inflate every reference by one.
  it('drops the opening beat when no hook window was measured', () => {
    expect(referencePointsFromTranscriptStructure({
      beats: [{ at_sec: 0 }, { at_sec: 5 }, { at_sec: 9 }],
    })).toBe(2)
  })

  // ⚠️ NULL IS NOT ZERO, the same rule `referencePointsFrom` states. Zero says
  // "this reference makes no points" — a finding nobody made — and would then
  // cap the script instead of leaving it uncapped.
  it('returns null when there is nothing to count', () => {
    expect(referencePointsFromTranscriptStructure(null)).toBeNull()
    expect(referencePointsFromTranscriptStructure(undefined)).toBeNull()
    expect(referencePointsFromTranscriptStructure({ beats: [] })).toBeNull()
    expect(referencePointsFromTranscriptStructure({ beats: 'nope' as unknown })).toBeNull()
  })

  // ⚠️ A MEASUREMENT FAILURE IS OURS, NOT THE VIDEO'S. Dropping an untimed beat
  // would silently shrink a real reference.
  it('keeps a beat whose timestamp is missing', () => {
    expect(referencePointsFromTranscriptStructure({
      beats: [{ at_sec: 0 }, { }, { at_sec: 8 }],
      hook_window_sec: 3,
    })).toBe(2)
  })

  it('never returns a negative count', () => {
    expect(referencePointsFromTranscriptStructure({
      beats: [{ at_sec: 0 }], cta: 'Follow', hook_window_sec: 3,
    })).toBe(0)
  })

  it('treats a blank cta as no cta', () => {
    expect(referencePointsFromTranscriptStructure({
      beats: [{ at_sec: 0 }, { at_sec: 5 }, { at_sec: 9 }], cta: '   ', hook_window_sec: 3,
    })).toBe(2)
  })
})

describe('the key must match the one the transcript was written with', () => {
  // ⚠️ A READER KEYED DIFFERENTLY FROM THE WRITER FINDS NOTHING — which is the
  // failure this whole module exists to end, so the normalisation is pinned
  // against `ingest-reference`'s, whose own comment says it must match the
  // worker's.
  it('lowercases the host and strips www and a trailing slash', () => {
    expect(referenceUrlKey('https://WWW.TikTok.com/@x/video/123/'))
      .toBe('tiktok.com/@x/video/123')
  })

  it('keeps only the youtube v parameter', () => {
    expect(referenceUrlKey('https://www.youtube.com/watch?v=AbC123&t=42s'))
      .toBe('youtube.com/watch?v=abc123')
  })

  it('falls back to the trimmed lowercase string when it is not a URL', () => {
    expect(referenceUrlKey('  NotAUrl  ')).toBe('notaurl')
    expect(referenceUrlKey(null)).toBe('')
  })

  it('matches the normalisation ingest-reference writes with', () => {
    const ingest = readFileSync(
      join(__dirname, '..', '..', '..', '..', '..', 'supabase', 'functions', 'ingest-reference', 'index.ts'),
      'utf8',
    )
    expect(ingest).toMatch(/hostname\.toLowerCase\(\)\.replace\(\/\^www\\\.\/, ''\)/)
    expect(ingest).toMatch(/pathname\.replace\(\/\\\/\+\$\/, ''\)\.toLowerCase\(\)/)
  })
})

const EDGE = readFileSync(
  join(__dirname, '..', '..', '..', '..', '..', 'supabase', 'functions', 'generate-blueprint', 'index.ts'),
  'utf8',
)

describe('the writer actually reaches for the pasted reference', () => {
  it('falls back to the transcript only when the gallery profile gave nothing', () => {
    expect(EDGE).toMatch(/if \(substanceReferencePoints === null && typeof reference_url === 'string'/)
  })

  // ⚖️ THE GALLERY PROFILE IS RICHER — it carries real beat ROLES — so it must
  // win wherever it exists. A fallback that overwrote it would trade a measured
  // role for an inferred timestamp.
  it('never overwrites a gallery profile that did produce points', () => {
    const guard = EDGE.indexOf('substanceReferencePoints === null && typeof reference_url')
    const assign = EDGE.indexOf('substanceReferencePoints = fromTranscript')
    expect(guard).toBeGreaterThan(-1)
    expect(assign).toBeGreaterThan(guard)
  })

  it('reads by the same key the transcript was written with', () => {
    expect(EDGE).toMatch(/\.eq\('url_key', referenceUrlKey\(reference_url\)\)/)
  })

  // ⚠️ A FALLBACK THAT THROWS MUST COST THE POINTS AND NOTHING ELSE.
  it('never fails a generation on the fallback', () => {
    expect(EDGE).toMatch(/never fail a generation on a fallback/)
  })

  // ⚠️ "HOW MANY" WITHOUT "FROM WHERE" CANNOT ANSWER WHETHER THIS SHIPPED.
  // A fallback that silently stops firing looks exactly like a run of thin
  // references unless the provenance is recorded beside the count.
  it('records which corpus supplied the points, durably', () => {
    expect(EDGE).toMatch(/beatAudit\.reference_points = \{/)
    expect(EDGE).toMatch(/source: referencePointsSource/)
    expect(EDGE).toMatch(/referencePointsSource = 'profile'/)
    expect(EDGE).toMatch(/referencePointsSource = 'transcript'/)
  })
})
