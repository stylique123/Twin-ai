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
import { parseRoute, stickySessionId, type DownloadRoute } from '../downloadRoute.js'
import { env } from '../env.js'
import { transcribeFromUrl } from '../media.js'
import { geminiJson } from '../gemini.js'
import { modelForTask } from '../modelRouting.js'
import { parseContentExtraction, NOT_DETERMINED, NO_REHOOK } from '../referenceExtraction.js'
import { frameSampleTargets } from '../referenceProfileTypes.js'
import { runVisualPass } from '../visualPass.js'
import { tierZeroColumns } from '../referenceTierZeroPass.js'
import { readCachedTranscript, writeCachedTranscript } from '../transcriptCache.js'
import { decideRouting, goesToFrames } from '../transcriptRouting.js'
import { classifyReferenceFailure, isFetchDefect } from './referenceOutcome.js'
import { recordRoutingDecision } from '../transcriptRoutingRecord.js'

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
export const MAX_TRANSCRIPT_CHARS = 24_000

/** Below this, there is no speech worth reading.
 *
 *  ⚖️ 120 CHARACTERS IS ROUGHLY ONE SENTENCE. A video with less than that is
 *  music, dance or text-on-screen — real content, but not content a TRANSCRIPT
 *  pass can read. The frames pass is what would see it, and saying so is more
 *  useful than an eighteen-field rejection list that looks like a model failure. */
const MIN_TRANSCRIPT_CHARS = 120

