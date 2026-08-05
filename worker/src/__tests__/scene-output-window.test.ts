// WHERE A SCENE LANDS IN THE FINISHED VIDEO — the whole of clip placement.
//
// This is arithmetic, not judgement, and that is the point. The capture manifest
// says which source span a scene was recorded in; the time map says where a
// source span lands in the output; a clip declared on that scene plays over
// exactly that window. Nothing here decides anything about quality — the
// creator decided when they wrote the marker into that line — which is why it
// needs no eval.
//
// The case that matters most is the LAST one: a scene is recorded once, but the
// Director removes silences inside it, so a scene's recorded span and its
// surviving output are not the same shape. Mapping the raw span would put a
// cutaway over words that were cut.
import { describe, it, expect, beforeAll } from 'vitest'
import type { sceneOutputWindow as SceneOutputWindow } from '../jobs/editorCompile.js'

let sceneOutputWindow: typeof SceneOutputWindow

beforeAll(async () => {
  process.env.SUPABASE_URL ||= 'https://stub.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'stub-service-role-key'
  ;({ sceneOutputWindow } = await import('../jobs/editorCompile.js'))
})

// Scene 2 was recorded from 10s to 20s of the take.
const WINDOWS = [
  { startMs: 0, endMs: 10_000, sceneNumber: 1 },
  { startMs: 10_000, endMs: 20_000, sceneNumber: 2 },
]

describe('a scene maps through the time map', () => {
  it('finds the output window of a scene kept whole', () => {
    // Scene 1 was dropped entirely, so scene 2 opens the video at 0.
    const window = sceneOutputWindow(2, WINDOWS, [
      { sourceStartMs: 10_000, sourceEndMs: 20_000, outputStartMs: 0 },
    ])
    expect(window).toEqual({ startMs: 0, endMs: 10_000 })
  })

  it('carries the offset when earlier material survives', () => {
    // Scene 1 kept in full, so scene 2 starts 10s into the output.
    const window = sceneOutputWindow(2, WINDOWS, [
      { sourceStartMs: 0, sourceEndMs: 10_000, outputStartMs: 0 },
      { sourceStartMs: 10_000, sourceEndMs: 20_000, outputStartMs: 10_000 },
    ])
    expect(window).toEqual({ startMs: 10_000, endMs: 20_000 })
  })

  it('a scene number nothing recorded gets NO window, not a guessed one', () => {
    // A clip with nowhere to go is not placed. It is not placed somewhere else.
    expect(sceneOutputWindow(9, WINDOWS, [
      { sourceStartMs: 0, sourceEndMs: 20_000, outputStartMs: 0 },
    ])).toBeNull()
  })

  it('an upload source has no scenes, so nothing maps', () => {
    expect(sceneOutputWindow(1, [], [
      { sourceStartMs: 0, sourceEndMs: 20_000, outputStartMs: 0 },
    ])).toBeNull()
  })

  it('a scene cut away entirely gets no window', () => {
    // The creator's words were removed, so the clip that played over them has
    // nothing left to play over.
    expect(sceneOutputWindow(2, WINDOWS, [
      { sourceStartMs: 0, sourceEndMs: 10_000, outputStartMs: 0 },
    ])).toBeNull()
  })
})

describe('the cut inside a scene is respected', () => {
  it('maps only what SURVIVED, never the raw recorded span', () => {
    // Scene 2 ran 10s–20s, but the Director removed 12s–18s as silence. Two
    // pieces survive. Mapping the raw span would put a six-second cutaway over
    // words that are not in the video.
    const window = sceneOutputWindow(2, WINDOWS, [
      { sourceStartMs: 10_000, sourceEndMs: 12_000, outputStartMs: 0 },
      { sourceStartMs: 18_000, sourceEndMs: 20_000, outputStartMs: 2_000 },
    ])
    // The FIRST surviving piece: a cutaway is one continuous window, and the
    // creator's line begins at its first surviving word.
    expect(window).toEqual({ startMs: 0, endMs: 2_000 })
  })

  it('starts at the scene, not at the piece, when a piece straddles two scenes', () => {
    // One kept piece spanning scenes 1 and 2. The window for scene 2 must begin
    // where SCENE 2 does, not where the piece does — otherwise the cutaway
    // starts over the previous scene's words.
    const window = sceneOutputWindow(2, WINDOWS, [
      { sourceStartMs: 5_000, sourceEndMs: 20_000, outputStartMs: 0 },
    ])
    // Scene 2 begins 5s into that piece, which is 5s into the output.
    expect(window).toEqual({ startMs: 5_000, endMs: 15_000 })
  })

  it('ignores a kept piece that does not touch the scene at all', () => {
    const window = sceneOutputWindow(2, WINDOWS, [
      { sourceStartMs: 0, sourceEndMs: 5_000, outputStartMs: 0 },
      { sourceStartMs: 15_000, sourceEndMs: 20_000, outputStartMs: 5_000 },
    ])
    // Only the second piece overlaps scene 2.
    expect(window).toEqual({ startMs: 5_000, endMs: 10_000 })
  })
})
