import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const PAGE = readFileSync(resolve(__dirname, '../pages/v2/V2Building.tsx'), 'utf8')
const CARD = readFileSync(resolve(__dirname, '../components/VideoPlanCard.tsx'), 'utf8')
const EDGE = readFileSync(resolve(__dirname, '../../../../supabase/functions/generate-blueprint/index.ts'), 'utf8')

describe('what the plan card shows is what the writer gets (round 2, 2.4)', () => {
  it('sends the exact on-list and the server uses it verbatim', () => {
    expect(PAGE).toMatch(/use_knowledge_ids: ids[\s\S]{0,40}\(usedKnowledgeIds \?\? idsAtWrite\.current\)/)
    expect(EDGE).toMatch(/const speakable = chosenRows \?\?/)
  })
  it('seeds once per item set, measured against her paragraph only', () => {
    expect(PAGE).toMatch(/seededFor\.current === sig/)
    expect(PAGE).not.toMatch(/about=\{\[state\.reference_note/)
  })
  it('shows plain words, never a raw fraction', () => {
    expect(CARD).toMatch(/from what you've told us/)
    expect(CARD).not.toMatch(/of \{items\.length\}/)
  })
})