// ⚠️ EXPORTED SO THE PARITY EVAL ASKS THE EXACT SAME QUESTION. A second copy of
// the prompt, schema or vocabulary would make an A/B measure the copy rather
// than production — the same "derived vs re-declared" error that put a wrong
// NOT_DETERMINED sentinel in the visual prompt and filed every honest refusal
// as malformed.
export const SYSTEM = `You read one short-form video transcript and report its STRUCTURE.

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

/**
 * The response shape, fully specified.
 *
 * ⚠️ THIS IS A `responseSchema`, NOT A HINT. Gemini returns ONLY what the schema
 * describes, so the first version — every field declared `{ type: 'object' }`
 * with no inner properties — gave it no shape to fill and it returned empty
 * objects. The pilot's first four videos came back with all eighteen fields
 * `saw: "undefined"`, which read exactly like "the model refused to answer" and
 * was in fact "the request never asked".
 *
 * ⚖️ SO EVERY FIELD IS SPELLED OUT, INCLUDING ITS ENUM. That does double duty:
 * the model cannot return a word outside the vocabulary in the first place, and
 * `parseContentExtraction` still rejects one if it does. A schema and a check
 * are not redundant here — the schema shapes the request, the check defends
 * against the response.
 */
const ASSESSED = (valueSchema: unknown): unknown => ({
  type: 'object',
  properties: { value: valueSchema, evidence: { type: 'string' } },
  required: ['value', 'evidence'],
})
const STR = { type: 'string' }
const enumOf = (values: readonly string[]): unknown => ({ type: 'string', enum: values })

export const SCHEMA = {
  type: 'object',
  properties: {
    topic: ASSESSED(STR),
    subtopic: ASSESSED(STR),
    audience: {
      type: 'object',
      properties: {
        likelySegment: ASSESSED(STR),
        sophistication: ASSESSED(enumOf(['beginner', 'intermediate', 'advanced', 'mixed'])),
      },
    },
    likelyGoals: ASSESSED({
      type: 'array',
      items: enumOf(['growth', 'authority', 'education', 'conversation', 'leads', 'sales', 'entertainment']),
    }),
    hook: {
      type: 'object',
      properties: {
        mechanism: ASSESSED(enumOf(['question', 'negative_claim', 'curiosity_gap', 'contradiction',
          'statistic', 'promise', 'story_open', 'direct_address', 'demonstration', 'other'])),
        promise: ASSESSED(STR),
      },
    },
    structure: {
      type: 'object',
      properties: {
        containerType: ASSESSED(enumOf(['numbered_list', 'mistakes', 'confession', 'before_after',
          'unpopular_opinion', 'tutorial', 'reaction', 'comparison', 'story', 'myth_busting',
          'problem_solution', 'prediction', 'framework', 'recommendation', 'other'])),
        beats: ASSESSED({
          type: 'array',
          items: {
            type: 'object',
            properties: {
              role: enumOf(['hook', 'setup', 'item', 'turn', 'evidence', 'rehook', 'payoff', 'cta']),
              startSec: { type: 'number' },
              endSec: { type: 'number' },
              summary: STR,
            },
            required: ['role', 'summary'],
          },
        }),
        // ⚠️ NO `null` IN A responseSchema. `{ type: 'integer' }` left the model
        // no way to say "this video never re-hooks", so it omitted the field or
        // invented a negative — 15 of 35 pilot videos, all filed as model
        // failures. -1 is the sentinel that makes the answer sayable.
        rehookPosition: ASSESSED({ type: 'integer' }),
        payoffType: ASSESSED(enumOf(['answer', 'reveal', 'summary', 'result', 'none'])),
        ctaMechanism: ASSESSED(enumOf(['follow', 'comment', 'share', 'save', 'link', 'book', 'buy',
          'implicit', 'none'])),
      },
    },
    requirements: {
      type: 'object',
      properties: {
        contentSlots: ASSESSED({
          type: 'array',
          items: {
            type: 'object',
            properties: {
              kind: enumOf(['product', 'tool_or_software', 'personal_experience', 'claim',
                'example', 'current_fact']),
              label: STR,
            },
            required: ['kind', 'label'],
          },
        }),
        personalExperienceRequired: ASSESSED(enumOf(['required', 'optional', 'not_required'])),
        productsRequired: ASSESSED({ type: 'integer' }),
        externalFactsRequired: ASSESSED(enumOf(['required', 'optional', 'not_required'])),
      },
    },
    commercial: {
      type: 'object',
      properties: {
        posture: ASSESSED(enumOf(['OWN_PRODUCT', 'OWN_SERVICE', 'AFFILIATE', 'SPONSOR',
          'REVIEW_ONLY', 'NONE'])),
      },
    },
    transfer: {
      type: 'object',
      properties: {
        structureTransferability: enumOf(['high', 'medium', 'low']),
        topicDependence: ASSESSED(enumOf(['low', 'medium', 'high'])),
        reasons: { type: 'array', items: STR },
      },
    },
  },
}

export const VOCAB = `Vocabularies:
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
  An EMPTY contentSlots list is a real answer: it means a version of this video
  needs nothing supplied. Give the evidence for that as you would for any value.
personalExperienceRequired / externalFactsRequired: required optional not_required
commercial.posture: OWN_PRODUCT OWN_SERVICE AFFILIATE SPONSOR REVIEW_ONLY NONE
transfer.structureTransferability: high medium low
transfer.topicDependence: low medium high
rehookPosition: an index into beats, or ${NO_REHOOK} if the video never
  re-hooks. ${NO_REHOOK} is a real answer, and most short videos deserve it.
