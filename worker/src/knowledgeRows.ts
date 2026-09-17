import type { RawKnowledgeItem } from './voice.js'

/** What one extracted item is, plus which pipeline produced it.
 *
 *  ⚠️ TAGGED BY REAL ORIGIN, NOT BY GUESS. The two extractor outputs are
 *  merged by the caller and become indistinguishable one line later; `basis`
 *  correlates with the pipeline today only because captions are clamped to
 *  `demonstrated`, and the correlation is the coincidence. */
export type TaggedItem = RawKnowledgeItem & {
  __source: 'transcript' | 'caption'
  /** Which targeted question this answers, when it answers one (0216). Absent on
   *  everything the general and caption passes return, which is the common case. */
  question_id?: string
  /** What she actually said that supports it, in her own words (0216). Required
   *  by the targeted extractor's schema; absent everywhere else. */
  evidence?: string
}

// THE ROW A CLAIM BECOMES, DECIDED IN ONE PLACE.
//
// ⚠️ THIS WAS INLINE IN `jobs/voice.ts` AND IS NOW CALLED FROM TWO JOBS. The
// second caller is `remine_knowledge`, which re-reads stored transcripts with a
// newer extractor — and a second copy of this normalisation is the exact defect
// this file's neighbours keep recording: two places deciding how much material
// survives, one of them silent. Every rule below (the weakest basis wins, an
// unreadable confidence is 0.5, a blank optional is null, a wrong URL is worse
// than none, an unlisted kind is dropped LOUDLY) now has one implementation, and
// both jobs get every future fix to it.
//
// ⚖️ THE CAP AND THE VERSION ARE ARGUMENTS, NOT CONSTANTS. The scan and the
// re-mine legitimately differ on how much one run may write and on which prompt
// produced it; everything else about a row is identical by construction.

/** A storable row. Named rather than `Record<string, unknown>` so the caller's
 *  dedupe can read `kind` and `text` without a cast — the compiler is the only
 *  reader that catches a renamed column before production does. */
export interface KnowledgeRow {
  owner_id: string
  voice_id: string
  kind: string
  text: string
  basis: string
  source: 'transcript' | 'caption'
  times_seen: number
  confidence: number
  source_url: string | null
  last_observed_at: string
  cost: string | null
  consensus: string | null
  extractor_version: number
  evidence: string | null
  question_id: string | null
}

export interface KnowledgeRowInput {
  items: TaggedItem[]
  ownerId: string
  voiceId: string
  /** The URLs the transcripts came from, indexed as the prompt numbered them. */
  urls: readonly string[]
  /** How many rows this run may write. `KNOWLEDGE_ROWS_PER_SCAN` at both callers
   *  today; an argument because a bound owned by two files is a bound that
   *  eventually disagrees with itself. */
  cap: number
  /** Which extractor made these. See `extractorVersion.ts`. */
  version: number
}

