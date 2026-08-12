// CHANGE A WORD BEFORE READING IT INTO A CAMERA FORTY TIMES — Phase 11 item 8.
//
// ── WHY THIS REPLACES THE BLUEPRINT CARDS RATHER THAN ANNOTATING THEM ────
//
// The plan screen used to render `blueprint.script[]` — the model's beats. The
// teleprompter records against `scene_timeline`, the RecordingScript, and
// `buildRecordingScript` maps one onto the other LOSSILY: hook-lookalike lines
// are dropped, the CTA beat is moved to the end, silent b-roll scenes are
// inserted. `script[i]` and `scenes[i]` are not the same line.
//
// So an edit box on the old cards would have edited a line nobody films, and
// showing both lists would put two disagreeing scripts on one screen. This
// renders the script that is actually filmed, and the per-scene guidance rows
// come with it — `RecordingScene` carries the same framing, background and
// movement the old cards read, derived from the same blueprint segments.
//
// ── VIEWING COSTS NOTHING; EDITING ESTABLISHES DURABILITY ────────────────
//
// A generation with no persisted timeline is synthesized IN MEMORY for display.
// Persisting on mere page view would write a row for every creator who opened
// their plan and changed nothing. The first edit is what persists — strictly,
// with a read-back and a canonical comparison, via the same seam recording uses.
//
// A best-effort save would be wrong here in a way it is not elsewhere.
// `saveRecordingScript` is documented as a convenience cache the worker can do
// without; an EDIT is not a cache. If it does not land, the creator films the
// old words — so failure is surfaced, and the field keeps their text.
import { useEffect, useMemo, useRef, useState } from 'react'
import { BadgeCheck, Check, Loader2, Pencil, SlidersHorizontal, TriangleAlert, User, Video, X } from 'lucide-react'
import {
  applyDialogueEdit, applyHookEdit, buildRecordingScript, changesTheRecordedScript,
  establishDurableRecordingScriptLive, loadRecordingScript, SCRIPT_EDIT_MESSAGE,
  sceneOverrunSec, overrunWorthShowing,
  type RecordingScene, type RecordingScript, type ScriptEditResult,
} from '../lib/api'
import type { Blueprint } from '../lib/types'
import { cn } from '../lib/cn'

interface Props {
  generationId: string
  blueprint: Blueprint
  selectedHook: string | null
  /** True when a take is already saved for this generation. Editing stays
   *  allowed — the take carries its own immutable capture-time snapshot, so
   *  nothing already filmed is invalidated — but the creator is told, because
   *  a take filmed against the old words is a take of a different script. */
  hasTake?: boolean
  /** Rendered when the recording script cannot be produced at all, so the plan
   *  screen shows the model's beats read-only rather than nothing. */
  fallback: React.ReactNode
  /**
   * THE SCRIPT THIS COMPONENT IS SHOWING, lifted to whoever renders it.
   *
   * P1-6, second half. `UnfilledContainers` warns about unresolved `[slots]`,
   * and it is a SIBLING of this component with no shared state — so it was
   * synthesizing its own copy from the blueprint while the creator edited a
   * different, persisted one here. Removing `[product name]` left the warning
   * standing; adding a bracket produced none. A warning you cannot clear is how
   * a safety banner becomes furniture, and this banner is the only thing between
   * a placeholder and a teleprompter reading it aloud.
   *
   * Reporting up rather than moving the state up: this component OWNS loading,
   * editing and durable persistence of the script, and splitting that ownership
   * across the page would put the write path further from the thing that knows
   * whether a write succeeded.
   */
  onScriptChange?: (script: RecordingScript | null) => void
}

