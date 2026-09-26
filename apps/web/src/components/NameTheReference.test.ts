import { describe, expect, it } from 'vitest'
import { lengthLabel, openingWords } from './NameTheReference'

describe('name the reference back', () => {
  it('says its length plainly', () => {
    expect(lengthLabel(47.6)).toBe('48-second')
    expect(lengthLabel(185)).toBe('3-minute')
    expect(lengthLabel(null)).toBeNull()
    expect(lengthLabel(0)).toBeNull()
  })
  it('quotes the first sentence, never invents one', () => {
    expect(openingWords('I almost quit my business last year. Then a client called.')).toBe('I almost quit my business last year.')
    expect(openingWords('   ')).toBeNull()
    expect(openingWords(undefined)).toBeNull()
    expect(openingWords('word '.repeat(80))!.endsWith('…')).toBe(true)
  })
})
