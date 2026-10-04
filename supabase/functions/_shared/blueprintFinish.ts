// GENERATED FROM packages/shared/src/script/blueprintFinish.ts — DO NOT EDIT.
// Run: node scripts/ci/generate_shared_pilot_core.mjs
// Edit the source instead. CI regenerates this file and fails on a diff.
// @ts-nocheck
/**
 * THE FOUR BLUEPRINT CHECKS THE REVIEWER FAILED MOST, MADE DETERMINISTIC.
 *
 * ⚠️ SCRIPT BATCH part-3-product (2026-10-03), yes/no blueprint checks:
 *   - only 16% of product scripts SHOWED the product (or its screen, back
 *     camera) in one or two scenes whose lines are about it;
 *   - only 46% had the body deliver what the hook promised;
 *   - only 44% were full length;
 *   - only 56% closed with a next step fitting the goal.
 *
 * The owner's blueprint: mostly she talks to camera; in one or two scenes she
 * shows the product while talking (holds it, opens it, pours it; an app,
 * community or digital product is the back camera on its screen).
 *
 * ⚖️ EVERYTHING HERE IS PURE. No model call, no I/O. The edge function decides
 * when a repair call is worth making; these decide what is wrong and what the
 * deterministic fix is. Nothing here writes a fact: a show action names only
 * the product she attached and a screen the extractor saw; a close reuses her
 * own call to action or a line already in the script.
 *
 * Deno copy is GENERATED (scripts/ci/generate_shared_pilot_core.mjs); no imports.
 */

export interface FinishBeat {
  section?: unknown
  line?: unknown
  action_posing?: unknown
  camera?: unknown
  [k: string]: unknown
}

const text = (v: unknown) => (typeof v === 'string' ? v : '')
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean)

/** Sections that are her face: the opening and the ask. */
const FACE_SECTION = /\b(hook|re-?hook|cta|call to action|close|closing|outro|ask|sign[- ]?off)\b/i
const CLOSE_SECTION = /\b(cta|call to action|close|closing|outro|next step|sign[- ]?off|takeaway)\b/i

// ── 1. THE PRODUCT IS SHOWN ────────────────────────────────────────────────

export type ShowMode = 'physical' | 'screen' | 'none'

/**
 * How this product is shown. `type` / `showability` mirror product_entities.
 * A screen product with no screen the extractor saw cannot be shown: a screen
 * is never invented.
 */
export function showModeOf(type: unknown, showability: unknown, screens: ReadonlyArray<string>): ShowMode {
  if (String(showability ?? '').toUpperCase() === 'NEVER') return 'none'
  const t = String(type ?? '').toUpperCase()
  if (t === 'SAAS' || t === 'APP' || t === 'DIGITAL_PRODUCT' || t === 'SERVICE') return screens.length ? 'screen' : 'none'
  return 'physical'
}

/** An action that shows the thing itself: in hand, opened, poured, or its screen. */
export const SHOW_ACTION = /\b(?:hold(?:s|ing)?|open(?:s|ing)?|pour(?:s|ing)?|unbox\w*|scoop(?:s|ing)?|tip(?:s|ping)?|lift(?:s|ing)?|turn(?:s|ing)? (?:the|it)|show(?:s|ing)? (?:the|it|off)|screen|scroll(?:s|ing)?|tap(?:s|ping)?|back camera|rear camera|close[- ]?up|demonstrat\w*|appl(?:y|ies|ying)|wear(?:s|ing)?)\b/i

/**
 * Her body, not the product: "raise open palms", "hold eye contact", "lift her
 * chin", "tap her temple". The writer uses show verbs for gestures, and the
 * part-5 batch (2026-10-04) shipped 13 of 20 product scripts with no product
 * in frame because a gesture read as a show beat. These are struck before
 * SHOW_ACTION is tested.
 */
const BODY = '(?:(?:her|his|their|your|both|one|the|a)\\s+)?(?:open\\s+)?(?:palms?|hands?|arms?|fingers?|finger|head|chin|chest|shoulders?|eyebrows?|brows?|gaze|eyes?|face|temple|lens|camera|smile|pause|pose|breath|posture|eye contact|still)\\b'
const GESTURE = new RegExp(`\\b(?:open(?:s|ing)?|hold(?:s|ing)?|lift(?:s|ing)?|tip(?:s|ping)?|tap(?:s|ping)?|turn(?:s|ing)?|show(?:s|ing)?)\\s+(?:up\\s+|out\\s+)?${BODY}|\\bopen\\s+(?:palms?|hands?|arms?)\\b|\\b(?:palms?|hands?|arms?)\\s+open\\b`, 'gi')

