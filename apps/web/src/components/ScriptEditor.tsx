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
import { Check, HelpCircle, Loader2, Pencil, SlidersHorizontal, TriangleAlert, User, Video, X } from 'lucide-react'
import {
  answerBeatAsk, applyAskAnswerEdit, applyDialogueEdit, applyHookEdit, buildRecordingScript,
  changesTheRecordedScript, establishDurableRecordingScriptLive, loadRecordingScript,
  SCRIPT_EDIT_MESSAGE, sceneOverrunSec, overrunWorthShowing,
  type RecordingScene, type RecordingScript, type ScriptEditResult,
} from '../lib/api'
import {
  describeEdit, planSetups, startsSetup, setupStrip,
  type ScriptEditRecord, type SetupPlan,
} from '@twinai/shared'
import { recordScriptEdit } from '../lib/scriptEdits'
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

  const commit = async (
    result: ScriptEditResult,
    edit: ScriptEditRecord | null,
  ): Promise<string | null> => {
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
    // ⚠️ RECORDED AFTER THE SCRIPT LANDS, AND NEVER INSTEAD OF IT. The creator's
    // words are the product; this log is not. `recordScriptEdit` swallows its own
    // failures for the same reason — an analytics write must not be able to make
    // a saved edit look unsaved.
    if (edit) void recordScriptEdit(generationId, edit)
    return null
  }

  return <Editor
    script={script} setupPlan={planSetups(script.scenes)}
    hasTake={hasTake} edited={edited} commit={commit} />
}

/**
 * THE SETUP STRIP, AND THE SCENE THE CREATOR IS ACTUALLY LOOKING AT.
 *
 * ⚠️ A STRIP THAT FAILS TO UPDATE IS WORSE THAN THE REPETITION IT REPLACED. Five
 * copies of the room are noise; one confident line naming the wrong room is a
 * person filming in the wrong place. So the strip follows the scroll rather than
 * being stated once at the top — a top banner disappears exactly when the
 * creator is several scenes deep and wondering where the phone was supposed to
 * be, which is the moment it was needed.
 *
 * ⚖️ IT FOLLOWS THE TOPMOST VISIBLE SCENE, NOT THE MOST VISIBLE ONE. The scene
 * being read is the one at the top of the viewport; picking by largest area
 * makes the strip flip back and forth around a boundary while a person stands
 * still.
 */
