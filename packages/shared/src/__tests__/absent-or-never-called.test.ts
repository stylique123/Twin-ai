// "THE BLOCK WAS ABSENT" AND "THE BLOCK WAS NEVER COMPUTED" ARE THE SAME PROMPT.
//
// ⚠️⚠️ THE ASSEMBLER IS WIRED AND NOTHING RECORDED WHETHER IT RAN. When the rule
// returns null the prompt section is an empty string — correctly, because a
// hedged shape is still a shape in the model's context. But an empty string is
// also what a prompt carries if the call never happened, and nothing on the
// generation row could tell those apart.
//
// ⚠️ AND "ABSENT" IS THE EXPECTED ANSWER, WHICH IS PRECISELY WHY IT NEEDS
// RECORDING. Measured 2026-09-13 against the cohort key the assembler actually
// uses (niche BUCKETS): 1 of 7 buckets clears MIN_COHORT 20 with 2σ separation —
// entertainment 46v6 σ=5.55 emits; business 91v66 σ=2.00 is silent because the
// bar is a strict `>`; tech 1.73, beauty_fashion 0.77, food 0.65, health 0.00,
// creator 0.00. So `no_block` should be the answer roughly six times in seven,
// and a reader seeing "assembler live, scripts unchanged" would otherwise hunt a
// bug that does not exist.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const EDGE = readFileSync(
  join(ROOT, 'supabase', 'functions', 'generate-blueprint', 'index.ts'), 'utf8')
const SQL = readFileSync(join(ROOT, 'supabase', 'migrations',
  '0207_absent_six_times_in_seven_or_never_called.sql'), 'utf8')

/** Code only — a comment naming a field is not a write. */
const CODE = EDGE.split('\n').filter((l) => {
  const t = l.trim()
  return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*')
}).join('\n')

describe('the block is ABSENT, never hedged — the rule this exists to protect', () => {
  /** The renderer, isolated: everything between its signature and the next decl. */
  const renderer = (() => {
    const at = CODE.indexOf('function renderDominantShapeInline')
    expect(at).toBeGreaterThan(-1)
    return CODE.slice(at, CODE.indexOf('\nconst POINT_ROLES_INLINE', at))
  })()

  it('null renders the empty string — no section at all', () => {
    expect(renderer).toMatch(/if \(b === null\) return ''/)
  })

  it('it carries NO lift field, in any spelling', () => {
    // ⚠️ THE OWNER'S STANDING CONDITION, AND `cohort.ts` STATES THE REASON: a
    // hedged field in the model's context is still a field, and the model will
    // use it. Not `lift: unknown`, not `lift: 1.0`. Absent.
    expect(renderer).not.toMatch(/\blift\b/i)
  })

  it('and no confidence, certainty or sample hedge either', () => {
    expect(renderer).not.toMatch(/\bconfidence\b/i)
    expect(renderer).not.toMatch(/\bcertainty\b/i)
    expect(renderer).not.toMatch(/\b(low|weak|tentative|approximate)\b/i)
  })

  it('it still says the block claims frequency, NOT performance', () => {
    expect(renderer).toMatch(/NOT how well it performed/)
    expect(renderer).toMatch(/contributes NO WORDS/)
  })
})

