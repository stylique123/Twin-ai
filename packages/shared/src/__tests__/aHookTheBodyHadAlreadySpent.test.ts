// A HOOK THE BODY HAD ALREADY SPENT.
//
// ⚠️ `hookBodyCollisionBeatCount` HAS COUNTED THIS SINCE FIX 8a AND NOTHING
// ACTED ON IT. The edge function's own comment states why: "COUNTED, NOT
// ENFORCED... `demoteUnsupportedHooks` is already the place to reorder on when
// this is worth acting on."
//
// ⚠️⚠️ MEASURED ON PRODUCTION 2026-09-14, over the 85 generations carrying
// `beat_audit.hook_body_collisions`:
//
//     runs with at least one collision ....... 22 of 85   (26%)
//     colliding beats in total ............... 24
//     worst single run ....................... 3 beats
//
// A quarter of runs offer the creator a hook the script has already spent. That
// is the population the deferral was waiting for.
//
// ⚖️ DEMOTION IS CORRECT UNDER EITHER READING OF THE SYMPTOM, which is why it
// is the fix that can be built without new evidence. A hook whose content a
// body beat restates is not a distinct choice: pick it and the script says the
// same thing twice; leave it and the body pre-empted the opener it was offered
// as. Rewriting the body to suit a chosen hook is the OPPOSITE fix and needs
// evidence about which beat is load-bearing.
import { describe, expect, it } from 'vitest'
import {
  demoteCollidedHooks, hookBodyCollisions, CONTAINMENT_THRESHOLD,
} from '../script/hookBodyCollision'

// A real shape: five hooks, and a body whose third beat restates hook 2.
const HOOKS = [
  'I rebound a Bible that had been in one family for ninety years.',
  'Stop buying new Bibles when the one you have can be saved.',
  'The spine is the first thing to fail, and the last thing anyone fixes.',
  'Three signs your book needs rebinding before the pages start walking.',
  'Nobody teaches this, so I learned it from a 1940s trade manual.',
]
const beat = (line: string) => ({ line })
const BODY = [
  beat('This one came in with the cover detached and the text block loose.'),
  beat('First I pull the old spine and clean ninety years of hide glue off.'),
  // Restates HOOKS[2] almost word for word.
  beat('The spine is the first thing to fail and the last thing anyone fixes.'),
  beat('New endpapers, an Oxford hollow, then the saddle stitch goes back in.'),
]

describe('the collision the counter has been reporting all along', () => {
  it('finds the body beat that restates a non-selected hook', () => {
    const found = hookBodyCollisions(HOOKS, BODY)
    expect(found.length, 'the fixture no longer collides — it cannot discriminate').toBeGreaterThan(0)
    expect(found.some((c) => c.hookIndex === 2 && c.beatIndex === 2)).toBe(true)
    for (const c of found) expect(c.containmentScore).toBeGreaterThanOrEqual(CONTAINMENT_THRESHOLD)
  })

  it('never flags hook_options[0], whose own beat is drawn from it', () => {
    // The opener restated verbatim in the body must still not be a collision:
    // index 0 is skipped by construction, not filtered afterwards.
    const withOpenerEchoed = [...BODY, beat(HOOKS[0])]
    expect(hookBodyCollisions(HOOKS, withOpenerEchoed).some((c) => c.hookIndex === 0)).toBe(false)
  })
})

describe('demoteCollidedHooks reorders, and only that', () => {
  const out = demoteCollidedHooks(HOOKS, BODY)

  it('moves the spent hook behind every clean one', () => {
    expect(out.found).toBeGreaterThan(0)
    expect(out.hooks.indexOf(HOOKS[2])).toBe(out.hooks.length - out.found)
    // Everything clean sits ahead of it.
    expect(out.hooks.slice(0, out.hooks.length - out.found)).not.toContain(HOOKS[2])
  })

  it('keeps the writer’s recommended pick first', () => {
    // ⚖️ NOT A HAPPY ACCIDENT: index 0 can never collide, so a stable partition
    // always leaves it leading. This is the assertion that makes the missing
    // "all five flagged" fallback safe.
    expect(out.hooks[0]).toBe(HOOKS[0])
  })

  it('drops nothing and invents nothing', () => {
    expect(out.hooks).toHaveLength(HOOKS.length)
    expect([...out.hooks].sort()).toEqual([...HOOKS].sort())
  })

  it('is stable — the writer’s order survives inside each group', () => {
    const clean = HOOKS.filter((h) => h !== HOOKS[2])
    expect(out.hooks.slice(0, clean.length)).toEqual(clean)
  })

  it('is a no-op when nothing collides, and says so', () => {
    const clean = demoteCollidedHooks(HOOKS, [beat('Something else entirely about tannage.')])
    expect(clean.found).toBe(0)
    expect(clean.demoted).toBe(0)
    expect(clean.hooks).toEqual(HOOKS)
  })

  it('reports found without demoted when the spent hook was already last', () => {
    // ⚖️ THE TWO NUMBERS ANSWER DIFFERENT QUESTIONS. `found` is what the rule
    // detected; `demoted` is what the creator's screen actually changed.
    // Collapsing them would overstate the second.
    const reordered = [HOOKS[0], HOOKS[1], HOOKS[3], HOOKS[4], HOOKS[2]]
    const r = demoteCollidedHooks(reordered, BODY)
    expect(r.found).toBeGreaterThan(0)
    expect(r.demoted).toBe(0)
    expect(r.hooks).toEqual(reordered)
  })

  it('survives junk without throwing or fabricating', () => {
    expect(demoteCollidedHooks(null, BODY)).toEqual({ hooks: [], found: 0, demoted: 0 })
    expect(demoteCollidedHooks([], BODY)).toEqual({ hooks: [], found: 0, demoted: 0 })
    expect(demoteCollidedHooks(HOOKS, null).hooks).toEqual(HOOKS)
    // Non-strings are dropped the same way the existing caller already filters.
    expect(demoteCollidedHooks([HOOKS[0], 7, HOOKS[1]], BODY).hooks).toEqual([HOOKS[0], HOOKS[1]])
  })

  it('demotes every collided option when more than one is spent', () => {
    const twoSpent = [...BODY, beat('Nobody teaches this so I learned it from a 1940s trade manual.')]
    const r = demoteCollidedHooks(HOOKS, twoSpent)
    expect(r.found).toBe(2)
    expect(r.hooks.slice(-2)).toEqual([HOOKS[2], HOOKS[4]])
    expect(r.hooks[0]).toBe(HOOKS[0])
  })
})
