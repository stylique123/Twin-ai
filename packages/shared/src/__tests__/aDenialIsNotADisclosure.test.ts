// A denial matched the phrase it denied, so the check reported success on it.
//
// WHY THIS FILE EXISTS. `DISCLOSURE_PHRASES` holds 'sponsored', 'affiliate' and
// 'commission'. `textDiscloses` was a bare `t.includes(p)`. So the sentence the
// audit calls the worst in the product — "This is not a sponsored
// recommendation", written onto a product the creator earns commission on —
// did not slip past the compliance gate. It SATISFIED it, and
// `disclosure_missing` never fired.
//
// Measured before the fix, all four TRUE:
//   "This is not a sponsored recommendation."
//   "This is not sponsored."
//   "I am not affiliated with them in any way."
//   "I earn no commission on this."
// and `scriptDiscloses` on a four-beat script denying the tie in beat 2: TRUE.
import { describe, it, expect } from 'vitest'
import {
  textDiscloses, textDeniesTie, scriptDiscloses, scriptDeniesTie,
} from '../disclosureCheck'

const DENIALS = [
  'This is not a sponsored recommendation.',
  'This is not sponsored.',
  'I am not affiliated with them in any way.',
  'I earn no commission on this.',
  'I was never paid to talk about it.',
  'This is not an ad.',
]

const REAL = [
  'I earn a commission on this.',
  'This is a paid partnership with them.',
  'They sent me this one.',
  'Quick thing first — this is sponsored.',
]

describe('a denial is not a disclosure', () => {
  it.each(DENIALS)('does NOT count as a disclosure: %s', (line) => {
    expect(textDiscloses(line)).toBe(false)
  })

  it.each(DENIALS)('IS recorded as a denial: %s', (line) => {
    expect(textDeniesTie(line)).toBe(true)
  })

  it.each(REAL)('a real disclosure still counts: %s', (line) => {
    expect(textDiscloses(line)).toBe(true)
  })

  it.each(REAL)('and a real disclosure is NOT a denial: %s', (line) => {
    expect(textDeniesTie(line)).toBe(false)
  })
})

describe('the script-level reads', () => {
  const denying = [
    { line: 'Most dog owners get this wrong.' },
    { line: 'This is not a sponsored recommendation.' },
    { line: 'Here is what changed.' },
    { line: 'Link in bio.' },
  ]

  it('a script that only DENIES does not disclose — the production case', () => {
    // Returned TRUE before the fix, which is why the refund never fired.
    expect(scriptDiscloses(denying)).toBe(false)
  })

  it('and it IS flagged as a denial', () => {
    expect(scriptDeniesTie(denying)).toBe(true)
  })

  it('a denial is caught in the LAST beat too — position is irrelevant to a lie', () => {
    // ⚖️ Deliberately different from `scriptDiscloses`, where a disclosure in
    // the final beat does not count because most viewers never reach it. A
    // false statement is false wherever it sits.
    expect(scriptDeniesTie([
      { line: 'Hook' }, { line: 'Body' }, { line: 'More' },
      { line: 'And this is not sponsored.' },
    ])).toBe(true)
  })

  it('a clean disclosing script discloses and does not deny', () => {
    const ok = [
      { line: 'Quick thing — I earn a commission on this.' },
      { line: 'Here is what it actually does.' },
      { line: 'Body' }, { line: 'Link in bio.' },
    ]
    expect(scriptDiscloses(ok)).toBe(true)
    expect(scriptDeniesTie(ok)).toBe(false)
  })

  it('a script with NEITHER is neither — silence is not a denial', () => {
    // The distinction the two reasons exist for: missing is an omission,
    // denied is an assertion. Collapsing them would hide the sharper one.
    const silent = [{ line: 'Hook' }, { line: 'Body' }, { line: 'CTA' }]
    expect(scriptDiscloses(silent)).toBe(false)
    expect(scriptDeniesTie(silent)).toBe(false)
  })
})

describe('the negation window', () => {
  it('reaches back three words — "am not affiliated with"', () => {
    expect(textDeniesTie('I am not affiliated with this brand')).toBe(true)
  })

  it('does NOT reach across a whole clause', () => {
    // "not" here negates the first clause, not the disclosure four words later.
    // Without a bounded window this would be read as a denial and a genuine
    // disclosure would be refused.
    expect(textDiscloses('I do not usually do this, but I earn a commission on it'))
      .toBe(true)
  })
})

// ── AND THE EDGE MIRROR CARRIES THE SAME RULE ──────────────────────────────
//
// ⚠️ THE CHECK THAT ACTUALLY RUNS IS THE EDGE COPY. `generate-blueprint` cannot
// import this package, so the rule lives twice, and the existing parity test is
// SOURCE-TEXT rather than executing — it asserts the edge contains the phrase
// list and the position rule. That means a fix applied only to the shared copy
// would leave every creator on the broken one and every test still green.
//
// ⚖️ COMMENTS ARE STRIPPED BEFORE MATCHING, WHOLE LINES ONLY. This file explains
// the rule in prose and names every one of these symbols while doing it, so a
// naive `toContain` would be satisfied by the documentation rather than the
// code — the mention-versus-call trap this repository has already hit twice.
// Stripping everything after `//` instead of whole comment lines would delete
// real code that follows a string containing a slash.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const EDGE_CODE = readFileSync(
  join(REPO, 'supabase/functions/generate-blueprint/index.ts'), 'utf8',
).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')

describe('the edge mirror carries the denial rule, in code', () => {
  it('its disclose check is negation-aware — NOT a bare includes', () => {
    expect(EDGE_CODE).toContain('occurrenceIsNegatedInline')
    // The shipped defect, asserted absent: the whole body was this one line.
    expect(EDGE_CODE).not.toMatch(
      /function textDisclosesInline[\s\S]{0,200}return DISCLOSURE_PHRASES_INLINE\.some\(\(p\) => t\.includes\(p\)\)/,
    )
  })

  it('it detects a denial, and at script level', () => {
    expect(EDGE_CODE).toContain('function textDeniesTieInline')
    expect(EDGE_CODE).toContain('function scriptDeniesTieInline')
  })

  it('and REFUSES on one, under its own reason rather than folded into missing', () => {
    expect(EDGE_CODE).toContain("code: 'DISCLOSURE_DENIED'")
    expect(EDGE_CODE).toContain("await refundOnce('disclosure_denied')")
    expect(EDGE_CODE).toContain('scriptDeniesTieInline(declared)')
  })

  it('the negation window is the SAME on both sides, or they are two rules', () => {
    expect(EDGE_CODE).toContain('NEGATION_LOOKBACK_WORDS_INLINE = 3')
  })
})
