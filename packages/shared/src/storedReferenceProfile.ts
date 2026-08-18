// READING BACK WHAT THE BATCH WROTE.
//
// ⚠️ THE VALIDATOR RAN AT WRITE TIME, ON THE WORKER, AND THAT IS NOT A REASON TO
// TRUST THE ROW HERE. `parseContentExtraction` guarantees what the worker STORED;
// it guarantees nothing about what a later schema, a partial migration, or a
// hand-edited row contains. The gallery is the one screen where a malformed
// profile would be loudest — it decides what a creator is shown and what they
// are refused — so the row is checked again on the way out.
//
// ⚖️ AND A ROW THIS FILE CANNOT READ BECOMES AN UNASSESSED CARD, NOT A DROPPED
// ONE. Every rule downstream already treats `not_checked` as "decide nothing",
// so an unreadable assessment degrades to exactly the behaviour the gallery had
// before the batch ran. Throwing would empty the gallery; guessing would fill it
// with claims nobody made.
//
// ⚠️ `schema_version` IS CONSULTED RATHER THAN IGNORED. It exists because the
// pilot was expected to change the shape — version 1 is expected to be wrong
// somewhere — and a reader that ignored it would silently mix rows written
// against two different contracts, which is the one failure the column was added
// to prevent.

import {
  emptyReferenceProfile, type ReferenceProfile,
} from './referenceProfile'
import { ASSESSMENT_BASIS, type Assessed } from './assessed'

/** The version this reader understands. A row stamped anything else is treated
 *  as unassessed — visibly, by returning the empty profile, rather than by being
 *  coerced into a shape it was never written for. */
export const READABLE_SCHEMA_VERSION = 1

export interface StoredProfileRow {
  url?: unknown
  schema_version?: unknown
  profile?: unknown
  error?: unknown
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** Is this leaf an `Assessed<unknown>` — a value that carries how it was known?
 *
 *  ⚠️ THE BASIS IS THE POINT. A bare value that lost its basis on the way through
 *  a serialiser would read as `undefined` at every `isKnown` call and quietly
 *  become "not checked" — the failure would be invisible rather than loud. */
const isAssessed = (v: unknown): v is Assessed<unknown> =>
  isRecord(v) && typeof v.basis === 'string'
  && (ASSESSMENT_BASIS as readonly string[]).includes(v.basis)

/** Every leaf that must be an `Assessed` for the profile to be believable.
 *  Nested one level, because that is how `ReferenceContentProfile` is shaped. */
const REQUIRED: readonly (readonly [string, readonly string[]])[] = [
  ['', ['topic', 'subtopic', 'likelyGoals']],
  ['audience', ['likelySegment', 'sophistication']],
  ['hook', ['mechanism', 'promise']],
  ['structure', ['containerType', 'beats', 'rehookPosition', 'payoffType', 'ctaMechanism']],
  ['requirements', ['contentSlots', 'personalExperienceRequired', 'externalFactsRequired', 'productsRequired']],
  ['commercial', ['posture']],
  ['transfer', ['topicDependence']],
]

/**
 * Turn one stored row into a profile the policy can rank.
 *
 * Returns the EMPTY profile — not null — when the row is missing, failed,
 * written against another schema version, or structurally unreadable. The caller
 * gets a card either way; what changes is whether it carries any knowledge.
 */
export function readStoredReferenceProfile(
  row: StoredProfileRow | null | undefined,
  referenceId: string,
  niche: string | null = null,
): ReferenceProfile {
  const blank = emptyReferenceProfile(referenceId, niche)
  if (!row) return blank
  // ⚖️ A FAILED ASSESSMENT IS A ROW, AND IT CARRIES NO PROFILE. Reading one as
  // knowledge would turn "this video has no speech" into eighteen confident
  // unknowns that look identical to a video nobody tried.
  if (typeof row.error === 'string' && row.error.length > 0) return blank
  if (row.schema_version !== READABLE_SCHEMA_VERSION) return blank

  const p = row.profile
  if (!isRecord(p)) return blank
  for (const [group, fields] of REQUIRED) {
    const scope = group === '' ? p : p[group]
    if (!isRecord(scope)) return blank
    for (const f of fields) if (!isAssessed(scope[f])) return blank
  }

  return {
    referenceId,
    // ⚠️ THE STORED HALF IS THE CONTENT HALF ONLY. The visual profile comes from
    // the FRAMES pass, which has not run — shipping the empty one keeps "what we
    // heard" and "what we saw" separate, which is the distinction the two-pass
    // split exists to preserve.
    // The structural check above is what earns this cast: every field the
    // policy reads has been proven to be an `Assessed` with a legal basis.
    content: { ...blank.content, ...(p as object) } as ReferenceProfile['content'],
    visual: blank.visual,
  }
}
