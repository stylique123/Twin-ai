// Advisor review of #1353: with AUDIENCE_REWRITE unset, runAudienceTests on a
// real owner's generation keeps its one grading call and the audience_tests row,
// and writes NOTHING to generations (no script, shot list, hook order, opening
// line or selected hook). With the flag on and the owner listed, it does write.
import { describe, it, expect, vi, beforeEach } from 'vitest'

process.env.SUPABASE_URL ||= 'https://stub.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'stub-service-role-key'

const OWNER = 'real-owner-1'
const GEN = 'gen-real-1'
const calls = { generationsUpdates: [] as unknown[], audienceTests: [] as unknown[], model: 0 }

const generation = () => ({
  id: GEN, user_id: OWNER, reference_note: null, voice_id: null,
  profile: { niche: 'coffee', sub_niche: 'home roasting', audience: 'home brewers' },
  blueprint: {
    hook_options: ['Most people store beans wrong.', 'Your fridge is ruining your coffee.', 'Three weeks is the limit.'],
    script: [{ section: 'hook', line: 'Most people store beans wrong.' }, { section: 'body', line: 'Keep them in an airtight tin.' }, { section: 'cta', line: 'Save this.' }],
    shot_list: [],
  },
})

// Every viewer stops on hook 2, so the hook order and the opening line WOULD change.
const graded = { viewers: Array.from({ length: 6 }, (_, i) => ({ who: `Viewer ${i}`, quote: 'Fridge? Really?', stops_for: 1, would_stop: [1], leaves_at: -1, question: '', fits: true })), fixes: [], summary: 'ok', promise_kept: true }

function chain(table: string): unknown {
  const self: Record<string, unknown> = {}
  const done = { data: null, count: 0, error: null }
  for (const m of ['select', 'eq', 'in', 'not', 'is', 'or', 'order', 'limit', 'gte', 'lte', 'neq', 'filter', 'ilike', 'like', 'range', 'contains', 'match']) self[m] = () => self
  self.maybeSingle = async () => (table === 'generations' ? { data: { selected_hook: null, hook_choice: null }, error: null } : done)
  self.single = self.maybeSingle
  self.update = (row: unknown) => { if (table === 'generations') calls.generationsUpdates.push(row); if (table === 'audience_tests') calls.audienceTests.push(row); return self }
  self.upsert = (row: unknown) => { if (table === 'audience_tests') calls.audienceTests.push(row); return self }
  self.insert = () => self
  self.then = (res: (v: unknown) => unknown) => Promise.resolve(done).then(res)
  return self
}

vi.mock('../db.js', () => ({
  db: {
    from: (t: string) => chain(t),
    rpc: async (name: string) => ({ data: name === 'audience_untested' ? [generation()] : [], error: null }),
  },
}))
vi.mock('../gemini.js', () => ({
  geminiJson: async () => { calls.model++; return graded },
  geminiEmbed: async () => null,
}))

beforeEach(() => { calls.generationsUpdates = []; calls.audienceTests = []; calls.model = 0; vi.resetModules() })

async function run(flag: string | undefined) {
  if (flag === undefined) delete process.env.AUDIENCE_REWRITE; else process.env.AUDIENCE_REWRITE = flag
  const { runAudienceTests } = await import('../nicheBrain/audience.js')
  await runAudienceTests(() => {})
}

describe('AUDIENCE_REWRITE off: the viewers grade, and change nothing', () => {
  it('flag unset: no generations.update at all, one grading call, the audience_tests row is saved', async () => {
    await run(undefined)
    expect(calls.generationsUpdates).toEqual([])
    expect(calls.model).toBe(1)
    expect(calls.audienceTests.some((r) => (r as { status?: string }).status === 'done')).toBe(true)
  })
  it('flag on with the owner listed: the generation IS updated (hook order / opening / selected hook)', async () => {
    await run(`someone-else,${OWNER}`)
    expect(calls.generationsUpdates.length).toBeGreaterThan(0)
    const opening = calls.generationsUpdates.map((u) => (u as { blueprint?: { script?: Array<{ line: string }> } }).blueprint?.script?.[0]?.line).find(Boolean)
    const hookWrite = calls.generationsUpdates.some((u) => 'selected_hook' in (u as object) || (u as { blueprint?: { hook_options?: string[] } }).blueprint?.hook_options?.[0] === 'Your fridge is ruining your coffee.')
    expect(hookWrite || (opening && opening !== 'Most people store beans wrong.')).toBeTruthy()
  })
  it('flag on but this owner not listed: nothing written', async () => {
    await run('someone-else')
    expect(calls.generationsUpdates).toEqual([])
  })
})