export function knowledgeRowsFrom(
  { items, ownerId, voiceId, urls, cap, version }: KnowledgeRowInput,
): KnowledgeRow[] {
  // A recorded optional line, or null. Blank and whitespace-only collapse to
  // null so an extractor that emits "" for a field it had nothing for cannot
  // be read as having recorded something.
  const shortOrNull = (v: unknown): string | null => {
    const t = String(v ?? '').trim().replace(/\s+/g, ' ')
    return t === '' ? null : t.slice(0, 240)
  }
  let rows: KnowledgeRow[] = items
    .filter((r) => typeof r?.text === 'string' && r.text.trim().length > 0)
    .slice(0, cap)
    .map((r) => ({
      owner_id: ownerId,
      voice_id: voiceId,
      kind: r.kind,
      text: r.text.trim().slice(0, 240),
      // An unreadable basis becomes `inferred` here rather than at the
      // database default, so the weakest reading is chosen where the value is
      // actually known to be junk.
      basis: ['stated', 'demonstrated', 'inferred'].includes(r.basis) ? r.basis : 'inferred',
      source: r.__source,
      times_seen: Math.max(1, Math.min(50, Number(r.times_seen) || 1)),
      // ⚖️ AN UNREADABLE CONFIDENCE IS 0.5, NEVER 1. Silence about how sure
      // the extractor was must not read as certainty — the same rule that
      // makes an unstated `basis` degrade to `inferred`.
      confidence: (() => {
        const n = Number(r.confidence)
        return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.5
      })(),
      // The video it was actually read out of, so a creator disputing an item
      // can go and watch it. Out-of-range or unparseable yields null rather
      // than a wrong URL, because pointing at the wrong video is worse than
      // pointing at none.
      source_url: (() => {
        const i = Number(r.source_video)
        return Number.isInteger(i) && i >= 1 && i <= urls.length ? urls[i - 1] : null
      })(),
      last_observed_at: new Date().toISOString(),
      // ⚖️ THE TWO HALVES THE EXTRACTOR USED TO DROP. Both are OPTIONAL and
      // both normalise an absent/blank/whitespace value to null: "nobody
      // recorded a cost" and "it cost nothing" are different states, and only
      // null says the first. Capped at 240 like `text`, for the same reason.
      cost: shortOrNull(r.cost),
      consensus: shortOrNull(r.consensus),
      // ⚖️ WHICH PROMPT SAID IT. Without this, an improvement to the extractor
      // only ever reaches creators who sign up after it — see
      // `extractorVersion.ts`. Stamped here, at the only place that knows the
      // row came out of THIS worker's extractor, rather than defaulted in the
      // database where a row from an older worker would inherit the lie.
      extractor_version: version,
      // ⚖️ THE SENTENCE THAT EARNED THE CONCLUSION, WHEN THERE IS ONE (0216).
      // Normalised through the same `shortOrNull` as `cost`: a blank evidence
      // string must read as "none recorded", never as "evidence exists and is
      // empty". Absent on every row the general pass returns, and that is the
      // common case rather than a gap.
      evidence: shortOrNull(r.evidence),
      // ⚠️ THE CLOSED SET IS ENFORCED AT THE DATABASE (0216's CHECK), NOT HERE.
      // A `kind` outside its list fails the whole batch, which is why `kind` is
      // filtered below; `question_id` is only ever written by the targeted
      // extractor from its own bank, so a value the CHECK would refuse means the
      // bank and the migration have drifted — and `theBankAndTheCheckAgree` fails
      // on that in CI rather than letting a scan lose its batch in production.
      question_id: shortOrNull(r.question_id),
    }))
  // ⚠️ THE TAXONOMY IS A CLOSED SET AND THE MODEL DOES NOT KNOW THAT.
  // `creator_knowledge_kind_valid` CHECKs this list, so an unlisted kind is a
  // failed INSERT for the whole batch — hence the filter. Duplicated from
  // `KNOWLEDGE_KINDS` in @twinai/shared on purpose: the worker has no runtime
  // dep on it (see directorContract.ts), and `knowledgeKindParity.test.ts`
  // fails if the two ever diverge.
  const KNOWLEDGE_KINDS_WORKER = ['fact', 'opinion', 'topic', 'example', 'experience', 'framework', 'claim', 'product', 'covered']
  // ⚖️ DROPPED, BUT NEVER SILENTLY. Measured on a real 501-caption corpus:
  // 10 of 489 extracted items came back as `action` or `tool` — categories the
  // model wanted and the taxonomy does not have. Filtering them is right;
  // discarding them without a word is how a systematic gap in the taxonomy
  // looks exactly like nothing happening.
  const dropped = rows.filter((r) => !KNOWLEDGE_KINDS_WORKER.includes(r.kind))
  if (dropped.length) {
    const kinds = [...new Set(dropped.map((r) => r.kind))].slice(0, 10)
    console.warn(JSON.stringify({ event: 'knowledge_kind_rejected', count: dropped.length, of: rows.length, kinds }))
  }
  rows = rows.filter((r) => KNOWLEDGE_KINDS_WORKER.includes(r.kind))

  return rows
}
