import { describe, it, expect } from 'vitest'
import { projectBrandSnapshot } from '../brandSnapshot'
import { CAPTION_PRESET_IDS } from '../catalogs'

describe('brandSnapshot: reads the real brand + is honestly aware of what it has', () => {
  it('projects a real palette + profile into bounded fields', () => {
    const s = projectBrandSnapshot(
      { tone: 'warm', pacing: 'fast and energetic', hook_style: 'question', editing_style: 'word by word',
        dos: Array.from({ length: 40 }, (_, i) => `do-${i}`), donts: ['no jargon'] },
      { palette: { primary: '#AABBCC' }, palette_source: 'manual', caption_style: 'punchy' },
    )
    expect(s.schemaVersion).toBe(3)
    expect(s.voice.pacing).toBe('punchy')
    expect(s.voice.doTokens.length).toBeLessThanOrEqual(12)
    expect(s.visual.primaryHex).toBe('#aabbcc')
    expect(s.visual.colorsSource).toBe('manual')
    expect(CAPTION_PRESET_IDS).toContain(s.visual.captionPresetId)
  })

  it('defaults safely with NO brand — nothing invented, sources are "none"', () => {
    const s = projectBrandSnapshot(null)
    expect(s.voice.pacing).toBe('balanced')
    expect(s.visual.primaryHex).toBeNull()
    expect(s.visual.colorsSource).toBe('none')
    expect(s.visual.logoPath).toBeNull()
    expect(s.visual.logoSource).toBe('none')
  })

  it('a scan-blocked (pending) palette is treated as NONE, never as present', () => {
    const s = projectBrandSnapshot({}, { palette: { primary: '#123456' }, palette_source: 'pending' })
    expect(s.visual.primaryHex).toBeNull()
    expect(s.visual.colorsSource).toBe('none')
  })

  it('auto-learned colors report colorsSource "auto"', () => {
    const s = projectBrandSnapshot({}, { palette: { primary: '#123456', secondary: '#654321' }, palette_source: 'auto' })
    expect(s.visual.primaryHex).toBe('#123456')
    expect(s.visual.colorsSource).toBe('auto')
  })

  it('rejects non-hex palette values → none', () => {
    const s = projectBrandSnapshot({}, { palette: { primary: 'blue' }, palette_source: 'manual' })
    expect(s.visual.primaryHex).toBeNull()
    expect(s.visual.colorsSource).toBe('none')
  })

  it('a logo appears ONLY when the caller verified it (path + sha); else none', () => {
    const none = projectBrandSnapshot({}, { logo_path: 'someone/brandkit/logo.png' })
    expect(none.visual.logoPath).toBeNull()
    expect(none.visual.logoSource).toBe('none')
    const verified = projectBrandSnapshot({}, { logo_path: 'me/brandkit/logo.png' }, { path: 'me/brandkit/logo.png', sha256: 'a'.repeat(64) })
    expect(verified.visual.logoPath).toBe('me/brandkit/logo.png')
    expect(verified.visual.logoSha256).toBe('a'.repeat(64))
    expect(verified.visual.logoSource).toBe('verified')
  })

  it('drops a malformed verified logo to none (fail-closed)', () => {
    const badSha = projectBrandSnapshot({}, {}, { path: 'me/brandkit/logo.png', sha256: 'not-a-sha' })
    expect(badSha.visual.logoSource).toBe('none')
  })

  it('is deterministic (same input → identical snapshot)', () => {
    const a = projectBrandSnapshot({ tone: 'bold', dos: ['x', 'y'] }, { palette: { primary: '#123456' }, palette_source: 'manual' })
    const b = projectBrandSnapshot({ tone: 'bold', dos: ['x', 'y'] }, { palette: { primary: '#123456' }, palette_source: 'manual' })
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
})
