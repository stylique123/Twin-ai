// WHAT THE PRODUCTION SCHEMA CAN ACTUALLY DO, ASKED BY THE THING THAT NEEDS IT.
//
// ⚠️ SIX MIGRATIONS REACHED main UNAPPLIED IN ONE DAY. 0153, 0154, 0155, 0156,
// 0157 and 0158 each merged, deployed, looked healthy, and were discovered
// missing later — twice by a job that failed on every attempt while reporting
// success at the queue level. The gap is real and it is operational, not
// theoretical.
//
// ⚖️ AND CI CANNOT CLOSE IT. migration-reconcile.yml does not merely lack a
// production DB url — it REFUSES if STAGING_DB_URL ever points at the production
// ref, with a second check called "the outer belt to the inner braces". Handing
// CI production credentials to catch a forgotten migration would solve "we
// forgot a migration" by creating "CI can reach production". So the check lives
// where the access already legitimately exists: in the worker.
//
// ⚠️ REPORT AND DEGRADE, NEVER REFUSE TO BOOT. A worker that will not start on a
// missing table converts a silent data gap into a full outage, which is strictly
// worse than the defect. Same rule readCapabilities already follows for a
// missing APIFY_TOKEN: reduced capability is a legitimate state.
//
// ⚖️ AND IT ASSERTS CAPABILITIES, NOT FILENAMES. Checking that 0158 appears in a
// ledger proves somebody ran a file. Selecting the columns the job actually
// writes proves the job can do its work. A ledger row is a claim; a successful
// probe is evidence.

import { db } from './db.js'

/** One thing a job type needs the schema to be able to do. */
export interface SchemaCapability {
  table: string
  /** ⚠️ THE COLUMNS THE JOB ACTUALLY USES, not every column in the table. A
   *  probe that named all of them would fail on an unrelated additive change
   *  and start crying wolf; one that named none would pass against an empty
   *  table of the right name. */
  columns: readonly string[]
  /** For the operator, so the incident says which migration to apply rather
   *  than which table is absent. `0158` is more actionable than
   *  `extraction_parity_replications`. */
  migration: string
}

/**
 * ⚠️ DECLARED, NEVER INFERRED. There is no SQL parsing here on purpose: a
 * registry that guesses what a handler touches is a second, silently drifting
 * authority on the schema. A job type whose requirements are wrong fails loudly
 * in the totality test rather than quietly at 3am.
 *
 * ⚖️ ONLY WHAT THE JOB NEEDS TO EXECUTE. This is not "assert every table in
 * every migration" — that would become a parallel schema authority and would
 * block jobs over tables they never touch.
 */
export const SCHEMA_REQUIREMENTS: Readonly<Record<string, readonly SchemaCapability[]>> = {
  extraction_replication: [
    { table: 'extraction_parity_replications', migration: '0158',
      // The insert this job exists to perform. `outcome` and `attempt_number`
      // in particular: without them a replication cannot say what happened or
      // which repeat it was, which is the entire record.
      columns: ['source_trial_id', 'model', 'attempt_number', 'outcome', 'latency_ms'] },
    { table: 'extraction_parity_trials', migration: '0155',
      // Read-only here, but a replication with no source trial has nothing to
      // replicate.
      columns: ['id', 'model_a', 'error_a', 'manifest'] },
  ],
  extraction_parity: [
    { table: 'extraction_parity_trials', migration: '0157',
      // `manifest` and `arms_asymmetric` arrived in 0156/0157 and the upsert
      // names both; an older schema accepts the row and loses the experiment's
      // identity.
      columns: ['url', 'model_a', 'model_b', 'arms_asymmetric', 'manifest'] },
    { table: 'reference_transcripts', migration: '0153', columns: ['url', 'transcript', 'chars'] },
  ],
  assess_reference: [
    { table: 'reference_content_profiles', migration: '0142',
      columns: ['url', 'profile', 'transcript_chars', 'error'] },
    { table: 'reference_transcripts', migration: '0153', columns: ['url', 'transcript', 'chars'] },
    // ⚠️ `reference_frames` (0160) IS DELIBERATELY NOT HERE, and that is not
    // silence. Only the frames variant of this job writes it, and a missing
    // table there is already a recorded row — runVisualPass returns
    // FRAMES_NOT_PERSISTED and the transcript still lands. Declaring it would
    // block all 780 references' transcript work over a table the transcript
    // path never touches, which is the over-blocking this registry exists to
    // avoid. If assess_reference ever splits into its own frames job type, that
    // type declares 0160 and this note comes out.
    { table: 'transcript_routing_decisions', migration: '0159',
      // The drift record. Its writer is best-effort, so a missing table would
      // NOT fail an assessment — but it would silently return us to routing on
      // stale metadata, which is the defect 0159 exists to end.
      columns: ['url', 'stored_chars', 'actual_chars', 'routing_decision'] },
  ],
  editor_v2: [
    { table: 'render_attempts', migration: '0154',
      columns: ['render_job_id', 'predicted_duration_ms', 'actual_duration_ms', 'duration_delta_ms'] },
  ],
}

