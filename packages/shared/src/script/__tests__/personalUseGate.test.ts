import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  claimsPersonalUse, dropPersonalUseSentences, personalUseGateApplies, personalUseViolations,
} from '../personalUseGate'

describe('the personal-use gate (master fix doc, Fix A)', () => {
  it('catches first-person use, purchase, love and result claims', () => {
    for (const s of [
      "I've been using this pad every night.", 'I use it after every shower.', 'I bought three of them.',
      'I love this bowl.', 'In my experience it lasts for weeks.', 'It completely changed my routine.',
      'This is my go-to for gifts.', 'When I tried it, my skin cleared.', 'I swear by this serum.',
    ]) expect(claimsPersonalUse(s), s).toBe(true)
  })

  it('leaves narration and maker-attributed lines alone', () => {
    for (const s of [
      "I'll show you how it's made.", 'I made this video because you asked.', 'The maker glazes each one by hand.',
      'It holds about two cups.', 'I think most people get this wrong.', "Here's what's inside the box.",
    ]) expect(claimsPersonalUse(s), s).toBe(false)
  })

  it('applies to any chosen product unless she confirmed personal use', () => {
    expect(personalUseGateApplies('NOT_CONFIRMED', true)).toBe(true)
    expect(personalUseGateApplies(null, true)).toBe(true)
    expect(personalUseGateApplies('CONFIRMED', true)).toBe(false)
    expect(personalUseGateApplies('NOT_CONFIRMED', false)).toBe(false)
  })

  it('finds the offending beats and, as a last resort, drops only those sentences', () => {
    const beats = [{ line: 'Meet the petal bowl.' }, { line: 'It is made from stoneware. I use it every morning.' }]
    expect(personalUseViolations(beats)).toEqual([1])
    expect(dropPersonalUseSentences(beats[1].line)).toBe('It is made from stoneware.')
    expect(dropPersonalUseSentences('I love this bowl.')).toBe('')
  })

  it('is wired into generation before the shot list is synced, and clears the rescue on failure', () => {
    const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..')
    const gb = readFileSync(join(repo, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')
    const gate = gb.indexOf('THE PERSONAL-USE GATE (master fix doc, Fix A)')
    const sync = gb.indexOf('const synced = syncShotListSpokenText(')
    expect(gate).toBeGreaterThan(-1)
    expect(gate).toBeLessThan(sync)
    expect(gb.slice(gate, sync)).toMatch(/rescue = null\s+throw new Error\(`personal_use_gate/)
  })
})
