// A MINIMAL TrueType ADVANCE-WIDTH READER — enough to answer one question the
// repo has so far refused to answer by guessing: how wide, in pixels, is a
// caption line actually drawn?
//
// `maxCharsPerLine` is a CHARACTER proxy. editorCompile says so where it splits
// long tokens ("the renderer measures nothing here"), and caption-safe-area
// deliberately declined to turn it into a pixel claim because doing so "needs a
// glyph-advance constant nobody has measured". This measures it, from the same
// font file the renderer pins in render_catalog_v1.json — no constant is
// invented, and nothing here is used by shipped code.
//
// WHAT IT DELIBERATELY DOES NOT MODEL. Kerning (`kern`/`GPOS`), ligatures,
// shaping, and the ASS `Outline: 4` border. Kerning in DejaVu Sans Bold is
// small and almost always NEGATIVE, and the outline grows the drawn box rather
// than the advance — so a sum of advances is a slight UNDER-estimate of the
// drawn extent and a very close estimate of the layout width. An under-estimate
// is the safe direction for a "does it fit" guard: it cannot manufacture a
// failure that is not there.

import { readFileSync } from 'node:fs'

export interface FontMetrics {
  unitsPerEm: number
  /** Advance width in font units; the font's own `.notdef`/last advance for unmapped code points. */
  advanceOfCodePoint(cp: number): number
}

const u16 = (b: Buffer, o: number) => b.readUInt16BE(o)
const i16 = (b: Buffer, o: number) => b.readInt16BE(o)
const u32 = (b: Buffer, o: number) => b.readUInt32BE(o)

/** Parse the table directory into name -> offset. Throws on anything unexpected. */
function tableDirectory(buf: Buffer): Map<string, number> {
  const tag = u32(buf, 0)
  // 0x00010000 = TrueType outlines, 'true' = the legacy Apple sfnt tag.
  if (tag !== 0x00010000 && tag !== 0x74727565) throw new Error(`not a TrueType sfnt: 0x${tag.toString(16)}`)
  const tables = new Map<string, number>()
  const n = u16(buf, 4)
  for (let i = 0; i < n; i++) {
    const rec = 12 + i * 16
    tables.set(buf.toString('ascii', rec, rec + 4), u32(buf, rec + 8))
  }
  return tables
}

/** cmap format 4 (BMP) -> glyph id. Format 4 is what DejaVu's Windows/Unicode subtable uses. */
function readCmapFormat4(buf: Buffer, sub: number): Map<number, number> {
  const map = new Map<number, number>()
  const segX2 = u16(buf, sub + 6)
  const segs = segX2 / 2
  const endO = sub + 14
  const startO = endO + segX2 + 2
  const deltaO = startO + segX2
  const rangeO = deltaO + segX2
  for (let s = 0; s < segs; s++) {
    const end = u16(buf, endO + s * 2)
    const start = u16(buf, startO + s * 2)
    if (start > end) continue
    const delta = i16(buf, deltaO + s * 2)
    const rangeOffset = u16(buf, rangeO + s * 2)
    for (let cp = start; cp <= end && cp !== 0xffff; cp++) {
      let gid: number
      if (rangeOffset === 0) {
        gid = (cp + delta) & 0xffff
      } else {
        const gi = rangeO + s * 2 + rangeOffset + (cp - start) * 2
        if (gi + 1 >= buf.length) continue
        const raw = u16(buf, gi)
        gid = raw === 0 ? 0 : (raw + delta) & 0xffff
      }
      if (gid !== 0) map.set(cp, gid)
    }
  }
  return map
}

function findCmapFormat4(buf: Buffer, cmap: number): Map<number, number> {
  const n = u16(buf, cmap + 2)
  // Windows/Unicode BMP (3,1) first, then Unicode (0,x) — the two DejaVu ships.
  for (const want of [[3, 1], [0, 3], [0, 4], [0, 6], [3, 0]] as const) {
    for (let i = 0; i < n; i++) {
      const rec = cmap + 4 + i * 8
      if (u16(buf, rec) !== want[0] || u16(buf, rec + 2) !== want[1]) continue
      const sub = cmap + u32(buf, rec + 4)
      if (u16(buf, sub) === 4) return readCmapFormat4(buf, sub)
    }
  }
  throw new Error('no cmap format 4 subtable found')
}

export function loadFontMetrics(fontPath: string): FontMetrics {
  const buf = readFileSync(fontPath)
  const t = tableDirectory(buf)
  for (const need of ['head', 'hhea', 'hmtx', 'cmap']) {
    if (!t.has(need)) throw new Error(`font is missing the ${need} table`)
  }
  const unitsPerEm = u16(buf, t.get('head')! + 18)
  if (!unitsPerEm) throw new Error('head.unitsPerEm is zero')
  const numberOfHMetrics = u16(buf, t.get('hhea')! + 34)
  if (!numberOfHMetrics) throw new Error('hhea.numberOfHMetrics is zero')
  const hmtx = t.get('hmtx')!
  const cmap = findCmapFormat4(buf, t.get('cmap')!)

  // Past numberOfHMetrics the format stops repeating advances: every remaining
  // glyph shares the LAST one. Monospace fonts store exactly one.
  const advanceOfGlyph = (gid: number) =>
    u16(buf, hmtx + Math.min(gid, numberOfHMetrics - 1) * 4)

  return {
    unitsPerEm,
    advanceOfCodePoint: (cp) => advanceOfGlyph(cmap.get(cp) ?? 0),
  }
}

/** Layout width of one line, in pixels, at `fontSizePx`. Sum of advances; see the header. */
export function measureLinePx(text: string, m: FontMetrics, fontSizePx: number): number {
  let units = 0
  for (const ch of text) units += m.advanceOfCodePoint(ch.codePointAt(0)!)
  return (units * fontSizePx) / m.unitsPerEm
}
