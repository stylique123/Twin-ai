// LENGTH WAS NEVER A DECISION, SO IT WAS WHATEVER THE MODEL FELT LIKE.
//
// ⚠️ TWO READINGS POINTING OPPOSITE WAYS. A 15-second reference produced a
// 48-second script; a 226-second reference produced a 60-second one. Both land
// near a minute because a minute is what gets written when nobody says
// otherwise — and `scriptLength` beside this module already measured the same
// thing from the other end: 17 of 35 production scripts run >25% longer than
// the reference they adapted and 10 run >25% shorter.
//
// ⚠️ THE PROMPT ALREADY SAYS "target_sec is a real decision in seconds". A
// decision with no budget is a preference, and the frozen experiment showed
// which way that preference runs: removing the substance requirement made the
// writer produce 64% MORE, not less.
import { describe, expect, it } from 'vitest'
//
// ── AND THEN THE RULE CHANGED, BY DECISION, NOT BY DEFECT ────────────────
//
// ⚠️ THE ASSERTIONS BELOW USED TO PIN THE OPPOSITE PRECEDENCE, AND THEY WERE
// NOT WRONG — they were a correct pin of a rule the owner has since overturned.
// Named so a future reader does not read the rewrite as a test being relaxed:
//
//   `takes the reference the creator chose`      the reference no longer decides
//   `falls back to the goal`                     goal no longer decides
//   `refuses to invent a number`                 tier 3 is now a real number
//   `says NOTHING on a reference build`          the screen now knows her pick
//
// ⚖️ OWNER'S RULING, 2026-09-09: "The explicit pick wins. The reference cannot
// know how long her video should be." Three rungs — her pick, her stored
// default, 60 — and the reference becomes a PREFILL for the picker.
import {
  targetSeconds, resolveTarget, suggestedTarget, asPicked,
  durationBudget, durationBrief, durationMiss,
  FALLBACK_TARGET_SEC, PICKABLE_SECONDS, MIN_TARGET_SEC, MAX_TARGET_SEC, TOLERANCE,
} from '../script/durationContract'
import { WPM_PRESETS, estimateDurationSec } from '../recordingScript'

describe('the ladder, and the order the owner set', () => {
  it('her explicit pick always wins', () => {
    // ⚠️ INCLUDING AGAINST A REFERENCE THAT DISAGREES. The 226-second teardown
    // used to clamp this to 90 whatever she asked for; that is the exact
    // override the ruling removes.
    expect(resolveTarget({ pickedSeconds: 30, referenceSeconds: 226 }))
      .toEqual({ targetSec: 30, source: 'picked' })
    expect(resolveTarget({ pickedSeconds: 90, storedDefaultSeconds: 30 }))
      .toEqual({ targetSec: 90, source: 'picked' })
  })

  it('her stored default answers when she did not pick this time', () => {
    expect(resolveTarget({ storedDefaultSeconds: 45 }))
      .toEqual({ targetSec: 45, source: 'stored_default' })
    // Clamped into the window, because a stored 300 is not a short-form video.
    expect(resolveTarget({ storedDefaultSeconds: 300 }).targetSec).toBe(MAX_TARGET_SEC)
  })

  it('60 when there is no history, and it SAYS it is the fallback', () => {
    // ⚖️ THE `source` IS THE LOAD-BEARING HALF. 60 from a creator who chose 60
    // and 60 from a creator who was never asked are the same integer and
    // opposite facts; without the label the audit can never ask whether the
    // default is right, because it cannot find the rows nobody picked.
    expect(resolveTarget({})).toEqual({ targetSec: FALLBACK_TARGET_SEC, source: 'fallback' })
    expect(resolveTarget({ referenceSeconds: 45 }))
      .toEqual({ targetSec: FALLBACK_TARGET_SEC, source: 'fallback' })
  })

  it('a length she was never offered is not a choice she made', () => {
    // ⚠️ A STALE CLIENT POSTING 45 has not chosen 45 and has not chosen 60
    // either. Rounding it would record a decision nobody made; falling through
    // to the next rung records the truth, which is that she was not asked.
    expect(asPicked(45)).toBeNull()
    expect(asPicked('60')).toBe(60)
    expect(resolveTarget({ pickedSeconds: 45 }).source).toBe('fallback')
  })

  it('the reference is a SUGGESTION and only ever one of the three', () => {
    // ⚖️ THE PICKER HAS THREE BUTTONS. Suggesting 85 is a suggestion it cannot
    // render, and rendering it as 90 while auditing 85 is two numbers for one
    // video.
    for (const ref of [6, 30, 45, 62, 226]) {
      const sug = suggestedTarget(ref)
      expect(PICKABLE_SECONDS as readonly number[], String(ref)).toContain(sug as number)
    }
    expect(suggestedTarget(226)).toBe(90)
    expect(suggestedTarget(6)).toBe(30)
    // ⚠️ AND IT DECIDES NOTHING. This is the whole ruling in one assertion.
    expect(resolveTarget({ referenceSeconds: 226 }).targetSec).not.toBe(90)
  })

  it('no reference means no suggestion, not a pretend one', () => {
    expect(suggestedTarget(null)).toBeNull()
    expect(suggestedTarget(0)).toBeNull()
    expect(suggestedTarget(Number.NaN)).toBeNull()
  })

  it('targetSeconds is the ladder and nothing else', () => {
    expect(targetSeconds({ pickedSeconds: 30 })).toBe(30)
    expect(targetSeconds({})).toBe(FALLBACK_TARGET_SEC)
    expect(MIN_TARGET_SEC).toBeLessThan(MAX_TARGET_SEC)
  })
})

