// Audit 2026-09-29, the Brazil case: a tapped-out fact reached the writer.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { twinIds } from '../planUse.js'

const B = readFileSync(new URL('../../../../../apps/web/src/pages/v2/V2Building.tsx', import.meta.url), 'utf8')
const A = readFileSync(new URL('../../../../../apps/web/src/lib/creatorAnswers.ts', import.meta.url), 'utf8')

describe('tapping a fact off takes its twin out too', () => {
  const rows = [
    { id: 'shown', text: 'Offers a signature Brazil roast geared toward espresso, roasted to order' },
    { id: 'twin', text: 'Uses Brazil green coffee roasted for espresso as her signature roast' },
    { id: 'other', text: 'Offers an Ethiopia light roast with blueberry and milk chocolate notes' },
  ]
  it('finds the near-duplicate the card hid', () => {
    const ids = twinIds(rows, 'shown')
    expect(ids).toContain('twin')
    expect(ids).not.toContain('other')
  })
  it('both cards use one toggle that saves the tap to her rows at once', () => {
    expect((B.match(/onToggle=\{toggleLeftOut\}/g) ?? []).length).toBe(2)
    expect(B).toMatch(/void rememberLeftOut\(ids, leaving\)/)
    expect(A).toMatch(/update\(\{ creator_excluded_at: leftOut \? new Date\(\)\.toISOString\(\) : null \}\)/)
  })
})
