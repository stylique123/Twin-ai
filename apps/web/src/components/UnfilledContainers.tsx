// "NOTHING UNRESOLVED REACHES FILMING" — Phase 12 item 12, made visible.
//
// A slot the model left in the script — `[product name]`, `[their objection]` —
// is a container §2.3 says something should have filled. Nothing does yet, so
// until then it reaches the teleprompter and gets read aloud.
//
// ── WHY THIS SHOWS RATHER THAN BLOCKS ────────────────────────────────────
//
// The literal reading of item 12 is a hard gate on the record button. That
// would strand a creator whose script has one stray bracket, with the recorder
// refusing and nothing to do about it — and stranding someone at the camera is
// the failure Phase 11 is entirely about.
//
// It is shown HERE, on the plan screen, beside the script editor that can now
// fix it in one edit. The gap is named, the fix is one line away, and the
// creator decides. That is a stronger guarantee than a block: a block they
// cannot clear teaches them to find a way around it.
//
// ── AND IT NEVER GUESSES ─────────────────────────────────────────────────
//
// §2.3's absolute rule is that an unverified fact never reaches a script. The
// alternative to a visible `[product name]` is an invented product name — a
// confidently wrong recommendation, which the plan calls the most expensive
// failure this product can produce. So this reports and offers no auto-fill.
//
// ── AND IT SCANS THE SCRIPT THAT IS FILMED ───────────────────────────────
//
// This read `blueprint.script[]` — the model's beats. That is the same defect
// `declaredClips.ts` was already corrected for (P1-6), and it is wrong in both
// directions: `buildRecordingScript` maps the blueprint onto `scene_timeline`
// LOSSILY — hook-lookalike lines are dropped, the CTA beat moves to the end,
// silent b-roll scenes are inserted — so `script[i]` and `scenes[i]` are not the
// same line.
//
// The consequence was specific and bad: a creator who edited `[product name]`
// out of the recording script was still warned about it, and a bracket they
// introduced BY EDITING never appeared here at all. A gap checker that reports
// gaps in a script nobody films is worse than none — it trains the creator to
// ignore the warning, and the warning is the only thing standing between a
// placeholder and a teleprompter.
import { useMemo } from 'react'
import { TriangleAlert } from 'lucide-react'
import {
  buildRecordingScript, resolveScript, slotMessage,
  type Blueprint, type RecordingScript,
} from '../lib/api'

export function UnfilledContainers({ generationId, blueprint, hook, script }: {
  generationId: string
  blueprint: Blueprint
  hook: string | null
  /** The persisted RecordingScript when the caller holds one. Absent means it
   *  has not been loaded yet, and the blueprint is synthesized the same way
   *  `ScriptEditor` does — the same lines it renders, so the two cannot
   *  disagree about what is in the script. */
  script?: RecordingScript | null
}) {
  const blocking = useMemo(() => {
    let lines: string[]
    try {
      const filmed = script ?? buildRecordingScript({ generationId, blueprint, selectedHook: hook })
      lines = filmed.scenes.map((sc) => sc.dialogue ?? '')
    } catch {
      // A malformed blueprint must not take the plan screen down. Reporting
      // nothing is the safe direction: the ScriptEditor fallback still renders
      // the text, and a missing warning beats a crashed page.
      return []
    }
    return resolveScript(lines, hook).blocking
  }, [generationId, blueprint, hook, script])
  if (blocking.length === 0) return null

  const count = blocking.reduce((n, b) => n + b.slots.length, 0)
  return (
    <div className="rounded-card border border-amber/25 bg-amber/[0.05] p-4">
      <div className="flex items-start gap-2">
        <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber" />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-cream">
            {count === 1 ? 'One gap to fill before you film' : `${count} gaps to fill before you film`}
          </p>
          <ul className="mt-2 space-y-1.5">
            {blocking.flatMap((b) => b.slots.map((s, i) => (
              <li key={`${b.lineIndex}-${i}`} className="text-[11px] leading-relaxed text-sand">
                <span className="text-stone">Scene {b.lineIndex + 1}: </span>
                {slotMessage(s)}
              </li>
            )))}
          </ul>
          {/* No auto-fill button, deliberately. See the header: the alternative
              to a visible gap is an invented one. */}
          <p className="mt-2 text-[11px] leading-relaxed text-stone">
            Edit the line above to say what goes here. We have not filled it in,
            because we do not know what belongs there and a guess would go out
            in your voice.
          </p>
        </div>
      </div>
    </div>
  )
}
