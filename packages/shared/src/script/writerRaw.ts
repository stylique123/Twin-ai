// WRITER RAW DRAFT RECORD (record only; kill switch WRITER_RAW_RECORD).
//
// The offline replay guard (replayGuard.ts, plan v6.1 §27) could only replay
// from the SHIPPED script, because the writer's own draft, before the gate,
// refill, de-dup, spine and polish, was never kept. This records it on the
// blueprint as `writer_raw = { lines, hook_options, at, truncated }` so a later
// panel can replay every deterministic stage from the draft.
//
// ⚖️ RECORD ONLY. Nothing reads `writer_raw` on the request path; it is built
// from a COPY of the writer's JSON text and never feeds back into the script.
// ⚖️ TEST ACCOUNTS ONLY (heartbeat or fictional panel, from identity). Real
// creators never get the field. `WRITER_RAW_RECORD=off` (or `false`) kills it.
// ⚖️ CAPPED: at most 40 lines of 600 characters and 10 hooks of 300.
export const WRITER_RAW_MAX_LINES = 40
export const WRITER_RAW_MAX_LINE_CHARS = 600
export const WRITER_RAW_MAX_HOOKS = 10
export const WRITER_RAW_MAX_HOOK_CHARS = 300

export interface WriterRawLine { section: string; line: string }
export interface WriterRaw {
  lines: WriterRawLine[]
  hook_options: string[]
  at: string
  truncated: boolean
}

/** On for test accounts unless WRITER_RAW_RECORD is 'off' / 'false' / '0'. */
export function writerRawRecordOn(isTestAccount: boolean, env: string | undefined | null): boolean {
  if (!isTestAccount) return false
  const v = String(env ?? '').trim().toLowerCase()
  return !(v === 'off' || v === 'false' || v === '0')
}

/** A capped copy of the writer's draft lines from its raw JSON text. Pure, never throws; null when unreadable. */
export function captureWriterRaw(raw: unknown, at: string): WriterRaw | null {
  try {
    if (typeof raw !== 'string') return null
    const bp = JSON.parse(raw) as { script?: unknown; hook_options?: unknown }
    if (!bp || typeof bp !== 'object' || !Array.isArray(bp.script)) return null
    let truncated = false
    const lines: WriterRawLine[] = []
    for (const b of bp.script as unknown[]) {
      const o = (b && typeof b === 'object' ? b : {}) as { section?: unknown; line?: unknown }
      if (typeof o.line !== 'string') continue
      if (lines.length >= WRITER_RAW_MAX_LINES) { truncated = true; break }
      if (o.line.length > WRITER_RAW_MAX_LINE_CHARS) truncated = true
      lines.push({ section: typeof o.section === 'string' ? o.section.slice(0, 40) : '', line: o.line.slice(0, WRITER_RAW_MAX_LINE_CHARS) })
    }
    const hooksIn = Array.isArray(bp.hook_options) ? (bp.hook_options as unknown[]).filter((h): h is string => typeof h === 'string') : []
    if (hooksIn.length > WRITER_RAW_MAX_HOOKS || hooksIn.some((h) => h.length > WRITER_RAW_MAX_HOOK_CHARS)) truncated = true
    const hook_options = hooksIn.slice(0, WRITER_RAW_MAX_HOOKS).map((h) => h.slice(0, WRITER_RAW_MAX_HOOK_CHARS))
    return { lines, hook_options, at, truncated }
  } catch {
    return null
  }
}
