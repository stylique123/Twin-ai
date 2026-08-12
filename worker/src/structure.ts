import { geminiJson, obj, arr, str, num, bool, oneOf } from './gemini.js'
import { modelForTask } from './modelRouting.js'
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
  /** ── WHAT THE REFERENCE DEPENDS ON, AS OPPOSED TO WHAT IT DOES ───────────
   *
   * ⚠️ THE GATE HAD NO DATA, AND THAT IS WHY IT WAS NEVER CALLED.
   * `compatibilityGate` decides which dimensions of a reference may transfer to
   * a creator — it is written, tested, and had no production caller, because
   * its primary input (`observed: ReferenceDimension[]`) was produced by
   * NOTHING. Every field below exists to supply it.
   *
   * ⚖️ AND THIS IS THE PASS THAT ALREADY RUNS. A reference read happens at
   * INGEST, before generation, which is exactly where a decision about what may
   * transfer belongs. Adding a second model call to ask four more questions
   * about a transcript already in hand would be a new cost for an answer this
   * call is one schema field away from giving.
   *
   * ⚠️ ABSENT IS NOT FALSE, and the gate depends on that. Transcripts derived
   * before this field existed have no `observations` key, and the gate reads a
   * missing dimension as NOT_OBSERVED — "we never measured this, so we have no
   * opinion to carry across". Defaulting them to `false` would assert that
   * hundreds of already-read references demonstrate no product, which is a
   * claim nobody made. */
  observations?: ReferenceObservations
}

export interface ReferenceObservations {
  /** Does the video put a product on screen? */
  shows_product: boolean
  /** Does it make claims ABOUT that product — as opposed to merely showing it?
   *  Separate from `shows_product` because an unboxing shows without claiming
   *  and a talking-head can claim without showing, and the two transfer under
   *  different rules. */
  makes_product_claims: boolean
  /** Is the format carried by b-roll, such that removing it removes the video? */
  broll_heavy: boolean
  /** Delivery register. `null` when the transcript alone cannot tell — silence
   *  here is honest; guessing it would compare the creator against a coin flip. */
  energy: 'high' | 'calm' | null
}

const schema = obj(
  {
    format_label: str,
    hook_window_sec: num,
    why_it_works: arr(str),
    beats: arr(obj({ at_sec: num, beat: str, goal: str }, ['at_sec', 'beat', 'goal'])),
    cta: str,
    words_per_min: num,
    // ⚖️ REQUIRED IN THE SCHEMA, OPTIONAL IN THE TYPE. Required here so the
    // model cannot answer three of four and leave the fourth to a default;
    // optional on the interface because rows derived before today genuinely
    // have none, and a reader must be able to tell those apart from a video
    // that was read and found to show nothing.
    observations: obj(
      {
        shows_product: bool,
        makes_product_claims: bool,
        broll_heavy: bool,
        // `energy` is nullable in the type but a plain enum here: a JSON schema
        // that permits null invites the model to take it for every video, and
        // "the transcript cannot tell" is a judgement it should have to make
        // rather than a hiding place. Absent-because-old is the null case, and
        // that arrives from history, not from this call.
        energy: oneOf(['high', 'calm']),
      },
      ['shows_product', 'makes_product_claims', 'broll_heavy', 'energy'],
    ),
  },
  ['format_label', 'hook_window_sec', 'why_it_works', 'beats', 'cta', 'words_per_min', 'observations'],
)

const SYSTEM = `You analyze a short-form video from its real transcript with word timestamps.
Return the STRUCTURE that makes it work — never reproduce its content.
- hook_window_sec: when the hook resolves (usually 1-4s).
- beats: the actual narrative beats with their timestamp (at_sec), what happens, and the retention goal.
- why_it_works: 2-4 specific reasons grounded in THIS transcript (pacing, open loop, payoff timing).
- words_per_min: estimate from the transcript timing.
- observations: what this video DEPENDS ON, which decides what another creator could reuse. Answer about THIS video, not about the format in general:
  * shows_product: is a product physically on screen, held, worn, or demonstrated?
  * makes_product_claims: does it state what a product does, costs, or achieves? Showing a thing is not claiming about it.
  * broll_heavy: would removing the cutaway footage remove the video? A talking-head with two illustrative cuts is NOT b-roll heavy; a montage is.
  * energy: "high" for fast, loud, escalating delivery; "calm" for measured, conversational delivery. Judge the delivery, not the topic.
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

  // EXTRACT: mechanical, schema-constrained. Resolves to the same id
  // env.fastModel resolved to; the class is what records why it may differ.
  return (await geminiJson(SYSTEM, prompt, schema, 60_000, undefined, modelForTask('extract'))) as ReferenceStructure
}
