// Phase 6 — cross-package constant parity. The worker cannot import
// @twinai/shared (its Docker build is self-contained), so the shared contract
// constants and the worker's runtime constants are declared twice BY DESIGN —
// this test is the guard that they can never drift: it reads the worker's
// frozen rules document and constant declarations straight off disk.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  AUDIO_COMPONENT_MAX_BYTES, AUDIO_ANALYSIS_VERSION, HOOK_COMPONENT_MAX_BYTES,
  HOOK_EVIDENCE_VERSION, PIPELINE_EPOCH, SCRIPT_SNAPSHOT_MAX_BYTES,
  VISUAL_ANALYSIS_VERSION, VISUAL_COMPONENT_MAX_BYTES,
} from '../contracts.js'

const workerRoot = join(import.meta.dirname, '..', '..', '..', '..', '..', 'worker')

describe('shared contracts <-> worker runtime constants', () => {
  it('frozen rules document matches the shared numeric contract', () => {
    const rules = JSON.parse(readFileSync(join(workerRoot, 'analysis_rules_v1.json'), 'utf8'))
    expect(rules.rulesVersion).toBe('analysis-rules-1')
    expect(rules.audio.windowSamples).toBe(4800)
    expect(rules.audio.sampleRateHz).toBe(48000)
    expect(rules.audio.clippingThreshold).toBe(0.9995)
    expect(rules.audio.noiseFloorPercentile).toBe(5)
    expect(rules.audio.roomToneMinMs).toBe(800)
    expect(rules.audio.roomToneCap).toBe(120)
    expect(rules.audio.earlyWindowMs).toBe(3000)
    expect(rules.visual.sceneCutThreshold).toBe(0.3)
    expect(rules.visual.sceneMergeWindowMs).toBe(500)
    expect(rules.visual.coarseMaxSamples).toBe(900)
    expect(rules.visual.fineMaxSamples).toBe(360)
    expect(rules.visual.shotCandidateCap).toBe(240)
    expect(rules.visual.face).toEqual({ inputSize: 320, scoreThreshold: 0.6, nmsThreshold: 0.3, topK: 20 })
    expect(rules.hook.windowMs).toBe(3000)
  })

  it('worker editorManifest constants equal the shared exports', () => {
    const src = readFileSync(join(workerRoot, 'src', 'jobs', 'editorManifest.ts'), 'utf8')
    const grab = (name: string): string => {
      const m = new RegExp(`export const ${name} = ('[^']*'|\\d+)`).exec(src)
      if (!m) throw new Error(`worker constant ${name} not found`)
      return m[1].replace(/'/g, '')
    }
    expect(Number(grab('PIPELINE_EPOCH'))).toBe(PIPELINE_EPOCH)
    expect(grab('VISUAL_ANALYSIS_VERSION')).toBe(VISUAL_ANALYSIS_VERSION)
    expect(grab('AUDIO_ANALYSIS_VERSION')).toBe(AUDIO_ANALYSIS_VERSION)
    expect(grab('HOOK_EVIDENCE_VERSION')).toBe(HOOK_EVIDENCE_VERSION)
    expect(Number(grab('VISUAL_COMPONENT_MAX_BYTES'))).toBe(VISUAL_COMPONENT_MAX_BYTES)
    expect(Number(grab('AUDIO_COMPONENT_MAX_BYTES'))).toBe(AUDIO_COMPONENT_MAX_BYTES)
    expect(Number(grab('HOOK_COMPONENT_MAX_BYTES'))).toBe(HOOK_COMPONENT_MAX_BYTES)
    expect(Number(grab('SCRIPT_SNAPSHOT_MAX_BYTES'))).toBe(SCRIPT_SNAPSHOT_MAX_BYTES)
  })

  it('the DB migration enforces the same per-component caps', () => {
    const sql = readFileSync(join(workerRoot, '..', 'supabase', 'migrations',
      '0086_analysis_digest_and_manifest_pin.sql'), 'utf8')
    expect(sql).toContain(`when 'visual' then ${VISUAL_COMPONENT_MAX_BYTES}`)
    expect(sql).toContain(`when 'audio' then ${AUDIO_COMPONENT_MAX_BYTES}`)
    expect(sql).toContain(`else ${HOOK_COMPONENT_MAX_BYTES}`)
  })
})