/** A thing in frame: what a show verb must act on to be a product shot. */
const OBJECT = /\b(?:it|them|bag|bags|bottle|jar|cup|mug|box|pack(?:et|age|aging)?|tin|can|tube|grinder|machine|beans?|product|item|label|lid|screen|phone|laptop|app|dashboard|page|tab|device|kit|set|sample|pouch|carton|container|glass)\b/i

/**
 * True when the direction shows the product itself, not a gesture. A show
 * verb only counts when it acts on a thing: the product's own name, an
 * object ("the bag", "the cup", "the screen"), or "it". The writer invents
 * gestures faster than any list ("hold an open, relaxed posture", "counting
 * off pour over and drip"); a thing in frame is what tells them apart.
 */
export function showsProduct(action: string, productWords: ReadonlyArray<string> = []): boolean {
  const a = action.replace(GESTURE, ' ')
  if (!SHOW_ACTION.test(a)) return false
  if (/\b(?:back|rear) camera\b|\bclose[- ]?up\b/i.test(a) && (OBJECT.test(a) || namesProduct(a, productWords))) return true
  return OBJECT.test(a) || namesProduct(a, productWords)
}

function namesProduct(line: string, productWords: ReadonlyArray<string>): boolean {
  const l = line.toLowerCase()
  return productWords.some((w) => w.length >= 4 && l.includes(w.toLowerCase()))
}

/** The physical show action, from the object's shape when a photo was read. */
export function physicalShowAction(name: string, shape?: unknown): string {
  const n = name.trim() || 'the product'
  switch (String(shape ?? '').toLowerCase()) {
    case 'jar': case 'tube': case 'box':
      return `Hold the ${n} up to the lens, open it and tip it toward camera while she talks.`
    case 'bottle': case 'bag': case 'food': case 'vessel':
      return `Hold the ${n} up to the lens, then pour a little out so the camera sees it while she talks.`
    case 'garment':
      return `Hold the ${n} up against herself at chest height, turning it once toward the lens while she talks.`
    default:
      return `Hold the ${n} up to the lens at chest height and turn it once so the camera sees it while she talks.`
  }
}

