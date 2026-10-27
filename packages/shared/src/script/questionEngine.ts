// THE QUESTION ENGINE (plan v7.1 §3, WP3; Q6 for the planner).
//
// ⚖️ TWO QUESTIONS, EVERY TIME, ABOUT WHAT THIS REQUEST IS MISSING.
//   Q1 (pain): a niche pain from the pain map that fits this topic, asking for
//      HER real example. Twin's own words; never a quote, never a username.
//   Q2 (gap): the biggest missing slot for this angle, in the order story →
//      problem → proof → product fact → offer; worded for the door she came
//      through (Product, Idea, Reference, Gallery). When nothing is missing,
//      a sharpener asks for one confirmable specific.
// Both are shown; she can skip either. Nothing is re-asked: a key she
// answered or skipped is closed, and a question whose meaning matches a saved
// answer is not asked. Never asks for dates or scarcity. Pure; no I/O.
import type { Slot } from './itemFormat.js'
import type { PlanQuestion, QuestionKind, QuestionSource } from './questionUsefulness.js'

export type Door = 'product' | 'idea' | 'reference' | 'browse'
export type GapSource = 'product' | 'voice' | 'onboarding' | 'story' | 'pain' | 'input'
export type SlotStatus = 'filled' | 'missing'

export interface EngineMaterial { slot: Slot; text: string; source: 'her_material' | 'product' }
export interface PainTheme { id: string; text: string }

export interface EngineInput {
  door: unknown
  angleNeeds: readonly Slot[]
  material: readonly EngineMaterial[]
  /** The idea she typed or the note with her link; used to fit pains and pillars. */
  ideaText?: string | null
  productName?: string | null
  /** product_entities.type (SAAS, APP, DIGITAL_PRODUCT, PHYSICAL, COURSE, SERVICE…), for the show-it wording. */
  productKind?: string | null
  pillars?: readonly string[]
  painThemes?: readonly PainTheme[]
  /** Keys answered or skipped before (question_asks), never asked again. */
  closedKeys?: readonly string[]
  /** Her saved answer texts, for the meaning check. */
  savedAnswers?: readonly string[]
  /** Onboarding gaps (audience, offer) when known. */
  profileMissing?: boolean
  voiceCard?: boolean
}

export interface SlotInventory { slot: Slot; status: SlotStatus; gap: GapSource | null }

/** Slots in the order a missing one is worth asking about. 'hook' is the problem line. */
const GAP_ORDER: readonly Slot[] = ['story', 'hook', 'proof', 'what_it_is', 'process', 'stance', 'objection', 'show_it', 'close']

export function doorOf(v: unknown): Door {
  const s = String(v ?? '').toLowerCase()
  return s === 'product' || s === 'idea' || s === 'reference' ? s : 'browse'
}

const GAP_FOR_SLOT: Record<Slot, GapSource> = {
  story: 'story', hook: 'pain', proof: 'story', stance: 'story', process: 'story', context: 'input',
  what_it_is: 'product', show_it: 'product', close: 'product', objection: 'pain',
}

/** Step 1–2: every slot this request needs (the angle's needs plus the house structure's core), with where a gap comes from. */
export function inventory(i: EngineInput): SlotInventory[] {
  const door = doorOf(i.door)
  const need = new Set<Slot>([...i.angleNeeds, 'story', 'hook', 'proof'])
  if (door === 'product') { need.add('what_it_is'); need.add('close') }
  const filled = new Set(i.material.map((m) => m.slot))
  return [...need].map((slot) => ({
    slot, status: filled.has(slot) ? 'filled' as const : 'missing' as const,
    gap: filled.has(slot) ? null : (door === 'product' && (slot === 'what_it_is' || slot === 'close') ? 'product' : GAP_FOR_SLOT[slot]),
  }))
}

