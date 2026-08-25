/**
 * ⚠️ THE PICKER IS THE ONLY PLACE THIS MATTERS. The note tells a creator that
 * the five buttons in front of them are closer to one button — it is worthless
 * anywhere else, and absent from the picker it is worthless entirely.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'pages', 'Result.tsx'), 'utf8')

describe('the collision note reaches the hook picker', () => {
  it('uses the shared check, not a local one', () => {
    const imp = SRC.match(/import \{([^}]*)\} from '@twinai\/shared'/)
    expect(imp).not.toBeNull()
    expect(imp![1].split(',').map((x) => x.trim())).toContain('hookVarietyNote')
  })

  // ⚠️ BOTH SURFACES. The page renders the picker twice; one is not a fix.
  it('renders at both hook pickers', () => {
    expect((SRC.match(/\{hookVarietyNote\(b\.hook_options\) && \(/g) ?? []).length).toBe(2)
  })

  it('sits with the options it describes', () => {
    const pairs = SRC.match(
      /Pick an opening line — it updates your script below\.<\/p>[\s\S]{0,400}?\{hookVarietyNote\(b\.hook_options\) && \(/g) ?? []
    expect(pairs.length).toBe(2)
  })

  // ⚖️ CONDITIONAL, so a varied menu shows nothing. 8 of 41 generations have a
  // mere pair sharing an opener and must stay silent.
  it('is conditional', () => {
    expect(SRC).not.toMatch(/\{true && \([\s\S]{0,80}hookVarietyNote/)
  })

  // ⚖️ IT NEVER GATES THE CHOICE. Every hook stays pickable.
  it('does not disable any option', () => {
    const at = SRC.indexOf('{hookVarietyNote(b.hook_options) && (')
    const block = SRC.slice(at, at + 300)
    expect(block).not.toMatch(/disabled|readOnly|pointer-events-none/)
  })
})
