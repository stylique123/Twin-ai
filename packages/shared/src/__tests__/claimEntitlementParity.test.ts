// THE TEST THE EDGE COPY'S OWN COMMENT PROMISED, AND NOBODY WROTE.
//
// ⚠️ `generate-blueprint/index.ts:4707` says, in as many words:
//
//     "Inlined from `packages/shared/src/claimEntitlement.ts` [...];
//      `claimEntitlementParity.test.ts` fails if the two drift."
//
// That file did not exist. The most safety-critical rule in the system — the one
// that exists because eleven fabricated personal histories shipped past a green
// matrix — carried a comment asserting a guard over it, which is worse than no
// comment at all: every reader after the first stops checking.
//
// ⚖️ AND BOTH COPIES ARE EXECUTED, NOT READ. `knowledgeSelectionParity` compares
// these two files textually and that is right for a constant, but a wording
// change in a repair instruction is not a drift and a missing `ask` branch is —
// and only running them can tell those apart. `claimStrength` itself is NOT
// re-tested here: `check_resolver_parity.mjs` already holds that copy byte-for-
// byte below its marker, so the shared function is injected into the extracted
// block and what remains under test is the ENTITLEMENT rule alone.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { transformSync } from 'esbuild'
import { checkEntitlement, bestAvailableLevel } from '../claimEntitlement'
import { claimStrength } from '../claimStrength'
import { evidenceLevel } from '../knowledgeResolver'
import { askForBeat } from '../script/beatAsk'
import type { KnowledgeItem } from '../creatorKnowledge'

const EDGE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..',
    'supabase', 'functions', 'generate-blueprint', 'index.ts'), 'utf8')

const START = '// ENTITLEMENT — DO WE HAVE THE RIGHT TO SAY THIS, IN THIS WAY?'
const END = '// ── AN INVENTED COMPARATIVE PRODUCT CLAIM ─'

interface EdgeFail { index: number; line: string; repair: string; ask: string | null }

/** ⚖️ THE BLOCK IS SLICED BETWEEN TWO HEADERS THAT ALREADY EXIST, deliberately,
 *  so this test needed no edit to an edge function and stayed in the static
 *  tier. The cost is that renaming either header breaks the slice — hence the
 *  failure messages below, which say to fix the anchor rather than the test. */
function loadInline() {
  const start = EDGE.indexOf(START)
  expect(start, `entitlement block anchor missing: "${START}" — restore the header, do not delete it`)
    .toBeGreaterThan(-1)
  const end = EDGE.indexOf(END, start)
  expect(end, `entitlement block end anchor missing: "${END}" — restore the header`)
    .toBeGreaterThan(start)
  const js = transformSync(EDGE.slice(start, end), { loader: 'ts', format: 'cjs' }).code
  // eslint-disable-next-line no-new-func
  return new Function('claimStrength', 'evidenceLevel',
    `${js}; return { entitlementFailures, bestAvailableLevel, repairFor }`,
  )(claimStrength, evidenceLevel) as {
    entitlementFailures: (beats: unknown, supplied: readonly KnowledgeItem[]) => EdgeFail[]
    bestAvailableLevel: (supplied: readonly KnowledgeItem[]) => string | null
    repairFor: (strength: string, available: string | null) => string
  }
}

const item = (kind: string, basis: string, text = 'something'): KnowledgeItem =>
  ({ kind, basis, text } as unknown as KnowledgeItem)

/** Every reachable `available` level, including the one that is NOT coverage. */
const SUPPLIES: Array<[string, KnowledgeItem[]]> = [
  ['nothing supplied', []],
  ['covered only', [item('covered', 'demonstrated')]],
  ['product only', [item('product', 'inferred')]],
  ['an opinion', [item('opinion', 'stated')]],
  ['an experience INFERRED, not stated', [item('experience', 'inferred')]],
  ['an experience STATED', [item('experience', 'stated')]],
  ['an opinion and a covered topic', [item('opinion', 'stated'), item('covered', 'demonstrated')]],
  ['experience buried under coverage', [item('covered', 'demonstrated'), item('experience', 'stated')]],
]

/** ⚠️ LINES CHOSEN TO LAND ON EVERY RUNG OF THE LADDER, including the real
 *  fabrication this whole module exists for. A fixture table that only reaches
 *  two of three strengths would pass over a rule that broke the third. */
const LINES = [
  'those high-end, wired earbuds I used to swear by',
  'I stopped buying every new iPhone accessory.',
  'I regret buying it.',
  'Once I started building my own, everything changed.',
  'I still think wired is better for the money.',
  'Wired is better for the money.',
  'Here is what the spec sheet says.',
  'Most people never check the impedance.',
  'You should check the impedance before you buy.',
  '',
  '   ',
]

