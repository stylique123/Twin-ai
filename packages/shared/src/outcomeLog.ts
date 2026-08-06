// READING AND WRITING §7b's OUTCOME LOG FROM THE CLIENT.
//
// `editor/outcomes.ts` says what a valid observation and a valid claim ARE, and
// 0105 stores them. Nothing read either one. This is the layer between.
//
// ── THE WRITE IS THE MOAT, AND IT WAS SILENTLY MISSING ────────────────────
//
// §7b: "START LOGGING NOW, even though the feature is late. You cannot recover
// history you did not record." The creator has been typing view counts into the
// dashboard the whole time — and `updatePostStats` wrote them to `posts.views`,
// a SCALAR, destroying the previous number on every save.
//
// So the history was not merely unrecorded; it was being overwritten by the one
// UI that had the numbers. `recordPostStats` below keeps that column as the
// cache it is and APPENDS the reading, which is the only part that cannot be
// reconstructed later.
//
// ── "NOT RECORDING" IS NOT "NOTHING TO SHOW" ─────────────────────────────
//
// 0105 is not deployed yet, so the table can be absent. An absent table returns
// `42P01`, and the tempting handling — treat it as zero rows — would put "no
// readings yet" in front of a creator whose readings are being thrown away.
// Those are opposite statements: one says the log is empty, the other says
// there is no log. `known: false` carries the difference all the way to the
// screen, which then says nothing rather than something false.
import { getClient } from './api'
import {
  validateClaim, validateObservation,
  type OutcomeClaim, type OutcomeObservation, type OutcomeSource,
} from './editor/outcomes'
import {
  validateAttribution,
  type AttributionKind, type PostAttribution,
} from './editor/attribution'

/** Postgres `undefined_table`. The table is absent because the migration has
 *  not been applied — never because the query was wrong. */
const UNDEFINED_TABLE = '42P01'

export interface OutcomeLogRead {
  /** Whether the log's contents are KNOWN. False means the read did not learn
   *  them — the table is absent, or the query failed — which is a different
   *  fact from an empty log and must never be rendered as one. */
  known: boolean
  readings: OutcomeObservation[]
}

const EMPTY_UNKNOWN: OutcomeLogRead = { known: false, readings: [] }

/**
 * One video's readings, oldest first.
 *
 * Ordered by `observed_at` and NOT by `created_at`: a backfilled reading of last
 * week is last week's fact, and ordering by insertion would silently put it
 * after this morning's.
 *
 * Rows that fail validation are DROPPED rather than repaired. The write path
 * and a CHECK constraint both refuse malformed rows, so one appearing here
 * means something upstream is wrong — and rendering a repaired version of it
 * would hide that while still showing a number.
 */
export async function listPostObservations(postId: string): Promise<OutcomeLogRead> {
  const { data, error } = await getClient()
    .from('post_outcome_observations')
    .select('metric, value, observed_at, source')
    .eq('post_id', postId)
    .order('observed_at', { ascending: true })
    .limit(500)
  if (error) {
    if ((error as { code?: string }).code === UNDEFINED_TABLE) return EMPTY_UNKNOWN
    // Any other failure is a read that MIGHT have had rows. Reporting it as an
    // empty-but-present log would assert something this call did not learn.
    return EMPTY_UNKNOWN
  }
  const readings: OutcomeObservation[] = []
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const v = validateObservation({
      metric: row.metric,
      // `bigint` arrives as a string from PostgREST when it exceeds 2^53; below
      // that it is a number. Normalising here rather than widening the contract
      // keeps `value` an integer everywhere else.
      value: typeof row.value === 'string' ? Number(row.value) : row.value,
      observedAt: row.observed_at,
      source: row.source,
    })
    if (!('rejected' in v)) readings.push(v)
  }
  return { known: true, readings }
}

export type AppendOutcome =
  | { ok: true }
  /** The reading was refused before it was sent — see `editor/outcomes.ts`. */
  | { ok: false; reason: 'invalid' }
  /** The log does not exist yet. NOT an error the creator caused, and not a
   *  reason to fail their save — but never reported as success either. */
  | { ok: false; reason: 'not_recording' }
  | { ok: false; reason: 'rejected' }

/**
 * Append one reading. Never overwrites, because the table refuses to be.
 *
 * Returns a REASON rather than throwing or swallowing. The caller's save must
 * not fail because the log is missing, and it must not claim to have recorded
 * history it did not — those are both satisfied by a value, and by neither a
 * thrown error nor a silent catch.
 */
