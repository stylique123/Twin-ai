// THE TEMPLATE THAT REACHED THE HOOK — the cross-paired run's fatality.
//
// Every fixture below is a verbatim string from that run, so the tests fail if
// the detector stops catching the thing it was written for.
import { describe, expect, it } from 'vitest'
import {
  hasPlaceholder, placeholderTokens, spokenPlaceholders, dropPlaceholderHooks,
} from '../spokenPlaceholders'

/** The real hooks, unedited. */
const TEMPLATED_HOOKS = [
  'This gadget actually changed how I [achieved a specific result]!',
  "You won't believe how much easier [task] is with this device.",
  "Here's the one feature on this new [gadget name] that blew my mind.",
  'Forget everything you thought about [product category] – this does [specific result] better.',
  'The secret to [solving a common tech problem] might just be this [gadget name].',
]

describe('the run this exists for', () => {
  it('catches every hook that shipped as a template', () => {
    for (const h of TEMPLATED_HOOKS) expect(hasPlaceholder(h)).toBe(true)
  })

  it('names the span, so the message can quote it', () => {
    expect(placeholderTokens(TEMPLATED_HOOKS[0])).toEqual(['[achieved a specific result]'])
    // Two in one sentence are both reported, not just the first.
    expect(placeholderTokens(TEMPLATED_HOOKS[4]))
      .toEqual(['[solving a common tech problem]', '[gadget name]'])
    expect(placeholderTokens(TEMPLATED_HOOKS[1])).toEqual(['[task]'])
  })

  it('finds them in script lines too — the half normalizeHookLine never covered', () => {
    const hits = spokenPlaceholders({
      hook_options: ['A clean, finished hook.'],
      script: [
        { line: 'A real spoken line.' },
        { line: 'This new [Gadget Name] completely changed how I manage my workflow.' },
      ],
    })
    expect(hits).toEqual([{ field: 'script', index: 1, token: '[Gadget Name]' }])
  })

  it('reports the whole plan at once, with positions', () => {
    const hits = spokenPlaceholders({ hook_options: TEMPLATED_HOOKS, script: [] })
    expect(hits).toHaveLength(7) // hooks 3 and 4 carry two each
    expect(hits.map((h) => h.index)).toEqual([0, 1, 2, 3, 3, 4, 4])
  })
})

describe('what must NOT fire', () => {
  it('says nothing about a finished script', () => {
    expect(spokenPlaceholders({
      hook_options: ['Most business advice is keeping you broke.'],
      script: [{ line: 'The first one is "follow your passion".' }],
    })).toEqual([])
  })

  it('does NOT exempt a single bracketed word — "[task]" shipped in a real hook', () => {
    // The first detector exempted one-word spans so a stylised brand like
    // "[solidcore]" would survive. These fixtures broke it: the tell was not a
    // tell. A discarded hook costs one of five; a missed one is read aloud.
    expect(hasPlaceholder("You won't believe how much easier [task] is.")).toBe(true)
    expect(hasPlaceholder('I trained at [solidcore] for a year.')).toBe(true)
  })

  it('is silent on absent, empty and wrong-typed input', () => {
    expect(spokenPlaceholders(null)).toEqual([])
    expect(spokenPlaceholders(undefined)).toEqual([])
    expect(spokenPlaceholders({})).toEqual([])
    expect(spokenPlaceholders({ hook_options: 'not an array', script: 42 })).toEqual([])
    for (const bad of [null, undefined, 42, {}, '', '   ']) expect(hasPlaceholder(bad)).toBe(false)
  })
})

describe('repairing only where there is a choice', () => {
  it('keeps the finished hooks and drops the templates', () => {
    const kept = dropPlaceholderHooks([...TEMPLATED_HOOKS, 'This phone lasted me two full days.'])
    expect(kept).toEqual(['This phone lasted me two full days.'])
  })

  it('returns empty when every hook was a template', () => {
    // Not a repair. The caller must treat "no usable hook" as a failed
    // generation rather than shipping an empty recommendation.
    expect(dropPlaceholderHooks(TEMPLATED_HOOKS)).toEqual([])
  })

  it('drops blanks and non-strings without inventing replacements', () => {
    expect(dropPlaceholderHooks(['  ', null, 7, 'A real hook.'])).toEqual(['A real hook.'])
  })
})
