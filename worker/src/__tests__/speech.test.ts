import { beforeAll, describe, expect, it } from 'vitest'

beforeAll(() => {
  process.env.SUPABASE_URL ||= 'https://stub.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'stub-service-role-key'
})

const asset = { id: 'a-1', content_sha256: 'deadbeef' }
const opts = {
  speechVersion: 'speech-1', asrModel: 'base', asrComputeType: 'int8', device: 'cpu',
  beamSize: 1, languagePolicy: 'en', silenceMinMs: 700, vadMinSilenceMs: 300, vadSpeechPadMs: 100,
}

// A bridge output shaped like the real recording fixture: a sentence, a 1.5s
// gap, a filler + false start, a gap, then an off-script addition.
function fixtureBridge() {
  return {
    language: 'en',
    language_probability: 0.97,
    duration_sec: 14.759,
    text: 'The quick fox. Um, I want, I want to tell you about pineapples. Bananas are wonderful.',
    words: [
      { w: 'The', start: 0.35, end: 0.55, p: 0.98 },
      { w: 'quick', start: 0.55, end: 0.9, p: 0.99 },
      { w: 'fox.', start: 0.9, end: 1.3, p: 0.97 },
      { w: 'Um,', start: 2.8, end: 3.0, p: 0.62 },      // filler after a >700ms gap
      { w: 'I', start: 3.1, end: 3.2, p: 0.95 },
      { w: 'want,', start: 3.2, end: 3.5, p: 0.94 },
      { w: 'I', start: 3.75, end: 3.85, p: 0.95 },       // repeated bigram after pause
      { w: 'want', start: 3.85, end: 4.1, p: 0.96 },
      { w: 'to', start: 4.1, end: 4.2, p: 0.99 },
      { w: 'tell', start: 4.2, end: 4.5, p: 0.98 },
      { w: 'you', start: 4.5, end: 4.6, p: 0.99 },
      { w: 'about', start: 4.6, end: 4.9, p: 0.98 },
      { w: 'pineapples.', start: 4.9, end: 5.6, p: 0.93 },
      { w: 'Bananas', start: 7.4, end: 7.9, p: 0.9 },    // off-script addition
      { w: 'are', start: 7.9, end: 8.05, p: 0.97 },
      { w: 'wonderful.', start: 8.05, end: 8.7, p: 0.95 },
    ],
    segments: [
      { start: 0.35, end: 1.3, text: 'The quick fox.' },
      { start: 2.8, end: 5.6, text: 'Um, I want, I want to tell you about pineapples.' },
      { start: 7.4, end: 8.7, text: 'Bananas are wonderful.' },
    ],
    vad_segments: [
      { start: 0.3, end: 1.4 },
      { start: 2.7, end: 5.7 },
      { start: 7.3, end: 8.8 },
    ],
    energy: { window_ms: 200, rms: Array.from({ length: 73 }, (_, i) => (i % 10) / 20) },
  }
}

