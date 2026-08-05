// WHAT THE BROWSER MAY CLAIM TO HAVE MEASURED.
//
// The engine's four states only work if the measurer is honest about which
// signals it actually produced. Every test here is about an ABSENCE surviving:
// a check nothing looked at must arrive as `unmeasured`, because the moment it
// arrives as a number the panel draws a green tick for a room nobody heard.
import { describe, expect, it } from 'vitest'
import { evaluatePreflight } from '@twinai/shared'
import { frameOf, hasLiveAudio, measurePreflight, samplePeakMilli } from './preflightSignals'

type Track = { kind: string; readyState: string; enabled: boolean; getSettings?: () => unknown }

function stream(video: Partial<Track> | null, audio: Partial<Track> | null): MediaStream {
  const v: Track[] = video ? [{ kind: 'video', readyState: 'live', enabled: true, ...video }] : []
  const a: Track[] = audio ? [{ kind: 'audio', readyState: 'live', enabled: true, ...audio }] : []
  return {
    getVideoTracks: () => v, getAudioTracks: () => a, getTracks: () => [...v, ...a],
  } as unknown as MediaStream
}

describe('the frame size comes from the track, then the element', () => {
  it('prefers the track settings', () => {
    expect(frameOf(stream({ getSettings: () => ({ width: 1080, height: 1920 }) }, null)))
      .toEqual({ widthPx: 1080, heightPx: 1920 })
  })

  it('falls back to the element once it is painting', () => {
    // A track that reports no dimensions is ordinary on some browsers; the
    // element knows once a frame has decoded.
    expect(frameOf(stream({ getSettings: () => ({}) }, null), { videoWidth: 720, videoHeight: 1280 }))
      .toEqual({ widthPx: 720, heightPx: 1280 })
  })

  it('is ABSENT rather than zero when nothing knows yet', () => {
    // Zero would divide into a nonsense aspect ratio and report `landscape` for
    // a camera that has simply not delivered a frame.
    expect(frameOf(stream({ getSettings: () => ({}) }, null), { videoWidth: 0, videoHeight: 0 })).toBeNull()
    expect(frameOf(null)).toBeNull()
  })
})

describe('an audio track has to be live to count', () => {
  it('an ended track is not a microphone', () => {
    // An unplugged headset leaves the track in place. Reporting it as present
    // would tell the creator their mic is fine while nothing is recording.
    expect(hasLiveAudio(stream(null, { readyState: 'ended' }))).toBe(false)
    expect(hasLiveAudio(stream(null, { enabled: false }))).toBe(false)
    expect(hasLiveAudio(stream(null, {}))).toBe(true)
    expect(hasLiveAudio(stream(null, null))).toBe(false)
  })
})

describe('a level nobody sampled is null, never zero', () => {
  it('returns null with no audio track at all', async () => {
    expect(await samplePeakMilli(stream({}, null))).toBeNull()
  })

  it('returns null when the context will not run', async () => {
    // A silent room and a dead probe both produce zero. Reporting 0 from a probe
    // that never ran is a `mic_too_quiet` verdict about a mic nobody listened to.
    const ctx = { state: 'suspended', resume: async () => {}, close: async () => {} }
    expect(await samplePeakMilli(stream({}, {}), () => ctx as unknown as AudioContext)).toBeNull()
  })

  it('returns null rather than throwing when the context cannot be made', async () => {
    expect(await samplePeakMilli(stream({}, {}), () => { throw new Error('no AudioContext') }))
      .toBeNull()
  })
})

describe('what an unmeasurable browser reports', () => {
  it('measures orientation and the mic, and leaves the rest unmeasured', async () => {
    // The contract the panel depends on: three checks come back as "we did not
    // look", NOT as passes.
    const signals = await measurePreflight(
      stream({ getSettings: () => ({ width: 1080, height: 1920 }) }, null),
    )
    const report = evaluatePreflight(signals)
    // `mic` is absent from this list because a MISSING audio track is a real
    // failure rather than an absence — knowable without sampling anything.
    expect(report.unmeasured.sort()).toEqual(['framing', 'lighting', 'room'])
    expect(report.checks.find((c) => c.id === 'orientation')!.state).toBe('ok')
  })

  it('never sends a reverb ratio it did not measure', async () => {
    // The whole reason `audio`'s two halves were split. A fabricated 0 sits
    // comfortably under the ceiling and renders as "room sounds fine".
    const signals = await measurePreflight(
      stream({ getSettings: () => ({ width: 1080, height: 1920 }) }, null),
    )
    expect(signals.audio?.reverbRatioMilli).toBeUndefined()
    expect(evaluatePreflight(signals).checks.find((c) => c.id === 'room')!.state).toBe('unmeasured')
  })

  it('a missing microphone is a real FAILURE, not an absence', async () => {
    // Knowable without sampling, and the whole pipeline is downstream of speech:
    // a silent take cannot be captioned, cut or normalised.
    const signals = await measurePreflight(stream({ getSettings: () => ({ width: 1080, height: 1920 }) }, null))
    expect(signals.hasAudioTrack).toBe(false)
    const mic = evaluatePreflight(signals).checks.find((c) => c.id === 'mic')!
    expect(mic.state).toBe('fail')
    expect(mic.reason).toBe('no_audio_track')
  })

  it('a mic that is PRESENT but unsampled is unmeasured, not fine', async () => {
    // The track exists, so `no_audio_track` does not apply; nothing could read a
    // level, so the verdict is "we did not listen" rather than a pass.
    const signals = await measurePreflight(
      stream({ getSettings: () => ({ width: 1080, height: 1920 }) }, {}),
      null,
      () => { throw new Error('no AudioContext in this environment') },
    )
    expect(signals.hasAudioTrack).toBe(true)
    expect(evaluatePreflight(signals).checks.find((c) => c.id === 'mic')!.state).toBe('unmeasured')
  })

  it('a sideways phone is caught before a single frame is recorded', async () => {
    const signals = await measurePreflight(stream({ getSettings: () => ({ width: 1920, height: 1080 }) }, null))
    const orientation = evaluatePreflight(signals).checks.find((c) => c.id === 'orientation')!
    expect(orientation.state).toBe('fail')
    expect(orientation.reason).toBe('landscape')
  })
})