describe('the budget uses the recorder\'s own rate, not a second one', () => {
  it('the word count round-trips through estimateDurationSec', () => {
    // ⚠️ THIS IS THE LOAD-BEARING ASSERTION. If the brief asks for a length the
    // teleprompter then reports as a different one, the script has two runtimes
    // and the creator is shown the one that disagrees with the brief.
    const b = durationBudget(60)
    expect(b.words).toBe(WPM_PRESETS.natural)
    const line = Array.from({ length: b.words }, () => 'word').join(' ')
    expect(Math.round(estimateDurationSec(line))).toBe(60)
  })

  it('honours a non-default recorder speed', () => {
    expect(durationBudget(60, 'fast').words).toBe(WPM_PRESETS.fast)
  })

  it('gives a band, not a point', () => {
    // ⚖️ A writer forced to hit exactly 112 words pads or truncates a sentence
    // to do it, which is a worse script for an exactly-correct number.
    const b = durationBudget(45)
    expect(b.minWords).toBeLessThan(b.words)
    expect(b.maxWords).toBeGreaterThan(b.words)
    expect(b.maxWords - b.words).toBe(Math.round(b.words * TOLERANCE))
  })

  it('leaves the SHAPE to the writer — a range of beats, never a count', () => {
    // ⚖️ At 45 seconds this permits 3 to 9 beats: the difference between a
    // story and a list, and both are legitimate videos of the same length.
    const b = durationBudget(45)
    expect(b.minBeats).toBeLessThan(b.maxBeats)
    expect(b.minBeats).toBeGreaterThanOrEqual(3)
  })

  it('a very short video still gets a workable beat range', () => {
    const b = durationBudget(MIN_TARGET_SEC)
    expect(b.minBeats).toBeGreaterThanOrEqual(3)
    expect(b.maxBeats).toBeGreaterThan(b.minBeats)
  })
})

describe('the brief the writer actually reads', () => {
  it('names the seconds, the words, the beat range and WHICH RUNG decided', () => {
    const text = durationBrief({ pickedSeconds: 30 })
    expect(text).toMatch(/30 seconds/)
    expect(text).toMatch(/because they asked for it/)
    expect(text).toMatch(/\b\d+ spoken words/)
    expect(text).toMatch(/between \d+ and \d+ beats/)
    expect(durationBrief({})).toMatch(/nobody has picked one yet/)
    expect(durationBrief({ storedDefaultSeconds: 45 })).toMatch(/length they usually make/)
  })

  it('when the substance runs out it says WRITE FEWER AND STOP — never pad', () => {
    // ⚠️⚠️ THE OWNER'S RULING AND THE FROZEN EXPERIMENT'S FINDING IN ONE LINE.
    // Removing the substance requirement made the model write 64% MORE. A brief
    // that names sixty seconds and says nothing about running out of things to
    // say is an instruction to fill the gap.
    const b = durationBudget(90)
    const text = durationBrief({ pickedSeconds: 90 }, 'natural', { availableBeats: 3 })
    expect(b.minBeats).toBeGreaterThan(3)
    expect(text).toMatch(/ONLY ENOUGH SUBSTANCE FOR 3 BEATS/)
    expect(text).toMatch(/Write 3 and STOP/)
    expect(text).toMatch(/comes out shorter than 90 seconds and that is the correct outcome/)
    expect(text).toMatch(/Do NOT repeat a point/)
  })

  it('when there is MORE substance than the target holds, it names what it dropped', () => {
    // ⚖️ CUT A POINT, DO NOT SPEED UP. A script that covers eight points in
    // thirty seconds is unsayable, and the creator finds that out at the
    // teleprompter rather than here.
    const b = durationBudget(30)
    const text = durationBrief({ pickedSeconds: 30 }, 'natural', { availableBeats: b.maxBeats + 4 })
    expect(text).toMatch(/MORE SUBSTANCE THAN 30 SECONDS HOLDS/)
    expect(text).toMatch(/Cut whole points rather than speeding up/)
    expect(text).toMatch(/name what you left out/)
  })

  it('says neither thing when nobody counted the substance', () => {
    // ⚠️ NULL IS NOT ZERO. An uncounted budget reaching the brief as "enough
    // substance for 0 beats" would tell the writer to write nothing.
    const text = durationBrief({ pickedSeconds: 60 }, 'natural', { availableBeats: null })
    expect(text).not.toMatch(/ONLY ENOUGH SUBSTANCE/)
    expect(text).not.toMatch(/MORE SUBSTANCE THAN/)
    expect(durationBrief({ pickedSeconds: 60 })).toBe(text)
  })
})

