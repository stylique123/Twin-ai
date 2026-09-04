import { describe, it, expect } from 'vitest'
import {
  readEntryDoor, buildFieldsForDoor, entryImpression, looksLikeLink, ALL_DOORS,
} from '../entryDoor'

describe('readEntryDoor — a door is declared, not guessed', () => {
  it('a pasted link preselects the reference door', () => {
    expect(readEntryDoor({ text: 'https://tiktok.com/@x/video/1' }))
      .toEqual({ door: 'reference', source: 'preselected' })
  })

  it('a sentence preselects the idea door', () => {
    expect(readEntryDoor({ text: 'why everyone gets deadlifts wrong' }))
      .toEqual({ door: 'idea', source: 'preselected' })
  })

  it('an empty box rests on the idea door, not on nothing', () => {
    expect(readEntryDoor({ text: '' }).door).toBe('idea')
    expect(readEntryDoor({}).door).toBe('idea')
    expect(readEntryDoor({ text: null }).door).toBe('idea')
  })

  // ⚠️⚠️ THE RULE WITH TEETH.
  it('NEVER infers the product door, however product-shaped the text is', () => {
    const productish = [
      'my collagen serum',
      'the supplement I sell',
      'my course',
      'product',
      'https://myshop.com/products/collagen',
      'I want to promote my own protein powder to my audience',
    ]
    for (const text of productish) {
      const r = readEntryDoor({ text })
      expect(r.door).not.toBe('product')
      expect(r.source).toBe('preselected')
    }
  })

  it('NEVER infers the browse door either — having nothing is not typeable', () => {
    for (const text of ['', '   ', 'i have nothing', 'show me something', 'gallery']) {
      expect(readEntryDoor({ text }).door).not.toBe('browse')
    }
  })

  it('the product door is reachable ONLY by choosing it', () => {
    expect(readEntryDoor({ chosen: 'product', text: '' }))
      .toEqual({ door: 'product', source: 'chosen' })
  })

  // ⚖️ A CHOICE BEATS THE TEXT IN BOTH DIRECTIONS.
  it('a chosen idea door survives a pasted link', () => {
    expect(readEntryDoor({ chosen: 'idea', text: 'https://tiktok.com/@x/video/1' }))
      .toEqual({ door: 'idea', source: 'chosen' })
  })

  it('a chosen reference door survives prose', () => {
    expect(readEntryDoor({ chosen: 'reference', text: 'just some thoughts' }))
      .toEqual({ door: 'reference', source: 'chosen' })
  })

  // ⚠️ `chosen` ARRIVES FROM A QUERY STRING. It is input, not a promise.
  it('an unknown chosen value falls back to inference, never to a fifth door', () => {
    const r = readEntryDoor({ chosen: 'sponsorship', text: 'https://x.com/a/1' })
    expect(r).toEqual({ door: 'reference', source: 'preselected' })
    expect(ALL_DOORS).not.toContain('sponsorship' as never)
  })

  it('a chosen value that is only whitespace is not a choice', () => {
    expect(readEntryDoor({ chosen: '   ', text: 'an idea' }).source).toBe('preselected')
  })

  it('surrounding whitespace does not change which door a link opens', () => {
    expect(readEntryDoor({ text: '  https://youtu.be/abc  ' }).door).toBe('reference')
  })
})

describe('looksLikeLink — unchanged on purpose', () => {
  it('accepts http and https, in any case', () => {
    expect(looksLikeLink('https://a.com/b')).toBe(true)
    expect(looksLikeLink('HTTP://a.com/b')).toBe(true)
  })

  // ⚠️ NOT WIDENED. A bare domain routes as an idea today; making it a reference
  // here would silently re-route working builds.
  it('does not promote a bare domain to a link', () => {
    expect(looksLikeLink('tiktok.com/@x/video/1')).toBe(false)
    expect(looksLikeLink('www.youtube.com/watch?v=1')).toBe(false)
  })
})

describe('buildFieldsForDoor — what actually gets sent', () => {
  it('the reference door sends a url and no note', () => {
    expect(buildFieldsForDoor('reference', ' https://a.com/b '))
      .toEqual({ reference_url: 'https://a.com/b', reference_note: '' })
  })

  it('the idea door sends a note and no url', () => {
    expect(buildFieldsForDoor('idea', 'deadlifts are misunderstood'))
      .toEqual({ reference_url: '', reference_note: 'deadlifts are misunderstood' })
  })

  // ⚠️ THE READ BUDGET IS REAL MONEY.
  it('a link typed into the IDEA door stays a note — we never watch a video they did not offer', () => {
    expect(buildFieldsForDoor('idea', 'https://tiktok.com/@x/video/1'))
      .toEqual({ reference_url: '', reference_note: 'https://tiktok.com/@x/video/1' })
  })

  it('the reference door with non-link text degrades to a note, never to a subjectless build', () => {
    const f = buildFieldsForDoor('reference', 'not a link')
    expect(f.reference_url).toBe('')
    expect(f.reference_note).toBe('not a link')
  })

  it('a product build carries the creator words, not a url', () => {
    expect(buildFieldsForDoor('product', 'my collagen serum').reference_url).toBe('')
  })

  it('never returns both fields filled — two subjects is not a build', () => {
    for (const door of ALL_DOORS) {
      for (const text of ['https://a.com/b', 'words', '']) {
        const f = buildFieldsForDoor(door, text)
        expect(f.reference_url === '' || f.reference_note === '').toBe(true)
      }
    }
  })
})

describe('entryImpression — a door count is unreadable without the offer', () => {
  it('records the door, how it was reached, and what was on screen', () => {
    const i = entryImpression({
      door: 'idea', source: 'chosen', offered: ALL_DOORS, text: 'an idea',
    })
    expect(i.door).toBe('idea')
    expect(i.source).toBe('chosen')
    expect(i.offered).toEqual(['reference', 'idea', 'product', 'browse'])
    expect(i.hadText).toBe(true)
  })

  // ⚠️ THE ROW THAT WOULD BE A CONTRADICTION.
  it('forces the taken door into the offered list', () => {
    const i = entryImpression({ door: 'product', source: 'chosen', offered: ['reference'] })
    expect(i.offered).toContain('product')
  })

  it('normalises order and duplicates so two screens are comparable', () => {
    const a = entryImpression({ door: 'idea', source: 'chosen', offered: ['browse', 'idea', 'idea', 'reference'] })
    const b = entryImpression({ door: 'idea', source: 'chosen', offered: ['reference', 'browse'] })
    expect(a.offered).toEqual(b.offered)
    expect(a.offered).toEqual(['reference', 'idea', 'browse'])
  })

  it('drops an offered value that is not a door', () => {
    const i = entryImpression({ door: 'idea', source: 'chosen', offered: ['reference', 'sponsorship' as never] })
    expect(i.offered).toEqual(['reference', 'idea'])
  })

  it('an empty box is recorded as an empty box, not as an absent one', () => {
    expect(entryImpression({ door: 'idea', source: 'preselected', text: '   ' }).hadText).toBe(false)
    expect(entryImpression({ door: 'idea', source: 'preselected' }).hadText).toBe(false)
  })

  it('a lone door still writes a one-door offer, which is the finding', () => {
    const i = entryImpression({ door: 'reference', source: 'preselected' })
    expect(i.offered).toEqual(['reference'])
  })
})