productsRequired: a whole number; 0 is a real answer.`

/**
 * Is an already-done row reason enough to skip this request?
 *
 * ⚠️ "ALREADY ASSESSED" USED TO MEAN ONE THING: THE TRANSCRIPT SUCCEEDED. That
 * was correct for the batch this job was built for — same job, same request
 * shape, replayed after a crash. FIX 13's gallery-curation trigger asks a
 * DIFFERENT question of the SAME job type: "does this URL have a visual pass
 * yet", fired automatically the moment a reference is curated. A row with a
 * successful transcript but no `visual_profile` answers that question NO, and
 * the old skip answered it YES anyway — silently, with no error to notice by,
 * for every gallery item the free transcript batch had already reached. That
 * is most of the library.
 *
 * ⚖️ SO THE SKIP NARROWS TO "NOTHING THIS REQUEST ASKS FOR IS MISSING", not
 * "something ran once". A plain re-run (no `frames`) still skips exactly as
 * before — the cost guard this exists for is untouched. A `frames: true`
 * request only skips once a `visual_profile` is actually on the row.
 */
export function shouldSkipAlreadyAssessed(
  done: { visual_profile?: unknown } | null | undefined,
  framesRequested: boolean,
): boolean {
  if (!done) return false
  if (!framesRequested) return true
  return done.visual_profile !== null && done.visual_profile !== undefined
}

interface Payload {
  url?: unknown; platform?: unknown; force?: unknown; route?: unknown
  /** ⚠️ OPT-IN, AND EXACTLY `true`. The frames pass costs a SECOND download —
   *  the transcript ladder pulls bestaudio and frames need pixels — so nothing
   *  about the 3,000-row backlog changes unless somebody asks for it on purpose.
   *  A truthy-but-not-true value (the string "false", 1, {}) must not enable
   *  spending; the same rule `parseRoute` follows for the paid rungs. */
  frames?: unknown
  /** How many stills. Absent means DEFAULT_FRAME_COUNT — the pilot's job is to
   *  argue with that number, not this file's. */
  frameCount?: unknown
}

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
      .select('url, visual_profile').eq('url', url).is('error', null).maybeSingle()
    if (shouldSkipAlreadyAssessed(done, p.frames === true)) {
      return { url, skipped: 'already_assessed', outcome: 'assessed' as const }
    }
  }

  // ⚠️ READ BEFORE WE OVERWRITE IT. transcript_chars is the number the OLD
  // metadata claimed, and the upsert below replaces it. Reading it afterwards
  // would compare the fresh figure against itself and report zero drift on
  // every row — a diagnostic that always agrees, which is the same as no
  // diagnostic. `null` here means "no stored count", not "stored zero".
  const { data: priorRow } = await db.from('reference_content_profiles')
    .select('transcript_chars').eq('url', url).maybeSingle()
  const storedCharsBefore = typeof priorRow?.transcript_chars === 'number'
    ? priorRow.transcript_chars
    : null

  const assessedAt = new Date().toISOString()

  // ⚠️ THE ROUTE COMES FROM THE JOB, AND DEFAULTS TO THE FREE RUNG. An
  // unreadable or absent route resolves to `local_impersonated` — a malformed
  // payload must never be the reason we start paying for residential egress.
  const route = parseRoute(p.route)

  // ⚠️ A RETRY MUST NOT RE-DOWNLOAD THE VIDEO. The worker retries this whole
  // function, so a Gemini refusal — the thing that failed 145 jobs on a 250-call
  // daily quota — used to re-download and re-transcribe up to four more times to
  // reach the same wall. What was said in the video is a FACT and does not
  // change; only our opinion about it is worth retrying.
  //
  // ⚖️ `force` BYPASSES THIS, and that is the whole point of `force`: it means
  // "do it all again", including the acquisition. A caller who suspects the
  // transcript itself is wrong has exactly one flag to reach for.
  let transcript
  const cached = p.force === true ? null : await readCachedTranscript(url)
  if (cached) {
    console.log(JSON.stringify({ event: 'transcript_cache_hit', url,
      chars: cached.chars, captured_at: cached.capturedAt }))
  }
  try {
    transcript = cached ? cached.transcript : await transcribeFromUrl(url, route)
  } catch (first) {
    // ── ONE ESCALATION, FOR THE ONE FAILURE A DIFFERENT IP ACTUALLY FIXES ──
    //
    // ⚠️ THE PAID RUNG EXISTED AND HAD NEVER RUN. Measured on production
    // 2026-08-30: of 780 assessed references, 481 went `local_impersonated`,
    // 299 recorded no route, and `residential_proxy` was used ZERO times. The
    // rung is fully built -- argv, sticky session, a refusal to downgrade
    // silently, its own enum value in 0150 -- and nothing ever asked for it,
    // because the route arrives in the JOB PAYLOAD and no caller sets it. So 48
    // references died on "Your IP address is blocked" while the tool built
    // precisely to defeat an IP block sat unused.
    //
    // ⚖️ ONLY `blocked_by_host`, AND THAT NARROWNESS IS THE DESIGN. Residential
    // egress is metered per GB. An IP block is the one class where the video is
    // fine, the binary is fine, and the single thing wrong is which address
    // asked -- so it is the one class where a different address is the remedy
    // rather than a hope. A proxy cannot re-parse a page (`extractor_stale`),
    // cannot undelete a video (`source_gone`), and cannot put speech into a
    // silent one (`no_speech`). Escalating those would spend money to fail
    // identically, one rung more expensively.
    //
    // ⚖️ ONCE, AND NEVER FROM THE PAID RUNG. If the residential attempt fails we
    // record that failure, not a third try: the point is to learn whether IP
    // reputation was the wall, and a loop would turn one measurement into an
    // open-ended bill.
    let e = first
    const firstClass = classifyReferenceFailure(first instanceof Error ? first.message : String(first))
    const canEscalate = firstClass === 'blocked_by_host'
      && route.kind === 'local_impersonated'
      && env.apifyProxyPassword.trim() !== ''
    if (canEscalate) {
      // ⚖️ STICKY ON THE URL, so a retry of the same video reuses the same exit
      // address rather than rolling a fresh one and confounding the answer.
      const escalated: DownloadRoute = { kind: 'residential_proxy', sessionId: stickySessionId(url) }
      console.log(JSON.stringify({ event: 'download_route_escalated', url,
        from: 'local_impersonated', to: 'residential_proxy', because: firstClass }))
      try {
        transcript = await transcribeFromUrl(url, escalated)
      } catch (second) {
        e = second
      }
    }
    // ⚠️ THE ESCALATION MAY HAVE WORKED, and the rest of this catch assumes it
    // did not. Falling through with a transcript in hand would record a failure
    // for a video we just successfully read.
    if (transcript) {
      console.log(JSON.stringify({ event: 'download_route_escalation_succeeded', url }))
    }
    if (!transcript) {
    // ⚠️ RECORDED, NOT THROWN. A host the allowlist refuses, a deleted video, a
    // clip with no speech — all are real properties of the library, and the run
    // that discovers them should be the last one that has to.
    const why = e instanceof Error ? e.message : String(e)
    // ⚠️ WHERE IT STOPPED, NOT JUST THAT IT DID. The trace rides on the thrown
    // error from the download itself, because only that code knows the phase,
    // the elapsed time and how many bytes actually landed. Absent for non-TikTok
    // routes, which have their own paths and their own reasons.
    const trace = (e as { trace?: unknown }).trace ?? null
    await db.from('reference_content_profiles').upsert({
      url, platform, profile: {}, rejections: [], fields_accepted: 0,
      // ⚠️ CLEARED, NOT LEFT ALONE — THIS ONE COST A WRONG CONCLUSION. An upsert
      // only writes the columns it names, so a failure used to leave the
      // transcript columns from a PREVIOUS run standing beside a fresh error.
      // Three recovered rows then read "1021 chars, local_whisper, plus an
      // error", which looks like a partial success and is not: the download
      // threw and nothing was transcribed. It was read that way, out loud,
      // before the code said otherwise.
      transcript_chars: null, transcript_source: null, download_route: null,
      // ⚖️ THE TRACE SURVIVES A FAILURE — it is the ONLY thing that does. Clearing
      // it here alongside the transcript columns would delete the evidence the
      // canary exists to collect.
      download_trace: trace,
      error: why.slice(0, 500), assessed_at: assessedAt,
    }, { onConflict: 'url' })
    // ⚠️ THE JOB SUCCEEDS AND THE REFERENCE IS UNUSABLE, AND BOTH ARE TRUE.
    // Measured 2026-08-30: 154 of 1,188 `assess_reference` jobs ended here, and
    // a queue-level count of failures saw NONE of them -- it reported 227 when
    // the real number was 381. The swallow above is right and stays (see
    // `referenceOutcome.ts`); what was missing was a field to count.
    //
    // ⚖️ `outcome` IS THE COUNT AND `reasonClass` IS THE DIAGNOSIS. One says
    // whether an assessment exists, which is what a health check needs; the
    // other says what to do about it, which is what a person needs. `error`
    // stays exactly as it was so nothing reading it today breaks.
    const reasonClass = classifyReferenceFailure(why)
    return {
      url,
      error: why.slice(0, 200),
      outcome: 'unusable' as const,
      reasonClass,
      // Whether OUR fetching is at fault, as opposed to the video genuinely
      // having nothing in it. This is the figure to watch before spending a
      // backlog on downloads.
      fetchDefect: isFetchDefect(reasonClass),
      }
    }
  }

  // ⚖️ WRITTEN BEFORE ANYTHING CAN FAIL AFTER IT. The no-speech branch, the
  // model call and the profile write all sit below this line, and every one of
  // them is a way to end this attempt — so storing the transcript at the first
  // moment it exists is what makes the retry cheap rather than merely intended.
  if (!cached) await writeCachedTranscript(url, transcript)

  const full = transcript.text ?? ''

  // ⚠️ THE TRANSCRIPT IN HAND DECIDES, NOT THE NUMBER WE REMEMBER. #66 proved
  // stored transcript_chars does not predict a fresh acquisition — 133 stored
  // came back as 5, and a stored-"substantial" reference also fell under the
  // floor. So the routing decision is computed from what we actually have, and
  // the disagreement with the stored figure is RECORDED rather than swallowed.
  const routing = decideRouting({
    url,
    transcriptText: full,
    storedChars: storedCharsBefore,
    platform,
    downloadRoute: transcript.downloadRoute ?? null,
    source: transcript.source ?? null,
    thresholdChars: MIN_TRANSCRIPT_CHARS,
  })
  // ⚖️ BEST EFFORT, LIKE EVERY OTHER MEASUREMENT ON THIS PATH. A drift record
  // that could fail an assessment would make the diagnostic more dangerous than
  // the defect it diagnoses.
  await recordRoutingDecision(routing)

  // ⚠️ A SILENT VIDEO IS A FINDING, NOT A QUESTION FOR A MODEL. The pilot's
  // first results included transcripts of three and five characters — music-led
  // TikToks with no speech. Sending those to Gemini spends a call to be told
  // nothing, on a library where they may be common. Recorded as assessed with a
  // reason, so the next run does not pay to rediscover them.
  //
  // ⚖️ AND IT IS A DESTINATION, NOT A BIN. `visual_route` says the frames pass
  // (#56) can still read this reference. The 332 known no-speech rows plus this
  // one are a population, not a graveyard.
  if (goesToFrames(routing)) {
    // ⚠️ AND THE PILOT IS THE ONLY THING THAT ACTUALLY LOOKS, FOR NOW. Until
    // this branch, `visual_route` was a label and nothing else: the row was
    // marked and the function returned, so the 332 no-speech references were a
    // graveyard with an optimistic sign on the gate. The frames pass only runs
    // when a job ASKS for it.
    //
    // ⚖️ OPT-IN, BECAUSE LOOKING COSTS A SECOND DOWNLOAD. Making this
    // unconditional would turn every no-speech assessment into a paid visual
    // pass across the whole library — turning "label a pilot" into "reprocess
    // everything", which is the decision the pilot exists to inform rather than
    // pre-empt.
    //
    // ⚠️ NO BEATS HERE, AND THAT IS NOT A DEGRADED CASE. There is no content
    // profile on this path, so there are no hook/rehook/payoff timestamps and
    // the schedule is `uniform`. The row records which arm it was, so the pilot
    // can say whether uniform frames support weaker claims rather than assuming
    // it.
    const visual = p.frames === true ? await runVisualPass(url, route, {
      count: typeof p.frameCount === 'number' ? p.frameCount : undefined,
    }) : null

    await db.from('reference_content_profiles').upsert({
      url, platform, profile: {}, rejections: [], fields_accepted: 0,
      transcript_source: transcript.source ?? null,
      paid_because: transcript.paidBecause ?? null,
      // ⚖️ A SILENT VIDEO STILL COST WHATEVER ITS DOWNLOAD COST. Leaving the
      // route off no_speech rows would under-count paid routing by exactly the
      // bucket that is 85 rows wide.
      download_route: transcript.downloadRoute ?? null,
      download_trace: transcript.trace ?? null,
      transcript_chars: full.length,
      error: `no_speech: transcript was ${routing.actualChars} characters (visual_route)`,
      assessed_at: assessedAt,
      // ⚠️ OUTSIDE THE `ran` GATE, DELIBERATELY. Tier 0 is measured before the
      // model call precisely so it survives the model failing; folding it into
      // `visual?.ran` would discard it on exactly the runs it exists for.
      ...tierZeroColumns(visual?.tier_zero, assessedAt),
      // ⚠️ WRITTEN ONLY WHEN THE PASS RAN, so `null` keeps meaning "nobody
      // looked" rather than "looked and saw nothing". Those are different facts
      // and the pilot's attrition report depends on telling them apart.
      ...(visual?.ran === true ? {
        visual_profile: visual.visual_profile,
        visual_rejections: visual.visual_rejections,
        frames_sampled: visual.frames_sampled,
        frame_schedule_basis: visual.frame_schedule_basis,
        visual_assessed_at: assessedAt,
        // ⚖️ CLEARED ON SUCCESS, because a success and a failure are not both
        // true. A re-run that worked must not leave the old code beside the new
        // frames for a later count to guess between; the 0162 check refuses that
        // row anyway, so clearing it here is what makes the retry legal.
        visual_failure_code: null,
      } : visual !== null ? {
        // ⚠️ A PASS THAT TRIED AND COULD NOT IS NOT A PASS NOBODY RAN. Without
        // this the row is byte-identical to a reference nobody looked at, and
        // the pilot's attrition table cannot tell a missing ffmpeg from a
        // blocked download from a job that never ran — three different next
        // actions, one number.
        visual_failure_code: visual.failure_code,
        // ⚠️ AND `visual_assessed_at` IS DELIBERATELY NOT STAMPED. frame-pilot
        // selects candidates with `!r.visual_assessed_at`, so stamping it on a
        // failure would permanently exclude a reference that failed for a
        // TRANSIENT reason — an IP block that lifts an hour later — and the
        // eligible population would shrink silently. The code says what
        // happened; the absent timestamp says it is still worth another try.
      } : {}),
    }, { onConflict: 'url' })
    return {
      // ⚖️ ASSESSED, NOT UNUSABLE. The video was fetched and read; it simply had
      // no speech, and it goes down the visual route rather than nowhere. The
      // fetch worked, so counting this against fetching would be a lie -- see
      // `no_speech` in `referenceOutcome.ts`.
      outcome: 'assessed' as const,
      url, skipped: 'no_speech', routed_to: 'visual_route',
      transcript_chars: full.length, actual_chars: routing.actualChars,
      stored_chars: routing.storedChars, delta_chars: routing.deltaChars,
      // ⚖️ THREE STATES, NOT TWO. `not_requested` is not the same as a pass that
      // ran, nor as one that tried and could not — and an attrition table that
      // merged them would report the pilot's cost as its yield.
      frames: visual === null ? 'not_requested' : visual.ran ? 'ran' : 'failed',
      frames_failure: visual?.failure_code ?? null,
    }
  }

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

  // ⚠️ THE FRAMES PASS RUNS AFTER THE CONTENT PASS, NOT BESIDE IT, because it
  // reads the content pass's OUTPUT. `frameSampleTargets` turns the beats into
  // the timestamps worth looking at — the hook, the rehook, the payoff — and it
  // is the reader that justifies storing `Beat.startSec` at all. Sampling four
  // arbitrary percentages while those timestamps sat in the same function would
  // strand the field and buy worse frames.
  //
  // ⚖️ AND IT NEVER FAILS THE JOB. `runVisualPass` throws for nothing: an
  // unavailable video, no samplable frames and a model that answered rubbish are
  // all rows. A transcript that succeeded must not be discarded because the
  // second pass had a bad day — that is the `0143_a_failure_may_not_erase_a_
  // success` rule, applied one layer up.
  const visual = p.frames === true
    ? await runVisualPass(url, route, {
        count: typeof p.frameCount === 'number' ? p.frameCount : undefined,
        at: frameSampleTargets(profile),
      })
    : null

  const { error: wrote } = await db.from('reference_content_profiles').upsert({
    url,
    platform,
    schema_version: 1,
    profile,
    rejections,
    fields_accepted: fieldsAccepted,
    // ⚠️ OUTSIDE THE `ran` GATE — see the no-speech write above. The numbers off
    // the file are the whole point on a run where the model refused.
    ...tierZeroColumns(visual?.tier_zero, assessedAt),
    // ⚠️ WRITTEN ONLY WHEN THE PASS RAN. A pass that could not look leaves these
    // null and does NOT stamp `visual_assessed_at`, so a later run knows to try
    // again — "we looked and learned nothing" and "we never looked" are
    // different rows, and 97% of the library is the second one.
    ...(visual?.ran
      ? {
          visual_profile: visual.visual_profile,
          visual_rejections: visual.visual_rejections,
          frames_sampled: visual.frames_sampled,
          frame_schedule_basis: visual.frame_schedule_basis,
          visual_assessed_at: assessedAt,
          // Cleared on success: a success and a failure are not both true, and
          // the 0162 check refuses a row that claims both.
          visual_failure_code: null,
        }
      : visual !== null
        ? {
            // ⚠️ THE CODE, BUT STILL NO TIMESTAMP. Same reason as the no-speech
            // path: the stamp is what excludes a reference from a later pass,
            // and a transient block must not exclude anything permanently.
            visual_failure_code: visual.failure_code,
          }
        : {}),
    transcript_source: transcript.source ?? null,
    paid_because: transcript.paidBecause ?? null,
    transcript_chars: full.length,
    // ⚖️ CLEARED ON SUCCESS. A row that failed once and succeeded later must not
    // keep reporting the old failure, or the resume query re-queues it forever.
    error: null,
    assessed_at: assessedAt,
    download_route: transcript.downloadRoute ?? null,
    download_trace: transcript.trace ?? null,
  }, { onConflict: 'url' })
  if (wrote) throw new Error(`assess_reference: could not store the profile: ${wrote.message}`)

  return {
    outcome: 'assessed' as const,
    url,
    fields_accepted: fieldsAccepted,
    rejected: rejections.length,
    transcript_source: transcript.source ?? null,
    // ⚠️ REPORTED SO THE PILOT CAN COST THE REST OF THE LIBRARY. `paidBecause`
    // present means this video went down a billed route, and the rate across 400
    // is what makes the remaining ~3,500 a number rather than a guess.
    paid_because: transcript.paidBecause ?? null,
    truncated: full.length > MAX_TRANSCRIPT_CHARS,
    // ⚠️ REPORTED EVEN WHEN IT DID NOT RUN, and with the reason. A pilot that
    // can only see successes cannot tell "frames are not worth it" from "frames
    // never got a chance", which is the difference between a decision and a
    // shrug.
    ...(visual === null ? {} : {
      visual_ran: visual.ran,
      frames_sampled: visual.frames_sampled,
      frame_schedule_basis: visual.frame_schedule_basis,
      visual_failure_code: visual.failure_code,
    }),
  }
}
