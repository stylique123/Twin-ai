// ROUND 4 — PERMANENT REGRESSIONS. The leak behind 1.1/1.2 (and the recurring
// "fabrications" of 2.3, which were her own stored transcript lines) was the
// length-extension pass writing from EVERY stored row. These pin the fix.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { planUseItems, defaultExcluded } from '../script/planUse'
import { whyItWorksFromTest } from '../script/whyItWorksHonesty'

const root = resolve(__dirname, '../../../..')
const EDGE = readFileSync(resolve(root, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')
const PAGE = readFileSync(resolve(root, 'apps/web/src/pages/v2/V2Building.tsx'), 'utf8')
const IDEAS = readFileSync(resolve(root, 'apps/web/src/components/IdeasForYou.tsx'), 'utf8')

describe('1.1 / 1.2: nothing reaches a script the writer was not given', () => {
  // The extension's known text IS the late guards' allowed text (part-4 batch 2026-10-04).
  const knownAt = EDGE.indexOf('const lateAllowedText = [')
  const block = EDGE.slice(knownAt, EDGE.indexOf("].join('\\n')", knownAt))
  it('the extension and integrity passes read only the supplied items, never the whole store', () => {
    expect(EDGE).toMatch(/const knownText = lateAllowedText/)
    expect(block).toMatch(/\(speakable \?\? \[\]\)/)
    expect(block).not.toMatch(/knowledgeRows/)
  })
  it('the extension pass is given that same text', () => {
    expect(EDGE).toMatch(/buildExtensionPrompt\(integrity\.beats, extendDecision, knownText\)/)
  })
  it('her voice profile is scrubbed of private and legal material before the writer sees it', () => {
    expect(EDGE).toMatch(/scrubRejected\(scrubPrivate\(voice\?\.profile \?\? null\)/)
    // Blind set 3 T5: and lines that retell a private fact without a listed word.
    expect(EDGE).toMatch(/scrubLike\(scrubRejected\(scrubPrivate\(voice\?\.profile \?\? null\), herRejected\), guardExcludedTexts\)/)
  })
})

describe('2.2: no invented technique', () => {
  it('the writer is told to stay at her level of precision', () => {
    expect(EDGE).toMatch(/NO INVENTED TECHNIQUE/)
  })
})

describe('3.3 / 3.4: the fact list fits the idea', () => {
  const rows = [
    { id: 'origin', kind: 'experience', source: 'asked', text: 'Someone told me they could taste the difference between my roast and the grocery store bag their mom always bought' },
    { id: 'sticker', kind: 'product', source: 'caption', text: 'MakeStickers custom labels and stickers for coffee small business' },
    ...Array.from({ length: 8 }, (_, i) => ({ id: `c${i}`, kind: 'claim', source: 'transcript', text: `Coffee business note ${i} about Farmington coffee business` })),
  ]
  it('her origin story fits an idea about why she started roasting', () => {
    const items = planUseItems(rows, 'Why I started roasting coffee')
    expect(items.find((i) => i.id === 'origin')?.fits).toBe(true)
  })
  it('a word most of the store shares does not make an item fit', () => {
    const items = planUseItems(rows, 'Why I started my business')
    expect(new Set(defaultExcluded(items)).has('c0')).toBe(true)
  })
})

describe('2.6: structural claims are not proof', () => {
  it('"a second hook partway through" is dropped once real scores exist', () => {
    const out = whyItWorksFromTest(['There is a second hook partway through.', 'Names the customer moment.'], { best: 8, n: 10, flagged: null })
    expect(out.join(' ')).not.toMatch(/second hook/)
  })
})

describe('3.9: each objective keeps its own answers', () => {
  it('switching the objective drops the old objective\'s answers', () => {
    expect(PAGE).toMatch(/const switched = !auto && field === 'video_goal'/)
  })
})

describe('3.10: suggestion cards never offer private or legal material', () => {
  it('cards are filtered with the same rule as the plan', () => {
    expect(IDEAS).toMatch(/SENSITIVE\.test\(/)
  })
})

import { itemCounts } from '../script/numberRole'
describe('2.5: a hyphenated measurement is not a promised list', () => {
  it('"two-pound batches" promises nothing; "two mistakes" still counts', () => {
    expect(itemCounts('the chaotic reality of roasting two-pound specialty coffee batches')).toEqual([])
    expect(itemCounts('a 5-minute routine')).toEqual([])
    expect(itemCounts('two mistakes new roasters make')).toEqual([2])
  })
})

describe('3.7(c): a reload never silently drops the build', () => {
  it('the build input is kept for the tab and restored', () => {
    expect(PAGE).toMatch(/function durableBuildState\(raw: unknown\): BuildState/)
    expect(PAGE).toMatch(/const state = durableBuildState\(loc\.state\)/)
    expect(PAGE).not.toMatch(/\(loc\.state \|\| \{\}\) as BuildState/)
  })
})

describe('3.1: one named subject, one product question', () => {
  it('the picked subject is shown and the second product question is not asked', () => {
    expect(PAGE).toMatch(/data-testid="subject-line"/)
    expect(PAGE).toMatch(/!\(pickedSubjectName && q\.field === 'offer'\)/)
  })
})
