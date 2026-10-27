// WP10 (plan v7.1): THE HONESTY CHECK RUNS AFTER THE LAST TEXT EDIT.
//
// ⚠️ Every pass that rewrites or moves a spoken line — the voice-card repair,
// the rhythm repair (V5), CTA-last (S7), spine completion, the placeholder
// block — must come BEFORE the invention gate is queued, or a line could reach
// her that the gate never read. The check reads the edge source, because the
// order of the code is the order it runs in.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const EDGE = readFileSync(join(REPO, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')
const at = (needle: string) => {
  const i = EDGE.indexOf(needle)
  expect(i, `${needle} moved — re-anchor, do not delete`).toBeGreaterThan(0)
  return i
}

describe('the invention gate is queued after every late edit', () => {
  const gate = () => at("if (newOn('invention_gate') && blueprint && typeof blueprint === 'object') {")
  it.each([
    ['voice card repair', 'voiceCardRepairPrompt(voiceCard, vBeats, misses)'],
    ['rhythm repair (V5)', 'voiceRhythmRepairPrompt(voiceCard, vBeats, idx)'],
    ['CTA last (S7)', 'const r = moveCtaLast(bpc.script'],
    ['spine completion', 'const sc = completeSpine(bps.script'],
    ['placeholder block', 'const pb = blockSpokenPlaceholders(blueprint'],
  ])('%s runs before the gate', (_name, needle) => {
    expect(at(needle)).toBeLessThan(gate())
  })
  it('the reference claim-leak check runs on the written script', () => {
    expect(at('const leaks = findLeakedClaims(')).toBeLessThan(gate())
  })
})
