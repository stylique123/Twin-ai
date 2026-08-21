// A DISAGREEMENT THAT CHANGES NOTHING IS NOT A DISAGREEMENT WORTH PAYING FOR.
//
// ⚠️ RAW FIELD EQUALITY IS THE WRONG PASS CRITERION FOR A MODEL SWAP. Two models
// can differ in eight fields of wording and agree on every decision Twin makes,
// or agree on nineteen fields and differ on the one that changes what a creator
// is offered. The second is worse, and a percentage that treats those fields
// alike cannot say so.
//
// ⚖️ SO THE DOWNSTREAM ANSWER IS COMPUTED, NOT APPROXIMATED. This calls the REAL
// `eligibility()` — the function the gallery actually uses — on both arms'
// profiles. A hand-written list of "important fields" standing in for it would
// be a second copy of a decision the product already encodes, and would drift
// from it silently. This module lives in `shared` for exactly that reason: it is
// the only place that can ask the real question.
import { eligibility, type GalleryCreatorView } from './galleryPolicy'
import type { ReferenceContentProfile } from './referenceContentProfile'
import { emptyReferenceProfile } from './referenceProfile'

/** ⚠️ THE CREATOR PANEL IS FIXED BEFORE THE DATA, and it exists because
 *  `eligibility` is a function of TWO things. A refusal depends on who is
 *  asking: the ownership branch fires only when the reference claims an owner
 *  posture AND the creator is not an owner. Scoring against a single creator
 *  would miss precisely the disagreements that matter to somebody else. */
export const CREATOR_PANEL: readonly { name: string; view: GalleryCreatorView }[] = [
  { name: 'owner', view: { goals: [], preferredFormats: [], relationship: 'OWN_PRODUCT', productCount: 3, canFilmObjects: true, canRecordScreen: true } },
  { name: 'affiliate', view: { goals: [], preferredFormats: [], relationship: 'AFFILIATE', productCount: 1, canFilmObjects: true, canRecordScreen: true } },
  // ⚖️ THE UNASKED CREATOR IS NOT A THIRD OPINION, IT IS THE COMMON CASE. Most
  // rows have never been asked about their relationship, and `null` must refuse
  // nobody — so a model change that started refusing them would be a product
  // regression invisible to the other two panellists.
  { name: 'unstated', view: { goals: [], preferredFormats: [], relationship: null, productCount: 0, canFilmObjects: null, canRecordScreen: null } },
]

/** Build the shape `eligibility` wants, holding the VISUAL half identical and
 *  empty for both arms. The parity trial varies the content extractor only, so
 *  any difference must come from the content profile or it is not evidence
 *  about the models. */
function asRef(referenceId: string, content: ReferenceContentProfile) {
  return { ...emptyReferenceProfile(referenceId), content }
}

export type Verdicts = Record<string, string>

/**
 * What actually changes for a creator, per arm, across the panel.
 *
 * ⚠️ A THROW IS A VERDICT, NOT A CRASH. A profile malformed enough to break the
 * policy function is itself a difference between the arms; swallowing it would
 * quietly drop the worst cases out of the denominator.
 */
export function downstreamVerdicts(
  referenceId: string, profile: ReferenceContentProfile,
): Verdicts {
  const out: Verdicts = {}
  for (const { name, view } of CREATOR_PANEL) {
    try {
      const e = eligibility(asRef(referenceId, profile), view)
      out[name] = `${e.eligible ? 'eligible' : 'refused'}:${e.eligible ? '-' : e.reason}`
    } catch (err) {
      out[name] = `threw:${err instanceof Error ? err.message.slice(0, 60) : 'unknown'}`
    }
  }
  return out
}

export interface DownstreamComparison {
  a: Verdicts
  b: Verdicts
  differing: string[]
  anyDiffer: boolean
}

/** Where the two arms would offer a creator different things. */
export function downstreamDisagreements(
  referenceId: string, profileA: ReferenceContentProfile, profileB: ReferenceContentProfile,
): DownstreamComparison {
  const a = downstreamVerdicts(referenceId, profileA)
  const b = downstreamVerdicts(referenceId, profileB)
  const differing = CREATOR_PANEL.map((p) => p.name).filter((n) => a[n] !== b[n])
  return { a, b, differing, anyDiffer: differing.length > 0 }
}

export interface Contradiction { field: string; a: unknown; b: unknown; why: string }

const valueAt = (p: unknown, path: string): unknown => {
  const f = path.split('.').reduce<unknown>(
    (v, k) => (v == null ? v : (v as Record<string, unknown>)[k]), p)
  if (f == null) return null
  return (typeof f === 'object' && f !== null && 'value' in f)
    ? (f as { value: unknown }).value ?? null : f
}

/**
 * Claims that cannot both be true of one video.
 *
 * ⚠️ NOT A DISAGREEMENT ABOUT DEGREE. Both models answered, both were believed
 * by the parser, and they said incompatible things — which means one stored
 * profile is actively WRONG rather than merely thin. That is a different failure
 * from one model declining to answer, and pooling them would hide which one we
 * have.
 */
export function hardContradictions(
  profileA: ReferenceContentProfile, profileB: ReferenceContentProfile,
): Contradiction[] {
  const out: Contradiction[] = []
  const OWNER = new Set(['OWN_PRODUCT', 'OWN_SERVICE'])

  const pa = valueAt(profileA, 'commercial.posture') as string | null
  const pb = valueAt(profileB, 'commercial.posture') as string | null
  // ⚖️ BOTH KNOWN, OR IT IS NOT A CONTRADICTION. One arm declining is a softer
  // failure and must not inflate this count.
  if (pa && pb && OWNER.has(pa) !== OWNER.has(pb)) {
    out.push({ field: 'commercial.posture', a: pa, b: pb,
      why: 'one says the speaker owns the thing and the other does not — this decides who is ALLOWED to recreate it' })
  }

  const needsPersonal = (p: ReferenceContentProfile): boolean | null => {
    const s = valueAt(p, 'requirements.contentSlots')
    return Array.isArray(s) ? s.some((x) => (x as { kind?: string })?.kind === 'personal_experience') : null
  }
  const ra = needsPersonal(profileA), rb = needsPersonal(profileB)
  if (ra !== null && rb !== null && ra !== rb) {
    out.push({ field: 'requirements.contentSlots', a: ra, b: rb,
      why: 'one requires a personal experience Twin cannot invent and the other does not' })
  }
  return out
}
