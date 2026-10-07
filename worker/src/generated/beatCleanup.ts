// GENERATED FROM packages/shared/src/script/beatCleanup.ts — DO NOT EDIT.
// Run: node scripts/ci/generate_shared_pilot_core.mjs
// Edit the source instead. CI regenerates this file and fails on a diff.
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

// Owner plan B6a: "completely changes how your cup extracts", "completely
// changes your whole morning cup" (set 4 #3). An intensifier attached to a
// factual effect claim is removed; emphasis on her feelings ("completely
// stressed me out") is her voice and stays.
const CLAIM_INTENSIFIER = /\b(?:completely|totally|entirely|literally|dramatically|drastically|instantly)\s+(?=(?:changes?|changed|transforms?|transformed|ruins?|ruined|eliminates?|removes?|destroys?|kills?|fixes|fixed|doubles?|guarantees?|unlocks?)\b)/gi

/** Remove an intensifier sitting on a factual effect claim. */
export function stripClaimIntensifiers(line: string): string {
  return line.replace(CLAIM_INTENSIFIER, '')
}

// Paired set 10A/10B: "Tell me below. What would you do — tell me in the
// comments?" Two sentences in one line repeating the same 4-word ask: the
// earlier one is dropped, the question kept.
export function dropRepeatedAsk(line: string): string {
  const sents = line.match(/[^.!?]+[.!?]*/g)?.map((x) => x.trim()).filter(Boolean) ?? []
  if (sents.length < 2) return line
  const grams = (t: string) => {
    const w = t.toLowerCase().replace(/[^a-z' ]+/g, ' ').split(/\s+/).filter(Boolean)
    const g = new Set<string>()
    for (let i = 0; i + 3 < w.length; i++) g.add(w.slice(i, i + 4).join(' '))
    return g
  }
  const keep = sents.filter((x, i) => {
    const mine = grams(x)
    return !sents.slice(i + 1).some((later) => [...grams(later)].some((g) => mine.has(g)) || /^(?:tell me (?:below|in the comments)|comment below)[.!]?$/i.test(x))
  })
  return keep.length && keep.length < sents.length ? keep.join(' ') : line
}

/** Clean every beat; drop a trailing follow-ask on a non-follow video. */
export function cleanBeats<T extends { line?: unknown }>(beats: readonly T[], goal: string): { beats: T[]; changed: number } {
  let changed = 0
  let out = beats.map((b) => {
    if (typeof b.line !== 'string') return b
    const line = dropRepeatedAsk(stripClaimIntensifiers(stripEmptyBridge(b.line)))
    if (line !== b.line) { changed++; return { ...b, line } }
    return b
  })
  // Set 4 T3: "And this is where it clicks." stood alone as a whole beat. A
  // middle beat that is only a bridge phrase, with nothing after it, is dropped.
  const STANDALONE = /^\s*(?:and |so |but )?(?:this is|here is|here'?s|that'?s) (?:where|when|how|what|why|the part|the moment)\b[^.!?]{0,40}[.!]?\s*$/i
  const standalone = (l: unknown) => typeof l === 'string' && (STANDALONE.test(l) || (BRIDGE.test(l) && l.replace(BRIDGE, '').replace(/[\s.!,—–-]+/g, '') === ''))
  const kept = out.filter((b, i) => i === 0 || i === out.length - 1 || !standalone(b.line))
  if (kept.length !== out.length && kept.length >= 3) { changed += out.length - kept.length; out = kept }
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

// ⚠️ BLIND SET 2 (owner 2026-10-05): her profile's own labels said out loud —
// "for beginners and everyday people" (#11, #12), "Starting and operating
// Sunflower Coffee Roasters as a micro specialty coffee roaster…" (#11) — and
// the closer template back as "So remember: here is the operational reality
// that changes everything." (#8). The writer is told never to say labels; it
// still does, so they are removed after writing.

/** "So remember: <a line already said>" closing the script is dropped. */
export function dropEchoCloser<T extends { line?: unknown }>(beats: readonly T[]): T[] {
  if (beats.length < 3) return [...beats]
  const last = beats[beats.length - 1]!
  const text = typeof last.line === 'string' ? last.line : ''
  const m = text.match(/(?:^|[.!?]\s+)so remember:?\s+([^.!?]+)[.!?]?\s*$/i)
  if (!m) return [...beats]
  const echo = m[1]!.toLowerCase().replace(/[^a-z ]/g, '').trim()
  const earlier = beats.slice(0, -1).map((b) => String(b.line ?? '').toLowerCase().replace(/[^a-z ]/g, ''))
  if (!earlier.some((l) => l.includes(echo)) && !text.toLowerCase().slice(0, text.length - m[0].length).replace(/[^a-z ]/g, '').includes(echo)) return [...beats]
  const kept = text.slice(0, text.length - m[0].length).trim()
  const head = m[0].match(/^[.!?]/) ? `${kept}${m[0][0]}` : kept
  return kept ? [...beats.slice(0, -1), { ...last, line: head }] : beats.slice(0, -1)
}

/**
 * Her audience labels as a run ("everyday people and beginners") become one
 * plain phrase; a line that opens with a scan topic ("Starting and operating
 * X as a micro specialty coffee roaster in Farmington, NM,") loses that clause.
 */
export function stripProfileLabels(line: string, labels: readonly string[], topics: readonly string[] = []): string {
  let out = line
  const ls = labels.map((l) => l.trim().toLowerCase()).filter((l) => l.length > 3)
  if (ls.length >= 2) {
    const alt = ls.map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
    out = out.replace(new RegExp(`\\b(?:for\\s+)?(?:${alt})(?:,?\\s+(?:and|or)\\s+(?:${alt}))+\\b`, 'gi'), (m) => (/^for\s/i.test(m) ? 'for people just starting out' : 'people just starting out'))
  }
  for (const t of topics) {
    const opening = t.trim().split(/\s+/).slice(0, 3).join(' ').toLowerCase()
    if (opening.split(' ').length < 3) continue
    if (out.toLowerCase().startsWith(opening)) {
      const comma = out.indexOf(',')
      if (comma > 0 && comma < 160) {
        const rest = out.slice(comma + 1).trim()
        if (rest.split(/\s+/).length >= 4) out = rest[0]!.toUpperCase() + rest.slice(1)
      }
    }
  }
  // Blind set 3 (owner 2026-10-06): a SINGLE label slipped through ("everyday
  // people", "everyday beginners" in 5 scripts). A label's describing word
  // (from a short list, never a noun like "coffee") is dropped before any noun.
  for (const l of ls) {
    const first = l.split(/\s+/)[0] ?? ''
    if (l.split(/\s+/).length >= 2 && LABEL_MODIFIERS.has(first)) {
      out = out.replace(new RegExp(`\\b${first}\\s+(?=[a-z])`, 'gi'), '')
    }
  }
  return out.replace(/\b(people just starting out)(?:,?\s+(?:and|or)\s+people just starting out)+/gi, '$1')
}

const LABEL_MODIFIERS = new Set(['everyday', 'ordinary', 'regular', 'average', 'aspiring', 'busy', 'budget-conscious', 'eco-conscious', 'health-conscious', 'time-strapped'])

/**
 * Blind set 3 #4 (owner 2026-10-06): "no numbers, just first steps" was her
 * note TO Twin inside an answer, and it was said on camera. A clause that
 * instructs the writer is cut from the line.
 */
const WRITER_NOTE = /(?:^|[,;—–-]\s*|\.\s+)(?:no (?:complicated |fancy |big |hard |real )?numbers|keep it (?:general|short|simple|vague)|don'?t mention [^,.;]+|nothing specific)(?:,?\s*just [^,.;]+)?[.!]?/gi
export function dropWriterNotes(line: string): string {
  const out = line.replace(WRITER_NOTE, (m) => (/^\.\s+/.test(m) ? '.' : '')).replace(/\s+([.,!?])/g, '$1').replace(/\s{2,}/g, ' ').trim()
  const ended = out && !/[.!?]$/.test(out) && /[.!?]$/.test(line.trim()) ? `${out}.` : out
  return ended.length >= 8 ? ended : line
}
