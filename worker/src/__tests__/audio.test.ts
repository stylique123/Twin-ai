import { beforeAll, describe, expect, it } from 'vitest'

process.env.SUPABASE_URL ||= 'https://stub.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'stub-service-role-key'

import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadAnalysisRules } from '../jobs/editorManifest.js'
import type { CancelWatch } from '../jobs/editorCancel.js'
import type { PcmWindowStats } from '../jobs/editorAudio.js'

// editorAudio imports env (worker config), so it must load AFTER the stub env
// above — dynamic import, same pattern as speech.test.ts.
const {
  buildAudioAnalysis, decodePcm, deriveAudioStats, measureLoudness, medianEvenMean,
  parseEbur128Summary, percentileNearestLower, rmsToDb, scanPcmFile,
} = await import('../jobs/editorAudio.js')

const { rules, boundsSha256 } = loadAnalysisRules()
const dir = mkdtempSync(join(tmpdir(), 'phase6-audio-'))

const fakeWatch = (): CancelWatch => ({
  signal: new AbortController().signal,
  cancelled: () => false,
  stop: () => {},
})

function writePcm(name: string, samples: Int16Array): string {
  const p = join(dir, name)
  writeFileSync(p, Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength))
  return p
}

describe('window boundaries (exact 4800-sample windows)', () => {
  it('9600 samples => 2 full windows, 0 trailing; 10000 => 2 full + 400 trailing', async () => {
    const a = await scanPcmFile(writePcm('a.pcm', new Int16Array(9600)), rules)
    expect(a.totalSamples).toBe(9600)
    expect(a.fullWindows).toBe(2)
    expect(a.trailingSamples).toBe(0)
    const b = await scanPcmFile(writePcm('b.pcm', new Int16Array(10000)), rules)
    expect(b.totalSamples).toBe(10000)
    expect(b.fullWindows).toBe(2)
    expect(b.trailingSamples).toBe(400)
  })

  it('trailing samples are excluded from window stats but counted for clipping', async () => {
    const s = new Int16Array(4800 + 100)
    for (let i = 4800; i < 4900; i++) s[i] = 32767 // clipped tail beyond the last full window
    const st = await scanPcmFile(writePcm('c.pcm', s), rules)
    expect(st.fullWindows).toBe(1)
    expect(st.windowDb[0]).toBe(rules.audio.silenceDbFloor) // the full window is silent
    expect(st.clippedSampleCount).toBe(100)
  })
})

describe('clipping threshold (|s/32768| >= 0.9995, exact count)', () => {
  it('counts 32752 and -32768 as clipped, 32751 as not clipped', async () => {
    // 32752/32768 = 0.99951171875 >= 0.9995; 32751/32768 = 0.99948... < 0.9995
    const s = new Int16Array(4800)
    s[0] = 32752; s[1] = 32751; s[2] = -32768; s[3] = -32752; s[4] = -32751
    const st = await scanPcmFile(writePcm('d.pcm', s), rules)
    expect(st.clippedSampleCount).toBe(3)
  })
})

describe('window RMS -> dB', () => {
  it('constant half-scale signal measures -6.02 dBFS per window', async () => {
    const s = new Int16Array(9600).fill(16384) // x = 0.5 exactly
    const st = await scanPcmFile(writePcm('e.pcm', s), rules)
    expect(st.windowDb).toEqual([-6.02, -6.02])
    expect(st.wholeDb).toBe(-6.02)
  })
  it('rmsToDb: zero is the silence floor, rounding is 2 decimals', () => {
    expect(rmsToDb(0, -120)).toBe(-120)
    expect(rmsToDb(0.5, -120)).toBe(-6.02)
    expect(rmsToDb(1, -120)).toBe(0)
  })
})