export function ScriptEditor({ generationId, blueprint, selectedHook, hasTake, fallback, onScriptChange }: Props) {
  const [script, setScript] = useState<RecordingScript | null>(null)
  const [loading, setLoading] = useState(true)
  // The script as it was when this screen opened. Compared against the current
  // one to tell the creator whether an already-saved take was filmed against
  // different words — and compared on the SNAPSHOT's fields only, so a
  // guidance-only change never raises it.
  const original = useRef<RecordingScript | null>(null)

  // One effect rather than a call beside every setScript: there are four of
  // them (load, synthesize, establish-durable, edit) and the one that gets
  // forgotten is the one that reintroduces the bug.
  useEffect(() => { onScriptChange?.(script) }, [script, onScriptChange])

  useEffect(() => {
    let alive = true
    ;(async () => {
      let loaded: RecordingScript | null = null
      try {
        loaded = await loadRecordingScript(generationId)
      } catch {
        // A read failure is not a missing timeline. Synthesizing over one would
        // let an edit be written against a script that is not the persisted one.
        if (alive) { setScript(null); setLoading(false) }
        return
      }
      if (!alive) return
      const next = loaded ?? safeBuild(generationId, blueprint, selectedHook)
      original.current = next
      setScript(next)
      setLoading(false)
    })()
    return () => { alive = false }
  }, [generationId, blueprint, selectedHook])

  const edited = useMemo(
    () => (script && original.current ? changesTheRecordedScript(original.current, script) : false),
    [script],
  )

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-stone">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading your script…
      </div>
    )
  }
  if (!script) return <>{fallback}</>

  const commit = async (result: ScriptEditResult): Promise<string | null> => {
    if (!result.ok) {
      // `unchanged` is not a failure and gets no message: nothing went wrong,
      // and saying so would make a non-event look like one.
      return result.reason === 'unchanged' ? null : SCRIPT_EDIT_MESSAGE[result.reason]
    }
    const durable = await establishDurableRecordingScriptLive(result.script)
    if (!durable.ok || !durable.script) {
      return "We couldn't save that change. Your words are still in the box — try again before recording."
    }
    setScript(durable.script)
    return null
  }

  return (
    <div className="space-y-6">
      {hasTake && edited && (
        <div className="flex items-start gap-2 rounded-card border border-amber/25 bg-amber/[0.05] p-3">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber" />
          <p className="text-xs leading-relaxed text-sand">
            You've already recorded a take, and it was filmed against the words as
            they were. It stays exactly as you filmed it — record again if you
            want the new lines.
          </p>
        </div>
      )}

      <SceneCard
        key="hook"
        label="Hook"
        text={script.hook}
        guidance={script.scenes[0]}
        onSave={(text) => commit(applyHookEdit(script, text))}
      />

      {script.scenes.map((s) => {
        // Scene 1 IS the hook while it still carries the hook's words; showing
        // both would be the same line twice with two edit boxes, and the second
        // one would silently win.
        if (s.scene_number === 1 && sameWords(s.dialogue, script.hook)) return null
        if (typeof s.dialogue !== 'string' || s.dialogue.trim() === '') {
          return <SilentCard key={s.scene_number} scene={s} />
        }
        return (
          <SceneCard
            key={s.scene_number}
            label={`Scene ${s.scene_number}`}
            text={s.dialogue}
            guidance={s}
            onSave={(text) => commit(applyDialogueEdit(script, s.scene_number, text))}
          />
        )
      })}
    </div>
  )
}

const sameWords = (a: string | null, b: string): boolean =>
  typeof a === 'string' && a.trim() === b.trim()

/** Synthesizing can throw on a malformed blueprint. Returning null makes the
 *  caller render the read-only fallback instead of taking the plan screen down. */
function safeBuild(
  generationId: string, blueprint: Blueprint, selectedHook: string | null,
): RecordingScript | null {
  try {
    return buildRecordingScript({ generationId, blueprint, selectedHook })
  } catch {
    return null
  }
}

/** THE DRIFT, WHERE IT IS ACTIONABLE.
 *
 *  A beat was planned for 6 seconds and the line now estimates at 14. Before
 *  this, the editor could only show the current number, so a creator learned
 *  they had overrun while filming it — which is the expensive place to find out.
 *
 *  Renders NOTHING when there is no target. "Nothing to compare" and "no drift"
 *  are different facts and only one of them means the line is the right length,
 *  so an absent plan shows an absent indicator rather than a reassuring one. */
function BeatLength({ scene }: { scene?: RecordingScene }) {
  if (!scene || typeof scene.target_sec !== 'number') return null
  const over = sceneOverrunSec(scene)
  if (!overrunWorthShowing(over)) {
    return <span className="text-[11px] text-sand/60">{scene.target_sec}s beat</span>
  }
  return (
    <span className="text-[11px] text-coral">
      {scene.duration_sec}s against a {scene.target_sec}s beat, about {over}s long
    </span>
  )
}

