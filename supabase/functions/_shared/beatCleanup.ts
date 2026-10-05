// GENERATED FROM packages/shared/src/script/beatCleanup.ts — DO NOT EDIT.
// Run: node scripts/ci/generate_shared_pilot_core.mjs
// Edit the source instead. CI regenerates this file and fails on a diff.
// @ts-nocheck
// LEFTOVERS THE OWNER FOUND IN BLIND SET 1 (2026-10-05), removed after writing.
//
// · An empty bridge opening a beat — "And this is the part people miss." /
//   "Here is the reality." — with nothing of its own (scripts 4, 5, 9, 12, 15).
//   A bridge that carries its point in the same sentence ("and this is where it
//   gets weird — thigh bones…") stays.
// · "If starting a coffee cart is your dream, stick around." closing a video
//   whose goal is not followers (14, 17, 18): a follow ask on a sell, teach or
//   entertain video, usually after a different ask already closed it.

const BRIDGE = /^(and |so |but )?(this is|here is|here'?s|that'?s) (the|where|what|why|how)?\s*(part|real|secret|reality|thing|trick|catch|twist|kicker|it gets|everything|it all)[^.!?:—–-]{0,40}[.!]\s*/i
const FOLLOW_CLOSER = /^[^.!?]*\b(stick around|stay tuned|follow (along|me|for more))\b[^.!?]*[.!]?$/i

/** Remove a stand-alone bridge sentence from the start of a line. */
export function stripEmptyBridge(line: string): string {
  const m = line.match(BRIDGE)
  if (!m) return line
  const rest = line.slice(m[0].length).trim()
  return rest.split(/\s+/).length >= 4 ? rest[0]!.toUpperCase() + rest.slice(1) : line
}

/** Clean every beat; drop a trailing follow-ask on a non-follow video. */
export function cleanBeats<T extends { line?: unknown }>(beats: readonly T[], goal: string): { beats: T[]; changed: number } {
  let changed = 0
  let out = beats.map((b) => {
    if (typeof b.line !== 'string') return b
    const line = stripEmptyBridge(b.line)
    if (line !== b.line) { changed++; return { ...b, line } }
    return b
  })
  const follow = goal === 'followers' || goal === 'follow'
  if (!follow && out.length > 2) {
    const last = out[out.length - 1]!
    const lastLine = typeof last.line === 'string' ? last.line.trim() : ''
    if (FOLLOW_CLOSER.test(lastLine)) { out = out.slice(0, -1); changed++ }
    else if (typeof last.line === 'string') {
      // The follow ask tacked onto the end of another line.
      const trimmed = last.line.replace(/\s*[^.!?]*\b(stick around|stay tuned)\b[^.!?]*[.!]?\s*$/i, '').trim()
      if (trimmed && trimmed !== last.line.trim() && trimmed.split(/\s+/).length >= 4) { out = [...out.slice(0, -1), { ...last, line: trimmed }]; changed++ }
    }
  }
  return { beats: out, changed }
}
