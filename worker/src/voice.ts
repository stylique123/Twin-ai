import { geminiJson, obj, arr, str, type InlineImage } from './gemini.js'
import type { ScrapedPost } from './media.js'

// Re-synthesize a creator's brand voice from their ACTUAL spoken transcripts
// (not just captions). This closes the premortem's #2 finding: the voice now
// reflects how they really talk on camera. Schema mirrors the edge function's
// voiceProfileSchema so the shape the frontend confirm-card renders is unchanged.
export interface VoiceProfile {
  summary: string
  niche: string
  tone: string
  pacing: string
  hook_style: string
  hook_patterns: string[]
  vocabulary: string[]
  recurring_ctas: string[]
  pov: string[]
  enemy: string
  dos: string[]
  donts: string[]
  sample_hooks: string[]
  voiced_from_audio?: boolean
}

const schema = obj(
  {
    summary: str,
    niche: str,
    tone: str,
    pacing: str,
    hook_style: str,
    hook_patterns: arr(str),
    vocabulary: arr(str),
    recurring_ctas: arr(str),
    pov: arr(str),
    enemy: str,
    dos: arr(str),
    donts: arr(str),
    sample_hooks: arr(str),
  },
  ['summary', 'niche', 'tone', 'pacing', 'hook_style', 'hook_patterns', 'vocabulary', 'recurring_ctas', 'pov', 'enemy', 'dos', 'donts', 'sample_hooks'],
)

const SYSTEM = `You are TwinAI's Brand-DNA engine. You are given VERBATIM TRANSCRIPTS of how a creator
actually speaks on camera — the strongest possible signal for their voice.
- Capture how THEY talk: tone, pacing, real sentence rhythm, signature words/phrases, how they open and close.
- vocabulary = 4-8 actual words/phrases they really say. sample_hooks = 3 fresh hooks in their exact spoken style.
- hook_patterns = 2-3 DISTINCT opener moves they actually use on camera, each with a real example from the transcripts (contrarian claim / number drop / confession / direct callout). This is what makes their hooks theirs, not a template.
- pov = the 2-3 BELIEFS or contrarian takes they repeat out loud, and enemy = the conventional wisdom or bad advice they argue against. Spoken delivery is where a creator's real stance comes through, so weight it heavily. Never invent a stance the transcripts do not support.
- dos/donts = practical guardrails to stay on-voice. Keep every string short, concrete, creator-specific. No generic filler.`

export async function synthesizeVoiceFromAudio(
  handle: string,
  platform: string,
  transcripts: string[],
): Promise<VoiceProfile> {
  const corpus = transcripts
    .map((t, i) => `--- VIDEO ${i + 1} (spoken) ---\n${t}`)
    .join('\n\n')
    .slice(0, 12000)

  const prompt = `CREATOR: @${handle} on ${platform}
SPOKEN TRANSCRIPTS (how they actually talk):
${corpus}

Synthesize this creator's voice profile from how they really speak.`

  const profile = (await geminiJson(SYSTEM, prompt, schema, 40_000)) as VoiceProfile
  profile.voiced_from_audio = true
  return profile
}

// Full caption-based DNA synth, mirroring the edge function's synthesizeVoice so a
// yt-dlp-scraped TikTok voice has the SAME shape + quality as an Apify-scraped one
// (same schema, same SYSTEM, same reach-ranked corpus, same DNA thinking budget).
const postsSchema = obj(
  {
    summary: str,
    niche: str,
    sub_niche: str,
    audience: str,
    audience_pain: str,
    dream_outcome: str,
    offer: str,
    tone: str,
    pacing: str,
    hook_style: str,
    hook_patterns: arr(str),
    editing_style: str,
    vocabulary: arr(str),
    recurring_ctas: arr(str),
    pov: arr(str),
    enemy: str,
    dos: arr(str),
    donts: arr(str),
    sample_hooks: arr(str),
    formats: arr(str), // 3-5 recurring VIDEO archetypes/formats this creator makes
    title_style: str, // their title formula
    thumbnail_style: str, // their thumbnail conventions
    // The creator's brand palette as #RRGGBB hex — mirrors the edge function's
    // synthesizeVoice schema so TikTok voices get the same brand_kit auto-fill.
    brand_colors: obj({ primary: str, secondary: str, highlight: str }, []),
  },
  ['summary', 'niche', 'sub_niche', 'audience', 'audience_pain', 'dream_outcome', 'offer', 'tone', 'pacing', 'hook_style', 'hook_patterns', 'formats', 'title_style', 'thumbnail_style', 'vocabulary', 'recurring_ctas', 'pov', 'enemy', 'dos', 'donts', 'sample_hooks'],
)