function SceneCard({ label, text, guidance, onSave }: {
  label: string
  text: string
  guidance?: RecordingScene
  onSave: (text: string) => Promise<string | null>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(text)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Follows the saved value while NOT editing. Reopening the box on a stale
  // draft would offer the creator their own discarded text as the current line.
  useEffect(() => { if (!editing) setDraft(text) }, [text, editing])

  const save = async () => {
    setBusy(true)
    const err = await onSave(draft)
    setBusy(false)
    setError(err)
    // Stay open on failure, with their words still in the box. Closing would
    // discard the edit and leave the old line looking like the accepted one.
    if (!err) setEditing(false)
  }

  return (
    <div className="rounded-card border border-white/5 bg-ink2/85 p-6 shadow-glass backdrop-blur-md">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-white/5 bg-ink2/40 px-3 py-1 text-[11px] font-semibold tracking-wide text-sand">
            {label}
          </span>
          <BeatLength scene={guidance} />
        </div>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label={`Edit the words for ${label.toLowerCase()}`}
            className="inline-flex items-center gap-1 text-[11px] text-stone transition-colors hover:text-cream"
          >
            <Pencil className="h-3 w-3" /> Edit
          </button>
        )}
      </div>

      {editing ? (
        <div className="mt-4">
          <textarea
            value={draft}
            onChange={(e) => { setDraft(e.target.value); setError(null) }}
            rows={3}
            autoFocus
            aria-label={`Words for ${label.toLowerCase()}`}
            className="w-full resize-y rounded-2xl border border-white/10 bg-ink/60 p-3 font-display text-lg leading-relaxed text-cream outline-none transition-colors focus:border-teal"
          />
          {error && <p className="mt-2 text-xs text-coral">{error}</p>}
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-xl bg-cream px-4 py-1.5 text-xs font-semibold text-ink disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Save
            </button>
            <button
              type="button"
              onClick={() => { setDraft(text); setError(null); setEditing(false) }}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 px-4 py-1.5 text-xs text-sand disabled:opacity-60"
            >
              <X className="h-3 w-3" /> Cancel
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-4 font-display text-lg leading-relaxed text-cream">“{text}”</p>
      )}

      {guidance && <Guidance scene={guidance} />}
    </div>
  )
}

function SilentCard({ scene }: { scene: RecordingScene }) {
  return (
    <div className="rounded-card border border-white/5 bg-ink2/50 p-6">
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-full border border-white/5 bg-ink2/40 px-3 py-1 text-[11px] font-semibold tracking-wide text-stone">
          Scene {scene.scene_number}
        </span>
        {/* No edit affordance. A silent insert is a shot, not a line — offering
            a text box would invite turning it into a spoken scene by typing. */}
        <span className="text-[11px] text-stone/70">Silent shot</span>
      </div>
      <p className="mt-3 text-sm text-sand">{scene.caption_text || 'Cutaway'}</p>
      <Guidance scene={scene} />
    </div>
  )
}

function Guidance({ scene }: { scene: RecordingScene }) {
  const rows = [
    { icon: Video, color: 'text-amber', label: 'Where to film', value: scene.background },
    { icon: User, color: 'text-coral', label: 'How to stand & move', value: scene.movement },
    { icon: SlidersHorizontal, color: 'text-teal', label: 'Framing', value: scene.camera_framing },
    // WHAT MAKES THIS BEAT BELIEVABLE. Decided in `beat_plan` alongside the
    // beat's length, and until now shown to nobody — the one field that tells a
    // creator what to CAPTURE never reached the person holding the camera.
    //
    // Last in the list on purpose: framing and where to stand are what they need
    // before rolling, and proof is what makes the take worth keeping.
    { icon: BadgeCheck, color: 'text-teal', label: 'What makes this land', value: scene.proof ?? '' },
  ].filter((r) => r.value && r.value.trim() !== '')
  if (rows.length === 0) return null
  return (
    <div className="mt-5 space-y-3.5 rounded-2xl border border-white/[0.04] bg-ink/40 p-4">
      {rows.map((r) => (
        <div key={r.label} className="flex items-start gap-3">
          <r.icon className={cn('mt-0.5 h-4 w-4 shrink-0', r.color)} />
          <div className="min-w-0">
            <span className="mb-0.5 block text-[11px] font-medium text-stone">{r.label}</span>
            <span className="text-sm leading-relaxed text-sand">{r.value}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
