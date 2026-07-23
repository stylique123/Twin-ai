import { describe, it, expect } from 'vitest'
import { projectBrandSnapshot } from '../brandSnapshot'
import { CAPTION_PRESET_IDS } from '../catalogs'

describe('brandSnapshot: projection is bounded + deterministic', () => {
  it('projects a rich profile into bounded fields', () => {
    const s = projectBrandSnapshot(
      { tone: 'warm', pacing: 'fast and energetic', hook_style: 'question', editing_style: 'word by word',
        dos: Array.from({ length: 40 }, (_, i) => `do-${i}`), donts: ['no jargon'] },
      { primary_hex: '#AABBCC', caption_preset_id: 'caption-punchy-word-v1' },
    )
    expect(s.voice.pacing).toBe('punchy')
    expect(s.voice.doTokens.length).toBeLessThanOrEqual(12)
    expect(s.visual.primaryHex).toBe('#aabbcc')
    expect(s.visual.captionPresetId).toBe('caption-punchy-word-v1')
  })

  it('defaults safely with no brand at all', () => {
    const s = projectBrandSnapshot(null)
    expect(s.voice.pacing).toBe('balanced')
    expect(s.voice.tone).toBe('')
    expect(s.visual.primaryHex).toBeNull()
    expect(CAPTION_PRESET_IDS).toContain(s.visual.captionPresetId)
  })

  it('rejects a non-hex color and a non-catalog caption preset', () => {
    const s = projectBrandSnapshot({ editing_style: 'clean' }, { primary_hex: 'blue', caption_preset_id: 'made-up' })
    expect(s.visual.primaryHex).toBeNull()
    expect(CAPTION_PRESET_IDS).toContain(s.visual.captionPresetId) // fell back to a real one
  })

  it('normalizes pacing from calm/punchy text deterministically', () => {
    expect(projectBrandSnapshot({ pacing: 'slow and measured' }).voice.pacing).toBe('calm')
    expect(projectBrandSnapshot({ pacing: 'snappy' }).voice.pacing).toBe('punchy')
    expect(projectBrandSnapshot({ pacing: 'conversational' }).voice.pacing).toBe('balanced')
  })

  it('is deterministic (same input → identical snapshot)', () => {
    const a = projectBrandSnapshot({ tone: 'bold', dos: ['x', 'y'] }, { primary_hex: '#123456' })
    const b = projectBrandSnapshot({ tone: 'bold', dos: ['x', 'y'] }, { primary_hex: '#123456' })
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
})
