// PACING NEEDED A DURATION, AND THE DURATION WAS BEING THROWN AWAY.
//
// ⚠️ `pacing_band` IS THE ONE LAYER C FIELD OF THE SIX THAT EXISTS NOWHERE.
// The other five — hook shape, beat count, beat ordering, rehook position, CTA
// mechanism — are all extracted and `observed` on ~1,000 references. Before
// adding a column, the question was whether pacing could be COMPUTED from what
// is already stored. Measured 2026-09-09, it cannot:
//
//   · `transcripts` holds 395 rows with `duration_sec` and joins to
//     `reference_content_profiles` on ZERO rows — checked on `source_url`, on
//     `url_key`, and on both normalised for scheme and `www.`. The assessed and
//     transcribed corpora are disjoint sets of videos.
//   · Of 5,238 stored beats, 2,524 carry `startSec` (48%) and 989 carry
//     `endSec` (19%). Median `max(endSec)` per reference is 22 seconds, which
//     is where the timing stopped, not where the video ended.
//   · Complete beat timing exists for 134 references — 7.6% — with an
//     elevenfold spread, 1.5 beats/min at p10 to 16.5 at p90.
//
// ⚖️ SO THIS ADDS THE INPUT, NOT THE ANSWER. `probeDurationSec` already runs in
// `sampleFrames` on every visual pass and its result died there; 701 references
// were measured and discarded.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { pacingBand, projectShape, PACING_BANDS } from '../shapeLibrary'

describe('a band, and null when nobody measured', () => {
  it('null is reachable and is the common answer', () => {
    // ⚠️⚠️ EVERY REFERENCE ASSESSED BEFORE 0193 HAS NO DURATION AND NEVER
    // WILL — the file it was measured from is gone. Coercing that to a band
    // would put 1,773 invented readings into the field this exists to measure
    // honestly.
    expect(pacingBand(null, 6)).toBeNull()
    expect(pacingBand(undefined, 6)).toBeNull()
    expect(pacingBand(60, null)).toBeNull()
    expect(pacingBand('not a number', 6)).toBeNull()
  })

  it('a zero or negative duration is not a reading', () => {
    // ⚠️ THE NULL CHECK PRECEDES THE ARITHMETIC. `beats / 0` is Infinity, which
    // compares greater than every threshold and would report every
    // zero-duration row as `rapid` — a reading from a video nobody measured.
    expect(pacingBand(0, 6)).toBeNull()
    expect(pacingBand(-10, 6)).toBeNull()
    expect(pacingBand(60, 0)).toBeNull()
  })

  it('bands on the measured quartiles', () => {
    // p25 = 3.0 beats/min, p75 = 8.6. 2 beats in 60s = 2/min → unhurried.
    expect(pacingBand(60, 2)).toBe('unhurried')
    // 6 beats in 60s = 6/min, inside the middle half → steady.
    expect(pacingBand(60, 6)).toBe('steady')
    // 12 beats in 60s = 12/min → rapid.
    expect(pacingBand(60, 12)).toBe('rapid')
  })

  it('every answer is one of the declared bands or null', () => {
    for (const d of [5, 22, 50, 180]) {
      for (const b of [1, 3, 6, 9, 20]) {
        const r = pacingBand(d, b)
        expect(r === null || (PACING_BANDS as readonly string[]).includes(r)).toBe(true)
      }
    }
  })
})

describe('the shape row carries it, and null when unmeasured', () => {
  const profile = {
    structure: { containerType: { value: 'story' }, beats: { value: [
      { role: 'hook' }, { role: 'setup' }, { role: 'payoff' },
    ] } },
    hook: { mechanism: { value: 'curiosity_gap' } },
  }

  it('projects a band when a duration is supplied', () => {
    expect(projectShape(profile, 60)!.pacing).toBe('steady')
  })

  it('and null when it is not — which is every existing row', () => {
    expect(projectShape(profile)!.pacing).toBeNull()
    expect(projectShape(profile, null)!.pacing).toBeNull()
  })
})

// ── THE NUMBER IS ACTUALLY CARRIED OUT NOW ────────────────────────────────
const dir = dirname(fileURLToPath(import.meta.url))
const read = (...p: string[]) => readFileSync(join(dir, '..', '..', '..', '..', ...p), 'utf8')
const FRAME = read('worker', 'src', 'frameSample.ts')
const VISUAL = read('worker', 'src', 'visualPass.ts')
const ASSESS = read('worker', 'src', 'jobs', 'assessReference.ts')
const MIG = read('supabase', 'migrations', '0193_the_duration_was_measured_and_discarded.sql')

describe('the measurement survives the function that made it', () => {
  it('sampleFrames returns the duration it probed', () => {
    // ⚠️ IT WAS COMPUTED AND DISCARDED IN THIS EXACT FUNCTION.
    expect(FRAME).toMatch(/durationSec: duration > 0 \? duration : null/)
    expect(FRAME).toMatch(/durationSec: number \| null/)
  })

  it('the empty sample says null, never zero', () => {
    // ⚖️ A ZERO-LENGTH VIDEO AND A VIDEO NOBODY MEASURED ARE DIFFERENT FACTS.
    expect(FRAME).toMatch(/const EMPTY: FrameSample = \{[^}]*durationSec: null/)
  })

  it('the visual pass carries it out', () => {
    expect(VISUAL).toMatch(/duration_sec: number \| null/)
    expect(VISUAL).toMatch(/duration_sec: sample\.durationSec/)
  })

  it('and the assessment persists it, only when the pass ran', () => {
    // ⚠️ INSIDE THE `ran` GATE, so null keeps meaning "nobody looked" rather
    // than "looked and saw nothing" — the distinction the neighbouring columns
    // are already careful about.
    const gated = ASSESS.slice(ASSESS.indexOf("visual?.ran === true ? {"))
    expect(gated.slice(0, 900)).toMatch(/duration_sec: visual\.duration_sec/)
  })

  it('the migration backfills nothing and says why', () => {
    // ⚖️ A COLUMN NULL FOR THE PAST AND TRUE FOR THE FUTURE IS WORTH MORE THAN
    // ONE FILLED WITH A RECONSTRUCTION.
    expect(MIG).toMatch(/add column if not exists duration_sec numeric/)
    expect(MIG).not.toMatch(/update public\.reference_content_profiles set duration_sec/)
    expect(MIG).toMatch(/not backfilled/)
  })

  it('the migration records the measurement that justified it', () => {
    // ⚠️ THE EVIDENCE LIVES WITH THE CHANGE. A future reader asking "why not
    // just compute it from the transcripts table" gets the answer here.
    expect(MIG).toMatch(/ZERO rows/)
    expect(MIG).toMatch(/134 references/)
  })
})