describe('speech word contract', () => {
  it('integer ms, stable ids, normalized text, sentence linkage, deterministic', async () => {
    const { buildSpeechAnalysis } = await import('../jobs/editorSpeech.js')
    const a = buildSpeechAnalysis(asset, fixtureBridge(), opts) as Record<string, any>
    expect(a.schemaVersion).toBe(1)
    expect(a.speechVersion).toBe('speech-1')
    expect(a.sourceChecksum).toBe('deadbeef')
    expect(a.durationMs).toBe(14759)
    expect(a.words).toHaveLength(16)
    for (const [i, w] of a.words.entries()) {
      expect(w.id).toBe(`w${i}`)
      expect(Number.isInteger(w.startMs) && Number.isInteger(w.endMs)).toBe(true)
      expect(w.endMs).toBeGreaterThanOrEqual(w.startMs)
      expect(w.confidence).toBeGreaterThanOrEqual(0)
      expect(w.confidence).toBeLessThanOrEqual(1)
      expect(w.startMs).toBeGreaterThanOrEqual(0)
      expect(w.endMs).toBeLessThanOrEqual(a.durationMs)   // no word outside source
      expect(w.unitId).toMatch(/^u\d+$/)
    }
    expect(a.words[3].normalizedText).toBe('um')   // 'Um,' → 'um'
    // monotonic non-decreasing starts
    for (let i = 1; i < a.words.length; i++) expect(a.words[i].startMs).toBeGreaterThanOrEqual(a.words[i - 1].startMs)
    // deterministic
    expect(buildSpeechAnalysis(asset, fixtureBridge(), opts)).toEqual(a)
  })

  it('clamps a word that Whisper overruns past the clip end (no word outside source)', async () => {
    const { buildSpeechAnalysis } = await import('../jobs/editorSpeech.js')
    const br = fixtureBridge()
    br.words[15].end = 99.9   // wonderful. overruns the 14.759s clip
    const a = buildSpeechAnalysis(asset, br, opts) as Record<string, any>
    expect(a.words[15].endMs).toBe(a.durationMs)
  })

  it('punctuation-supported boundaries are punctuation_sentence', async () => {
    const { buildSpeechAnalysis } = await import('../jobs/editorSpeech.js')
    const a = buildSpeechAnalysis(asset, fixtureBridge(), opts) as Record<string, any>
    expect(a.boundaries.map((b: any) => b.text)).toEqual([
      'The quick fox.',
      'Um, I want, I want to tell you about pineapples.',
      'Bananas are wonderful.',
    ])
    expect(a.boundaries.every((b: any) => b.kind === 'punctuation_sentence')).toBe(true)
    expect(a.boundaries.every((b: any) => b.evidence.includes('terminal_punctuation'))).toBe(true)
    expect(a.words.filter((w: any) => w.endsUnit).map((w: any) => w.id)).toEqual(['w2', 'w12', 'w15'])
    expect(a.words[0].unitId).toBe('u0')
    expect(a.words[3].unitId).toBe('u1')
  })

  it('punctuation-free segment boundaries are labeled asr_segment, NOT sentence', async () => {
    const { buildSpeechAnalysis } = await import('../jobs/editorSpeech.js')
    const br = {
      language: 'en', language_probability: 0.9, duration_sec: 6,
      text: 'the quick fox bananas are good',
      words: [
        { w: 'the', start: 0.2, end: 0.4, p: 0.9 },
        { w: 'quick', start: 0.4, end: 0.7, p: 0.9 },
        { w: 'fox', start: 0.7, end: 1.0, p: 0.9 },
        { w: 'bananas', start: 1.2, end: 1.6, p: 0.9 },  // <600ms gap → same unit but a segment edge splits
        { w: 'are', start: 1.6, end: 1.8, p: 0.9 },
        { w: 'good', start: 1.8, end: 2.2, p: 0.9 },
      ],
      segments: [
        { start: 0.2, end: 1.0, text: 'the quick fox' },
        { start: 1.2, end: 2.2, text: 'bananas are good' },
      ],
      vad_segments: [{ start: 0.2, end: 2.2 }],
      energy: { window_ms: 200, rms: Array.from({ length: 30 }, () => 0.2) },
    }
    const a = buildSpeechAnalysis(asset, br, opts) as Record<string, any>
    expect(a.boundaries.map((b: any) => b.text)).toEqual(['the quick fox', 'bananas are good'])
    expect(a.boundaries[0].kind).toBe('asr_segment')
    expect(a.boundaries[0].evidence).toContain('asr_segment_end')
    expect(a.boundaries.some((b: any) => b.kind === 'punctuation_sentence')).toBe(false)
  })

  it('a long pause with no segment/punctuation is a pause_utterance', async () => {
    const { buildSpeechAnalysis } = await import('../jobs/editorSpeech.js')
    const br = {
      language: 'en', language_probability: 0.9, duration_sec: 6,
      text: 'the quick fox bananas are good',
      words: [
        { w: 'the', start: 0.2, end: 0.4, p: 0.9 },
        { w: 'quick', start: 0.4, end: 0.7, p: 0.9 },
        { w: 'fox', start: 0.7, end: 1.0, p: 0.9 },   // 1.0 → 3.0 = 2000ms pause, no segment here
        { w: 'bananas', start: 3.0, end: 3.4, p: 0.9 },
        { w: 'are', start: 3.4, end: 3.6, p: 0.9 },
        { w: 'good', start: 3.6, end: 4.0, p: 0.9 },
      ],
      segments: [],  // no ASR segments at all
      vad_segments: [{ start: 0.2, end: 4.0 }],
      energy: { window_ms: 200, rms: Array.from({ length: 30 }, () => 0.2) },
    }
    const a = buildSpeechAnalysis(asset, br, opts) as Record<string, any>
    expect(a.boundaries[0].kind).toBe('pause_utterance')
    expect(a.boundaries[0].evidence).toContain('pause_gap')
    expect(a.boundaries.every((b: any) => b.kind !== 'punctuation_sentence')).toBe(true)
  })
})