const STOP = new Set('a an the and or but so to of in on at for with from by is are was were be it its this that you your i my me we our they their how what why when who do does did not no have has had just about into over more most'.split(' '))
const words = (t: string) => new Set(String(t ?? '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)))
const overlap = (a: string, b: string) => {
  const x = words(a); const y = words(b)
  if (!x.size || !y.size) return 0
  let n = 0
  for (const w of x) if (y.has(w)) n++
  return n / Math.min(x.size, y.size)
}

/** The pain that fits this topic best (shares a content word), or null. */
export function fitPain(themes: readonly PainTheme[], topic: string): PainTheme | null {
  let best: PainTheme | null = null
  let score = 0
  for (const t of themes) {
    const s = overlap(t.text, topic)
    if (s > score) { score = s; best = t }
  }
  return score > 0 ? best : null
}

/** One pain theme in, one question out. Twin's words; asks for her example. */
export function painToQuestion(theme: PainTheme): { key: string; text: string } {
  const t = theme.text.replace(/\s+/g, ' ').trim().replace(/[.?!]+$/, '')
  return { key: `mn:pain:${theme.id}`.slice(0, 160), text: `A lot of people in your niche run into this: ${t.charAt(0).toLowerCase()}${t.slice(1)}. When did you (or someone you helped) hit it, and what happened?` }
}

/** Door-specific wording for a missing slot. */
export function gapQuestion(slot: Slot, door: Door, subject: string, productKind?: string | null): string {
  const s = subject.trim() || 'this'
  // Plan v7.1: how she SHOWS it depends on what it is.
  if (slot === 'show_it' && door === 'product' && productKind) {
    const k = productKind.toUpperCase()
    if (k === 'SAAS' || k === 'APP' || k === 'DIGITAL_PRODUCT' || k === 'COURSE' || k === 'COMMUNITY') {
      return `What's the one thing you'd do on your screen to show ${s} working? Can you screen-record it, or will you film the screen with your camera?`
    }
    if (k === 'SERVICE') return `What could viewers see of ${s} in action: your setup, a session, a before/after you can share?`
    return `What would you do with ${s} on camera: open it, hold it up, use it? Show us the moment it matters.`
  }
  const bank: Partial<Record<Slot, Record<Door, string>>> = {
    story: {
      product: `What was the moment you first used ${s} and something changed? Tell it like you'd tell a friend.`,
      idea: `What happened that made you want to make a video about ${s}?`,
      reference: `This kind of video turns on a real moment. What's yours, from your own work, that fits ${s}?`,
      browse: `Which moment from your own work fits ${s}? One you could tell in a few sentences.`,
    },
    hook: {
      product: `What problem does ${s} solve for the people who buy it, in the words they'd use?`,
      idea: `What do people get wrong about ${s}, or struggle with first?`,
      reference: `What's the problem your viewers have that this video should name?`,
      browse: `What's the problem your viewers have with ${s}?`,
    },
    proof: {
      product: `What result have you seen from ${s}, yours or a customer's, that you can stand behind?`,
      idea: `What's one thing you've seen that proves your point about ${s}?`,
      reference: `What's your proof for this: a result, a before/after, a customer's words you can share?`,
      browse: `What result or example backs up your take on ${s}?`,
    },
    what_it_is: {
      product: `In one sentence, what is ${s} and who is it for?`,
      idea: `Is there something you sell or offer that fits ${s}? What is it, in one sentence?`,
      reference: `What are you showing in this video, in one sentence?`,
      browse: `What are you showing in this video, in one sentence?`,
    },
    close: {
      product: `What should viewers do next for ${s}: a link, a trial, a call? And is there a price or trial you want said?`,
      idea: `What do you want viewers to do after this video?`,
      reference: `What do you want viewers to do after this video?`,
      browse: `What do you want viewers to do after this video?`,
    },
    process: {
      product: `What are the steps you actually follow with ${s}?`, idea: `What are your steps for ${s}, in order?`,
      reference: `What are your own steps for this?`, browse: `What are your steps for ${s}?`,
    },
    stance: {
      product: `What's your honest take on ${s} that most people wouldn't say?`, idea: `What's your honest take on ${s}?`,
      reference: `Where do you disagree with how this is usually done?`, browse: `What's your honest take on ${s}?`,
    },
    objection: {
      product: `What's the doubt people raise before buying ${s}, and how do you answer it?`, idea: `What pushback do you get about ${s}?`,
      reference: `What would a skeptical viewer say, and what's your answer?`, browse: `What pushback do you get about ${s}?`,
    },
    show_it: {
      product: `What can you show on camera with ${s} in the first seconds?`, idea: `What could you show on camera for ${s}?`,
      reference: `What can you show on camera that matches this?`, browse: `What could you show on camera for ${s}?`,
    },
  }
  return bank[slot]?.[door] ?? `What's the one thing about ${s} you'd want viewers to know?`
}

const PIECE: Partial<Record<Slot, string>> = { story: 'story', hook: 'problem', proof: 'proof', what_it_is: 'what_it_is', close: 'offer', process: 'process', stance: 'stance', objection: 'objection', show_it: 'show_it' }

/** Step 4: exactly two questions (fewer only when every candidate was closed or already answered in meaning). */
export function pickTwo(i: EngineInput): PlanQuestion[] {
  const door = doorOf(i.door)
  const subject = String(i.productName || i.ideaText || '').replace(/\s+/g, ' ').trim().slice(0, 60)
  const topic = [i.ideaText, i.productName, ...(i.pillars ?? [])].filter(Boolean).join(' ')
  const closed = new Set(i.closedKeys ?? [])
  const saved = i.savedAnswers ?? []
  const said = (text: string) => saved.some((a) => overlap(a, text) >= 0.6)
  const out: PlanQuestion[] = []
  const push = (key: string, text: string, kind: QuestionKind, source: QuestionSource, piece: string) => {
    if (out.length >= 2 || closed.has(key) || out.some((q) => q.key === key) || said(text)) return
    out.push({ key, kind, source, piece, text, skippable: true })
  }
  // Q1 — pain
  const pain = fitPain(i.painThemes ?? [], topic)
  if (pain) { const q = painToQuestion(pain); push(q.key, q.text, 'niche', 'pain_map', 'story') }
  // Q2 — gaps, in value order
  const inv = inventory(i)
  for (const slot of GAP_ORDER) {
    const row = inv.find((r) => r.slot === slot && r.status === 'missing')
    if (!row) continue
    push(`mn:gap:${slot}`, gapQuestion(slot, door, subject, i.productKind), slot === 'what_it_is' || slot === 'close' || slot === 'show_it' ? 'product_slot' : 'story',
      row.gap === 'product' ? 'product' : 'her_material', PIECE[slot] ?? slot)
  }
  // Onboarding gap, once
  if (i.profileMissing) push('mn:profile', 'Who is this video for, in one line: who they are and what they want?', 'profile', 'profile', 'audience')
  // Sharpeners when nothing is missing
  push('mn:sharpen:number', `Is there one number you can confirm for ${subject || 'this'}: how many, how long, how much?`, 'story', 'her_material', 'proof')
  push('mn:sharpen:detail', `What's one detail only you would know about ${subject || 'this'}: a place, a name, what you saw?`, 'story', 'her_material', 'story')
  push('mn:sharpen:before_after', `What was it like before, and what is it like now?`, 'story', 'her_material', 'proof')
  return out
}

/** Log record: kinds, sources and pieces; inventory statuses. No text. */
export function enginePlanRecord(i: EngineInput, qs: readonly PlanQuestion[]) {
  return {
    door: doorOf(i.door), asked: qs.length,
    items: qs.map((q) => ({ kind: q.kind, source: q.source, piece: q.piece })),
    inventory: inventory(i).map((r) => ({ slot: r.slot, status: r.status, gap: r.gap })),
  }
}

/** The stage switch: 'off' → nobody; unset → wherever the angle plan already runs (test, panel, canary); 'all' is read by the door gate. */
export function questionEngineOn(stage: string | null | undefined): boolean {
  const s = String(stage ?? '').trim().toLowerCase()
  return !(s === 'off' || s === 'false' || s === '0')
}
