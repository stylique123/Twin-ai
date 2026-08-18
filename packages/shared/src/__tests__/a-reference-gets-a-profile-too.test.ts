// THE GALLERY WAS COMPARING A KNOWN CREATOR TO AN UNKNOWN VIDEO.
//
// ⚠️ TWIN KNOWS THE CREATOR'S AUDIENCE, GOALS, FORMATS, COMMERCIAL RELATIONSHIP,
// PRODUCTS AND VOICE. It knew seven fields about a reference, one of which — the
// niche label — carried the entire comparison. The intelligence existed on one
// side and not the other, so the gallery could only ask "is this roughly your
// niche?".
//
// ⚖️ `ReferenceProfile` IS THE OTHER SIDE. This file pins the properties that
// keep it honest while it is still almost entirely empty — which is the state of
// all 9,504 cards today, and therefore the state it must behave correctly in.
import { describe, expect, it } from 'vitest'
import {
  emptyReferenceProfile, unchecked, isKnown,
  ASSESSMENT_BASIS, PRODUCTION_MODES, CONTAINER_TYPES, FEASIBILITY, TRANSFERABILITY,
  type Assessed,
} from '../referenceProfile'
import { GALLERY_SIGNALS, rankSignals, blockedSignals } from '../galleryRank'

describe('an unassessed card is a valid profile, because that is every card', () => {
  const p = emptyReferenceProfile('card-1', 'Beauty')

  it('every field starts not_checked', () => {
    expect(p.content.topic.basis).toBe('not_checked')
    expect(p.structure.container.basis).toBe('not_checked')
    expect(p.production.primaryMode.basis).toBe('not_checked')
  })

  it('and nothing is silently false', () => {
    // ⚠️ THE RULE THIS WHOLE CODEBASE RUNS ON. `propsRequired` unchecked must
    // not read as "needs no props", or a creator with no props is told every
    // unassessed card suits them.
    expect(isKnown(p.production.propsRequired)).toBe(false)
    expect((p.production.propsRequired as { value?: unknown }).value).toBeUndefined()
  })

  it('the scraped niche is kept but is no longer the only thing known', () => {
    // ⚖️ DEMOTED, NOT DELETED. It stays as the weakest field rather than being
    // thrown away, because it is real and it is what we have today.
    expect(p.content.niche).toBe('Beauty')
    expect(Object.keys(p.content).length).toBeGreaterThan(1)
  })

  it('every unchecked field names the measurement that would answer it', () => {
    // ⚠️ SO THE BATCH JOB'S WORKLIST LIVES IN THE TYPE rather than in somebody's
    // head. A `not_checked` with no `needs` is an open question pretending to be
    // a task.
    const fields: Assessed<unknown>[] = [
      p.content.subNiche, p.content.topic, p.content.intendedAudience, p.content.likelyGoals,
      p.structure.container, p.structure.slots, p.structure.topicSpecificity,
      p.production.primaryMode, p.production.peopleOnCamera, p.production.propsRequired,
      p.production.physicalProductRequired, p.production.softwareDemoRequired,
      p.production.actingRequired, p.production.locationDependent,
    ]
    for (const f of fields) {
      expect(f.basis).toBe('not_checked')
      expect((f as { needs: string }).needs.length).toBeGreaterThan(10)
    }
  })

  it('and reports itself as unassessed rather than as assessed-with-nothing', () => {
    expect(p.evidence.observedFields).toBe(0)
    expect(p.evidence.transcriptAvailable).toBe(false)
  })
})

describe('how a fact was learned travels with it', () => {
  it('observed and inferred are different claims', () => {
    // ⚠️ A VALUE READ OFF A TRANSCRIPT AND ONE GUESSED FROM A TITLE ARE NOT THE
    // SAME CLAIM, and the weaker one must never be laundered into the stronger.
    expect(ASSESSMENT_BASIS).toEqual(['observed', 'inferred', 'not_checked'])
  })

  it('a claimed value cannot arrive without its evidence', () => {
    // ⚖️ STRUCTURAL, NOT A CONVENTION. The union has no `observed` variant
    // without `evidence`, so this is a compile-time guarantee that a test can
    // only demonstrate.
    const observed: Assessed<string> = {
      value: 'talking_head', basis: 'observed',
      evidence: 'single speaker, one framing, whole runtime', assessedAt: '2026-08-18T00:00:00.000Z',
    }
    expect(isKnown(observed)).toBe(true)
    expect(observed.basis === 'observed' && observed.evidence.length > 0).toBe(true)
  })

  it('and an unchecked field carries no value at all', () => {
    const u = unchecked<string>('a transcript')
    expect(isKnown(u)).toBe(false)
  })
})

describe('the vocabularies say what they must be able to say', () => {
  it('production modes include one Twin cannot help with', () => {
    // ⚠️ `other_unsupported` IS A REAL ANSWER, not a fallback bucket. Filing a
    // cinematic multi-camera piece under the nearest supported mode would
    // promise a creator a recreation that cannot happen.
    expect(PRODUCTION_MODES).toContain('other_unsupported')
    expect(PRODUCTION_MODES).toContain('screen_software')
  })

  it('feasibility and transferability are words, never numbers', () => {
    // ⚖️ `DIFFICULT` IS SOMETHING SOMEBODY CAN DISAGREE WITH. `0.42` is not.
    for (const f of [...FEASIBILITY, ...TRANSFERABILITY]) {
      expect(f).not.toMatch(/\d/)
    }
    expect(FEASIBILITY).toContain('not_checked')
    expect(TRANSFERABILITY).toContain('not_checked')
  })

  it('containers name shapes that survive a change of subject', () => {
    // ⚠️ THE CONTAINER IS THE THING WORTH STEALING — it is why a cross-niche
    // reference can beat an on-niche one.
    for (const c of ['mistakes', 'confession', 'before_after', 'comparison']) {
      expect(CONTAINER_TYPES).toContain(c)
    }
  })
})

describe('commercial fit is its own signal', () => {
  it('is declared, and eight signals come back', () => {
    // ⚠️ IT WAS LIVING INSIDE content_availability, and the two answer different
    // questions: whether Twin CAN fill a format, and whether this creator is
    // ALLOWED to make it. An affiliate can fill every slot of "why we built
    // this" and must still not make it.
    expect(GALLERY_SIGNALS).toContain('commercial_fit')
    expect(rankSignals({ nicheRelation: 'unknown' }).map((s) => s.id)).toEqual([...GALLERY_SIGNALS])
  })

  it('and it is honest about being unbuilt', () => {
    const s = rankSignals({ nicheRelation: 'unknown' })
    const cf = s.find((x) => x.id === 'commercial_fit')!
    expect(cf.status).toBe('not_checked')
    expect(cf.needs).toMatch(/commercial/)
    expect(blockedSignals(s).length).toBe(7)
  })
})
