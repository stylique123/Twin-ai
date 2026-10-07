// GENERATED FROM packages/shared/src/script/lessonSelect.ts — DO NOT EDIT.
// Run: node scripts/ci/generate_shared_pilot_core.mjs
// Edit the source instead. CI regenerates this file and fails on a diff.
// @ts-nocheck
// WHICH LESSONS REACH THE WRITER (brief item 1.2).
//
// ⚠️ MEASURED: on the test account 2,378 of 2,511 active lessons came from
// AI test viewers (source = 'audience'). The writer was being taught mostly by
// simulated people. This selection keeps what SHE taught (ratings, rating tags,
// angle and hook picks, edits) ahead of what the simulated panel said, caps the
// panel, drops batch-harness (synthetic) rows, merges near-copies and lets old
// machine lessons expire.
//
// ⚖️ HUMAN IS A WHITELIST. Any source not named here — audience, an AI rater,
// a judge score, anything added later — is machine-sourced. A new machine
// source can never be promoted by forgetting to list it.
//
// Pure: no imports, no IO. Generated into the edge function.

export const HUMAN_LESSON_SOURCES: readonly string[] = ['rating', 'rating_tag', 'angle_pick', 'hook_pick', 'edit']
export const LESSON_EXPIRY_DAYS = 90
export const LESSON_DUP_JACCARD = 0.8

export interface SelectableLesson {
  text: string
  source?: string | null
  source_id?: string | null
  source_ref?: string | null
  synthetic?: boolean | null
  weight?: number | null
  created_at?: string | null
  updated_at?: string | null
}

export interface LessonSelectReport {
  in_by_source: Record<string, number>
  out_by_source: Record<string, number>
  dropped: { synthetic: number; dup: number; expired: number; cap: number }
}

export const isHumanLessonSource = (s: unknown): boolean => HUMAN_LESSON_SOURCES.includes(String(s ?? ''))

/** A batch-harness row: flagged by the column (when it exists) or by its reference. */
export function isSyntheticLesson(l: SelectableLesson): boolean {
  if (l.synthetic === true) return true
  return [l.source_ref, l.source_id].some((r) => typeof r === 'string' && r.startsWith('batch:'))
}

const tokens = (t: string): Set<string> =>
  new Set(String(t ?? '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean))

export function lessonJaccard(a: string, b: string): number {
  const A = tokens(a), B = tokens(b)
  if (!A.size && !B.size) return 1
  let inter = 0
  for (const x of A) if (B.has(x)) inter++
  return inter / (A.size + B.size - inter)
}

const stamp = (l: SelectableLesson): number => {
  const t = Date.parse(String(l.updated_at ?? l.created_at ?? ''))
  return Number.isFinite(t) ? t : 0
}
const count = (rows: readonly SelectableLesson[]): Record<string, number> => {
  const out: Record<string, number> = {}
  for (const r of rows) { const k = String(r.source ?? 'unknown'); out[k] = (out[k] ?? 0) + 1 }
  return out
}

export function selectLessons<T extends SelectableLesson>(
  rows: readonly T[],
  opts: { capAudience?: number; max?: number; now?: number } = {},
): { lessons: T[]; report: LessonSelectReport } {
  const capAudience = opts.capAudience ?? 5
  const max = opts.max ?? Infinity
  const now = opts.now ?? Date.now()
  const dropped = { synthetic: 0, dup: 0, expired: 0, cap: 0 }

  const live: T[] = []
  for (const r of rows) {
    if (isSyntheticLesson(r)) { dropped.synthetic++; continue }
    const at = stamp(r)
    if (!isHumanLessonSource(r.source) && at > 0 && now - at > LESSON_EXPIRY_DAYS * 86_400_000) { dropped.expired++; continue }
    live.push(r)
  }

  // Near-copies: newest wins.
  live.sort((a, b) => stamp(b) - stamp(a))
  const kept: T[] = []
  for (const r of live) {
    if (kept.some((k) => lessonJaccard(k.text, r.text) >= LESSON_DUP_JACCARD)) { dropped.dup++; continue }
    kept.push(r)
  }

  // Human first, then heaviest; the stable sort keeps newest-first within ties.
  kept.sort((a, b) => Number(isHumanLessonSource(b.source)) - Number(isHumanLessonSource(a.source))
    || Number(b.weight ?? 1) - Number(a.weight ?? 1))

  const out: T[] = []
  let machine = 0
  for (const r of kept) {
    if (!isHumanLessonSource(r.source)) {
      if (machine >= capAudience) { dropped.cap++; continue }
      machine++
    }
    if (out.length >= max) { dropped.cap++; continue }
    out.push(r)
  }
  return { lessons: out, report: { in_by_source: count(rows), out_by_source: count(out), dropped } }
}
