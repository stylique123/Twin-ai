// THE RULE LIVES TWICE AND THAT IS NOT OPTIONAL.
//
// ⚠️ `hookBodyCollision.ts` HAS THE RULE AND ITS TESTS; `generate-blueprint`
// HAS THE INLINE COPY THAT ACTUALLY FEEDS `beat_audit`. Deno cannot import
// the shared package at deploy time, so a rule proved correct in one file
// and absent from the other is worth nothing to anybody using the product.
//
// ⚖️ EXECUTED, NOT READ. Transpiled with esbuild, not with regexes.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { transformSync } from 'esbuild'
import { describe, expect, it } from 'vitest'
import { hookBodyCollisionBeatCount, demoteCollidedHooks } from '../script/hookBodyCollision'

const EDGE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..',
    'supabase', 'functions', 'generate-blueprint', 'index.ts'), 'utf8')

function loadInline() {
  // ⚠️ ENDS RIGHT AFTER hookBodyCollisionBeatCountInline'S OWN CLOSING BRACE,
  // NOT AT THE NEXT NAMED FUNCTION. Other inline blocks (FIX 4, unsupplyable
  // shots) now sit between this one and `premiseDemandInline`, and their type
  // annotations aren't covered by the strips a sibling parity test needed to
  // add for the same reason.
  const start = EDGE.indexOf('const HOOK_BODY_CONTAINMENT_THRESHOLD_INLINE')
  const bodyStart = EDGE.indexOf('function hookBodyCollisionBeatCountInline')
  const end = EDGE.indexOf('\n}', bodyStart) + 2
  expect(start, 'the inline block must exist in the edge').toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(bodyStart)
  const ts = EDGE.slice(start, end)
  const js = transformSync(ts, { loader: 'ts', format: 'cjs' }).code
  // eslint-disable-next-line no-new-func
  return new Function(`${js}; return hookBodyCollisionBeatCountInline`)() as
    (hookOptions: unknown, beats: unknown) => number
}

const inline = loadInline()

const HOOK_OPTIONS = [
  'Your fear of judgement is cementing you into a life you hate.',
  'Stop chasing motivation — build a system that works without it.',
  'The comfort zone is a trap, and you built it yourself.',
  'Nobody is coming to save your career but you.',
  'Three habits that quietly ruined my twenties.',
]

const FIXTURES: Array<{ name: string; hookOptions: unknown; beats: unknown }> = [
  {
    name: 'the audited fixture: scene 4 restates hook option 2',
    hookOptions: HOOK_OPTIONS,
    beats: [
      { line: HOOK_OPTIONS[0] },
      { line: 'Here is the actual system I used to change course.' },
      { line: 'Most people quit at step two, which is the whole problem.' },
      { line: 'Stop chasing motivation, and build a system that works without it.' },
    ],
  },
  {
    name: 'no collisions',
    hookOptions: HOOK_OPTIONS,
    beats: [
      { line: HOOK_OPTIONS[0] },
      { line: 'Here is a totally unrelated line about something else entirely.' },
    ],
  },
  {
    name: 'a beat colliding with two hooks counts once',
    hookOptions: ['irrelevant opener here today', 'stop chasing motivation every single day', 'stop chasing motivation every single morning'],
    beats: [{ line: 'You should stop chasing motivation every single day and morning.' }],
  },
  { name: 'empty hook options', hookOptions: [], beats: [{ line: 'anything at all here' }] },
  { name: 'empty beats', hookOptions: HOOK_OPTIONS, beats: [] },
  { name: 'non-array input', hookOptions: null, beats: null },
]

describe('the edge copy agrees with the tested one', () => {
  it.each(FIXTURES)('$name', ({ hookOptions, beats }) => {
    expect(inline(hookOptions, beats)).toBe(hookBodyCollisionBeatCount(hookOptions, beats))
  })
})

