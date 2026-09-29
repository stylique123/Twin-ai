// Audit 2026-09-29 #5: a guessed stance or business is never spoken as hers.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { GUESSED_SUFFIX, guessedMark } from '../../brandTruthPrompt.js'

const EDGE = readFileSync(new URL('../../../../../supabase/functions/generate-blueprint/index.ts', import.meta.url), 'utf8')

describe('guessed profile fields', () => {
  it('only her speech or her confirmation counts as not guessed', () => {
    expect(guessedMark('observed_audio')).toBe('')
    expect(guessedMark('user_confirmed')).toBe('')
    expect(guessedMark('caption_synthesis')).toBe(GUESSED_SUFFIX)
    expect(guessedMark(undefined)).toBe(GUESSED_SUFFIX)
  })
  it('stances and "enemy" from the profile carry the guessed label', () => {
    expect(EDGE).toMatch(/povList\.join\(' \| '\)\}\$\{guessedMark\(provOf\('pov'\)\)\}/)
    expect(EDGE).toMatch(/vp\.enemy\}\$\{guessedMark\(provOf\('enemy'\)\)\}/)
  })
  it('the writer may not invent a business she runs', () => {
    expect(EDGE).toMatch(/NO INVENTED BUSINESS/)
  })
})