const POSTS_SYSTEM = `You are TwinAI's Brand-DNA engine. From a creator's recent posts you infer how THEY sound, so we can later write new scripts in their exact voice.

Hard rules:
- Describe their voice; never copy a specific post's content. Capture STRUCTURE and STYLE: tone, pacing, hook shape, signature vocabulary, recurring CTAs.
- niche = the BROAD category (e.g. Fitness, Personal Finance, Fashion Tech, Food). sub_niche = the SPECIFIC angle within it that makes them distinct and is what their audience actually searches for (e.g. calisthenics for beginners, debt payoff for couples, AI virtual try-on, high-protein meal prep). Keep sub_niche to 2-4 words, concrete and searchable, never a sentence.
- LEARN FROM THEIR WINNERS. The posts are ranked by reach, best first; the ones marked [TOP PERFORMER] are their biggest hits. Weight those hardest. What a creator's TOP posts do (the angle, the hook move, the emotional register) is what actually works for THEIR audience. Average posts dilute the signal, so let the winners lead.
- hook_style must be their repeatable HOOK FORMULA written as a reusable fill-in template derived from their best openers, e.g. "[surprising number] + [who it is for] + comment [KEYWORD]" or "I did [X] so you do not have to. Here is what happened." Not adjectives, an actual template someone could fill in.
- hook_patterns = the 2-3 DISTINCT opener MOVES this creator actually uses (a real creator has several, not one). Name each move and include a real example lifted from their captions, e.g. "Contrarian claim — 'Everyone is wrong about protein timing'", "Number drop — '3 lifts that fixed my back'", "Confession — 'I wasted 2 years doing this'", "Direct callout — 'If you train fasted, stop'". These let us write 5 hooks that feel different instead of one template five times.
- POV = the 2-3 recurring BELIEFS or contrarian takes they repeat (the "thing they always say"), and enemy = the conventional wisdom, bad advice, or villain they push against. This is what makes their content unmistakably THEIRS: two creators with identical tone differ by what they believe and what they attack. Extract both from the posts, never invent a stance the captions do not support.
- Also infer their AUDIENCE (who they make content for), that audience's core PAIN (the problem they feel), their DREAM OUTCOME (what they actually want), and the creator's OFFER (what they sell or the action they push). Infer these from the posts, bio, hashtags and niche even when not stated outright. Be specific, not generic.
- Be concrete and specific to this creator — no generic "be authentic" filler. Every field should be unmistakably about THIS creator and useless for anyone else.
- vocabulary = 4-8 actual words/phrases they lean on, lifted from their real captions. sample_hooks = 3 fresh hooks written the way THEY would write one, each drawing on a DIFFERENT hook_pattern and using their vocabulary.
- dos/donts = practical guardrails for staying on-voice. Keep every string short.
- COMPLETENESS IS MANDATORY. This profile is the ONLY thing we use to write every future script in this creator's voice, so it must be COMPLETE — never return an empty array or a blank/"unspecified"/"n/a" string for any field. Fill EVERY field: give at least 3 hook_patterns, at least 2 pov beliefs, a concrete enemy, and a specific audience, audience_pain, dream_outcome, offer and sub_niche. When the captions are thin, INFER each of these honestly from the niche, bio, hashtags, vocabulary and what similar creators in this exact space do — a confident, specific inference is far more useful than a blank. The only thing you may not invent is a false factual claim or a stance the content actively contradicts; a plausible on-niche stance is expected, not optional.
- formats = the 3 to 5 recurring VIDEO archetypes this creator actually makes (their playbook), named concretely (e.g. "before/after transformation", "myth-busting listicle", "reaction teardown"). title_style = their title/caption FORMULA in one line. thumbnail_style = their thumbnail conventions in one line (composition, big text, expression, colors). These let us adapt ONE of their real formats and match their packaging, not a generic one.
- brand_colors = this creator's brand palette as #RRGGBB hex: primary (their dominant brand color), secondary (a supporting color), highlight (the punchy accent best for caption emphasis). When sample post images are attached, READ the palette straight from the imagery — the real, recurring colors you actually SEE across their posts (backgrounds, graphics, wardrobe, product, logo), not a guess. Pick the colors that define their look, not incidental ones (skin tones, plain white/black unless that truly IS the brand). With no images, infer from niche, aesthetic and visual cues in the captions/bio. Return real, distinct, legible hex values (the highlight must read clearly as bright caption text on video). If you truly cannot tell, return an empty object.`

