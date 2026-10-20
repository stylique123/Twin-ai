// Panel-current-9 fixes. Every fixture is MADE UP (a fictional pottery creator,
// "Kiln Notes"); no model is called, nothing is paid. The attempt durations
// below are seconds only (script_attempts, panels 8 and 9): no script text.
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  WRITER_TOTAL_END_MS, writerTimeoutFallbackOn, degradedBlueprint, generalScript,
  fitLogNormal, simulateWriterFailuresPer24, type AttemptObs,
} from '../writerTimeout.js'
import { ASYNC_WRITER_END_MS, WRITER_HEDGE_AT_MS, asyncPolishOn, runHedged, applyPolishRewrites, polishEditorPrompt } from '../asyncPolish.js'
import {
  dedupeSpokenLines, dedupByStoryItem, holdSpokenFloor, refillToFloor, spokenLineCount, SPOKEN_LINE_FLOOR,
  withAuditPatterns, type LedgerItem, type RepairAuditEntry,
} from '../inventionGate.js'
import { assemblePlanB, planBInputFromLedger, planBScript, planBEligible } from '../planner/planBAssembly.js'

const item = (o: Partial<LedgerItem> & Pick<LedgerItem, 'id' | 'origin' | 'text'>): LedgerItem => ({
  product_id: null, field: null, numbers: [], first_party: true, live: false, source_label: o.origin, ...o,
})
const KILN = 'p-kiln'
const STORY = 'A buyer at the spring fair turned my mug over and asked why the bottom was bare clay, so now I explain it on every label.'
const ledger: LedgerItem[] = [
  item({ id: 's1', origin: 'her_story', text: STORY }),
  item({ id: 'f1', origin: 'her_fact', text: 'I leave the foot ring unglazed so the mug never fuses to the kiln shelf.' }),
  item({ id: 'f2', origin: 'her_fact', text: 'Sand the bare foot ring with fine paper so it never scratches your table.' }),
  item({ id: 'p1', origin: 'product_fact', product_id: KILN, field: 'description', text: 'Kiln Notes: A short letter every month about one glaze test' }),
]

// ── 1. the writer end, the degraded result, the simulation ─────────────────

const cut = (s: number): AttemptObs => ({ s, cut: true })
const ok = (s: number): AttemptObs => ({ s, cut: false })
// Panel 8 (sequential: attempt 0 capped at 65 s, fallback at 55 s) and panel 9 (hedged, 84 s end).
const PRIMARY: AttemptObs[] = [
  ...Array(9).fill(cut(65)), ...[53.9, 41.3, 30.8, 38.4, 61.7, 46.5, 56.3, 32.3, 60.0, 28.9, 43.3, 64.4, 36.9, 53.4, 50.5].map(ok),
  ...[71.5, 74.0, 56.3, 75.2, 69.1, 56.9, 75.9, 66.3, 63.9, 76.0, 74.4, 62.3].map(cut),
  ...[36.0, 73.3, 56.2, 46.7, 47.0, 44.4, 30.5, 46.5, 59.2, 28.3, 39.0, 37.4].map(ok),
]
const FALLBACK: AttemptObs[] = [
  ...Array(4).fill(cut(55)), ...[50.6, 50.6, 50.7, 44.8, 41.8].map(ok),
  ...[54.1, 54.1, 54.3, 54.1, 54.3, 54.1, 17.9, 51.8, 33.3, 24.2, 25.9, 21.6, 8.3, 25.2, 36.6, 6.0, 17.2, 16.4].map(cut),
  ...[33.8, 47.2, 35.3, 44.9, 41.4, 40.1].map(ok),
]

