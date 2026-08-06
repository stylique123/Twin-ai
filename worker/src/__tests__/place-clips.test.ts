// TURNING A CAPTURED CLIP INTO AN OVERLAY — the last step before the renderer.
//
// `sceneOutputWindow` answered where a scene lands. This answers what happens
// when the clip and that window are not the same length, and when two clips want
// the same stretch of video. Every branch here either places the clip exactly
// where the marker said, or drops it and says so — there is no third outcome,
// because a cutaway over the wrong sentence is worse than no cutaway.
import { describe, it, expect, beforeAll } from 'vitest'
import type { placeClips as PlaceClips, CompileClip, CompileSource, TimeMap } from '../jobs/editorCompile.js'

let placeClips: typeof PlaceClips

beforeAll(async () => {
  process.env.SUPABASE_URL ||= 'https://stub.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'stub-service-role-key'
  ;({ placeClips } = await import('../jobs/editorCompile.js'))
})

const TAKE = '11111111-1111-1111-1111-111111111111'
const CLIP_A = '22222222-2222-2222-2222-222222222222'
const CLIP_B = '33333333-3333-3333-3333-333333333333'
const SUM = 'a'.repeat(64)

// Scene 1 ran 0–10s of the take, scene 2 ran 10–20s.
const SOURCE = {
  origin: 'teleprompter',
  durationMs: 20_000,
  acceptedWindows: [
    { startMs: 0, endMs: 10_000, sceneNumber: 1 },
    { startMs: 10_000, endMs: 20_000, sceneNumber: 2 },
  ],
} as CompileSource

/** The whole take kept, so output time equals source time. */
const WHOLE: TimeMap = {
  outputDurationMs: 20_000,
  pieces: [{
    index: 0, sourceStartMs: 0, sourceEndMs: 20_000,
    outputStartMs: 0, outputEndMs: 20_000, transitionInOverlapMs: 0,
  }],
}

const clip = (over: Partial<CompileClip> = {}): CompileClip => ({
  assetId: CLIP_A, checksum: SUM, durationMs: 4_000,
  label: 'the settings page', sceneNumber: 2, ...over,
})

function sink() {
  const list: Array<{ code: string; detail: string }> = []
  return { list, add: (code: string, detail: string) => { list.push({ code, detail }) } }
}

describe('a clip lands on the words it was written into', () => {
  it('places it at the start of its scene', () => {
    const warn = sink()
    const out = placeClips([clip()], SOURCE, WHOLE, TAKE, warn)
    expect(out.overlays).toHaveLength(1)
    expect(out.overlays[0]).toMatchObject({
      index: 0, sourceIndex: 0, fit: 'full_frame',
      sourceStartMs: 0, sourceEndMs: 4_000,
      outputStartMs: 10_000, outputEndMs: 14_000,
      reasonCode: 'declared_slot',
    })
    expect(warn.list).toEqual([])
  })

  it('carries the clip\'s own bytes into the plan', () => {
    // The plan HASH has to cover which footage was composed, or re-recording a
    // clip under the same label leaves plan, hash and manifest identical while
    // the video shows something else.
    const out = placeClips([clip()], SOURCE, WHOLE, TAKE, sink())
    expect(out.sources).toEqual([{
      index: 0, origin: 'screen_capture', assetId: CLIP_A, checksum: SUM, durationMs: 4_000,
    }])
  })

  it('hashes the label rather than carrying it', () => {
    // Creator-written free text never enters the render path — see
    // PlanOverlay.clipLabelSha256.
    const out = placeClips([clip()], SOURCE, WHOLE, TAKE, sink())
    expect(out.overlays[0].clipLabelSha256).toMatch(/^[0-9a-f]{64}$/)
    const other = placeClips([clip({ label: 'the billing screen' })], SOURCE, WHOLE, TAKE, sink())
    expect(other.overlays[0].clipLabelSha256).not.toBe(out.overlays[0].clipLabelSha256)
  })

  it('compiles to nothing when there are no clips — the ordinary video', () => {
    expect(placeClips([], SOURCE, WHOLE, TAKE, sink())).toEqual({ sources: [], overlays: [] })
  })
})