describe('speech candidate contract (proposals, never removals)', () => {
  it('every candidate carries the full evidence contract + safeToConsider', async () => {
    const { buildSpeechAnalysis, SPEECH_RULE_VERSION } = await import('../jobs/editorSpeech.js')
    const a = buildSpeechAnalysis(asset, fixtureBridge(), opts) as Record<string, any>
    a.candidates.forEach((c: any, i: number) => {
      expect(c.id).toBe(`c${i}`)
      expect(['silence', 'filler', 'false_start', 'repetition']).toContain(c.kind)
      expect(c.safeToConsider).toBe(true)
      expect('safeToRemove' in c).toBe(false)
      expect(Array.isArray(c.wordIds)).toBe(true)
      expect(Array.isArray(c.evidenceCodes) && c.evidenceCodes.length > 0).toBe(true)
      expect(['high', 'medium', 'low']).toContain(c.confidence)
      expect(c.ruleVersion).toBe(SPEECH_RULE_VERSION)
      expect('prevWordId' in c && 'nextWordId' in c).toBe(true)
    })
    // sorted by start
    const starts = a.candidates.map((c: any) => c.startMs)
    expect([...starts].sort((x: number, y: number) => x - y)).toEqual(starts)
  })

  it('silence is banded: removable / dead_air; natural pauses produce nothing', async () => {
    const { buildSpeechAnalysis } = await import('../jobs/editorSpeech.js')
    const a = buildSpeechAnalysis(asset, fixtureBridge(), opts) as Record<string, any>
    const sil = a.candidates.filter((c: any) => c.kind === 'silence')
    // speech-rules-3: removable/dead_air candidates are SHRUNK to the largest
    // VAD-clear core, so a proposed cut's boundaries can never sit inside VAD
    // speech (Silero's pads push boundaries AWAY from speech).
    expect(sil.map((s: any) => [s.startMs, s.endMs])).toEqual([[1400, 2700], [5700, 7300], [8800, 14759]])
    expect(sil.map((s: any) => s.evidence.class)).toEqual(['removable', 'removable', 'dead_air'])
    expect(sil[2].confidence).toBe('high')       // long dead air
    expect(sil[0].confidence).toBe('medium')     // removable
    // the 250ms false-start pause is BELOW silenceMinMs → not a silence candidate
    expect(sil.some((s: any) => s.startMs === 3500)).toBe(false)
    for (const s of sil) { expect(s.evidence.gapMs).toBe(s.endMs - s.startMs); expect(s.wordIds).toEqual([]) }
  })

  it('an uncertain gap (VAD says speech) is low confidence, class uncertain', async () => {
    const { buildSpeechAnalysis } = await import('../jobs/editorSpeech.js')
    const br = fixtureBridge()
    br.vad_segments = [{ start: 0.3, end: 8.8 }] // VAD covers the 1.3–2.8 gap as speech
    const a = buildSpeechAnalysis(asset, br, opts) as Record<string, any>
    const first = a.candidates.filter((c: any) => c.kind === 'silence')[0]
    expect(first.evidence.class).toBe('uncertain')
    expect(first.confidence).toBe('low')
    expect(first.evidenceCodes).toContain('vad_ambiguous')
  })

  it('detects dead air the ASR bridged: VAD gap with NO word gap (speech-rules-3)', async () => {
    const { buildSpeechAnalysis } = await import('../jobs/editorSpeech.js')
    const br = fixtureBridge()
    // Whisper stretches 'pineapples.' across a real 2.4s silence: word
    // timestamps leave no gap, but Silero VAD hears the non-speech.
    br.words[12].end = 7.4
    br.vad_segments = [
      { start: 0.3, end: 1.4 }, { start: 2.7, end: 4.9 },
      { start: 7.3, end: 8.8 }, // 4.9–7.3 = 2.4s non-speech, inside the word span
    ]
    const a = buildSpeechAnalysis(asset, br, opts) as Record<string, any>
    const bridged = a.candidates.find((c: any) => c.kind === 'silence' && c.startMs === 4900)
    expect(bridged).toBeTruthy()
    expect(bridged.evidenceCodes).toContain('vad_gap')
    expect(bridged.evidence.class).toBe('dead_air')
    expect(bridged.confidence).toBe('high')
  })

  it('classifies a bridged repeated bigram as false start via VAD pause evidence', async () => {
    const { buildSpeechAnalysis } = await import('../jobs/editorSpeech.js')
    const br = fixtureBridge()
    // Kill BOTH word-timestamp pause and comma between the runs...
    br.words[5].w = 'want'
    br.words[6].start = 3.55
    br.words[6].end = 3.65
    // ...but VAD hears a real ~350ms pause inside the junction span.
    br.vad_segments = [
      { start: 0.3, end: 1.4 }, { start: 2.7, end: 3.3 },
      { start: 3.7, end: 5.7 }, { start: 7.3, end: 8.8 },
    ]
    const a = buildSpeechAnalysis(asset, br, opts) as Record<string, any>
    const fs = a.candidates.filter((c: any) => c.kind === 'false_start')
    expect(fs).toHaveLength(1)
    expect(fs[0].evidenceCodes).toContain('vad_pause_between')
    expect(fs[0].evidence.vadPauseMs).toBeGreaterThanOrEqual(150)
  })

  it('REJECTS a filler token with no acoustic speech at its timestamp (hallucination guard)', async () => {
    const { buildSpeechAnalysis } = await import('../jobs/editorSpeech.js')
    const br = fixtureBridge()
    // The prompt (or LM) emits 'Um,' but VAD hears NO speech there: shift VAD
    // so the um interval (2.8-3.0s) falls in a non-speech gap.
    br.vad_segments = [
      { start: 0.3, end: 1.4 }, { start: 3.05, end: 5.7 }, { start: 7.3, end: 8.8 },
    ]
    const a = buildSpeechAnalysis(asset, br, opts) as Record<string, any>
    expect(a.candidates.filter((c: any) => c.kind === 'filler')).toHaveLength(0)
    // the word itself is NOT dropped from the transcript — only the candidate
    expect(a.words[3].normalizedText).toBe('um')
  })

  it('REJECTS a filler candidate whose token overlaps neighboring lexical speech', async () => {
    const { buildSpeechAnalysis } = await import('../jobs/editorSpeech.js')
    const br = fixtureBridge()
    // 'Um,' timestamps overlap the following word 'I' by 100ms — removing the
    // interval could clip real speech, so no candidate may be proposed.
    br.words[3] = { w: 'Um,', start: 2.8, end: 3.2, p: 0.9 }   // 'I' starts 3.1
    const a = buildSpeechAnalysis(asset, br, opts) as Record<string, any>
    expect(a.candidates.filter((c: any) => c.kind === 'filler')).toHaveLength(0)
  })

  it('acoustically-backed filler carries the vad_speech_at_token evidence code', async () => {
    const { buildSpeechAnalysis } = await import('../jobs/editorSpeech.js')
    const a = buildSpeechAnalysis(asset, fixtureBridge(), opts) as Record<string, any>
    const f = a.candidates.filter((c: any) => c.kind === 'filler')
    expect(f).toHaveLength(1)
    expect(f[0].evidenceCodes).toContain('vad_speech_at_token')
  })

  it('disfluency filler (um) is high; low ASR confidence downgrades it', async () => {
    const { buildSpeechAnalysis } = await import('../jobs/editorSpeech.js')
    const a = buildSpeechAnalysis(asset, fixtureBridge(), opts) as Record<string, any>
    const f = a.candidates.filter((c: any) => c.kind === 'filler')
    expect(f).toHaveLength(1)
    expect(f[0].wordIds).toEqual(['w3'])
    expect(f[0].evidence.markerType).toBe('disfluency')
    expect(f[0].confidence).toBe('high')
    const br = fixtureBridge(); br.words[3].p = 0.2
    const a2 = buildSpeechAnalysis(asset, br, opts) as Record<string, any>
    const f2 = a2.candidates.find((c: any) => c.kind === 'filler')
    expect(f2.confidence).toBe('low')
    expect(f2.evidenceCodes).toContain('asr_low_conf')
  })

  it('a discourse marker is flagged ONLY in hesitation context, always low', async () => {
    const { buildSpeechAnalysis } = await import('../jobs/editorSpeech.js')
    // Meaningful "like": fluent, no pause → NOT flagged.
    const fluent = {
      ...fixtureBridge(),
      words: [
        { w: 'I', start: 0.0, end: 0.2, p: 0.99 },
        { w: 'feel', start: 0.2, end: 0.5, p: 0.99 },
        { w: 'like', start: 0.5, end: 0.7, p: 0.99 },
        { w: 'a', start: 0.7, end: 0.8, p: 0.99 },
        { w: 'winner.', start: 0.8, end: 1.2, p: 0.99 },
      ],
      vad_segments: [{ start: 0.0, end: 1.2 }],
    }
    const af = buildSpeechAnalysis(asset, fluent, opts) as Record<string, any>
    expect(af.candidates.some((c: any) => c.evidence?.markerType === 'discourse')).toBe(false)
    // Hesitation "like": bracketed by a pause → flagged, low, evidence code.
    const hes = {
      ...fixtureBridge(),
      words: [
        { w: 'It', start: 0.0, end: 0.2, p: 0.99 },
        { w: 'was,', start: 0.2, end: 0.5, p: 0.99 },
        { w: 'like,', start: 1.0, end: 1.3, p: 0.9 },   // >200ms pause before
        { w: 'good.', start: 1.7, end: 2.1, p: 0.95 },  // >200ms pause after
      ],
      vad_segments: [{ start: 0.0, end: 2.1 }],
    }
    const ah = buildSpeechAnalysis(asset, hes, opts) as Record<string, any>
    const dm = ah.candidates.find((c: any) => c.evidence?.markerType === 'discourse')
    expect(dm).toBeTruthy()
    expect(dm.confidence).toBe('low')
    expect(dm.evidenceCodes).toContain('ambiguous_discourse_marker')
  })

  it('classifies a paused repeated bigram as a false start', async () => {
    const { buildSpeechAnalysis } = await import('../jobs/editorSpeech.js')
    const a = buildSpeechAnalysis(asset, fixtureBridge(), opts) as Record<string, any>
    const fs = a.candidates.filter((c: any) => c.kind === 'false_start')
    expect(fs).toHaveLength(1)
    expect(fs[0].wordIds).toEqual(['w4', 'w5'])
    expect(fs[0].evidence.pauseMs).toBe(250)
    expect(fs[0].evidenceCodes).toContain('pause_between')
  })

  it('distinguishes stutter, proper-noun (low), and cross-sentence (skip) repetition', async () => {
    const { buildSpeechAnalysis } = await import('../jobs/editorSpeech.js')
    // proper noun repeated → repetition, LOW, proper_noun code
    const pn = {
      ...fixtureBridge(),
      words: [
        { w: 'Paris', start: 0.0, end: 0.4, p: 0.95 },
        { w: 'Paris', start: 0.4, end: 0.8, p: 0.95 },
        { w: 'is', start: 0.8, end: 1.0, p: 0.99 },
        { w: 'nice.', start: 1.0, end: 1.4, p: 0.99 },
      ],
      vad_segments: [{ start: 0, end: 1.4 }],
    }
    const apn = buildSpeechAnalysis(asset, pn, opts) as Record<string, any>
    const rep = apn.candidates.find((c: any) => c.kind === 'repetition')
    expect(rep.confidence).toBe('low')
    expect(rep.evidenceCodes).toContain('proper_noun')
    // words repeated ACROSS a sentence boundary are not a repetition candidate
    const cross = {
      ...fixtureBridge(),
      words: [
        { w: 'go.', start: 0.0, end: 0.4, p: 0.95 },   // sentence end
        { w: 'go', start: 0.4, end: 0.8, p: 0.95 },    // next sentence starts
        { w: 'now.', start: 0.8, end: 1.2, p: 0.95 },
      ],
      vad_segments: [{ start: 0, end: 1.2 }],
    }
    const ac = buildSpeechAnalysis(asset, cross, opts) as Record<string, any>
    expect(ac.candidates.some((c: any) => c.kind === 'repetition')).toBe(false)
  })

  it('NEVER emits a candidate for low confidence alone; off-script words stay', async () => {
    const { buildSpeechAnalysis } = await import('../jobs/editorSpeech.js')
    const br = fixtureBridge()
    br.words[13].p = 0.11 // 'Bananas' heard with low confidence
    const a = buildSpeechAnalysis(asset, br, opts) as Record<string, any>
    expect(a.words[13].text).toBe('Bananas')
    expect(a.candidates.some((c: any) => c.wordIds.includes('w13'))).toBe(false)
  })
})

