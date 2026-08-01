// Where each DNA field came from, after the audio upgrade merges over the
// caption synthesis.
//
// The merge is a plain spread, so before this the two were indistinguishable
// afterwards — and they are nowhere near equal in authority. The caption model
// is instructed never to return a blank ("COMPLETENESS IS MANDATORY", see
// voice.ts's POSTS_SYSTEM), so a creator whose captions never mention what they
// sell gets an INVENTED `offer`, and `offer` writes the call to action on every
// video they make.
//
// handleBuildVoice touches the database, so these test the labelling rule
// directly against the same three-way scheme the handler applies. The rule is
// what has to hold; the row write is one line either side of it.
import { describe, it, expect } from 'vitest'

/** The exact labelling the handler performs, kept in step with jobs/voice.ts. */
function stampProvenance(
  captionProfile: Record<string, unknown>,
  audioProfile: Record<string, unknown>,
  priorProvenance: Record<string, string> = {},
): Record<string, string> {
  const merged = { ...captionProfile, ...audioProfile }
  const audioFields = new Set(Object.keys(audioProfile))
  const out: Record<string, string> = {}
  for (const key of Object.keys(merged)) {
    if (key.startsWith('_')) continue
    if (audioFields.has(key)) out[key] = 'observed_audio'
    else out[key] = priorProvenance[key] === 'user_confirmed' ? 'user_confirmed' : 'caption_synthesis'
  }
  return out
}

// The real shapes: the caption synth returns 24 fields, the audio synth 13.
const CAPTION = {
  summary: 'x', niche: 'AI productivity', sub_niche: 'AI tools for founders',
  audience: 'founders', audience_pain: 'ships too slowly', dream_outcome: 'ships weekly',
  offer: 'a $49/mo app', tone: 'hyped', pacing: 'fast', hook_style: 'question',
  hook_patterns: ['a'], vocabulary: ['ship'], recurring_ctas: ['follow'],
  pov: ['simple wins'], enemy: 'bloat', dos: ['be short'], donts: ['no jargon'],
  sample_hooks: ['h'], formats: ['talking head'], title_style: 't',
  thumbnail_style: 'th', editing_style: 'e', brand_colors: {}, voiced_from_audio: false,
}
const AUDIO = {
  summary: 'x2', niche: 'AI productivity', tone: 'direct, analytical', pacing: 'measured',
  hook_style: 'contrarian claim', hook_patterns: ['b'], vocabulary: ['leverage'],
  recurring_ctas: ['try it'], pov: ['simple beats clever'], enemy: 'automation theatre',
  dos: ['name the mistake'], donts: ['no hype'], sample_hooks: ['h2'],
  voiced_from_audio: true,
}

describe('fields the creator actually SPOKE are marked as such', () => {
  const prov = stampProvenance(CAPTION, AUDIO)

  it('marks every audio-derived field observed_audio', () => {
    for (const k of ['tone', 'pacing', 'vocabulary', 'hook_patterns', 'pov', 'enemy']) {
      expect(prov[k], k).toBe('observed_audio')
    }
  })

  it('does NOT mark caption-derived fields as observed', () => {
    // THE POINT OF THE WHOLE SCHEME. Calling these "observed" grants authority
    // they have not earned: the model was told to infer rather than leave a
    // gap, so any of them may be a guess and we cannot tell which.
    for (const k of ['offer', 'audience', 'audience_pain', 'dream_outcome', 'sub_niche']) {
      expect(prov[k], k).toBe('caption_synthesis')
      expect(prov[k], k).not.toBe('observed_audio')
    }
  })

  it('covers EVERY field — a missing label would read as no claim at all', () => {
    const expected = new Set([...Object.keys(CAPTION), ...Object.keys(AUDIO)].filter((k) => !k.startsWith('_')))
    expect(new Set(Object.keys(prov))).toEqual(expected)
  })

  it('never labels the metadata keys themselves', () => {
    const p = stampProvenance({ ...CAPTION, _provenance: { tone: 'x' } }, AUDIO)
    expect(p._provenance).toBeUndefined()
  })
})

describe('the business fields are exactly the ones audio cannot rescue', () => {
  it('audio produces none of them, so they stay caption_synthesis', () => {
    // Audio has no bio, no hashtags, no link — it genuinely cannot know what
    // someone sells. This is why the merge keeps captions for these rather
    // than letting the audio pass blank them, and why they remain the fields
    // that most need a human answer.
    for (const k of ['offer', 'audience', 'audience_pain', 'dream_outcome', 'sub_niche', 'editing_style']) {
      expect(Object.keys(AUDIO), k).not.toContain(k)
    }
  })

  it('CONTROL: audio DOES override the voice fields — the upgrade is real', () => {
    // Otherwise "caption fields stayed captions" could be true because the
    // merge did nothing at all.
    const merged = { ...CAPTION, ...AUDIO }
    expect(merged.tone).toBe('direct, analytical')
    expect(merged.tone).not.toBe(CAPTION.tone)
    expect(merged.offer).toBe(CAPTION.offer)
  })
})

describe('a human answer outranks both', () => {
  it('keeps user_confirmed through a later audio pass', () => {
    // Someone typed their real offer. A subsequent scan must not quietly
    // demote it back to a synthesis label.
    const prov = stampProvenance(CAPTION, AUDIO, { offer: 'user_confirmed' })
    expect(prov.offer).toBe('user_confirmed')
  })

  it('but audio still wins a VOICE field the user never confirmed', () => {
    const prov = stampProvenance(CAPTION, AUDIO, { offer: 'user_confirmed' })
    expect(prov.tone).toBe('observed_audio')
  })

  it('MUTATION: a stale caption_synthesis label does not survive as confirmation', () => {
    const prov = stampProvenance(CAPTION, AUDIO, { offer: 'caption_synthesis' })
    expect(prov.offer).toBe('caption_synthesis')
  })
})

describe('the labels line up with what may DECIDE things', () => {
  it('no business field is ever labelled strongly enough to decide on its own', () => {
    // dnaProvenance.ts refuses an inference on offer/audience/claims. These
    // labels are what feed that decision, so the two must agree: nothing
    // reaches `observed_audio` that audio cannot actually observe.
    const prov = stampProvenance(CAPTION, AUDIO)
    const decidingFields = ['offer', 'audience']
    for (const f of decidingFields) {
      expect(prov[f], f).toBe('caption_synthesis')
    }
  })
})