// Deterministic safety net (mirrors the edge _shared/dna.ts) so a synthesized
// profile is NEVER thin: derive hook_patterns from the creator's own hooks and
// fall back audience/sub_niche to the niche, guaranteeing the FIRST generation is
// on-voice. Only derives from signal the creator actually gave; never fabricates.
function enrichVoiceProfile(raw: Record<string, unknown>, handle: string, platform: string): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') return raw
  const asArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).map((x) => (x as string).trim()) : [])
  const asStr = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
  const niche = asStr(raw.niche)
  const sampleHooks = asArr(raw.sample_hooks)
  let hookPatterns = asArr(raw.hook_patterns)
  if (hookPatterns.length < 2 && sampleHooks.length) {
    hookPatterns = Array.from(new Set([...hookPatterns, ...sampleHooks.map((h) => `Their own opener — "${h}"`)])).slice(0, 5)
  }
  return {
    ...raw,
    sub_niche: asStr(raw.sub_niche) || niche,
    audience: asStr(raw.audience) || (niche ? `people into ${niche}` : `@${handle}'s audience on ${platform}`),
    vocabulary: asArr(raw.vocabulary),
    hook_patterns: hookPatterns,
    pov: asArr(raw.pov),
    recurring_ctas: asArr(raw.recurring_ctas),
    dos: asArr(raw.dos),
    donts: asArr(raw.donts),
    sample_hooks: sampleHooks,
    formats: asArr(raw.formats),
  }
}

export async function synthesizeVoiceFromPosts(
  handle: string,
  platform: string,
  posts: ScrapedPost[],
  bio = '',
  images: InlineImage[] = [],
): Promise<Record<string, unknown>> {
  // Rank by reach so the model studies their WINNERS first (mirrors the edge synth).
  const ranked = [...posts].sort((a, b) => (b.plays || b.likes) - (a.plays || a.likes)).slice(0, 25)
  const corpus = ranked
    .map((p, i) => {
      const r = p.plays || p.likes
      const reach = r ? ` (${r.toLocaleString()} views/likes)` : ''
      const tags = p.hashtags.length ? ` [#${p.hashtags.join(' #')}]` : ''
      const tier = i < 5 && r ? ' [TOP PERFORMER]' : ''
      return `${i + 1}.${tier}${reach} ${p.text}${tags}`
    })
    .join('\n')

  const visionNote = images.length
    ? `\n\n${images.length} sample post image(s) are attached below. Read brand_colors from the ACTUAL imagery — the real, recurring brand colors you SEE across them.`
    : ''
  const prompt = `CREATOR: @${handle} on ${platform}
${bio ? `PROFILE BIO: ${bio}\n` : ''}RECENT POSTS (caption/text + hashtags + rough reach):
${corpus || '(no captions available — infer a sensible starting voice from the handle, bio, and platform)'}

Synthesize this creator's voice profile.${visionNote}`

  // DNA-specific thinking budget (A/B-proven lossless), matching the edge function.
  const budget = Number(process.env.DNA_THINKING_BUDGET ?? process.env.GEMINI_THINKING_BUDGET ?? '4096')
  const profile = (await geminiJson(POSTS_SYSTEM, prompt, postsSchema, 60_000, budget, undefined, images)) as Record<string, unknown>
  return enrichVoiceProfile(profile, handle, platform)
}

