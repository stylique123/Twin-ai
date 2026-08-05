// THE CLIP SECTION — Phase 12 item 13, gated and slot-aware.
//
// ── WHERE THE GUIDANCE COMES FROM ────────────────────────────────────────
//
// The script already says what to show — it just never said "record your
// screen for this". Two sources, in priority order:
//
//   1. DECLARED CLIPS, `[SHOW: the settings page]`. `containerResolution.ts`
//      finds these and returns them as an output rather than discarding them.
//      This is item 11's explicit form and the better one — but NOTHING EMITS
//      IT YET: `generate-blueprint` has no screen-recording concept, so this
//      branch is dormant until the generator learns one. Supported rather than
//      waited for.
//   2. The SHOT LIST's b-roll entries, which every blueprint already carries.
//      `b_roll_visual` is the model's description of what to show, written per
//      video. For a creator who records their screen, those shots ARE the
//      screen clips.
//
// Each slot gets its own recorder, labelled with the slot, and what comes back
// is name-matched on `clip_label`.
//
// NO SLOTS MEANS NO SECTION. A recorder with nothing to guide it is a button
// asking the creator to invent a job, which is the clutter this is meant to
// avoid — so the section does not render at all.
//
// ── THE GATE IS `isExplicitlyTrue`, WHICH IS THE UNUSUAL DIRECTION ───────
//
// `capabilities.ts` names this exact feature as its example: a screen-recording
// clip type must not appear until a creator has SAID they record their screen.
// An unanswered flag hides it. That is the reverse of the footage-checklist
// rule, and the asymmetry genuinely runs the other way — a talking-head creator
// shown a "record my screen" button is being offered something they do not do,
// whereas a missing footage checklist costs somebody a video.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, MonitorUp } from 'lucide-react'
import {
  isExplicitlyTrue, listBrandVoices, listClips, resolveCapabilities, resolveScript,
  type ClipAsset, type Blueprint,
} from '../lib/api'
import { ScreenClipRecorder } from './ScreenClipRecorder'

export function ScreenClips({ generationId, blueprint, hook, capabilityFlags }: {
  generationId: string
  blueprint: Blueprint
  hook: string | null
  /** The video's own answer, when it has one. The brand default is loaded here
   *  rather than threaded through the plan screen — one prop instead of two,
   *  and the precedence stays where `resolveCapabilities` defines it. */
  capabilityFlags?: unknown
}) {
  const [brandFlags, setBrandFlags] = useState<unknown>(undefined)
  useEffect(() => {
    listBrandVoices()
      .then((vs) => {
        const def = vs.find((v) => v.is_default && v.status === 'ready') ?? vs.find((v) => v.status === 'ready')
        // `?? null` keeps "loaded, answered nothing" distinct from "not loaded",
        // and neither ever resolves to false.
        setBrandFlags(def?.default_capability_flags ?? null)
      })
      .catch(() => setBrandFlags(null))
  }, [])

  const allowed = useMemo(
    () => isExplicitlyTrue(resolveCapabilities(capabilityFlags, brandFlags).can_record_screen),
    [capabilityFlags, brandFlags],
  )
  // Declared clips first, then the shot list. Deduped by name so a script that
  // declares a slot ALSO covered by a b-roll shot shows one recorder, not two.
  const slots = useMemo(() => {
    const out: { key: string; name: string; detail: string | null }[] = []
    const seen = new Set<string>()
    const add = (name: string, detail: string | null) => {
      const clean = name.trim()
      if (clean === '' || seen.has(clean.toLowerCase())) return
      seen.add(clean.toLowerCase())
      out.push({ key: clean, name: clean, detail })
    }
    for (const { slot } of resolveScript((blueprint.script ?? []).map((s) => s.line ?? ''), hook).declaredClips) {
      add(slot.inner.replace(/^show\s*:/i, ''), null)
    }
    for (const shot of blueprint.shot_list ?? []) {
      if (shot.shot_type !== 'b_roll') continue
      add(shot.b_roll_visual || shot.shot || '', shot.notes || null)
    }
    return out
  }, [blueprint, hook])
  const [clips, setClips] = useState<ClipAsset[] | null>(null)

  const refresh = useCallback(() => {
    listClips(generationId)
      .then(setClips)
      // A read failure is NOT "no clips". Left null, the section shows the
      // recorders and no list, rather than an empty state that would read as
      // "you have not recorded any" to someone who has.
      .catch(() => setClips(null))
  }, [generationId])
  useEffect(() => { if (allowed) refresh() }, [allowed, refresh])

  // Hidden entirely when the creator has not said they record their screen, and
  // ALSO when the script asks for nothing to show. Either way there is no job
  // here, and an empty section is clutter.
  if (!allowed || slots.length === 0) return null

  const byLabel = new Map((clips ?? []).filter((c) => c.clip_label).map((c) => [c.clip_label!, c]))
  const unattached = (clips ?? []).filter((c) => !c.clip_label)

  return (
    <div className="rounded-card border border-white/5 bg-ink2/85 p-5 shadow-glass backdrop-blur-md">
      <h2 className="flex items-center gap-2 font-heading text-xs font-semibold uppercase tracking-wide text-stone">
        <MonitorUp className="h-4 w-4" /> Screen clips
      </h2>

      <p className="mt-2 text-xs leading-relaxed text-stone">
        Your script asks to show {slots.length === 1 ? 'one thing' : `${slots.length} things`}.
        Record each one and we'll keep it with the line it belongs to.
      </p>
      <ul className="mt-3 space-y-3">
        {slots.map((slot) => {
          const existing = byLabel.get(slot.name)
          return (
            <li key={slot.key} className="rounded-2xl border border-white/[0.06] bg-ink/40 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-sm text-cream">{slot.name}</span>
                  {slot.detail && (
                    <p className="mt-0.5 text-[11px] leading-relaxed text-stone">{slot.detail}</p>
                  )}
                </div>
                {existing?.status === 'ready' && (
                  <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-teal">
                    <Check className="h-3 w-3" /> Recorded
                  </span>
                )}
              </div>
              <div className="mt-2">
                <ScreenClipRecorder generationId={generationId} label={slot.name} onSaved={refresh} />
              </div>
            </li>
          )
        })}
      </ul>

      {unattached.length > 0 && (
        <p className="mt-3 text-[11px] text-stone">
          {unattached.length} clip{unattached.length === 1 ? '' : 's'} saved without a slot.
        </p>
      )}
    </div>
  )
}
