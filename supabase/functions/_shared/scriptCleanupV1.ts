// GENERATED FROM packages/shared/src/script/scriptCleanupV1.ts — DO NOT EDIT.
// Run: node scripts/ci/generate_shared_pilot_core.mjs
// Edit the source instead. CI regenerates this file and fails on a diff.
// @ts-nocheck
// SCRIPT CLEANUP V1 (panel 13c, 11 Nov; SCRIPT_CLEANUP_V1=on, default OFF,
// nowhere turned on). Cuts only: it never adds a word, a fact or a line.
//
//   2. DANGLING LAST LINE. A last line that only promises ("Here is the part
//      everyone forgets.") and delivers nothing is cut. A real CTA (a URL,
//      "link in bio", an offer, an ask to act) or a question is never cut.
//   3. REPEATS. A product fact said again ("Holds about 12 oz." after a line
//      that already gave the 12 oz) is cut, the first kept. The same story told
//      twice keeps the stronger telling (more of the story's own words) and
//      cuts the other.
//
// The hook (first spoken line) and the CTA (last spoken line, or a CTA-shaped
// line) are never cut, nor is any question. At most 2 cuts and about 30% of
// the words; beyond that the line stays and `capped` counts it. URL-safe:
// lines are split only where . ! ? is followed by a space. Pure.
import type { ScopedProduct } from './productFactScope.ts'

const STOP = new Set(['a', 'an', 'the', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'for', 'with', 'by', 'at', 'from', 'is', 'are', 'was', 'were', 'it', 'its', 'this', 'that', 'my', 'your', 'our', 'his', 'her', 'their', 'i', 'we', 'you', 'he', 'she', 'they', 'be', 'as', 'so', 'no', 'not', 'every', 'each', 'one', 'all', 'me', 'us', 'them', 'than', 'then', 'there', 'here', 'what', 'when', 'how', 'why', 'who', 'did', 'do', 'does', 'had', 'has', 'have', 'got', 'get', 'about', 'just', 'really', 'very', 'into', 'out', 'up', 'off', 'if', 'once', 'now', 'any', 'more', 'most', 'some', 'can', 'will', 'would', 'could', 'should', 'like', 'which', 'way', 'came', 'for'])
const toks = (t: string) => String(t ?? '').toLowerCase().replace(/[’']s\b/g, '').replace(/[’']/g, '').match(/[a-z0-9$]+(?:-[a-z0-9]+)*/g) ?? []
const sing = (w: string) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w)
const words = (t: string) => toks(t).flatMap((w) => w.split('-')).filter((w) => /\d/.test(w) || (w.length >= 3 && !STOP.has(w))).map(sing)
const stem = (w: string) => (/\d/.test(w) ? w.replace(/^\$/, '') : w.slice(0, 5))
const sentencesOf = (l: string) => String(l ?? '').split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean)
const wordCount = (s: string) => String(s ?? '').split(/\s+/).filter(Boolean).length

