// PACING MATCHES REALITY (owner's addendum, 2026-09-27).
//
// ⚠️ THE FINDING: a 90-second script with 52 seconds of words "abandons the
// maker in front of rolling cameras". When her hands are busy with the craft she
// cannot read a fast teleprompter, so a beat's time must come from whichever is
// LONGER — the words, or the real physical action — not an even split.
//
// ⚖️ A ROUGH CATEGORY TABLE IS ENOUGH (the addendum's own table). And when the
// action outlasts the words, the beat is marked a QUIET WORKING BEAT on purpose:
// "don't talk here, just work" — honest, not a gap to pad with invented words.

export type ActionKind = 'gesture' | 'turn' | 'set_down' | 'hands_on' | 'multi_step'

/** Rough real durations, seconds (addendum Part 4: midpoint of each range). */
export const ACTION_SECONDS: Readonly<Record<ActionKind, number>> = Object.freeze({
  gesture: 3, turn: 4, set_down: 2.5, hands_on: 11, multi_step: 20,
})

const KINDS: ReadonlyArray<[ActionKind, RegExp]> = [
  ['multi_step', /(?:^|[.;:,]\s*|\b(?:and|then|while|to|start|starts|begin|begins)\s+)(?:unbox\w*|assembl\w*|put(?:s|ting)? (?:it |them )?together|pack(?:s|ing)? (?:up|an order|the order))\b|(?:^|[.;:,]\s*)set(?:s|ting)? up (?:the |your )?(?:tripod|station|table|kit|stand|display|rig)\b/i],
  // ⚠️ A VERB AT THE START OF AN INSTRUCTION, NOT A NOUN. Measured on 38 real
  // scripts: "the bright yellow glaze", "the carved star", "the cutting mat"
  // all read as work. Only an imperative or -ing verb that opens a clause (or
  // follows and / then / while / to / start / keep) counts as hands-on.
  ['hands_on', /(?:^|[.;:,]\s*|\b(?:and|then|while|to|start|starts|keep|keeps|begin|begins)\s+)(?:slowly |carefully |quickly |gently )?(?:trim|carv|cut|fold|apply|appl|mix|knead|sand|glaz|pour|stitch|sew|wip|brush|paint|wrap|measur|roll out|rolling out|throw|whisk|chop|slic|weav|knit|solder|drill|groom|shav|blend|trimm|cutt)(?:e|es|s|ing|ies)?\b/i],
  ['turn', /\b(?:turn(?:s|ing)?|rotat\w*|spin(?:s|ning)?|flip(?:s|ping)?)\b/i],
  ['gesture', /\b(?:hold(?:s|ing)? up|point\w*|gestur\w*|tap(?:s|ping)?|lift(?:s|ing)?|show(?:s|ing)?|rais\w*)\b/i],
  ['set_down', /\b(?:set|put)(?:s|ting)?\b[^.,;]{0,30}?\bdown\b|\bpick(?:s|ing)?\b[^.,;]{0,25}?\bup\b|\bplac(?:e|es|ing)\b/i],
]

/** The longest action a beat's direction describes, or null when none. */
export function actionKind(direction: string | null | undefined): ActionKind | null {
  const t = String(direction ?? '')
  let best: ActionKind | null = null
  for (const [k, re] of KINDS) {
    if (re.test(t) && (best === null || ACTION_SECONDS[k] > ACTION_SECONDS[best])) best = k
  }
  return best
}

/** The verb that makes a beat hands-on, for the sound note ("the trimming"). */
export function handsOnVerb(direction: string | null | undefined): string | null {
  const m = String(direction ?? '').match(KINDS[1][1]) ?? String(direction ?? '').match(KINDS[0][1])
  if (!m) return null
  const w = m[0].toLowerCase().replace(/^[^a-z]+/, '').replace(/^(?:and|then|while|to|start|starts|keep|keeps|begin|begins)\s+/, '')
    .replace(/^(?:slowly|carefully|quickly|gently)\s+/, '').trim()
  return w || null
}

const WPM = 150 // the recorder's natural rate (recordingScript DEFAULT_WPM)
export function spokenSeconds(line: string | null | undefined): number {
  const words = String(line ?? '').trim().split(/\s+/).filter(Boolean).length
  return words === 0 ? 0 : Math.round((words / WPM) * 60 * 10) / 10
}

export interface BeatPacing { index: number; spoken: number; action: number; seconds: number; quiet: boolean }

/** Seconds of hands-busy time beyond the words before a beat is called quiet. */
export const QUIET_SLACK_SEC = 4

export function pacingFor(beats: ReadonlyArray<{ line?: unknown; direction?: unknown; action_posing?: unknown }>): BeatPacing[] {
  return beats.map((b, index) => {
    const dir = `${String(b?.direction ?? '')} ${String(b?.action_posing ?? '')}`
    const k = actionKind(dir)
    const action = k ? ACTION_SECONDS[k] : 0
    const line = typeof b?.line === 'string' ? b.line : ''
    const spoken = spokenSeconds(line)
    // Only real work makes a beat quiet — never a turn or a gesture — and never
    // a beat whose line is not written yet (an open question to her).
    const work = k === 'hands_on' || k === 'multi_step'
    return { index, spoken, action, seconds: Math.max(spoken, action), quiet: work && line.trim() !== '' && action - spoken >= QUIET_SLACK_SEC }
  })
}

/** The instruction added to a quiet working beat's direction. */
export function quietBeatNote(p: BeatPacing, verb: string | null): string {
  const extra = Math.round(p.action - p.spoken)
  return `Quiet working beat (about ${extra}s after the words): don't talk here, just work. We'll add the sound of ${verb ? `the ${verb.replace(/s$/, '')}` : 'your hands and the material'} under this section.`
}

/** The writer's rule, with the addendum's table. */
export const PACING_RULE = [
  '',
  '',
  'PACING MATCHES THE REAL ACTION: a beat lasts as long as whichever is longer — the spoken line at a natural pace, or the physical action it directs. Rough real durations: hold up / point / gesture 2-4s; turn or rotate to show another side 3-5s; set down / pick up 2-3s; a genuine hands-on task (trim, carve, cut, fold, apply, mix) 8-15s; a multi-step demonstration (unbox, assemble) 15-25s.',
  '- When a hands-on action takes longer than the words, either give that beat proportionally more to say (only true things), or make it a quiet working beat on purpose — never leave silence with no instruction, and never pad it with invented detail.',
  "- Set each beat_plan target_sec from this, not from dividing the target length evenly.",
].join('\n')
