// SHE SELLS MEAL PREP AND THE SCRIPT TOLD HER TO HOLD A GLASS OF WATER.
//
// ⚠️ THE REAL GENERATION, FROM PRODUCT TESTING: "Hold a clean glass of water in
// one hand, gesturing casually with the other." A prop she does not sell,
// invented because `action_posing` was asked for in free text and a blank is not
// an option a model will take. The field was never missing — it was
// unconstrained, and an unconstrained field fills itself.
//
// ⚖️ THE FIX IS A CLOSED SET NARROWED BY FACTS ALREADY STORED. Production holds
// SEVEN products whose `showability` is NEVER; for those the correct number of
// handling cues is zero, and the model needs somewhere real to go instead —
// which is what SELF_DIRECTIONS is for.
import { describe, expect, it } from 'vitest'
import {
  directionsFor, renderDirectionGuidance,
  PHYSICAL_ACTIONS, SCREEN_DIRECTIONS, SELF_DIRECTIONS, NAMED_FORMATS,
} from '../script/performanceDirection'

describe('a product that cannot be shown gets no prop', () => {
  const set = directionsFor({ kind: 'SERVICE', showability: 'NEVER' })

  it('offers only body and face direction', () => {
    expect(set.options).toEqual(SELF_DIRECTIONS)
    for (const o of set.options) {
      expect(PHYSICAL_ACTIONS.map((p) => p.id)).not.toContain(o.id)
    }
  })

  it('still offers something real, so the model is not choosing between a prop and a blank', () => {
    expect(set.options.length).toBeGreaterThan(3)
  })

  it('says why, in the prompt, rather than leaving the rule implied by a list', () => {
    expect(renderDirectionGuidance({ kind: 'SERVICE', showability: 'NEVER' }))
      .toMatch(/never invent a prop/i)
  })

  it('NEVER beats every other signal — a known shape does not reopen the gate', () => {
    // A service with a stray shape on it must not become "hold up the jar".
    const withShape = directionsFor({ kind: 'SERVICE', showability: 'NEVER', shape: 'jar' })
    expect(withShape.options).toEqual(SELF_DIRECTIONS)
  })
})

describe('a screen product may only name screens somebody actually found', () => {
  it('withholds screen cues entirely when no section map exists', () => {
    const set = directionsFor({ kind: 'SAAS', showability: 'ALWAYS', sections: [] })
    expect(set.options).toEqual(SELF_DIRECTIONS)
    expect(set.nameableSections).toEqual([])
    expect(set.because).toMatch(/nobody confirmed exists|NO named sections/i)
  })

  it('offers them, bounded to the found list, once a map exists', () => {
    const set = directionsFor({
      kind: 'SAAS', showability: 'ALWAYS', sections: ['pricing table', 'dashboard'],
    })
    expect(set.options).toEqual(SCREEN_DIRECTIONS)
    expect(set.nameableSections).toEqual(['pricing table', 'dashboard'])
    expect(set.format).toBe('App Showcase')
  })

  it('renders the found sections so the writer names those and nothing else', () => {
    const text = renderDirectionGuidance({
      kind: 'SAAS', showability: 'ALWAYS', sections: ['pricing table'],
    })
    expect(text).toContain('pricing table')
    expect(text).toMatch(/naming any other is an invention/i)
  })
})

describe('the photo narrows the set to what the object physically allows', () => {
  it('a bag has no cap to twist off — but it does open', () => {
    const ids = directionsFor({ kind: 'PHYSICAL_PRODUCT', showability: 'ALWAYS', shape: 'bag' })
      .options.map((o) => o.id)
    expect(ids).toContain('hold_up')
    expect(ids).not.toContain('unbox')
  })

  it('a flat card is rested on a palm, not unboxed', () => {
    const ids = directionsFor({ kind: 'PHYSICAL_PRODUCT', showability: 'ALWAYS', shape: 'flat' })
      .options.map((o) => o.id)
    expect(ids).toContain('palm')
    expect(ids).not.toContain('twist_open')
    expect(ids).not.toContain('demonstrate')
  })

  it('an unread photo narrows nothing rather than excluding everything', () => {
    const ids = directionsFor({ kind: 'PHYSICAL_PRODUCT', showability: 'ALWAYS' }).options.map((o) => o.id)
    expect(ids.length).toBe(PHYSICAL_ACTIONS.length)
  })
})

