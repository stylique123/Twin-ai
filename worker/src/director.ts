import { geminiJson, obj, arr, str, num } from './gemini.js'
import type { Transcript } from './media.js'

// The AI Edit Director: instead of word-frequency guessing, it READS the creator's
// script + the spoken transcript and decides — like a human editor — where b-roll
// genuinely helps (with a grounded stock query per moment), what to trim, where to
// punch in, which transitions, and a caption style. Its output enriches the EDL,
// so both the current ffmpeg renderer and the upcoming Revideo engine consume the
// same smart plan. Best-effort: on any failure the caller falls back to heuristics.

export interface EditPlan {
  caption_style: string // bold-pop | clean-lower | karaoke-word | boxed
  broll: { at_sec: number; query: string; reason: string }[] // grounded cutaways
  emphasis_sec: number[] // moments to punch-zoom for emphasis
  trim: { start: number; end: number; reason: string }[] // tangents/rambles to cut beyond silence
  transitions: { at_sec: number; type: string }[] // cut | crossfade | whip | slide
}

const schema = obj(
  {
    caption_style: str,
    broll: arr(obj({ at_sec: num, query: str, reason: str }, ['at_sec', 'query', 'reason'])),
    emphasis_sec: arr(num),
    trim: arr(obj({ start: num, end: num, reason: str }, ['start', 'end', 'reason'])),
    transitions: arr(obj({ at_sec: num, type: str }, ['at_sec', 'type'])),
  },
  ['caption_style', 'broll', 'emphasis_sec', 'trim', 'transitions'],
)

const SYSTEM = `You are a world-class short-form video editor cutting a vertical clip.
You are given the creator's intended SCRIPT and the ACTUAL spoken transcript (timestamped).
Decide the edit like a pro who understands the content — never generic.

- caption_style: pick ONE that fits the energy: "bold-pop" (punchy/hype), "clean-lower" (calm/educational), "karaoke-word" (fast talking), "boxed" (bold claims).
- broll: 2-5 cutaways ONLY where a visual genuinely reinforces what is being SAID at that second. Each needs a SPECIFIC, literal stock-footage query grounded in the words (e.g. "person counting cash", not "money"). at_sec = when it's spoken. Skip if the talking head is better.
- emphasis_sec: 0-4 moments to punch-zoom for emphasis (a key claim, a punchline). Not every sentence.
- trim: spans to CUT beyond silence — tangents, false starts, rambling repeats that hurt pacing. Empty if the take is tight. Be conservative; never cut the hook or payoff.
- transitions: at scene/topic changes only. type = "cut" (default), "crossfade" (soft topic shift), "whip" (energetic), "slide".
Ground every decision in THIS transcript. No filler.`

export async function planEdit(t: Transcript, blueprintText: string): Promise<EditPlan | null> {
  const timed = (t.segments ?? [])
    .slice(0, 120)
    .map((s) => `[${s.start.toFixed(1)}s] ${s.text}`)
    .join('\n')
    .slice(0, 7000)
  if (!timed) return null

  const prompt = `DURATION: ${t.duration_sec}s
SCRIPT (what the creator intended to shoot):
${(blueprintText || '(none provided)').slice(0, 3000)}

ACTUAL TRANSCRIPT (timestamped):
${timed}

Direct the edit.`

  try {
    const plan = (await geminiJson(SYSTEM, prompt, schema, 50_000)) as EditPlan
    // Sanitize: keep only well-formed, in-range entries.
    const dur = t.duration_sec || 1e9
    const inRange = (s: number) => Number.isFinite(s) && s >= 0 && s <= dur + 1
    return {
      caption_style: String(plan.caption_style || 'bold-pop'),
      broll: (plan.broll ?? []).filter((b) => b && b.query && inRange(b.at_sec)).slice(0, 5),
      emphasis_sec: (plan.emphasis_sec ?? []).filter(inRange).slice(0, 4),
      trim: (plan.trim ?? []).filter((x) => x && x.end > x.start && inRange(x.start)).slice(0, 8),
      transitions: (plan.transitions ?? []).filter((x) => x && inRange(x.at_sec)).slice(0, 8),
    }
  } catch {
    return null
  }
}
