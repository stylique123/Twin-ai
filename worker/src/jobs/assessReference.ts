// READ WHAT A REFERENCE SAID, AND WRITE DOWN ONLY WHAT IT ACTUALLY SAID.
//
// ⚠️ THIS RUNS ~3,946 TIMES WITH NOBODY WATCHING ANY SINGLE RESULT, which is the
// defining property of a batch and the reason almost nothing here trusts the
// model. The prompt asks for a shape; `parseContentExtraction` decides what is
// believable, and it is the shared rule with a parity test rather than a second
// opinion written for the worker.
//
// ⚖️ ONE ROW PER VIDEO, NOT PER GALLERY CARD. `gallery_items` holds 9,504 rows
// over 4,211 URLs — one row per niche placement, a single video appearing up to
// 38 times. Keyed by card this job would transcribe the same video 38 times and
// could store 38 disagreeing answers about one piece of content.
//
// ⚠️ AND A FAILURE IS A ROW, NOT A GAP. A video that cannot be transcribed is
// recorded as such, because otherwise it is indistinguishable from one never
// attempted and every later run pays again to rediscover it.
import { db, type Job } from '../db.js'
import { transcribeFromUrl } from '../media.js'
import { geminiJson } from '../gemini.js'
import { modelForTask } from '../modelRouting.js'
import { parseContentExtraction, NOT_DETERMINED } from '../referenceExtraction.js'

/** How much transcript the model is shown.
 *
 *  ⚠️ THE LONG-FORM HALF IS WHY THIS EXISTS. TikTok transcripts are a few
 *  thousand characters; a 40-minute YouTube video is hundreds of thousands, and
 *  passing one whole would cost more than the answer is worth for a gallery that
 *  sells short-form recreation.
 *
 *  ⚖️ AND IT IS RECORDED WHEN IT BITES, rather than silently truncating. The row
 *  stores `transcript_chars`, so "was this container read off the whole video or
 *  off its first eight minutes" stays answerable — and if the pilot shows the cap
 *  is distorting long-form containers, that is a finding, not a mystery.
 */
const MAX_TRANSCRIPT_CHARS = 24_000

const SYSTEM = `You read one short-form video transcript and report its STRUCTURE.

You are not summarising and you are not reviewing. Another system decides whether
a creator can recreate this video; your only job is to describe what the video is
and what recreating it would REQUIRE.

RULES, and the response is machine-checked against them:
1. Every field is {"value": ..., "evidence": "<a short quote or timestamp from
   the transcript>"}. A value with no evidence is DISCARDED, so a guess costs you
   the field rather than passing as knowledge.
2. If the transcript does not answer a field, return the string "${NOT_DETERMINED}"
   for it. This is a correct answer and is preferred over a plausible one. Do NOT
   fill a field to look complete.
3. Use ONLY the listed vocabularies. A word outside them is discarded.
4. contentSlots is the most important field. Do not describe the topic — name
   what must be SUPPLIED to make a version of this video:
     "3 things I stopped buying after 30"
       -> 3 slots, kind personal_experience, personalExperienceRequired required
     "3 AI tools every founder needs"
       -> 3 slots, kind tool_or_software, productsRequired 3,
          externalFactsRequired required
   A slot's label is its ROLE in the structure (relatable_item, surprising_item,
   strongest_item), never the original's actual content.
5. beats carry startSec/endSec where the transcript has timings, null where it
   does not. Never invent a timestamp.
6. commercial.posture is what the SPEAKER claims about the thing they discuss.
   Say OWN_PRODUCT or OWN_SERVICE only where they speak as its maker ("when we
   built this", "our customers"). Someone enthusiastic about a tool they use is
   not its owner — that is AFFILIATE, SPONSOR or REVIEW_ONLY, and NONE where the
   video sells nothing at all. This field decides whether another creator is
   allowed to recreate the video, so a wrong owner claim hides a good reference
   from them.`

/** The vocabularies, spelled out for the model. Kept beside the prompt because a
 *  list the model cannot see is a list it cannot obey — while the CHECK on it
 *  lives in the shared validator, which is what actually enforces this. */
const SCHEMA = {
  type: 'object',
  properties: {
    topic: { type: 'object' },
    subtopic: { type: 'object' },
    audience: { type: 'object' },
    likelyGoals: { type: 'object' },
    hook: { type: 'object' },
    structure: { type: 'object' },
    requirements: { type: 'object' },
    commercial: { type: 'object' },
    transfer: { type: 'object' },
  },
}

