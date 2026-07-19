import { beforeAll, describe, expect, it } from 'vitest'

beforeAll(() => {
  process.env.SUPABASE_URL ||= 'https://stub.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'stub-service-role-key'
})

const asset = { id: 'a-1', content_sha256: 'deadbeef' }
const opts = { speechVersion: 'speech-1', asrModel: 'base', beamSize: 1, silenceMinMs: 700 }

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

describe('speech contract construction', () => {
  it('emits integer ms, stable deterministic ids, bounded confidence', async () => {
    const { buildSpeechAnalysis } = await import('../jobs/editorSpeech.js')
    const a = buildSpeechAnalysis(asset, fixtureBridge(), opts) as Record<string, any>
    expect(a.schemaVersion).toBe(1)
    expect(a.speechVersion).toBe('speech-1')
    expect(a.sourceChecksum).toBe('deadbeef')
    expect(a.durationMs).toBe(14759)
    expect(a.words).toHaveLength(16)
    for (const [i, w] of a.words.entries()) {
      expect(w.id).toBe(`w${i}`)
      expect(Number.isInteger(w.startMs)).toBe(true)
      expect(Number.isInteger(w.endMs)).toBe(true)
      expect(w.endMs).toBeGreaterThanOrEqual(w.startMs)
      expect(w.confidence).toBeGreaterThanOrEqual(0)
      expect(w.confidence).toBeLessThanOrEqual(1)
    }
    // Deterministic: same input → identical output (stable ids across re-runs).
    const b = buildSpeechAnalysis(asset, fixtureBridge(), opts)
    expect(b).toEqual(a)
  })

  it('derives sentence boundaries from terminal punctuation', async () => {
    const { buildSpeechAnalysis } = await import('../jobs/editorSpeech.js')
    const a = buildSpeechAnalysis(asset, fixtureBridge(), opts) as Record<string, any>
    expect(a.sentences.map((s: any) => s.text)).toEqual([
      'The quick fox.',
      'Um, I want, I want to tell you about pineapples.',
      'Bananas are wonderful.',
    ])
    expect(a.sentences[0]).toMatchObject({ id: 's0', firstWordId: 'w0', lastWordId: 'w2', startMs: 350, endMs: 1300 })
    // sentenceEnd flags sit exactly on the closing words.
    expect(a.words.filter((w: any) => w.sentenceEnd).map((w: any) => w.id)).toEqual(['w2', 'w12', 'w15'])
  })

  it('closes a trailing sentence even without terminal punctuation', async () => {
    const { buildSpeechAnalysis } = await import('../jobs/editorSpeech.js')
    const br = fixtureBridge()
    br.words = br.words.slice(0, 2) // 'The quick' — no punctuation
    const a = buildSpeechAnalysis(asset, br, opts) as Record<string, any>
    expect(a.sentences).toHaveLength(1)
    expect(a.sentences[0].text).toBe('The quick')
  })

  it('emits VAD-supported silence candidates for real gaps (and only real gaps)', async () => {
    const { buildSpeechAnalysis } = await import('../jobs/editorSpeech.js')
    const a = buildSpeechAnalysis(asset, fixtureBridge(), opts) as Record<string, any>
    const silences = a.candidates.filter((c: any) => c.kind === 'silence')
    // 1.3→2.8 gap, 5.6→7.4 gap, trailing 8.7→14.759; NOT the 250ms false-start pause.
    expect(silences.map((s: any) => [s.startMs, s.endMs])).toEqual([
      [1300, 2800], [5600, 7400], [8700, 14759],
    ])
    for (const s of silences) {
      expect(s.evidence.gapMs).toBe(s.endMs - s.startMs)
      expect(s.wordIds).toEqual([])
    }
    // The trailing gap has no VAD speech at all → high confidence.
    expect(silences[2].confidence).toBe('high')
    expect(silences[2].evidence.position).toBe('trailing')
  })

  it('flags filler runs with ASR-confidence-aware candidate strength', async () => {
    const { buildSpeechAnalysis } = await import('../jobs/editorSpeech.js')
    const a = buildSpeechAnalysis(asset, fixtureBridge(), opts) as Record<string, any>
    const fillers = a.candidates.filter((c: any) => c.kind === 'filler')
    expect(fillers).toHaveLength(1)
    expect(fillers[0].wordIds).toEqual(['w3'])
    expect(fillers[0].confidence).toBe('high') // p=0.62 >= 0.5
  })

  it('classifies a paused repeated bigram as a false start (candidate only)', async () => {
    const { buildSpeechAnalysis } = await import('../jobs/editorSpeech.js')
    const a = buildSpeechAnalysis(asset, fixtureBridge(), opts) as Record<string, any>
    const fs = a.candidates.filter((c: any) => c.kind === 'false_start')
    expect(fs).toHaveLength(1)
    expect(fs[0].wordIds).toEqual(['w4', 'w5']) // the FIRST 'I want,'
    expect(fs[0].evidence.pauseMs).toBe(250)
    expect(fs[0].evidence.secondStartWordId).toBe('w6')
  })

  it('flags immediate identical words as repetition', async () => {
    const { buildSpeechAnalysis } = await import('../jobs/editorSpeech.js')
    const br = fixtureBridge()
    br.words.splice(10, 0, { w: 'tell', start: 4.5, end: 4.7, p: 0.9 })
    const a = buildSpeechAnalysis(asset, br, opts) as Record<string, any>
    const reps = a.candidates.filter((c: any) => c.kind === 'repetition')
    expect(reps).toHaveLength(1)
    expect(reps[0].evidence.token).toBe('tell')
  })

  it('NEVER emits a candidate for low confidence alone; off-script words stay', async () => {
    const { buildSpeechAnalysis } = await import('../jobs/editorSpeech.js')
    const br = fixtureBridge()
    br.words[13].p = 0.11 // 'Bananas' heard with low confidence
    const a = buildSpeechAnalysis(asset, br, opts) as Record<string, any>
    // The word is still in the transcript/word list (no script filtering)…
    expect(a.words[13].text).toBe('Bananas')
    // …and no candidate references it merely for being low-confidence.
    expect(a.candidates.some((c: any) => c.wordIds.includes('w13'))).toBe(false)
  })

  it('marks a low-confidence filler candidate low (not a safe removal)', async () => {
    const { buildSpeechAnalysis } = await import('../jobs/editorSpeech.js')
    const br = fixtureBridge()
    br.words[3].p = 0.2
    const a = buildSpeechAnalysis(asset, br, opts) as Record<string, any>
    const f = a.candidates.find((c: any) => c.kind === 'filler')
    expect(f.confidence).toBe('low')
  })

  it('candidates are sorted and deterministically ided', async () => {
    const { buildSpeechAnalysis } = await import('../jobs/editorSpeech.js')
    const a = buildSpeechAnalysis(asset, fixtureBridge(), opts) as Record<string, any>
    const starts = a.candidates.map((c: any) => c.startMs)
    expect([...starts].sort((x, y) => x - y)).toEqual(starts)
    a.candidates.forEach((c: any, i: number) => expect(c.id).toBe(`c${i}`))
  })

  it('rejects an out-of-bounds energy curve instead of truncating silently', async () => {
    const { buildSpeechAnalysis } = await import('../jobs/editorSpeech.js')
    const br = fixtureBridge()
    br.energy = { window_ms: 200, rms: new Array(20001).fill(0) }
    expect(() => buildSpeechAnalysis(asset, br, opts)).toThrowError(/energy curve out of bounds/)
    const br2 = fixtureBridge()
    br2.energy = { window_ms: 50, rms: [0.1] }
    expect(() => buildSpeechAnalysis(asset, br2, opts)).toThrowError(/energy curve out of bounds/)
  })

  it('handles speech-free audio (zero words) without candidates', async () => {
    const { buildSpeechAnalysis } = await import('../jobs/editorSpeech.js')
    const br = fixtureBridge()
    br.words = []; br.segments = []; br.text = ''; br.vad_segments = []
    const a = buildSpeechAnalysis(asset, br, opts) as Record<string, any>
    expect(a.words).toEqual([])
    expect(a.sentences).toEqual([])
    expect(a.candidates).toEqual([])
  })

  it('records provenance for reproducibility', async () => {
    const { buildSpeechAnalysis } = await import('../jobs/editorSpeech.js')
    const a = buildSpeechAnalysis(asset, fixtureBridge(), opts) as Record<string, any>
    expect(a.provenance).toEqual({
      asrEngine: 'faster-whisper', asrModel: 'base', beamSize: 1, vad: 'silero', silenceMinMs: 700,
    })
  })
})

describe('speech error surfaces', () => {
  it('classifies asr failures with a stable code and keeps stderr out of durable text', async () => {
    const { sanitizeError } = await import('../sanitizeError.js')
    const s = sanitizeError(new Error('asr_failed (exit 1): Traceback /usr/local/lib/python3.11/dist-packages/x.py https://huggingface.co/models/base secret token abc'), 'transcribing')
    expect(s.code).toBe('asr_failed')
    expect(s.retry).toBe('retryable')
    expect(s.stage).toBe('transcribing')
    expect(s.message).not.toMatch(/https?:|huggingface|dist-packages/)
  })

  it('classifies cooperative speech cancellation', async () => {
    const { SpeechCancelledError } = await import('../jobs/editorSpeech.js')
    const { sanitizeError } = await import('../sanitizeError.js')
    const s = sanitizeError(new SpeechCancelledError('during_asr'), 'transcribing')
    expect(s.retry).toBe('cancelled')
  })
})
