import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { productSceneGuidance } from '../productScenes'
import { inferShowability, ENTITY_TYPES } from '../productEntity'
import { capabilityQuestion } from '../productQuestions'
import type { EntityType } from '../productEntity'

const repo = join(import.meta.dirname, '..', '..', '..', '..')

// ⚠️ THE SCOPE DECISION, ENFORCED RATHER THAN REMEMBERED. A screen recording is
// a second piece of work: capture it, find it, trim it, drop it into an edit —
// usually on a different device from the one filming. Most creators never do it,
// so the beat ships missing or filled with a still. Everything Twin asks for is
// now something done ON CAMERA, in the take. The screen appears INSIDE the shot.
describe('Twin never asks for a screen recording', () => {
  it('no product guidance emits a screen_recording shot, for any type or showability', () => {
    for (const t of ENTITY_TYPES) {
      for (const s of ['ALWAYS', 'UNKNOWN', 'NEVER'] as const) {
        for (const m of productSceneGuidance(t as EntityType, s).moments) {
          expect(m.sceneType, `${t}/${s}`).not.toBe('screen_recording')
        }
      }
    }
  })

  // ⚖️ AND THE WORDS TOO, NOT ONLY THE TYPE. Retyping a moment while leaving
  // "move the cursor" in the direction would ship a screen recording under a
  // different label — the creator follows the sentence, not the enum.
  it('no direction tells a creator to move a cursor or record a screen', () => {
    const banned = /cursor|screen[- ]record|record (?:your|the) screen|screen capture/i
    for (const t of ENTITY_TYPES) {
      for (const m of productSceneGuidance(t as EntityType, 'ALWAYS').moments) {
        expect(`${m.onScreen} ${m.doThis} ${m.sayWhat}`, `${t}`).not.toMatch(banned)
      }
    }
  })

  it('the writer is told never to ask for one', () => {
    const edge = readFileSync(join(repo, 'supabase', 'functions', 'generate-blueprint', 'index.ts'), 'utf8')
    expect(edge).toMatch(/NEVER ask for a screen recording/)
  })

  // ⚠️ THE READER STAYS LIBERAL, AND THIS IS THE CASE THAT PROTECTS REAL WORK.
  // Measured against production 2026-08-24: 13 of 41 generations carry
  // screen_recording inside their blueprint. Tightening the PARSER would have
  // made a third of every script anybody ever generated fail validation.
  it('already-saved scripts using the old shot type still validate', () => {
    const src = readFileSync(join(repo, 'packages', 'shared', 'src', 'recordingScript.ts'), 'utf8')
    const line = src.split('\n').find((l) => l.includes('new Set<SceneType>'))
    expect(line).toBeDefined()
    expect(line).toContain("'screen_recording'")
  })
})

// ⚠️ THE OWNER'S BUILD PLAN SETTLED THIS, AND IT WAS NEITHER OPTION I OFFERED.
// I asked: delete the community moments, or stop refusing to show a community.
// The answer was a third thing — communities ARE showable, and the shot is a
// camera pointed at a phone, never a screen recording.
describe('a community is filmed, not recorded', () => {
  it('a community is showable without being asked a capability question', () => {
    expect(inferShowability('COMMUNITY', {})).toBe('ALWAYS')
    expect(inferShowability('COMMUNITY', { canRecordScreen: false })).toBe('ALWAYS')
    // ⚖️ NO QUESTION, because no answer could change the outcome. Holding your
    // own phone up needs no permission and no second device.
    expect(capabilityQuestion({ type: 'COMMUNITY', relationship: 'OWN_PRODUCT' })).toBeNull()
  })

  it('a community now actually renders moments', () => {
    const g = productSceneGuidance('COMMUNITY', inferShowability('COMMUNITY', {}))
    expect(g.mayShow).toBe(true)
    expect(g.moments.length).toBeGreaterThan(0)
  })

  // ⚖️ THE SAFE STATE IS THE DEFAULT STATE. The plan is explicit: unanswered
  // privacy is treated as blur, and nothing ships assuming permission. So the
  // covering instruction is unconditional in the direction a creator reads.
  it('the direction covers other people before it shows the room', () => {
    const g = productSceneGuidance('COMMUNITY', 'ALWAYS')
    const all = g.moments.map((m) => `${m.onScreen} ${m.doThis}`).join(' ')
    expect(all).toMatch(/thumb|crop|cover|permission/i)
  })

  it('a service is still not filmable, and that has not changed', () => {
    expect(inferShowability('SERVICE', { canRecordScreen: true })).toBe('NEVER')
  })
})
