// GENERATED FROM packages/shared/src/script/panelFinalPass.ts — DO NOT EDIT.
// Run: node scripts/ci/generate_shared_pilot_core.mjs
// Edit the source instead. CI regenerates this file and fails on a diff.
// @ts-nocheck
// PANEL FINAL PASS (panel 13b labels, 9 Nov; panel accounts only, the edge
// and the worker gate it). Runs LAST, after every stage that can add a line
// (Plan B, spine, the QC, the floor refill), so a line copied in late is held
// to the same rules as the writer's:
//
//   2. WRONG-PRODUCT STORY. A story is tied to the product it names or implies
//      ("forty jars" implies the jar, so the moisturizer). A script about
//      another product never tells it.
//   4. FILLER on every line, not only stories ("I think, um, … so yeah").
//   5. "WHY X AND THE ONE CHANGE THAT FIXES IT" carries her change ("grind");
//      a result she never claimed ("the sourness disappears") is cut.
//   6. No invented pressure ("before they're gone"), customer behaviour
//      ("people always ask") or false cause ("wax the foot, so it's dishwasher
//      safe") unless her material says it.
//   7. A story told again later, and a product fact stated twice, are cut.
//
// Only cuts and splits, plus her own change sentence verbatim in (5). The
// hook is never cut. Never drops below `floor` spoken beats. URL-safe: lines
// split only at . ! ? followed by a space. Pure; the edge and worker copies
// are generated.
import { stripSpokenFiller } from './scriptHygiene.ts'
import type { ScopedProduct } from './productFactScope.ts'

const STOP = new Set(['a', 'an', 'the', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'for', 'with', 'by', 'at', 'from', 'is', 'are', 'was', 'were', 'it', 'its', 'this', 'that', 'my', 'your', 'our', 'his', 'her', 'their', 'i', 'we', 'you', 'he', 'she', 'they', 'be', 'as', 'so', 'no', 'not', 'every', 'each', 'one', 'all', 'me', 'us', 'them', 'than', 'then', 'there', 'here', 'what', 'when', 'how', 'why', 'who', 'did', 'do', 'does', 'had', 'has', 'have', 'got', 'get', 'about', 'just', 'really', 'very', 'into', 'out', 'up', 'off', 'if', 'once', 'now', 'any', 'more', 'most', 'some', 'can', 'will', 'would', 'could', 'should', 'like', 'which', 'way'])
const toks = (t: string) => String(t ?? '').toLowerCase().replace(/[’']s\b/g, '').replace(/[’']/g, '').match(/[a-z0-9]+(?:-[a-z0-9]+)*/g) ?? []
const sing = (w: string) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w)
/** Content words: 3+ letters (or any number), not stop words, singular. */
const words = (t: string) => toks(t).flatMap((w) => w.split('-')).filter((w) => /\d/.test(w) || (w.length >= 3 && !STOP.has(w))).map(sing)
const stem4 = (w: string) => (/\d/.test(w) ? w : w.slice(0, 4))
const sentencesOf = (l: string) => String(l ?? '').split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean)
const cap = (t: string) => (t && !/^(?:https?:\/\/|www\.)/i.test(t) ? t.charAt(0).toUpperCase() + t.slice(1) : t)
const PROTECTED = /^(?:hook)\b/i

// ── 2. stories tied to products ────────────────────────────────────────────
/** The product a story names, or the one product whose own words it uses. */
function storyProduct(story: string, products: readonly ScopedProduct[]): string | null {
  const low = String(story ?? '').toLowerCase()
  const named = products.filter((p) => p.name.trim() && low.includes(p.name.trim().toLowerCase()))
  if (named.length === 1) return named[0].id
  if (named.length > 1) return null
  const per = products.map((p) => new Set(words([p.name, ...p.facts].join(' '))))
  const count = new Map<string, number>()
  for (const s of per) for (const w of s) count.set(w, (count.get(w) ?? 0) + 1)
  const sw = new Set(words(story))
  const hits = per.map((s) => [...s].filter((w) => count.get(w) === 1 && sw.has(w)).length)
  const best = Math.max(0, ...hits)
  if (!best || hits.filter((h) => h === best).length !== 1) return null
  return products[hits.indexOf(best)].id
}

