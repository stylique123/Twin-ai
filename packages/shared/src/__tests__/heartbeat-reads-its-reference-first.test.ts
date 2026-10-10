import { describe, expect, it } from 'vitest'
// @ts-expect-error plain .mjs ops script, no types
import { ingestForHeartbeat } from '../../../../scripts/ops/heartbeatIngest.mjs'

const base = { url: 'https://example.com/ref.mp4', supabaseUrl: 'https://x.supabase.co', anonKey: 'anon', token: 't', pollMs: 1, waitMs: 200 }
const ok = (body: unknown) => ({ ok: true, json: async () => body }) as Response

describe('the heartbeat reads its reference before asking for a script', () => {
  it('a cache hit returns the transcript at once', async () => {
    const calls: string[] = []
    const fetchImpl = async (u: string) => { calls.push(u); return ok({ job_id: 'j', transcript_id: 'tr1' }) }
    expect(await ingestForHeartbeat({ ...base, fetchImpl })).toBe('tr1')
    expect(calls).toEqual(['https://x.supabase.co/functions/v1/ingest-reference'])
  })
  it('otherwise polls the job until it is done', async () => {
    let n = 0
    const fetchImpl = async (u: string) => u.includes('ingest-reference') ? ok({ job_id: 'j1' })
      : ok([++n < 3 ? { status: 'running' } : { status: 'done', result: { transcript_id: 'tr2' } }])
    expect(await ingestForHeartbeat({ ...base, fetchImpl })).toBe('tr2')
  })
  it('a failed or slow read is reported, never sent on as an unread reference', async () => {
    await expect(ingestForHeartbeat({ ...base, fetchImpl: async (u: string) => u.includes('ingest') && !u.includes('rest') ? ok({ job_id: 'j' }) : ok([{ status: 'failed', error: 'private video' }]) })).rejects.toThrow(/ingest job failed/)
    await expect(ingestForHeartbeat({ ...base, fetchImpl: async (u: string) => u.includes('ingest-reference') ? ok({ job_id: 'j' }) : ok([{ status: 'running' }]) })).rejects.toThrow(/timed out/)
    await expect(ingestForHeartbeat({ ...base, fetchImpl: async () => ({ ok: false, status: 500 }) as Response })).rejects.toThrow(/500/)
  })
})
