import { describe, it, expect } from 'vitest'
import { specById, fillSlots, planQuestions, validateQuestion, presumesItHappened, presumedVentures, type Asked } from '../questionSpecs.js'
import { gateAnswer } from '../answerGate.js'
import fixture from './fixtures/simulatedMoments.json' with { type: 'json' }

// SIMULATED answers (AI-written, owner 2026-10-04), in memory only. Walks the
// real planner + answer check: ask → answer → next slot → zero questions.
type M = { id: string; option: string; slot: string; answer: string; expect?: string }
const moments = fixture.moments as M[]
const now = Date.parse('2026-10-05T12:00:00Z')

function walk(optionId: string, extra: Record<string, string> = {}) {
  const spec = specById(optionId)!
  const facts: Array<{ text: string; option: string; slot: string }> = []
  const history: Asked[] = []
  const log: string[] = []
  for (let run = 1; run <= 8; run++) {
    const plan = planQuestions(spec, fillSlots(spec, { facts }, now), history, run)
    if (!plan.ask.length) { log.push(`run ${run}: ZERO questions — using ${plan.using.map((u) => u.slot).join(', ') || '(nothing)'}`); break }
    const slot = plan.ask[0]!.slot
    const m = moments.find((x) => x.option === optionId && x.slot === slot.id && !x.expect)
    const answer = m?.answer ?? extra[slot.id]
    if (!answer) { history.push({ slot: slot.id, wording: `q${run}`, outcome: 'nothing', run }); log.push(`run ${run}: asks ${slot.id} → "nothing like that happened" (counts as answered)`); continue }
    const g = gateAnswer(answer, slot, now)
    history.push({ slot: slot.id, wording: `q${run}`, outcome: g.outcome === 'filler' ? 'filler' : 'answered', run })
    if (g.outcome === 'answered' && !g.hold.length) facts.push({ text: answer, option: optionId, slot: slot.id })
    log.push(`run ${run}: asks ${slot.id} → ${m ? `${m.id} (simulated)` : 'extra (simulated)'}: "${answer.slice(0, 70)}…" → ${g.outcome}${g.hold.length ? ` HELD: ${g.hold.join('; ')}` : ''}`)
  }
  return log
}

describe('answered path, on the simulated moments', () => {
  const out: Record<string, string[]> = {
    'product:launch': walk('product:launch', { who_for: 'For people who drink grocery-store coffee and want to try something brighter without fuss.' }),
    'product:restock': walk('product:restock'),
    'product:story': walk('product:story', { turn: 'I tasted a cup anyway and it was fine, so I kept the batch and kept going.' }),
    'product:dm': walk('product:dm', { reply: 'Pour over is where it shines, it is bright and fruity.' }),
  }
  it('each option reaches zero questions, and no answered slot is asked twice', () => {
    for (const [opt, log] of Object.entries(out)) {
      expect(log.at(-1), opt).toMatch(/ZERO questions/)
      const asked = log.filter((l) => / asks /.test(l)).map((l) => l.split(' asks ')[1]!.split(' ')[0])
      expect(new Set(asked).size, opt).toBe(asked.length)
    }
  })
  it('Launch asks what\'s new, then why now, then who it is for', () => {
    expect(out['product:launch']!.slice(0, 3).map((l) => l.split(' asks ')[1]!.split(' ')[0])).toEqual(['whats_new', 'why_now', 'who_for'])
  })
  it('a skip on what\'s new re-asks what\'s new (different words), not who it is for', () => {
    const l = specById('product:launch')!
    const p = planQuestions(l, {}, [{ slot: 'whats_new', wording: 'q', outcome: 'skipped', run: 1 }], 2)
    expect(p.ask[0]).toMatchObject({ angle: 'different' })
    expect(p.ask[0]!.slot.id).toBe('whats_new')
  })
  it('"nothing like that happened" does not push a slot toward resting', () => {
    const r = specById('product:restock')!
    const p = planQuestions(r, {}, [{ slot: 'said_while_gone', wording: 'q', outcome: 'nothing', run: 1 }], 2)
    expect(p.resting).not.toContain('said_while_gone')
    expect(p.ask.map((a) => a.slot.id)).not.toContain('said_while_gone')
  })
})

describe('neutral wording and presumed nouns (owner 2026-10-05)', () => {
  it.each([
    'What was the exact comment a customer sent you while this was out of stock?',
    'What split-second error happened at the roaster?',
    'Where were you when you committed?',
  ])('presumes it happened: %s', (q) => expect(presumesItHappened(q)).toBe(true))
  it.each([
    'Did anyone say anything while it was out? If so, what?',
    'Was there a moment at the roaster that changed this batch?',
    'Has a customer ever told you what they drank instead while it was gone?',
  ])('neutral: %s', (q) => expect(presumesItHappened(q)).toBe(false))
  it('a moment question that presumes is rejected', () => {
    const r = specById('product:restock')!
    expect(validateQuestion('What was the exact comment a customer sent you while this was out of stock?', { spec: r, slot: r.slots.find((x) => x.id === 'said_while_gone')!, asked: [] }))
      .toEqual({ ok: false, reason: 'presumes_it_happened' })
  })
  it.each(['your podcast', 'your team', 'your studio', 'your shop', 'your roasting mornings', 'your events'])('presumed when her facts never name it: %s', (n) => {
    expect(presumedVentures(`What happens in ${n} that nobody sees?`, 'Sunflower Coffee Roasters roasts small batches.').length).toBeGreaterThan(0)
  })
})
