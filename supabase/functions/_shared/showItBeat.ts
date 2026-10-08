// GENERATED FROM packages/shared/src/script/showItBeat.ts — DO NOT EDIT.
// Run: node scripts/ci/generate_shared_pilot_core.mjs
// Edit the source instead. CI regenerates this file and fails on a diff.
// @ts-nocheck
/**
 * SHOW IT (owner 2026-10-08, trial): a sales video for a product she has and
 * can put on camera must SHOW it somewhere — and the shot list must say so.
 *
 * Two pure decisions, made AFTER the final beats and cameras are decided:
 *   1. `enforceShowItBeat` — if no beat already has a showing job, retag the
 *      best existing beat (never the hook, never the ask) as the showing beat.
 *   2. `applyCloseUpShots` — every shot whose beat has a showing job becomes a
 *      `close_up` (back camera: hands, the product, the screen).
 *
 * ⚖️ DIRECTION, NEVER FACT. The spoken line is never touched and no prop is
 * added: only the beat's job, camera and filming direction change. A product
 * she does not have, cannot show, or whose ownership is unknown is never
 * enforced.
 */
import { SHOWING_JOBS, SHOWN_JOB_SHOT, normalizeShownJob, type ShownJob } from './shownJob.ts'

/** Kinds shown on a screen: their showing job is the result on screen. */
export const SCREEN_KINDS: ReadonlySet<string> = new Set(['SAAS', 'APP', 'DIGITAL_PRODUCT', 'COURSE', 'COMMUNITY'])
/** Kinds the trial gives the short software block (~25s, payoff-first). */
export const SOFTWARE_BLOCK_KINDS_TRIAL: ReadonlySet<string> = new Set(['SAAS', 'APP', 'DIGITAL_PRODUCT', 'COURSE', 'COMMUNITY'])
/** Kinds the base software block already reaches (productCategory). */
const BASE_SOFTWARE_KINDS: ReadonlySet<string> = new Set(['SAAS', 'APP', 'DIGITAL_PRODUCT'])
export const SOFTWARE_TARGET_SEC = 25

/** Relationships that establish she actually has the thing. Affiliate, sponsor, review-only and none do not. */
const OWNING = new Set(['OWN_PRODUCT', 'OWN_SERVICE', 'PERSONAL_USE'])
const SHOW_GOALS = new Set(['sell', 'educate', 'leads'])

export interface ShowItEntity {
  type?: unknown
  showability?: unknown
  relationship?: unknown
  personal_use?: unknown
  name?: unknown
}

/** true = she has it; false = recorded as not hers; null = unknown. Only `true` enforces. */
export function ownsEntity(e: ShowItEntity | null | undefined): boolean | null {
  if (!e) return null
  const rel = String(e.relationship ?? '').trim().toUpperCase()
  if (OWNING.has(rel)) return true
  if (String(e.personal_use ?? '').toUpperCase() === 'CONFIRMED') return true
  return rel ? false : null
}

/** The showing job for this kind of product. */
export function showJobFor(kind: unknown): ShownJob {
  return SCREEN_KINDS.has(String(kind ?? '').toUpperCase()) ? 'app_payoff' : 'demo'
}

export interface ShowItBeatIn { line?: unknown; section?: unknown; shown_job?: unknown; camera?: unknown; direction?: unknown; [k: string]: unknown }

export type ShowItReason =
  | 'no_entity' | 'not_showable_kind' | 'not_showable' | 'not_owned' | 'goal' | 'already_shown' | 'no_candidate' | 'retagged'

export interface ShowItResult<T> { script: T[]; retagged: 0 | 1; reason: ShowItReason; index: number | null }

const isHook = (b: ShowItBeatIn, pos: number) => pos === 0 || /\bhook\b/i.test(String(b.section ?? ''))
const isCta = (b: ShowItBeatIn) =>
  normalizeShownJob(b.shown_job, b.section) === 'cta' || /\b(cta|call to action|ask|close|closing|outro)\b/i.test(String(b.section ?? ''))

const STOP = new Set(['the', 'and', 'with', 'from', 'your', 'this', 'that', 'have', 'just', 'what', 'they', 'them', 'will', 'into', 'about', 'more', 'than', 'were', 'when', 'which'])

/** Words that tie a line to the product: its name, plus the fact words given. */
export function productWords(name: unknown, facts: readonly unknown[] = []): string[] {
  const out = new Set<string>()
  const add = (s: unknown, min: number) => {
    for (const w of String(s ?? '').toLowerCase().replace(/\(.*?\)/g, ' ').split(/[^a-z0-9]+/)) {
      if (w.length >= min && !STOP.has(w)) out.add(w)
    }
  }
  add(name, 4)
  for (const f of facts) add(f, 5)
  return [...out]
}

/**
 * Retag one beat as the show-it beat when a showable, owned product in a sales
 * video has none. Returns new beat objects; never mutates; never changes `line`.
 */