describe('1. the writer may run to 125 s; a slow writer never 500s', () => {
  afterEach(() => { vi.useRealTimers() })
  it('the end is 125 s and the hedge still starts at 30 s', () => {
    expect(ASYNC_WRITER_END_MS).toBe(WRITER_TOTAL_END_MS)
    expect(WRITER_TOTAL_END_MS).toBe(125_000)
    expect(WRITER_HEDGE_AT_MS).toBe(30_000)
  })
  it('a writer that needs 100 s now returns (it was cut at 84 s on panel 9)', async () => {
    vi.useFakeTimers()
    const startedAt = Date.now() - 10_000
    const slow = (ms: number) => (t: number, signal: AbortSignal) => new Promise<string>((res, rej) => {
      const done = ms <= t
      const h = setTimeout(() => (done ? res('{}') : rej(new Error('timeout'))), done ? ms : t)
      signal.addEventListener('abort', () => { clearTimeout(h); rej(new Error('aborted')) }, { once: true })
    })
    const p = runHedged([{ base: ASYNC_WRITER_END_MS, run: slow(90_000) }, { base: ASYNC_WRITER_END_MS, run: slow(80_000) }], () => true, { startedAt })
    await vi.runAllTimersAsync()
    const r = await p
    expect(r.text).toBe('{}')
    expect(Date.now() - startedAt).toBeLessThanOrEqual(WRITER_TOTAL_END_MS)
  })
  it('the kill switch: on under async polish, off with WRITER_TIMEOUT_FALLBACK=off or async off', () => {
    expect(writerTimeoutFallbackOn(asyncPolishOn(true, undefined), undefined)).toBe(true)
    expect(writerTimeoutFallbackOn(asyncPolishOn(true, undefined), 'off')).toBe(false)
    expect(writerTimeoutFallbackOn(asyncPolishOn(false, undefined), undefined)).toBe(false)
  })
  it('with her material: the Plan B body, every line sourced, marked degraded', () => {
    const inB = planBInputFromLedger(ledger, { id: 's1', text: STORY }, KILN, 'standard')
    expect(planBEligible(inB)).toBe(true)
    const lines = planBScript(assemblePlanB(inB).lines, STORY).script
    const d = degradedBlueprint({ planB: lines, subject: 'Kiln Notes' })
    expect(d.record).toMatchObject({ reason: 'writer_timeout', source: 'plan_b' })
    const bp = d.blueprint as { script: Array<{ line: string; source_ids?: string[] }>; concept: { premise: string }; packaging: { titles: string[]; thumbnail: { concept: string } }; degraded: unknown }
    expect(bp.script.length).toBeGreaterThanOrEqual(3)
    expect(bp.script.every((b) => (b.source_ids ?? []).length > 0)).toBe(true)
    expect(bp.concept.premise).toBeTruthy()
    expect(bp.packaging.titles.length).toBeGreaterThan(0)
    expect(bp.degraded).toEqual(d.record)
  })
  it('without material: the general version, three lines, no bracket, still complete', () => {
    const d = degradedBlueprint({ planB: [], subject: 'Kiln Notes', offer: null })
    expect(d.record.source).toBe('general')
    const lines = (d.blueprint.script as Array<{ line: string }>).map((b) => b.line)
    expect(lines).toEqual(generalScript('Kiln Notes', null).map((b) => b.line))
    expect(spokenLineCount(d.blueprint.script as Array<{ line: string }>)).toBeGreaterThanOrEqual(SPOKEN_LINE_FLOOR)
    expect(lines.join(' ')).not.toMatch(/[[\]{}<>]/)
  })
  it('simulation on the panel 8 + 9 attempt durations: expected writer failures per 24', () => {
    const p = fitLogNormal(PRIMARY)
    const f = fitLogNormal(FALLBACK)
    const before = simulateWriterFailuresPer24(p, f, { endMs: 84_000, fallbackCapMs: 55_000 })
    const after = simulateWriterFailuresPer24(p, f, { endMs: WRITER_TOTAL_END_MS, fallbackCapMs: Infinity })
    // Counts only.
    console.log(JSON.stringify({ event: 'panel9_writer_sim', primary: p, fallback: f, per24_at_84s: Number(before.toFixed(2)), per24_at_125s: Number(after.toFixed(2)), per24_500s_after: 0 }))
    // The old setting reproduces panel 9's 6 of 24 within noise.
    expect(before).toBeGreaterThan(3)
    expect(before).toBeLessThan(9)
    expect(after).toBeLessThan(before / 3)
    expect(after).toBeLessThanOrEqual(1)
  })
})

// ── 2. checks never empty a script ─────────────────────────────────────────

