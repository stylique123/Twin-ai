// OUTPUT-1 — ONE ANSWER TO "DOES THIS GENERATION HAVE A FINISHED VIDEO?"
//
// The root defect every connectivity audit has re-found under a different name.
// Editor v2 finishes into `edit_projects` → `edit_outputs` → `media_assets`.
// History, Dashboard, Calendar, agency review, reports and Social all still ask
// `generations.edit_path`. So a successful v2 render:
//
//   * does not count as `ready` on the Dashboard,
//   * shows the unfinished icon on the Calendar,
//   * filters as `draft` in History,
//   * and is not the file Social would publish.
//
// The renderer succeeding is worth nothing to a creator whose Calendar says the
// video is not done. That is why the audits score this ~0.34 while the editor
// engine scores ~0.82 — a journey is only as trustworthy as its weakest
// identity handoff, and this is the handoff.
//
// ── ONE AUTHORITY, ONE ADAPTER ────────────────────────────────────────────
//
// The rule this module exists to enforce: v2 is the authority, and legacy is
// ADAPTED AT ONE BOUNDARY rather than left as a competing answer. Every surface
// asks here; nothing downstream reads `edit_path` to decide readiness again.
//
// WHY V2 WINS WHEN BOTH EXIST. A generation can carry both — an old auto-edit
// path and a new v2 render. They are not equivalent: the v2 output is the one
// the creator reviewed, the one whose plan and digests are recorded, and the one
// a later approval can be bound to. Preferring `edit_path` because it is easier
// to read would publish a file nobody approved.
//
// ── WHAT THIS DELIBERATELY DOES NOT DECIDE ────────────────────────────────
//
// It answers WHICH output is authoritative. It does not sign URLs, and it is
// not the publish path: `getOutputBundle` is what a surface calls when it needs
// bytes. Readiness is a list-level question asked about many generations at
// once (a Calendar month, a History page), and signing a URL per row to answer
// it would make every list view pay for playback nobody asked for.
import type { EditProjectStatus } from './contracts'
import { getClient } from '../api'

/** Which authority answered, so a caller can say so rather than guess. */
export type OutputAuthority = 'editor_v2' | 'legacy'

export interface FinishedOutput {
  generationId: string
  authority: OutputAuthority
  /** Set for `editor_v2`. The project whose bundle a surface should fetch. */
  editProjectId: string | null
  /** Set for `editor_v2`. Non-null by construction — see `editProducedVideo`. */
  outputAssetId: string | null
  /** Set for `legacy`. The storage path in the `edits` bucket. */
  legacyPath: string | null
}

/** What a list surface holds for one row before asking. */
export interface GenerationLike {
  id: string
  edit_path?: string | null
}

/**
 * The finished-video identity for each generation that HAS one. A generation
 * absent from the map has no finished video by either authority — which is the
 * honest answer to "is this ready", and the one `edit_path` alone gets wrong.
 *
 * One query for the whole list. This is called by Dashboard, History and
 * Calendar on every render of a page of rows, so a per-row round trip would be
 * felt immediately.
 */
