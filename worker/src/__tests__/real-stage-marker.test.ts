// Batch 8.5 — the `simulated:` marker and the scaffold boundary.
//
// These two values are the operational record's answer to "what did the worker
// actually just do". Neither is load-bearing for correctness, which is exactly
// why they rot: nothing fails when they are wrong, so nothing tells you.
//
// The marker was already wrong before this batch. `REAL_STAGES` was a static
// set of three that did not include `directing`, so every `stage_started` event
// for a REAL director call recorded `simulated: true`. Phase 8 adds three more
// conditionally-real stages; replicating that four times over is worse than
// fixing it once, so the marker now consults the flags that actually decide —
// and these tests are what keep it consulting them.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// editorV2 imports db/env at module load — stub the required env so the dynamic
// re-imports below succeed. No live connection is ever made here.
process.env.SUPABASE_URL ||= 'https://stub.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'stub-service-role-key'

const ORIGINAL = { ...process.env }
afterEach(() => {
  process.env = { ...ORIGINAL }
  vi.resetModules()
})
beforeEach(() => { vi.resetModules() })

async function loadWith(flags: Record<string, string | undefined>) {
  process.env = { ...ORIGINAL, ...flags }
  vi.resetModules()
  return import('../jobs/editorV2.js')
}

describe('the always-real stages do not depend on any flag', () => {
  it('inspecting / transcribing / analyzing are real with every flag unset', async () => {
    const { isRealStage } = await loadWith({
      EDITOR_DIRECTOR_ENABLED: undefined, EDITOR_RENDER_ENABLED: undefined,
    })
    for (const s of ['inspecting', 'transcribing', 'analyzing'] as const) {
      expect(isRealStage(s)).toBe(true)
    }
  })
})

describe('directing — the inaccuracy this batch fixed', () => {
  it('is NOT real when the director flag is unset', async () => {
    const { isRealStage } = await loadWith({ EDITOR_DIRECTOR_ENABLED: undefined })
    expect(isRealStage('directing')).toBe(false)
  })

  it('IS real when the director flag is set — the case the old static set got wrong', async () => {
    const { isRealStage } = await loadWith({ EDITOR_DIRECTOR_ENABLED: 'true' })
    expect(isRealStage('directing')).toBe(true)
  })
})

describe('the render flag fails CLOSED', () => {
  it('compiling / rendering / validating are simulated with the flag unset', async () => {
    const { isRealStage } = await loadWith({ EDITOR_RENDER_ENABLED: undefined })
    for (const s of ['compiling', 'rendering', 'validating'] as const) {
      expect(isRealStage(s)).toBe(false)
    }
  })

  it('all three become real on exactly "true"', async () => {
    const { isRealStage } = await loadWith({ EDITOR_RENDER_ENABLED: 'true' })
    for (const s of ['compiling', 'rendering', 'validating'] as const) {
      expect(isRealStage(s)).toBe(true)
    }
  })

  const notTrue = ['false', 'TRUE', '1', 'yes', '', ' ', 'true ', 'truthy']
  for (const v of notTrue) {
    it(`MUTATION: ${JSON.stringify(v)} does NOT enable the renderer`, async () => {
      // `!== 'true'` rather than `=== 'false'`, so a typo, an empty string or a
      // stray space all fail closed instead of enabling a renderer nobody asked
      // for. ' true ' is trimmed and DOES enable — that is the one intended
      // leniency and it is asserted separately rather than left ambiguous.
      const { isRealStage } = await loadWith({ EDITOR_RENDER_ENABLED: v })
      expect(isRealStage('compiling')).toBe(v.trim() === 'true')
    })
  }

  it('the two flags are INDEPENDENT — enabling one does not enable the other', async () => {
    const a = await loadWith({ EDITOR_DIRECTOR_ENABLED: 'true', EDITOR_RENDER_ENABLED: undefined })
    expect(a.isRealStage('directing')).toBe(true)
    expect(a.isRealStage('compiling')).toBe(false)
    const b = await loadWith({ EDITOR_DIRECTOR_ENABLED: undefined, EDITOR_RENDER_ENABLED: 'true' })
    expect(b.isRealStage('directing')).toBe(false)
    expect(b.isRealStage('compiling')).toBe(true)
  })
})

describe('an unknown stage is never real', () => {
  it('refuses to vouch for a stage it does not know', async () => {
    const { isRealStage } = await loadWith({ EDITOR_RENDER_ENABLED: 'true' })
    expect(isRealStage('queued' as never)).toBe(false)
    expect(isRealStage('completed' as never)).toBe(false)
  })
})