describe('the four outcomes are computed and kept apart', () => {
  it('corpus_unread is distinguished from no_block', () => {
    // ⚠️ THE ONE THAT MATTERS. Both emit an identical empty prompt section, but
    // one is the gate working and the other is a broken read. Folding them
    // together would hide the defect inside the expected answer forever.
    expect(CODE).toMatch(/!corpusCardsComplete\s*\n?\s*\?\s*'corpus_unread'/)
    expect(CODE).toMatch(/shapeEvidence === null \? 'no_block' : 'emitted'/)
  })

  it('n travels only when a block was emitted, never as 0', () => {
    expect(CODE).toMatch(/shapeEmissionN = shapeEvidence === null \? null : shapeEvidence\.n/)
    expect(CODE).not.toMatch(/shapeEmissionN\s*=\s*[^\n]*\?\?\s*0/)
  })

  it('it is derived from the SAME value the prompt was built from', () => {
    // Recomputing would let the record and the prompt disagree.
    const built = CODE.indexOf('const shapeSection = renderDominantShapeInline(shapeEvidence)')
    const classified = CODE.indexOf('const shapeEmission')
    expect(built).toBeGreaterThan(-1)
    expect(classified).toBeGreaterThan(built)
    expect(CODE).not.toMatch(/shapeEmission[\s\S]{0,200}dominantShapeInline\(/)
  })
})

describe('both call sites record it, and the rescue path tells the truth', () => {
  const calls = [...CODE.matchAll(/recordWhatWasChosen\(admin, \{/g)]

  // ⚠⚠ THE LOCALS ARE NAMED `shapeEmission`, NOT `shapeBlock`, AND THAT IS
  // DELIBERATE. `check_symbol_readers` greps by NAME across production sources,
  // so a local called `shapeBlockOutcome` registers as a reader of the SHARED
  // `cohort.ts::shapeBlock` — which this file does not import and does not use.
  // The first draft did exactly that and the guard caught it: `reached` went
  // 759 -> 758 when the name was fixed. The code was wrong, not the guard.
  it('there are two, and each passes the field inside its OWN argument object', () => {
    expect(calls.length).toBeGreaterThanOrEqual(2)
    for (const c of calls) {
      const args = CODE.slice(c.index!, c.index! + 1600)
      const close = args.indexOf('})')
      expect(close).toBeGreaterThan(-1)
      expect(args.slice(0, close)).toMatch(/shapeEmission:/)
      expect(args.slice(0, close)).toMatch(/shapeEmissionN:/)
    }
  })

  it('the rescue path records not_reached, never no_block', () => {
    // ⚠️ IT NEVER REACHED THE PROMPT BUILDER, so the block was not "absent" —
    // it was never asked for. `no_block` there would record a decision nobody
    // made, which is the same error as defaulting a null.
    expect(CODE).toMatch(/shapeEmission: 'not_reached'/)
    const rescue = CODE.indexOf("shapeEmission: 'not_reached'")
    const args = CODE.slice(Math.max(0, rescue - 900), rescue)
    expect(args).toMatch(/substanceBudgetBeats: null/)
  })

  it('and it is inserted into generation_outcomes', () => {
    expect(CODE).toMatch(/shape_block:\s*input.shapeEmission/)
    expect(CODE).toMatch(/shape_block_n:\s*input\.shapeEmissionN/)
  })
})

describe('the migration admits exactly these four states', () => {
  it('the CHECK admits EXACTLY four and no fifth', () => {
    const clause = SQL.slice(SQL.indexOf('shape_block is null'))
    const admitted = new Set(
      [...clause.slice(0, clause.indexOf(')')).matchAll(/'([a-z_]+)'/g)].map((m) => m[1]))
    expect(admitted).toEqual(new Set(['emitted', 'no_block', 'corpus_unread', 'not_reached']))
  })

  it('null stays legal and is none of the four', () => {
    expect(SQL).toMatch(/shape_block is null/)
  })

  it('n and the outcome must agree, in both directions', () => {
    const c = SQL.slice(SQL.indexOf('generation_outcomes_shape_block_n_agrees check'))
    expect(c).toMatch(/shape_block = 'emitted' and shape_block_n is not null and shape_block_n > 0/)
    expect(c).toMatch(/shape_block is distinct from 'emitted' and shape_block_n is null/)
  })

  it('it drops each constraint before adding it, so the migration re-runs', () => {
    for (const name of ['generation_outcomes_shape_block_known',
                        'generation_outcomes_shape_block_n_agrees']) {
      expect(SQL.indexOf(`drop constraint if exists ${name}`))
        .toBeLessThan(SQL.indexOf(`add constraint ${name}`))
    }
  })
})

describe('the migration is applied by staging, never excluded', () => {
  const wf = readFileSync(join(ROOT, '.github', 'workflows', 'staging-integration.yml'), 'utf8')
  it('it is in the APPLIED list after 0206', () => {
    expect(wf).toContain('0207_absent_six_times_in_seven_or_never_called')
    expect(wf.indexOf('0206_a_hashtag_page_is_not_a_video_and_never_was'))
      .toBeLessThan(wf.indexOf('0207_absent_six_times_in_seven_or_never_called'))
  })
})
