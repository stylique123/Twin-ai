import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  asksPersonalUse, asksScreenShow, asksPhysicalAvailability,
  capabilityQuestion, CAPABILITY_PROMPT, productQuestionIds,
} from '../productQuestions'
import { ENTITY_TYPES, ENTITY_RELATIONSHIPS, type EntityType, type EntityRelationship } from '../productEntity'

const TYPES = ENTITY_TYPES as readonly EntityType[]
const TIES = ENTITY_RELATIONSHIPS as readonly EntityRelationship[]

describe('the question that named the whole problem', () => {
  // ⚠️ THE OWNER'S OWN EXAMPLE, AND THE REGISTRY'S: "NEVER FOR A BOOK... the
  // reason the global version had to die."
  it('a book is never asked about screen recording', () => {
    const book = { type: 'PHYSICAL_PRODUCT' as EntityType, relationship: 'OWN_PRODUCT' as EntityRelationship }
    expect(asksScreenShow(book)).toBe(false)
    expect(capabilityQuestion(book)).toBe('physical')
    expect(CAPABILITY_PROMPT[capabilityQuestion(book)!]).toMatch(/have it with you/i)
  })

  it('software is never asked whether it can be held', () => {
    const app = { type: 'SAAS' as EntityType, relationship: 'OWN_PRODUCT' as EntityRelationship }
    expect(asksPhysicalAvailability(app)).toBe(false)
    expect(capabilityQuestion(app)).toBe('screen')
    expect(CAPABILITY_PROMPT[capabilityQuestion(app)!]).toMatch(/record your screen/i)
  })

  // ⚖️ A SERVICE HAS NOTHING TO POINT A CAMERA AT, so it is asked neither.
  it('a service is asked no capability question at all', () => {
    for (const r of TIES) {
      expect(capabilityQuestion({ type: 'SERVICE', relationship: r }), r).toBeNull()
    }
  })

  // ⚠️ NEVER BOTH. Asking both would be the universal form in a smaller costume.
  it('at most one capability question, for every combination', () => {
    for (const t of TYPES) {
      for (const r of TIES) {
        const c = { type: t, relationship: r }
        const both = asksScreenShow(c) && asksPhysicalAvailability(c)
        expect(both, `${t}/${r}`).toBe(false)
      }
    }
  })
})

describe('owning a thing is not using it', () => {
  // ⚠️ ASKED OF EVERY PRODUCT BEFORE THIS. Ownership already authorises "we built
  // this"; asking an owner whether they have used their own product is noise.
  it('an owner is not asked about personal use', () => {
    for (const t of TYPES) {
      expect(asksPersonalUse({ type: t, relationship: 'OWN_PRODUCT' }), t).toBe(false)
      expect(asksPersonalUse({ type: t, relationship: 'OWN_SERVICE' }), t).toBe(false)
    }
  })

  // ⚖️ AND IT IS STILL ASKED WHERE IT IS A REAL PERMISSION — where a commission
  // or a sponsorship makes "I use this" a claim somebody could be misled by.
  it('an affiliate, a sponsor and a reviewer are all asked', () => {
    for (const r of ['AFFILIATE', 'SPONSOR', 'REVIEW_ONLY'] as EntityRelationship[]) {
      expect(asksPersonalUse({ type: 'SAAS', relationship: r }), r).toBe(true)
    }
  })
})

describe('an unmapped kind asks nothing rather than guessing', () => {
  // ⚖️ THE REGISTRY HAS NO KIND FOR MARKETPLACE OR OTHER. Calling a marketplace
  // "software" because both live on a screen would gate a real question on a
  // guess; asking nothing leaves showability UNKNOWN, so no scene is built on it.
  it('MARKETPLACE and OTHER get no capability question', () => {
    for (const t of ['MARKETPLACE', 'OTHER'] as EntityType[]) {
      expect(capabilityQuestion({ type: t, relationship: 'OWN_PRODUCT' }), t).toBeNull()
    }
  })

  it('but they are still real types the form can offer', () => {
    expect(TYPES).toContain('MARKETPLACE')
    expect(TYPES).toContain('OTHER')
  })
})

describe('nothing is asked before there is a product', () => {
  it('an empty context asks no product questions', () => {
    expect(productQuestionIds({ type: null, relationship: null })
      .filter((id) => id === 'product_personal_use' || id === 'product_screen_show'))
      .toEqual([])
  })
})

describe('the form actually consults the registry', () => {
  const repo = join(import.meta.dirname, '..', '..', '..', '..')
  const code = readFileSync(join(repo, 'apps', 'web', 'src', 'pages', 'ProductLibrary.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

  // ⚠️ questionRegistry HAS BEEN CORRECT AND UNCALLED SINCE IT WAS WRITTEN. This
  // is the first production caller, and this case is why it stays one.
  it('gates the personal-use question on asksPersonalUse', () => {
    expect(code).toMatch(/asksPersonalUse\(\s*ctx\s*\)\s*&&/)
  })

  it('renders exactly the capability question the registry chose', () => {
    expect(code).toMatch(/capabilityQuestion\(/)
    expect(code).toMatch(/CAPABILITY_PROMPT\[/)
  })

  // ⚠️ THE DEAD END THIS PREVENTS: the submit gate used to demand personalUse
  // from everyone. Now that an owner is never asked, demanding it would disable
  // the button with no visible field to fill and nothing saying what is missing.
  it('the submit gate requires only what was asked', () => {
    expect(code).toMatch(/!asksPersonalUse\(ctx\) \|\| personalUse !== null/)
    expect(code).toMatch(/capability === null \|\| showability !== null/)
  })

  // ⚖️ SILENCE MUST NOT BECOME A FIRST-HAND CLAIM. When the question was never
  // asked, the stored value is NOT_CONFIRMED — the literal truth.
  it('an unasked personal-use question stores NOT_CONFIRMED, never CONFIRMED', () => {
    expect(code).toMatch(/asksPersonalUse\(ctx\) \? personalUse! : 'NOT_CONFIRMED'/)
  })
})