export async function appendObservation(
  postId: string,
  raw: { metric: string; value: number; observedAt: string; source: OutcomeSource },
  /**
   * LEARNING-1 lineage: WHAT attributed this reading — a `post_attributions`
   * id. Optional, and absent is the normal case rather than an oversight: a
   * platform view count is attributed by nothing, and requiring one everywhere
   * would make the field meaningless by making it universal.
   */
  attributionId?: string,
): Promise<AppendOutcome> {
  const obs = validateObservation(raw)
  if ('rejected' in obs) return { ok: false, reason: 'invalid' }
  const client = getClient()
  const { data: auth } = await client.auth.getUser()
  if (!auth.user) return { ok: false, reason: 'rejected' }
  const { error } = await client.from('post_outcome_observations').insert({
    owner_id: auth.user.id,
    post_id: postId,
    metric: obs.metric,
    value: obs.value,
    observed_at: obs.observedAt,
    source: obs.source,
    // Omitted entirely rather than sent as null when absent, so this insert is
    // byte-identical to the pre-0113 one on a database where the column does
    // not exist yet. Naming a column PostgREST has never heard of fails the
    // whole write, which would stop a creator recording views because a
    // migration has not been applied.
    ...(attributionId ? { attribution_id: attributionId } : {}),
  })
  if (!error) return { ok: true }
  if ((error as { code?: string }).code === UNDEFINED_TABLE) {
    return { ok: false, reason: 'not_recording' }
  }
  return { ok: false, reason: 'rejected' }
}

/**
 * Update the cached scalar AND append the reading.
 *
 * The column stays: plenty of UI reads `posts.views`, and the dashboard's
 * top-performer badge sorts on it. It is a CACHE OF THE LATEST READING, and
 * this is the function that makes that true rather than aspirational.
 *
 * The scalar write is attempted first and its failure is not fatal to the
 * append. If exactly one of the two lands, the one worth keeping is the
 * append — the cache can be recomputed from the log, and the log cannot be
 * recomputed from anything.
 */
export async function recordPostStats(
  postId: string, views: number, likes?: number,
): Promise<{ views: AppendOutcome; likes: AppendOutcome | null }> {
  const observedAt = new Date().toISOString()
  const patch: Record<string, unknown> = { views }
  if (likes !== undefined) patch.likes = likes
  try { await getClient().from('posts').update(patch).eq('id', postId) } catch { /* cache only */ }
  return {
    views: await appendObservation(postId, { metric: 'views', value: views, observedAt, source: 'manual' }),
    likes: likes === undefined
      ? null
      : await appendObservation(postId, { metric: 'likes', value: likes, observedAt, source: 'manual' }),
  }
}

export interface MetricSeries {
  metric: string
  points: OutcomeObservation[]
  /** Change from the FIRST reading to the last, and the span it happened over.
   *  Null when there is only one reading: a single measurement has no rate, and
   *  "+12,000 views" from one data point would be the total wearing a delta's
   *  clothes. */
  change: { delta: number; spanMs: number } | null
}

/**
 * Group readings by metric and compute what a single scalar could never say.
 *
 * This is the entire argument for the log rendered as a function: with one
 * mutable number you can answer "how many views does this have?"; with the log
 * you can answer "how fast did it get them, and did it keep going?".
 *
 * A metric whose readings all share one timestamp has no span, so no change —
 * `spanMs: 0` would divide into a rate of infinity, and a UI that formats
 * "per day" would print it.
 */
export function seriesByMetric(readings: readonly OutcomeObservation[]): MetricSeries[] {
  const byMetric = new Map<string, OutcomeObservation[]>()
  for (const r of readings) {
    const list = byMetric.get(r.metric)
    if (list) list.push(r)
    else byMetric.set(r.metric, [r])
  }
  const out: MetricSeries[] = []
  for (const [metric, unsorted] of byMetric) {
    const points = [...unsorted].sort(
      (a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt),
    )
    const first = points[0]
    const last = points[points.length - 1]
    const spanMs = Date.parse(last.observedAt) - Date.parse(first.observedAt)
    out.push({
      metric, points,
      change: points.length > 1 && spanMs > 0
        ? { delta: last.value - first.value, spanMs }
        : null,
    })
  }
  return out.sort((a, b) => a.metric.localeCompare(b.metric))
}

export interface ClaimsRead {
  /** False when the table is absent. Same distinction as the log's. */
  known: boolean
  claims: OutcomeClaim[]
}

/**
 * The claims the PRODUCT has made about this creator's videos.
 *
 * Read-only by design and by grant: 0105 gives the client `select` and nothing
 * else, because a client that could write a claim could put a sentence in the
 * product's mouth. Anything rendering these must show `claimQualifier(claim)`
 * beside the statement — the qualification is the contract's, not the screen's.
 */