describe('the counter is actually written into beat_audit', () => {
  it('is wired', () => {
    expect(EDGE).toMatch(/hook_body_collisions: hookBodyCollisionBeatCountInline\(/)
  })
})

// ── AND THE DEMOTION LIVES TWICE TOO ────────────────────────────────────────
//
// ⚖️ THE COUNT WAS MIRRORED AND THE ACTION MUST BE. A demotion proved correct in
// the shared copy and drifting in the edge copy would reorder a real creator's
// hooks by a rule nobody tested.
function loadInlineDemotion() {
  const start = EDGE.indexOf('const HOOK_BODY_CONTAINMENT_THRESHOLD_INLINE')
  const bodyStart = EDGE.indexOf('function demoteCollidedHooksInline')
  expect(bodyStart, 'the inline demotion must exist in the edge').toBeGreaterThan(-1)
  const end = EDGE.indexOf('\n}', bodyStart) + 2
  expect(end).toBeGreaterThan(bodyStart)
  // Both the containment helpers and the demotion, so the lifted copy is
  // self-contained — the counter block in between comes along harmlessly.
  const js = transformSync(EDGE.slice(start, end), { loader: 'ts', format: 'cjs' }).code
  // eslint-disable-next-line no-new-func
  return new Function(`${js}; return demoteCollidedHooksInline`)() as
    (hookOptions: unknown, beats: unknown) => { hooks: string[]; found: number; demoted: number }
}

const inlineDemote = loadInlineDemotion()

describe('the edge demotion agrees with the tested one', () => {
  it.each(FIXTURES)('$name', ({ hookOptions, beats }) => {
    expect(inlineDemote(hookOptions, beats)).toEqual(demoteCollidedHooks(hookOptions, beats))
  })

  // ⚠️ A DISCRIMINATING CASE, because every FIXTURE above either collides on one
  // hook or not at all — and two copies that agree on "nothing moved" agree
  // about nothing. This one moves two options and must preserve both the
  // recommended pick and the writer's order inside each group.
  it('agrees when two options are spent and order is at stake', () => {
    const hooks = [
      'Opener nobody restates anywhere in this script.',
      'Build a system that runs without motivation.',
      'Most people quit at step two.',
      'Fourth option nobody restates either.',
    ]
    // Beat 0 restates hooks[2]; beat 2 restates hooks[1]. Both must move, and
    // hooks[3] — clean but LAST — must end up ahead of them.
    const beats = [
      { line: 'Most people quit at step two, which is the whole problem.' },
      { line: 'Here is what I actually did instead.' },
      { line: 'Build a system that runs without motivation.' },
    ]
    const shared = demoteCollidedHooks(hooks, beats)
    expect(shared.found, 'the fixture stopped discriminating').toBeGreaterThan(1)
    expect(shared.hooks[0]).toBe(hooks[0])
    // The clean-but-last option is LIFTED, which is the half of the reorder a
    // single-collision fixture can never show.
    expect(shared.hooks[1]).toBe(hooks[3])
    expect(shared.hooks.slice(-2)).toEqual([hooks[1], hooks[2]])
    expect(inlineDemote(hooks, beats)).toEqual(shared)
  })
})

describe('the demotion is actually applied to hook_options', () => {
  it('runs BEFORE the ownership pass, which must have the stronger claim', () => {
    const collision = EDGE.indexOf('demoteCollidedHooksInline(rawHooks, declared)')
    const ownership = EDGE.indexOf('demoteUnsupportedHooks(collision.hooks, csEntities)')
    expect(collision, 'the collision demotion is not called').toBeGreaterThan(-1)
    expect(ownership, 'the ownership pass no longer consumes the collision result')
      .toBeGreaterThan(collision)
  })

  it('writes hook_options when EITHER pass moved something', () => {
    // ⚠️ THE GATE USED TO BE `demotion.found > 0` ALONE, which was right while
    // ownership was the only pass. A collision-only reorder would have been
    // computed and thrown away — the exact shape of defect this rule's own
    // history is made of.
    expect(EDGE).toMatch(/demotion\.found > 0 \|\| collision\.demoted > 0/)
  })

  it('records what was done, not only what was found', () => {
    expect(EDGE).toMatch(/hook_body_collision_demotion: hookBodyCollisionDemotion/)
  })
})
