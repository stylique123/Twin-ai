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
import { readKnowledgeItem, type KnowledgeItem } from '../creatorKnowledge'

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

// ⚠️ THIS BUILT A BARE OBJECT LITERAL AND CALLED IT EVIDENCE. `KnowledgeItem`
//  requires `confidence`, `sourceRef`, `sourceUrl`, `lastObservedAt` and three
//  more; the literal supplied five fields and none of those. With tsc never
//  reading test files it passed as `evidence`, so `filledFrom` was being handed
//  a shape the store cannot produce.
//
//  ⚖️ BUILT BY `readKnowledgeItem`, the same function that turns a stored row
//  into an item in production, so the fixture is production-shaped by
//  construction rather than by my remembering seven field names. It returns
//  null for a row it REFUSES, and throwing on that means a fixture which could
//  not exist fails the test relying on it.
const item = (text: string, source: 'user' | 'caption' = 'user'): KnowledgeItem => {
  const read = readKnowledgeItem({
    kind: 'experience', text, basis: 'stated', source, timesSeen: 1,
  })
  if (read === null) throw new Error(`fixture rejected by readKnowledgeItem: ${text}`)
  return read
}

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
    // ⚠️ BUILT BY HAND, AND THAT IS THE POINT. `readKnowledgeItem` REFUSES blank
    //  text outright (`if (!text) return null`), so blank evidence cannot reach
    //  `filledFrom` from storage — this asserts `filledFrom`'s OWN defence
    //  against an input the layer above already excludes. Routing it through the
    //  reader like every other fixture here would not test that; it would throw.
    const blank = { ...item('placeholder'), text: '  ' }
    const r = beat({ label: 'lesson', evidence: [blank, item('Real point.')] })
    expect(filledFrom([r], new Map()).get('lesson')?.text).toBe('Real point.')
  })
})
