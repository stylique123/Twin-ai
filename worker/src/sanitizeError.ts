// Error sanitization for DURABLE state (edit_events, failure_details,
// jobs.error). Slicing a message bounds its length but does not remove
// secrets — signed URLs, storage tokens, auth headers, temp paths, raw
// command lines. Everything persisted goes through here; the RAW error stays
// only in the worker's stdout (container logs — access-controlled, rotated by
// Docker's log retention).
import { PermanentJobError, declaresPermanent } from './errors.js'

export interface SafeError {
  code: string
  stage: string
  retry: 'retryable' | 'permanent' | 'cancelled'
  message: string
}

const REDACTIONS: Array<[RegExp, string]> = [
  // Any URL — signed storage URLs carry tokens in query strings; drop whole.
  [/https?:\/\/[^\s"')]+/gi, '[url]'],
  // Auth material in key=value or header form.
  [/\b(authorization|apikey|api[-_]?key|bearer|token|signature|secret|password|service_role[^\s:=]*)\b\s*[:=]?\s*[A-Za-z0-9+/._-]{8,}/gi, '[secret]'],
  // JWTs and other long opaque blobs (base64/hex runs).
  [/\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/g, '[secret]'],
  [/\b[a-f0-9]{40,}\b/gi, '[hex]'],
  // Filesystem paths (temp dirs, user paths, command lines with local files).
  [/(?:\/[\w.-]+){2,}/g, '[path]'],
  // Postgres connection strings.
  [/postgres(?:ql)?:\/\/\S+/gi, '[dsn]'],
]

/**
 * WHAT WAS THROWN, IN WORDS, NEVER "[object Object]".
 *
 * ⚠️ `String(err)` ON A PLAIN OBJECT IS THE STRING "[object Object]", and that
 * string was reachable from SIX call sites — including this file's own
 * `sanitizeError`, whose output lands in `jobs.error` and `ops_events.detail`,
 * both owner-readable. A throw of `{ code: 'x', status: 503 }` would have been
 * recorded as a phrase carrying none of it, and the row that exists to explain
 * a failure would explain nothing.
 *
 * ⚖️ MEASURED BEFORE FIXING: across 301 jobs carrying an error and 290 dead
 * letters, "[object Object]" appears ZERO times. Everything thrown so far has
 * been a real Error, so this is a LATENT defect, not an active one — recorded
 * plainly rather than dressed up, because the honest reason to fix it is that
 * it costs ten lines and destroys a diagnosis on the day it finally fires.
 *
 * ⚖️ IT NEVER RETURNS AN EMPTY STRING EITHER. A caller writing `''` into
 * `jobs.error` produces a row that reads as "no error" beside a failed job —
 * the same class of lie in the opposite direction.
 */
export function errorText(err: unknown): string {
  if (err instanceof Error) {
    // `.message` can be empty on a bare `new Error()`; the name still says something.
    return err.message.trim() !== '' ? err.message : `${err.name || 'Error'} (no message)`
  }
  if (typeof err === 'string') return err.trim() !== '' ? err : '(empty string thrown)'
  if (typeof err === 'number' || typeof err === 'boolean' || typeof err === 'bigint') return String(err)
  if (err === null) return '(null thrown)'
  if (err === undefined) return '(undefined thrown)'
  // ⚠️ AN OBJECT IS WHERE String() LIES, so it is serialised instead. Supabase
  // and fetch both reject with plain objects carrying `code`/`status`/`details`,
  // which is exactly the shape that must survive.
  try {
    const json = JSON.stringify(err)
    if (typeof json === 'string' && json !== '{}' && json !== 'null') return json
  } catch { /* circular or unserialisable — fall through */ }
  // Last resort: name the shape rather than the useless phrase. An object whose
  // own keys are all non-enumerable still tells us its constructor.
  const name = (err as { constructor?: { name?: string } })?.constructor?.name
  let keys = ''
  try { keys = Object.keys(err as object).join(',') } catch { /* exotic proxy */ }
  return `(unserialisable ${name || 'object'}${keys ? ` keys=${keys}` : ''})`
}

export function redact(text: string): string {
  let out = text
  for (const [re, sub] of REDACTIONS) out = out.replace(re, sub)
  return out.slice(0, 300)
}

export function sanitizeError(err: unknown, stage: string): SafeError {
  const raw = errorText(err)
  // `declaresPermanent`, not `instanceof`: an EditPlanError is permanent too,
  // and recording it as `retryable` told the operational record the opposite of
  // what the queue does with it. Deliberately the NARROW predicate — the code
  // written down is one the thrower chose, never one inferred from a message.
  const cancelled = /cancel/i.test(raw) && !declaresPermanent(err)
  const permanent = declaresPermanent(err)
  const code = permanent
    ? err.code
    : /stage_timeout/.test(raw) ? 'stage_timeout'
    : /download aborted|abort/i.test(raw) ? 'aborted'
    : /too large|exceeded cap/.test(raw) ? 'download_too_large'
    : /storage download/.test(raw) ? 'storage_download_failed'
    : /asr_failed/.test(raw) ? 'asr_failed'
    : /probe/i.test(raw) ? 'probe_failed'
    : 'unexpected_error'
  // ASR stderr can contain Python tracebacks, local paths, provider internals,
  // or URLs. Durable state gets a stable product-level message only; raw stderr
  // is never persisted in projects, events, or jobs.
  const message = code === 'asr_failed'
    ? 'Speech transcription provider failed.'
    : redact(raw)
  return {
    code,
    stage,
    retry: permanent ? 'permanent' : cancelled ? 'cancelled' : 'retryable',
    message,
  }
}

// The queue layer persists thrown messages into jobs.error and dead-letter
// operations. Convert the already-sanitized durable error back into an Error
// while preserving permanent-vs-retryable classification; never rethrow raw
// provider stderr across that boundary.
export function queueSafeError(err: unknown, safe: SafeError): Error {
  // THIS is the load-bearing one. index.ts classifies the error it CATCHES, not
  // the error the stage threw, so an EditPlanError downgraded to a plain Error
  // here is a dead-lettering job turned back into a retrying one.
  const message = `${safe.code}: ${safe.message}`
  return declaresPermanent(err)
    ? new PermanentJobError(message, err.code)
    : new Error(message)
}
