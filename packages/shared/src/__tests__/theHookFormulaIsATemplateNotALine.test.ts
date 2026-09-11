// THE PROMPT HANDED THE WRITER A BRACKETED TEMPLATE AND FORBADE BRACKETS.
//
// ⚠️⚠️ TWO INSTRUCTIONS CONTRADICTING EACH OTHER, ONE SCREEN APART. The scan is
// told to produce `hook_style` as a REUSABLE FILL-IN TEMPLATE — `dna.ts` and
// `worker/src/voice.ts` both give the example "[surprising number] + [who it is
// for] + comment [KEYWORD]" — and that string reached the writer raw, labelled
// only "Hook formula". The same prompt also says "A PLACEHOLDER IS A FAILED BEAT,
// NOT A DRAFT. Never write [Phone Model], [product name] ... or any other stand-in
// for a specific you do not have."
//
// Nothing said which rule applied to this input. A model handed a contradiction
// picks one.
//
// ⚠️ THE AUDIT'S REPORT FOR THIS DID NOT REPRODUCE, AND THE FIX IS STILL WORTH
// MAKING — which is why this file says so rather than claiming a symptom it
// cannot show. Measured on production: of 98 stored blueprints ONE contains
// '[KEYWORD]' and six contain any bracketed token, and of the 13 runs the audit
// covered, ZERO contain either; the six are June/July artifacts predating
// `normalizeHookLine`. The brackets the creator saw were most plausibly her DNA
// CARD, which renders `hook_style` verbatim as an editable field — a different
// surface, not fixed here. The contradiction is real either way.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { transformSync } from 'esbuild'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const EDGE = readFileSync(join(root, 'supabase', 'functions', 'generate-blueprint', 'index.ts'), 'utf8')
const DNA = readFileSync(join(root, 'supabase', 'functions', '_shared', 'dna.ts'), 'utf8')
const VOICE = readFileSync(join(root, 'worker', 'src', 'voice.ts'), 'utf8')

describe('the contradiction this fixes is real, and both halves are asserted', () => {
  it('the scan is instructed to produce a bracketed template', () => {
    // ⚠️ THE PREMISE. If this ever stops being a template, the rule below becomes
    // noise and should go with it — so it is pinned in BOTH files that write it.
    for (const [name, src] of [['dna.ts', DNA], ['worker voice.ts', VOICE]] as const) {
      expect(src, name).toMatch(/reusable fill-in template/i)
      expect(src, name).toContain('[KEYWORD]')
    }
  })

  it('and the same prompt forbids writing a bracket', () => {
    expect(EDGE).toMatch(/A PLACEHOLDER IS A FAILED BEAT, NOT A DRAFT/)
  })
})

// ── THE RULE, EXECUTED ────────────────────────────────────────────────────
function loadRule(): (hookStyle: unknown) => string {
  const start = EDGE.indexOf('const hookFormulaRule =')
  expect(start, 'the hook formula rule must exist').toBeGreaterThan(-1)
  const end = EDGE.indexOf('\n\n', start)
  expect(end).toBeGreaterThan(start)
  const js = transformSync(
    `function rule(vp) {\n${EDGE.slice(start, end)}\n return hookFormulaRule }`,
    { loader: 'ts', format: 'cjs' },
  ).code
  // eslint-disable-next-line no-new-func
  const fn = new Function(`${js}; return rule`)() as (vp: unknown) => string
  return (hookStyle) => fn({ hook_style: hookStyle })
}

const rule = loadRule()
const FORMULA = '[surprising number] + [who it is for] + comment [KEYWORD]'

describe('the template is named as a template, with its fills sourced', () => {
  it('says the line is a template and the brackets are slots', () => {
    const out = rule(FORMULA)
    expect(out).toMatch(/TEMPLATE, NOT A SENTENCE TO REPRODUCE/i)
    expect(out).toMatch(/\[square brackets\] is a SLOT/i)
  })

  it('names where a fill may come from, rather than saying "fill it in"', () => {
    // ⚖️ "FILL IT IN" WITH NO SOURCE IS AN INVITATION TO INVENT ONE, which is the
    // failure every claim rule in this file exists to prevent.
    const out = rule(FORMULA)
    expect(out).toMatch(/drawn\s+from THIS prompt/i)
    expect(out).toMatch(/her own numbers/i)
    expect(out).toMatch(/call to action/i)
  })

  it('and a slot with no available fact is DROPPED, not shipped as a bracket', () => {
    // ⚠️ THE HONEST THIRD OPTION. Without it the model's only way to obey both
    // rules is to invent a specific — worse than a bracket, because a bracket is
    // visibly wrong and an invented number is not.
    expect(rule(FORMULA)).toMatch(/rewrite the opener without it/i)
  })

  it('restates the prohibition across every surface a creator reads aloud', () => {
    const out = rule(FORMULA)
    expect(out).toMatch(/NEVER write a bracket into a hook, a script line or a shot/i)
  })

  it('is SILENT when there is no formula', () => {
    // ⚖️ A RULE ABOUT A TEMPLATE THAT DOES NOT EXIST IS SPENT PROMPT. 1 of 52
    // voices has no hook_style, and they get no line rather than an empty one.
    expect(rule('')).toBe('')
    expect(rule('   ')).toBe('')
    expect(rule(null)).toBe('')
    expect(rule(undefined)).toBe('')
  })
})

describe('it reaches the prompt, beside the formula it is about', () => {
  it('is interpolated directly after hook_style', () => {
    // ⚖️ A COMPUTED STRING THAT NEVER REACHES THE TEMPLATE is the shape
    // `creator_summary` had for a whole release.
    expect(EDGE).toContain("- Hook formula (A FILL-IN TEMPLATE, NOT A LINE TO COPY): ${vp.hook_style ?? ''}${hookFormulaRule}")
  })
})
