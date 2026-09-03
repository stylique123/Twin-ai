import { describe, it, expect } from 'vitest'
import { renderContentHistory, type PriorVideo } from '../contentHistory'

const row = (over: Partial<PriorVideo> = {}): PriorVideo => ({
  formatLabel: 'listicle', premise: 'a premise', hook: 'Nobody tells you this', ...over,
})

describe('content history separates what they opened with from what we suggested', () => {
  it('a creator pick is reported as what they opened with', () => {
    const out = renderContentHistory([
      row({ hookChoice: { source: 'creator', index: 2 } }),
      row({ hookChoice: { source: 'creator', index: 1 } }),
    ])
    expect(out).toContain('opened: "Nobody tells you this"')
    expect(out).not.toContain('we suggested')
    expect(out).not.toContain('unconfirmed')
  })

  it('OUR captured default is never reported as what they opened with', () => {
    // 14 of 23 production rows. This is the line that taught the writer a
    // creator preferred the option we happened to list first.
    const out = renderContentHistory([
      row({ hookChoice: { source: 'default', index: 0 } }),
      row({ hookChoice: { source: 'default', index: 0 } }),
    ])
    expect(out).toContain('we suggested: "Nobody tells you this"')
    expect(out).not.toContain('opened: "Nobody tells you this"')
  })

  it('freeform text the creator typed IS theirs, and reads as opened', () => {
    const out = renderContentHistory([
      row({ hookChoice: { source: 'freeform', index: null } }),
      row({ hookChoice: { source: 'creator', index: 3 } }),
    ])
    expect(out).toContain('opened: "Nobody tells you this"')
    expect(out).not.toContain('we suggested')
  })

  it('a row predating 0134 is unconfirmed — not creator, and not ours', () => {
    const out = renderContentHistory([row({ hookChoice: null }), row({ hookChoice: undefined })])
    expect(out).toContain('opened (unconfirmed): "Nobody tells you this"')
    expect(out).not.toContain('we suggested')
    // and it must NOT read as a bare confirmed opening
    expect(out).not.toMatch(/(?<!\()opened: "/)
  })

  it('a mixed catalogue labels each row on its own provenance', () => {
    const out = renderContentHistory([
      row({ hook: 'chosen line', hookChoice: { source: 'creator', index: 1 } }),
      row({ hook: 'our line', hookChoice: { source: 'default', index: 0 } }),
      row({ hook: 'old line', hookChoice: null }),
    ])
    expect(out).toContain('opened: "chosen line"')
    expect(out).toContain('we suggested: "our line"')
    expect(out).toContain('opened (unconfirmed): "old line"')
  })

  it('a row with no hook says nothing about how it opened', () => {
    const out = renderContentHistory([
      row({ hook: null, hookChoice: null }),
      row({ hook: '   ', hookChoice: null }),
    ])
    expect(out).toContain('format: listicle')
    expect(out).not.toContain('opened')
    expect(out).not.toContain('we suggested')
  })

  it('provenance does not change the format and premise facts', () => {
    const out = renderContentHistory([
      row({ hookChoice: { source: 'default', index: 0 } }),
      row({ hookChoice: { source: 'default', index: 0 } }),
    ])
    expect(out).toContain('format: listicle')
    expect(out).toContain('premise: a premise')
  })

  it('the block still refuses to render below the two-video floor', () => {
    expect(renderContentHistory([row({ hookChoice: { source: 'creator', index: 1 } })])).toBe('')
  })

  it('long hooks are truncated the same way regardless of provenance', () => {
    const long = 'x'.repeat(200)
    const chosen = renderContentHistory([
      row({ hook: long, hookChoice: { source: 'creator', index: 1 } }), row(),
    ])
    const ours = renderContentHistory([
      row({ hook: long, hookChoice: { source: 'default', index: 0 } }), row(),
    ])
    expect(chosen).toContain(`opened: "${'x'.repeat(120)}"`)
    expect(ours).toContain(`we suggested: "${'x'.repeat(120)}"`)
  })
})
