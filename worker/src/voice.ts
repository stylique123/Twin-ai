import { geminiJson, obj, arr, str } from './gemini.js'
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
  vocabulary: string[]
  recurring_ctas: string[]
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
    vocabulary: arr(str),
    recurring_ctas: arr(str),
    dos: arr(str),
    donts: arr(str),
    sample_hooks: arr(str),
  },
  ['summary', 'niche', 'tone', 'pacing', 'hook_style', 'vocabulary', 'recurring_ctas', 'dos', 'donts', 'sample_hooks'],
)

const SYSTEM = `You are TwinAI's Brand-DNA engine. You are given VERBATIM TRANSCRIPTS of how a creator
actually speaks on camera — the strongest possible signal for their voice.
- Capture how THEY talk: tone, pacing, real sentence rhythm, signature words/phrases, how they open and close.
- vocabulary = 4-8 actual words/phrases they really say. sample_hooks = 3 fresh hooks in their exact spoken style.
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
  },
  ['summary', 'niche', 'sub_niche', 'audience', 'audience_pain', 'dream_outcome', 'offer', 'tone', 'pacing', 'hook_style', 'hook_patterns', 'vocabulary', 'recurring_ctas', 'pov', 'enemy', 'dos', 'donts', 'sample_hooks'],
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
- If the sample is thin, infer sensibly from what's there rather than refusing. For pov/enemy specifically, prefer a shorter honest list over inventing beliefs the posts do not show.`

export async function synthesizeVoiceFromPosts(
  handle: string,
  platform: string,
  posts: ScrapedPost[],
  bio = '',
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

  const prompt = `CREATOR: @${handle} on ${platform}
${bio ? `PROFILE BIO: ${bio}\n` : ''}RECENT POSTS (caption/text + hashtags + rough reach):
${corpus || '(no captions available — infer a sensible starting voice from the handle, bio, and platform)'}

Synthesize this creator's voice profile.`

  // DNA-specific thinking budget (A/B-proven lossless), matching the edge function.
  const budget = Number(process.env.DNA_THINKING_BUDGET ?? process.env.GEMINI_THINKING_BUDGET ?? '4096')
  return (await geminiJson(POSTS_SYSTEM, prompt, postsSchema, 45_000, budget)) as Record<string, unknown>
}
