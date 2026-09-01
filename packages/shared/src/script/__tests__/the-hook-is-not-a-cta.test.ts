import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { craftSectionKind, isCraftSection } from '../craftBeats.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '../../../../..')

/**
 * ⚠️ MEASURED IN PRODUCTION, generation 4608dc73 (2026-09-01). The shipped
 * script was:
 *   beat 1 (hook) "Follow if you want the rest of this."
 *   beat 7 (cta)  "Follow if you want the rest of this."
 * because the craft repair wrote fallbackCta() into EVERY craft beat that
 * asked, and `isCraftSection` says yes to hook, payoff and cta alike.
 */
describe('the section decides the repair', () => {
  it('tells the three craft sections apart', () => {
    expect(craftSectionKind('CTA')).toBe('cta')
    expect(craftSectionKind('Call to action')).toBe('cta')
    expect(craftSectionKind('Hook')).toBe('hook')
    expect(craftSectionKind('Payoff')).toBe('payoff')
  })

  it('a beat naming a CTA at all is a CTA — it is the only one repairable', () => {
    // "Payoff/CTA" and "Hook + CTA" are both real writer output.
    expect(craftSectionKind('Payoff/CTA')).toBe('cta')
    expect(craftSectionKind('Hook + CTA')).toBe('cta')
  })

  it('a non-craft section has no kind, and the two predicates agree', () => {
    for (const s of ['Body', 'Re-hook', 'Setup', '', null, undefined]) {
      expect(craftSectionKind(s)).toBeNull()
      if (s !== 'Re-hook') expect(isCraftSection(s)).toBe(false)
    }
    // Re-hook is explicitly NOT a craft section, and must not become one.
    expect(isCraftSection('Re-hook')).toBe(false)
  })
})

describe('the CTA line can no longer reach the hook', () => {
  const src = readFileSync(
    resolve(REPO, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')

  it('fallbackCta is written only under a cta branch', () => {
    const i = src.indexOf("b.line = fallbackCta(intent.goal")
    expect(i).toBeGreaterThan(-1)
    // The nearest preceding condition must be the cta test, not a bare
    // readsAsPlaceholder — that bare form is exactly the shipped defect.
    const before = src.slice(Math.max(0, i - 260), i)
    expect(before).toMatch(/kind === 'cta'/)
  })

  it('the repair branches on the section kind at all', () => {
    expect(src).toMatch(/const kind = craftSectionKind\(/)
  })

  it('a payoff that asked is left as an ask, never invented', () => {
    // ⚠️ ANCHORED TO THE BLOCK, NOT A BYTE COUNT. This was `slice(i, i + 1600)`
    // and it broke the moment the block grew — reporting a payoff regression
    // when all that had changed was the length of a comment above it.
    const i = src.indexOf('const kind = craftSectionKind(')
    const end = src.indexOf("b.substance = 'general'", i)
    expect(i).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(i)
    const seg = src.slice(i, end)
    // The else branch must continue (leave needs_user), not assign a line.
    expect(seg).toMatch(/} else \{[\s\S]*?continue/)
  })
})
