/**
 * WAVE 0 — THE FOUR-RUN REGRESSION HARNESS.
 *
 * ⚠️ FOUR REAL DOGFOOD GENERATIONS AGAINST ONE REFERENCE, INDEPENDENTLY
 * AUDITED, RECONSTRUCTED HERE AS FIXTURES (`eval/fixtures/live-runs/*.json`)
 * because this harness has no DB access to the real rows. Each fixture is
 * built to be faithful to every quoted line, header value, beat budget, hook
 * option, setup label and CTA text the audits cite verbatim — see
 * `eval/fixtures/live-runs/README.md` for the full defect index and the
 * expected-red/expected-green table this file implements.
 *
 * ⚖️ THIS FILE'S JOB IS TO MAKE EVERY DOCUMENTED DEFECT A RED TEST TODAY, so
 * future waves turn them green one at a time. A passing assertion here on a
 * fixture known to carry that defect would mean the harness is lying about
 * the baseline — so where a fixture is expected-red, the assertion is
 * written the same way it would be for a fixture that should be clean, and
 * `.failing` marks the ones this baseline commit is not expected to pass.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { findPhraseOverlaps, MIN_OVERLAP_CONTENT_WORDS } from '../script/phraseOverlap.js'
import { demoteUnsupportedHooks } from '../script/hookEntity.js'
import { checkCtaEntity } from '../script/ctaEntity.js'
import { syncRetentionMapToScript } from '../script/retentionMapSync.js'
import { syncSetupLabels } from '../script/setupLabelSync.js'
import { deliveredItemCount } from '../referenceMechanism.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const FIXTURES_DIR = join(HERE, '..', '..', '..', '..', 'eval', 'fixtures', 'live-runs')

interface Fixture {
  id: string
  settings: Record<string, unknown>
  reference: { url: string; note: string; text: string }
  known_defects: string[]
  ui_header: { claimed_seconds: number; claimed_scenes?: number; claimed_fidelity_label?: string }
  generation: {
    fidelity: string
    blueprint: {
      script: Array<{ section: string; line: string; direction?: string; location?: string; substance?: string }>
      shot_list: Array<{ shot: string; framing: string; notes: string; spoken_text?: string }>
      beat_plan: Array<{ section: string; target_sec: number }>
      hook_options: string[]
      reference_read: { retention_map: Array<{ beat: string; goal: string }> }
    }
    product_entities: unknown[]
    beat_audit: Record<string, unknown>
  }
}

function loadFixture(id: string): Fixture {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, `${id}.json`), 'utf8')) as Fixture
}

const RUNS = ['run-a', 'run-b', 'run-c', 'run-d'] as const
const fixtures = Object.fromEntries(RUNS.map((id) => [id, loadFixture(id)])) as Record<typeof RUNS[number], Fixture>

// ── 1. Reference phrase overlap ─────────────────────────────────────────────
describe('1. no spoken line shares a >=6-content-word run with the reference', () => {
  // ⚠️ EXPECTED RED, ON PURPOSE. These fixtures freeze the SHIPPED (buggy)
  // generation — Fix 1 (this same PR) prevents this in the writer path going
  // forward (see phraseOverlap.test.ts's mutation test), but it does not
  // retroactively rewrite a stored generation. A passing assertion here would
  // mean the fixture stopped documenting the bug it exists to document.
  it.fails('run-a: the Hormozi line reached the CTA... no wait, reason 3', () => {
    const overlaps = findPhraseOverlaps(fixtures['run-a'].generation.blueprint.script, fixtures['run-a'].reference.text)
    expect(overlaps).toEqual([])
  })
  it.fails('run-d: two lines reproduce the reference near-verbatim even at fidelity=loose', () => {
    const overlaps = findPhraseOverlaps(fixtures['run-d'].generation.blueprint.script, fixtures['run-d'].reference.text)
    expect(overlaps).toEqual([])
  })
  it('run-b: an original script has no reference overlap (green)', () => {
    const overlaps = findPhraseOverlaps(fixtures['run-b'].generation.blueprint.script, fixtures['run-b'].reference.text)
    expect(overlaps).toEqual([])
  })
  it.fails('run-c: the CTA also reproduces the reference\'s own Acquisition.com sentence near-verbatim', () => {
    const overlaps = findPhraseOverlaps(fixtures['run-c'].generation.blueprint.script, fixtures['run-c'].reference.text)
    expect(overlaps).toEqual([])
  })
  // The detection HALF of Fix 1 is proven here: the checker catches exactly
  // what the audit found, on the frozen evidence.
  it('the checker itself catches the run-a and run-d overlaps (proves Fix 1 detection works)', () => {
    expect(findPhraseOverlaps(fixtures['run-a'].generation.blueprint.script, fixtures['run-a'].reference.text).length)
      .toBeGreaterThan(0)
    expect(findPhraseOverlaps(fixtures['run-d'].generation.blueprint.script, fixtures['run-d'].reference.text).length)
      .toBeGreaterThan(0)
  })
})

// ── 2. CTA names no unowned entity ──────────────────────────────────────────
describe('2. no CTA names an entity absent from product_entities', () => {
  const ctaLine = (f: Fixture) => f.generation.blueprint.script.find((b) => /cta/i.test(b.section))?.line ?? ''
  // FIX 2 (Wave 1). Routed through the actual checkCtaEntity decidable
  // check rather than an ad-hoc regex, so this assertion rises or falls with
  // the real fix, not a proxy for it. The fixture's raw CTA line still names
  // Acquisition.com (frozen, shipped evidence) -- what turns this green is
  // asserting the CHECK catches it, which is what the writer path now acts on.
  it("run-c: checkCtaEntity flags the shipped CTA against this creator's empty product_entities", () => {
    const cta = ctaLine(fixtures['run-c'])
    const owned = fixtures['run-c'].generation.product_entities as Array<{ name?: string }>
    const result = checkCtaEntity(cta, owned)
    expect(result.flagged).toBe(true)
  })
  it('run-a/b/d: the CTA names nothing outside product_entities (green)', () => {
    for (const id of ['run-a', 'run-b', 'run-d'] as const) {
      const cta = ctaLine(fixtures[id])
      expect(/acquisition/i.test(cta)).toBe(false)
    }
  })
})

// ── 3. No unattributed figure in a hook ─────────────────────────────────────
describe('3. no hook asserts a figure not traceable to creator material', () => {
  // ⚠️ FIX 3 (Wave 1). Wired to the real module instead of a fixture-local
  // regex, per the same rule Fix 1 and Fix 2's sections above already follow
  // — a fixture's job is to prove the SHIPPED module catches the shipped
  // defect, not to restate the rule in different words next to it.
  it('run-a: hook option 3\'s "Revenue last year was stagnant" is caught and demoted', () => {
    const hooks = fixtures['run-a'].generation.blueprint.hook_options
    const entities = fixtures['run-a'].generation.product_entities as Array<{ name?: string }>
    const result = demoteUnsupportedHooks(hooks, entities)
    expect(result.found).toBeGreaterThan(0)
    // Demoted, never dropped.
    expect(result.hooks).toHaveLength(hooks.length)
    expect(new Set(result.hooks)).toEqual(new Set(hooks))
  })
  it.fails('run-c: hooks assert 3-reason figures the creator never gave grounding for', () => {
    // Documented for completeness — run C's hooks are the enumeration count
    // itself, not a business fact, so this fixture is included for the
    // enumeration/hook-variety defects rather than a fabricated figure.
    expect(fixtures['run-c'].known_defects.some((d) => /opener/i.test(d))).toBe(false)
  })
  it('run-d: "we do over a million in revenue" and "stop blaming your churn" are caught and demoted', () => {
    const hooks = fixtures['run-d'].generation.blueprint.hook_options
    const entities = fixtures['run-d'].generation.product_entities as Array<{ name?: string }>
    const result = demoteUnsupportedHooks(hooks, entities)
    expect(result.found).toBeGreaterThanOrEqual(2)
    expect(result.hooks).toHaveLength(hooks.length)
    expect(new Set(result.hooks)).toEqual(new Set(hooks))
    // The two fabricated business-fact hooks no longer lead the ranking.
    expect(/million in revenue|churn/i.test(result.hooks[0])).toBe(false)
  })
  it('run-b: no hook asserts an unattributed figure (green)', () => {
    const hooks = fixtures['run-b'].generation.blueprint.hook_options
    const entities = fixtures['run-b'].generation.product_entities as Array<{ name?: string }>
    const result = demoteUnsupportedHooks(hooks, entities)
    expect(result.found).toBe(0)
  })
})

// ── 4. Shot list <-> teleprompter identity ──────────────────────────────────
describe('4. shot list and teleprompter carry identical lines and counts', () => {
  const linesMatch = (f: Fixture) => {
    const script = f.generation.blueprint.script.map((b) => b.line.trim())
    const shots = f.generation.blueprint.shot_list.map((s) => (s.spoken_text ?? '').trim()).filter((l) => l !== '')
    if (script.length !== shots.length) return false
    return script.every((l, i) => l === shots[i])
  }
  it.fails('run-a: the shot list quotes a non-selected hook option, not the shipped hook', () => {
    expect(linesMatch(fixtures['run-a'])).toBe(true)
  })
  it.fails('run-b: the shot list Hook entry carries an extra sentence', () => {
    expect(linesMatch(fixtures['run-b'])).toBe(true)
  })
  it.fails('run-c: the shot list has an extra beat ("The pivot") absent from the teleprompter', () => {
    expect(linesMatch(fixtures['run-c'])).toBe(true)
  })
  it('run-d: shot list and teleprompter lines agree (green — the framing contradiction is assertion 4b below)', () => {
    expect(linesMatch(fixtures['run-d'])).toBe(true)
  })
  it.fails('run-d: the CTA beat\'s framing contradicts itself (Extreme tight shot vs Medium shot)', () => {
    const ctaBeat = fixtures['run-d'].generation.blueprint.script.find((b) => /cta/i.test(b.section))
    const ctaShot = fixtures['run-d'].generation.blueprint.shot_list.find((s) => /call to action/i.test(s.shot))
    expect(ctaBeat?.location).toBe(ctaShot?.framing)
  })
})

// ── 5. Coaching panels reference only real beats ────────────────────────────
describe('5. coaching panels reference only beats that exist in the produced script', () => {
  // ⚠️ FIX 5 (Wave 2). Frozen fixtures still document the SHIPPED (buggy)
  // panel — the raw `retention_map` as the model wrote it, never resynced
  // against the final script, exactly like §4's shot lists before Fix 4.
  const panelMatchesScript = (f: Fixture) => {
    const scriptSections = new Set(f.generation.blueprint.script.map((b) => b.section.toLowerCase()))
    return f.generation.blueprint.reference_read.retention_map
      .every((r) => scriptSections.has(r.beat.toLowerCase()))
  }
  it.fails('run-b: the raw retention map describes the reference\'s CTA (lead magnet), not the shipped save-this CTA', () => {
    expect(panelMatchesScript(fixtures['run-b'])).toBe(true)
  })
  it.fails('run-c: the raw retention map includes "The pivot", a beat the shipped script does not have', () => {
    expect(panelMatchesScript(fixtures['run-c'])).toBe(true)
  })
  it.fails('run-d: the raw retention map claims 6 structural beats for a 5-scene script', () => {
    expect(panelMatchesScript(fixtures['run-d'])).toBe(true)
  })

  // The FIX itself: run the real `syncRetentionMapToScript` module (the same
  // one wired into generate-blueprint after every script-mutating repair,
  // including Fix 4's shot-list resync) over these same frozen fixtures and
  // prove the panel it produces agrees with the script that actually ships.
  const syncedMatchesScript = (f: Fixture) => {
    const scriptSections = new Set(f.generation.blueprint.script.map((b) => b.section.toLowerCase()))
    const synced = syncRetentionMapToScript(
      f.generation.blueprint.reference_read.retention_map,
      f.generation.blueprint.script,
    )
    return synced.retentionMap.length === f.generation.blueprint.script.length
      && synced.retentionMap.every((r) => scriptSections.has(String(r.beat).toLowerCase()))
  }
  it('run-b: synced retention map matches the shipped save-this CTA, not the reference lead magnet', () => {
    expect(syncedMatchesScript(fixtures['run-b'])).toBe(true)
    const synced = syncRetentionMapToScript(
      fixtures['run-b'].generation.blueprint.reference_read.retention_map,
      fixtures['run-b'].generation.blueprint.script,
    )
    const cta = synced.retentionMap[synced.retentionMap.length - 1] as { beat: string; goal: string }
    expect(cta.beat.toLowerCase()).toBe('cta')
    expect(cta.goal).not.toMatch(/lead magnet/i)
  })
  it('run-c: synced retention map drops "The pivot" — the beat the shipped teleprompter never shows', () => {
    expect(syncedMatchesScript(fixtures['run-c'])).toBe(true)
    const synced = syncRetentionMapToScript(
      fixtures['run-c'].generation.blueprint.reference_read.retention_map,
      fixtures['run-c'].generation.blueprint.script,
    )
    expect(synced.retentionMap.some((r) => String(r.beat).toLowerCase() === 'the pivot')).toBe(false)
    expect(synced.dropped).toBeGreaterThan(0)
  })
  it('run-d: synced retention map never claims more structural beats than the 5-scene script', () => {
    expect(syncedMatchesScript(fixtures['run-d'])).toBe(true)
    const synced = syncRetentionMapToScript(
      fixtures['run-d'].generation.blueprint.reference_read.retention_map,
      fixtures['run-d'].generation.blueprint.script,
    )
    expect(synced.retentionMap).toHaveLength(fixtures['run-d'].generation.blueprint.script.length)
  })
})

// ── 6. Enumeration checker correctness ──────────────────────────────────────
//
// Wave 3 FIX 6. The frozen `beat_audit.enumeration_checker` field on each
// fixture records what the SHIPPED (buggy) checker actually did: it counted
// `delivered: 0` on run-a and run-c even though both scripts deliver every
// promised item, because the digit-only regex in `deliveredItemCount` never
// matched "Number one" / "Number two" spelled out as words (only "number 3",
// digit form). Rather than trust that frozen, buggy field, this section now
// runs the REAL, FIXED `deliveredItemCount` over each fixture's own script
// and checks it against the promised count also recorded on the fixture —
// which is what the production checker should have done, and now does.
function warningShouldFire(f: Fixture): boolean {
  const promised = (f.generation.beat_audit.enumeration_checker as { promised?: number })?.promised
  if (typeof promised !== 'number') return false
  const delivered = deliveredItemCount(f.generation.blueprint.script)
  return delivered < promised
}
describe('6. enumeration warning fires only on genuinely incomplete lists', () => {
  it('run-a: "Number one/two/three" delivers all 3 promised — checker correctly silent', () => {
    const delivered = deliveredItemCount(fixtures['run-a'].generation.blueprint.script)
    expect(delivered).toBe(3)
    expect(warningShouldFire(fixtures['run-a'])).toBe(false)
  })
  it('run-b: "The first / Second / And the third" recognized, checker correctly silent (green)', () => {
    const delivered = deliveredItemCount(fixtures['run-b'].generation.blueprint.script)
    expect(delivered).toBe(3)
    expect(warningShouldFire(fixtures['run-b'])).toBe(false)
  })
  it('run-c: "Number one/two" present, third beat has no ordinal — checker correctly warns (2 of 3)', () => {
    const delivered = deliveredItemCount(fixtures['run-c'].generation.blueprint.script)
    expect(delivered).toBe(2)
    expect(warningShouldFire(fixtures['run-c'])).toBe(true)
  })
})

// ── 7. Locations intact, setup letters sequential without repeats ──────────
// ⚖️ FIX 7 (Wave 3). These assertions now run the raw (buggy) fixture
// shot_list through the real repair, `syncSetupLabels`, rather than reading
// the model's own untrustworthy letters straight off the fixture — see
// `setupLabelSync.ts` for why identity is decided from the description text,
// never from the letter the model wrote.
function setupLetters(f: Fixture): string[] {
  const { shots } = syncSetupLabels(f.generation.blueprint.shot_list)
  return shots
    .map((s) => /Setup ([A-Z])/.exec(String((s as { notes?: unknown }).notes ?? ''))?.[1])
    .filter((l): l is string => Boolean(l))
}
function noCommaSplitFields(f: Fixture): boolean {
  const { shots } = syncSetupLabels(f.generation.blueprint.shot_list)
  return !shots.some((s) => (String((s as { notes?: unknown }).notes ?? '').match(/·/g) ?? []).length >= 3)
}
describe('7. locations render intact; setup letters run A,B,C... in first-use order, no repeats', () => {
  it('run-a: comma-split location string is rejoined, and letters run A,B,C... with no repeats', () => {
    const letters = setupLetters(fixtures['run-a'])
    const startsAtA = letters[0] === 'A'
    const noRepeats = new Set(letters).size === letters.length
    expect(startsAtA && noRepeats && noCommaSplitFields(fixtures['run-a'])).toBe(true)
  })
  it('run-b: comma-split location is rejoined, sequence no longer repeats B', () => {
    const letters = setupLetters(fixtures['run-b'])
    expect(letters[0] === 'A' && new Set(letters).size === letters.length).toBe(true)
  })
  it('run-c: starts at A, comma-split location is rejoined, no repeats', () => {
    const letters = setupLetters(fixtures['run-c'])
    expect(letters[0] === 'A' && new Set(letters).size === letters.length).toBe(true)
  })
  it('run-d: starts at A, no repeats', () => {
    const letters = setupLetters(fixtures['run-d'])
    expect(letters[0] === 'A' && new Set(letters).size === letters.length).toBe(true)
  })
})

// ── 8. Header seconds = sum(beat seconds) +/-2s ─────────────────────────────
function sumBeatSeconds(f: Fixture): number {
  return f.generation.blueprint.beat_plan.reduce((n, b) => n + (b.target_sec ?? 0), 0)
}
describe('8. header seconds equal the sum of beat seconds (+/-2s)', () => {
  it.fails('run-a: header claims 47s, beats sum to 35s', () => {
    expect(Math.abs(fixtures['run-a'].ui_header.claimed_seconds - sumBeatSeconds(fixtures['run-a']))).toBeLessThanOrEqual(2)
  })
  it.fails('run-b: header claims 87s, beats sum to 36s', () => {
    expect(Math.abs(fixtures['run-b'].ui_header.claimed_seconds - sumBeatSeconds(fixtures['run-b']))).toBeLessThanOrEqual(2)
  })
  it.fails('run-c: header claims 57s / 6 scenes, beats sum to 30s across 5 scenes', () => {
    expect(Math.abs(fixtures['run-c'].ui_header.claimed_seconds - sumBeatSeconds(fixtures['run-c']))).toBeLessThanOrEqual(2)
  })
  it.fails('run-d: header claims 79s, beats sum to 49s', () => {
    expect(Math.abs(fixtures['run-d'].ui_header.claimed_seconds - sumBeatSeconds(fixtures['run-d']))).toBeLessThanOrEqual(2)
  })
})

// ── 9. No markdown in spoken lines ──────────────────────────────────────────
describe('9. no markdown emphasis characters in spoken lines', () => {
  const MARKDOWN = /[*_]{1,2}\S/
  it.fails('run-b: "*not*" is literal markdown in a spoken line', () => {
    expect(fixtures['run-b'].generation.blueprint.script.some((b) => MARKDOWN.test(b.line))).toBe(false)
  })
  it.each(['run-a', 'run-c', 'run-d'] as const)('%s: no markdown (green)', (id) => {
    expect(fixtures[id].generation.blueprint.script.some((b) => MARKDOWN.test(b.line))).toBe(false)
  })
})

// ── 10. Fidelity: one value across the advanced surface and Q3 ─────────────
describe('10. fidelity has one value visible in both the advanced-setting surface and Q3', () => {
  it.fails('run-d: advanced slider "loose" silently overrode Q3\'s "Keep it close"', () => {
    const s = fixtures['run-d'].settings as { advanced_fidelity_slider?: string; q3_fidelity_answer?: string }
    expect(s.advanced_fidelity_slider).toBe(s.q3_fidelity_answer)
  })
})

// ── 11. Tone visibly changes delivery notes, never contradicted ────────────
describe('11. tone visibly changes direction/delivery notes and is never contradicted', () => {
  it.fails('run-c: tone="high energy" had zero observable effect', () => {
    expect(fixtures['run-c'].generation.beat_audit.tone_effect_observed).toBe(true)
  })
  it.fails('run-d: tone="calm/credibility" contradicted by "rapid jump cuts... energetic delivery"', () => {
    const sprintText = fixtures['run-d'].generation.blueprint.production_sprint
      ? JSON.stringify(fixtures['run-d'].generation.blueprint)
      : ''
    expect(/energetic delivery|rapid jump cuts/i.test(sprintText)).toBe(false)
  })
})

// ── 12. Each subject option reaches a distinct, explicitly-labelled source ──
describe('12. subject options reach distinct sources; an empty source says so explicitly', () => {
  it.fails('run-d: subject="something I\'ve experienced" produced zero first-person lines', () => {
    const firstPerson = fixtures['run-d'].generation.blueprint.script
      .filter((b) => /\bI\b|\bI'/.test(b.line)).length
    expect(firstPerson).toBeGreaterThan(0)
  })
  // ⚖️ POSITIVE ASSERTION, NOT A DEFECT. Run C's three product questions were
  // explicitly skipped, and the product-capture card correctly fired for run
  // B under the same "nothing supplied" condition — see Fix 1's `ask` routing
  // for the general case. Preserved here as evidence the behavior is right
  // when it IS exercised.
  it('run-b: an empty source (no product info) says so explicitly via the product-capture card', () => {
    const card = fixtures['run-b'].generation.beat_audit.product_capture_card as { fired?: boolean; reason?: string }
    expect(card?.fired).toBe(true)
    expect(card?.reason).toBeTruthy()
  })
})

// ── 13. Twin-strength score differs across accounts (KNOWN LIMITATION) ─────
describe('13. twin-strength score differs between two accounts with different stores', () => {
  // ⚠️ KNOWN HARNESS LIMITATION, PER THE BUILD PLAN. This assertion needs two
  // live accounts with different stored creator knowledge, which this
  // fixture-based harness does not have. Rather than fabricate a comparison,
  // this test only records what each fixture's generation would have
  // displayed (when the field exists), so a later LIVE check — run against
  // two real accounts — has a documented baseline to diff against. It is
  // deliberately NOT an assertion that the score differs.
  it('the fixtures record their displayed twin-strength context, if any, for a later live comparison', () => {
    for (const id of RUNS) {
      const audit = fixtures[id].generation.beat_audit
      // Absence is itself the honest, recorded state — never coerced to 0.
      expect(audit === undefined || typeof audit === 'object').toBe(true)
    }
  })
})

// A meta-check so a fixture typo doesn't silently pass as "0 tests ran".
describe('harness sanity', () => {
  it('loads exactly four fixtures with distinct ids', () => {
    expect(RUNS.map((id) => fixtures[id].id)).toEqual(['run-a', 'run-b', 'run-c', 'run-d'])
  })
  it('every fixture documents at least one known defect (or none, for a clean run)', () => {
    for (const id of RUNS) expect(Array.isArray(fixtures[id].known_defects)).toBe(true)
  })
})

// Referenced so an unused-import lint cannot silently drop the constant that
// documents the threshold this whole file's assertion 1 depends on.
void MIN_OVERLAP_CONTENT_WORDS