/** The screen whose words overlap the line most; ties go to the first screen she was seen to have. */
export function pickScreen(line: string, screens: ReadonlyArray<string>): string | null {
  if (!screens.length) return null
  const lw = new Set(words(line.toLowerCase().replace(/[^a-z0-9\s]/g, ' ')).filter((w) => w.length >= 4))
  let best = 0, bestScore = -1
  screens.forEach((s, i) => {
    const score = words(s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ')).filter((w) => lw.has(w)).length
    if (score > bestScore) { best = i; bestScore = score }
  })
  return screens[best]
}

/** The screen's own name: the part before its description ("pricing page: three plans" → "pricing page"). */
export function screenName(screen: string): string {
  return screen.split(/[:—–(]| - /)[0].trim().slice(0, 60) || screen.slice(0, 60)
}

export function screenShowAction(name: string, screen: string): string {
  return `Flip to the back camera on the ${screenName(screen)} of ${name.trim() || 'the product'}; scroll it slowly while she talks.`
}

export interface ShowResult<T> {
  script: T[]
  /** Indices of beats that now show the product. */
  shown: number[]
  /** Index given a show action here, or null. */
  added: number | null
  /** Beats beyond two whose show action was taken back to her face. */
  trimmed: number
  reason: 'already_shown' | 'added' | 'not_named' | 'not_showable' | 'no_beat' | 'no_product'
}

/**
 * Exactly one or two beats whose line is about the product carry a concrete
 * show action. None → the beat that first names it (not the hook, not the
 * close) gets one from the product type. More than two, outside a teach row
 * (where every step is shown), → the extras go back to talking to camera.
 * Camera is `back` for a screen or a close-up, otherwise as written.
 */
export function ensureProductShown<T extends FinishBeat>(
  script: readonly T[],
  opts: {
    productName: string
    productWords: ReadonlyArray<string>
    mode: ShowMode
    shape?: unknown
    screens?: ReadonlyArray<string>
    /** The arc row ('teach' may show every step). */
    row?: string
  },
): ShowResult<T> {
  const out = script.map((b) => b)
  const base = { script: out, shown: [] as number[], added: null as number | null, trimmed: 0 }
  if (!opts.productName.trim() || !opts.productWords.length) return { ...base, reason: 'no_product' }
  if (opts.mode === 'none') return { ...base, reason: 'not_showable' }
  const spoken = out.map((b, i) => (text(b?.line).trim() ? i : -1)).filter((i) => i >= 0)
  const about = spoken.filter((i) => namesProduct(text(out[i].line), opts.productWords))
  if (!about.length) return { ...base, reason: 'not_named' }
  const shows = (b: T) => showsProduct(text(b.action_posing), opts.productWords)
  const shown = about.filter((i) => shows(out[i]))
  if (shown.length) {
    let trimmed = 0
    if (shown.length > 2 && opts.row !== 'teach') {
      for (const i of shown.slice(2)) {
        out[i] = { ...out[i], action_posing: 'Looks into the lens and talks it through, hands relaxed.', camera: 'front' }
        trimmed += 1
      }
    }
    return { ...base, script: out, shown: shown.slice(0, opts.row === 'teach' ? shown.length : 2), trimmed, reason: 'already_shown' }
  }
  const first = spoken[0], last = spoken[spoken.length - 1]
  const inner = about.filter((i) => !FACE_SECTION.test(text(out[i].section)) && i !== first && (spoken.length < 3 || i !== last))
  // A held product works to the front camera too; a screen never does, so a
  // screen beat must be a body beat.
  const pick = inner[0] ?? (opts.mode === 'physical' ? about.find((i) => i !== first) ?? about[0] : undefined)
  if (pick === undefined) return { ...base, reason: 'no_beat' }
  if (opts.mode === 'screen') {
    const screen = pickScreen(text(out[pick].line), opts.screens ?? [])
    if (!screen) return { ...base, reason: 'not_showable' }
    out[pick] = { ...out[pick], action_posing: screenShowAction(opts.productName, screen), camera: 'back' }
  } else {
    const action = physicalShowAction(opts.productName, opts.shape)
    const face = FACE_SECTION.test(text(out[pick].section)) || pick === first || pick === last
    // A show beat in the body is a close-up on the back camera; at her face it stays front.
    out[pick] = { ...out[pick], action_posing: action, camera: face ? 'front' : 'back' }
  }
  return { ...base, script: out, shown: [pick], added: pick, reason: 'added' }
}

// ── 2. THE HOOK'S PROMISE IS PAID ─────────────────────────────────────────

export interface HookPromise {
  kind: 'number' | 'question' | 'claim' | 'none'
  /** The count a numbered hook promises ("3 mistakes" → 3). */
  count: number | null
  /** The hook's content words, stemmed. */
  keys: string[]
}

const NUM_WORD: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 }
const STOP = new Set(('the and for with that this what your you have from they them then than there their about into just when will would could should does did not but are was were been being its it\'s how why who which here this these those over only really very more most some any all one out get got make made like know need want need thing things nobody everyone people every time ever never most your you\'re i\'m')
  .split(/\s+/))

export function stemKey(w: string): string {
  return w.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/(ing|ers|er|es|ed|s)$/, '')
}