// ── CREATOR KNOWLEDGE: WHAT THEY KNOW, NOT HOW THEY SOUND ─────────────────
//
// `synthesizeVoiceFromAudio` above reads the same transcripts and is told, in
// its own words, to "capture how THEY talk". It does that well. Nothing then
// asked what they SAID, and the transcripts were discarded — `voice.ts`'s caller
// persisted `audio_transcripts: <count>` and dropped the text. That is the
// founding defect at its source: the richest substance in the system, fetched,
// used once for tone, and deleted.
//
// ⚖️ THIS RUNS ON TRANSCRIPTS ALREADY IN MEMORY AND PERSISTS NO SPEECH. It
// returns short distilled claims; the caller writes those and lets the raw text
// fall out of scope. `creator_knowledge.text` is CHECK-capped at 240 characters
// so the schema itself refuses to become a transcript store.
//
// ⚖️ AND IT IS ALLOWED TO RETURN NOTHING. The DNA extractor beside it is told
// "COMPLETENESS IS MANDATORY … a confident, specific inference is far more
// useful than a blank", which is why `pov` and `enemy` are never empty and never
// trustworthy. Here an empty list is the correct answer for a creator who spent
// five videos saying nothing checkable, and `basis` records how we know each
// item rather than flattening all of them into assertion.
const knowledgeSchema = obj(
  {
    items: {
      type: 'ARRAY',
      items: obj(
        {
          kind: { type: 'STRING' },
          text: { type: 'STRING' },
          basis: { type: 'STRING' },
          times_seen: { type: 'STRING' },
          confidence: { type: 'STRING' },
          source_video: { type: 'STRING' },
          // ⚖️ DELIBERATELY NOT REQUIRED. An item that cost nothing and argues
          // with nobody is the ordinary case, and forcing a value here would
          // manufacture a price for every errand the creator ran.
          cost: { type: 'STRING' },
          consensus: { type: 'STRING' },
        },
        ['kind', 'text', 'basis', 'times_seen', 'confidence', 'source_video'],
      ),
    },
  },
  ['items'],
)