describe('the taxonomy is closed', () => {
  it('every rendered option is an id from a fixed list, never free text', () => {
    const all = [...PHYSICAL_ACTIONS, ...SCREEN_DIRECTIONS, ...SELF_DIRECTIONS].map((o) => o.id)
    for (const ctx of [
      { kind: 'PHYSICAL_PRODUCT', showability: 'ALWAYS' },
      { kind: 'SERVICE', showability: 'NEVER' },
      { kind: 'SAAS', showability: 'ALWAYS', sections: ['dashboard'] },
      {},
    ] as const) {
      for (const o of directionsFor(ctx).options) expect(all).toContain(o.id)
    }
  })

  it('carries the five formats the whole category already uses', () => {
    expect(NAMED_FORMATS).toContain('Product in Hand')
    expect(NAMED_FORMATS).toContain('App Showcase')
    expect(NAMED_FORMATS.length).toBe(5)
  })

  it('tells the writer to fall back to the plainest listed action, never to invent', () => {
    expect(renderDirectionGuidance({ kind: 'PHYSICAL_PRODUCT', showability: 'ALWAYS' }))
      .toMatch(/rather than inventing/i)
  })
})

// ── THE WIRING, ASSERTED AS TEXT ────────────────────────────────────────────
//
// ⚠️ NOTHING TYPECHECKS THE EDGE FUNCTION. There is no Deno in CI or in the
// image, so `generate-blueprint/index.ts` is covered by assertions like these
// and by reading. A taxonomy that exists and is never rendered into the prompt
// is the write-only defect this repo keeps finding, one layer up.
import { readFileSync as read } from 'node:fs'
import { fileURLToPath as toPath } from 'node:url'
import { dirname as dir, join as j } from 'node:path'

const ROOT = j(dir(toPath(import.meta.url)), '..', '..', '..', '..')
const EDGE = read(j(ROOT, 'supabase', 'functions', 'generate-blueprint', 'index.ts'), 'utf8')
const GENERATED = read(j(ROOT, 'supabase', 'functions', '_shared', 'performanceDirection.ts'), 'utf8')

describe('the taxonomy actually reaches the writer', () => {
  it('is imported by the blueprint function', () => {
    expect(EDGE).toMatch(/import \{ renderDirectionGuidance/)
  })

  it('is rendered INTO the user prompt, not merely computed', () => {
    expect(EDGE).toMatch(/const directionGuidance = renderDirectionGuidance\(\{/)
    expect(EDGE).toMatch(/\$\{directionGuidance\}/)
  })

  it('reads showability and type off the entity already selected, adding no column', () => {
    expect(EDGE).toMatch(/showability: \(ownedEntity as/)
    expect(EDGE).toMatch(/kind: \(ownedEntity as/)
  })

  it('passes shape and sections from the extractor, never a guessed default', () => {
    // Absent must mean "do not narrow" / "name nothing" — which is what the
    // two readers return when the extractor found neither.
    expect(EDGE).toMatch(/shape: shapeFromKnowledge\(ownedEntity\)/)
    expect(EDGE).toMatch(/sections: sectionsFromKnowledge\(ownedEntity\)/)
  })

  it('the edge copy is generated from the shared module, not hand-typed', () => {
    expect(GENERATED).toMatch(/generate_shared_pilot_core\.mjs/)
    expect(GENERATED).toMatch(/showability === 'NEVER'/)
  })
})

// ── THE EXTRACTION THAT MAKES SHAPE AND SECTIONS REAL ───────────────────────
//
// ⚖️ THE EXTRACTOR ALREADY READ THE PHOTOGRAPHS. `extract_product` has sent
// product images to the model in the same call as the page for some time — what
// it never asked them was the one question the direction field needs: what IS
// this thing, physically. So this is two enum values on an existing schema, not
// a new extraction pass.
const EXTRACT = read(j(ROOT, 'worker', 'src', 'jobs', 'extractProduct.ts'), 'utf8')

describe('the extractor is asked the one question the direction field needs', () => {
  it('can report an object shape and a page section', () => {
    expect(EXTRACT).toMatch(/'object_shape', 'page_section'/)
  })

  it('takes shape from a photograph, which it was already reading', () => {
    expect(EXTRACT).toMatch(/name, category, description, object_shape/)
  })

  it('is told a blank shape is the right answer for a service, not a miss', () => {
    expect(EXTRACT).toMatch(/omit it — that is the correct answer, not a failure to find one/)
  })

  it('is told never to report a section it did not see', () => {
    expect(EXTRACT).toMatch(/Never report a section because a product\s*',\s*'of this kind usually has one/)
  })
})

describe('and the writer reads them back — no write-only column', () => {
  it('pulls both out of the same knowledge blob the extractor writes', () => {
    expect(EDGE).toMatch(/shape: shapeFromKnowledge\(ownedEntity\)/)
    expect(EDGE).toMatch(/sections: sectionsFromKnowledge\(ownedEntity\)/)
  })

  it('treats a shape the taxonomy does not know as ABSENT, never passes it through', () => {
    // An unknown shape would narrow the action set to nothing, which reads
    // downstream as "this cannot be handled" — the same failure, new hat.
    expect(EDGE).toMatch(/known\.includes\(raw\) \? \(raw as ObjectShapeInline\) : null/)
  })

  it('bounds the section list — a camera target list, not a site index', () => {
    expect(EDGE).toMatch(/\.slice\(0, 12\)/)
  })
})
