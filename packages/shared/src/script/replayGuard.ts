// OFFLINE REPLAY GUARD (plan v6.1 §27). Every quality PR replays the stored,
// FICTIONAL panel-current-10/11 scripts through the deterministic post-writer
// stages with the CURRENT code and default flags, and is blocked when:
//   - median spoken words fall more than 10% below the P10 baseline,
//   - any placeholder survives,
//   - repeats or blocking flags get worse than the committed baseline.
// No model, no network, no database: pure functions over a committed snapshot.
//
// ⚠️ LIMITATION: the writer's raw draft (before gate/refill/dedupe) is not
// stored on the blueprint, so the replay starts from the SHIPPED script. It
// re-runs only the stages that are deterministic and need no ledger text:
// blockSpokenPlaceholders and dedupeSpokenLines. Gate classification, refill
// and top-up need the judge or ledger text and are not replayed.
import { blockSpokenPlaceholders, dedupeSpokenLines, nearDuplicate } from './inventionGate'
import { spokenWords } from './lateGuards'
import { placeholderTokens } from '../spokenPlaceholders'

export interface ReplayCase {
  batch: string
  n: number
  goal?: string | null
  target_seconds?: number | null
  script: Array<{ line?: unknown; section?: unknown }>
  hook_options?: string[]
}

export interface ReplayMetrics {
  cases: number
  median_spoken_words: number
  placeholders: number
  repeats: number
  blocking_flags: number
}

export interface ReplayBaselineEntry extends ReplayMetrics {
  /** The median the 10% floor is measured against (P10 writer median = 96). */
  word_reference: number
}

export interface ReplayBaseline {
  max_word_drop: number
  panels: Record<string, ReplayBaselineEntry>
}

const sentencesOf = (line: string) => line.match(/[^.!?]+[.!?]*/g)?.map((s) => s.trim()).filter(Boolean) ?? []

/** Near-duplicate sentence pairs anywhere in the spoken script. */
export function repeatCount(script: ReadonlyArray<{ line?: unknown }>): number {
  const ss = script.flatMap((b) => (typeof b?.line === 'string' ? sentencesOf(b.line) : []))
  let n = 0
  for (let i = 0; i < ss.length; i++) for (let j = i + 1; j < ss.length; j++) if (nearDuplicate(ss[i]!, ss[j]!)) n++
  return n
}

/** The deterministic, offline subset of the panel audit's flags. */
export function blockingFlags(c: ReplayCase, script: ReadonlyArray<{ line?: unknown }>, hooks: readonly string[]): string[] {
  const f: string[] = []
  const lines = script.map((b) => (typeof b?.line === 'string' ? b.line : '')).filter(Boolean)
  const text = lines.join(' ')
  const words = spokenWords(script)
  const secs = Number(c.target_seconds ?? 45)
  if (lines.length < 3) f.push('too_few_beats')
  if (hooks.length === 0) f.push('no_hooks')
  if (new Set(hooks.map((h) => h.toLowerCase().slice(0, 30))).size < hooks.length) f.push('duplicate_hooks')
  if (words / secs > 3.6) f.push('too_long_for_length')
  if (words / secs < 1.2 && secs >= 30) f.push('too_short_for_length')
  if (c.goal === 'entertain' && /\b(link in (my )?bio|order now|buy (it|now)|shop now|use code)\b/i.test(text)) f.push('hard_sell_in_entertain')
  if (/\b(cures?|heals?|boosts? (your )?metabolism|weight loss)\b/i.test(text)) f.push('health_claim')
  return f
}

export function replayCase(c: ReplayCase) {
  const p = blockSpokenPlaceholders({ script: c.script, hook_options: c.hook_options ?? [] })
  const d = dedupeSpokenLines((p.bp.script as ReplayCase['script']) ?? [])
  const script = d.script
  const hooks = ((p.bp.hook_options as unknown[]) ?? []).filter((h): h is string => typeof h === 'string')
  const placeholders = [...script.map((b) => b.line), ...hooks].reduce<number>((a, t) => a + placeholderTokens(t).length, 0)
  return { words: spokenWords(script), placeholders, repeats: repeatCount(script), flags: blockingFlags(c, script, hooks) }
}

export const median = (xs: readonly number[]) => {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}

export function replayMetrics(cases: readonly ReplayCase[]): ReplayMetrics {
  const r = cases.map(replayCase)
  return {
    cases: cases.length,
    median_spoken_words: median(r.map((x) => x.words)),
    placeholders: r.reduce((a, x) => a + x.placeholders, 0),
    repeats: r.reduce((a, x) => a + x.repeats, 0),
    blocking_flags: r.reduce((a, x) => a + x.flags.length, 0),
  }
}

export function replayByPanel(cases: readonly ReplayCase[]): Record<string, ReplayMetrics> {
  const out: Record<string, ReplayMetrics> = {}
  for (const b of [...new Set(cases.map((c) => c.batch))].sort()) out[b] = replayMetrics(cases.filter((c) => c.batch === b))
  return out
}

/** Violations; empty means the PR may merge. A panel missing on either side is a violation. */
export function compareToBaseline(m: Record<string, ReplayMetrics>, b: ReplayBaseline): string[] {
  const v: string[] = []
  const names = new Set([...Object.keys(m), ...Object.keys(b.panels)])
  for (const p of [...names].sort()) {
    const x = m[p], e = b.panels[p]
    if (!x || !e) { v.push(`${p}: missing from ${x ? 'baseline' : 'replay'}`); continue }
    const floor = e.word_reference * (1 - b.max_word_drop)
    if (x.cases !== e.cases) v.push(`${p}: case count ${x.cases} != baseline ${e.cases} (fixture changed without a baseline update)`)
    if (x.median_spoken_words < floor) v.push(`${p}: median spoken words ${x.median_spoken_words} < floor ${floor.toFixed(1)} (${e.word_reference} - ${b.max_word_drop * 100}%)`)
    if (x.placeholders > 0) v.push(`${p}: placeholders ${x.placeholders} > 0`)
    if (x.repeats > e.repeats) v.push(`${p}: repeats ${x.repeats} > baseline ${e.repeats}`)
    if (x.blocking_flags > e.blocking_flags) v.push(`${p}: blocking flags ${x.blocking_flags} > baseline ${e.blocking_flags}`)
  }
  return v
}
