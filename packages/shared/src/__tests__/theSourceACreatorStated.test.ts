// THE ONE SOURCE THAT MEANS A PERSON SAID IT, AND THE READER DID NOT KNOW IT.
//
// ⚠️ MEASURED ON PRODUCTION 2026-09-05. `creator_knowledge` holds 610 `caption`
// rows and 478 `transcript` rows across 26 creators — and ZERO rows carrying a
// source the creator supplied directly. Meanwhile `answer-beat-ask` has written
// `source: 'asked'` since migration 0128, calling it "the only source in this
// product a creator STATED rather than a model inferred", and
// `KNOWLEDGE_SOURCES` did not contain it.
//
// ⚖️ SO NOTHING WAS BROKEN YET, AND THAT IS WHY IT SURVIVED. With no stored
// `asked` row, every reader agreed and every test passed. The defect was waiting
// for the first creator to answer a beat ask — a constraint that has only ever
// seen the population it was written for looks like a working constraint.
import { describe, it, expect } from 'vitest'
import { readKnowledgeItem, KNOWLEDGE_SOURCES, type KnowledgeItem } from '../creatorKnowledge'
import { filledFrom } from '../writerInput'
import type { TemplateResolution } from '../knowledgeResolver'

const beat = (evidence: KnowledgeItem[]): TemplateResolution => ({
  container: { id: 'b', about: 'why it matters', needs: 'opinion' },
  source: 'creator_knowledge',
  evidence,
  fallback: null,
  label: 'lesson',
  entityId: null,
  provenance: { by: 'unresolved', from: [] },
})

const read = (source: string): KnowledgeItem => {
  const r = readKnowledgeItem({
    kind: 'experience', text: 'I was making two dollars a loaf.',
    basis: 'stated', source, timesSeen: 1,
  })
  if (r === null) throw new Error(`fixture rejected by readKnowledgeItem: ${source}`)
  return r
}

describe('the union names the source its only live writer writes', () => {
  it('contains `asked`', () => {
    expect(KNOWLEDGE_SOURCES).toContain('asked')
  })

  it('keeps it through the reader instead of validating it away', () => {
    // ⚠️ THIS IS THE WHOLE DEFECT IN ONE LINE. `readKnowledgeItem` returns
    // `undefined` for any source outside the union, so before this change the
    // highest-provenance row in the product lost its provenance on the way in.
    expect(read('asked').source).toBe('asked')
  })

  it('and still refuses a source nobody declared', () => {
    // The validation is not weakened to make the case above pass.
    expect(read('a_source_nobody_declared').source).toBeUndefined()
  })
})

describe('what the writer is told about where a sentence came from', () => {
  it('attributes a creator-stated fact to `asked`', () => {
    expect(filledFrom([beat([read('asked')])], new Map()).get('lesson')?.attribution)
      .toBe('asked')
  })

  it('does NOT hand the writer an empty attribution for an unknown source', () => {
    // ⚠️ THE MEASURED SYMPTOM, AND IT IS NOT THE OBVIOUS ONE. An unknown source
    // reads as `undefined`, and `[undefined].join(', ')` is the EMPTY STRING —
    // not the word "undefined". So the beat arrived with `attribution: ''`,
    // which is present-and-falsy: a validator asking "is this attributed?" sees
    // a string, and a validator asking "to what?" sees nothing. `null` is the
    // value the field already uses for "nothing to attribute".
    const a = filledFrom([beat([read('a_source_nobody_declared')])], new Map())
      .get('lesson')?.attribution
    expect(a).not.toBe('')
    expect(a).toBeNull()
  })

  it('drops only the unknown one when a beat mixes sources', () => {
    // ⚖️ ONE UNREADABLE ITEM MUST NOT ERASE THE PROVENANCE OF THE OTHERS, and it
    // must not appear as a phantom empty entry in the list either.
    const a = filledFrom([beat([read('caption'), read('a_source_nobody_declared'), read('asked')])], new Map())
      .get('lesson')?.attribution
    expect(a).toBe('caption, asked')
  })

  it('still names each origin once', () => {
    expect(filledFrom([beat([read('asked'), read('asked'), read('caption')])], new Map())
      .get('lesson')?.attribution).toBe('asked, caption')
  })
})
