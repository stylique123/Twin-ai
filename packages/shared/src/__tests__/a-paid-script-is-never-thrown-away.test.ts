// THE WRITER SUCCEEDED, AND THE CREATOR GOT "WE HIT A SNAG".
//
// ⚠️ MEASURED, NOT SUSPECTED. One production run spent at 13:01:18.5, the writer
// returned a complete blueprint at 13:02:05.0, and the credit was refunded at
// 13:02:05.6 — 626ms later. Not the model, not a timeout, not the provider. The
// script existed and was thrown away by something that ran after it.
//
// ⚖️ THE SHAPE, WHICH IS WHY THIS IS STRUCTURAL. The region between the writer
// returning and the row being inserted grew from 55 lines on 9 August to 792.
// All of it is ANALYSIS — counting, auditing, repairing — and none of it is a
// prerequisite for the script being worth having. Wrapping each check as it is
// added is a race between the people adding checks and the people remembering to
// guard them, and a paid generation must not depend on who wins.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const EDGE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..',
    'supabase', 'functions', 'generate-blueprint', 'index.ts'), 'utf8')

/** The one call that produces the script. Everything after it is downstream. */
const WRITER = EDGE.indexOf('const raw = await callModel(apiKey, SYSTEM, userPrompt')
/** Where the rescue copy is taken. */
const CAPTURE = EDGE.indexOf('rescue = { bp: structuredClone(templated.bp)')
/** The main catch. */
const CATCH = EDGE.indexOf('  } catch (err) {\n    // ── THE PAID SCRIPT IS SAVED')
/** The refund that used to be the only thing this catch did. */
const REFUND = EDGE.indexOf("p_reason: 'blueprint_refund',")

describe('the script is held somewhere the failure path can reach it', () => {
  it('declares the slot OUTSIDE the try, beside the run id', () => {
    // ⚠️ A `const` inside the try is out of scope in the catch, and touching it
    // there throws a ReferenceError INSIDE the error path — replacing a clean
    // 500 with an unhandled one. The run id carries a comment saying exactly
    // this; the rescue sits beside it for the same reason.
    expect(EDGE).toMatch(/let rescue: \{ bp: unknown; allow: LinkAllowlist; runId: string \} \| null = null/)
    expect(EDGE.indexOf('let rescue:')).toBeLessThan(EDGE.indexOf('  try {\n', EDGE.indexOf('let refunded = false')))
  })

  it('starts NULL, so a failure before the writer refunds exactly as it did', () => {
    // ⚖️ Auth, readiness, the reference stop, a provider error, unparseable
    // JSON — none of those produced a script, and none may return one.
    expect(EDGE).toMatch(/rescue: \{[^}]*\} \| null = null/)
  })

  it('is assigned only AFTER the writer returned', () => {
    expect(CAPTURE).toBeGreaterThan(WRITER)
  })

  it('is assigned exactly once — one writer, one rescuable script', () => {
    expect((EDGE.match(/^\s*rescue = \{/gm) ?? []).length).toBe(1)
  })
})

describe('what is captured is the writer\'s own work, not a half-repaired object', () => {
  it('CLONES rather than aliasing the live blueprint', () => {
    // ⚠️ THE ANALYSIS REGION MUTATES IN PLACE. creator-state rewrites `line`,
    // entitlement repair rewrites beats, substance downgrades are assignments.
    // Holding a reference would rescue whatever state the throw interrupted,
    // which is worse than the writer's own output.
    expect(EDGE).toMatch(/structuredClone\(templated\.bp\)/)
  })

  it('uses structuredClone, not a JSON round-trip', () => {
    // ⚖️ `JSON.parse(JSON.stringify(x))` is itself a throw site, and this is the
    // one line in the function that must never be one.
    const line = EDGE.slice(CAPTURE, CAPTURE + 200)
    expect(line).not.toMatch(/JSON\.(parse|stringify)/)
  })

  it('is taken BEFORE the first thing that can mutate the blueprint', () => {
    // The hook entitlement pass is the earliest mutator after the writer.
    const firstMutator = EDGE.indexOf('const bpH = templated.bp as { hook_options?: unknown }')
    expect(firstMutator).toBeGreaterThan(-1)
    expect(CAPTURE).toBeLessThan(firstMutator)
  })

  it('is taken AFTER the structural normalisation, which is not analysis', () => {
    // ⚖️ Dashes stripped, hooks normalised, spoken placeholders dropped. A
    // rescued script a creator cannot read aloud is not a rescue.
    expect(CAPTURE).toBeGreaterThan(EDGE.indexOf('const templated = dropSpokenPlaceholders('))
  })
})