describe('the miss, once the script exists', () => {
  it('reports over and under separately, and zero when inside the band', () => {
    const b = durationBudget(60)
    expect(durationMiss(b.words, {})).toMatchObject({ overBy: 0, underBy: 0 })
    expect(durationMiss(b.maxWords + 30, {}).overBy).toBe(30)
    expect(durationMiss(b.minWords - 10, {}).underBy).toBe(10)
    // ⚖️ NEVER BOTH AT ONCE. One number that could mean either direction is the
    // shape that makes a counter unreadable.
    expect(durationMiss(b.maxWords + 30, {}).underBy).toBe(0)
  })

  it('measures against HER target, not the reference', () => {
    const b = durationBudget(30)
    expect(durationMiss(b.words, { pickedSeconds: 30, referenceSeconds: 226 }).targetSec).toBe(30)
  })
})

// ── AND THE EDGE ASKS FOR IT ──────────────────────────────────────────────
//
// ⚖️ THE EDGE CANNOT IMPORT @twinai/shared, so the rule lives twice and this
// copy is the tested one. Without these the contract would be a module nobody
// reads — which is the defect class this whole session has been closing.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const EDGE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..',
    'supabase', 'functions', 'generate-blueprint', 'index.ts'), 'utf8')

describe('the writer is actually told the length', () => {
  it('puts the brief in the prompt, not merely in a variable', () => {
    // ⚠️ A COMPUTED STRING THAT NEVER REACHES THE TEMPLATE is exactly the shape
    // `creator_summary` had for a whole release: written, stored, never read.
    expect(EDGE).toMatch(/\$\{durationBriefLine\}- beat_plan:/)
    // ⚠️⚠️ AND IT IS FED HER PICK, NOT THE REFERENCE. This assertion is the
    // ruling: if `ref?.duration_sec` ever reappears in this call the reference
    // is deciding the length again.
    expect(EDGE).toMatch(/durationBriefInline\(body\.target_seconds, null, availableBeats\)/)
    const call = EDGE.slice(EDGE.indexOf('const durationBrief_ ='))
    expect(call.slice(0, 200)).not.toMatch(/duration_sec/)
  })

  it('the substance count happens BEFORE the prompt, not in the audit', () => {
    // ⚠️ ORDER IS THE WHOLE POINT. "There is only enough substance for N beats"
    // is a fact the writer needs before writing; counted afterwards it could
    // only ever describe padding that already happened.
    const counted = EDGE.indexOf('const substanceBudgetComputed = substanceBudgetInline(')
    const briefed = EDGE.indexOf('const durationBrief_ =')
    const prompt = EDGE.indexOf('${durationBriefLine}- beat_plan:')
    expect(counted, 'the budget computation was not found').toBeGreaterThan(-1)
    expect(counted).toBeLessThan(briefed)
    expect(briefed).toBeLessThan(prompt)
  })

  it('an uncounted budget never reaches the brief as zero', () => {
    expect(EDGE).toMatch(
      /const availableBeats = substanceBudgetComputed\.enforceable \? substanceBudgetComputed\.beats : null/)
  })

  it('the two copies agree on every constant', () => {
    expect(EDGE).toMatch(new RegExp(`const MIN_TARGET_SEC_INLINE = ${MIN_TARGET_SEC}\\b`))
    expect(EDGE).toMatch(new RegExp(`const MAX_TARGET_SEC_INLINE = ${MAX_TARGET_SEC}\\b`))
    expect(EDGE).toMatch(new RegExp(`const DURATION_TOLERANCE_INLINE = ${TOLERANCE}\\b`))
    expect(EDGE).toMatch(new RegExp(`const FALLBACK_TARGET_SEC_INLINE = ${FALLBACK_TARGET_SEC}\\b`))
    expect(EDGE).toMatch(
      new RegExp(`const PICKABLE_SECONDS_INLINE: readonly number\\[\\] = \\[${PICKABLE_SECONDS.join(', ')}\\]`))
  })

  it('the two copies walk the SAME LADDER, in the same order', () => {
    // ⚠️ CONSTANTS AGREEING IS NOT THE RULE AGREEING. Two copies could hold the
    // same three numbers and consult them in a different order, which is the
    // only thing the ruling is about.
    const fn = EDGE.slice(EDGE.indexOf('function resolveTargetInline'))
    // ⚠️ THE BODY, NOT THE SIGNATURE. The first version of this test sliced
    // from the `function` keyword, so `storedDefault` matched in the PARAMETER
    // LIST and came out ahead of the first rung — a false failure that said
    // nothing about the order anything is consulted in.
    const body = fn.slice(fn.indexOf('const p = asPickedInline'), fn.indexOf('\n}'))
    expect(body.indexOf('asPickedInline')).toBeLessThan(body.indexOf('storedDefault'))
    expect(body.indexOf('storedDefault')).toBeLessThan(body.indexOf('FALLBACK_TARGET_SEC_INLINE'))
    // ⚖️ AND THE REFERENCE IS NOT IN IT AT ALL.
    expect(body).not.toMatch(/reference|duration_sec/)
  })

  it('the edge uses the recorder rate it already has, not a new one', () => {
    // ⚖️ `NATURAL_WPM_INLINE` is the same 150 wpm `estimateDurationSecInline`
    // measures with, so the brief cannot ask for a length the teleprompter
    // reports differently.
    const fn = EDGE.slice(EDGE.indexOf('function durationBriefInline'))
    expect(fn.slice(0, 1200)).toMatch(/NATURAL_WPM_INLINE/)
    expect(fn.slice(0, 1200)).not.toMatch(/\b150\b/)
  })

  it('the two copies teach the same sentence, not only the same numbers', () => {
    // ⚠️ THE PROSE DRIFTS BEFORE THE NUMBERS DO — one copy gets reworded and
    // the other keeps teaching the old rule, with every constant still equal.
    // These fragments carry no interpolation, so they compare exactly.
    const mine = durationBrief({ pickedSeconds: 30 }, 'natural', { availableBeats: 2 })
    const roomy = durationBrief({ pickedSeconds: 30 }, 'natural', { availableBeats: 40 })
    for (const fragment of [
      'LENGTH IS DECIDED, NOT DISCOVERED.',
      'spoken words at a natural pace — write between',
      'Do NOT repeat a point, restate the hook',
      'and that is the correct outcome',
    ]) {
      expect(mine, fragment).toContain(fragment)
      expect(EDGE, fragment).toContain(fragment)
    }
    for (const fragment of [
      'Cut whole points rather than speeding up',
      'name what you left out in one clause',
    ]) {
      expect(roomy, fragment).toContain(fragment)
      expect(EDGE, fragment).toContain(fragment)
    }
  })

  it('the audit records which rung answered, not only the number', () => {
    expect(EDGE).toMatch(/length_target: lengthTarget,/)
    expect(EDGE).toMatch(/length_target_source: lengthTargetSource,/)
    expect(EDGE).toMatch(/duration_contract: durationAuditInline\(declared, body\.target_seconds, null\)/)
  })
})

