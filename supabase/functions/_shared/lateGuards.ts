// GENERATED FROM packages/shared/src/script/lateGuards.ts — DO NOT EDIT.
// Run: node scripts/ci/generate_shared_pilot_core.mjs
// Edit the source instead. CI regenerates this file and fails on a diff.
// @ts-nocheck
// THE LATE GUARDS, AS ONE CHECK THE EXTENSION AND THE FINISH BOTH RUN
// (script batch part 4, 2026-10-04).
//
// ⚠️ MEASURED: 8eaecdab went 94 words at `extension` → 50 shipped, 7a25ca3d
// 150 → 136. The extension lengthened the script from the same facts, its own
// acceptance passed, and then the late guards cut what it wrote: "two weeks in
// a row" (unbacked_figure), the pasted offer block "12oz bag — $18 …"
// (invented_method — its source, the brief's offer, was not among the line
// sources), another product's "5lb bulk bag" (other_product_offer). Two
// checks with two definitions of "allowed" — the second one always wins and
// the script ships short.
//
// ⚖️ ONE DEFINITION. `lateGuardCuts` is every sentence-level late guard with
// one context; the extension keeps only what it passes (`keepLateSafe`), so
// what the extension accepts the guards accept.
import { guardScript } from './privacyGuard.ts'
import { enforceScriptRules } from './scriptRules.ts'
import { traceLines, isInventedMethod, type LineSourceInput } from './lineSources.ts'
import { enforceCorrections } from './corrections.ts'
import { stripForeignOffer } from './offerScope.ts'

export interface LateGuardContext {
  /** Everything she allowed for this video (guardScript `allowedText`). */
  allowedText: string
  identityText?: string
  excludedTexts: readonly string[]
  unpicked: readonly string[]
  followAllowed: boolean
  /** The sources a sentence may trace to (invented-method check). */
  sources: readonly LineSourceInput[]
  /** Terms she rejected, and her own words for this video. */
  rejected: readonly string[]
  herWords: string
  /** Another product's prices/sizes. */
  foreignOffer: ReadonlySet<string>
}

export interface LateCut { beat: number; reason: string; sentence: string }

/** Every sentence a late guard would remove, each guard run on the lines as given. */
export function lateGuardCuts(beats: ReadonlyArray<{ line?: unknown }>, ctx: LateGuardContext): LateCut[] {
  const list = beats.map((b) => ({ line: typeof b?.line === 'string' ? b.line : '' }))
  const cuts: LateCut[] = []
  const add = (beat: number, reason: string, sentence: string) => {
    if (!cuts.some((c) => c.beat === beat && c.sentence === sentence)) cuts.push({ beat, reason, sentence })
  }
  for (const r of guardScript(list, { allowedText: ctx.allowedText, excludedTexts: ctx.excludedTexts, figuresMustBeBacked: true, identityText: ctx.identityText }).removed) add(r.beat, r.reason, r.sentence)
  for (const r of enforceScriptRules(list, { unpicked: ctx.unpicked, followAllowed: ctx.followAllowed }).removed) add(r.beat, r.reason, r.sentence)
  for (const t of traceLines(list, ctx.sources)) if (isInventedMethod(t)) add(t.beat, 'invented_method', t.sentence)
  for (const r of enforceCorrections(list, ctx.rejected, ctx.herWords).removed) add(r.beat, r.reason, r.sentence)
  for (const r of stripForeignOffer(list, ctx.foreignOffer).removed) add(r.beat, r.reason, r.sentence)
  return cuts
}

const SENTENCES = /(?<=[.!?])\s+/

/**
 * Hold an extension's output to the late guards. A line the extension did not
 * touch is left alone (the finish judges it as before). A rewritten or inserted
 * line loses the sentences a late guard would remove; a rewrite left empty
 * falls back to its original line, an insert left empty is not added.
 */
export function keepLateSafe<B extends { line?: unknown }>(
  before: ReadonlyArray<B>,
  after: ReadonlyArray<B>,
  ctx: LateGuardContext,
): { beats: B[]; cut: LateCut[] } {
  const original = new Set(before.map((b) => (typeof b?.line === 'string' ? b.line : '')))
  const sameShape = before.length === after.length
  const cut: LateCut[] = []
  const out: B[] = []
  after.forEach((b, i) => {
    const line = typeof b?.line === 'string' ? b.line : ''
    if (!line.trim() || original.has(line)) { out.push(b); return }
    const cuts = lateGuardCuts([{ line }], ctx)
    if (!cuts.length) { out.push(b); return }
    const drop = new Set(cuts.map((c) => c.sentence))
    for (const c of cuts) cut.push({ ...c, beat: i })
    const kept = line.split(SENTENCES).filter((s) => !drop.has(s)).join(' ').trim()
    if (kept) { out.push({ ...b, line: kept }); return }
    if (sameShape && before[i]) out.push(before[i]!)
  })
  return { beats: out, cut }
}

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length

/** Spoken words in a script. */
export function spokenWords(beats: ReadonlyArray<{ line?: unknown }>): number {
  return beats.reduce((n, b) => n + (typeof b?.line === 'string' ? words(b.line) : 0), 0)
}