describe('the edge copy of the entitlement rule behaves identically to the shared one', () => {
  const inline = loadInline()

  it('agrees on the strongest available level, over every supply', () => {
    let compared = 0
    for (const [name, supplied] of SUPPLIES) {
      expect(inline.bestAvailableLevel(supplied), `drift on ${name}`).toBe(bestAvailableLevel(supplied))
      compared++
    }
    // Guards the guard: an empty loop passes silently.
    expect(compared).toBe(SUPPLIES.length)
    expect(compared).toBeGreaterThan(5)
  })

  it('blocks exactly the same beats, over every line against every supply', () => {
    let compared = 0
    let blocked = 0
    for (const [name, supplied] of SUPPLIES) {
      const beats = LINES.map((line) => ({ line }))
      const edgeBlocked = new Set(inline.entitlementFailures(beats, supplied).map((f) => f.index))
      LINES.forEach((line, index) => {
        // ⚖️ AN EMPTY LINE IS SKIPPED BY THE EDGE BY CONSTRUCTION (there is no
        // sentence to grade), and shared is never handed one. Comparing it would
        // assert a case neither copy claims to answer.
        if (!line.trim()) return
        const shared = checkEntitlement(line, supplied)
        expect(edgeBlocked.has(index), `drift on ${name} / "${line}"`).toBe(!shared.entitled)
        if (!shared.entitled) blocked++
        compared++
      })
    }
    expect(compared).toBeGreaterThan(60)
    // ⚠️ AND SOMETHING MUST ACTUALLY BLOCK. A rule that entitles everything
    // would agree with itself perfectly and catch nothing.
    expect(blocked).toBeGreaterThan(10)
  })

  it('gives the regenerator the same instruction, word for word', () => {
    // ⚠️ THIS IS PROMPT TEXT, AND PROMPT TEXT IS THE RULE. The repair call is a
    // real model call on a path the creator already paid for; an instruction
    // that differs from the one the 14 shared tests prove is an untested prompt.
    let compared = 0
    for (const [name, supplied] of SUPPLIES) {
      const beats = LINES.map((line) => ({ line }))
      const fails = inline.entitlementFailures(beats, supplied)
      for (const f of fails) {
        const shared = checkEntitlement(f.line, supplied)
        expect(f.repair, `repair drift on ${name} / "${f.line}"`).toBe(shared.repair)
        compared++
      }
    }
    expect(compared).toBeGreaterThan(10)
  })

  it('asks the creator the same thing ONCE askForBeat has had it — which is where it counts', () => {
    // ⚠️⚠️ MY FIRST VERSION OF THIS TEST ASSERTED `f.ask === shared.ask` AND WAS
    // WRONG WHILE BOTH COPIES WERE DEFENSIBLE. The edge does not show `ask` to
    // anybody: `:10321` passes it through `askForBeat(section, f.ask)`, which
    // KEEPS a specific question and DERIVES a section-specific one otherwise.
    // So shared returning a canned sentence where the edge returns `null` is
    // not a drift — it is the same outcome by two routes, and the field-equality
    // assertion was testing an intermediate nobody reads.
    //
    // ⚖️ SO PARITY IS ASSERTED AT THE READER. Both asks go through `askForBeat`
    // with the same section and must come out identical.
    //
    // ⚠️ AND THIS IS WHY IT NOW PASSES. Measured before the change in this
    // commit, it did NOT: `askIsGeneric`'s pattern was anchored at `^`, so
    // shared's "Nothing on record supports this beat. What would you actually
    // say here?" slid past it and `askForBeat` returned that one sentence for
    // Setup, Proof and an unknown section alike, while `null` correctly produced
    // three different questions. The anchor is gone and the history form is
    // listed, so both routes now converge on the section's own question.
    const SECTIONS = ['Setup', 'Inciting Incident', 'False Resolution', 'Re-hook', 'Proof', 'Lesson', '']
    let compared = 0
    let derived = 0
    for (const [name, supplied] of SUPPLIES) {
      const beats = LINES.map((line) => ({ line }))
      for (const f of inline.entitlementFailures(beats, supplied)) {
        const shared = checkEntitlement(f.line, supplied)
        for (const section of SECTIONS) {
          const a = askForBeat(section, shared.ask)
          const b = askForBeat(section, f.ask)
          expect(b, `ask drift on ${name} / "${f.line}" / section "${section}"`).toBe(a)
          compared++
        }
        // ⚖️ AND IT MUST BE THE SECTION'S QUESTION, NOT THE CANNED ONE. Equality
        // alone would also hold if BOTH copies leaked the same blank sentence,
        // which is the state this commit ends.
        expect(askForBeat('Proof', shared.ask)).toBe('What is the specific result or number you can point to?')
        expect(askForBeat('Setup', shared.ask)).toBe('What was your situation right before this started?')
        derived++
      }
    }
    expect(compared).toBeGreaterThan(70)
    expect(derived).toBeGreaterThan(10)
  })
})