export function enforceShowItBeat<T extends ShowItBeatIn>(
  script: readonly T[],
  opts: { entity: ShowItEntity | null | undefined; goal: unknown; words: readonly string[] },
): ShowItResult<T> {
  const same = (reason: ShowItReason): ShowItResult<T> => ({ script: [...script], retagged: 0, reason, index: null })
  const e = opts.entity
  if (!e) return same('no_entity')
  const kind = String(e.type ?? '').toUpperCase()
  if (kind !== 'PHYSICAL_PRODUCT' && !SCREEN_KINDS.has(kind)) return same('not_showable_kind')
  const show = String(e.showability ?? '').toUpperCase()
  if (show !== 'ALWAYS' && show !== 'SOMETIMES') return same('not_showable')
  if (ownsEntity(e) !== true) return same('not_owned')
  if (!SHOW_GOALS.has(String(opts.goal ?? '').trim().toLowerCase())) return same('goal')
  const spoken = script.map((b, i) => (b && typeof b === 'object' && String(b.line ?? '').trim() ? i : -1)).filter((i) => i >= 0)
  if (spoken.some((i) => SHOWING_JOBS.has(normalizeShownJob(script[i]!.shown_job, script[i]!.section)))) return same('already_shown')
  const words = opts.words.map((w) => w.toLowerCase()).filter(Boolean)
  const mentions = (line: string) => {
    const toks = new Set(line.toLowerCase().split(/[^a-z0-9]+/))
    return words.some((w) => toks.has(w) || (w.length >= 5 && toks.has(w.replace(/s$/, ''))))
  }
  let at = -1
  spoken.forEach((i, pos) => {
    if (at >= 0) return
    const b = script[i]!
    if (isHook(b, pos) || isCta(b)) return
    if (mentions(String(b.line))) at = i
  })
  if (at < 0) return same('no_candidate')
  const job = showJobFor(kind)
  const out = script.map((b, i) => (i === at ? { ...b, shown_job: job, camera: 'back', direction: SHOWN_JOB_SHOT[job] } : b))
  return { script: out, retagged: 1, reason: 'retagged', index: at }
}

export interface ShotIn { spoken_text?: unknown; shot_type?: unknown; framing?: unknown; notes?: unknown; camera?: unknown; [k: string]: unknown }

/** Shots whose beat has a showing job become `close_up` (back camera), described from SHOWN_JOB_SHOT. */
export function applyCloseUpShots<S extends ShotIn>(shots: readonly S[], script: readonly ShowItBeatIn[]): { shots: S[]; closeUps: number } {
  const byLine = new Map<string, ShowItBeatIn>()
  for (const b of script) if (b && typeof b.line === 'string' && b.line.trim()) byLine.set(b.line.trim(), b)
  let closeUps = 0
  const out = shots.map((sh) => {
    if (!sh || sh.shot_type === 'cover_frame') return sh
    const beat = typeof sh.spoken_text === 'string' ? byLine.get(sh.spoken_text.trim()) : undefined
    if (!beat) return sh
    const job = normalizeShownJob(beat.shown_job, beat.section)
    if (!SHOWING_JOBS.has(job)) return sh
    closeUps += 1
    return { ...sh, shot_type: 'close_up', camera: 'back', framing: `Back camera · ${SHOWN_JOB_SHOT[job]}` }
  })
  return { shots: out, closeUps }
}

/** Whether the trial adds the software block for this kind (beyond the base reach). */
export function trialSoftwareBlockExtends(kind: unknown): boolean {
  const k = String(kind ?? '').toUpperCase()
  return SOFTWARE_BLOCK_KINDS_TRIAL.has(k) && !BASE_SOFTWARE_KINDS.has(k)
}

/** The trial's 25s target for software-like kinds, only when she picked no length. */
export function trialSoftwareTarget(kind: unknown, picked: unknown): number | null {
  if (picked !== undefined && picked !== null && picked !== '') return null
  return SOFTWARE_BLOCK_KINDS_TRIAL.has(String(kind ?? '').toUpperCase()) ? SOFTWARE_TARGET_SEC : null
}

/** Trial prompt lines for the shot list: a third type for showing beats. */
export const CLOSE_UP_SHOT_RULE =
  `- shot_type: specify 'talking_head' (camera on creator speaking), 'cover_frame' (the thumbnail image/first frame), or 'close_up' (the BACK camera on her hands, the product or its screen) for a beat whose shown_job is ${[...SHOWING_JOBS].join(', ')}. close_up is still HER scene, filmed by her while she talks — never an insert or cutaway she would have to source, and never a prop she did not give.`
export const CLOSE_UP_SHOT_LIST_RULE =
  `Every shot is the creator on camera, a back-camera close_up of a showing beat, or the cover frame — never an insert or cutaway they would have to source.`