describe('speech energy + payload safety', () => {
  it('downsamples the energy curve so its length is bounded (not truncated)', async () => {
    const { buildSpeechAnalysis } = await import('../jobs/editorSpeech.js')
    const br = fixtureBridge()
    br.energy = { window_ms: 200, rms: Array.from({ length: 9000 }, (_, i) => (i % 100) / 100) } // 30 min @200ms
    const a = buildSpeechAnalysis(asset, br, opts) as Record<string, any>
    expect(a.energy.rms.length).toBeLessThanOrEqual(2000)
    expect(a.energy.windowMs).toBeGreaterThan(200) // coarsened, not dropped
  })

  it('a 30-minute high-word-rate source fits the 1MiB budget without truncation', async () => {
    const { buildSpeechAnalysis } = await import('../jobs/editorSpeech.js')
    const N = 5400 // 30 min @ 3 words/sec
    const words = Array.from({ length: N }, (_, i) => {
      const t = i * 0.33
      return { w: (i % 7 === 6 ? 'word.' : 'word'), start: t, end: t + 0.3, p: 0.9 }
    })
    const br = {
      language: 'en', language_probability: 0.95, duration_sec: 1800,
      text: 'word '.repeat(N), words,
      segments: [], vad_segments: [{ start: 0, end: 1800 }],
      energy: { window_ms: 200, rms: Array.from({ length: 9000 }, () => 0.5) },
    }
    const a = buildSpeechAnalysis(asset, br, opts) as Record<string, any>
    expect(a.words).toHaveLength(N)            // every word preserved, none dropped
    const bytes = Buffer.byteLength(JSON.stringify(a), 'utf8')
    expect(bytes).toBeLessThan(1_000_000)
  })

  it('rejects an out-of-bounds raw energy curve instead of accepting it', async () => {
    const { buildSpeechAnalysis } = await import('../jobs/editorSpeech.js')
    const br = fixtureBridge(); br.energy = { window_ms: 50, rms: [0.1] }
    expect(() => buildSpeechAnalysis(asset, br, opts)).toThrowError(/energy curve out of bounds/)
  })

  it('handles speech-free audio (zero words) without candidates', async () => {
    const { buildSpeechAnalysis } = await import('../jobs/editorSpeech.js')
    const br = fixtureBridge()
    br.words = []; br.segments = []; br.text = ''; br.vad_segments = []
    const a = buildSpeechAnalysis(asset, br, opts) as Record<string, any>
    expect(a.words).toEqual([])
    expect(a.boundaries).toEqual([])
    expect(a.candidates).toEqual([])
  })

  it('records reproducibility provenance', async () => {
    const { buildSpeechAnalysis } = await import('../jobs/editorSpeech.js')
    const a = buildSpeechAnalysis(asset, fixtureBridge(), opts) as Record<string, any>
    expect(a.provenance).toMatchObject({
      asrEngine: 'faster-whisper', asrModel: 'base', asrComputeType: 'int8', device: 'cpu',
      beamSize: 1, languagePolicy: 'en', vad: 'silero', vadMinSilenceMs: 300, vadSpeechPadMs: 100,
      silenceMinMs: 700, ruleVersion: 'speech-rules-3',
    })
  })
})

