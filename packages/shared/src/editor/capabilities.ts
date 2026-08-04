// CAPABILITY FLAGS — Phase 11 item 9, and the thing §6 has been waiting for.
//
// §2.2 retired creator archetypes and named what replaces them:
//
//   can_film_objects     from "Can you show a product?"
//   can_record_screen    from "Can you record your screen?"
//   needs_approval       from "Who approves?" / org account
//
// "Flags compose; archetypes don't. Flags change per video; archetypes don't."
//
// ── WHAT LOOKING ACTUALLY FOUND ───────────────────────────────────────────
//
// Two claims in the plan are false against the code, and both changed the work:
//
//  1. Item 9 says flags "replace archetype routing". THERE IS NO ARCHETYPE
//     ROUTING. No Explainer/Demonstrator/Brand enum exists anywhere in this
//     repository — the only occurrences of the word describe a creator's
//     recurring video FORMATS in their scraped DNA, which is a different
//     concept and a legitimate one. So this is a BUILD, not a migration, and
//     nothing has to be un-wired first.
//  2. §2.2 calls these "three booleans already being collected". They are
//     collected nowhere: onboarding asks for handle, platform, audience,
//     product and goal, and stops. Every consumer §2.2 names is therefore
//     downstream of asking the question for the first time.
//
// ── UNSET IS A THIRD STATE, AND THAT IS THE WHOLE DESIGN ──────────────────
//
// `can_film_objects = false` means "never show this creator a footage
// checklist". That is a feature being REMOVED, and defaulting it to false for
// everyone who has not answered would silently remove it from every existing
// account — the failure this project keeps meeting, where a missing value is
// read as a real one.
//
// So a flag is `true`, `false`, or UNKNOWN, and unknown is not false. A caller
// asking "may I skip the checklist?" gets a different answer from "has this
// creator told us they cannot film objects?", and both are spelled out below
// rather than left to `!flag`.
//
// ── WHY PER-VIDEO OVERRIDES AN ACCOUNT DEFAULT ────────────────────────────
//
// "Flags change per video" is the sentence that separates this from the
// archetype trap. The account default is a convenience — what is usually true
// of this creator's setup — and the video's own answer wins whenever it exists.
// Neither is derived from the other, and the resolution says WHICH ONE
// answered, so a surprising skip can always be traced to the video or the
// account rather than to a rule nobody can see.

export const CAPABILITY_FLAG_NAMES = [
  'can_film_objects',
  'can_record_screen',
  'needs_approval',
] as const

export type CapabilityFlagName = (typeof CAPABILITY_FLAG_NAMES)[number]

/** One flag's stored value. `null` and absence both mean NOBODY HAS SAID. */
export type CapabilityFlagValue = boolean | null

/** What a video or an account carries. Every key optional: a partially
 *  answered set is the ordinary state, not a corrupt one. */
export type CapabilityFlags = Partial<Record<CapabilityFlagName, CapabilityFlagValue>>

/** Where a resolved answer came from. Carried so "why was I not asked to film
 *  anything?" has an answer that names the video or the account. */
export type CapabilitySource = 'video' | 'account' | 'unset'

export interface ResolvedCapability {
  value: CapabilityFlagValue
  source: CapabilitySource
}

export type ResolvedCapabilities = Record<CapabilityFlagName, ResolvedCapability>

const isFlagValue = (v: unknown): v is boolean => v === true || v === false

/**
 * Read a stored flag set, keeping only the three names and only real booleans.
 *
 * ANYTHING ELSE IS DROPPED TO UNSET rather than coerced. `"true"`, `1` and
 * `"yes"` are all things a client could send, and each would become a
 * confident `true` under a truthiness check — including for `can_film_objects`,
 * where a wrong `false` removes a screen the creator needed.
 */
export function readCapabilityFlags(raw: unknown): CapabilityFlags {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const src = raw as Record<string, unknown>
  const out: CapabilityFlags = {}
  for (const name of CAPABILITY_FLAG_NAMES) {
    const v = src[name]
    if (isFlagValue(v)) out[name] = v
  }
  return out
}