const KNOWLEDGE_SYSTEM = `You are TwinAI's Creator Knowledge engine. You are given VERBATIM TRANSCRIPTS of a creator speaking on camera. Another system already captured HOW they talk. Your job is the opposite and you must not duplicate it: record WHAT THEY KNOW AND HAVE SAID.
- Never describe delivery. Tone, pacing, energy and vocabulary are somebody else's field and are wrong answers here.
- Each item is ONE line, at most 240 characters, in plain words. It is a distillate, never a quotation, and never a passage copied out of a transcript.
- kind is exactly one of: fact (checkable, and true independently of them), opinion (a position they hold, theirs and contestable), topic (something they return to), example (a concrete case they used), experience (something they personally did), framework (a repeatable method they teach), claim (an assertion carrying a number or outcome), product (a product they mentioned or worked with), covered (a subject they have already made a video about).
- FACT AND OPINION ARE DIFFERENT KINDS, and choosing between them is part of the job. "USB-C is reversible" survives being attributed to anybody; "megapixels are oversold" is a stance. Filing a stance as a fact is how a creator ends up sounding more certain than they have ever been.
- basis is exactly one of: stated (they said it outright), demonstrated (they showed it or acted on it without saying it), inferred (you are reasoning past what they said).
- NAME THE THINGS. A creator's value to their audience is in SPECIFICS, so record the actual named products, models, tools, companies and features they talk about — "the 200 megapixel sensor", "foldable hinges", "Notion", "the M4 iPad" — as "product" items, and keep the real name inside every other item too. "Megapixels are oversold" is a stance and worth recording; "phones shipping 200MP sensors that lose to a three-year-old iPhone" is the same stance with the thing it is ABOUT still attached, and only the second one lets a script say something their audience did not already know. Never generalise a named thing into a category to sound tidier. AND A BARE NAME IS NOT AN ITEM. "Todoist" and "M4 iPad Pro" record that a word was said and nothing else; a "product" item must carry WHAT THEY SAID ABOUT IT — "still pays for Todoist because nothing else handles natural-language dates", "recommends the M4 iPad Pro only in 512GB, where the extra RAM is". A name with no verdict attached is as useless to a script as an opinion with no name attached, and it is the same mistake pointing the other way.
- BE HONEST WITH basis AND DO NOT ROUND IT UP. Only "stated" and "demonstrated" are ever put back into this creator's mouth; "inferred" is used to steer and is never spoken. Marking a guess as stated is how a script tells someone's audience that they said something they did not say.
- times_seen is how many of the supplied videos carried it, as a digit.
- confidence is how sure YOU are that this is really what they meant, as a decimal between 0 and 1. It is a different question from basis: basis is HOW you know, confidence is HOW WELL. A remark you heard clearly but only once is "stated" with a middling confidence. Do not round it up to 1 to look decisive.
- source_video is the number of the VIDEO this came from, as a digit matching the "--- VIDEO n ---" headings below. Where an item appears in several, give the first. A creator correcting an item needs to be able to go and watch the thing you read it out of.
- TWO OPTIONAL FIELDS RECORD THE HALF OF A SENTENCE THIS EXTRACTOR HAS ALWAYS DROPPED. Both are usually empty, and an empty one is the normal, correct, unpenalised answer. Fill them only when the creator SAID the thing.
- cost — fill ONLY on an item where they said what it COST THEM: money, months, a job, a client, a launch, a thing they had to undo. "$40,000 of inventory that never sold", "lost the client", "two years". A lesson with a price on it is the most useful thing a creator can hand a script, and dropping the price is how a lesson gets recorded as flat biography: "Currently works at Microsoft" is what gets written when nobody asked what anything cost. If they described doing something but never said what it cost, LEAVE cost EMPTY. Do not price it for them, do not restate the effort as a cost, and do not call an ordinary activity expensive so the field has something in it.
- consensus — fill ONLY on an item where they NAMED a belief other people hold and then contradicted it. Record THE OTHER SIDE, in their framing: "most people think you need 10,000 followers before you can sell anything", "the standard advice is to post daily". The item's own text stays THEIR position; consensus is what they are arguing AGAINST. A stance stored without it — "believes chai is better than coffee" — has lost the half that made it an argument. A PREFERENCE OR A COMPARISON IS NOT A CONSENSUS: "true success is inner peace rather than accumulating wealth" ranks two things the creator likes differently and names nobody who believes otherwise, so its consensus is EMPTY. If they did not say what the other side believes, LEAVE consensus EMPTY.
- NEITHER FIELD CHANGES kind, AND NEITHER IS A NEW kind. A costly lesson is still an "experience"; a stance with a named consensus is still an "opinion". File every item exactly as you do now — these two fields add the missing half, they do not re-file anything, and the plain biographical and named-product items must keep coming out exactly as before.
- BOTH FIELDS OBEY EVERY RULE ABOVE. Fill them from what was actually said and never from what would merely be plausible, keep the real names inside them, and never round basis up because an item now carries a cost.
- RETURN AN EMPTY LIST IF THE TRANSCRIPTS CARRY NO SUBSTANCE. That is a real and useful answer. Do NOT pad it, do NOT invent positions that would merely be plausible for someone in this niche, and do NOT convert a generic remark into a belief to have something to write.`

export interface RawKnowledgeItem {
  kind: string
  text: string
  basis: string
  times_seen: string
  /** How sure the extractor is, 0-1 as a string. See `confidence` in
   *  `packages/shared/src/creatorKnowledge.ts` — an absent one reads as 0.5,
   *  never as 1. */
  confidence: string
  /** Which "--- VIDEO n ---" it was read out of, so the caller can map it back
   *  to a real URL. Provenance a creator can act on beats an opaque id. */
  source_video: string
  /** What the thing COST them, when they said so. Absent is the normal case. */
  cost?: string
  /** The belief they NAMED and argued against, when they named one. Absent is
   *  the normal case. */
  consensus?: string
}

