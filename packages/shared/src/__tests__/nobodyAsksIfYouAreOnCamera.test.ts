// AN ENTIRE PAYING SEGMENT WAS BLOCKED BY A MISSING QUESTION, NOT A MISSING FEATURE.
//
// ⚠️ THE MEASURED CASE. A faceless voiceover channel gets a script whose every
// scene is a note about how to stand and move, because the writer is told
// `location: WHERE THE CREATOR PHYSICALLY STANDS` on every generation. They post
// daily and they buy tools, and the script is unusable to them.
//
// ⚖️ AND THE SCHEMA COULD ALWAYS DESCRIBE THE ANSWER. `recordingScript.ts` says a
// b_roll scene "is never a teleprompter scene unless it carries voiceover", so
// voice-over-footage has always been expressible. Only the question was missing.
// A capability nobody is asked about is a capability nobody has.
//
// ⚖️ THESE ASSERT THE CONTRACT AROUND THE ANSWER, not the prose of the block the
// writer receives — that text is meant to be edited. What must survive any edit:
// the key is stored, it is asked, and an UNANSWERED creator is left exactly as
// they are today.
import { describe, it, expect } from 'vitest'
import {
  BRIEF_STORED_KEYS, BRIEF_QUESTIONS, BRIEF_ON_CAMERA, sanitizeBriefForWrite,
} from '../preScriptBrief'

describe('the question that decides whether a script is filmable', () => {
  it('is stored, so an answer survives the screen it was given on', () => {
    expect(BRIEF_STORED_KEYS).toContain('onCamera')
  })

  it('is actually asked, and offers the faceless answer', () => {
    const q = BRIEF_QUESTIONS.find((x) => x.id === 'onCamera')
    expect(q, 'onCamera is stored but never asked — a column nothing fills').toBeDefined()
    expect(q!.options).toEqual(BRIEF_ON_CAMERA)
    expect(BRIEF_ON_CAMERA).toContain('voice_only')
  })

  it('carries a reason that argues its own placement', () => {
    // ⚖️ EVERY QUESTION CARRIES `because` SO A FUTURE READER MOVING IT HAS TO
    // ARGUE WITH THE REASON. This one was FIRST WRITTEN as on_confirm, which
    // broke the module's own split — every confirm-screen question is pre-filled
    // and this one must not be. The rule was right and the placement was wrong:
    // it is an INTENT question, so it belongs during the scan. The reason has to
    // name the trap, because the next person will also mistake a visible face
    // for an observable answer.
    const q = BRIEF_QUESTIONS.find((x) => x.id === 'onCamera')!
    expect(q.because.length).toBeGreaterThan(80)
    expect(q.because).toMatch(/intend|moving to faceless|HAVE done/i)
  })

  it('keeps the three answers distinct — mixed is not fence-sitting', () => {
    // Collapsing `mixed` into `on_camera` hands staging to every beat of a
    // half-faceless video, which is the original defect in a smaller hat.
    expect(new Set(BRIEF_ON_CAMERA).size).toBe(3)
    expect(BRIEF_ON_CAMERA).toContain('mixed')
  })

  it('survives the write path that stores it', () => {
    const out = sanitizeBriefForWrite({ onCamera: 'voice_only' } as Record<string, unknown>)
    expect(out.onCamera).toBe('voice_only')
  })

  it('an unanswered creator stores nothing — absent is not voice_only', () => {
    // ⚠️ THE FAILURE DIRECTION THAT WOULD BE WORSE THAN THE BUG. Defaulting an
    // unanswered creator to faceless would strip staging from everyone who never
    // saw the question — breaking the majority case to serve the minority.
    const out = sanitizeBriefForWrite({ onCamera: '' } as Record<string, unknown>)
    expect('onCamera' in out).toBe(false)
  })
})
