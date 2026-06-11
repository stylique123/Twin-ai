import { geminiJson, obj, arr, str } from './gemini.js'

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
