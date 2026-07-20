// Error sanitization for DURABLE state (edit_events, failure_details,
// jobs.error). Slicing a message bounds its length but does not remove
// secrets — signed URLs, storage tokens, auth headers, temp paths, raw
// command lines. Everything persisted goes through here; the RAW error stays
// only in the worker's stdout (container logs — access-controlled, rotated by
// Docker's log retention).
import { PermanentJobError } from './errors.js'

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

export function redact(text: string): string {
  let out = text
  for (const [re, sub] of REDACTIONS) out = out.replace(re, sub)
  return out.slice(0, 300)
}

export function sanitizeError(err: unknown, stage: string): SafeError {
  const raw = err instanceof Error ? err.message : String(err)
  const cancelled = /cancel/i.test(raw) && !(err instanceof PermanentJobError)
  const permanent = err instanceof PermanentJobError
  const code = permanent
    ? (err as PermanentJobError).code
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
  const message = `${safe.code}: ${safe.message}`
  return err instanceof PermanentJobError
    ? new PermanentJobError(message, err.code)
    : new Error(message)
}
