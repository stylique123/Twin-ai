// THE WRITER RECEIVES THE LOOP (plan v7.1 Q5, Q6, V3, V4, S1, S4).
//
// ⚠️ Her answers for this video, her pillars, her style note and her own lines,
// and the house structure (hook → problem → her story → re-hook → method →
// payoff → one CTA) were each built and never handed to the writer. These pin
// the rendered block and the edge wiring, including the retry.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  HOUSE_STRUCTURE, answersForThisVideo, pillarsFrom, profileForSeconds, renderHouseStructure, renderWriterLoop, writerLoopOn,
} from '../script/planner/writerLoop'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const EDGE = readFileSync(join(REPO, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')

describe('the house structure', () => {
  it('is the owner order, with the re-hook between her story and the method, and the CTA last', () => {
    expect(HOUSE_STRUCTURE.map((b) => b.id)).toEqual(['hook', 'problem', 'proof', 'rehook', 'method', 'payoff', 'cta'])
  })
  it('standard and deep carry a re-hook; sprint leaves it out', () => {
    expect(renderHouseStructure('standard')).toMatch(/Re-hook/)
    expect(renderHouseStructure('deep')).toMatch(/Re-hook/)
    expect(renderHouseStructure('sprint')).not.toMatch(/Re-hook/)
  })
  it('names the phased build-up and the single CTA', () => {
    const s = renderHouseStructure('standard')
    expect(s).toMatch(/ends with a pull into the next/)
    expect(s).toMatch(/exactly one, and it is the last line/)
  })
  it('maps seconds to profiles', () => {
    expect(profileForSeconds(30)).toBe('sprint')
    expect(profileForSeconds(60)).toBe('standard')
    expect(profileForSeconds(90)).toBe('deep')
    expect(profileForSeconds(undefined)).toBe('standard')
  })
})

describe('her answers and pillars', () => {
  it('takes mn:* answers and readiness answers, drops skips and repeats', () => {
    const a = answersForThisVideo({ 'mn:story': 'The first batch cracked in the kiln.', other: 'x', 'mn:skip': 'skip' }, { goal: 'The first batch cracked in the kiln.', offer: 'A starter kit.' })
    expect(a.map((x) => x.text)).toEqual(['The first batch cracked in the kiln.', 'A starter kit.'])
  })
  it('reads pillars as a list or a comma string', () => {
    expect(pillarsFrom({ contentPillars: ['Glazes', 'glazes', 'Kiln days'] })).toEqual(['Glazes', 'Kiln days'])
    expect(pillarsFrom({ contentPillars: 'Glazes, Studio life' })).toEqual(['Glazes', 'Studio life'])
    expect(pillarsFrom(null)).toEqual([])
  })
  it('renders voice first, then answers, pillars and the structure', () => {
    const out = renderWriterLoop({
      answers: [{ key: 'mn:story', text: 'The first batch cracked.' }], pillars: ['Glazes'], profile: 'standard',
      voice: { cardBlock: 'VOICE CARD', styleNote: 'Short, dry.', sampleLines: ['Clay remembers everything.'] },
    })
    const order = ['HER VOICE', 'her answers for THIS video', 'Her content pillars', 'THE HOUSE STRUCTURE'].map((k) => out.indexOf(k))
    expect(order.every((i) => i >= 0)).toBe(true)
    expect([...order].sort((x, y) => x - y)).toEqual(order)
  })
})

describe('the stage switch', () => {
  it('unset is trial only; all is everyone; off is nobody', () => {
    expect(writerLoopOn(undefined, true)).toBe(true)
    expect(writerLoopOn(undefined, false)).toBe(false)
    expect(writerLoopOn('all', false)).toBe(true)
    expect(writerLoopOn('off', true)).toBe(false)
  })
})

describe('the edge wiring', () => {
  it('the block sits straight after the hook rule in the writer brief', () => {
    expect(EDGE).toMatch(/\$\{hookRule\}\$\{writerLoopBlock \?/)
  })
  it('the retry keeps the spine block (S4)', () => {
    expect(EDGE).toMatch(/const familyHookRuleRetry = familyHookRulePlain \+ \(spinePlanBlock \?/)
  })
  it('the voice card is not repeated at the tail when the loop carries it (V4)', () => {
    expect(EDGE).toMatch(/\$\{writerLoopCarriesVoice \? '' : voiceCardBlock\}/)
  })
  it('reads WRITER_LOOP for the stage', () => {
    expect(EDGE).toMatch(/writerLoopOn\(Deno\.env\.get\('WRITER_LOOP'\), trialOn\)/)
  })
})
