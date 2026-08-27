import { describe, it, expect } from 'vitest'
import { renderDefaultRegisterCard } from '../defaultRegisterCard'

describe('the labeled genre default (Voice Cause 1a)', () => {
  it('is never silent — it always returns real guidance', () => {
    const card = renderDefaultRegisterCard()
    expect(card.length).toBeGreaterThan(50)
  })

  // ⚠️ THE WHOLE POINT: NEVER PRESENTED AS THIS CREATOR'S VOICE.
  it('is honestly labeled as a generic default, not measured', () => {
    const card = renderDefaultRegisterCard()
    expect(card).toMatch(/generic default/i)
    expect(card).toMatch(/not measured/i)
  })

  it('is deterministic', () => {
    expect(renderDefaultRegisterCard()).toBe(renderDefaultRegisterCard())
  })
})
