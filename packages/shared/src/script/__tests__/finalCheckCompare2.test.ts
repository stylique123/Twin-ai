// compare-3 item 10: the final check on every finished script, replayed on
// the 16 scripts compare-2 SHIPPED (the old pipeline let each defect below
// through: they are in the shipped text). Each regression test asserts the
// defect's line is not in the final check's output.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { finalCheck, scriptThin, type WriterItem } from '../factsOnly'

type Creator = { key: string; answers?: Record<string, string>; stories?: Array<{ kind: string; text: string }>; products?: Array<{ key: string; name: string; offer?: string; facts?: Array<{ field?: string; value: string }> }> }
const panel = JSON.parse(readFileSync(new URL('../../../../../scripts/ops/fixtures/fictional-panel.json', import.meta.url), 'utf8')) as { creators: Creator[] }
const shipped = JSON.parse(readFileSync(new URL('./fixtures/compare2-shipped.json', import.meta.url), 'utf8')) as Array<{ n: number; c: string; p: string | null; note: string; s: string }>

/** Her material as the facts-only writer sees it (fixture creators). */
export function itemsFor(c: Creator, target: string | null, note: string): WriterItem[] {
  let n = 0
  const out: WriterItem[] = []
  for (const s of c.stories ?? []) {
    const opinion = s.kind === 'opinion' || s.kind === 'belief'
    out.push({ ref: `F${++n}`, id: `s${n}`, origin: ['experience', 'story', 'example'].includes(s.kind) ? 'her_story' : 'her_fact', text: s.text, layer: opinion ? 'background' : 'fact', ...(opinion ? { opinion: true } : {}) })
  }
  for (const [k, v] of Object.entries(c.answers ?? {})) {
    const profile = k === 'profile' || k === 'niche'
    out.push({ ref: `A${++n}`, id: `answer:${k}`, origin: 'her_answer', text: v, layer: profile ? 'background' : 'fact', field: k, ...(profile ? { profile: true } : {}) })
  }
  for (const p of c.products ?? []) {
    for (const f of p.facts ?? []) out.push({ ref: `P${++n}`, id: `p:${p.key}:${n}`, origin: 'product_fact', text: f.value, layer: 'fact', productId: p.key, field: f.field ?? null })
    if (p.key === target && p.offer) out.push({ ref: `O${++n}`, id: 'offer', origin: 'offer', text: p.offer, layer: 'fact', productId: p.key })
  }
  out.push({ ref: 'N', id: 'note', origin: 'her_answer', text: note, layer: 'fact' })
  return out
}
export function replay(n: number) {
  const row = shipped.find((r) => r.n === n)!
  const c = panel.creators.find((x) => x.key === row.c)!
  const beats = row.s.split('\n').map((l, i, a) => ({ section: i === 0 ? 'Hook' : i === a.length - 1 ? 'CTA' : 'Body', line: l.replace(/^\d+\.\s*/, '') }))
  const products = (c.products ?? []).map((p) => ({ id: p.key, name: p.name }))
  return finalCheck(beats, itemsFor(c, row.p, row.note), { note: row.note, targetProductId: row.p, products })
}
const text = (n: number) => replay(n).beats.map((b) => String(b.line ?? '')).join(' ')

describe('final check: regression tests from compare-2 (each line shipped before)', () => {
  it('S-4126D9: invented sample reply', () => expect(text(71)).not.toMatch(/Thanks for checking in|order is on the way/))
  it('S-0AA5A8: invented "DM me"', () => expect(text(49)).not.toMatch(/DM me/))
  it('S-339D5F: invented process (Quiet Loom, scarf)', () => expect(text(29)).not.toMatch(/One wrong thread ruins everything|Tension must stay balanced|I pull the weft/))
  it('S-20D4B5: invented process (Quiet Loom, how I started)', () => expect(text(28)).not.toMatch(/This is how the weaving works|Pulling the thread through/))
  it('S-F72D0F: invented advice ("will reveal how your barrier responds")', () => expect(text(40)).not.toMatch(/reveal how your barrier responds/))
  it('S-AEF883: a 33-word script is thin and never ships', () => expect(scriptThin(replay(48).beats).thin).toBe(true))
  it('S-85B1C6: profile line (paraphrased)', () => expect(text(56)).not.toMatch(/small skincare maker/))
  it('S-C955A7: profile line', () => expect(text(68)).not.toMatch(/small skincare maker/))
  it('S-8448EC: profile line "I weave alone. Slowly."', () => expect(text(31)).not.toMatch(/I weave alone/))
  it('S-2F6966: "that whole evening" is never told before the kiln load it points to', () => {
    const lines = replay(18).beats.map((b) => String(b.line ?? ''))
    const evening = lines.findIndex((l) => /that whole evening/.test(l))
    const load = lines.findIndex((l) => /first kiln load/.test(l))
    expect(evening === -1 || (load !== -1 && load < evening)).toBe(true)
  })
  it('S-5C7731: orphan fragments', () => expect(text(35)).not.toMatch(/It was just unclear copy|what changes the entire problem/))
  it('S-B85B52: lines that say nothing ("So remember: here is the rewrite")', () => expect(text(71)).not.toMatch(/So remember: here is the rewrite/))
  it('restock and "save this checklist" CTAs not on file are cut', () => {
    // "next batch drops" is on file for the Tide Mug (its offer); "today" is not.
    expect(text(42)).not.toMatch(/drops in the shop today/)
    expect(text(70)).not.toMatch(/Save this checklist/)
  })
  it('every kept line names its source; nothing is kept without one', () => {
    for (const r of shipped) for (const l of replay(r.n).record.lines) if (l.kept && l.why === 'sourced') expect(l.source).toBeTruthy()
  })
})
