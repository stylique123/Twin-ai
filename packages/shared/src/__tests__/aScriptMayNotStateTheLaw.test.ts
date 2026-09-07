import { describe, expect, it } from 'vitest'
import { regulatoryFailures, statesARegulatoryRule } from '../regulatoryClaim'

// ⚠️ EVERY LINE MARKED I2 IS VERBATIM PRODUCTION, read from
// `generations.blueprint->'script'` for the Idea-Mode run of 2026-09-06 19:57.
// The creator is a Florida cottage sourdough baker who typed "why cottage food
// laws are the reason most home bakers never scale".

const I2_INVENTED_RULE_A =
  'When you lock in a four-loaf rotation, you max out your cottage license limits without needing commercial gear.'
const I2_INVENTED_RULE_B =
  'Most people think cottage food laws hold you back because of kitchen size limits.'
// ⚖️ HERS, AND CORRECTLY CITED. "Starting and launching a cottage sourdough
// microbakery in Florida" is genuinely in her store. Naming her own setup is
// not a claim about what the law permits.
const I2_HER_OWN_SETUP =
  'I am doing a little bit of the same thing today with our Florida cottage food setup.'

// Her real store: 8 rows, ONE mentions a regulatory noun, ZERO state a rule.
const HER_STORE = [
  'Starting and launching a cottage sourdough microbakery in Florida, documenting the backend process',
  'She raised her price to $12 and lost three customers',
  'Sold forty loaves in under two hours at her first market',
  "You need twenty people who'll text you on a Friday",
]

describe('a script may not tell a creator what the law allows', () => {
  it('flags the two I2 lines that invent a rule', () => {
    const fails = regulatoryFailures(
      [{ line: I2_INVENTED_RULE_A }, { line: I2_INVENTED_RULE_B }], HER_STORE)
    expect(fails).toHaveLength(2)
    expect(fails[0].repair).toContain('inventing one')
  })

  it('LEAVES HER OWN SETUP ALONE — context is not a rule', () => {
    // ⚠️ THE CONTROL THAT MAKES THIS SAFE. It carries "cottage food" and
    // "Florida", both genuinely hers, and states no limit or permission.
    expect(regulatoryFailures([{ line: I2_HER_OWN_SETUP }], HER_STORE)).toEqual([])
    expect(statesARegulatoryRule(I2_HER_OWN_SETUP)).toBe(false)
  })

  it('needs BOTH halves — a noun alone or a rule word alone is not a claim', () => {
    expect(statesARegulatoryRule('I got my cottage food registration last spring')).toBe(false)
    expect(statesARegulatoryRule('You must try this with a cold proof')).toBe(false)
    expect(statesARegulatoryRule('There is a limit to how much dough one person can shape')).toBe(false)
  })

  it('clears the whole script when the creator DID supply a rule', () => {
    // ⚖️ A creator who told Twin their licence caps them may talk about it.
    const withRule = [...HER_STORE, 'My cottage licence limits me to fifty thousand dollars a year in sales']
    expect(regulatoryFailures([{ line: I2_INVENTED_RULE_A }], withRule)).toEqual([])
  })

  it('an EMPTY evidence list is when it must fire, not a reason to skip', () => {
    for (const e of [[], null, undefined]) {
      expect(regulatoryFailures([{ line: I2_INVENTED_RULE_A }], e), JSON.stringify(e)).toHaveLength(1)
    }
  })

  it('reads evidence as plain strings or as rows carrying text', () => {
    expect(regulatoryFailures([{ line: I2_INVENTED_RULE_A }],
      [{ text: 'My permit allows up to 50k a year' }])).toEqual([])
  })

  it('reports the true index, and ignores silent beats', () => {
    const fails = regulatoryFailures(
      [{ line: '' }, { line: I2_HER_OWN_SETUP }, { line: I2_INVENTED_RULE_A }], HER_STORE)
    expect(fails).toHaveLength(1)
    expect(fails[0].index).toBe(2)
  })

  it('does not fire on the ordinary baking language around it', () => {
    for (const ok of [
      'You do not need a perfect setup to start a microbakery.',
      'I sold forty loaves in under two hours at my first market.',
      'Multiplying your base cost by three gives you a minimum price.',
      'Customers care about taste, not whether you baked in a commercial facility.',
    ]) expect(regulatoryFailures([{ line: ok }], HER_STORE), ok).toEqual([])
  })
})
