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
    // purge_media (0099) deletes the BYTES behind a removed media_asset; it is
    // enqueued by a database trigger rather than by application code, so this
    // list is the only place a reader can see that it exists at all.
    expect(types).toEqual([
      'build_voice', 'editor_v2', 'ingest', 'purge_media', 'scrape_dna', 'validate_source',
    ])
    expect(handlers).not.toHaveProperty('autoedit')
    expect(handlers).not.toHaveProperty('transcribe')
  })


  it('purge_media is registered — a trigger enqueues it, so an unregistered handler would dead-letter every deletion', async () => {
    // The failure mode this guards is quiet and bad: 0099's trigger fires on
    // every media_assets delete whether or not a handler exists. Without one,
    // each deletion queues a job the worker cannot claim, it exhausts its
    // attempts, dead-letters, and the bytes stay exactly as before — while the
    // database, the migration and the trigger all look correct.
    const { handlers } = await import('../jobs/index.js')
    expect(typeof handlers.purge_media).toBe('function')
  })
  it('default WORKER_JOB_TYPES does not drain autoedit', async () => {
    const { env } = await import('../env.js')
    expect(env.jobTypes).not.toContain('autoedit')
    // And it DOES drain purge_media. A trigger enqueues these, so if no worker
    // claims the type the jobs pile up unclaimed and every deleted recording's
    // bytes survive — with nothing anywhere looking wrong.
    expect(env.jobTypes).toContain('purge_media')
    // and the removed editor env flags are gone from the config object
    for (const k of ['revideoUrl', 'revideoTrusted', 'editBroll', 'musicBedUrl', 'pexelsKey']) {
      expect(env).not.toHaveProperty(k)
    }
  })
})