/**
 * The answer in force for this video, and who gave it.
 *
 * THE VIDEO WINS, ALWAYS, INCLUDING WHEN IT SAYS `false`. An account that can
 * usually film objects still has videos where the product is not to hand, and
 * treating the account default as the floor would make the per-video answer
 * advisory — which is the archetype trap wearing the other costume: a setting
 * that sorts the person and cannot be escaped for one video.
 */
export function resolveCapabilities(
  video: unknown, account: unknown,
): ResolvedCapabilities {
  const v = readCapabilityFlags(video)
  const a = readCapabilityFlags(account)
  const out = {} as ResolvedCapabilities
  for (const name of CAPABILITY_FLAG_NAMES) {
    if (isFlagValue(v[name])) out[name] = { value: v[name] as boolean, source: 'video' }
    else if (isFlagValue(a[name])) out[name] = { value: a[name] as boolean, source: 'account' }
    else out[name] = { value: null, source: 'unset' }
  }
  return out
}

/**
 * "May I skip this?" — the question a consumer actually has, asked so that
 * unknown cannot answer it.
 *
 * A footage checklist is skipped only when the creator has SAID they cannot
 * film objects. Silence means show it: an unnecessary checklist is friction,
 * and a missing one is a video the creator cannot make. Those costs are not
 * symmetric, so the default is not a matter of taste.
 */
export function isExplicitlyFalse(r: ResolvedCapability): boolean {
  return r.value === false
}

/** "Has this been switched on deliberately?" — the mirror, for features that
 *  must not appear until asked for (a screen-recording clip type nobody can
 *  use, an approval lock on a solo account). */
export function isExplicitlyTrue(r: ResolvedCapability): boolean {
  return r.value === true
}

/** The flags nobody has answered yet — what an onboarding brief should ask,
 *  and what a consumer should say it does not know. */
export function unansweredCapabilities(r: ResolvedCapabilities): CapabilityFlagName[] {
  return CAPABILITY_FLAG_NAMES.filter((n) => r[n].source === 'unset')
}

/**
 * Narrow a flag set to what may be STORED, for a writer.
 *
 * Returns only the recognised names with real boolean values, so an unknown key
 * can never reach the column and a client cannot invent a fourth flag by
 * writing one. `null` is preserved as an explicit "unset this", distinct from
 * omitting the key, so a creator can withdraw an answer they gave by mistake.
 */
export function sanitizeCapabilityFlagsForWrite(raw: unknown): CapabilityFlags {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const src = raw as Record<string, unknown>
  const out: CapabilityFlags = {}
  for (const name of CAPABILITY_FLAG_NAMES) {
    if (!(name in src)) continue
    const v = src[name]
    if (isFlagValue(v)) out[name] = v
    else if (v === null) out[name] = null
  }
  return out
}

/**
 * WHAT READS THESE FLAGS TODAY: NOTHING.
 *
 * Declared rather than left to be discovered, following the precedent
 * `analysis_components.json` set for the alignment component: a capability that
 * is storable but unread is a COMPLETE state, and saying so is what stops the
 * next reader assuming a flag they set is changing anything.
 *
 * Each consumer below is named in §2.2 and blocked on something real:
 *
 *   can_film_objects  -> the footage checklist. Phase 12 item 12 (what fills
 *                        the container) owns the checklist itself; there is no
 *                        checklist to skip yet.
 *   can_record_screen -> the screen-recording clip type, Phase 12 item 13.
 *                        Offering a clip type the pipeline cannot ingest would
 *                        be worse than not offering it.
 *   needs_approval    -> the review screen's lock, comments, and record of who
 *                        approved. The review screen now EXISTS (§4.8), so this
 *                        is the first consumer that becomes buildable — and it
 *                        is a regulated-tier feature with its own product
 *                        surface, not a flag read.
 *
 * A test pins this list against the codebase, so the day something starts
 * reading a flag, this comment cannot stay wrong.
 */
export const CAPABILITY_CONSUMERS_BUILT: readonly CapabilityFlagName[] = []