describe('frozen derived statistics', () => {
  it('percentile: nearest-lower rank floor(0.05*(N-1))', () => {
    const vals = [...Array.from({ length: 5 }, () => -80), ...Array.from({ length: 95 }, () => -20)]
    expect(percentileNearestLower([...vals].sort((a, b) => a - b), 5)).toBe(-80)
    expect(percentileNearestLower([1, 2, 3], 5)).toBe(1)
  })
  it('median: mean of the two middle values for even N', () => {
    expect(medianEvenMean([-30, -20])).toBe(-25)
    expect(medianEvenMean([-30, -20, -10])).toBe(-20)
  })

  const mkStats = (windowDb: number[]): PcmWindowStats => ({
    totalSamples: windowDb.length * 4800, fullWindows: windowDb.length, trailingSamples: 0,
    clippedSampleCount: 0, windowDb, earlyDb: null, wholeDb: null,
  })

  it('SNR = median(speech windows) - noise floor; word overlap >= 1ms marks a window', () => {
    // 20 windows (2s): windows 5..14 carry speech at -20, the rest silence at -80.
    const windowDb = Array.from({ length: 20 }, (_, i) => (i >= 5 && i < 15 ? -20 : -80))
    const d = deriveAudioStats(mkStats(windowDb), [{ startMs: 500, endMs: 1500 }], rules)
    expect(d.noiseFloorDb).toBe(-80)
    expect(d.medianSpeechRmsDb).toBe(-20)
    expect(d.snrDb).toBe(60)
  })

  it('room tone: runs >= 800ms of word-free windows within +3 dB of the floor; short runs dropped', () => {
    // floor = -80. A 10-window quiet run (0..999ms), a 7-window run (too short),
    // and quiet windows under a word (excluded).
    const windowDb = new Array(40).fill(-20)
    for (let i = 0; i < 10; i++) windowDb[i] = -79      // 0..1000ms quiet
    for (let i = 15; i < 22; i++) windowDb[i] = -80     // 700ms — too short
    for (let i = 30; i < 40; i++) windowDb[i] = -80     // quiet but overlapped by a word
    const d = deriveAudioStats(mkStats(windowDb), [{ startMs: 3000, endMs: 4000 }], rules)
    expect(d.roomTone).toEqual([{ startMs: 0, endMs: 1000, meanRmsDb: -79 }])
  })

  it('earlyEnergyRatio = clamp(10^((early-whole)/20), 0, 4)', () => {
    const base = mkStats(new Array(10).fill(-30))
    const d1 = deriveAudioStats({ ...base, earlyDb: -6, wholeDb: -12 }, [], rules)
    expect(d1.earlyEnergyRatio).toBe(1.9953)
    const d2 = deriveAudioStats({ ...base, earlyDb: -6, wholeDb: -46 }, [], rules)
    expect(d2.earlyEnergyRatio).toBe(4) // clamped
  })

  it('zero windows => nulls + empty room tone (frozen no-analysis shape)', () => {
    const d = deriveAudioStats(mkStats([]), [], rules)
    expect(d).toEqual({ noiseFloorDb: null, medianSpeechRmsDb: null, snrDb: null, roomTone: [], earlyEnergyRatio: null })
  })
})

describe('ebur128 summary parsing', () => {
  it('extracts I / LRA / true peak from the summary block', () => {
    const fixture = [
      '[Parsed_ebur128_0 @ 0x55] Summary:',
      '', '  Integrated loudness:', '    I:         -23.1 LUFS', '    Threshold: -33.6 LUFS',
      '', '  Loudness range:', '    LRA:        6.5 LU', '    Threshold: -43.6 LUFS',
      '    LRA low:   -28.8 LUFS', '    LRA high:  -22.3 LUFS',
      '', '  True peak:', '    Peak:      -2.5 dBFS',
    ].join('\n')
    expect(parseEbur128Summary(fixture)).toEqual({ integratedLufs: -23.1, loudnessRangeLu: 6.5, truePeakDbtp: -2.5 })
  })
  it('missing summary => nulls', () => {
    expect(parseEbur128Summary('no summary here')).toEqual({ integratedLufs: null, loudnessRangeLu: null, truePeakDbtp: null })
  })
})

describe('no-audio contract shape', () => {
  it('nulls + clippedSampleCount 0 + [] roomTone', () => {
    const r = buildAudioAnalysis({ id: 'a', content_sha256: 'x' },
      { audioPresent: false, stats: null, derived: null, loudness: null, ffmpegVersionBannerSha256: null },
      rules, boundsSha256) as Record<string, any>
    expect(r.audioPresent).toBe(false)
    expect(r.clippedSampleCount).toBe(0)
    expect(r.roomTone).toEqual([])
    expect(r.noiseFloorDb).toBeNull()
    expect(r.snrDb).toBeNull()
    expect(r.loudness).toEqual({ integratedLufs: null, loudnessRangeLu: null, truePeakDbtp: null })
    expect(r.earlyEnergyRatio).toBeNull()
  })
})

// ffmpeg availability — the CI unit-tests job installs it; a bare machine
// without it self-skips the live fixture (the staging matrix always has it).
const hasFfmpeg = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0

