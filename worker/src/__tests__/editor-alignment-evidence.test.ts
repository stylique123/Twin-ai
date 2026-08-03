// The alignment EVIDENCE record — the shape the pipeline will store.
//
// Predeclared controls:
//
//   NEGATIVE   "no script" and "alignment failed" must not look the same. An
//              upload legitimately has no script; that is an ordinary state and
//              a reader must be able to tell it from a fault.
//   NEGATIVE   a word never spoken keeps a NULL time. Interpolating one would
//              put a caption on screen for something the viewer never hears.
//   MUTATION   the record must carry the SCRIPT's spelling, not the ASR's —
//              that is the entire reason this exists.
import { describe, it, expect } from 'vitest'
import {
  buildAlignmentEvidence, ALIGNMENT_EVIDENCE_SCHEMA_VERSION,
  fitTimingsToBudget, ALIGNMENT_TIMINGS_MAX_BYTES, ALIGNMENT_RESULT_MAX_BYTES,
} from '../jobs/editorAlignment.js'

const ASSET = { id: 'a1', content_sha256: 'f'.repeat(64) }
const words = (...ws: string[]) => ws.map((text, i) => ({ text, startMs: i * 500, endMs: i * 500 + 400 }))
const snap = (...dialogue: string[]) => ({ scenes: dialogue.map((d) => ({ dialogue: d })) })

const build = (input: Parameters<typeof buildAlignmentEvidence>[1]) =>
  buildAlignmentEvidence(ASSET, input)

describe('the record carries the script spelling at the recording time', () => {
  const rec = build({
    words: words('try', 'twin', 'eye', 'today'),
    speechVersion: 'speech-6',
    snapshot: snap('Try TwinAI today'),
    scriptSnapshotSha256: 'a'.repeat(64),
  })

  it('MUTATION: the timings use the SCRIPT spelling, not what the ASR heard', () => {
    // The whole point. If this ever returns the ASR's tokens, a creator's brand
    // name ships misspelled and burned into their own video.
    const texts = (rec.scriptWordTimings as Array<{ text: string }>).map((t) => t.text)
    expect(texts).toEqual(['Try', 'TwinAI', 'today'])
    expect(texts).not.toContain('twin')
    expect(texts).not.toContain('eye')
  })

  it('every timed word gets a REAL time from the recording', () => {
    const timed = (rec.scriptWordTimings as Array<{ startMs: number | null }>)
      .filter((t) => t.startMs !== null)
    expect(timed.length).toBeGreaterThanOrEqual(2)
  })

  it('reports counts a reader can act on', () => {
    const a = rec.alignment as Record<string, number>
    expect(a.scriptTokenCount).toBe(3)
    expect(a.spokenTokenCount).toBe(4)
    expect(a.insertionCount).toBe(1) // the mis-split "eye"
    expect(a.coverageMilli).toBeGreaterThan(0)
  })

  it('stamps schema, versions and the binding sha', () => {
    expect(rec.schemaVersion).toBe(ALIGNMENT_EVIDENCE_SCHEMA_VERSION)
    expect(rec.sourceChecksum).toBe(ASSET.content_sha256)
    expect(rec.scriptSnapshotSha256).toBe('a'.repeat(64))
    expect((rec.provenance as Record<string, string>).speechVersion).toBe('speech-6')
  })
})

describe('NEGATIVE: "no script" is ordinary, and says so', () => {
  it('an UPLOAD has no captured script — not a failure', () => {
    const rec = build({
      words: words('hello', 'there'),
      speechVersion: 'speech-6',
      snapshot: { capturedScript: false },
      scriptSnapshotSha256: 'b'.repeat(64),
    })
    expect(rec.hasCapturedScript).toBe(false)
    expect(rec.alignment).toBeNull()
    expect(rec.unavailableReason).toBe('script_empty')
    expect(rec.scriptWordTimings).toEqual([])
  })

  it('a recording with no speech is distinguishable from no script', () => {
    // Two different nulls. A reader must be able to tell "they uploaded a clip
    // with no script" from "the script exists but nothing was said".
    const rec = build({
      words: [],
      speechVersion: 'speech-6',
      snapshot: snap('Try TwinAI today'),
      scriptSnapshotSha256: 'c'.repeat(64),
    })
    expect(rec.hasCapturedScript).toBe(true)
    expect(rec.unavailableReason).toBe('spoken_empty')
  })

  it('a successful alignment carries NO reason', () => {
    const rec = build({
      words: words('try', 'twinai', 'today'),
      speechVersion: 'speech-6',
      snapshot: snap('Try TwinAI today'),
      scriptSnapshotSha256: 'd'.repeat(64),
    })
    expect(rec.unavailableReason).toBeNull()
    expect(rec.alignment).not.toBeNull()
  })
})

