// GENERATED FROM packages/shared/src/script/featureClaims.ts — DO NOT EDIT.
// Run: node scripts/ci/generate_shared_pilot_core.mjs
// Edit the source instead. CI regenerates this file and fails on a diff.
// @ts-nocheck
// A PRODUCT FEATURE NOBODY GAVE THE WRITER (advisor labels, panel 12 redraw,
// S-AFD7DC: "FlowDesk sorts your shop inbox so replies get drafted"). The
// product sorts emails into cards on a board; it drafts nothing.
//
// The invention gate judges product claims, but by model call: with no quota
// it never runs and the line ships. This is the backstop with no model: a
// sentence that NAMES the product and gives it a capability from a closed list
// of software/product verbs is cut when that capability's stem appears nowhere
// in what the writer was given (product facts, her knowledge, her answers,
// the brief). Paraphrase is the known limit, so the list is narrow and the
// sentence must name the product: her own methods ("Tag every email") are
// never touched. Only cuts; never adds. Pure; the edge copy is generated.

/** Capability stems: "drafts", "drafted", "drafting" all match "draft". */
export const FEATURE_STEMS = [
  'draft', 'write', 'wrote', 'generat', 'automat', 'auto-', 'sort', 'route', 'schedul', 'track', 'sync', 'send', 'repl',
  'predict', 'recommend', 'analy', 'translat', 'detect', 'summari', 'transcrib', 'remind', 'notif', 'alert', 'integrat',
  'import', 'export', 'forecast', 'categori', 'tag', 'filter', 'assign', 'escalat', 'learn', 'personali', 'optimi',
] as const

const words = (t: string) => String(t ?? '').toLowerCase().match(/[a-z][a-z-]*/g) ?? []
const sentencesOf = (l: string) => (String(l ?? '').match(/[^.!?]+[.!?]*/g) ?? []).map((s) => s.trim()).filter(Boolean)

/** Stems a sentence claims for the product: none when the product is not named in it. */
export function claimedFeatures(sentence: string, productName: string): string[] {
  const name = String(productName ?? '').trim().toLowerCase()
  if (name.length < 3 || !String(sentence ?? '').toLowerCase().includes(name)) return []
  const ws = words(sentence)
  return FEATURE_STEMS.filter((st) => ws.some((w) => w.startsWith(st)))
}

/** Every stem backed somewhere in the writer's material. */
function backed(support: string): Set<string> {
  const ws = words(support)
  return new Set(FEATURE_STEMS.filter((st) => ws.some((w) => w.startsWith(st))))
}

export interface FeatureCut { beats: number; sentences: number; stems: string[] }

/**
 * Cuts, beat by beat, each sentence that names the product and claims an
 * unbacked capability. A beat left empty is dropped. Nothing is cut when that
 * would leave fewer than `floor` spoken beats.
 */
export function dropUnbackedFeatures<T extends { line?: unknown }>(beats: readonly T[], productName: string, support: string, floor = 3): { beats: T[]; cut: FeatureCut } {
  const ok = backed(support)
  const stems = new Set<string>()
  let sentences = 0, emptied = 0
  const out: T[] = []
  for (const b of beats) {
    const line = typeof b?.line === 'string' ? b.line : ''
    if (!line.trim()) { out.push(b); continue }
    const kept = sentencesOf(line).filter((s) => {
      const bad = claimedFeatures(s, productName).filter((st) => !ok.has(st))
      if (!bad.length) return true
      bad.forEach((st) => stems.add(st)); sentences++
      return false
    })
    let text = kept.join(' ').trim().replace(/^(?:and|so|but)\s+/i, '')
    if (text) text = text.charAt(0).toUpperCase() + text.slice(1)
    if (!text || !/[a-z0-9]/i.test(text)) { emptied++; continue }
    out.push(text === line ? b : { ...b, line: text })
  }
  const spoken = out.filter((b) => typeof b?.line === 'string' && String(b.line).trim()).length
  if (!sentences || spoken < floor) return { beats: [...beats], cut: { beats: 0, sentences: 0, stems: [] } }
  return { beats: out, cut: { beats: emptied, sentences, stems: [...stems] } }
}
