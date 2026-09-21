import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanActionPosing, renderDirectionGuidance } from '../performanceDirection'

/**
 * ⚠️ MEASURED 2026-09-21 ACROSS ALL 154 STORED GENERATIONS. Five beats — one
 * whole run of three, all on 2026-09-20 — shipped `action_posing` beginning
 * with the taxonomy key that selected it:
 *
 *   "hold_up: Hold it up to chest height, steady, label facing the lens."
 *   "set_down: Put it down deliberately and look back at the lens."
 *
 * The guidance prints its menu as `- <id>: <does> — <bestFor>` and asks the
 * writer to pick an id and write it in the creator's own words. Sometimes it
 * writes the id too. An enum key is not something a person can do, and it
 * arrives under a heading that promises direction.
 */

describe('the key that chose the direction never reaches the creator', () => {
  it('strips a leaked taxonomy key', () => {
    expect(cleanActionPosing('hold_up: Hold it up to chest height, steady.'))
      .toBe('Hold it up to chest height, steady.')
    expect(cleanActionPosing('set_down: Put it down deliberately.'))
      .toBe('Put it down deliberately.')
    expect(cleanActionPosing('point_at: Point one finger at the cracked seam.'))
      .toBe('Point one finger at the cracked seam.')
  })

  it('leaves untouched the direction that never leaked', () => {
    const clean = 'Rest it flat on an open palm, showing the silky smooth surface.'
    expect(cleanActionPosing(clean)).toBe(clean)
  })

  // ⚠️ A REAL SENTENCE CAN OPEN WITH A COLON CLAUSE. "Hold it up: label to the
  // lens" is what a director writes, and its first word is not an id. Only a
  // lowercase snake_case token that this module actually defines is eaten.
  it('does not eat a legitimate clause that happens to carry a colon', () => {
    const real = 'Hold it up: label to the lens, then lower it.'
    expect(cleanActionPosing(real)).toBe(real)
    const notAnId = 'wide_shot: stand back from the bench.'
    expect(cleanActionPosing(notAnId)).toBe(notAnId)
  })

  it('is idempotent, so running it twice cannot strip a second clause', () => {
    const once = cleanActionPosing('hold_up: Hold it up to chest height.')
    expect(cleanActionPosing(once)).toBe(once)
  })

  it('handles absent and non-string values without throwing', () => {
    expect(cleanActionPosing(undefined)).toBe('')
    expect(cleanActionPosing(null)).toBe('')
    expect(cleanActionPosing(42)).toBe('')
    expect(cleanActionPosing('   ')).toBe('')
  })

  // ⚠️ AND THE SECOND HALF OF THE SAME DEFECT. Run 3 of the same test shipped
  // "Point one finger at a specific spot on it." — the menu's own placeholder,
  // copied verbatim. "it" tells a creator holding three objects nothing.
  it('tells the writer that "it" is a blank, not a word to copy', () => {
    const guidance = renderDirectionGuidance({ kind: 'PHYSICAL_PRODUCT', showability: 'ALWAYS' } as never)
    expect(guidance).toMatch(/NEVER write the id itself/)
    expect(guidance).toMatch(/is a BLANK, not a word to copy/)
  })
})

const EDGE = readFileSync(
  join(__dirname, '..', '..', '..', '..', '..', 'supabase', 'functions', 'generate-blueprint', 'index.ts'),
  'utf8',
)

describe('the writer runs the hygiene pass before it ships', () => {
  it('calls it on the final blueprint', () => {
    expect(EDGE).toMatch(/cleanActionPosing\(b\.action_posing\)/)
  })

  // ⚖️ COUNTABLE, like every other refusal in this file. A strip that happens
  // silently cannot tell anyone the prompt has drifted back.
  it('records when it had to strip one', () => {
    expect(EDGE).toMatch(/action_posing_key_stripped/)
  })
})

describe('the strip is countable, because it erases its own evidence', () => {
  // ⚠️ THE SIBLING PASSES LEAVE THEIR RESULT IN THE BLUEPRINT, so "did it fire"
  // is a query over the rows. This one REMOVES the key — afterwards a repaired
  // beat is indistinguishable from one that never leaked. If the count were
  // only a log line, a prompt drifting back would be invisible the moment edge
  // logs expire, which is the exact failure this repo keeps digging out.
  it('records both numbers on the durable audit, not only in a log line', () => {
    expect(EDGE).toMatch(/beatAudit\.action_posing_hygiene = actionPosingHygiene/)
    expect(EDGE).toMatch(/actionPosingHygiene = \{ stripped, of: seen \}/)
  })

  // ⚖️ "2 stripped" says nothing without "of 6 beats that carried a direction".
  it('carries the denominator, so the number is a rate and not a tally', () => {
    expect(EDGE).toMatch(/stripped, of: seen/)
  })

  it('is registered with the counter-durability gate', () => {
    const registry = readFileSync(
      join(__dirname, '..', '..', '..', '..', '..', 'scripts', 'ci', 'check_counter_durability.mjs'),
      'utf8',
    )
    expect(registry).toMatch(/action_posing_key_stripped:\s*\{/)
    expect(registry).toMatch(/beat_audit\.action_posing_hygiene/)
  })
})