function Editor({ script, setupPlan, hasTake, edited, commit }: {
  script: RecordingScript
  setupPlan: SetupPlan
  hasTake?: boolean
  edited: boolean
  commit: (result: ScriptEditResult, edit: ScriptEditRecord | null) => Promise<string | null>
}) {
  const [activeScene, setActiveScene] = useState<number | null>(null)
  const activeSetupId = activeScene == null
    ? (setupPlan.setups[0]?.id ?? null)
    // ⚖️ A SILENT INSERT MAPS TO NULL AND MUST NOT BLANK THE STRIP. It belongs to
    // no room, so the room the creator is standing in has not changed — the last
    // spoken scene's setup is still the true answer.
    : (setupPlan.setupIdOf[activeScene] ?? lastSetupAtOrBefore(setupPlan, activeScene))

  useEffect(() => {
    const cards = Array.from(document.querySelectorAll<HTMLElement>('[data-scene-number]'))
    if (cards.length === 0) return
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting)
        if (visible.length === 0) return
        const top = visible.reduce((a, b) =>
          (a.boundingClientRect.top <= b.boundingClientRect.top ? a : b))
        const n = Number((top.target as HTMLElement).dataset.sceneNumber)
        if (Number.isFinite(n)) setActiveScene(n)
      },
      // Anchored near the top of the viewport: the scene being READ, not the one
      // filling the most pixels.
      { rootMargin: '-8% 0px -70% 0px', threshold: 0 },
    )
    cards.forEach((c) => io.observe(c))
    return () => io.disconnect()
  }, [script.generation_id, script.scenes.length])

  return (
    <div className="space-y-6">
      <SetupStrip plan={setupPlan} activeSetupId={activeSetupId} />

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
        sceneNumber={script.scenes[0]?.scene_number ?? 1}
        plan={setupPlan}
        text={script.hook}
        guidance={script.scenes[0]}
        onSave={(text) => commit(applyHookEdit(script, text),
          describeEdit('hook', null, script.hook, text))}
      />

      {script.scenes.map((s) => {
        // Scene 1 IS the hook while it still carries the hook's words; showing
        // both would be the same line twice with two edit boxes, and the second
        // one would silently win.
        if (s.scene_number === 1 && sameWords(s.dialogue, script.hook)) return null
        // ⚠️ CHECKED BEFORE THE SILENT FALLBACK, ON PURPOSE. A `needs_user` beat
        // also has `dialogue: null` — nobody wrote it a line, because only this
        // creator can — and `SilentCard` reads that as "Silent shot", the exact
        // defect this card exists to end: a real question, indistinguishable
        // from b-roll. See `beatAsk.ts`.
        if (typeof s.dialogue !== 'string' && typeof s.ask === 'string' && s.ask.trim() !== '') {
          return <AskCard key={s.scene_number} scene={s} script={script} commit={commit} />
        }
        if (typeof s.dialogue !== 'string' || s.dialogue.trim() === '') {
          return <SilentCard key={s.scene_number} scene={s} />
        }
        return (
          <SceneCard
            key={s.scene_number}
            label={`Scene ${s.scene_number}`}
            sceneNumber={s.scene_number}
            plan={setupPlan}
            text={s.dialogue}
            guidance={s}
            onSave={(text) => commit(applyDialogueEdit(script, s.scene_number, text),
              describeEdit('dialogue', s.scene_number, s.dialogue, text))}
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

/** The setup in force at this scene, when the scene itself belongs to none.
 *
 *  ⚖️ A SILENT INSERT DOES NOT MOVE ANYONE. Scrolling past a cutaway must not
 *  blank the strip — the creator is standing exactly where they were, and an
 *  empty strip would read as "no setup decided" at the moment they are checking
 *  where to stand. */
function lastSetupAtOrBefore(plan: SetupPlan, sceneNumber: number): string | null {
  // ⚖️ THE LATEST SCENE, NOT THE LATEST SETUP. `plan.setups` is in
  // first-appearance order, so a script that goes A → B → A and is scrolled to a
  // cutaway after the return would report B if this iterated setups in order.
  let best: { n: number; id: string } | null = null
  for (const setup of plan.setups) {
    for (const n of setup.sceneNumbers) {
      if (n <= sceneNumber && (best === null || n > best.n)) best = { n, id: setup.id }
    }
  }
  return best?.id ?? null
}

/** The compact, always-visible answer to "where am I supposed to be standing".
 *
 *  ⚠️ ONE LINE, DELIBERATELY. It is read at a glance by someone holding a phone
 *  at arm's length; a paragraph here would be scrolled past like the five copies
 *  it replaces. The full description stays on the card that opens the setup. */
function SetupStrip({ plan, activeSetupId }: { plan: SetupPlan; activeSetupId: string | null }) {
  const setup = plan.setups.find((s) => s.id === activeSetupId)
  // ⚖️ NOTHING IS SHOWN WHEN NOTHING WAS DECIDED. An empty strip stating "Setup
  // A" with no room behind it is furniture.
  if (!setup) return null
  const parts = setupStrip(setup)
  return (
    <div className="sticky top-2 z-20 rounded-full border border-white/10 bg-ink2/90 px-4 py-2 shadow-glass backdrop-blur-md">
      <p className="truncate text-[11px] text-sand">
        <span className="font-semibold text-amber">{parts[0]}</span>
        {parts.slice(1).map((p) => <span key={p}> · {p}</span>)}
      </p>
    </div>
  )
}

function SceneCard({ label, sceneNumber, plan, text, guidance, onSave }: {
  label: string
  sceneNumber: number
  plan: SetupPlan
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

  const opensSetup = startsSetup(plan, sceneNumber)
  const setup = plan.setups.find((s) => s.id === plan.setupIdOf[sceneNumber])

  return (
    <div
      data-scene-number={sceneNumber}
      className="rounded-card border border-white/5 bg-ink2/85 p-6 shadow-glass backdrop-blur-md"
    >
      {/* ⚠️ THE SCENE THAT MOVES SAYS SO, IN FULL. The strip is a glance; this is
          the record. A creator who is about to change where they stand must read
          it on the card they are standing at, not infer it from a line that
          changed above them while they scrolled. */}
      {opensSetup && setup && (
        <p className="mb-4 rounded-lg border border-amber/20 bg-amber/[0.06] px-3 py-2 text-xs text-sand">
          <span className="font-semibold text-amber">Setup {setup.id}</span>
          {' · '}{setup.background}
          {setup.framing && <> · {setup.framing}</>}
        </p>
      )}
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

      {guidance && <Guidance scene={guidance} inSetup={plan.setupIdOf[sceneNumber] != null} />}
    </div>
  )
}

/**
 * A `needs_user` BEAT, RENDERED AS A QUESTION — never as the refusal that used
 * to ship in its place (see `beatAsk.ts`). Answering or skipping calls
 * `answer-beat-ask`, which is the only place the beat's `blueprint.script[i]`
 * gets patched; the line it returns is then written into THIS script the same
 * way any other edit is, so the card becomes an ordinary `SceneCard` on the
 * very next render and everything downstream (teleprompter, edit history)
 * sees one script, not a client guess ahead of the server's.
 *
 * ⚠️ SKIPPING DOES NOT CLOSE THE CARD. A skip can leave no survivable line
 * (`resolveAskAnswer`'s fragment rule) — there is nothing to swap the card
 * for — and even when it does, the creator may still want to answer before
 * they film. The card just remembers it was skipped and keeps the door open.
 */
function AskCard({ scene, script, commit }: {
  scene: RecordingScene
  script: RecordingScript
  commit: (result: ScriptEditResult, edit: ScriptEditRecord | null) => Promise<string | null>
}) {
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [skipped, setSkipped] = useState(false)

  const respond = async (answer: string | null) => {
    if (typeof scene.beat_index !== 'number') {
      setError("This question isn't tied to a beat we can save an answer against.")
      return
    }
    setBusy(true)
    setError(null)
    try {
      const { line, ask_state } = await answerBeatAsk(script.generation_id, scene.beat_index, answer)
      if (line) {
        const err = await commit(
          applyAskAnswerEdit(script, scene.scene_number, line),
          describeEdit('dialogue', scene.scene_number, scene.dialogue, line),
        )
        setError(err)
        if (!err) setSkipped(false)
      } else if (ask_state === 'skipped') {
        // Nothing survived to fill the scene with (or nothing was ever
        // written for it) — honest, not an error.
        setSkipped(true)
      } else {
        setError("That answer couldn't be saved — try again.")
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "That answer couldn't be saved — try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-card border border-teal/25 bg-teal/[0.06] p-6 shadow-glass backdrop-blur-md">
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-full border border-white/5 bg-ink2/40 px-3 py-1 text-[11px] font-semibold tracking-wide text-sand">
          Scene {scene.scene_number}
        </span>
        <span className="inline-flex items-center gap-1 text-[11px] text-teal">
          <HelpCircle className="h-3 w-3" /> Only you can answer this
        </span>
      </div>

      <p className="mt-4 font-display text-lg leading-relaxed text-cream">{scene.ask}</p>

      {skipped && (
        <p className="mt-2 text-xs text-stone">
          Skipped for now — you can still answer it any time before you record.
        </p>
      )}

      <div className="mt-4">
        <textarea
          value={draft}
          onChange={(e) => { setDraft(e.target.value); setError(null) }}
          rows={3}
          placeholder="Type your answer in your own words…"
          aria-label={`Answer for scene ${scene.scene_number}`}
          className="w-full resize-y rounded-2xl border border-white/10 bg-ink/60 p-3 font-display text-lg leading-relaxed text-cream outline-none transition-colors focus:border-teal"
        />
        {error && <p className="mt-2 text-xs text-coral">{error}</p>}
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => respond(draft)}
            disabled={busy || draft.trim() === ''}
            className="inline-flex items-center gap-1.5 rounded-xl bg-cream px-4 py-1.5 text-xs font-semibold text-ink disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Answer
          </button>
          <button
            type="button"
            onClick={() => respond(null)}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 px-4 py-1.5 text-xs text-sand disabled:opacity-60"
          >
            <X className="h-3 w-3" /> Skip for now
          </button>
        </div>
      </div>

      {scene.background?.trim() && <Guidance scene={scene} />}
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

/** ⚖️ THE CARD SHOWS WHAT CHANGES, AND THE SETUP CARRIES WHAT DOES NOT. Where to
 *  film and how it is framed ARE the setup — repeating them per scene is the
 *  five-identical-rooms problem this was reported as. Movement is never dropped:
 *  it is different on every beat, and it is the line the repetition was burying.
 *
 *  ⚠️ `inSetup` IS FALSE FOR A SILENT INSERT AND FOR A SCENE WITH NO SETUP AT
 *  ALL, and both keep every row. No strip speaks for them, so dropping a row
 *  would delete the only place that instruction appears. */
function Guidance({ scene, inSetup = false }: { scene: RecordingScene; inSetup?: boolean }) {
  const rows = [
    ...(inSetup ? [] : [{ icon: Video, color: 'text-amber', label: 'Where to film', value: scene.background }]),
    { icon: User, color: 'text-coral', label: 'How to stand & move', value: scene.movement },
    ...(inSetup ? [] : [{ icon: SlidersHorizontal, color: 'text-teal', label: 'Framing', value: scene.camera_framing }]),
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
