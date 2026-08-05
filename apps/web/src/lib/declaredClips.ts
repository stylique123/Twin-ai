// The declared-clip slots a script asks the creator to show.
//
// A MODULE OF ITS OWN so the derivation is testable, and so the surface that
// renders it (components/DeclaredClips.tsx) cannot be the only definition of
// what counts as a slot. There is exactly one parser under this —
// `containerResolution.resolveScript` in the shared package — and this adds no
// second regex of its own; it only strips the marker prefix and dedupes.
import { resolveScript, type Blueprint } from './api'

/** One slot the script declares, with where it was declared so the creator can
 *  find the line it came from. */
export interface DeclaredSlot {
  label: string
  sceneNumber: number
}

/** `[SHOW: the settings page]` → `the settings page`. The marker prefix is
 *  matched case-insensitively for the same reason `containerResolution` matches
 *  it that way: a marker that only counts in capitals silently becomes a gap. */
function slotLabel(inner: string): string {
  return inner.replace(/^show\s*:/i, '').trim()
}

/** The declared slots, in script order, one entry per distinct label.
 *
 *  DEDUPED CASE-INSENSITIVELY: a script that says `[SHOW: the dashboard]` twice
 *  is asking for one clip shown twice, not two recordings of the same screen —
 *  and `clip_label` matching downstream would not be able to tell them apart
 *  anyway, so offering two capture buttons would produce two rows fighting over
 *  one slot. */
export function declaredSlots(blueprint: Blueprint, hook: string | null): DeclaredSlot[] {
  const lines = (blueprint.script ?? []).map((s) => s.line ?? '')
  const out: DeclaredSlot[] = []
  const seen = new Set<string>()
  for (const { lineIndex, slot } of resolveScript(lines, hook).declaredClips) {
    const label = slotLabel(slot.inner)
    if (label === '') continue // `[SHOW:]` declares nothing to record.
    const key = label.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ label, sceneNumber: lineIndex + 1 })
  }
  return out
}