function keysOf(line: string): string[] {
  return [...new Set(words(line.replace(/[^A-Za-z0-9'\s]/g, ' ')).map((w) => w.toLowerCase())
    .filter((w) => w.length >= 4 && !STOP.has(w)).map(stemKey).filter((w) => w.length >= 3))]
}

/** What the hook sets up: a count, a question, or a claim ("the reason…", "here's how…"). */
export function hookPromise(hook: string): HookPromise {
  const h = hook.trim()
  const keys = keysOf(h)
  const m = h.match(/\b(\d{1,2}|two|three|four|five|six|seven|eight|nine|ten)\s+(?:\w+\s+)?(?:things|ways|mistakes|reasons|tips|steps|signs|rules|lessons|secrets|habits|questions|myths|ingredients|tricks|hacks|ideas|facts)\b/i)
  if (m) {
    const n = /^\d+$/.test(m[1]) ? Number(m[1]) : NUM_WORD[m[1].toLowerCase()] ?? null
    return { kind: 'number', count: n, keys }
  }
  if (/\?\s*$/.test(h) || /^(why|how|what|which|who|when|is|are|do|does|can|should)\b/i.test(h)) return { kind: 'question', count: null, keys }
  if (/\b(the (?:reason|secret|truth|trick|one thing|real)|here'?s (?:how|why|what)|what nobody|no one tells|stop doing|the mistake|i (?:found|figured|learned))\b/i.test(h)) {
    return { kind: 'claim', count: null, keys }
  }
  return { kind: 'none', count: null, keys }
}

const ORDINAL = /\b(?:first|second|third|fourth|fifth|one|two|three|four|five|number (?:one|two|three|\d)|\d[.)]|next|another|last|finally)\b/gi

export interface PayoffCheck {
  promise: HookPromise
  paid: boolean
  /** The beat a repair should rewrite to deliver the promise, when unpaid. */
  payoffIndex: number | null
}

/**
 * Is the hook's promise answered by a later beat? A count is paid when the
 * body has at least that many beats or enumerated items; a question or claim
 * when a body beat (not the close) takes up at least two of the hook's own
 * content words (one when the hook has fewer than three).
 */
export function hookPayoff(script: ReadonlyArray<FinishBeat>): PayoffCheck {
  const spoken = script.map((b, i) => (text(b?.line).trim() ? i : -1)).filter((i) => i >= 0)
  const none = { promise: { kind: 'none' as const, count: null, keys: [] }, paid: true, payoffIndex: null }
  if (spoken.length < 3) return none
  const hookIdx = spoken[0]
  const promise = hookPromise(text(script[hookIdx].line))
  if (promise.kind === 'none') return { ...none, promise }
  const closeIdx = spoken[spoken.length - 1]
  const body = spoken.slice(1).filter((i) => i !== closeIdx || !CLOSE_SECTION.test(text(script[i].section)))
  if (!body.length) return { promise, paid: false, payoffIndex: null }
  const overlap = (i: number) => {
    const k = new Set(keysOf(text(script[i].line)))
    return promise.keys.filter((w) => k.has(w)).length
  }
  const scores = body.map((i) => ({ i, s: overlap(i) }))
  const best = scores.reduce((a, b) => (b.s > a.s ? b : a), scores[0])
  if (promise.kind === 'number' && promise.count) {
    const items = body.reduce((n, i) => n + (text(script[i].line).match(ORDINAL)?.length ?? 0), 0)
    const paid = body.length >= promise.count || items >= promise.count
    return { promise, paid, payoffIndex: paid ? null : best.i }
  }
  const need = promise.keys.length >= 3 ? 2 : 1
  const paid = promise.keys.length === 0 || best.s >= need
  return { promise, paid, payoffIndex: paid ? null : best.s > 0 ? best.i : body[0] }
}

/** The repair instruction: rewrite ONE beat so it delivers the hook's promise from supplied facts. */
export function payoffRepairPrompt(script: ReadonlyArray<FinishBeat>, check: PayoffCheck, facts: string): string {
  const hook = text(script.find((b) => text(b?.line).trim())?.line)
  const what = check.promise.kind === 'number'
    ? `the hook promises ${check.promise.count ?? 'a number of'} items; the beat must deliver the ones the body is missing, each named plainly`
    : check.promise.kind === 'question'
      ? 'the hook asks a question; the beat must answer it directly in its first sentence'
      : 'the hook makes a claim; the beat must say exactly what it is (the reason, the trick, the thing)'
  return `HOOK: "${hook}"\nThe body never delivers what this hook sets up: ${what}.\n`
    + 'Rewrite ONLY the beat listed so it delivers it, using ONLY the SUPPLIED FACTS. Keep its voice and about its length.'
    + ' NEVER add a number, name, product, result or experience that is not in the SUPPLIED FACTS.\n\n'
    + `SUPPLIED FACTS:\n${facts.slice(0, 6000)}\n\nFULL SCRIPT (context):\n`
    + script.map((b, i) => `[${i}] ${text(b?.section)}: ${text(b?.line)}`).join('\n')
    + `\n\nREWRITE ONLY: ${check.payoffIndex}\nReturn {"rewrites":[{"index":"<n>","line":"<new line>"}]}`
}

/** Numbers in `line` that are in neither `original` nor `facts` — a payoff that brings one is rejected. */
export function newNumbers(line: string, original: string, facts: string): string[] {
  const nums = (t: string) => (t.match(/\d+(?:[.,]\d+)?/g) ?? [])
  const had = new Set([...nums(original), ...nums(facts)])
  return nums(line).filter((n) => !had.has(n))
}

// ── 4. THE CLOSE FITS THE GOAL ────────────────────────────────────────────

export type CloseGoal = 'question' | 'follow_save' | 'takeaway' | null

/** Which close a goal wants. Selling goals have their own rule (her own CTA). */
export function closeGoalOf(goal: unknown): CloseGoal {
  const g = String(goal ?? '')
  if (g === 'conversations') return 'question'
  if (g === 'followers' || g === 'entertain' || g === 'personal_brand') return 'follow_save'
  if (g === 'educate' || g === 'authority') return 'takeaway'
  return null
}

const FOLLOW_SAVE = /\b(follow|save (?:this|it)|saved|bookmark|part (?:two|2)|next one|subscribe|share (?:this|it))\b/i
const TAKEAWAY = /\b(remember|takeaway|take away|bottom line|the lesson|so next time|in short|that'?s (?:the|it)|the one thing|start with)\b/i

export function closeFits(close: string, want: CloseGoal): boolean {
  const c = close.trim()
  if (!want || !c) return want === null
  if (want === 'question') return /\?\s*["')\]]*\s*$/.test(c)
  if (want === 'follow_save') return FOLLOW_SAVE.test(c)
  return TAKEAWAY.test(c)
}

const FOLLOW_ASK_LIKE = /\b(follow (for|me|my|along)|give (me|us) a follow|hit (the )?follow)\b/i

/**
 * The close sentence for this goal, written only from what is supplied: her
 * own call to action when it already fits, else a line with no fact in it
 * (a question back to the viewer, a save line), or a takeaway that restates
 * the payoff beat's own first sentence. Null when nothing fitting is safe.
 */
export function goalCloseSentence(
  want: CloseGoal,
  opts: { herCta?: string; payoffLine?: string; followAllowed?: boolean; topic?: string },
): string | null {
  if (!want) return null
  const cta = (opts.herCta ?? '').trim()
  if (cta && words(cta).length >= 3 && closeFits(cta, want) && (opts.followAllowed || !FOLLOW_ASK_LIKE.test(cta))) {
    return /[.!?]$/.test(cta) ? cta : `${cta}.`
  }
  if (want === 'question') return 'What would you do — tell me in the comments?'
  if (want === 'follow_save') return opts.followAllowed ? 'Follow along, and save this so you have it.' : 'Save this so you have it next time.'
  const first = (opts.payoffLine ?? '').split(/(?<=[.!?])\s+/)[0]?.trim() ?? ''
  if (first && words(first).length >= 4 && words(first).length <= 16) {
    return `So remember: ${first.charAt(0).toLowerCase()}${first.slice(1).replace(/[.!?]*$/, '.')}`
  }
  return 'Save this so you have it next time.'
}

/**
 * Give the script a goal-fitting close. The last spoken beat is checked; if it
 * already fits, nothing changes. If it is a close section that does not fit,
 * the sentence is appended to it; otherwise a CTA beat is added at the end.
 */
export function ensureGoalClose<T extends FinishBeat>(
  script: readonly T[],
  goal: unknown,
  opts: { herCta?: string; payoffLine?: string; followAllowed?: boolean },
): { script: T[]; changed: 'none' | 'appended' | 'added'; want: CloseGoal } {
  const want = closeGoalOf(goal)
  const out = script.map((b) => b)
  const spoken = out.map((b, i) => (text(b?.line).trim() ? i : -1)).filter((i) => i >= 0)
  if (!want || spoken.length < 2) return { script: out, changed: 'none', want }
  const last = spoken[spoken.length - 1]
  if (closeFits(text(out[last].line), want)) return { script: out, changed: 'none', want }
  const sentence = goalCloseSentence(want, opts)
  if (!sentence) return { script: out, changed: 'none', want }
  if (CLOSE_SECTION.test(text(out[last].section))) {
    const line = text(out[last].line).trim()
    out[last] = { ...out[last], line: `${/[.!?]$/.test(line) ? line : `${line}.`} ${sentence}` }
    return { script: out, changed: 'appended', want }
  }
  out.push({ section: 'CTA', line: sentence, camera: 'front', action_posing: 'Looks into the lens for the last line.' } as unknown as T)
  return { script: out, changed: 'added', want }
}
