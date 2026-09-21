// THE WRITER EXISTS AND THE SCREEN CALLS IT — the half a pure test cannot prove.
//
// ⚠️ `creator_knowledge` HAD THREE WRITERS AND NONE WAS THE IDEA BOX. A
// classifier nobody calls would leave the counter exactly where the owner found
// it, so the call site is pinned here the way `scriptEditWiring` pins its own.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const WRITER = readFileSync(join(HERE, 'creatorAnswers.ts'), 'utf8')
const SCREEN = readFileSync(join(HERE, '..', 'pages', 'v2', 'V2Building.tsx'), 'utf8')

describe('the idea box now reaches the store', () => {
  it('the screen stores what was typed into the idea box', () => {
    expect(SCREEN).toMatch(/storeTypedMaterial\(state\.reference_note, \{/)
  })

  it('and every product-mode answer, not only the idea', () => {
    // The owner submitted "multiple product-mode answers" in the same session
    // and the counter did not move for any of them either.
    expect(SCREEN).toMatch(/for \(const \[field, value\] of Object\.entries\(readinessAnswers\)\)/)
  })

  it('scoped to the voice the script was written for', () => {
    // `owner_id` alone pools one owner's ten voices — the defect 0220 fixed for
    // transcripts and §Q found in this very table.
    expect(SCREEN).toMatch(/voiceId: gen\.brand_voice_id \?\? null/)
    expect(WRITER).toMatch(/voice_id: opts\.voiceId/)
  })
})

describe('it never stands in front of the thing they asked for', () => {
  it('is fired, not awaited', () => {
    // ⚖️ They asked for a video, not a knowledge row. Same posture as
    // `recordScriptEdit`, for the same reason.
    expect(SCREEN).toMatch(/void storeTypedMaterial\(/)
    expect(SCREEN).not.toMatch(/await storeTypedMaterial\(/)
  })

  it('runs AFTER the generation exists, so a refusal cannot cost the script', () => {
    const at = SCREEN.indexOf('void storeTypedMaterial(')
    const gen = SCREEN.indexOf('const gen = await generateBlueprint(')
    expect(gen).toBeGreaterThan(-1)
    expect(at).toBeGreaterThan(gen)
  })

  it('swallows its own failures rather than surfacing them', () => {
    expect(WRITER).toMatch(/console\.warn\('typed material not stored'/)
  })

  it('treats a duplicate as a retry, not a failure', () => {
    expect(WRITER).toMatch(/duplicate key\|unique/)
  })
})

describe('the row is written the way the readers expect to find it', () => {
  it('stamps `last_observed_at`, because they said it just now', () => {
    // The writer ranks partly on recency; a null would make today's sentence
    // look older than a line read off a two-year-old video.
    const fn = WRITER.slice(WRITER.indexOf('export async function storeTypedMaterial'))
    expect(fn.slice(0, 2600)).toMatch(/last_observed_at: new Date\(\)\.toISOString\(\)/)
  })

  it('uses a source the column’s CHECK accepts', () => {
    // An unlisted source is how twelve real answers were marked taken and
    // stored nowhere (0189). `source_ref` carries the `typed:` distinction.
    const fn = WRITER.slice(WRITER.indexOf('export async function storeTypedMaterial'))
    expect(fn.slice(0, 2600)).toMatch(/source: 'asked'/)
    expect(fn.slice(0, 2600)).toMatch(/source_ref: built\.row\.source_ref/)
  })
})
