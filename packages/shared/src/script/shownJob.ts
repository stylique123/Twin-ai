/**
 * THE SHOWN HALF OF A BEAT (owner spec, 2026-10-01 — "Twin needs a shown
 * script, not just a spoken script").
 *
 * Every beat now declares what the CAMERA is doing for it, not only what is
 * said. The job decides the default shot (the spec's table 3.4) and lets the
 * finished script be checked: a sales script with a showable product must
 * show it in use somewhere; a demonstration must not be framed exactly like a
 * talking beat; the location should follow what each beat does.
 *
 * ⚖️ DIRECTION, NEVER FACT. A job says how to film. It never licenses a
 * sensory claim, a prop or a place she did not give.
 */

export const SHOWN_JOBS = [
  'reveal', 'demo', 'sensory', 'talk', 'process', 'app_payoff', 'story_emotion', 'claim', 'cta',
] as const
export type ShownJob = (typeof SHOWN_JOBS)[number]

/** What the creator reads on the scene card. Plain words. */
export const SHOWN_JOB_LABEL: Record<ShownJob, string> = {
  reveal: 'Reveal — first look at it',
  demo: 'Show it in use',
  sensory: 'Close-up detail',
  talk: 'Talking to camera',
  process: 'Making / doing it',
  app_payoff: 'The result on screen',
  story_emotion: 'The feeling in the story',
  claim: 'Your strongest point',
  cta: 'The ask',
}

/** The spec's table 3.4: the default shot for each job. */
export const SHOWN_JOB_SHOT: Record<ShownJob, string> = {
  reveal: 'Clean, centred, steady — the thing alone in frame',
  demo: 'Close, hands in frame — from your own point of view if you can',
  sensory: 'Extreme close-up, held a beat longer than feels natural',
  talk: 'Medium shot of you, hands free to picture what you say',
  process: 'Hands actively working, real time — imperfection is fine',
  app_payoff: 'The screen showing the result, then a quick shot of your reaction',
  story_emotion: 'Closer than the beat before, let your face carry it',
  claim: 'Lean in, eyes on the lens',
  cta: 'Back to you, direct to the lens, simple background',
}

/** Jobs that SHOW the product doing something, not just present. */
export const SHOWING_JOBS: ReadonlySet<ShownJob> = new Set(['demo', 'sensory', 'process', 'app_payoff'])

export function isShownJob(v: unknown): v is ShownJob {
  return typeof v === 'string' && (SHOWN_JOBS as readonly string[]).includes(v)
}

/** A missing or unreadable job falls back from the beat's section, never to a claim it did not make. */
export function normalizeShownJob(raw: unknown, section: unknown): ShownJob {
  const r = String(raw ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (isShownJob(r)) return r
  const s = String(section ?? '').toLowerCase()
  if (/\b(cta|call to action|ask|close|closing|outro)\b/.test(s)) return 'cta'
  if (/\b(demo|demonstration|in use|how it works)\b/.test(s)) return 'demo'
  if (/\b(reveal|unbox)\b/.test(s)) return 'reveal'
  return 'talk'
}

export interface ShownBeat { line?: unknown; shown_job?: unknown; section?: unknown; location?: unknown; direction?: unknown; action_posing?: unknown }

export interface ShownAudit {
  jobs: ShownJob[]
  /** Criterion 1: a sales script with a showable product shows it in use. Null when not required. */
  showsInUse: boolean | null
  /** Criterion 6: how many distinct locations the speaking beats use. */
  distinctLocations: number
  /** Criterion 7: a showing beat framed identically to a talking beat. */
  showingFramedLikeTalk: number
  /** Criterion 5: generic gesture direction ("gesture naturally"). */
  genericGestures: number
}

const GENERIC_GESTURE = /\b(gesture|move|talk) (naturally|freely|casually)\b|\bnatural (gestures?|energy|movement)\b|\buse (your )?hands\b(?! to)/i

const norm = (v: unknown) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ')

/** Measures the shown half of a finished script against the spec's success criteria. */
export function auditShownScript(beats: readonly ShownBeat[], opts: { sellsShowable: boolean }): ShownAudit {
  const jobs = beats.map((b) => normalizeShownJob(b.shown_job, b.section))
  const showsInUse = opts.sellsShowable ? jobs.some((j) => SHOWING_JOBS.has(j)) : null
  const locations = new Set(beats.map((b) => norm(b.location)).filter(Boolean))
  const talkFraming = new Set(beats.filter((_, i) => jobs[i] === 'talk').map((b) => `${norm(b.location)}|${norm(b.direction)}`))
  const showingFramedLikeTalk = beats.filter((b, i) => SHOWING_JOBS.has(jobs[i]!) && talkFraming.has(`${norm(b.location)}|${norm(b.direction)}`)).length
  const genericGestures = beats.filter((b) => GENERIC_GESTURE.test(String(b.action_posing ?? ''))).length
  return { jobs, showsInUse, distinctLocations: locations.size, showingFramedLikeTalk, genericGestures }
}

/** The prompt rule that asks for the field. */
export const SHOWN_JOB_RULE = [
  `- shown_job: what the CAMERA does for this beat — exactly one of ${SHOWN_JOBS.join(' | ')}.`,
  `  reveal = the thing appears; demo = it in use, hands in frame; sensory = a close-up of a real`,
  `  quality she gave (never invent one); talk = her to camera; process = making or doing it;`,
  `  app_payoff = the result on a screen; story_emotion = the feeling in a story; claim = the`,
  `  strongest point; cta = the ask. Pick by what the beat DOES. A video that promotes a product`,
  `  she can show needs at least one demo, process, sensory or app_payoff beat. A video with no`,
  `  product uses talk / story_emotion / claim / cta — and still directs the body.`,
].join('\n')
