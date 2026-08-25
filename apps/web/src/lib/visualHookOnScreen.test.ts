/**
 * ⚠️ THE DEFECT WAS DELIVERY, NOT GENERATION. The writer produced a visual
 * hook for every generation that has one — 4 of 4 complete — and nothing in
 * the web app, the shared package or the worker ever read it. Two things had
 * to be true and neither was: the Plan screen's normaliser had to stop
 * discarding the field, and the card had to render. This guards both, because
 * either alone leaves the creator with nothing.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'pages', 'Result.tsx'), 'utf8')

describe('the visual hook survives the normaliser', () => {
  // ⚠️ THIS IS WHERE IT DIED. The normaliser rebuilds the blueprint field by
  // field, so any field it does not name is discarded on arrival.
  it('is carried through rather than rebuilt away', () => {
    expect(SRC).toMatch(/visual_hook: raw\.visual_hook/)
  })

  it('and is validated by the shared reader, not trusted raw', () => {
    const imp = SRC.match(/import \{([^}]*)\} from '@twinai\/shared'/)
    expect(imp).not.toBeNull()
    expect(imp![1].split(',').map((x) => x.trim())).toContain('readVisualHook')
    expect(SRC).toMatch(/const visualHook = readVisualHook\(b\.visual_hook\)/)
  })
})

describe('the card reaches the creator', () => {
  it('renders at BOTH hook-picker surfaces, not one', () => {
    expect((SRC.match(/\{visualHook && \(/g) ?? []).length).toBe(2)
    expect((SRC.match(/\{visualHook\.openingFrame\}/g) ?? []).length).toBe(2)
    expect((SRC.match(/\{visualHook\.whyItInterrupts\}/g) ?? []).length).toBe(2)
  })

  // ⚖️ ABSENT IS NOT EMPTY. 37 of 41 generations predate the field, and those
  // creators were never promised a first-second plan. The card must be GONE for
  // them, not present and apologising.
  it('is conditional, so an older generation shows no card at all', () => {
    const at = SRC.indexOf('{visualHook && (')
    expect(at).toBeGreaterThan(-1)
    const block = SRC.slice(at, SRC.indexOf(')}', at))
    expect(block).not.toMatch(/not specified|none|no visual|unknown|n\/a/i)
  })

  // ⚖️ THE HARD UX RULE: it must not make the creator think about Twin's
  // internals. "visual_hook" and "opening_frame" are field names.
  it('is labelled in plain English', () => {
    expect(SRC).toMatch(/Before you say a word/)
    const at = SRC.indexOf('{visualHook && (')
    const block = SRC.slice(at, SRC.indexOf(')}', at))
    expect(block).not.toMatch(/visual_hook|opening_frame|why_it_interrupts/)
  })
})