describe('speech error surfaces', () => {
  it('asr failures: stable code, retryable, no host/path/transcript leak', async () => {
    const { sanitizeError } = await import('../sanitizeError.js')
    const s = sanitizeError(new Error('asr_failed (exit 1): Traceback /usr/local/lib/python3.11/dist-packages/x.py https://huggingface.co/models/base'), 'transcribing')
    expect(s.code).toBe('asr_failed')
    expect(s.retry).toBe('retryable')
    expect(s.stage).toBe('transcribing')
    expect(s.message).not.toMatch(/https?:|huggingface|dist-packages/)
  })

  it('classifies cooperative speech cancellation', async () => {
    const { SpeechCancelledError } = await import('../jobs/editorSpeech.js')
    const { sanitizeError } = await import('../sanitizeError.js')
    expect(sanitizeError(new SpeechCancelledError('during_asr'), 'transcribing').retry).toBe('cancelled')
  })
})

// The immutable `speech` component (speech-6) must name the EXACT pinned model
// that produced it. The bridge reports repository/revision/artifact+manifest
// digests; the builder persists them into provenance and, when a pin is required,
// fails closed if they are absent.
const PINNED_MODEL = {
  label: 'small',
  loadedFromPath: true,
  verified: true,
  repository: 'Systran/faster-whisper-small',
  revision: '536b0662742c02347bc0e980a01041f333bce120',
  artifactSha256: '3e305921506d8872816023e4c273e75d2419fb89b24da97b4fe7bce14170d671',
  manifestSha256: 'f'.repeat(64),
  analyzerBundle: 'speech-6',
}

