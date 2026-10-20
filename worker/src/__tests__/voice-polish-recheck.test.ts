// Panel-10: the voice card at the worker's async polish. Fake model, fake clock,
// fictional voice only (Coach Ana, scripts/ops/fixtures/fictional-panel.json).
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { buildCreatorVoiceCard } from '../generated/voiceCard.js'

beforeAll(() => {
  process.env.SUPABASE_URL ||= 'https://stub.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'stub-service-role-key'
})

const FIXTURE = join(fileURLToPath(import.meta.url), '..', '..', '..', '..', 'scripts', 'ops', 'fixtures', 'fictional-panel.json')
const panel = JSON.parse(readFileSync(FIXTURE, 'utf8')) as { creators: Array<{ key: string; voice: { samples: string[]; style_note: string } }> }
const ana = panel.creators.find((c) => c.key === 'coach-ana')!.voice
const card = buildCreatorVoiceCard({ samples: ana.samples }, { richSamples: true }).card!
const voice = { card, style_note: ana.style_note, samples: ana.samples }

const FLAT = [
  'Grab a chair for this one.',
  'Today we will be doing a series of sit-to-stand exercises in a controlled and deliberate manner.',
  'It is important to maintain proper form throughout the entirety of the exercise session.',
  'Follow along for more.',
]
const bp = () => ({ script: FLAT.map((line, i) => ({ section: i ? 'Body' : 'Hook', line })), polish_pending: { steps: ['self_review'] } })
const material = 'Ten slow sit-to-stands. Form first.'

function deps(editor: string, compare = '{"best":"B"}') {
  const prompts: string[] = []
  return {
    prompts,
    d: {
      model: 'fake', now: () => 0, random: () => 0.9,
      callModel: async (system: string, prompt: string) => { prompts.push(prompt); return /compare/i.test(system) ? compare : editor },
    },
  }
}

describe('async polish with her voice', () => {
  it('the editor prompt carries her style note, samples and rhythm rules', async () => {
    const { runPolish } = await import('../jobs/inventionRecheck.js')
    const { d, prompts } = deps('{"rewrites":[]}')
    await runPolish(bp(), material, { voice }, d)
    expect(prompts[0]).toContain(ana.style_note)
    expect(prompts[0]).toMatch(/EXCLAMATIONS/)
    expect(prompts[0]).toContain(ana.samples[0])
  })
  it('keeps a rewrite that sounds more like her and passes the checks', async () => {
    const { runPolish } = await import('../jobs/inventionRecheck.js')
    const b = bp()
    const { d } = deps(JSON.stringify({ rewrites: [{ index: '1', line: "Okay, you! Ten slow sit-to-stands. You've got this!" }, { index: '2', line: 'Form first. Every rep. One more rep!' }] }))
    const r = await runPolish(b, material, { voice }, d)
    expect(r.voice?.reason).toBe('improved')
    expect(r.voice!.after).toBeGreaterThan(r.voice!.before)
    expect(r.verdict).toBe('edited')
  })
  it('drops a rewrite that does not improve her voice score (no compare call)', async () => {
    const { runPolish } = await import('../jobs/inventionRecheck.js')
    const b = bp()
    const { d, prompts } = deps(JSON.stringify({ rewrites: [{ index: '1', line: 'Today we shall perform a number of sit-to-stand repetitions with considerable care and attention to detail.' }] }))
    const r = await runPolish(b, material, { voice }, d)
    expect(r.voice?.reason).toBe('not_better')
    expect(r.verdict).toBe('original')
    expect(prompts.length).toBe(1)
    expect((b.script[1] as { line: string }).line).toBe(FLAT[1])
  })
  it('drops a voice-better rewrite that adds a name (claim/name check)', async () => {
    const { runPolish } = await import('../jobs/inventionRecheck.js')
    const { d } = deps(JSON.stringify({ rewrites: [{ index: '1', line: "Okay, you! Ten slow sit-to-stands with Marcus. You've got this!" }] }))
    const r = await runPolish(bp(), material, { voice }, d)
    expect(r.voice?.reason).toBe('checks_failed')
    expect(r.voice?.fact_checks).toContain('new_name')
    expect(r.verdict).toBe('original')
  })
  it('a malformed voice payload is ignored', async () => {
    const { polishVoiceOf } = await import('../jobs/inventionRecheck.js')
    expect(polishVoiceOf({ card: { id: 1 } })).toBeNull()
    expect(polishVoiceOf(voice)?.card.id).toBe(card.id)
  })
})