describe('the catch saves before it refunds', () => {
  it('attempts the save FIRST — order is the entire fix', () => {
    // ⚠️ A refund is not a repair. It returns the credit and destroys the work,
    // and the complaint was never "you charged me".
    const save = EDGE.indexOf('if (rescue) {', CATCH)
    expect(save).toBeGreaterThan(CATCH)
    expect(save).toBeLessThan(REFUND)
  })

  it('returns the saved row instead of the snag', () => {
    const block = EDGE.slice(CATCH, REFUND)
    expect(block).toMatch(/return json\(saved\)/)
  })

  it('still runs the link sanitiser — a rescue may not skip a safety pass', () => {
    // ⚖️ That pass is an INJECTION DEFENCE, not an improvement, and it is
    // documented in outputLinks.ts as never throwing for precisely this reason.
    // Nothing else below the capture is a safety prerequisite: the checks repair
    // a script, they do not license one.
    const block = EDGE.slice(CATCH, REFUND)
    expect(block).toMatch(/sanitizeBlueprintLinks\(rescue\.bp, rescue\.allow\)/)
  })

  it('carries the SAME allowlist the success path built', () => {
    // A second allowlist would be a second answer to "what may this script
    // link to", and the two would drift.
    expect(EDGE).toMatch(/allow: linkAllow/)
  })

  it('keeps the credit, because the creator is getting the script', () => {
    const block = EDGE.slice(CATCH, REFUND)
    expect(block).toMatch(/credits_spent: BLUEPRINT_COST/)
  })

  it('writes NULL counters, never zero', () => {
    // ⚠️ THE THREE-STATE RULE, AND THIS IS THE CASE IT EXISTS FOR. The analysis
    // is what threw, so its counters were never computed. Writing 0 would enter
    // "the writer cited nothing" into the record the next selection decision
    // reads back — a measurement invented by a crash.
    const block = EDGE.slice(CATCH, REFUND)
    expect(block).toMatch(/selection: null/)
    expect(block).toMatch(/beat_audit: null/)
    expect(block).not.toMatch(/selection: 0|beat_audit: 0/)
  })
})

describe('a rescue is a success for the creator and a defect for us', () => {
  it('records it durably, not only in the edge log', () => {
    // ⚠️ Edge logs expire within days, and on 2026-08-16 were unreadable
    // outright. A rescue that leaves no row makes the run look healthy in every
    // count while the analysis region is throwing on real traffic.
    const block = EDGE.slice(CATCH, REFUND)
    expect(block).toMatch(/kind: 'generation_rescued'/)
    expect(block).toMatch(/severity: 'warning'/)
  })

  it('records the ORIGINAL error, so the defect stays diagnosable', () => {
    const block = EDGE.slice(CATCH, REFUND)
    expect(block).toMatch(/error: \(err instanceof Error \? err\.message : String\(err\)\)\.slice\(0, 600\)/)
  })

  it('joins the run to its attempt rows, like the success path does', () => {
    const block = EDGE.slice(CATCH, REFUND)
    expect(block).toMatch(/\.eq\('run_id', rescue\.runId\)/)
  })

  it('does not swallow the failure by returning quietly', () => {
    const block = EDGE.slice(CATCH, REFUND)
    expect(block).toMatch(/event: 'generation_rescued'/)
  })
})

describe('the rescue can never become the reason a refund is skipped', () => {
  it('is wrapped, so a failing save still falls through to the refund', () => {
    const block = EDGE.slice(CATCH, REFUND)
    expect(block).toMatch(/catch \(rescueErr\)/)
    expect(block).toMatch(/console\.error\('rescue failed'/)
  })

  it('refunds the LOSER of an idempotency race and returns the winner', () => {
    // ⚖️ Both requests spent; one row exists. Same rule the success path applies.
    const block = EDGE.slice(CATCH, REFUND)
    expect(block).toMatch(/code === '23505'/)
    expect(block).toMatch(/blueprint_refund_duplicate/)
    expect(block).toMatch(/return json\(won\)/)
  })

  it('leaves the refund path itself untouched below it', () => {
    expect(EDGE).toMatch(/p_reason: 'blueprint_refund',/)
    expect(EDGE).toMatch(/kind: 'generation_failed'/)
  })
})
