import { describe, it, expect } from 'vitest'
import { parseResearch, nicheKey, researchPrompt } from './nicheResearchParse.js'

describe('niche researcher (owner 2026-10-01: research every new niche)', () => {
  it('keeps only well-formed lines of known kinds', () => {
    const items = parseResearch([
      'DATE: National Coffee Day | WHEN: Sep 29 | DETAIL: Brands run promos.',
      '**NEWS**: Green coffee prices hit a record | WHEN: now | DETAIL: Arabica futures rose.',
      'COMPETITOR: James Hoffmann | WHEN: - | DETAIL: Coffee educator known for blind tastings.',
      'RANDOM: nope | WHEN: now | DETAIL: x',
      'just text',
    ].join('\n'))
    expect(items.map((i) => i.kind)).toEqual(['date', 'news', 'competitor'])
    expect(items[2].when).toBeNull()
  })
  it('NONE means nothing, and the key matches the writer and the database', () => {
    expect(parseResearch('NONE')).toEqual([])
    expect(nicheKey('Micro Coffee-Roasting  Business!')).toBe('micro coffee roasting business')
    expect(researchPrompt('prenatal fitness', 'Health', '2026-10-01')).toContain('prenatal fitness (part of Health)')
  })
})
