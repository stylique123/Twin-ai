import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { askForBeat, askIsGeneric } from '../beatAsk.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '../../../../..')

/** The exact sentence that shipped on all five unanswered beats of 4608dc73. */
const SHIPPED = 'Only you can supply this. What would you actually say here?'

/** The sections that generation actually carried, in order. */
const SECTIONS = ['Setup', 'Inciting Incident', 'False Resolution', 'Re-hook', 'Two-Front War']

describe('the detector knows the ask that actually ships', () => {
  it('flags the shipped sentence as generic', () => {
    expect(askIsGeneric(SHIPPED)).toBe(true)
  })

  it('still flags the older generic shapes', () => {
    for (const s of ['Tell me about yourself', 'Describe your journey', 'Share your story']) {
      expect(askIsGeneric(s)).toBe(true)
    }
  })

  it('does not flag a real question about a real moment', () => {
    expect(askIsGeneric('How many units had you sold before Amazon lost the pallet?')).toBe(false)
  })
})

describe('five beats get five questions', () => {
  it('no two of that generation’s beats now share an ask', () => {
    const asks = SECTIONS.map((s) => askForBeat(s, SHIPPED))
    expect(new Set(asks).size).toBe(SECTIONS.length)
  })

  it('none of them is the shipped blank question', () => {
    for (const s of SECTIONS) expect(askForBeat(s, SHIPPED)).not.toBe(SHIPPED)
  })

  it('the writer’s own question wins when it is specific', () => {
    const real = 'What did the customer actually say when you called them back?'
    expect(askForBeat('Inciting Incident', real)).toBe(real)
  })

  it('"Two-Front War" is read as a stakes beat, not as an unknown', () => {
    // It matches the conflict/stakes pattern, which is a better question than
    // echoing the section name back. Asserting the echo here was the first
    // version of this test, and it was the TEST that was wrong.
    expect(askForBeat('Two-Front War', SHIPPED)).toMatch(/hardest part/i)
  })

  it('a genuinely unrecognised section names itself rather than asking about nothing', () => {
    const a = askForBeat('Bridge', SHIPPED)
    expect(a).toMatch(/bridge/i)
    expect(a).not.toMatch(/Only you can supply/i)
  })

  it('a missing section still asks something answerable', () => {
    const a = askForBeat('', SHIPPED)
    expect(a.length).toBeGreaterThan(10)
    expect(askIsGeneric(a)).toBe(false)
  })
})

describe('the edge function uses it', () => {
  const src = readFileSync(
    resolve(REPO, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')

  it('the literal fallback is gone from the assignment', () => {
    expect(src).toMatch(/const q = askForBeat\(/)
    expect(src).not.toMatch(/const q = f\.ask \?\? 'Only you can supply this/)
  })

  it('beatAsk is imported exactly once', () => {
    const hits = src.match(/from '\.\.\/_shared\/beatAsk\.ts'/g) ?? []
    expect(hits).toHaveLength(1)
  })
})