export async function listDnaClaims(limit = 20): Promise<ClaimsRead> {
  const { data, error } = await getClient()
    .from('dna_claims')
    .select('claim_type, statement, sample_size, attribution')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) return { known: false, claims: [] }
  const claims: OutcomeClaim[] = []
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    // Validated on the way OUT as well as in. The CHECK constraints already
    // refuse a correlation without an N — but this is the code that would put a
    // causal-sounding sentence in front of a creator, so it declines to render
    // a row it cannot verify rather than trusting the table it read.
    const claim = validateClaim({
      type: row.claim_type,
      statement: row.statement,
      ...(row.sample_size === null ? {} : { sampleSize: row.sample_size }),
      ...(row.attribution === null ? {} : { attribution: row.attribution }),
    })
    if (!('rejected' in claim)) claims.push(claim)
  }
  return { known: true, claims }
}

// ---- Attribution (LEARNING-1 lineage) --------------------------------------
// 0113's rows, read and written. See `editor/attribution.ts` for why they exist
// and why they are immutable.

export interface AttributionsRead {
  /** False when the table is absent or the read failed — the same distinction
   *  the log and the claims make, for the same reason. An empty list would say
   *  "this post is measured by nothing", which is a claim this call did not
   *  earn the right to make. */
  known: boolean
  attributions: PostAttribution[]
}

const NO_ATTRIBUTIONS: AttributionsRead = { known: false, attributions: [] }

/** Every identifier that can explain an outcome on this post. */
export async function listPostAttributions(postId: string): Promise<AttributionsRead> {
  const { data, error } = await getClient()
    .from('post_attributions')
    .select('id, post_id, kind, value')
    .eq('post_id', postId)
    .order('created_at', { ascending: true })
    .limit(100)
  if (error) return NO_ATTRIBUTIONS
  const attributions: PostAttribution[] = []
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const v = validateAttribution({ kind: String(row.kind), value: String(row.value) })
    // Validated on the way OUT as well as in, like `listDnaClaims`: this is the
    // value a business claim will eventually rest on, so a row we cannot
    // verify is dropped rather than shown as evidence.
    if ('rejected' in v) continue
    attributions.push({
      id: String(row.id), postId: String(row.post_id), kind: v.kind, value: v.value,
    })
  }
  return { known: true, attributions }
}

export type MintAttribution =
  | { ok: true; attribution: PostAttribution }
  | { ok: false; reason: 'invalid' }
  /** 0113 is not applied yet. Not the creator's fault and not reported as
   *  success — the same three-state handling `appendObservation` uses. */
  | { ok: false; reason: 'not_recording' }
  /** This creator already uses this code. Two posts sharing one code cannot
   *  attribute anything: every outcome it explains would belong to both. */
  | { ok: false; reason: 'duplicate' }
  | { ok: false; reason: 'rejected' }

/**
 * Mint an identifier for a post, BEFORE the outcomes it will explain.
 *
 * There is no update counterpart, and that is deliberate rather than
 * unfinished: repointing a code at another post would retroactively transfer
 * every outcome recorded through it, silently and with no record. 0113 refuses
 * the UPDATE at the database as well, so this is not the only thing standing
 * between a creator and that.
 */
export async function mintPostAttribution(
  postId: string, raw: { kind: AttributionKind | string; value: string },
): Promise<MintAttribution> {
  const v = validateAttribution({ kind: String(raw.kind), value: raw.value })
  if ('rejected' in v) return { ok: false, reason: 'invalid' }
  const client = getClient()
  const { data: auth } = await client.auth.getUser()
  if (!auth.user) return { ok: false, reason: 'rejected' }
  const { data, error } = await client
    .from('post_attributions')
    .insert({ owner_id: auth.user.id, post_id: postId, kind: v.kind, value: v.value })
    .select('id, post_id, kind, value')
    .single()
  if (!error && data) {
    const row = data as Record<string, unknown>
    return {
      ok: true,
      attribution: { id: String(row.id), postId: String(row.post_id), kind: v.kind, value: v.value },
    }
  }
  const code = (error as { code?: string } | null)?.code
  if (code === UNDEFINED_TABLE) return { ok: false, reason: 'not_recording' }
  // 23505 = unique_violation, which here can only be the (owner, kind,
  // value_norm) index. Named rather than lumped into `rejected` because it is
  // the one failure with an obvious next step for the creator: pick another code.
  if (code === '23505') return { ok: false, reason: 'duplicate' }
  return { ok: false, reason: 'rejected' }
}
