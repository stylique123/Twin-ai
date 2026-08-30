// TWO COPIES OF THE INTENT COMPILER, AND THE PROMPT ONLY EVER SEES ONE.
//
// ⚠️ EDGE FUNCTIONS CANNOT IMPORT `@twinai/shared`, so `generate-blueprint`
// carries an inlined copy. The shared module is the one with the tests; the
// inlined one is the one that runs in production, and a drift between them is
// invisible in every other test in this repo.
//
// ⚖️ SO BOTH ARE EXECUTED OVER EVERY COMBINATION AND COMPARED FIELD BY FIELD.
// Pattern-matching the source would catch a spelling change and miss the one
// that matters — a conflict rule that fires on one side and not the other.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { transformSync } from 'esbuild'
import {
  VIDEO_GOALS, CONTENT_FOCUS, VIEWER_OUTCOMES, REFERENCE_USE,
  compileVideoIntent, preferKinds, renderVideoIntent, resolveFidelity,
} from '../videoIntent'
import { SUBSTANCE_FLOOR } from '../knowledgeSelection'

const EDGE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..',
    'supabase', 'functions', 'generate-blueprint', 'index.ts'), 'utf8')

/** ⚖️ EXECUTED, NOT READ. Extracting the block and running it is the only way to
 *  catch a behavioural drift rather than a textual one.
 *
 *  ⚠️ TRANSPILED WITH ESBUILD, NOT WITH REGEXES. The first draft stripped the TS
 *  annotations by hand and produced a SyntaxError — which would have failed
 *  loudly, but the dangerous version of that mistake is a regex that strips just
 *  enough to parse and quietly changes what the code does. The compiler that
 *  builds this repo is the only honest way to remove types. */
function loadInline() {
  const start = EDGE.indexOf('// ── PER-VIDEO INTENT, INLINED ─')
  // ⚖️ THE MARKER IS THE COMMENT THAT FOLLOWS THE BLOCK, not a constant name
  // that also appears earlier in the file — the first draft used one that did,
  // and sliced backwards to a negative length.
  const end = EDGE.indexOf('// ⚠️ A BARE INTEGER IS NOT A FIGURE', start)
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  const ts = `const SUBSTANCE_FLOOR = ${SUBSTANCE_FLOOR};\n` + EDGE.slice(start, end)
  const js = transformSync(ts, { loader: 'ts', format: 'cjs' }).code
  // eslint-disable-next-line no-new-func
  return new Function(`${js}; return {
    compile: compileVideoIntentInline,
    prefer: preferKindsInline,
    render: renderVideoIntentInline,
    isGoal: isVideoGoalInline,
    resolveFidelity: resolveFidelityInline,
  }`)() as {
    compile: (a: Record<string, unknown>) => Record<string, unknown>
    prefer: (r: readonly { kind: string }[], p: readonly string[]) => { kind: string }[]
    render: (i: Record<string, unknown>) => string
    isGoal: (v: unknown) => boolean
    resolveFidelity: (referenceUse: string | null, legacyFidelitySlider: string | null) => string
  }
}

const inline = loadInline()

/** Every combination, plus the unanswered and the invalid. 9 × 9 × 10 = 810. */
const ALL = [
  ...[...VIDEO_GOALS, undefined],
].flatMap((goal) => [...CONTENT_FOCUS, undefined].flatMap((focus) =>
  [...VIEWER_OUTCOMES, undefined, 'nonsense'].map((outcome) => ({ goal, focus, outcome }))))

describe('edge ↔ shared intent parity, executed', () => {
  it('covers every combination, so a rule cannot hide in an untested corner', () => {
    // 9 goals (8 + unanswered) x 7 focuses (6 + unanswered) x 11 outcomes.
    // The focus axis lost two values — `reference_adapted` and `trending` — and
    // both are covered instead by the migration tests, which assert they still
    // compile to exactly what an unanswered focus compiles to.
    expect(ALL.length).toBe(9 * 7 * 11)
  })

  it('compiles identically on all of them, field for field', () => {
    for (const answers of ALL) {
      const a = compileVideoIntent(answers)
      const b = inline.compile(answers as Record<string, unknown>)
      const where = JSON.stringify(answers)
      expect(b.goal, where).toBe(a.goal)
      expect(b.focus, where).toBe(a.focus)
      expect(b.outcome, where).toBe(a.outcome)
      // ⚠️ THE DIRECTIVE IS COMPARED IN FULL. A conflict rule that rewrites it
      // on one side only is exactly the drift this file exists to catch, and a
      // truncated comparison would pass straight through it.
      expect(b.goalDirective, where).toBe(a.goalDirective)
      expect(b.payoffDirective, where).toBe(a.payoffDirective)
      expect(b.wantsSale, where).toBe(a.wantsSale)
      expect(b.substanceFloor, where).toBe(a.substanceFloor)
      expect(b.wantsProductSubstance, where).toBe(a.wantsProductSubstance)
      expect(b.wantsOwnExperience, where).toBe(a.wantsOwnExperience)
      expect(b.prefersKinds, where).toEqual(a.prefersKinds)
      expect(b.resolutions, where).toEqual(a.resolutions)
    }
  })

  it('renders the same block, byte for byte — the block IS what reaches the model', () => {
    for (const answers of ALL) {
      expect(inline.render(inline.compile(answers as Record<string, unknown>)))
        .toBe(renderVideoIntent(compileVideoIntent(answers)))
    }
  })

  it('agrees on which strings are goals, including the new one', () => {
    for (const v of [...VIDEO_GOALS, 'conversations', 'nope', '', null, 7, {}]) {
      expect(inline.isGoal(v), String(v)).toBe(
        typeof v === 'string' && (VIDEO_GOALS as readonly string[]).includes(v))
    }
  })

  it('reorders knowledge identically', () => {
    const rows = [
      { kind: 'covered' }, { kind: 'experience' }, { kind: 'framework' },
      { kind: 'product' }, { kind: 'opinion' }, { kind: 'topic' }, { kind: 'claim' },
    ]
    for (const focus of [...CONTENT_FOCUS, undefined]) {
      const prefers = compileVideoIntent({ focus }).prefersKinds
      expect(inline.prefer(rows, prefers).map((r) => r.kind))
        .toEqual(preferKinds(rows, prefers).map((r) => r.kind))
    }
  })
})

