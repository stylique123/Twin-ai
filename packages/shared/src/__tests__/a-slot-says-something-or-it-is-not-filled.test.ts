// A RESOLUTION SAYS A BEAT CAN BE FILLED. IT DOES NOT SAY WHAT THE BEAT SAYS.
//
// ⚠️ THESE TESTS EXIST FOR THE REFUSALS, not the happy path. `filledFrom` is
// what lets `all_slots_filled` and `no_unsupported_claim` stop being `not_run`
// at the edge, and the whole value of that graduation is that it can still say
// NO. A version of this function that returned an empty string instead of no
// entry would turn every unfillable beat into a filled one and both checks into
// confident passes — the exact failure the edge's comment has been warning
// about while they sat unrun.
import { describe, it, expect } from 'vitest'
import { filledFrom, type EntitySay } from '../writerInput'
import type { TemplateResolution } from '../knowledgeResolver'

const beat = (over: Partial<TemplateResolution>): TemplateResolution => ({
  container: { id: 'b', about: 'why it matters', needs: 'opinion' },
  source: 'creator_knowledge',
  evidence: [],
  fallback: null,
  label: 'b',
  entityId: null,
  provenance: { by: 'unresolved', from: [] },
  ...over,
})

const item = (text: string, source: 'user' | 'caption' = 'user') => ({
  kind: 'experience' as const, text, basis: 'stated' as const, source, timesSeen: 1,
})

describe('filledFrom', () => {
  it('fills a beat from the evidence that resolved it, and names where it came from', () => {
    const f = filledFrom([beat({ label: 'lesson', evidence: [item('I ran it for six months.')] })], new Map())
    expect(f.get('lesson')).toEqual({ text: 'I ran it for six months.', attribution: 'user' })
  })

  it('does NOT fill a beat whose evidence list is empty', () => {
    // ⚠️ The unresolved case. It must be absent, not blank.
    expect(filledFrom([beat({ label: 'lesson' })], new Map()).has('lesson')).toBe(false)
  })

  it('does NOT fill an assigned entity that has nothing confirmed to say', () => {
    // ⚖️ Knowing WHICH product is not knowing what is true about it.
    const say = new Map<string, EntitySay>([['e1', { text: '   ', attribution: 'Acme' }]])
    expect(filledFrom([beat({ label: 'demo', entityId: 'e1' })], say).has('demo')).toBe(false)
  })

  it('does NOT fall back to the evidence ladder for an assigned entity', () => {
    // ⚠️ An entity beat that cannot speak must stop, not quietly borrow a
    // sentence about something else and present it as the product.
    const r = beat({ label: 'demo', entityId: 'e1', evidence: [item('Some unrelated fact.')] })
    expect(filledFrom([r], new Map()).has('demo')).toBe(false)
  })

  it('attributes an entity fill to the entity, not to a knowledge source', () => {
    const say = new Map<string, EntitySay>([['e1', { text: 'It syncs offline.', attribution: 'Acme' }]])
    expect(filledFrom([beat({ label: 'demo', entityId: 'e1' })], say))
      .toEqual(new Map([['demo', { text: 'It syncs offline.', attribution: 'Acme' }]]))
  })

  it('deduplicates sources so an attribution names each origin once', () => {
    const r = beat({ label: 'lesson', evidence: [item('A.'), item('B.'), item('C.', 'caption')] })
    expect(filledFrom([r], new Map()).get('lesson')?.attribution).toBe('user, caption')
  })

  it('drops blank evidence text rather than joining it into whitespace', () => {
    const r = beat({ label: 'lesson', evidence: [item('  '), item('Real point.')] })
    expect(filledFrom([r], new Map()).get('lesson')?.text).toBe('Real point.')
  })
})