export async function resolveFinishedOutputs(
  generations: readonly GenerationLike[],
): Promise<Map<string, FinishedOutput>> {
  const out = new Map<string, FinishedOutput>()
  if (generations.length === 0) return out

  // Legacy first, so a v2 row can overwrite it below. Doing it in this order is
  // the precedence rule, expressed as code rather than as a comment somebody has
  // to honour.
  for (const g of generations) {
    if (g.edit_path) {
      out.set(g.id, {
        generationId: g.id, authority: 'legacy',
        editProjectId: null, outputAssetId: null, legacyPath: g.edit_path,
      })
    }
  }

  const ids = generations.map((g) => g.id)
  // DETERMINISTIC ORDER, because a generation can legitimately have MORE THAN
  // ONE completed project.
  //
  // 0078's uniqueness index is PARTIAL — `where status not in ('completed',
  // 'failed','cancelled')` — so it constrains only projects still in flight. A
  // creator who re-edits a take produces a second completed project on purpose,
  // and both rows carry a real `output_asset_id`.
  //
  // Without an ORDER BY, the loop below took whichever row the database
  // happened to return last. That is not a tie-break, it is an accident: the
  // same generation could resolve to a different video between two page loads,
  // and the id it hands downstream is what an approval would eventually be
  // bound to. An arbitrary last row cannot be an authority.
  //
  // NEWEST COMPLETION WINS. A re-edit supersedes what it re-edited — that is
  // what the creator asked for by re-editing. `completed_at` is set by
  // `editor_complete_output` in the same statement that sets the status, so it
  // is exactly the moment being ordered on. `id` breaks a same-millisecond tie
  // so the answer is stable rather than merely usually-stable.
  const { data, error } = await getClient()
    .from('edit_projects')
    .select('id, generation_id, status, output_asset_id, completed_at')
    .in('generation_id', ids)
    .eq('status', 'completed')
    .not('output_asset_id', 'is', null)
    .order('completed_at', { ascending: true })
    .order('id', { ascending: true })
  // A FAILED LOOKUP MUST NOT DOWNGRADE A GENERATION TO "not ready". Returning
  // the legacy answers already collected is the safe direction: the worst case
  // is a v2 video shown as legacy-ready, which is a wrong label on a real
  // video. The alternative — treating the error as "no output" — would tell a
  // creator their finished video is a draft.
  if (error) return out

  const rows = (data ?? []) as Array<{
    id: string; generation_id: string; status: EditProjectStatus
    output_asset_id: string | null; completed_at: string | null
  }>
  // AND THE CLIENT PICKS DETERMINISTICALLY TOO, rather than trusting arrival
  // order. The ORDER BY above is the right thing to ask the database for, but a
  // resolver whose answer is only correct WHEN the transport preserved that
  // order is still an accident — it just has a longer chain. Comparing here
  // makes the answer identical no matter how the rows arrive, which is what
  // "authority" has to mean for an id an approval will later bind to.
  const chosen = new Map<string, { completedAt: string; id: string }>()
  for (const r of rows) {
    // The query already filters, but this is the same predicate the rest of the
    // product uses and it costs nothing to re-state where the row is consumed.
    if (r.status !== 'completed' || !r.output_asset_id) continue
    // A null `completed_at` sorts oldest: it cannot beat a row that recorded
    // when it finished, and two of them fall through to the id tie-break.
    const key = { completedAt: r.completed_at ?? '', id: r.id }
    const held = chosen.get(r.generation_id)
    const wins = !held
      || key.completedAt > held.completedAt
      || (key.completedAt === held.completedAt && key.id > held.id)
    if (!wins) continue
    chosen.set(r.generation_id, key)
    out.set(r.generation_id, {
      generationId: r.generation_id, authority: 'editor_v2',
      editProjectId: r.id, outputAssetId: r.output_asset_id, legacyPath: null,
    })
  }
  return out
}

/** The list-surface question, asked the same way everywhere. */
export function hasFinishedVideo(
  generationId: string, resolved: ReadonlyMap<string, FinishedOutput>,
): boolean {
  return resolved.has(generationId)
}

/**
 * The three states a list surface renders, in one place so Dashboard, History
 * and Calendar cannot disagree about what "ready" means.
 *
 * `published` outranks `ready` because a posted video is finished AND out; a
 * surface showing it as merely ready would invite a creator to post it twice.
 */
export type GenerationLifecycle = 'draft' | 'ready' | 'published'

export function generationLifecycle(
  generationId: string,
  resolved: ReadonlyMap<string, FinishedOutput>,
  publishedIds: ReadonlySet<string | null>,
): GenerationLifecycle {
  if (publishedIds.has(generationId)) return 'published'
  return resolved.has(generationId) ? 'ready' : 'draft'
}