// ── FIX 10 (Wave 4). ONE HOME FOR FIDELITY, ON BOTH SIDES ──────────────────
describe('edge ↔ shared fidelity resolution parity, executed', () => {
  const SLIDERS = [...(['close', 'balanced', 'loose'] as const), null]
  it('resolves identically for every reference_use x slider combination', () => {
    for (const use of [...REFERENCE_USE, null]) {
      for (const slider of SLIDERS) {
        const where = `use=${use} slider=${slider}`
        expect(inline.resolveFidelity(use, slider), where).toBe(resolveFidelity(use, slider))
      }
    }
  })
})

describe('the constants that must not diverge', () => {
  it('the edge takes the floor from the SELECTOR, never its own number', () => {
    // ⚠️ THE BUG THIS PINS. The shared module's first draft wrote its own
    // default of 4 against a selector floor of 6, which would have LOWERED the
    // substance guarantee on every unanswered generation. Neither copy may
    // restate the number.
    const from = EDGE.indexOf('// ── PER-VIDEO INTENT, INLINED ─')
    const block = EDGE.slice(from, EDGE.indexOf('// ⚠️ A BARE INTEGER IS NOT A FIGURE', from))
    expect(block).toMatch(/feel_inspired: SUBSTANCE_FLOOR/)
    expect(block).toMatch(/: SUBSTANCE_FLOOR\b/)
    expect(block).not.toMatch(/feel_inspired: \d/)
  })

  it('the inline block is declared AFTER the constant it reads at load time', () => {
    // ⚠️ A REAL BUG, CAUGHT BY THE PARSE GUARD'S DEAD-ZONE CHECK. `OUTCOME_FLOOR_INLINE`
    // is a module-level const that reads SUBSTANCE_FLOOR when the module loads, so
    // placing the block above the declaration is a ReferenceError on every request.
    expect(EDGE.indexOf('const SUBSTANCE_FLOOR ='))
      .toBeLessThan(EDGE.indexOf('const OUTCOME_FLOOR_INLINE'))
  })
})

describe('the readers are wired, not merely present', () => {
  it('the goal line reads the compiled directive', () => {
    expect(EDGE).toMatch(/const goal = intent\.goalDirective/)
  })

  it('sell intent reads the compiled half rather than restating the enum', () => {
    // ⚠️ A SECOND MEMBERSHIP TEST IS HOW conversations AND leads DRIFT APART
    // AGAIN. One definition, in the compiler.
    expect(EDGE).toMatch(/const goalWantsSale = intent\.wantsSale/)
    expect(EDGE).not.toMatch(/videoGoal === 'sell' \|\| videoGoal === 'leads'/)
  })

  it('retrieval is reordered BEFORE the selection is taken', () => {
    // ⚖️ Reordering after the cut would change nothing at all — the ten rows
    // would already have been chosen.
    expect(EDGE.indexOf('const focusOrdered = preferKindsInline('))
      .toBeLessThan(EDGE.indexOf('const speakable = selectSpeakable(focusOrdered'))
  })

  it('the substance floor is passed, not defaulted', () => {
    expect(EDGE).toMatch(/selectSpeakable\(focusOrdered, 10, intent\.substanceFloor\)/)
  })

  it('the dead brief.goal read is GONE, not shadowed by a fourth channel', () => {
    // ⚠️ `savePreScriptBrief` is its only writer and deliberately omits it, so
    // the branch could never hold a value. Three fields meant "goal" and one of
    // them was unreachable; deleting it is the migration.
    expect(EDGE).not.toMatch(/brief\.goal && GOAL_LINES\[brief\.goal\]/)
    expect(EDGE).not.toMatch(/const GOAL_LINES: Record<string, string> = \{/)
  })

  it('the request carries all three answers', () => {
    expect(EDGE).toMatch(/goal\?: string; focus\?: string; outcome\?: string;/)
  })
})
