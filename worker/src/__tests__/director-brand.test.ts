// The Director is told exactly what brand it has, via the envelope's bounded brand
// summary. This proves the summary is tiny vs the summary byte cap and that its
// colours/logo SOURCES are preserved — so the Director can distinguish confirmed brand
// from absent brand, and Twin never treats an absent element as present.
import { describe, it, expect } from 'vitest'
import { projectBrandSnapshot } from '../jobs/brandSnapshot.js'
import { MAX_SUMMARY_BYTES } from '../jobs/directorContract.js'
import { canonicalJson } from '../jobs/editorManifest.js'

describe('director brand summary: bounded + honestly aware', () => {
  it('a full brand snapshot fits far under the summary cap and keeps colours/logo sources', () => {
    const snap = projectBrandSnapshot(
      { tone: 'warm', editing_style: 'word by word', dos: Array.from({ length: 40 }, (_, i) => `do-${i}`) },
      { palette: { primary: '#123456', secondary: '#654321', highlight: '#abcdef' }, palette_source: 'auto', caption_style: 'punchy' },
      { path: 'me/brandkit/logo.png', sha256: 'a'.repeat(64) },
    )
    expect(snap.visual.colorsSource).toBe('auto')
    expect(snap.visual.logoSource).toBe('verified')
    expect(snap.visual.primaryHex).toBe('#123456')
    const summaryBytes = Buffer.byteLength(canonicalJson({ brand: snap }), 'utf8')
    expect(summaryBytes).toBeLessThan(MAX_SUMMARY_BYTES)
    expect(summaryBytes).toBeLessThan(2048) // realistically a few hundred bytes
  })

  it('an absent brand is EXPLICIT (sources "none"), never fabricated', () => {
    const snap = projectBrandSnapshot(null)
    expect(snap.visual.colorsSource).toBe('none')
    expect(snap.visual.logoSource).toBe('none')
    expect(snap.visual.primaryHex).toBeNull()
    expect(snap.visual.logoPath).toBeNull()
  })
})
