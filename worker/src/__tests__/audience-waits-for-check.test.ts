// Panel 13 (advisor): the viewers never act on a script whose honesty check is
// still running (check_status 'unchecked'); they take one whose check is final.
import { describe, it, expect, vi, beforeEach } from 'vitest'

process.env.SUPABASE_URL ||= 'https://stub.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'stub-service-role-key'

const OWNER = 'real-owner-1'
const GEN = 'gen-real-1'
let queue: () => unknown[] = () => []
const calls = { generationsUpdates: [] as unknown[], audienceTests: [] as Array<Record<string, unknown>>, model: 0 }

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
  self.update = (row: unknown) => { if (table === 'generations') calls.generationsUpdates.push(row); if (table === 'audience_tests') calls.audienceTests.push(row as Record<string, unknown>); return self }
  self.upsert = (row: unknown) => { if (table === 'audience_tests') calls.audienceTests.push(row as Record<string, unknown>); return self }
  self.insert = () => self
  self.then = (res: (v: unknown) => unknown) => Promise.resolve(done).then(res)
  return self
}

vi.mock('../db.js', () => ({
  db: {
    from: (t: string) => chain(t),
    rpc: async (name: string) => ({ data: name === 'audience_untested' ? queue() : [], error: null }),
  },
}))
vi.mock('../gemini.js', () => ({
  geminiJson: async () => { calls.model++; return graded },
  geminiEmbed: async () => null,
}))

beforeEach(() => { calls.generationsUpdates = []; calls.audienceTests = []; calls.model = 0; vi.resetModules(); process.env.AUDIENCE_REWRITE = 'all' })

const withStatus = (id: string, cs?: string) => { const g = generation(); return { ...g, id, blueprint: { ...g.blueprint, ...(cs ? { check_status: cs } : {}) } } }

async function poll() {
  const { runAudienceTests } = await import('../nicheBrain/audience.js')
  await runAudienceTests(() => {})
}

describe('the viewers wait for a final honesty check', () => {
  it('only an unchecked script in the queue: no grading call, no row, no write', async () => {
    queue = () => [withStatus('g-pending', 'unchecked')]
    await poll()
    expect(calls.model).toBe(0)
    expect(calls.audienceTests).toEqual([])
    expect(calls.generationsUpdates).toEqual([])
  })
  it('an unchecked script is passed over for one whose check is final', async () => {
    queue = () => [withStatus('g-pending', 'unchecked'), withStatus('g-final', 'checked')]
    await poll()
    expect(calls.model).toBeGreaterThan(0)
    expect(calls.audienceTests.every((r) => r.generation_id !== 'g-pending')).toBe(true)
    expect(calls.audienceTests.some((r) => r.generation_id === 'g-final')).toBe(true)
  })
  it('each final state is accepted, and a script never sent to the check is too', async () => {
    const { checkSettled } = await import('../nicheBrain/audience.js')
    for (const cs of ['checked', 'general', 'needs_answers', 'not_fully_checked']) expect(checkSettled({ check_status: cs })).toBe(true)
    expect(checkSettled({})).toBe(true)
    expect(checkSettled({ check_status: 'unchecked' })).toBe(false)
  })
})