/**
 * ⚠️ A JOB TYPE WITH NO DEDICATED SCHEMA MUST SAY SO. Same discipline as
 * DELIBERATELY_NOT_DRAINED: silence cannot be the way a requirement goes
 * unwritten. Adding a job type that writes to its own table and forgetting to
 * declare it is exactly how this class of defect returns.
 */
export const NO_DEDICATED_SCHEMA: Readonly<Record<string, string>> = {
  ingest: 'Writes only to jobs and the long-standing creator tables, whose absence would break every job type equally and is not a per-type capability.',
  build_voice: 'Calls the voice provider and writes to brand/voice tables that predate this registry and every deploy path that could remove them.',
  scrape_dna: 'Reads social profiles and writes to creator-profile tables shared with the web app, so a missing table is a total outage rather than a degraded job type.',
  validate_source: 'Inspects an uploaded recording and writes to media_assets, shared with the app.',
  validate_clip: 'Measures a screen capture and writes to media_assets, shared with the app.',
  purge_media: 'Deletes storage bytes for an already-removed media_asset; it needs no table of its own.',
  extract_product: 'Writes to the product-entity tables shared with the Product Library UI, which the app would fail on first.',
}

export type SchemaStatus = 'healthy' | 'degraded'

export interface BlockedJobType {
  reason: 'missing_schema_capability'
  migrationHint: string
  missing: string
}

export interface SchemaHealth {
  status: SchemaStatus
  /** Job types that must NOT be claimed, because the work would throw on every
   *  attempt. Empty when healthy. */
  blocked: Readonly<Record<string, BlockedJobType>>
  checkedAt: string
}

/** ⚖️ ONE PROBE, AND IT IS A READ THAT TOUCHES NO ROWS. `limit(0)` asks
 *  PostgREST to resolve the table and the named columns and return nothing —
 *  the cheapest question that still proves the shape exists. */
export async function probeCapability(cap: SchemaCapability): Promise<string | null> {
  try {
    const { error } = await db.from(cap.table).select(cap.columns.join(',')).limit(0)
    if (!error) return null
    return `${cap.table}(${cap.columns.join(', ')}): ${error.message}`
  } catch (e) {
    return `${cap.table}: ${e instanceof Error ? e.message : String(e)}`
  }
}

/**
 * Ask the schema what it can do, for the job types this worker would claim.
 *
 * ⚠️ ONLY THE TYPES PASSED IN. Probing capabilities for job types this worker
 * never claims would block nothing and cost a query per deploy — and would make
 * a worker report `degraded` about work that is not its business.
 */
export async function evaluateSchemaHealth(jobTypes: readonly string[]): Promise<SchemaHealth> {
  const blocked: Record<string, BlockedJobType> = {}
  for (const type of jobTypes) {
    const caps = SCHEMA_REQUIREMENTS[type]
    if (!caps) continue
    for (const cap of caps) {
      const failure = await probeCapability(cap)
      if (failure) {
        // ⚖️ FIRST MISSING CAPABILITY WINS, and we stop probing this type. The
        // operator needs the earliest migration to apply, not an inventory.
        blocked[type] = {
          reason: 'missing_schema_capability',
          migrationHint: cap.migration,
          missing: failure,
        }
        break
      }
    }
  }
  return {
    status: Object.keys(blocked).length === 0 ? 'healthy' : 'degraded',
    blocked,
    checkedAt: new Date().toISOString(),
  }
}

/** ⚠️ THE LIST THE WORKER MAY ACTUALLY CLAIM. A blocked type is not merely
 *  reported — it is removed, so the queue does not fill with jobs that will
 *  throw on every attempt while the queue itself reports them as pending work. */
export const claimableTypes = (
  jobTypes: readonly string[], health: SchemaHealth,
): string[] => jobTypes.filter((t) => !(t in health.blocked))

/**
 * ⚖️ HAS ANYTHING CHANGED SINCE THE LAST REPORT? Without this the periodic
 * re-check would log the same incident every few minutes and become a Greek
 * chorus nobody reads — which is how a real incident goes unnoticed among its
 * own repetitions.
 */
export function healthChanged(prev: SchemaHealth | null, next: SchemaHealth): boolean {
  if (prev === null) return true
  const a = Object.keys(prev.blocked).sort().join(',')
  const b = Object.keys(next.blocked).sort().join(',')
  return a !== b
}
