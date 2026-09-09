// @vitest-environment jsdom
//
// FOUR DOORS INTO ONE ROOM.
//
// ⚠️ REPORTED BY THE OWNER, AND THE COMPLAINT IS PRECISE: a creator with a
// product AND a thought AND a saved video sees four cards that are all true at
// once, and nothing tells her which to click. "I have a product… but I also
// have an idea about it… and I saw a video I liked… so which one do I click?"
//
// ⚖️ THE FIX IS THAT A MODE IS WHAT SHE BROUGHT, NOT WHAT THE VIDEO IS ABOUT.
// The old labels were noun phrases — "A video I love", "An idea", "Something I
// sell", "Nothing yet" — and a noun phrase does not exclude the other three.
// Written as "I ..." sentences, exactly one is true of her right now.
//
// ⚠️ A PRODUCT CAN STILL APPEAR IN ANY DOOR, and that is not a contradiction.
// What Product Mode means is that the product is the SUBJECT — which is what
// switches on claim entitlement and disclosure. Mentioning a product in an idea
// video is a different thing and stays available everywhere.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

vi.mock('../../lib/supabase', () => ({ supabase: {
  auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
} }))
vi.mock('@twinai/shared', async (orig) => {
  const m = await orig<Record<string, unknown>>()
  return { ...m, listProductEntities: async () => [] }
})

const SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'V2Create.tsx'), 'utf8')

afterEach(() => cleanup())

/** Whole-line comments dropped, so prose quoting an old label cannot pass for
 *  the label itself — and nothing after `//` on a code line is removed. */
const codeOnly = SRC.split('\n')
  .filter((l) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l))
  .join('\n')

/** ⚠️ SCOPED TO THE DOORS ARRAY, AND THE FIRST VERSION WAS NOT. A bare
 *  `label:` match also caught the fidelity options — "Understated", "Balanced"
 *  — and reported seven doors. The test was wrong, not the code: this file has
 *  more than one thing with labels in it. */
const DOORS_BLOCK = (() => {
  const from = codeOnly.indexOf('const DOORS: ReadonlyArray<')
  expectPositive(from)
  const end = codeOnly.indexOf('\n]', from)
  expectPositive(end)
  return codeOnly.slice(from, end)
})()
function expectPositive(n: number) { if (n < 0) throw new Error('DOORS block not found') }

describe('every door is a sentence about her, starting with "I"', () => {
  it('all four labels begin with I', () => {
    // ⚠️ ASSERTED ON THE LABELS THEMSELVES rather than by rendering, because a
    // door that is currently hidden behind a flag still has to read this way.
    const labels = [...DOORS_BLOCK.matchAll(/label: (?:'([^']*)'|"([^"]*)")/g)]
      .map((m) => m[1] ?? m[2])
    expect(labels).toHaveLength(4)
    for (const l of labels) expect(l).toMatch(/^I(\s|')/)
  })

  it('and none of the old noun-phrase labels survives', () => {
    // These are the exact strings the owner was looking at when they reported it.
    for (const old of ['A video I love', 'An idea', 'Something I sell', 'Nothing yet']) {
      expect(DOORS_BLOCK).not.toContain(`label: '${old}'`)
      expect(DOORS_BLOCK).not.toContain(`label: "${old}"`)
    }
  })
})

describe('each card shows what comes out, not a second description of the mode', () => {
  it('every door carries an outcome line', () => {
    const outcomes = [...DOORS_BLOCK.matchAll(/outcome: (?:'([^']*)'|"([^"]*)")/g)]
      .map((m) => m[1] ?? m[2])
    expect(outcomes).toHaveLength(4)
    // ⚖️ CONCRETE, NOT A RESTATEMENT. An outcome that merely repeats the blurb
    // teaches nothing, so each must be distinct from every label and blurb.
    const others = [...DOORS_BLOCK.matchAll(/(?:label|blurb): (?:'([^']*)'|"([^"]*)")/g)]
      .map((m) => m[1] ?? m[2])
    for (const o of outcomes) {
      expect(o.length).toBeGreaterThan(10)
      expect(others).not.toContain(o)
    }
  })

  it('and the outcome is rendered, not merely declared', () => {
    // ⚠️ THE DEFECT CLASS THIS REPO KEEPS FINDING: a field written and never
    // read on the surface that needs it. Four of them this week.
    expect(codeOnly).toMatch(/\{d\.outcome\}/)
  })
})

describe('the picker on screen', () => {
  it('offers exactly four, and each is selectable', async () => {
    render(<MemoryRouter><ScreenUnderTest /></MemoryRouter>)
    const radios = await screen.findAllByRole('radio')
    expect(radios).toHaveLength(4)
  })

  it('shows the sentence and its outcome together', async () => {
    render(<MemoryRouter><ScreenUnderTest /></MemoryRouter>)
    expect(await screen.findByText('I saw a video I liked')).toBeTruthy()
    expect(await screen.findByText(/Same build, your story inside it/)).toBeTruthy()
    expect(await screen.findByText("I don't know what to post")).toBeTruthy()
  })
})

// Imported last so the mocks above are installed first.
// eslint-disable-next-line import/first
import V2Create from './V2Create'
function ScreenUnderTest() { return <V2Create /> }
