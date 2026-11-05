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
    expect(EDGE).toMatch(/writerLoopOn\(writerLoopFlag, trialOn, user\.id\)/)
  })
})

describe('plan v7.1 S7: the CTA is last', () => {
  it('moves the CTA line to the end without adding or dropping', async () => {
    const { moveCtaLast } = await import('../script/planner/spineComplete')
    const s = [{ section: 'hook', line: 'A' }, { section: 'cta', line: 'Link in bio.' }, { section: 'build', line: 'B' }]
    const r = moveCtaLast(s)
    expect(r.moved).toBe(true)
    expect(r.script.map((b) => b.line)).toEqual(['A', 'B', 'Link in bio.'])
    expect(moveCtaLast(r.script).moved).toBe(false)
  })
  it('the edge runs it on the WRITER_LOOP stage', () => {
    expect(EDGE).toMatch(/writerLoopOn\(writerLoopFlag, trialOn, user\.id\) && blueprint[\s\S]{0,300}moveCtaLast\(/)
  })
})

describe('plan v7.1 V5/V6: the voice is used and repaired', () => {
  it('V6: profile samples first, else her pasted text split into real sentences', async () => {
    const { sampleLinesFrom } = await import('../script/planner/writerLoop')
    expect(sampleLinesFrom(['One line.'], 'ignored')).toEqual(['One line.'])
    expect(sampleLinesFrom([], 'Short. I glaze every mug twice before the kiln. Clay never lies to you about the heat.')).toEqual(
      ['I glaze every mug twice before the kiln.', 'Clay never lies to you about the heat.'])
  })
  it('V5: the rhythm repair runs on a failed check, is kept only when the score rises, on the WRITER_LOOP stage', () => {
    expect(EDGE).toMatch(/const idx = before\.pass \? \[\] : rhythmMisses\(voiceCard, now\)/)
    expect(EDGE).toMatch(/voiceCheck\(voiceCard, trial\)\.score <= voiceCheck\(voiceCard,/)
  })
})

describe('plan v7.1 WP4: her stored stories reach the pile', () => {
  it('complete story passages for her voice are read on the WRITER_LOOP stage, as her experience', () => {
    expect(EDGE).toMatch(/from\('story_passages'\)[\s\S]{0,200}\.eq\('kind', 'story'\)\.eq\('complete', true\)/)
    expect(EDGE).toMatch(/kind: 'experience'[\s\S]{0,300}source_ref: `passage:/)
  })
})

describe('plan v7.1: her own way to show the product reaches the writer', () => {
  it('the show_action fact rides the show line on the WRITER_LOOP stage', () => {
    expect(EDGE).toMatch(/const herShowAction = ownedEntity && writerLoopOn\(writerLoopFlag, trialOn, user\.id\)[^\n]*f\.field === 'show_action'/)
    expect(EDGE).toMatch(/HER OWN WAY TO SHOW IT/)
  })
})

describe('plan v7.1 WP6: her audience pain themes reach the writer, labelled outside', () => {
  it('renders as topics only, with the never-her-experience rule', () => {
    const out = renderWriterLoop({ answers: [], pillars: [], profile: 'standard', painThemes: ['beans go stale within a week'] })
    expect(out).toMatch(/outside research; topics only/)
    expect(out).toMatch(/Never present it as her experience, never quote it/)
    expect(out.indexOf('outside research')).toBeLessThan(out.indexOf('THE HOUSE STRUCTURE'))
  })
  it('the edge reads the pain map for her niche on the WRITER_LOOP stage', () => {
    expect(EDGE).toMatch(/const loopPainThemes: string\[\] = await[\s\S]{0,300}writerLoopOn\(writerLoopFlag, trialOn, user\.id\)[\s\S]{0,400}painItemsFromMap\(/)
    expect(EDGE).toMatch(/painThemes: loopPainThemes/)
  })
})

describe('plan v7.1 WP14: the WRITER_LOOP ramp', async () => {
  const { writerLoopOn, loopBucket } = await import('../script/planner/writerLoop')
  it('a percentage serves trial accounts plus that share of real creators, stably', () => {
    const ids = Array.from({ length: 400 }, (_, i) => `user-${i}`)
    const at = (p: string) => ids.filter((id) => writerLoopOn(p, false, id)).length / ids.length
    expect(at('25')).toBeGreaterThan(0.15)
    expect(at('25')).toBeLessThan(0.35)
    expect(ids.filter((id) => writerLoopOn('5', false, id)).every((id) => writerLoopOn('25', false, id))).toBe(true)
    expect(writerLoopOn('25', true, 'x')).toBe(true)
    expect(writerLoopOn('25', false, null)).toBe(false)
    expect(loopBucket('a')).toBe(loopBucket('a'))
  })
})

describe('advisor 28 Oct: script hygiene runs on the WRITER_LOOP stage', () => {
  it('outside text includes the reference and the niche brain block; her words include knowledge and answers', () => {
    expect(EDGE).toMatch(/writerLoopOn\(writerLoopFlag, trialOn, user\.id\) && Deno\.env\.get\('SCRIPT_HYGIENE'\) !== 'off'/)
    expect(EDGE).toMatch(/const outside = \[reference_note \?\? '', [^\n]*brainBlock\]/)
  })
})

describe('plan v7.1 ramp: the question step and the voice card reach real creators', async () => {
  const { voiceCardOn } = await import('../script/voice/voiceCard')
  it('VOICE_CARD_ENABLED: all = everyone; a share = trial plus that share; unset and true stay trial-only', () => {
    expect(voiceCardOn(false, false, 'all', 'u1')).toBe(true)
    expect(voiceCardOn(false, false, undefined, 'u1')).toBe(false)
    expect(voiceCardOn(false, false, 'true', 'u1')).toBe(false)
    expect(voiceCardOn(true, false, '5', 'u1')).toBe(true)
    expect(voiceCardOn(false, false, 'false', 'u1')).toBe(false)
    const ids = Array.from({ length: 400 }, (_, i) => `u${i}`)
    const share = ids.filter((id) => voiceCardOn(false, false, '25', id)).length / ids.length
    expect(share).toBeGreaterThan(0.15)
    expect(share).toBeLessThan(0.35)
  })
  it('the angle plan opens for the WRITER_LOOP share of real creators', () => {
    expect(EDGE).toMatch(/const testAccount = sideDoorOpen\(\) \|\| writerLoopOn\(writerLoopFlag, false, user\.id\)\n\s+if \(!testAccount \|\| Deno\.env\.get\('ANGLES_QUESTIONS_KILL'\)/)
    expect(EDGE).toMatch(/voiceCardOn\(trialOn, fictional, voiceCardFlag, user\.id\)/)
  })
})

describe('advisor review: a real creator in the 5% share goes through the honesty checks', async () => {
  const { inventionGateOn, writerLoopOn } = await import('../script/planner/writerLoop')
  const { componentOn } = await import('../script/releaseFlags')
  const ids = Array.from({ length: 1000 }, (_, i) => `real-${i}`)
  const inShare = ids.filter((id) => writerLoopOn('5', false, id))
  it('every real creator in the WRITER_LOOP share gets the invention gate, with the release registry at its default (S0)', () => {
    expect(inShare.length).toBeGreaterThan(20)
    for (const id of inShare) {
      const release = componentOn('invention_gate', { userId: id, isTestAccount: false })
      expect(release).toBe(false)
      expect(inventionGateOn(release, false, '5', id)).toBe(true)
    }
  })
  it('outside the share and with WRITER_LOOP unset, a real creator is unchanged; the kill switch wins', () => {
    const outside = ids.find((id) => !writerLoopOn('5', false, id))!
    expect(inventionGateOn(false, false, '5', outside)).toBe(false)
    expect(inventionGateOn(false, false, undefined, inShare[0])).toBe(false)
    expect(inventionGateOn(true, true, '5', inShare[0])).toBe(false)
  })
  it('the edge uses it at both invention-gate sites', () => {
    expect(EDGE).toMatch(/const inventionOn = inventionGateOn\(newOn\('invention_gate'\), [^\n]*writerLoopFlag, user\.id\)/)
    expect(EDGE.match(/if \(inventionOn && /g)?.length).toBe(2)
    expect(EDGE).not.toMatch(/if \(newOn\('invention_gate'\)/)
  })
})

describe('advisor review of #1351 (a): the novel-detail and invented-cause checks run for a real creator (trialOn=false) in the share', async () => {
  const { lateChecksOn, writerLoopOn } = await import('../script/planner/writerLoop')
  const { dropInventedCauses } = await import('../script/inventedCause')
  const { dropNovelSentences } = await import('../script/novelDetail')
  const ids = Array.from({ length: 1000 }, (_, i) => `real-${i}`)
  const inShare = ids.filter((id) => writerLoopOn('5', false, id))
  it('the switch: on for every real creator in the share, off outside it and with WRITER_LOOP unset', () => {
    for (const id of inShare) expect(lateChecksOn(false, '5', id)).toBe(true)
    expect(lateChecksOn(false, '5', ids.find((id) => !writerLoopOn('5', false, id)))).toBe(false)
    expect(lateChecksOn(false, undefined, inShare[0])).toBe(false)
    expect(lateChecksOn(true, undefined, 'x')).toBe(true)
  })
  it('the checks themselves cut on a real creator\'s script: they take no trial argument', () => {
    const script = [
      { section: 'hook', line: 'Most people store coffee beans wrong.' },
      { section: 'body', line: 'Beans go stale fast because the weather shifts every week.' },
      { section: 'body', line: 'Keep them in an airtight tin away from light.' },
      { section: 'body', line: 'I use equal parts sealed jar and dark cupboard, and the dread of a flat cup keeps me honest.' },
      { section: 'cta', line: 'Save this for your next bag.' },
    ]
    const support = 'Keep beans in an airtight tin away from light. Most people store coffee beans wrong. Save this for your next bag.'
    const causes = dropInventedCauses(script, support)
    expect(causes.cut).toBeGreaterThan(0)
    const novel = dropNovelSentences(script, support)
    expect(novel.removed.length).toBeGreaterThan(0)
    expect(dropInventedCauses.length).toBe(2)
  })
  it('the edge gates the whole late block on lateChecksOn, and the three checks sit inside it', () => {
    const at = EDGE.indexOf("if (lateChecksOn(trialOn, writerLoopFlag, user.id) && Array.isArray(bp.script)) {")
    expect(at).toBeGreaterThan(0)
    let depth = 0, end = at
    for (let i = EDGE.indexOf('{', at); i < EDGE.length; i++) { const c = EDGE[i]; if (c === '{') depth++; else if (c === '}' && --depth === 0) { end = i; break } }
    const block = EDGE.slice(at, end)
    for (const call of ['dropInventedCauses(', 'dropInventedEvents(', 'dropNovelSentences(']) expect(block).toContain(call)
  })
})

describe('panel 13 (owner 5 Nov): WRITER_LOOP_ACCOUNTS', async () => {
  const { loopFlagFor, writerLoopOn, lateChecksOn, inventionGateOn } = await import('../script/planner/writerLoop')
  const { voiceCardOn } = await import('../script/voice/voiceCard')
  it('a listed account gets the whole stack on the real path; empty list changes nobody', () => {
    const f = loopFlagFor(undefined, ' p-1 , P-2 ', 'p-2')
    expect(f).toBe('all')
    expect(writerLoopOn(f, false, 'p-2')).toBe(true)
    expect(lateChecksOn(false, f, 'p-2')).toBe(true)
    expect(inventionGateOn(false, false, f, 'p-2')).toBe(true)
    expect(voiceCardOn(false, false, loopFlagFor(undefined, 'p-2', 'p-2'), 'p-2')).toBe(true)
    expect(loopFlagFor(undefined, '', 'p-2')).toBeUndefined()
    expect(loopFlagFor('5', 'p-1', 'someone-else')).toBe('5')
    expect(loopFlagFor('off', 'p-1', null)).toBe('off')
  })
  it('the edge reads both switches through it, once, and nowhere directly', () => {
    expect(EDGE).toMatch(/const writerLoopFlag = loopFlagFor\(Deno\.env\.get\('WRITER_LOOP'\), Deno\.env\.get\('WRITER_LOOP_ACCOUNTS'\), user\.id\)/)
    expect(EDGE.match(/Deno\.env\.get\('WRITER_LOOP'\)/g)?.length).toBe(1)
    expect(EDGE.match(/Deno\.env\.get\('VOICE_CARD_ENABLED'\)/g)?.length).toBe(1)
  })
})

describe('panel 13 (advisor): a fictional voice listed in WRITER_LOOP_ACCOUNTS gets the voice card and the stack', async () => {
  const { loopFlagFor, writerLoopOn, lateChecksOn, inventionGateOn } = await import('../script/planner/writerLoop')
  const { voiceCardOn } = await import('../script/voice/voiceCard')
  const id = 'panel-1'
  it('real path (trialOn=false), fictional voice, env unset: every switch is on for the listed account only', () => {
    for (const fictional of [true, false]) expect(voiceCardOn(false, fictional, loopFlagFor(undefined, id, id), id)).toBe(true)
    const wl = loopFlagFor(undefined, id, id)
    expect(writerLoopOn(wl, false, id)).toBe(true)
    expect(lateChecksOn(false, wl, id)).toBe(true)
    expect(inventionGateOn(false, false, wl, id)).toBe(true)
    expect(voiceCardOn(false, true, loopFlagFor(undefined, id, 'other'), 'other')).toBe(false)
  })
  it('the kill switch still wins over the list', () => {
    expect(voiceCardOn(false, true, loopFlagFor('false', id, id), id)).toBe(false)
    expect(writerLoopOn(loopFlagFor('off', id, id), false, id)).toBe(false)
  })
  it('the edge passes the listed flag to the voice card at generation and on its screen', () => {
    expect(EDGE).toContain("if (!voiceCardOn(trialOn, fictional, voiceCardFlag, user.id)) return null")
    expect(EDGE).toMatch(/voiceCardOn\(false, false, voiceCardFlag, user\.id\)/)
  })
})
