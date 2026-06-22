import { geminiJson, obj, arr, str, num } from './gemini.js'
import { env } from './env.js'
import type { Transcript } from './media.js'

// The real structural read of a reference video, derived from its ACTUAL
// transcript (not inferred from a URL). This is what makes "analyze any video"
// literal and fixes the premortem's #1 credibility finding.
export interface ReferenceStructure {
  format_label: string
  hook_window_sec: number
  why_it_works: string[]
  beats: { at_sec: number; beat: string; goal: string }[]
  cta: string
  words_per_min: number
}

const schema = obj(
  {
    format_label: str,
    hook_window_sec: num,
    why_it_works: arr(str),
    beats: arr(obj({ at_sec: num, beat: str, goal: str }, ['at_sec', 'beat', 'goal'])),
    cta: str,
    words_per_min: num,
  },
  ['format_label', 'hook_window_sec', 'why_it_works', 'beats', 'cta', 'words_per_min'],
)

const SYSTEM = `You analyze a short-form video from its real transcript with word timestamps.
Return the STRUCTURE that makes it work — never reproduce its content.
- hook_window_sec: when the hook resolves (usually 1-4s).
- beats: the actual narrative beats with their timestamp (at_sec), what happens, and the retention goal.
- why_it_works: 2-4 specific reasons grounded in THIS transcript (pacing, open loop, payoff timing).
- words_per_min: estimate from the transcript timing.
Be specific to this video. No generic "be authentic" filler.`

export async function deriveStructure(t: Transcript): Promise<ReferenceStructure> {
  // Compact, timestamped transcript so the model reasons over real timing.
  const timed = (t.segments ?? [])
    .slice(0, 80)
    .map((s) => `[${s.start.toFixed(1)}s] ${s.text}`)
    .join('\n')
    .slice(0, 6000)

  // Anchor pacing to a MEASURED words/min from real word timing (Whisper, or
  // interpolated from caption segments for YouTube/Instagram) instead of letting
  // the model guess — pacing is one of the most-copied levers in the blueprint.
  const words = t.words ?? []
  let wpmHint = ''
  if (words.length > 5) {
    const span = words[words.length - 1].end - words[0].start
    if (span > 1) wpmHint = `\nMEASURED words/min: ${Math.round((words.length / span) * 60)}`
  }

  const prompt = `LANGUAGE: ${t.language}
DURATION: ${t.duration_sec}s${wpmHint}
TRANSCRIPT (timestamped):
${timed || '(no speech detected)'}

Derive the structure.`

  return (await geminiJson(SYSTEM, prompt, schema, 60_000, undefined, env.fastModel)) as ReferenceStructure
}