// Real-ffmpeg end-to-end fixture: 1s silence + 2s half-scale 1 kHz sine + 1s
// silence. Proves the decode -> scan -> derive -> ebur128 chain with the
// frozen ±1.0 LU loudness gate and exact-zero clipping (0 false positives).
describe.skipIf(!hasFfmpeg)('ffmpeg fixture (LUFS ±1.0 LU, clipping 0 FP, room tone, SNR)', () => {
  // Build fixtures in beforeAll — NOT in the describe body. A skipped describe
  // (bare machine, no ffmpeg) never runs beforeAll, so the ffmpeg calls only
  // happen when ffmpeg is actually present. (In the describe body they would
  // run at COLLECTION time, before skipIf takes effect, and crash a bare box.)
  const wav = join(dir, 'fixture.wav')
  beforeAll(() => {
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'lavfi', '-i', "aevalsrc=if(between(t\\,1\\,3)\\,0.5*sin(2*PI*1000*t)\\,0):s=48000:d=4",
      '-ar', '48000', '-ac', '1', '-c:a', 'pcm_s16le', wav])
  })

  it('windowed stats + derived evidence match the analytic values', async () => {
    const pcm = join(dir, 'fixture.pcm')
    await decodePcm(wav, pcm, fakeWatch(), rules)
    const stats = await scanPcmFile(pcm, rules)
    expect(stats.totalSamples).toBe(192000)
    expect(stats.fullWindows).toBe(40)
    expect(stats.clippedSampleCount).toBe(0) // half-scale sine: zero false positives
    // Sine windows: rms = 0.5/sqrt(2) -> -9.03 dBFS (allow tiny quantization).
    const sineWindows = stats.windowDb.slice(11, 29)
    for (const db of sineWindows) expect(Math.abs(db - -9.03)).toBeLessThanOrEqual(0.05)
    const derived = deriveAudioStats(stats, [{ startMs: 1000, endMs: 3000 }], rules)
    expect(derived.medianSpeechRmsDb).not.toBeNull()
    expect(Math.abs((derived.medianSpeechRmsDb as number) - -9.03)).toBeLessThanOrEqual(0.1)
    expect(derived.noiseFloorDb).toBeLessThan(-85) // digital silence (maybe dithered)
    expect(derived.snrDb as number).toBeGreaterThan(60)
    // Room tone: the two silent seconds, word-free, at/near the floor.
    expect(derived.roomTone.length).toBeGreaterThanOrEqual(2)
    const spans = derived.roomTone.map((t) => [t.startMs, t.endMs])
    expect(spans).toContainEqual([0, 1000])
    expect(spans).toContainEqual([3000, 4000])
    // Early window (0..3s) is quieter than... louder than the whole? early has
    // 2/3 of the sine energy over 3/4 of the samples: ratio > 1 slightly.
    expect(derived.earlyEnergyRatio as number).toBeGreaterThan(1)
    expect(derived.earlyEnergyRatio as number).toBeLessThan(1.4)
  }, 30000)

  it('ebur128 separate pass: integrated loudness within ±1.0 LU of -9.0, true peak ≈ -6.0', async () => {
    const l = await measureLoudness(wav, fakeWatch())
    expect(l.integratedLufs).not.toBeNull()
    expect(Math.abs((l.integratedLufs as number) - -9.0)).toBeLessThanOrEqual(1.0)
    expect(l.truePeakDbtp).not.toBeNull()
    expect(Math.abs((l.truePeakDbtp as number) - -6.0)).toBeLessThanOrEqual(0.7)
  }, 30000)

  it('clipping fixture: a full-scale overdriven sine counts clipped samples exactly and reproducibly', async () => {
    const wavClip = join(dir, 'clip.wav')
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'lavfi', '-i', 'aevalsrc=min(max(2*sin(2*PI*440*t)\\,-1)\\,1):s=48000:d=1',
      '-ar', '48000', '-ac', '1', '-c:a', 'pcm_s16le', wavClip])
    const pcm1 = join(dir, 'clip1.pcm'); const pcm2 = join(dir, 'clip2.pcm')
    await decodePcm(wavClip, pcm1, fakeWatch(), rules)
    await decodePcm(wavClip, pcm2, fakeWatch(), rules)
    const s1 = await scanPcmFile(pcm1, rules)
    const s2 = await scanPcmFile(pcm2, rules)
    // A ±1.0-saturated 440 Hz sine spends 2*asin(0.9995)/pi... most of ~2/3 of
    // each period at |x| >= 0.9995 clamp region: assert a large, EXACTLY
    // reproducible count (same bytes -> same count, twice).
    expect(s1.clippedSampleCount).toBeGreaterThan(20000)
    expect(s1.clippedSampleCount).toBe(s2.clippedSampleCount)
    expect(s1.windowDb).toEqual(s2.windowDb)
  }, 30000)
})
