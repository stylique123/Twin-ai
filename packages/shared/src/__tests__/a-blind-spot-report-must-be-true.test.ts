// THE OBSERVER'S BLIND-SPOT REPORT IS ONLY HONEST IF THE NAMES MATCH.
//
// ⚠️ THE DEFECT THIS PREVENTS IS A PACKET THAT LIES CONFIDENTLY. The D1 observer
// tells the watcher "this timeline cannot see whether they rolled" when
// `recording_started` is absent from the stream. If the emitter spells it
// `recording_strated`, the event IS emitted, the observer reports it as a blind
// spot, and the watcher concludes the creator never rolled. A rename on one side
// turns a true report into a false one, silently, with no test failing anywhere
// else in the repo.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { SESSION_EVENTS, logSessionEvent } from '../sessionEvents'
// @ts-expect-error — plain ESM module, no types; the values are what matter.
import { REQUIRED_EVENTS } from '../../../../scripts/d1-core.mjs'

// ⚠️ IMPORTED, NOT TEXT-SLICED. This used to read d1-observer.mjs and regex the
// REQUIRED_EVENTS block out of it between two string markers. That broke the
// moment the block MOVED to d1-core.mjs — and the failure mode of a slice is
// worse than the failure mode of an import: a regex that under-matches returns
// SOME names and the suite still passes, silently checking a subset. The
// extraction to d1-core.mjs made the real value importable (d1-observer.mjs runs
// a CLI at module scope and exits), so the test now reads what the observer
// actually uses.
const requiredEvents = (): string[] => Object.keys(REQUIRED_EVENTS)

describe('what we emit is what the observer looks for', () => {
  it('every declared session event is one the observer requires', () => {
    const required = new Set(requiredEvents())
    expect(required.size).toBeGreaterThan(0)
    for (const name of Object.keys(SESSION_EVENTS)) {
      expect(required.has(name), `${name} is emitted but the observer never looks for it, `
        + 'so it will never appear in a timeline and never be reported as missing').toBe(true)
    }
  })

  it('every event the observer requires is emitted, or comes from somewhere named', () => {
    const emitted = new Set(Object.keys(SESSION_EVENTS))
    // ⚖️ THESE FOUR PREDATE THIS WORK and are emitted elsewhere — page_view in
    // AppShell, gallery_remix in Gallery, and two server-side. They are listed
    // here rather than assumed, so a future removal fails this test instead of
    // quietly becoming a permanent blind spot.
    const preExisting = new Set(['page_view', 'gallery_remix', 'blueprint_generated', 'edit_rendered'])
    for (const name of requiredEvents()) {
      expect(emitted.has(name) || preExisting.has(name),
        `the observer requires ${name} and nothing emits it`).toBe(true)
    }
  })

  it('does not require script_edit, which has a better home', () => {
    // ⚠️ script_edits (0127) carries the BEFORE AND AFTER TEXT. A second, thinner
    // analytics counter for the same act would give two numbers that drift.
    expect(requiredEvents()).not.toContain('script_edit')
    expect(Object.keys(SESSION_EVENTS)).not.toContain('script_edit')
  })
})

describe('telemetry may never interrupt somebody recording a video', () => {
  it('logSessionEvent returns nothing and does not await', () => {
    // ⚖️ SAME RULE AS recordScriptEdit AND recordRoutingDecision. A network
    // hiccup on an analytics insert must not surface as a broken camera.
    expect(logSessionEvent('camera_opened', {})).toBeUndefined()
  })

  it('is spelled the same in the source as in the vocabulary', () => {
    const src = readFileSync(new URL('../sessionEvents.ts', import.meta.url), 'utf8')
    for (const name of Object.keys(SESSION_EVENTS)) expect(src).toContain(`${name}:`)
  })
})