/** Distil what a creator knows from what they said. Returns raw rows for the
 *  caller to validate through `readKnowledge` — this function does not decide
 *  what is storable, it only asks. */
/**
 * CAPTIONS ARE EVIDENCE OF A DIFFERENT KIND, and the difference decides `basis`.
 *
 * ⚠️ WHY THIS EXISTS. Knowledge came only from up to five transcribed videos, so
 * a channel with 4,500 uploads contributed five. Captions and titles are already
 * scraped for every post, cost nothing extra, and are the densest source of
 * NAMED THINGS in the system — "I bought the Samsung Z Fold 8" is a product and
 * a covered topic in six words.
 *
 * ⚖️ BUT A TITLE IS A PROMISE, NOT A STATEMENT. "I bought the Z Fold 8" proves
 * they made a video about that phone. It does NOT prove what they concluded
 * about it, and treating a headline as a position is exactly how a guess becomes
 * a quote. So this asks for `covered` and `product` freely — both are facts a
 * title genuinely carries — and refuses to file an opinion as `stated` from a
 * caption alone, because nobody heard them say it.
 */
const CAPTION_SYSTEM = `You are TwinAI's Creator Knowledge engine, reading CAPTIONS AND TITLES rather than speech. Another system already captured how this creator talks. Record WHAT THEIR VIDEOS ARE ABOUT.
- A TITLE IS A PROMISE, NOT A STATEMENT. "I bought the Samsung Z Fold 8" tells you they covered that phone. It does NOT tell you what they concluded about it. Never write a conclusion a caption does not contain.
- Because of that: use kind "covered" for a subject they have clearly made a video about, and kind "product" for a named product, model or tool they featured. Use "topic" for a subject they return to across several titles.
- DO NOT emit "opinion", "claim" or "fact" from a caption unless the caption ITSELF states it outright ("megapixels are overrated" in the title is a stance; "I bought the new iPhone" is not).
- basis is "demonstrated" for anything read from a title — they demonstrably made the video — and "stated" ONLY when the caption spells the position out in words. Never "stated" from a headline that merely names a thing.
- CARRY THE TITLE'S ANGLE, NOT JUST ITS NOUN. Titles contain more than a product name and you must keep what is there: "I bought Samsung's PASSPORT SIZED foldable" carries a descriptor, "fixing the phone Google doesn't want you to buy (FAIL)" carries both a framing and an outcome, and "the most unique Samsung phone" carries a judgement. Record "took apart the Z Fold 8, Samsung's passport-sized foldable" rather than "Samsung Z Fold 8". A bare product name is NOT an item — it records that a word was said and nothing else, which is as useless to a script as a vague opinion with no product attached.
- DO NOT emit the same subject twice as both "product" and "covered". Pick the one the title is really about: "covered" when the video is a treatment of the subject, "product" when it is the thing being featured.
- times_seen is how many captions carried it, as a digit. confidence 0 to 1 as a decimal. source_video is the caption's number as a digit.
- RETURN AN EMPTY LIST IF THE CAPTIONS CARRY NOTHING. Engagement bait, "link in bio" and pure hype are not knowledge.`

/** Distil what a creator's CAPTIONS say their videos are about. Same row shape
 *  as the audio extractor, validated by the same reader. */
export async function extractKnowledgeFromCaptions(
  handle: string,
  platform: string,
  captions: string[],
): Promise<RawKnowledgeItem[]> {
  const usable = captions.map((c) => String(c ?? '').trim()).filter((c) => c.length > 8)
  if (!usable.length) return []
  const corpus = usable.slice(0, 120)
    .map((c, i) => `--- CAPTION ${i + 1} ---\n${c}`).join('\n')
    .slice(0, 12000)
  const prompt = `CREATOR: @${handle} on ${platform}
CAPTIONS AND TITLES:
${corpus}

Record what these videos are about, what products they name, and what subjects are already covered.`
  try {
    const out = (await geminiJson(CAPTION_SYSTEM, prompt, knowledgeSchema, 40_000)) as { items?: RawKnowledgeItem[] }
    return Array.isArray(out?.items) ? clampCaptionBasis(out.items) : []
  } catch {
    // Enrichment, never a gate — same rule as the audio extractor above.
    return []
  }
}