const VOCAB = `Vocabularies:
containerType: numbered_list mistakes confession before_after unpopular_opinion
  tutorial reaction comparison story myth_busting problem_solution prediction
  framework recommendation other
hook.mechanism: question negative_claim curiosity_gap contradiction statistic
  promise story_open direct_address demonstration other
beats[].role: hook setup item turn evidence rehook payoff cta
payoffType: answer reveal summary result none
ctaMechanism: follow comment share save link book buy implicit none
likelyGoals[]: growth authority education conversation leads sales entertainment
audience.sophistication: beginner intermediate advanced mixed
contentSlots[].kind: product tool_or_software personal_experience claim example
  current_fact
personalExperienceRequired / externalFactsRequired: required optional not_required
commercial.posture: OWN_PRODUCT OWN_SERVICE AFFILIATE SPONSOR REVIEW_ONLY NONE
transfer.structureTransferability: high medium low
transfer.topicDependence: low medium high
rehookPosition: an index into beats, or null if the video never re-hooks.
productsRequired: a whole number; 0 is a real answer.`

interface Payload { url?: unknown; platform?: unknown; force?: unknown }

export async function handleAssessReference(job: Job): Promise<Record<string, unknown>> {
  const p = (job.payload ?? {}) as Payload
  const url = typeof p.url === 'string' ? p.url.trim() : ''
  const platform = typeof p.platform === 'string' ? p.platform.trim() : 'unknown'
  if (url === '') throw new Error('assess_reference: payload.url is required')

  // ⚖️ ALREADY DONE IS NOT AN ERROR, IT IS A SKIP. A batch driver that crashes
  // and resumes must not pay twice for the same video, and the cheapest place to
  // enforce that is here rather than in every caller.
  if (p.force !== true) {
    const { data: done } = await db.from('reference_content_profiles')
      .select('url').eq('url', url).is('error', null).maybeSingle()
    if (done) return { url, skipped: 'already_assessed' }
  }

  const assessedAt = new Date().toISOString()

  let transcript
  try {
    transcript = await transcribeFromUrl(url)
  } catch (e) {
    // ⚠️ RECORDED, NOT THROWN. A host the allowlist refuses, a deleted video, a
    // clip with no speech — all are real properties of the library, and the run
    // that discovers them should be the last one that has to.
    const why = e instanceof Error ? e.message : String(e)
    await db.from('reference_content_profiles').upsert({
      url, platform, profile: {}, rejections: [], fields_accepted: 0,
      error: why.slice(0, 500), assessed_at: assessedAt,
    }, { onConflict: 'url' })
    return { url, error: why.slice(0, 200) }
  }

  const full = transcript.text ?? ''
  const text = full.slice(0, MAX_TRANSCRIPT_CHARS)

  const raw = await geminiJson(
    SYSTEM,
    `${VOCAB}\n\nTranscript:\n${text}`,
    SCHEMA,
    90_000,
    undefined,
    modelForTask('extract'),
  )

  const { profile, rejections, fieldsAccepted } = parseContentExtraction(raw, {
    referenceId: url,
    niche: null,
    assessedAt,
    transcriptAvailable: full.trim().length > 0,
  })

  const { error: wrote } = await db.from('reference_content_profiles').upsert({
    url,
    platform,
    schema_version: 1,
    profile,
    rejections,
    fields_accepted: fieldsAccepted,
    transcript_source: transcript.source ?? null,
    paid_because: transcript.paidBecause ?? null,
    transcript_chars: full.length,
    // ⚖️ CLEARED ON SUCCESS. A row that failed once and succeeded later must not
    // keep reporting the old failure, or the resume query re-queues it forever.
    error: null,
    assessed_at: assessedAt,
  }, { onConflict: 'url' })
  if (wrote) throw new Error(`assess_reference: could not store the profile: ${wrote.message}`)

  return {
    url,
    fields_accepted: fieldsAccepted,
    rejected: rejections.length,
    transcript_source: transcript.source ?? null,
    // ⚠️ REPORTED SO THE PILOT CAN COST THE REST OF THE LIBRARY. `paidBecause`
    // present means this video went down a billed route, and the rate across 400
    // is what makes the remaining ~3,500 a number rather than a guess.
    paid_because: transcript.paidBecause ?? null,
    truncated: full.length > MAX_TRANSCRIPT_CHARS,
  }
}