const URL_RE = /\bhttps?:\/\/\S+|\bwww\.\S+|\b[a-z0-9-]+\.(?:com|co|org|net|io|shop|store|app)\/\S*/i
const CTA_RE = /\blink in (?:my |the )?bio\b|\b(?:follow|subscribe|comment|tell me|let me know|grab|get yours|buy|book|try|shop|order|tickets?|sign up|join|dm me|save this|send this|share this)\b/i
export const isQuestion = (s: string) => /\?["”’)]*\s*$/.test(String(s ?? '').trim())
/** A real CTA: a URL, "link in bio", an offer line, or an ask to act. */
export function isCtaText(s: string, offers: readonly string[] = []): boolean {
  const t = String(s ?? '')
  if (URL_RE.test(t) || CTA_RE.test(t)) return true
  const low = t.toLowerCase()
  return offers.some((o) => o.trim().length >= 6 && low.includes(o.trim().toLowerCase()))
}

// A line that only promises: a set-up phrase with nothing after it.
const PROMISE = /^(?:(?:and|so|now|but)\s+)?(?:here(?:'s|’s| is) (?:the|what|why|how|where|my)\b|this is (?:the|where|why|how)\b|that(?:'s|’s| is) (?:the|where|why) \b|(?:let me|i(?:'ll|’ll| will)) (?:show|tell)\b|(?:wait|watch|stay) (?:for|until|till|to the end)\b|(?:the|one) (?:part|thing|step|secret|trick|detail|mistake) (?:everyone|nobody|no one|most people|people)\b|more on (?:that|this) (?:soon|next)\b)/i
/** True when the line only promises something and gives nothing. */
export function isDanglingPromise(line: string): boolean {
  const t = String(line ?? '').trim()
  if (!t || isQuestion(t) || /[:;—–]\s*\S/.test(t)) return false
  return PROMISE.test(t) && wordCount(t) <= 12
}

/** Sentence cuts the panel final pass recorded (its added change line is not a cut). */
export function finalPassCuts(fp: unknown): number {
  const r = (fp && typeof fp === 'object' ? fp : {}) as Record<string, unknown>
  return ['pressure', 'unbacked_result', 'wrong_story', 'story_repeat', 'fact_repeat', 'false_cause'].reduce((n, k) => n + (Number(r[k]) || 0), 0)
}

export interface CleanupCtx { products?: readonly ScopedProduct[]; stories?: readonly string[]; offers?: readonly string[] }
export interface CleanupCut { dangling_last: number; fact_repeat: number; story_repeat: number; capped: number; /** Sentence cuts in this script so far, prior passes included. */ total: number }

/**
 * `opts.priorCuts`: sentence cuts already made in this script by earlier
 * passes (the panel final pass, the edge run before the worker's). They count
 * against the same cap of 2, so cuts never stack across passes (review of
 * #1360). `cut.total` is the running total to carry to the next pass.
 */
export function scriptCleanupV1<T extends { line?: unknown; section?: unknown }>(beats: readonly T[], ctx: CleanupCtx = {}, floor = 3, opts: { priorCuts?: number } = {}): { beats: T[]; cut: CleanupCut } {
  const prior = Math.max(0, Math.floor(Number(opts.priorCuts ?? 0)) || 0)
  const cut: CleanupCut = { dangling_last: 0, fact_repeat: 0, story_repeat: 0, capped: 0, total: prior }
  const offers = (ctx.offers ?? []).filter((o) => String(o ?? '').trim())
  const spokenIdx = beats.map((b, i) => (typeof b?.line === 'string' && b.line.trim() ? i : -1)).filter((i) => i >= 0)
  if (spokenIdx.length <= floor) return { beats: [...beats], cut }
  const hookAt = spokenIdx[0]
  const lastAt = spokenIdx[spokenIdx.length - 1]
  const totalWords = spokenIdx.reduce((n, i) => n + wordCount(String(beats[i].line)), 0)
  const wordCap = Math.max(20, Math.round(totalWords * 0.3))
  let cuts = prior, cutWords = 0, spoken = spokenIdx.length
  const allow = (s: string) => {
    const n = wordCount(s)
    if (cuts + 1 > 2 || cutWords + n > wordCap) { cut.capped++; return false }
    cuts++; cutWords += n; cut.total = cuts; return true
  }
  // The CTA: the last spoken line, unless the last line is a dangling promise,
  // then the last CTA-shaped line before it. Never cut.
  const danglingLast = isDanglingPromise(String(beats[lastAt].line)) && !isCtaText(String(beats[lastAt].line), offers)
  const ctaAt = danglingLast ? ([...spokenIdx].reverse().find((i) => i !== lastAt && isCtaText(String(beats[i].line), offers)) ?? -1) : lastAt
  const protectedBeat = (i: number) => i === hookAt || i === ctaAt
  const protectedSentence = (s: string) => isQuestion(s) || isCtaText(s, offers)

  // Sentence plan: [beat, sentence] → keep?
  const plan = beats.map((b) => (typeof b?.line === 'string' && b.line.trim() ? sentencesOf(b.line).map(() => true) : []))
  const sents = beats.map((b) => (typeof b?.line === 'string' ? sentencesOf(b.line) : []))

  // 3a. Facts said twice: a sentence that is mostly one fact, when an earlier
  // line (the hook counts as said) already holds that fact's key: its numbers
  // with their unit, or every one of its words.
  const facts = (ctx.products ?? []).flatMap((p) => p.facts).map((f) => {
    const w = words(f).map(stem)
    const nums = toks(f).filter((x) => /\d/.test(x)).map((x) => x.replace(/^\$/, ''))
    return { stems: new Set(w), nums }
  }).filter((f) => f.stems.size >= 1)
  const holdsFact = (text: string, f: { stems: Set<string>; nums: string[] }) => {
    const ts = new Set(words(text).map(stem))
    if (f.nums.length) {
      const raw = String(text).toLowerCase()
      return f.nums.every((n) => new RegExp(`(?:^|[^0-9])\\$?${n}(?:[^0-9]|$)`).test(raw))
    }
    return f.stems.size >= 2 && [...f.stems].every((w) => ts.has(w))
  }
  const isMostlyFact = (s: string, f: { stems: Set<string>; nums: string[] }) => {
    const ss = words(s).map(stem)
    if (!ss.length) return false
    const hit = ss.filter((w) => f.stems.has(w)).length
    return holdsFact(s, f) && hit / ss.length >= 0.65
  }
  for (const i of spokenIdx) {
    if (protectedBeat(i)) continue
    sents[i].forEach((s, k) => {
      if (protectedSentence(s)) return
      const f = facts.find((ff) => isMostlyFact(s, ff))
      if (!f) return
      const earlier = spokenIdx.filter((j) => j < i).some((j) => sents[j].some((t, m) => plan[j][m] && holdsFact(t, f)))
        || sents[i].some((t, m) => m < k && plan[i][m] && holdsFact(t, f))
      if (earlier && allow(s)) { plan[i][k] = false; cut.fact_repeat++ }
    })
  }

  // 3b. A story told twice: two non-hook, non-CTA lines that are each mostly the
  // same story and share two of its words (one unique to it). The stronger
  // telling (more of the story's own words) stays; the other goes.
  const stories = (ctx.stories ?? []).filter((s) => String(s ?? '').trim()).map((s) => new Set(words(s)))
  const wc = new Map<string, number>()
  for (const s of stories) for (const w of s) wc.set(w, (wc.get(w) ?? 0) + 1)
  for (const st of stories) {
    const tellings: Array<{ i: number; k: number; sw: Set<string>; strength: number }> = []
    for (const i of spokenIdx) {
      if (protectedBeat(i)) continue
      sents[i].forEach((s, k) => {
        if (!plan[i][k] || protectedSentence(s)) return
        const sw = new Set(words(s))
        const hit = [...sw].filter((w) => st.has(w))
        if (sw.size >= 2 && hit.length / sw.size >= 0.5 && hit.length >= 2) tellings.push({ i, k, sw, strength: hit.length })
      })
    }
    for (let a = 0; a < tellings.length; a++) {
      for (let b = a + 1; b < tellings.length; b++) {
        const A = tellings[a], B = tellings[b]
        if (!plan[A.i][A.k] || !plan[B.i][B.k]) continue
        const both = [...A.sw].filter((w) => B.sw.has(w) && st.has(w))
        if (both.length < 2 || !both.some((w) => wc.get(w) === 1)) continue
        const weak = B.strength > A.strength ? A : B
        if (allow(sents[weak.i][weak.k])) { plan[weak.i][weak.k] = false; cut.story_repeat++ }
      }
    }
  }

  // 2. The dangling last line.
  if (danglingLast && ctaAt !== lastAt && lastAt !== hookAt && allow(String(beats[lastAt].line))) {
    plan[lastAt] = plan[lastAt].map(() => false)
    cut.dangling_last++
  }

  const out: T[] = []
  for (const [i, b] of beats.entries()) {
    if (typeof b?.line !== 'string' || !b.line.trim()) { out.push(b); continue }
    const keep = sents[i].filter((_, k) => plan[i][k])
    if (keep.length === sents[i].length) { out.push(b); continue }
    if (!keep.length) {
      if (spoken - 1 >= floor) { spoken--; continue }
      out.push(b); continue
    }
    out.push({ ...b, line: keep.join(' ') })
  }
  return { beats: out, cut }
}