describe('NEGATIVE: a word never spoken keeps a null time', () => {
  it('does not invent a timestamp for a skipped word', () => {
    const rec = build({
      words: words('ship', 'it', 'today'),
      speechVersion: 'speech-6',
      snapshot: snap('Ship it today please'),
      scriptSnapshotSha256: 'e'.repeat(64),
    })
    const skipped = (rec.scriptWordTimings as Array<{ text: string; startMs: number | null; via: string }>)
      .find((t) => t.text === 'please')!
    expect(skipped.startMs).toBeNull()
    expect(skipped.via).toBe('not_spoken')
  })

  it('hidden b-roll scenes never enter the script side', () => {
    const rec = build({
      words: words('ship', 'it'),
      speechVersion: 'speech-6',
      snapshot: {
        scenes: [
          { dialogue: 'Ship it', showInTeleprompter: true },
          { dialogue: 'cutaway of the dashboard', showInTeleprompter: false },
        ],
      },
      scriptSnapshotSha256: 'f'.repeat(64),
    })
    const texts = (rec.scriptWordTimings as Array<{ text: string }>).map((t) => t.text)
    expect(texts).toEqual(['Ship', 'it'])
    expect(texts).not.toContain('cutaway')
  })
})

// ── THE PAYLOAD BOUND ──────────────────────────────────────────────────────
// The defect these guard against: `editor_record_analysis` caps each
// component's payload and raises `component_too_large` — permanent, no retry.
// A newly-registered component inherits the CASE `else` branch (16384 bytes),
// which at ~145 bytes per timing is about 90 seconds of speech. The bound and
// the DB cap are a RELATIONSHIP, and the MAX_CUES defect in this same pipeline
// happened because nothing was checking one.
describe('alignment evidence — the payload bound', () => {
  const entry = (i: number) => ({ scriptIdx: i, text: `word${i}`, startMs: i * 400, endMs: i * 400 + 350, via: 'match' })

  it('leaves a payload that already fits completely alone', () => {
    const small = Array.from({ length: 50 }, (_, i) => entry(i))
    const r = fitTimingsToBudget(small)
    expect(r.dropped).toBe(0)
    expect(r.kept).toEqual(small)
  })

  it('truncates an over-budget payload to something that FITS', () => {
    const huge = Array.from({ length: 20000 }, (_, i) => entry(i))
    const r = fitTimingsToBudget(huge)
    expect(r.dropped).toBeGreaterThan(0)
    expect(Buffer.byteLength(JSON.stringify(r.kept), 'utf8')).toBeLessThanOrEqual(ALIGNMENT_TIMINGS_MAX_BYTES)
    expect(r.kept.length + r.dropped).toBe(huge.length)   // nothing vanishes unaccounted for
  })

  it('keeps a contiguous PREFIX, so the kept region is interpretable', () => {
    const huge = Array.from({ length: 20000 }, (_, i) => entry(i))
    const r = fitTimingsToBudget(huge)
    expect(r.kept).toEqual(huge.slice(0, r.kept.length))
  })

  it('is bounded by BYTES, not by a word count a single long token could defeat', () => {
    // One pathological 200KB "word". A count-based budget would wave this
    // through; the whole point of measuring is that this cannot happen.
    const pathological = [{ scriptIdx: 0, text: 'x'.repeat(200000), startMs: 0, endMs: 10, via: 'match' }, entry(1)]
    const r = fitTimingsToBudget(pathological)
    expect(Buffer.byteLength(JSON.stringify(r.kept), 'utf8')).toBeLessThanOrEqual(ALIGNMENT_TIMINGS_MAX_BYTES)
  })

  it('a single entry too large for the whole budget yields an EMPTY set, never an oversized one', () => {
    const one = [{ scriptIdx: 0, text: 'x'.repeat(ALIGNMENT_TIMINGS_MAX_BYTES + 1000), startMs: 0, endMs: 1, via: 'match' }]
    const r = fitTimingsToBudget(one)
    expect(r.kept).toEqual([])
    expect(r.dropped).toBe(1)
  })

  it('THE RELATIONSHIP: the timings budget leaves room for the rest of the record inside the DB cap', () => {
    // The check that was missing for MAX_CUES. If either number is retuned
    // without the other, this fails here rather than in a user's video.
    expect(ALIGNMENT_TIMINGS_MAX_BYTES).toBeLessThan(ALIGNMENT_RESULT_MAX_BYTES)
    const headroom = ALIGNMENT_RESULT_MAX_BYTES - ALIGNMENT_TIMINGS_MAX_BYTES
    expect(headroom).toBeGreaterThan(65536)  // ample room for the envelope + jsonb overhead
  })

  it('a worst-case full record still fits the DB cap end to end', () => {
    const huge = Array.from({ length: 20000 }, (_, i) => entry(i))
    const rec = buildAlignmentEvidence(
      { id: 'a'.repeat(36), content_sha256: 'f'.repeat(64) },
      { words: [], speechVersion: 'speech-1', snapshot: null, scriptSnapshotSha256: 'e'.repeat(64) },
    )
    const withTimings = { ...rec, scriptWordTimings: fitTimingsToBudget(huge).kept }
    expect(Buffer.byteLength(JSON.stringify(withTimings), 'utf8')).toBeLessThanOrEqual(ALIGNMENT_RESULT_MAX_BYTES)
  })
})
