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
