// Part 1 of the one-click-editor rebuild: the worker must never be able to claim
// an `autoedit` job again. env.ts throws without Supabase creds, so we stub them
// before importing the registry, then assert the handler map by behavior.
import { describe, it, expect, beforeAll } from 'vitest'

beforeAll(() => {
  process.env.SUPABASE_URL ||= 'https://stub.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'stub-service-role-key'
})

describe('worker job registry has no old editor', () => {
  it('registers exactly the active job types — and NOT autoedit/transcribe', async () => {
    const { handlers } = await import('../jobs/index.js')
    const types = Object.keys(handlers).sort()
    // validate_source (editor-v2 Phase 1) VALIDATES an uploaded recording; it is
    // not an editor/render job. editor_v2 (Phase 3) is the rebuilt editor's
    // orchestration loop — simulated stages until later phases land real work.
    expect(types).toEqual(['build_voice', 'editor_v2', 'ingest', 'scrape_dna', 'validate_source'])
    expect(handlers).not.toHaveProperty('autoedit')
    expect(handlers).not.toHaveProperty('transcribe')
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