/**
 * A TITLE IS A PROMISE, AND THE MODEL WILL NOT STOP ROUNDING IT UP.
 *
 * ⚠️ MEASURED, NOT SUSPECTED. On 2026-08-11 this extractor was run over 86 real
 * titles from four real channels. Three channels came back correctly — Johnny
 * 22/22 `demonstrated`, Jeremy 23/23, Carter 13/14 — and Nathan Espinoza came
 * back with 12 of 25 marked `stated`, every one of them a declarative-sounding
 * headline:
 *
 *   "Siri is ACTUALLY Good Now"
 *   "Tesla Self-Driving is Better Than You Think"
 *   "The TRUTH About Meta Glasses"
 *
 * Those are titles. Nobody heard him say any of them. `CAPTION_SYSTEM` already
 * says, in words, that `basis` is "demonstrated" for anything read from a title
 * and never "stated" from a headline — and the model agreed with that rule on
 * three creators and quietly broke it on the fourth, because the sentences
 * happen to be shaped like assertions.
 *
 * ⚖️ WHY THIS IS NOT ANOTHER PROMPT LINE. `stated` is the level at which
 * `evidenceLevel` starts letting the writer put a position in the creator's
 * MOUTH. So a rounded-up basis is not a metadata blemish — it is the pipeline
 * asserting that someone holds a view we only know they made a video near. A
 * title phrased as a question may well be answered "no" in the video.
 *
 * This function is fed CAPTIONS BY CONSTRUCTION. That makes the correct basis
 * decidable from the call site rather than from the text, so it is decided
 * here. The repo's own rule: a contract check beats a prompt rule wherever the
 * defect is decidable, and prompt rules in this codebase have now failed three
 * times (the `promotes` enum, the enumeration unit, and this).
 *
 * COST, STATED OUT LOUD: a long caption that genuinely spells out a position
 * loses its `stated` and is demoted to coverage. That costs the writer one
 * quotable line. The alternative costs a creator a stance they never took.
 */
/**
 * ⚖️ AND THE SAME ARGUMENT RETIRES `cost` AND `consensus` FROM CAPTIONS.
 *
 * A caption proves a video was made and nothing about what it concluded, which
 * is the entire reason `basis` is clamped above. `cost` says what a thing took
 * from this creator and `consensus` says what they were arguing against — both
 * are conclusions, and both are exactly the sort a declarative-looking headline
 * invites the model to supply. "I lost everything on my first store" is a
 * title; nobody heard him say what it cost, and the story step would then ask
 * him to confirm a price he never named.
 *
 * `CAPTION_SYSTEM` is not asked for these fields at all. That is a prompt rule,
 * and prompt rules in this file have now failed four times, so the call site —
 * which knows by construction that it is holding captions — decides it instead.
 */
export function clampCaptionBasis(items: RawKnowledgeItem[]): RawKnowledgeItem[] {
  return items.map((i) => {
    // ⚖️ AN ALREADY-CORRECT ITEM IS RETURNED AS THE SAME OBJECT. The clamp is a
    // boundary, not a rewriter, and copying every row on the way through would
    // make "this batch was untouched" unobservable — which `captionBasis.test`
    // pins deliberately.
    const clean = i?.basis === 'demonstrated' && i.cost === undefined && i.consensus === undefined
    if (clean) return i
    const { cost: _cost, consensus: _consensus, ...rest } = i ?? ({} as RawKnowledgeItem)
    return { ...rest, basis: 'demonstrated' } as RawKnowledgeItem
  })
}

/** How much spoken text one extraction call may carry.
 *
 *  ⚖️ UNCHANGED FROM THE ORIGINAL CAP ON PURPOSE. 12,000 characters is a window
 *  the model demonstrably reads well; what was wrong was that it applied to the
 *  whole corpus instead of to one call. Widening the window and batching at once
 *  would move two things and leave neither attributable. */
export const EXTRACT_WINDOW_CHARS = 12_000