/** Products with each story they name or imply added to their facts. */
export function attachStories(products: readonly ScopedProduct[], stories: readonly string[]): ScopedProduct[] {
  const extra = new Map<string, string[]>()
  if (products.length >= 2) for (const s of stories) { const id = storyProduct(s, products); if (id) extra.set(id, [...(extra.get(id) ?? []), s]) }
  return products.map((p) => ({ ...p, facts: [...p.facts, ...(extra.get(p.id) ?? [])] }))
}

/** Content 2- and 3-word runs: a story's distinctive phrases. */
function runs(t: string): Set<string> {
  const w = toks(t)
  const out = new Set<string>()
  for (let i = 0; i + 1 < w.length; i++) if (!STOP.has(w[i]) && !STOP.has(w[i + 1])) out.add(`${w[i]} ${w[i + 1]}`)
  for (let i = 0; i + 2 < w.length; i++) if (!STOP.has(w[i]) && !STOP.has(w[i + 2])) out.add(`${w[i]} ${w[i + 1]} ${w[i + 2]}`)
  return out
}

// ── 6. pressure, customer behaviour, false cause; 5. unbacked results ─────
const PRESSURE = /\b(?:before (?:they(?:'| a)re|it(?:'| i)s|they are|it is) (?:all )?gone|while (?:supplies|stocks?) lasts?|sell(?:s|ing)? out (?:fast|quickly)|won'?t last|limited (?:stock|time|run|spots?)|last chance|don'?t miss (?:out|it)|hurry|going fast|almost gone|only a few (?:left|remain)|act now)\b/i
const BEHAVIOUR = /\b(?:(?:people|everyone|everybody|customers|clients|folks|followers|you all|y'?all) (?:always|keep|constantly|often|all|regularly) (?:ask|asking|tell|telling|say|saying|love|loving|rave|raving|message|dm)\w*|everyone (?:asks|loves|says|wants|tells)|my (?:customers|followers|dms?|inbox) (?:keep|always|are full)|(?:most|number one|top) (?:asked|requested) (?:question|thing))\b/i
const RESULT = /\b(?:disappears?|disappeared|vanish(?:es|ed)?|goes away|gone for good|never again|instantly|guaranteed|every single time|fixed for good|problem solved|completely (?:fixes|gone|solved))\b/i
// A false cause is only "X, so it's / so they're / so it stays / so the X
// stays Y" (replay review, 10 Nov): "because" clauses are left alone.
const CAUSE = /^(.*?\w)\s*,?\s+so\s+((?:it|they)(?:(?:'|’)s|(?:'|’)re| is| are| stays?| remains?)|the (?:\w+ ){0,2}(?:stays?|is|are|remains?))\s+(.+)$/i
// "https://example. Com/pip-live" (a split made upstream) is put back together.
const BROKEN_URL = /\b(https?:\/\/[\w-]+(?:\.[\w-]+)*)\. (Com|Co|Org|Net|Io|Shop|Store|App)(?=\/|\b)/g

const inMaterial = (phrase: string, material: string) => material.toLowerCase().replace(/[’]/g, "'").includes(phrase.toLowerCase().replace(/[’]/g, "'"))

/** True when one sentence of her material carries both sides of the cause. */
function causeBacked(left: string, right: string, matSentences: readonly string[]): boolean {
  const L = [...new Set(words(left).map(stem4))]
  const R = [...new Set(words(right).map(stem4))]
  if (!L.length || !R.length) return true
  return matSentences.some((m) => {
    const s = new Set(words(m).map(stem4))
    return L.filter((w) => s.has(w)).length >= Math.ceil((2 * L.length) / 3) && R.filter((w) => s.has(w)).length >= Math.ceil(R.length / 2)
  })
}

const URL_RE = /\bhttps?:\/\/\S+|\bwww\.\S+|\b[a-z0-9-]+\.(?:com|co|io|net|org|shop|store|app)\/\S*/i
/** A CTA sentence: a URL, "link in bio", or a product's offer text (or its URL). */
export function isCtaSentence(s: string, offers: readonly string[] = []): boolean {
  if (URL_RE.test(s) || /\blink in (?:my |the )?bio\b/i.test(s)) return true
  const low = s.toLowerCase()
  return offers.some((o) => low.includes(o.toLowerCase()) || (o.match(URL_RE)?.[0] ? low.includes(o.match(URL_RE)![0].toLowerCase().replace(/[.,]$/, '')) : false))
}

export interface FinalPassCtx {
  request: string
  /** Everything she has given, one text (stories, answers, product facts, offer). */
  material: string
  /** Her stories, frameworks and story answers, one per item. */
  stories: readonly string[]
  products: readonly ScopedProduct[]
  subjectId?: string | null
  /** The products' offer lines; a sentence carrying one is a CTA (protected). */
  offers?: readonly string[]
}
export interface FinalPassCut { wrong_story: number; filler: number; pressure: number; false_cause: number; change_added: number; unbacked_result: number; story_repeat: number; fact_repeat: number; url_fixed: number; capped: number }

export function panelFinalPass<T extends { line?: unknown; section?: unknown }>(beats: readonly T[], ctx: FinalPassCtx, floor = 3): { beats: T[]; cut: FinalPassCut } {
  const cut: FinalPassCut = { wrong_story: 0, filler: 0, pressure: 0, false_cause: 0, change_added: 0, unbacked_result: 0, story_repeat: 0, fact_repeat: 0, url_fixed: 0, capped: 0 }
  const material = String(ctx.material ?? '')
  const matSentences = material.split(/(?<=[.!?;])\s+|\n+/).map((s) => s.trim()).filter(Boolean)
  const stories = ctx.stories.filter((s) => String(s ?? '').trim())
  const offers = (ctx.offers ?? []).map((o) => String(o ?? '').trim()).filter((o) => o.length >= 6)

  // Story phrases owned by a product other than the subject (2).
  const foreign: Array<Set<string>> = []
  if (ctx.subjectId && ctx.products.length >= 2) {
    const owner = new Map<string, string[]>()
    for (const s of stories) { const id = storyProduct(s, ctx.products); if (id) owner.set(id, [...(owner.get(id) ?? []), s]) }
    const subj = new Set([...(owner.get(ctx.subjectId) ?? []), ...(ctx.products.find((p) => p.id === ctx.subjectId)?.facts ?? [])].flatMap((s) => [...runs(s)]))
    for (const [id, ss] of owner) if (id !== ctx.subjectId) for (const s of ss) foreign.push(new Set([...runs(s)].filter((r) => !subj.has(r))))
  }
  // Story words, and which are unique to one story (7).
  const storyWords = stories.map((s) => new Set(words(s)))
  const wc = new Map<string, number>()
  for (const s of storyWords) for (const w of s) wc.set(w, (wc.get(w) ?? 0) + 1)
  /** Every earlier line's words (hook included), for the told-three-times check. */
  const earlier: Array<Set<string>> = []
  const mostlyStory = (sw: Set<string>, k: number) => sw.size >= 2 && [...sw].filter((w) => storyWords[k].has(w)).length / sw.size >= 0.5
  // Product facts as stem sets (7), and the fact stems said so far (the hook not counted).
  const facts = ctx.products.flatMap((p) => p.facts.map((f) => new Set(words(f).map(stem4)))).filter((f) => f.size >= 2)
  const factSeen = facts.map(() => new Set<string>())
  const share = (f: Set<string>, ss: Set<string>) => ({ hit: [...f].filter((w) => ss.has(w)).length, of: ss.size })

  // The cap: at most 2 sentence cuts or rewrites, and about a quarter (30% at most) of the words.
  const totalWords = beats.reduce((n, b) => n + String(b?.line ?? '').split(/\s+/).filter(Boolean).length, 0)
  let cuts = 0, cutWords = 0
  // A rewrite (the false-cause split) removes no words, so only its count is capped.
  const allow = (s: string, removes = true) => {
    const n = removes ? s.split(/\s+/).filter(Boolean).length : 0
    if (cuts + 1 > 2 || cutWords + n > Math.max(20, Math.round(totalWords * 0.3))) { cut.capped++; return false }
    cuts++; cutWords += n; return true
  }

  const spokenIdx = beats.map((b, i) => (typeof b?.line === 'string' && b.line.trim() ? i : -1)).filter((i) => i >= 0)
  const hookAt = spokenIdx[0]
  let spoken = spokenIdx.length
  const out: T[] = []
  for (const [i, b] of beats.entries()) {
    const line = typeof b?.line === 'string' ? b.line : ''
    if (!line.trim()) { out.push(b); continue }
    const isHook = i === hookAt || PROTECTED.test(String(b?.section ?? '').trim())
    let text = line.replace(BROKEN_URL, (_m, a: string, tld: string) => `${a}.${tld.toLowerCase()}`)
    if (text !== line) cut.url_fixed++
    const kept: string[] = []
    let filled = false
    for (const s0 of sentencesOf(text)) {
      let s = s0
      // Never touched by any rule: the hook, a CTA sentence, a question.
      if (isHook || isCtaSentence(s, offers) || /\?["”’)]?$/.test(s)) {
        kept.push(s); continue
      }
      const f0 = stripSpokenFiller(s, true)
      if (f0 !== s) { filled = true; s = f0 }
      if (!s.trim()) continue
      const sw = new Set(words(s))
      const ss = new Set([...sw].map(stem4))
      const p = s.match(PRESSURE)?.[0] ?? s.match(BEHAVIOUR)?.[0]
      if (p && !inMaterial(p, material) && allow(s)) { cut.pressure++; continue }
      const r = s.match(RESULT)?.[0]
      if (r && !inMaterial(r, material) && allow(s)) { cut.unbacked_result++; continue }
      if (foreign.length) { const g = runs(s); if (foreign.some((f) => [...f].filter((x) => g.has(x)).length >= 2) && allow(s)) { cut.wrong_story++; continue } }
      // Told three times: two earlier lines (the hook included) each already said
      // two of this sentence's story words, one of them unique to the story.
      const retold = stories.some((_, k) => mostlyStory(sw, k) && earlier.filter((t) => {
        const both = [...sw].filter((w) => t.has(w) && storyWords[k].has(w))
        return both.length >= 2 && both.some((w) => wc.get(w) === 1)
      }).length >= 2)
      if (retold && allow(s)) { cut.story_repeat++; continue }
      // A fact said again: about two-thirds of this sentence is the fact, and half the
      // fact's words were already said in earlier lines (not the hook).
      const states = facts.map((f, k) => { const { hit, of } = share(f, ss); return hit >= Math.max(2, Math.ceil(f.size / 2)) && hit / Math.max(1, of) >= 0.65 ? k : -1 }).filter((k) => k >= 0)
      if (states.length && states.every((k) => factSeen[k].size >= Math.max(2, Math.ceil(facts[k].size / 2))) && allow(s)) { cut.fact_repeat++; continue }
      facts.forEach((f, k) => { const { hit, of } = share(f, ss); if (hit && hit / Math.max(1, of) >= 0.5) for (const w of f) if (ss.has(w)) factSeen[k].add(w) })
      const m = s.match(CAUSE)
      if (m && !causeBacked(m[1], m[3], matSentences) && allow(s, false)) {
        cut.false_cause++
        s = `${m[1]}. ${cap(m[2].replace(/’/g, "'"))} ${m[3]}`
      }
      kept.push(s)
    }
    if (filled) cut.filler++
    earlier.push(new Set(words(kept.join(' '))))
    const joined = kept.join(' ').trim()
    if (!joined || !/[a-z0-9]/i.test(joined)) {
      if (spoken - 1 >= floor) { spoken--; continue }
      out.push(b); continue
    }
    out.push(joined === line ? b : { ...b, line: cap(joined) })
  }

  // 5. The change: when the request asks for "the one X change" and the script
  // never says X, her own sentence with X goes in before the CTA, verbatim.
  const key = String(ctx.request ?? '').match(/\b(?:one|a|the|single)\s+(\w+)\s+(?:change|tweak|fix)\b/i)?.[1]?.toLowerCase()
  if (key && !/^(?:simple|small|quick|big|easy|little|tiny|single)$/.test(key)) {
    const k = key.slice(0, 5)
    const said = out.some((b) => toks(String(b?.line ?? '')).some((w) => w.startsWith(k)))
    if (!said) {
      const src = [...stories, ...material.split(/\n+/)].flatMap((t) => String(t).split(/(?<=[.!?])\s+/)).map((x) => x.trim()).find((x) => toks(x).some((w) => w.startsWith(k)))
      if (src) {
        const lastSpoken = out.map((b, i) => (typeof b?.line === 'string' && b.line.trim() ? i : -1)).filter((i) => i >= 0).pop() ?? out.length
        out.splice(lastSpoken, 0, { section: 'The change', line: cap(stripSpokenFiller(src, true)) } as unknown as T)
        cut.change_added++
      }
    }
  }
  return { beats: out, cut }
}
