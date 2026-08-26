/**
 * ⚠️ THE THIRD WRITTEN-BUT-UNREAD FIELD, and the reader is the whole fix. The
 * split is tested in shared; what those tests cannot catch is `beat_plan` being
 * dropped by the normaliser again, or the card never being handed the plan.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'pages', 'Result.tsx'), 'utf8')

describe('beat_plan survives the normaliser', () => {
  // ⚠️ THIS IS WHERE IT DIED, exactly as visual_hook did.
  it('is carried through rather than rebuilt away', () => {
    expect(SRC).toMatch(/beat_plan: raw\.beat_plan/)
  })
})

describe('the card is actually handed the plan', () => {
  // ⚠️ A COMPONENT THAT NEVER RECEIVES THE PLAN RENDERS NOTHING, and the
  // shared tests stay green while the creator sees nothing — the exact shape
  // of the defect this fixes.
  // ⚠️ THE PROP, NOT THE WHOLE TAG. This pinned the exact call site down to its
  // closing `/>`, so adding ANY further prop broke it while `beatPlan` was still
  // passed at both sites — a false failure that says nothing about the defect
  // above. It now asserts what it means: every call site hands over the plan.
  it('both fallback call sites pass beatPlan', () => {
    const sites = SRC.match(/<BlueprintScriptCards\b[^>]*>/g) ?? []
    expect(sites.length).toBe(2)
    expect(sites.every((t) => /beatPlan=\{b\.beat_plan\}/.test(t))).toBe(true)
  })

  it('and the component accepts it', () => {
    expect(SRC).toMatch(/beatPlan\?: unknown/)
  })

  it('renders through the shared reader, not a local one', () => {
    const imp = SRC.match(/import \{([^}]*)\} from '@twinai\/shared'/)
    expect(imp).not.toBeNull()
    expect(imp![1].split(',').map((x) => x.trim())).toContain('shootingNoteAt')
    expect(SRC).toMatch(/\{shootingNoteAt\(beatPlan, i\) && \(/)
  })

  // ⚖️ NEVER RAW. Rendering beat.proof directly would put a b-roll and a
  // screen-recording request in front of a creator — both are in the real data.
  it('never renders the raw proof field', () => {
    expect(SRC).not.toMatch(/\{[^}]*\.proof\}/)
  })
})
