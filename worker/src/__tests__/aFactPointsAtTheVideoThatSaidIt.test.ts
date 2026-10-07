import { describe, expect, it } from 'vitest'
import { attributedUrl, knowledgeRowsFrom } from '../knowledgeRows.js'

// M1 extraction audit (2026-10-07): facts were filed under the wrong video.
const texts = [
  'today we roasted two pounds of the signature blend and bagged it for the market',
  'the inspector came by the roastery and checked the vent hood and the permits',
  'a customer asked why the single origin tastes like berries so I explained the process',
]
const urls = ['https://v/1', 'https://v/2', 'https://v/3']

describe('attributedUrl', () => {
  it('keeps a citation the video really contains', () => {
    expect(attributedUrl({ text: 'The inspector checked the vent hood and permits', source_video: '2' }, urls, texts)).toBe('https://v/2')
  })
  it('moves a wrong citation to the video that says it', () => {
    expect(attributedUrl({ text: 'The inspector checked the vent hood and permits', source_video: '1' }, urls, texts)).toBe('https://v/2')
  })
  it('gives no link when no video says it', () => {
    expect(attributedUrl({ text: 'She once lived abroad teaching yoga classes', source_video: '1' }, urls, texts)).toBeNull()
  })
  it('trusts the citation when no transcripts are given (old behaviour)', () => {
    expect(attributedUrl({ text: 'anything', source_video: '3' }, urls)).toBe('https://v/3')
  })
})

describe('knowledgeRowsFrom source_url', () => {
  it('never borrows a video link for a caption item', () => {
    const rows = knowledgeRowsFrom({
      items: [{ kind: 'experience', text: 'Roasted two pounds of signature blend', basis: 'stated', times_seen: '1', confidence: '0.8', source_video: '1', __source: 'caption' } as never],
      ownerId: 'o', voiceId: 'v', urls, texts, cap: 10, version: 1,
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].source_url).toBeNull()
  })
})