describe('2. a de-dup never takes a script under the floor; a short script is refilled', () => {
  // The shape of all 3 panel-9 rescues: 3 beats from the writer, the de-dup removes 1.
  const three = [
    { section: 'hook', line: 'The bottom of a handmade mug is bare clay on purpose.' },
    { section: 'body', line: 'The bottom of a handmade mug is bare clay, on purpose.' },
    { section: 'cta', line: 'Turn your mug over and tell me what you see on the bottom.' },
  ]
  it('the de-dup alone would leave 2 lines', () => {
    expect(spokenLineCount(dedupeSpokenLines(three).script)).toBe(2)
  })
  it('holdSpokenFloor keeps the 3 lines (the repeat stays for review)', () => {
    const d = dedupeSpokenLines(three)
    const h = holdSpokenFloor(three, d.script)
    expect(h.held).toBe(true)
    expect(h.script).toEqual(three)
  })
  it('a de-dup that keeps the floor still applies', () => {
    const four = [...three.slice(0, 2), { section: 'body', line: 'I leave the foot ring unglazed so it never fuses to the shelf.' }, three[2]!]
    const h = holdSpokenFloor(four, dedupeSpokenLines(four).script)
    expect(h.held).toBe(false)
    expect(spokenLineCount(h.script)).toBe(3)
  })
  it('refillToFloor adds her own unused items before the close', () => {
    const two = [three[0]!, three[2]!]
    const r = refillToFloor(two, ledger, KILN)
    expect(r.added).toBeGreaterThanOrEqual(1)
    expect(spokenLineCount(r.script as Array<{ line?: unknown }>)).toBeGreaterThanOrEqual(SPOKEN_LINE_FLOOR)
    expect((r.script[r.script.length - 1] as { line: string }).line).toBe(three[2]!.line)
    expect((r.script[0] as { line: string }).line).toBe(three[0]!.line)
  })
})

// ── 3. line 1 stays the recorded pick ──────────────────────────────────────

describe('3. the hook is never dropped by story de-dup, never touched by polish', () => {
  it('a story_open hook that paraphrases her story survives the story de-dup (5 of 5 panel-9 cases)', () => {
    const hook = 'A spring fair buyer asked why my mug bottom was bare clay.'
    const script = [{ line: hook }, { line: STORY }, { line: 'Tell me what you find.' }]
    const r = dedupByStoryItem(script, ledger)
    expect(r.script[0]!.line).toBe(hook)
    expect(r.record.beats_dropped).toBe(0)
  })
  it('a later paraphrase is still dropped', () => {
    const script = [{ line: 'Your mug bottom is bare clay for a reason.' }, { line: STORY }, { line: 'A buyer at the spring fair asked why my mug bottom was bare clay.' }, { line: 'Turn your mug over.' }]
    const r = dedupByStoryItem(script, ledger)
    expect(r.record.dropped).toBe(1)
    expect(r.script[0]!.line).toBe(script[0]!.line)
  })
  it('polish rejects a rewrite of line 1, even with an empty beat before it', () => {
    const beats = [{ section: 'x', line: '' }, { section: 'hook', line: 'The hook line stays exactly as picked.' }, { section: 'body', line: 'A middle line.' }, { section: 'cta', line: 'The close.' }]
    const a = applyPolishRewrites(beats, JSON.stringify({ rewrites: [{ index: '0', line: 'A brand new opening line here.' }, { index: '1', line: 'Another brand new opening line.' }] }), '')
    expect(a.kept).toBe(0)
    expect(a.next[1]!.line).toBe(beats[1]!.line)
  })
  it('the editor prompt tells it never to rewrite the hook', () => {
    expect(polishEditorPrompt([{ section: 'hook', line: 'x' }], '')).toMatch(/NEVER rewrite the hook/)
    expect(polishEditorPrompt([{ section: 'hook', line: 'x' }], '')).not.toMatch(/rewrite line 1 or 2/)
  })
})

// ── 4. the audit row records the pattern type ──────────────────────────────

describe('4. narrow-repair audit rows carry the pattern type', () => {
  const base: Omit<RepairAuditEntry, 'text' | 'pattern'> = { round: 1, i: 1, surface: 'script', action: 'asked', class: 'I', reason: 'invented_frequency', item_ids: [] }
  it('an invented frequency is recorded as frequency; a plain line as null', () => {
    const rows = withAuditPatterns([
      { ...base, text: 'I glaze a new test tile every single morning.', pattern: null },
      { ...base, text: 'Turn your mug over.', pattern: null },
    ], ledger)
    expect(rows[0]!.pattern).toBe('frequency')
    expect(rows[1]!.pattern).toBeNull()
  })
})
