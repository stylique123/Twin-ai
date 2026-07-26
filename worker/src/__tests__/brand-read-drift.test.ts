// A brand_voices read failure must be classified HONESTLY: deployment drift is
// permanent, everything else is transient. Getting this backwards is expensive in
// both directions — a transient blip called permanent kills a recoverable job, and
// drift called transient makes every editor job retry-storm until it dead-letters,
// burying the one fact an operator needs ("the table/column isn't there").
//
// The absent-TABLE case is here because it shipped mis-classified: PostgREST reports
// it as "Could not find the table ... in the schema cache" (PGRST205), which matched
// none of the column patterns, so it fell through to transient. The staging matrix
// hit it for real and the job retried four times before the harness gave up.
import { describe, it, expect } from 'vitest'

process.env.SUPABASE_URL ||= 'https://stub.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'stub-service-role-key'
process.env.GEMINI_API_KEY ||= 'stub'

const { brandReadDrift } = await import('../jobs/brandResolve.js')

describe('brand_voices read failure classification', () => {
  it('an ABSENT TABLE is drift (the exact PostgREST wording the staging run produced)', () => {
    expect(brandReadDrift("Could not find the table 'public.brand_voices' in the schema cache"))
      .toMatch(/table is absent/)
  })

  it('other absent-relation wordings are drift too', () => {
    expect(brandReadDrift('relation "public.brand_voices" does not exist')).toMatch(/table is absent/)
    expect(brandReadDrift('PGRST205: schema cache miss')).toMatch(/table is absent/)
  })

  it('an absent COLUMN is drift', () => {
    expect(brandReadDrift('column brand_voices.brand_kit does not exist'))
      .toMatch(/missing a required column/)
  })

  it('a TRANSIENT failure is NOT drift — it must stay retryable', () => {
    for (const msg of [
      'fetch failed',
      'upstream connect error or disconnect/reset before headers',
      'canceling statement due to statement timeout',
      'too many connections for role',
      '503 Service Unavailable',
    ]) {
      expect(brandReadDrift(msg)).toBeNull()
    }
  })
})