/** ⚠️ A BOUND ON SPEND, AND THE ONLY REASON THIS IS NOT UNLIMITED. Each batch is
 *  a Gemini call. Five covers roughly fifteen average transcripts — comfortably
 *  past the free TikTok budget's usual yield — and a creator with more than that
 *  gets a warning line naming exactly how many were left unread, rather than the
 *  silence this replaces. */
export const EXTRACT_MAX_BATCHES = 5

export async function extractKnowledgeFromAudio(
  handle: string,
  platform: string,
  transcripts: string[],
): Promise<RawKnowledgeItem[]> {
  if (!transcripts.length) return []

  // ⚠️ A `.slice(0, 12000)` HERE THREW AWAY MOST OF WHAT THE SCAN PAID FOR, and
  // it is the same defect as the `.slice(0, 5)` in `voice.ts`'s consumer that
  // made both transcript-budget raises inert: two places deciding how much
  // material gets used, one of them silent.
  //
  // Production transcripts average 3,622 characters, so a 12,000-character
  // corpus is THREE videos. TikTok creators have 25 transcribed for free; 22 of
  // them were discarded before the extractor ever saw them, on a platform where
  // the whole point of the raise was that the material costs nothing.
  //
  // ⚖️ IT ALSO MADE THE YIELD FIGURE WRONG. "One to two-and-a-half substance
  // items per transcribed video" divides by videos TRANSCRIBED, not videos READ.
  // garyvee's scan produced 25 items from what was recorded as ten videos; if
  // three reached the extractor, the real rate is several times higher and the
  // number that justified holding the budget was measuring this cap.
  //
  // ⚖️ SO IT BATCHES RATHER THAN WIDENING ONE CALL. A single enormous prompt
  // trades one silent loss for another — attention spread thin over 25 videos
  // returns fewer items per video, and nothing would say so. Each batch is a
  // window the model can actually read, and every transcript lands in exactly
  // one of them.
  const batches: string[] = []
  let current: string[] = []
  let size = 0
  for (const [i, t] of transcripts.entries()) {
    const block = `--- VIDEO ${i + 1} (spoken) ---\n${t}`
    if (size + block.length > EXTRACT_WINDOW_CHARS && current.length) {
      batches.push(current.join('\n\n')); current = []; size = 0
    }
    current.push(block); size += block.length + 2
    if (batches.length >= EXTRACT_MAX_BATCHES - 1 && size >= EXTRACT_WINDOW_CHARS) break
  }
  if (current.length && batches.length < EXTRACT_MAX_BATCHES) batches.push(current.join('\n\n'))

  // ⚠️ SAID OUT LOUD WHEN MATERIAL IS STILL DROPPED. A bound that silently
  // discards is the thing this whole comment is about.
  const read = batches.join('\n\n').split('--- VIDEO ').length - 1
  if (read < transcripts.length) {
    console.warn(`extract_knowledge: read ${read} of ${transcripts.length} transcripts (batch cap)`)
  }

  const items: RawKnowledgeItem[] = []
  try {
    for (const corpus of batches) {
      const prompt = `CREATOR: @${handle} on ${platform}
SPOKEN TRANSCRIPTS:
${corpus}

Record what this creator knows, believes, has done, and has already covered.`
      const out = (await geminiJson(KNOWLEDGE_SYSTEM, prompt, knowledgeSchema, 40_000)) as { items?: RawKnowledgeItem[] }
      if (Array.isArray(out?.items)) items.push(...out.items)
    }
    // ⚖️ NO DEDUPE HERE. `canonicaliseRepeats` and the merge in
    // `knowledgeInsert` already collapse repeats across the whole store, and a
    // second, different rule at this seam is how two answers to one question
    // start disagreeing.
    return items
  } catch {
    // ⚖️ Knowledge is an ENRICHMENT of the voice build, never a gate on it. A
    // creator whose extraction failed must still get their voice; failing the
    // whole job here would trade a working feature for a new one.
    //
    // ⚖️ AND A LATER BATCH FAILING KEEPS THE EARLIER ONES. Returning [] would
    // discard work that succeeded because work that followed it did not.
    return items
  }
}
