// Part 1 of the one-click-editor rebuild: the worker must never be able to claim
// an `autoedit` job again. env.ts throws without Supabase creds, so we stub them
// before importing the registry, then assert the handler map by behavior.
import { describe, it, expect, beforeAll } from 'vitest'

beforeAll(() => {
  process.env.SUPABASE_URL ||= 'https://stub.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'stub-service-role-key'
})

describe('worker job registry has no old editor', () => {
  it('registers exactly ingest, build_voice, scrape_dna — and NOT autoedit', async () => {
    const { handlers } = await import('../jobs/index.js')
    const types = Object.keys(handlers).sort()
    expect(types).toEqual(['build_voice', 'ingest', 'scrape_dna'])
    expect(handlers).not.toHaveProperty('autoedit')
  })

  it('default WORKER_JOB_TYPES does not drain autoedit', async () => {
    const { env } = await import('../env.js')
    expect(env.jobTypes).not.toContain('autoedit')
    // and the removed editor env flags are gone from the config object
    for (const k of ['revideoUrl', 'revideoTrusted', 'editBroll', 'musicBedUrl', 'pexelsKey']) {
      expect(env).not.toHaveProperty(k)
    }
  })
})