describe('the clip and its window are rarely the same length', () => {
  it('TRIMS a clip longer than its window, never retimes it', () => {
    // Speeding a clip to fit would make the plan's 1x guarantee false, and the
    // contract refuses a source span that differs from its output span.
    const out = placeClips([clip({ durationMs: 30_000 })], SOURCE, WHOLE, TAKE, sink())
    const ov = out.overlays[0]
    expect(ov.sourceEndMs - ov.sourceStartMs).toBe(ov.outputEndMs - ov.outputStartMs)
    expect(ov).toMatchObject({ sourceStartMs: 0, sourceEndMs: 10_000, outputEndMs: 20_000 })
  })

  it('lets a SHORT clip end and the take come back', () => {
    // Not stretched to fill the window: a frozen frame held for six seconds is
    // worse than cutting back to a person talking.
    const out = placeClips([clip({ durationMs: 1_200 })], SOURCE, WHOLE, TAKE, sink())
    expect(out.overlays[0]).toMatchObject({ outputStartMs: 10_000, outputEndMs: 11_200 })
  })

  it('trims from the clip\'s START', () => {
    // The creator recorded it for this line; the part they filmed first is the
    // part they meant, and any other offset is the compiler choosing for them.
    expect(placeClips([clip({ durationMs: 9_000 })], SOURCE, WHOLE, TAKE, sink())
      .overlays[0].sourceStartMs).toBe(0)
  })
})

describe('an unplaceable clip is DROPPED AND SAID, never moved', () => {
  it('drops a clip whose scene was cut away entirely', () => {
    const warn = sink()
    // Only scene 1 survives the cut.
    const cut: TimeMap = {
      outputDurationMs: 10_000,
      pieces: [{
        index: 0, sourceStartMs: 0, sourceEndMs: 10_000,
        outputStartMs: 0, outputEndMs: 10_000, transitionInOverlapMs: 0,
      }],
    }
    const out = placeClips([clip()], SOURCE, cut, TAKE, warn)
    expect(out.overlays).toEqual([])
    expect(out.sources).toEqual([])
    expect(warn.list).toEqual([{ code: 'clip_unplaced', detail: `${CLIP_A}.no_window` }])
  })

  it('drops a clip naming a scene nothing recorded', () => {
    const warn = sink()
    expect(placeClips([clip({ sceneNumber: 9 })], SOURCE, WHOLE, TAKE, warn).overlays).toEqual([])
    expect(warn.list[0].detail).toBe(`${CLIP_A}.no_window`)
  })

  it('refuses the take composited over itself', () => {
    // The contract fails the whole compile on this, so reaching the validator
    // with one would lose the video rather than one cutaway.
    const warn = sink()
    expect(placeClips([clip({ assetId: TAKE })], SOURCE, WHOLE, TAKE, warn).sources).toEqual([])
    expect(warn.list[0].detail).toBe(`${TAKE}.is_the_take`)
  })

  it('drops the LATER of two clips fighting over one stretch', () => {
    // Two markers in one continuous scene. One of them cannot be seen, and
    // picking silently is a decision nobody asked for.
    const warn = sink()
    const out = placeClips(
      [clip(), clip({ assetId: CLIP_B, label: 'the billing screen' })],
      SOURCE, WHOLE, TAKE, warn,
    )
    expect(out.overlays).toHaveLength(1)
    expect(out.sources).toHaveLength(1)
    expect(out.sources[0].assetId).toBe(CLIP_A)
    expect(warn.list).toEqual([{ code: 'clip_unplaced', detail: `${CLIP_B}.overlaps_earlier_clip` }])
  })

  it('drops a clip supplied twice', () => {
    const warn = sink()
    const out = placeClips([clip(), clip()], SOURCE, WHOLE, TAKE, warn)
    expect(out.sources).toHaveLength(1)
    expect(warn.list[0].detail).toBe(`${CLIP_A}.duplicate`)
  })
})

describe('two clips on different scenes both survive, in output order', () => {
  it('sorts by where they land, not by the order they arrived', () => {
    const out = placeClips(
      [clip({ sceneNumber: 2 }), clip({ assetId: CLIP_B, sceneNumber: 1, label: 'the hook shot' })],
      SOURCE, WHOLE, TAKE, sink(),
    )
    expect(out.overlays.map((o) => o.outputStartMs)).toEqual([0, 10_000])
    // Indices are positions, which the contract requires, and sourceIndex
    // points at the right clip after the sort.
    expect(out.overlays.map((o) => o.index)).toEqual([0, 1])
    expect(out.sources[out.overlays[0].sourceIndex].assetId).toBe(CLIP_B)
    expect(out.sources[out.overlays[1].sourceIndex].assetId).toBe(CLIP_A)
  })

  it('every declared source is shown by an overlay', () => {
    // The contract fails a source nothing references, so a dropped clip must
    // take its source row with it.
    const warn = sink()
    const out = placeClips(
      [clip(), clip({ assetId: CLIP_B, sceneNumber: 9 })], SOURCE, WHOLE, TAKE, warn,
    )
    for (const s of out.sources) {
      expect(out.overlays.some((o) => o.sourceIndex === s.index)).toBe(true)
    }
    expect(out.sources).toHaveLength(1)
  })
})
