import { describe, it, expect } from 'vitest'
import { classifyRegenerate } from '../regenerateReason'

const FIELDS = ['fidelity', 'reference_note', 'goal', 'focus', 'outcome']

describe('classifyRegenerate — a changed dial is the creator telling us what was wrong', () => {
  it('nothing moved: the script itself was rejected', () => {
    const v = classifyRegenerate(
      { fidelity: 'balanced', reference_note: 'my note', goal: 'sell' },
      { fidelity: 'balanced', reference_note: 'my note', goal: 'sell' },
      FIELDS,
    )
    expect(v.kind).toBe('without_edit')
    expect(v.changed).toEqual([])
    expect(v.compared).toEqual(['fidelity', 'reference_note', 'goal'])
  })

  it('a moved dial is reported with the field that moved', () => {
    const v = classifyRegenerate(
      { fidelity: 'balanced', goal: 'sell' },
      { fidelity: 'loose', goal: 'sell' },
      FIELDS,
    )
    expect(v.kind).toBe('with_edit')
    expect(v.changed).toEqual(['fidelity'])
  })

  it('several moved dials are all reported, in the caller\'s field order', () => {
    const v = classifyRegenerate(
      { fidelity: 'close', reference_note: 'a', goal: 'sell' },
      { fidelity: 'loose', reference_note: 'b', goal: 'sell' },
      FIELDS,
    )
    expect(v.kind).toBe('with_edit')
    expect(v.changed).toEqual(['fidelity', 'reference_note'])
  })

  // ⚠️ THE RULE THIS MODULE EXISTS FOR.
  it('a prior row carrying NONE of the fields is unknown, never without_edit', () => {
    const v = classifyRegenerate({ id: 'x' }, { fidelity: 'loose' }, FIELDS)
    expect(v.kind).toBe('unknown')
    expect(v.compared).toEqual([])
  })

  it('a null or absent prior is unknown', () => {
    expect(classifyRegenerate(null, { fidelity: 'loose' }, FIELDS).kind).toBe('unknown')
    expect(classifyRegenerate(undefined, { fidelity: 'loose' }, FIELDS).kind).toBe('unknown')
  })

  it('a field the prior row is null on is NOT compared, even when the new one has it', () => {
    // The pre-column row. It cannot testify about a dial it never stored, and
    // counting it as unchanged would fabricate a without_edit.
    const v = classifyRegenerate(
      { fidelity: 'balanced', goal: null },
      { fidelity: 'balanced', goal: 'sell' },
      FIELDS,
    )
    expect(v.kind).toBe('without_edit')
    expect(v.compared).toEqual(['fidelity'])
    expect(v.changed).toEqual([])
  })

  it('an empty string on the prior is absent, not a value', () => {
    const v = classifyRegenerate(
      { reference_note: '   ', fidelity: 'close' },
      { reference_note: 'now I typed one', fidelity: 'close' },
      FIELDS,
    )
    expect(v.compared).toEqual(['fidelity'])
    expect(v.kind).toBe('without_edit')
  })

  it('casing and whitespace are not edits', () => {
    const v = classifyRegenerate(
      { fidelity: 'Balanced ', reference_note: 'my  note' },
      { fidelity: 'balanced', reference_note: 'my note' },
      FIELDS,
    )
    expect(v.kind).toBe('without_edit')
  })

  it('a field missing from the NEW request counts as changed when the prior had one', () => {
    // Clearing a note is an edit: the creator removed the steer they gave.
    const v = classifyRegenerate({ reference_note: 'steer' }, {}, FIELDS)
    expect(v.kind).toBe('with_edit')
    expect(v.changed).toEqual(['reference_note'])
  })

  it('compared is reported so a one-field verdict is not read like a five-field one', () => {
    const weak = classifyRegenerate({ fidelity: 'close' }, { fidelity: 'close' }, FIELDS)
    const strong = classifyRegenerate(
      { fidelity: 'close', reference_note: 'n', goal: 'g', focus: 'f', outcome: 'o' },
      { fidelity: 'close', reference_note: 'n', goal: 'g', focus: 'f', outcome: 'o' },
      FIELDS,
    )
    expect(weak.kind).toBe(strong.kind)
    expect(weak.compared).toHaveLength(1)
    expect(strong.compared).toHaveLength(5)
  })

  it('only the caller\'s fields are considered — an unrelated column is not an edit', () => {
    const v = classifyRegenerate(
      { fidelity: 'close', created_at: '2026-01-01' },
      { fidelity: 'close', created_at: '2026-09-03' },
      FIELDS,
    )
    expect(v.kind).toBe('without_edit')
  })
})
