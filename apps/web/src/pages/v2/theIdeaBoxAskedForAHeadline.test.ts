import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { buildFieldsForDoor } from '@twinai/shared'

/**
 * ⚠️ WAVE 5.1 — THE BOX ASKED FOR A HEADLINE AND GOT ONE.
 *
 * Two rows and "e.g. why most people warm up wrong…" is a shape, not a hint: it
 * says the right answer is a tidy one-line topic. So the writer received topics
 * where it could have had the creator's actual thinking — and no amount of work
 * downstream recovers a paragraph that was never typed.
 *
 * ⚖️ THE PLACEHOLDER IS THE FEATURE. Permission to be unfinished has to be given
 * in words, because every other text box this person has used punished it.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const CREATE = readFileSync(join(HERE, 'V2Create.tsx'), 'utf8')

describe('the idea box asked for a headline', () => {
  it('gives permission to be unfinished, in those words', () => {
    expect(CREATE).toContain('half-thoughts, tangents')
    expect(CREATE).toContain('Say it however it comes out')
  })

  it('the idea door opens a box that expects paragraphs; the link door does not', () => {
    // ⚠️ PER DOOR, NOT GLOBALLY. A six-row box under "paste a video link" would
    // be the same mistake pointing the other way.
    const prompt = CREATE.slice(CREATE.indexOf('const PROMPT:'), CREATE.indexOf('LONG_ENOUGH_TO_COUNT'))
    expect(prompt).toMatch(/idea:[\s\S]*?rows: 6/)
    expect(prompt).toMatch(/reference: \{[^}]*rows: 2/)
    expect(CREATE).toContain('rows={prompt.rows}')
  })

  it('nothing truncates what they typed', () => {
    // ⚖️ THE HALF THAT WOULD MAKE THE INVITATION A LIE. Asking for 500 words and
    // sending 200 is worse than asking for one line.
    const long = 'word '.repeat(600).trim()
    expect(buildFieldsForDoor('idea', long).reference_note).toHaveLength(long.length)
  })

  it('the counter counts up and never down', () => {
    // A budget being spent is the opposite of the invitation.
    expect(CREATE).toContain('keep going if there is more')
    expect(CREATE).not.toContain('words left')
  })

  it('the counter stays away until they are past a one-liner', () => {
    expect(CREATE).toContain('LONG_ENOUGH_TO_COUNT = 40')
    expect(CREATE).toContain('wordCount(input) >= LONG_ENOUGH_TO_COUNT')
  })
})
