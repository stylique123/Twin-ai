// WHAT THIS PERSON ACTUALLY KNOWS — the second memory, beside Creator DNA.
//
// ── THE DEFECT THIS CLOSES ────────────────────────────────────────────────
//
// TwinAI's founding failure is "voice-accurate, content-empty": it captures HOW
// someone talks and almost nothing about WHAT they know, then hands them their
// own opinions back in their own phrasing. That is not an emergent property of
// the model. It is written into the schema — the DNA record carries ~15 fields
// describing delivery and about four short strings of substance, every one of
// which the extractor is explicitly licensed to GUESS when the captions are thin.
//
// Worse, the richest substance in the system is thrown away on purpose: the
// worker transcribes up to five of a creator's videos, uses them once for tone,
// and persists `audio_transcripts: 5` — a COUNT. Everything they said is gone.
//
// ── THE SPLIT ─────────────────────────────────────────────────────────────
//
//   Creator DNA        how I sound      tone, pacing, hooks, vocabulary
//   Creator Knowledge  what I know      THIS FILE
//   Audience Memory    what they ask    recurring questions, as summaries
//   Product DNA        what is true     `productEntity.ts`
//   Reference DNA      how it works     `referenceMechanism.ts`
//
// The reference gives the FORMAT. DNA gives the VOICE. Knowledge gives the
// SUBSTANCE. Handed "3 things I stopped buying after I turned 30", a system with
// only the first two invents three random products; one that also knows this
// creator thinks megapixels are oversold and battery matters more than camera
// gimmicks can write "3 phone features I stopped paying extra for".
//
// ── EXTRACT, THEN FORGET ──────────────────────────────────────────────────
//
// ⚖️ THE RAW TRANSCRIPT IS FUEL, NOT A RECORD. Knowledge is distilled from it and
// the source text expires; what persists is a short structured claim plus enough
// provenance to trace it. That is the whole reason this is a separate table
// rather than a `transcripts` column: a durable claim is what the writer needs,
// and durable raw speech is a liability nobody asked us to hold. `sourceExpiry`
// exists so that discipline is representable rather than a promise in a comment.
//
// The same rule governs audience material even more strictly. Comments are
// written by people who never signed up for anything here, so nothing in this
// module stores a comment — only a SUMMARY of what many of them asked, with a
// count, which is why `AudienceQuestion` has no author, no text and no id.
//
// ── NOTHING HERE MAY BE INVENTED ──────────────────────────────────────────
//
// The DNA extractor's instruction is "COMPLETENESS IS MANDATORY … a confident,
// specific inference is far more useful than a blank", and the generator's
// fallbacks say "NONE STORED. Infer 1-2 stances this creator would plausibly
// hold". That is how a guess becomes a quote in someone's mouth. So every item
// here carries `basis`, an empty knowledge base is a legal and honest state, and
// `writableClaims` refuses anything not directly stated. A creator can be
// contradicted by their own video; they cannot be contradicted by ours.

/** Where an item came from. Three-state on purpose: `inferred` is not a weaker
 *  `stated`, it is a DIFFERENT KIND of thing and may never be quoted back. */
export const KNOWLEDGE_BASIS = ['stated', 'demonstrated', 'inferred'] as const
export type KnowledgeBasis = (typeof KNOWLEDGE_BASIS)[number]

/** What kind of substance this is. Closed, so a new kind cannot appear
 *  downstream with nothing deciding whether it may be spoken. */
export const KNOWLEDGE_KINDS = [
  'topic',       // something they return to
  'belief',      // a position they hold
  'example',     // a concrete case they have used
  'experience',  // something they personally did
  'framework',   // a repeatable method they teach
  'claim',       // an assertion carrying a number or outcome
  'covered',     // already made a video about it — do NOT repeat
] as const
export type KnowledgeKind = (typeof KNOWLEDGE_KINDS)[number]

export interface KnowledgeItem {
  kind: KnowledgeKind
  /** The substance itself, in one line. Short on purpose: this is a distillate,
   *  not a quotation, and a long one is a transcript wearing a disguise. */
  text: string
  basis: KnowledgeBasis
  /** How many separate videos this showed up in. A position held once is a
   *  remark; the same one across five videos is what they are known for. */
  timesSeen: number
  /** Which source it was distilled from — an id, never the text. Enough to
   *  trace, not enough to reconstitute. */
  sourceRef: string | null
  /** When the RAW source may no longer be kept. The item outlives it. Null means
   *  the source was never retained in the first place, which is the strongest
   *  state rather than a missing value. */
  sourceExpiry: string | null
}

/** What an audience keeps asking, as a summary and a count. Never a comment,
 *  never an author. "Many people are confused about battery health" is the
 *  whole shape — anything more specific is someone else's words. */
export interface AudienceQuestion {
  summary: string
  asked: number
}

export interface CreatorKnowledge {
  items: KnowledgeItem[]
  audience: AudienceQuestion[]
}

export function emptyKnowledge(): CreatorKnowledge {
  return { items: [], audience: [] }
}

const MAX_TEXT = 240

function line(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim().replace(/\s+/g, ' ')
  return t === '' ? null : t.slice(0, MAX_TEXT)
}

function count(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isInteger(n) && n > 0 ? n : 1
}

/** Read one item defensively. Returns null rather than a half-item: a claim
 *  with no text and a basis of "stated" is worse than nothing, because it reads
 *  as verified. */