// ── AND THE CREATOR SEES IT BEFORE THE MONEY MOVES ────────────────────────
//
// ⚠️ THEY USED TO FIND OUT HOW LONG THEIR VIDEO WAS BY READING THE FINISHED
// SCRIPT. Nothing on the building screen said what Twin was aiming for, so
// there was no moment at which a wrong target could be noticed — and the
// measured spread (48 seconds from a 15-second reference, 60 from a 226-second
// one) is exactly the thing a creator would have caught at a glance.
const CARD = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..',
    'apps', 'web', 'src', 'pages', 'v2', 'V2Building.tsx'), 'utf8')

describe('the target is shown, and it is HER number', () => {
  it('uses the writer\'s own function, never a second estimate', () => {
    // ⚖️ IF THIS LINE AND THE BRIEF COULD DISAGREE, the number a creator reads
    // would not be the number the script is written to.
    expect(CARD).toMatch(/const targetSec = targetSeconds\(\{ pickedSeconds: state\.target_seconds \}\)/)
  })

  it('no longer goes silent on a reference build', () => {
    // ⚠️ IT USED TO, AND THE REASON WAS SOUND AT THE TIME: the length came from
    // `transcripts.duration_sec`, which this screen does not have because the
    // ingest has not finished when it renders. The ruling removes the reason
    // rather than the silence — her pick arrived in nav state before this
    // screen mounted, so the number is knowable on every build.
    expect(CARD).not.toMatch(/const targetSec = state\.reference_url/)
    expect(CARD).toMatch(/state\.target_seconds/)
  })
})