describe('speech model pinning (speech-6)', () => {
  it('persists repository/revision/digests from the bridge into provenance', async () => {
    const { buildSpeechAnalysis } = await import('../jobs/editorSpeech.js')
    const br = { ...fixtureBridge(), model: PINNED_MODEL }
    const a = buildSpeechAnalysis(asset, br, opts) as Record<string, any>
    expect(a.provenance.modelRepository).toBe('Systran/faster-whisper-small')
    expect(a.provenance.modelRevision).toBe('536b0662742c02347bc0e980a01041f333bce120')
    expect(a.provenance.modelArtifactSha256).toBe(PINNED_MODEL.artifactSha256)
    expect(a.provenance.modelManifestSha256).toBe(PINNED_MODEL.manifestSha256)
    expect(a.provenance.modelAnalyzerBundle).toBe('speech-6')
    expect(a.provenance.modelLoadedFromPath).toBe(true)
    expect(a.provenance.modelVerified).toBe(true)
  })

  it('version coupling: speech-6 analysis carries the pinned revision', async () => {
    const { buildSpeechAnalysis } = await import('../jobs/editorSpeech.js')
    const br = { ...fixtureBridge(), model: PINNED_MODEL }
    const a = buildSpeechAnalysis(asset, br, { ...opts, speechVersion: 'speech-6' }) as Record<string, any>
    expect(a.speechVersion).toBe('speech-6')
    expect(a.provenance.modelRevision).toBe('536b0662742c02347bc0e980a01041f333bce120')
  })

  it('fails closed when a pin is REQUIRED but the bridge did not report one', async () => {
    const { buildSpeechAnalysis } = await import('../jobs/editorSpeech.js')
    // bridge without a `model` block (e.g. loaded the moving alias) → reject
    expect(() => buildSpeechAnalysis(asset, fixtureBridge(), { ...opts, requirePinnedModel: true }))
      .toThrow(/pinned model identity missing/)
  })

  it('fails closed when the bridge reports it did NOT load from the pinned path', async () => {
    const { buildSpeechAnalysis } = await import('../jobs/editorSpeech.js')
    const br = { ...fixtureBridge(), model: { ...PINNED_MODEL, loadedFromPath: false } }
    expect(() => buildSpeechAnalysis(asset, br, { ...opts, requirePinnedModel: true }))
      .toThrow(/pinned model identity missing/)
  })

  it('fails closed when the bridge did NOT verify the loaded bytes', async () => {
    const { buildSpeechAnalysis } = await import('../jobs/editorSpeech.js')
    const br = { ...fixtureBridge(), model: { ...PINNED_MODEL, verified: false } }
    expect(() => buildSpeechAnalysis(asset, br, { ...opts, requirePinnedModel: true }))
      .toThrow(/pinned model identity missing or unverified/)
  })

  it('coupling: rejects a pin whose analyzer bundle != the requested speech version', async () => {
    const { buildSpeechAnalysis } = await import('../jobs/editorSpeech.js')
    // manifest pinned to speech-6 but the run requests speech-7 → mismatch
    const br = { ...fixtureBridge(), model: { ...PINNED_MODEL, analyzerBundle: 'speech-6' } }
    expect(() => buildSpeechAnalysis(asset, br, { ...opts, speechVersion: 'speech-7', requirePinnedModel: true }))
      .toThrow(/model pin bundle .* != requested/)
    // and the inverse: manifest says speech-7 while the default is speech-6
    const br2 = { ...fixtureBridge(), model: { ...PINNED_MODEL, analyzerBundle: 'speech-7' } }
    expect(() => buildSpeechAnalysis(asset, br2, { ...opts, speechVersion: 'speech-6', requirePinnedModel: true }))
      .toThrow(/model pin bundle .* != requested/)
  })

  it('does not require a pin by default (dev/back-compat): provenance fields null', async () => {
    const { buildSpeechAnalysis } = await import('../jobs/editorSpeech.js')
    const a = buildSpeechAnalysis(asset, fixtureBridge(), opts) as Record<string, any>
    expect(a.provenance.modelRevision).toBeNull()
    expect(a.provenance.modelLoadedFromPath).toBe(false)
    expect(a.provenance.modelVerified).toBe(false)
  })
})