export function readKnowledgeItem(raw: unknown): KnowledgeItem | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const src = raw as Record<string, unknown>
  const text = line(src.text)
  if (!text) return null
  const kind = KNOWLEDGE_KINDS.find((k) => k === src.kind)
  if (!kind) return null
  // ⚖️ AN UNSTATED BASIS IS `inferred`, NEVER `stated`. Silence about where
  // something came from must degrade to the weakest reading, or the default
  // quietly promotes every guess into a fact — the exact move that produced
  // "voice-accurate, content-empty".
  const basis = KNOWLEDGE_BASIS.find((b) => b === src.basis) ?? 'inferred'
  return {
    kind,
    text,
    basis,
    timesSeen: count(src.timesSeen ?? src.times_seen),
    sourceRef: line(src.sourceRef ?? src.source_ref),
    sourceExpiry: line(src.sourceExpiry ?? src.source_expiry),
  }
}

export function readKnowledge(raw: unknown): CreatorKnowledge {
  const out = emptyKnowledge()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  const src = raw as Record<string, unknown>
  if (Array.isArray(src.items)) {
    out.items = src.items.map(readKnowledgeItem).filter((i): i is KnowledgeItem => i !== null)
  }
  if (Array.isArray(src.audience)) {
    out.audience = src.audience
      .map((a) => {
        const summary = line((a as Record<string, unknown> | null)?.summary)
        return summary ? { summary, asked: count((a as Record<string, unknown>).asked) } : null
      })
      .filter((a): a is AudienceQuestion => a !== null)
  }
  return out
}

/**
 * The items a script may SPEAK as this creator's own position.
 *
 * ⚖️ `inferred` is excluded, and that exclusion is the point of the module. An
 * inferred belief is our guess about someone, and putting it in their mouth is
 * indistinguishable — to them, to their audience — from them having said it.
 * Inferred items may still STEER a script; they may not be voiced by it.
 */
export function writableClaims(k: CreatorKnowledge): KnowledgeItem[] {
  return k.items.filter((i) => i.basis !== 'inferred' && i.kind !== 'covered')
}

/** What they have already made a video about. The writer needs this to avoid
 *  handing a creator their own last upload back. */
export function alreadyCovered(k: CreatorKnowledge): KnowledgeItem[] {
  return k.items.filter((i) => i.kind === 'covered')
}

/** Ranked by how established a position is — repeated first, then directly
 *  stated over merely demonstrated. What someone is KNOWN for should reach a
 *  bounded prompt before a one-off remark does. */
export function rankedKnowledge(k: CreatorKnowledge): KnowledgeItem[] {
  const weight = (i: KnowledgeItem) => (i.basis === 'stated' ? 2 : i.basis === 'demonstrated' ? 1 : 0)
  return [...writableClaims(k)].sort((a, b) => b.timesSeen - a.timesSeen || weight(b) - weight(a))
}

/** Is a raw source past the date we said we would stop holding it? Callers do
 *  the deleting; this module only makes the question answerable. */
export function sourceExpired(item: KnowledgeItem, now: Date): boolean {
  if (!item.sourceExpiry) return true // never retained — nothing to expire
  const t = Date.parse(item.sourceExpiry)
  return Number.isNaN(t) ? false : t <= now.getTime()
}

/**
 * Knowledge as prompt text.
 *
 * ⚖️ EMPTY IS A LEGAL ANSWER AND RETURNS THE EMPTY STRING. It must NOT emit
 * "none stored, infer some" — that instruction is how the generator currently
 * manufactures opinions, and re-creating it here would rebuild the defect this
 * file exists to remove. A creator we know nothing about gets a script with no
 * borrowed substance, which is honest, rather than one with invented substance,
 * which is not.
 */
export function knowledgePromptLine(k: CreatorKnowledge, limit = 12): string {
  const claims = rankedKnowledge(k).slice(0, limit)
  const covered = alreadyCovered(k)
  if (claims.length === 0 && covered.length === 0) return ''
  const parts: string[] = []
  if (claims.length) {
    parts.push(
      '\nWHAT THIS CREATOR ACTUALLY KNOWS AND HAS SAID — real substance, not style.'
      + ' Build the video out of THIS. These are their own positions and examples,'
      + ' so you may put them in their mouth; anything you add that is not here is'
      + ' yours, and they did not say it.\n'
      + claims.map((c) => `  * (${c.kind}) ${c.text}`).join('\n'))
  }
  if (covered.length) {
    parts.push(
      '\nALREADY COVERED — they have made a video about each of these. Do NOT hand'
      + ' them their own upload back; go at the topic from an angle they have not used.'
      + ' THIS LIST IS NEVER SPOKEN. It steers what you choose, and it must not appear'
      + ' in any line: a script that says "we\'ve had a video on this" is narrating our'
      + ' notes to the audience, and it asserts something about their back catalogue'
      + ' that nobody checked the phrasing of. Use it to pick a DIFFERENT angle, then'
      + ' write as though the earlier video were simply not the subject.\n'
      + covered.map((c) => `  * ${c.text}`).join('\n'))
  }
  if (k.audience.length) {
    parts.push(
      '\nWHAT THEIR AUDIENCE KEEPS ASKING — summarised, never quoted. A video that'
      + ' answers one of these is wanted before it is made.\n'
      + k.audience.map((a) => `  * ${a.summary} (asked ~${a.asked}x)`).join('\n'))
  }
  return parts.join('\n')
}
