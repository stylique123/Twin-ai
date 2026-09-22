// EVERY TYPE WE OFFERED WAS SOMETHING A BUSINESS SELLS.
//
// ⚠️ REPORTED 2026-09-22: "a whole business, not just individual products, as
// an addable entity." The picker offered nine types and every one of them is a
// thing a business PRODUCES — software, an app, a physical product, a course, a
// service, a marketplace. A creator whose videos are about the bakery rather
// than about one loaf had two options: describe a loaf as the subject, which
// makes scripts talk about bread when the story is the shop; or pick OTHER,
// which exists precisely to avoid a wrong guess and which yields the generic
// dashboard walkthrough. The subject of her videos was not in the vocabulary.
//
// ⚖️ A TYPE, NOT A PARENT, AND THAT IS THE WHOLE SCOPE. A business that OWNS
// its products is a hierarchy — a column, a query, and a rule for deciding
// which of the two a given script is about — and nobody asked for that. This is
// the smaller true thing: a business is a subject a creator can declare, read a
// page for, and have scripts talk about. Nothing here prejudges the hierarchy.
//
// ⚠️⚠️ THE MUTANT THIS FILE EXISTS FOR IS "ADD THE ENUM MEMBER AND STOP." It
// typechecks, the picker offers it, a row stores it — and `capabilityQuestion`
// returns null for it, so showability stays UNKNOWN forever, so
// `productSceneGuidance` builds no scene, so a business is a type you can pick
// and can never film. That is this repo's signature defect (shipped, and
// unreachable) wearing a new feature's clothes, and every assertion below
// exists to make that version fail.

import { describe, expect, it } from 'vitest'
import {
  ENTITY_TYPES, inferShowability, capabilityAnswerIsUsed, answeredShowability,
  capabilityQuestion, CAPABILITY_PROMPT, offerFormOf, productSceneGuidance,
} from '../index'

describe('a whole business had no way in', () => {
  it('is a type the contract can store', () => {
    expect((ENTITY_TYPES as readonly string[])).toContain('BUSINESS')
  })

  it('is filmed in the room, not on a screen', () => {
    // ⚠️ THE AXIS IS WHERE THE CAMERA POINTS, NOT WHETHER THE THING IS
    // TANGIBLE. What a creator films of her business is the place and the work
    // — the counter, the bench, her own hands — which is the object permission,
    // not the screen one. Routing it to `canRecordScreen` would have asked a
    // baker whether she can screen-record her bakery.
    expect(inferShowability('BUSINESS', { canFilmObjects: true })).toBe('ALWAYS')
    expect(inferShowability('BUSINESS', { canFilmObjects: false })).toBe('NEVER')
    expect(inferShowability('BUSINESS', { canRecordScreen: true })).toBe('UNKNOWN')
  })

  it('is asked a question that fits, rather than one of the two that do not', () => {
    const q = capabilityQuestion({ type: 'BUSINESS', relationship: 'OWN_PRODUCT' })
    expect(q).toBe('place')
    expect(q).not.toBeNull()
    expect(CAPABILITY_PROMPT.place).toBeTruthy()
  })

  it('is asked rather than assumed, unlike a community', () => {
    // ⚠️ THE TEMPTING SHORTCUT IS "A BUSINESS IS ALWAYS SHOWABLE, SKIP THE
    // QUESTION" — COMMUNITY's argument, which does not transfer. A community is
    // ALWAYS because no answer could change the shot: the creator holds her own
    // phone up. Plenty of creators genuinely cannot film where they work, and
    // assuming otherwise writes a scene they discover is impossible with a
    // phone already in their hand.
    expect(inferShowability('BUSINESS')).toBe('UNKNOWN')
    expect(capabilityAnswerIsUsed('BUSINESS')).toBe(true)
    expect(answeredShowability('BUSINESS', 'SOMETIMES')).toBe('SOMETIMES')
    expect(answeredShowability('BUSINESS', 'NEVER')).toBe('NEVER')
  })

  it('gets scenes about a place, not a dashboard', () => {
    // ⚠️ THE FALL-THROUGH THIS CATCHES. With no entry of its own a BUSINESS
    // lands on SCREEN_MOMENTS, which opens "go to the main screen people
    // actually use — the dashboard, the editor, the feed". Sound advice about
    // software; nonsense about a bakery.
    const g = productSceneGuidance('BUSINESS', 'ALWAYS')
    expect(g.mayShow).toBe(true)
    expect(g.moments.length).toBeGreaterThan(0)
    const all = g.moments.map((m) => `${m.onScreen} ${m.doThis} ${m.sayWhat}`).join(' ')
    expect(all).not.toMatch(/dashboard|screen recording|main screen/i)
    expect(all).toMatch(/where the work happens|workplace|counter|bench/i)
  })

  it('tells the creator to leave the room as it is, which nothing else does', () => {
    // ⚖️ THE ONE BACKGROUND RULE THAT IS NOT "FIND A PLAIN WALL". For every
    // other type the room is a distraction; here it is the subject, and hiding
    // it would remove the only thing these moments are filming.
    const bg = productSceneGuidance('BUSINESS', 'ALWAYS').background ?? ''
    expect(bg).toMatch(/workplace/i)
    expect(bg).not.toMatch(/plain wall\b(?!.*not)/i)
  })

  it('still obeys every capability answer the creator gives', () => {
    // A new type may not quietly acquire a scene the creator refused.
    for (const s of ['NEVER', 'SOMETIMES', 'UNKNOWN'] as const) {
      expect(productSceneGuidance('BUSINESS', s).moments, s).toEqual([])
    }
  })

  it('does not guess what kind of offer a business has', () => {
    // ⚖️ A BAKERY'S IS AN ARTEFACT AND A CONSULTANCY'S IS PERFORMED. Picking
    // either words the question wrongly for half of them; null is the default
    // wording, which is the same answer OTHER gets for the same reason.
    expect(offerFormOf('BUSINESS')).toBeNull()
  })
})
