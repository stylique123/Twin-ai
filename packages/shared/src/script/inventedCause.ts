// INVENTED CAUSES (brief item 2.8).
//
// The writer adds a reason she never gave: "the beans go stale because the
// town's weather shifts", "sales dipped because of the heat". The main clause
// may be hers; the "because…" is the model's. This finds cause clauses whose
// content words mostly (<50%) do not appear in what the writer was given, and
// cuts ONLY that clause — never the whole sentence, never a line to empty.
//
// Also: scan topic rows (creator_knowledge kind 'topic') are subjects she
// talks about, not facts. `isSubjectOnlyTopic` says which rows must be shown
// to the writer as subjects only, never in the list of things she may state.
//
// Pure; no I/O. Mirrored into supabase/functions/_shared by the generator.

import { provenanceWords } from './provenance.js'

const MARKER = /\b(because(?:\s+of)?|since|due\s+to|so\s+that|which\s+is\s+why|that'?s\s+why|thanks\s+to|caused\s+by)\b/gi

// "since 2019", "since then", "ever since I was", "since last spring": time, not cause.
const TEMPORAL_SINCE = /^\s*(\d|then\b|last\b|early\b|forever\b|ever\b|childhood\b|yesterday\b|today\b|the\s+(day|start|beginning|summer|winter|spring|autumn|fall|year|week|month)\b|(january|february|march|april|may|june|july|august|september|october|november|december|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|i\s+was\b|we\s+(opened|started|moved)\b|i\s+(opened|started|moved)\b|day\s+one\b|high\s+school\b|college\b)/i

interface CauseSpan {
  /** Index where the removable span starts (includes a leading comma/space). */
  cutStart: number
  /** Index where the removable span ends (exclusive). */
  cutEnd: number
  /** The cause content, marker excluded. */
  content: string
  /** The clause as written, marker included. */
  clause: string
}

function causeSpans(sentence: string): CauseSpan[] {
  const out: CauseSpan[] = []
  const s = String(sentence ?? '')
  MARKER.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = MARKER.exec(s)) !== null) {
    const marker = m[1].toLowerCase()
    const after = s.slice(m.index + m[0].length)
    if (marker === 'since') {
      if (TEMPORAL_SINCE.test(after) || /\bever\s*$/i.test(s.slice(0, m.index))) continue
    }
    const rel = after.search(/[,;.!?:]|\s[—–-]\s/)
    const contentEnd = m.index + m[0].length + (rel < 0 ? after.length : rel)
    const content = s.slice(m.index + m[0].length, contentEnd).trim()
    if (!content) continue
    const before = s.slice(0, m.index)
    const atStart = before.trim() === ''
    let cutStart: number
    let cutEnd: number
    if (atStart) {
      // "Because X, Y." → cut "Because X, " and keep Y.
      cutStart = m.index
      cutEnd = contentEnd
      if (s[cutEnd] === ',') cutEnd++
      while (cutEnd < s.length && s[cutEnd] === ' ') cutEnd++
    } else {
      // "Y because X." / "Y, which is why X." → cut the leading comma/space too.
      cutStart = m.index
      while (cutStart > 0 && /[\s,]/.test(s[cutStart - 1])) cutStart--
      cutEnd = contentEnd
    }
    out.push({ cutStart, cutEnd, content, clause: s.slice(m.index, contentEnd).trim() })
    MARKER.lastIndex = contentEnd
  }
  return out
}

function isUnsupported(content: string, support: Set<string>): boolean {
  const words = [...provenanceWords(content)]
  if (!words.length) return false
  const hit = words.filter((w) => support.has(w)).length
  return hit / words.length < 0.5
}

/** Cause clauses in `sentence` whose content words mostly do not appear in `supportText`. */
export function unsupportedCauses(sentence: string, supportText: string): string[] {
  const support = provenanceWords(supportText)
  return causeSpans(sentence).filter((c) => isUnsupported(c.content, support)).map((c) => c.clause)
}

function cutSentence(sentence: string, support: Set<string>): { text: string; cut: number } {
  const spans = causeSpans(sentence).filter((c) => isUnsupported(c.content, support))
  if (!spans.length) return { text: sentence, cut: 0 }
  let text = sentence
  let cut = 0
  for (const sp of [...spans].reverse()) {
    let next = text.slice(0, sp.cutStart) + text.slice(sp.cutEnd)
    next = next.replace(/\s+([,.!?;:])/g, '$1').replace(/^[\s,;:]+/, '').replace(/,\s*([.!?])/g, '$1').replace(/\s{2,}/g, ' ')
    if (sp.cutStart === 0 || /^\s*$/.test(text.slice(0, sp.cutStart))) {
      next = next.charAt(0).toUpperCase() + next.slice(1)
    }
    // Never leave a stub: a remainder under two words, or only punctuation, keeps the original.
    const words = next.replace(/[^A-Za-z0-9'\s]/g, ' ').trim().split(/\s+/).filter(Boolean)
    if (words.length < 2) continue
    text = next
    cut++
  }
  return { text: text.trim(), cut }
}

/**
 * Remove unsupported cause clauses from spoken lines. Only the clause goes; the
 * main clause stays. A line is never changed to empty.
 */
export function dropInventedCauses<T extends { line?: unknown }>(
  beats: readonly T[],
  supportText: string,
): { beats: T[]; cut: number } {
  const support = provenanceWords(supportText)
  let cut = 0
  const out = beats.map((b) => {
    if (!b || typeof b.line !== 'string' || !b.line.trim()) return b
    const parts = b.line.match(/[^.!?]+[.!?]*\s*/g) ?? [b.line]
    let changed = false
    const rebuilt = parts.map((p) => {
      const trail = p.match(/\s*$/)?.[0] ?? ''
      const r = cutSentence(p.trimEnd(), support)
      if (r.cut) { changed = true; cut += r.cut }
      return r.text + trail
    }).join('').trim()
    if (!changed || !rebuilt) return b
    return { ...b, line: rebuilt }
  })
  return { beats: out, cut }
}

const OWN_SOURCES = new Set(['asked', 'reply', 'typed', 'onboarding', 'manual'])

/**
 * A topic row the scan inferred (not confirmed by her, not her own words) is
 * a subject she talks about — never a fact the writer may state.
 */
export function isSubjectOnlyTopic(row: { kind?: unknown; source?: unknown; creator_confirmed_at?: unknown } | null | undefined): boolean {
  if (!row || String(row.kind ?? '') !== 'topic') return false
  if (String(row.creator_confirmed_at ?? '').trim()) return false
  return !OWN_SOURCES.has(String(row.source ?? ''))
}

/** The prompt line that presents subject-only topics as subjects. Empty when none. */
export function subjectsLine(rows: ReadonlyArray<{ text?: unknown }>): string {
  const subjects = rows.map((r) => String(r?.text ?? '').trim()).filter(Boolean)
  if (!subjects.length) return ''
  return `\nSHE TALKS ABOUT (subjects only — never state any of these as a fact, claim, role or something she does): ${subjects.join('; ')}\n`
}
