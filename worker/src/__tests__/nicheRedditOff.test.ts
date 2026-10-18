import { describe, expect, it } from 'vitest'

process.env.SUPABASE_URL ||= 'http://localhost'
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test'

describe('niche Reddit collection is off by default', () => {
  it('is off unless the flag is exactly true', async () => {
    const { nicheRedditEnabled } = await import('../nicheBrain/nicheReddit.js')
    expect(nicheRedditEnabled(undefined)).toBe(false)
    expect(nicheRedditEnabled('')).toBe(false)
    expect(nicheRedditEnabled('1')).toBe(false)
    expect(nicheRedditEnabled('false')).toBe(false)
    expect(nicheRedditEnabled('true')).toBe(true)
    expect(nicheRedditEnabled(' TRUE ')).toBe(true)
  })
})
