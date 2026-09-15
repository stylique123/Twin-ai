// THE SIGNAL NO COMPETITOR CAN PRODUCE, AND NOTHING READ IT.
//
// ⚠️ MEASURED ON PRODUCTION 2026-09-14: 891 `visual_profile` rows, all of them
// scraped gallery items, 0 of her own posts. 0209 now writes them; this is the
// half that turns them into something a writer sees.

import { describe, it, expect } from 'vitest'
import {
  ownVisualShape, ownVisualShapeBlock, MIN_POSTS_PER_GROUP, MIN_POSTS_POOLED,
  type OwnPostVisual,
} from '../ownVisualShape.js'

const post = (
  url: string, plays: number | null, observations: Record<string, string>,
  visualPassRan = true,
): OwnPostVisual => ({ url, plays, visualPassRan, observations })

const TH = 'Filmed as a person talking to camera.'
const WALK = 'She is walking while she talks.'

describe('her own videos have a measured shape', () => {
  it('refuses below the pooled floor rather than describing one video', () => {
    const two = [post('a', 100, { talking_head: TH }), post('b', 200, { talking_head: TH })]
    expect(two.length).toBeLessThan(MIN_POSTS_POOLED)
    // ⚠️ NULL, NOT A HEDGED BLOCK. "In 2 of 2 of your videos" is the confident-1
    // problem with one more row: nobody has looked at enough of her work.
    expect(ownVisualShape(two)).toBeNull()
    expect(ownVisualShapeBlock(ownVisualShape(two))).toBeNull()
  })

  it('counts a post only when the pass actually ran on it', () => {
    const rows = [
      post('a', 100, { talking_head: TH }),
      post('b', 100, { talking_head: TH }),
      post('c', 100, {}, false),
      post('d', 100, {}, false),
    ]
    // Two read + two unread is still two read.
    expect(ownVisualShape(rows)).toBeNull()
  })

  it('splits on HER OWN median, never an absolute reach', () => {
    // A creator whose median is 100 and one whose median is 100,000 are asking
    // the same question: which of my videos beat MY normal.
    const rows = [
      post('a', 900, { talking_head: TH }), post('b', 800, { talking_head: TH }),
      post('c', 700, { talking_head: TH }),
      post('d', 100, { talking_head: WALK }), post('e', 90, { talking_head: WALK }),
      post('f', 80, { talking_head: WALK }),
    ]
    const shape = ownVisualShape(rows)!
    expect(shape.split).toEqual({ strong: 3, typical: 3 })
    const block = ownVisualShapeBlock(shape)!
    expect(block).toContain('3 of your 3 best-performing videos')
    expect(block).toContain('split by whether each beat her own median reach')
  })

  it('scaling every play count 1000x changes nothing', () => {
    const mk = (k: number) => [
      post('a', 900 * k, { talking_head: TH }), post('b', 800 * k, { talking_head: TH }),
      post('c', 700 * k, { talking_head: TH }),
      post('d', 100 * k, { talking_head: WALK }), post('e', 90 * k, { talking_head: WALK }),
      post('f', 80 * k, { talking_head: WALK }),
    ]
    expect(ownVisualShapeBlock(ownVisualShape(mk(1))))
      .toEqual(ownVisualShapeBlock(ownVisualShape(mk(1000))))
  })

  it('refuses the split below the per-group floor, and SAYS it refused', () => {
    const rows = [
      post('a', 900, { talking_head: TH }), post('b', 800, { talking_head: TH }),
      post('c', 700, { talking_head: TH }), post('d', 600, { talking_head: TH }),
      post('e', 100, { talking_head: WALK }),
    ]
    expect(MIN_POSTS_PER_GROUP).toBe(3)
    const shape = ownVisualShape(rows)!
    // One typical post is not a group.
    expect(shape.split).toBeNull()
    const block = ownVisualShapeBlock(shape)!
    // ⚠️ THE LIMIT IS IN THE PROMPT, NOT ONLY IN THE TYPES. Frequencies with no
    // performance split read as "what works for her" unless the header refuses
    // that reading in words the model sees.
    expect(block).toContain('NOT SPLIT BY PERFORMANCE')
    expect(block).toContain('says nothing about what works for her')
    expect(block).not.toContain('best-performing')
  })

  it('a null play count is dropped, never read as zero', () => {
    // A post whose reach the source omitted is not a post nobody watched. Read
    // as 0 it would sit in `typical` and drag the median down.
    const rows = [
      post('a', 900, { talking_head: TH }), post('b', 800, { talking_head: TH }),
      post('c', 700, { talking_head: TH }),
      post('d', null, { talking_head: WALK }), post('e', null, { talking_head: WALK }),
      post('f', null, { talking_head: WALK }),
    ]
    const shape = ownVisualShape(rows)!
    // Only three posts carry reach, so no group reaches the floor on both sides.
    expect(shape.split).toBeNull()
    expect(shape.postsRead).toBe(6)
    // And the pooled form still counts all six, because the pass DID read them.
    expect(ownVisualShapeBlock(shape)!).toContain('of the 6 of your videos we looked at')
  })

  it('an absent dimension is never rendered as a "no"', () => {
    const rows = [
      post('a', 300, { talking_head: TH }), post('b', 200, { talking_head: TH }),
      post('c', 100, { talking_head: TH }),
    ]
    const block = ownVisualShapeBlock(ownVisualShape(rows))!
    // Nothing answered `walking`, so the block must not mention it at all —
    // "she does not walk" is a claim nobody measured.
    expect(block).not.toMatch(/walk/i)
  })

  it('does not label her, only counts her', () => {
    const rows = [
      post('a', 300, { talking_head: TH }), post('b', 200, { talking_head: TH }),
      post('c', 100, { talking_head: TH }),
    ]
    const block = ownVisualShapeBlock(ownVisualShape(rows))!
    // A verdict needs a threshold and none has been measured on this product.
    expect(block).not.toMatch(/talking-head creator|she is a|typically a/i)
    expect(block).toContain('3 of the 3')
  })

  it('never tells the writer to repeat her', () => {
    const rows = [
      post('a', 900, { talking_head: TH }), post('b', 800, { talking_head: TH }),
      post('c', 700, { talking_head: TH }),
      post('d', 100, { talking_head: WALK }), post('e', 90, { talking_head: WALK }),
      post('f', 80, { talking_head: WALK }),
    ]
    expect(ownVisualShapeBlock(ownVisualShape(rows))!)
      .toContain('not an instruction to repeat herself')
  })

  it('is NOT the reference block, and says so where the model reads it', () => {
    const rows = [
      post('a', 300, { talking_head: TH }), post('b', 200, { talking_head: TH }),
      post('c', 100, { talking_head: TH }),
    ]
    const block = ownVisualShapeBlock(ownVisualShape(rows))!
    // The reference block carries "not a description of this creator". That
    // caveat is correct there and inverts the meaning here.
    expect(block).toContain('OWN PUBLISHED VIDEOS')
    expect(block).not.toContain('not a description of this creator')
  })
})
