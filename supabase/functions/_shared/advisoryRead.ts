// GENERATED FROM packages/shared/src/script/advisoryRead.ts — DO NOT EDIT.
// Run: node scripts/ci/generate_shared_pilot_core.mjs
// Edit the source instead. CI regenerates this file and fails on a diff.
// @ts-nocheck
// ONE ADVISORY READ PER SCRIPT — WHAT TO ASK, AND WHAT TO BELIEVE BACK.
//
// ── WHY ONE CALL AND NOT TWO ──────────────────────────────────────────────
//
// Two separate model passes were specified: a semantic repetition judge, and a
// second tier of cliche defence for the phrases the enumerated list cannot
// reach. They read the SAME TEXT to answer two questions about word choice.
// Asking twice costs twice and can return contradictory readings of one line,
// so this is one ask with two answer slots.
//
// Tier one of the cliche defence already ships and is wired
// (script/clichePhrases.ts -> Result.tsx). This never re-reports what that
// list already caught: a note the creator has already been shown, repeated in
// a second voice, reads as two problems where there is one.
//
// ── WHAT THIS REFUSES TO DO ───────────────────────────────────────────────
//
// ⚠️ ADVISORY, NEVER BLOCKING, AND IT RUNS AFTER THE RESCUE POINT. A judge that
// can fail a generation is a judge that can cost a creator the script they paid
// for. Every path here degrades to "no advice" rather than to an error.
//
// ⚠️ IT NEVER SPEAKS ABOUT THE RE-HOOK OR THE CTA. `lexicalFloor` exempts them
// and the ask names them as deliberate. #41 was a bug report about the
// teleprompter DELETING the re-hook beat; a judge that flags the format would
// be arguing with the product.
//
// ⚠️ AND IT IS NOT EVIDENCE OF A RATE. A blind creator panel put beat
// repetition at 67%; every lexical measure computable from production lands at
// 0-11% (see script/repetition.ts for the numbers). This module cannot settle
// that, and a verdict it returns is one model's reading of one script, never a
// measurement of how often the writer repeats itself.
import type { LexicalFloor } from './repetition.ts'

/** ⚠️ FEWER BEATS THAN THIS AND THERE IS NOTHING TO REPEAT. A three-beat script
 *  that says one thing three ways is a three-beat script; the shape is the
 *  format, not a defect. Below this the call is not worth its cost. */
export const MIN_BEATS_TO_ASK = 4

/**
 * ⚠️ TWO FINDINGS, NOT ONE. A single flagged pair is inside the noise of a
 * model reading six sentences, and surfacing it would train creators to ignore
 * the note. The payoff branch that fired on one finding measured 1-6 and is
 * deliberately not built.
 */
export const MIN_FINDINGS_TO_SURFACE = 2

/** ⚠️ A CAP, SO ONE BAD RESPONSE CANNOT PAPER THE SCRIPT IN NOTES. */
export const MAX_FINDINGS = 4

export type AdvisoryKind = 'repetition' | 'generic_phrasing'

export interface AdvisoryFinding {
  kind: AdvisoryKind
  /** The beat this note attaches to. */
  beat: number
  /** For repetition, the earlier beat it echoes. Null for generic phrasing. */
  echoes: number | null
  /** The model's own words for what is doubled, quoted back to the creator. */
  what: string
}

export interface AdvisoryVerdict {
  findings: AdvisoryFinding[]
  /** Why nothing is being shown, when nothing is. Never silently empty. */
  quiet: 'not_asked_too_short' | 'model_declined' | 'below_threshold' | null
}

/**
 * Is this script worth one advisory call?
 *
 * ⚖️ THE FLOOR IS AN INPUT, NOT A GATE. A script the floor scored clean may
 * still repeat itself in unrelated words -- that is the entire reason a model
 * is being asked -- so a clean floor does NOT skip the call. Only length does.
 */
export function shouldAsk(floor: LexicalFloor): boolean {
  return floor.comparedBeats >= MIN_BEATS_TO_ASK
}

function intOrNull(v: unknown, max: number): number | null {
  // ⚠️ THE NULL CHECK PRECEDES THE COERCION. Number(null) is 0 and 0 is a valid
  // beat index, so a missing index would attach a note to the hook.
  if (typeof v !== 'number' || !Number.isInteger(v)) return null
  if (v < 0 || v > max) return null
  return v
}

function cleanText(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim().replace(/\s+/g, ' ')
  if (t.length < 3 || t.length > 160) return null
  return t
}

/**
 * Read what the model returned, believing as little as possible.
 *
 * `beatCount` bounds every index; `exemptBeats` are dropped even if the model
 * names them, because the ask told it not to and a model that ignores the ask
 * is exactly the case worth defending against.
 */
export function readVerdict(
  raw: unknown, beatCount: number, exemptBeats: readonly number[],
): AdvisoryVerdict {
  const rows = (raw as { findings?: unknown })?.findings
  if (!Array.isArray(rows)) return { findings: [], quiet: 'model_declined' }

  const exempt = new Set(exemptBeats)
  const seen = new Set<string>()
  const out: AdvisoryFinding[] = []

  for (const r of rows) {
    const row = r as Record<string, unknown>
    const kind = row.kind === 'repetition' || row.kind === 'generic_phrasing' ? row.kind : null
    const beat = intOrNull(row.beat, beatCount - 1)
    const what = cleanText(row.what)
    if (kind === null || beat === null || what === null) continue
    if (exempt.has(beat)) continue

    let echoes: number | null = null
    if (kind === 'repetition') {
      echoes = intOrNull(row.echoes, beatCount - 1)
      // A repetition finding that names no earlier beat is an opinion about one
      // line, which is the other kind. It is dropped rather than relabelled.
      if (echoes === null || echoes === beat || exempt.has(echoes)) continue
      // Always point from the later beat back to the earlier one, so two
      // findings about the same pair collapse instead of both showing.
      if (echoes > beat) { const t = echoes; echoes = beat; out.push({ kind, beat: t, echoes, what }); }
      else out.push({ kind, beat, echoes, what })
    } else {
      out.push({ kind, beat, echoes: null, what })
    }
    const last = out[out.length - 1]
    if (last) {
      const key = `${last.kind}:${last.beat}:${last.echoes ?? ''}`
      if (seen.has(key)) out.pop()
      else seen.add(key)
    }
    if (out.length >= MAX_FINDINGS) break
  }

  if (out.length === 0) return { findings: [], quiet: 'model_declined' }
  if (out.length < MIN_FINDINGS_TO_SURFACE) return { findings: [], quiet: 'below_threshold' }
  return { findings: out, quiet: null }
}

/**
 * The note shown beside a beat.
 *
 * ⚖️ PLAIN ENGLISH, NO GRADE, SAME VOICE AS `stockPhraseNote`. It names what is
 * doubled and leaves the decision with the creator. It never says the beat is
 * bad and it never counts.
 */
export function advisoryNote(
  findings: readonly AdvisoryFinding[], beatIndex: number,
): string | null {
  const f = findings.find((x) => x.beat === beatIndex)
  if (!f) return null
  if (f.kind === 'repetition' && f.echoes !== null) {
    return `This says the same thing as line ${f.echoes + 1} — ${f.what}. Cut one, or make this one earn its place.`
  }
  return `${f.what} — say it the way you would say it out loud.`
}
