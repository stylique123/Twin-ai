import { describe, it, expect } from 'vitest'
import { nameFromMention } from './ProductLibrary'

describe('a found product pre-fills its name only when it reads as one', () => {
  it('keeps a short product name', () => { expect(nameFromMention('Brazil Roast')).toBe('Brazil Roast') })
  it('refuses a sentence or a call to action', () => {
    expect(nameFromMention('Grab my Brazil roast, link in bio for 20% off')).toBeNull()
    expect(nameFromMention('Early is an iOS alarm app that requires push-ups')).toBeNull()
  })
})
