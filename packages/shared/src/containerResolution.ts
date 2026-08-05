// CONTAINER RESOLUTION — Phase 12 item 12: "nothing unresolved reaches filming."
//
// §2.3: the reference supplies a SHAPE ("three items, escalating, strongest
// last") and something has to decide what goes in it. When nothing does, the
// model leaves the slot in the script — and the slot is a pair of square
// brackets that a creator reads aloud into a camera.
//
// ── WHAT WAS ALREADY THERE, AND WHERE IT LEAKS ───────────────────────────
//
// Two independent placeholder repairers existed, in `Result.tsx` and
// `recordingScriptAdapter.ts`, with near-identical regexes. Both only match:
//
//   1. a bracket token that is the ENTIRE line — `^\[[^\]]*\]$`
//   2. a small family of hook phrases
//
// So `"Today I want to talk about [product name]"` is a placeholder to neither.
// It survives both repairers, reaches the teleprompter, and is read out. That is
// the leak this module closes, and it is why the check is one authority rather
// than a third regex: two copies had already drifted (one trims, one does not,
// so a line with a leading space was a placeholder on the plan screen and real
// dialogue in the recorder).
//
// ── A DECLARED CLIP IS NOT AN UNRESOLVED SLOT ────────────────────────────
//
// `[SHOW: the settings page]` is a DELIBERATE marker — Phase 12 item 11's
// declared clips. It is bracket-shaped and it is not a gap. A resolver that
// stripped every bracket would delete the one construct item 11 is built on,
// while reporting success. It is classified separately and left alone.
//
// ── THE GATE REPORTS; IT DOES NOT SILENTLY REWRITE ───────────────────────
//
// A slot nothing can fill is not repaired by guessing, because §2.3's absolute
// rule is that an unverified fact never reaches a script and the alternative to
// a visible gap is an invented product. It is SHOWN, and the creator now has a
// script editor to fill it in. Only slots with a known correct value — the hook,
// which the generation records — are resolved automatically.

/** What a bracketed span turned out to be. */
export type SlotKind =
  /** `[SHOW: …]` — a declared clip. Deliberate, and left exactly as written. */
  | 'declared_clip'
  /** A hook placeholder. The one kind with a known correct value. */
  | 'hook_placeholder'
  /** A container nothing filled. Shown to the creator; never guessed at. */
  | 'unfilled_container'

export interface ScriptSlot {
  kind: SlotKind
  /** The bracketed text as written, brackets included. */
  raw: string
  /** What was inside the brackets, trimmed. Empty for a bare `[]`. */
  inner: string
  /** Index of the opening bracket in the line it was found in. */
  index: number
}

/** `[SHOW: …]`, the declared-clip marker. Case-insensitive because the model
 *  writes it both ways, and a marker that only counts in capitals is a marker
 *  that silently becomes a gap. */
const DECLARED_CLIP = /^show\s*:/i

/** The hook family, as both prior repairers had it. Kept verbatim so this
 *  module strictly supersedes them rather than changing behaviour on the way. */
const HOOK_PHRASE =
  /\b(hook option\s*\d*|selected hook|insert (the )?hook|your hook (above|here)|hook from above)\b/i

/** Every bracketed span, ANYWHERE in the line — not only a whole-line token.
 *  Non-greedy and bracket-free inside, so two slots on one line stay two. */
const BRACKETED = /\[([^\][]*)\]/g

/**
 * Find every slot in one line of script.
 *
 * Returns them in the order they appear, so a caller replacing spans can walk
 * backwards and keep earlier indices valid.
 */
export function findSlots(line: string): ScriptSlot[] {
  const slots: ScriptSlot[] = []
  for (const m of line.matchAll(BRACKETED)) {
    const inner = (m[1] ?? '').trim()
    slots.push({
      kind: DECLARED_CLIP.test(inner)
        ? 'declared_clip'
        : HOOK_PHRASE.test(inner) ? 'hook_placeholder' : 'unfilled_container',
      raw: m[0],
      inner,
      index: m.index ?? 0,
    })
  }
  // A line that is bare hook prose with no brackets at all — "insert the hook
  // here" — was caught by both prior repairers, so it stays caught.
  if (slots.length === 0 && HOOK_PHRASE.test(line)) {
    slots.push({ kind: 'hook_placeholder', raw: line.trim(), inner: line.trim(), index: 0 })
  }
  return slots
}

/**
 * The slots that must not reach filming.
 *
 * Declared clips are excluded BY DESIGN — see the header. Hook placeholders are
 * excluded when a hook is available to resolve them with, and included when
 * there is none, because an unresolvable hook placeholder is exactly as
 * unfilmable as any other gap.
 */
export function blockingSlots(line: string, hook: string | null): ScriptSlot[] {
  const canResolveHook = typeof hook === 'string' && hook.trim() !== ''
  return findSlots(line).filter((s) => (
    s.kind === 'unfilled_container' || (s.kind === 'hook_placeholder' && !canResolveHook)
  ))
}

/**
 * Fill what has a known correct value; leave the rest visible.
 *
 * ONLY the hook is filled, because the hook is the only slot whose correct value
 * this system actually holds. Everything else stays exactly as written — §2.3:
 * *"an unverified fact never reaches a script"*, and the alternative to a
 * visible `[product name]` is an invented product name, which is the failure
 * that costs a creator their credibility.
 */
export function resolveLine(line: string, hook: string | null): string {
  const canResolveHook = typeof hook === 'string' && hook.trim() !== ''
  if (!canResolveHook) return line
  const slots = findSlots(line)
  if (slots.length === 0) return line

  // A line that is ONLY a hook placeholder becomes the hook. A hook placeholder
  // embedded in a sentence is replaced in place, so the surrounding words the
  // model wrote survive.
  const hookSlots = slots.filter((s) => s.kind === 'hook_placeholder')
  if (hookSlots.length === 0) return line
  if (hookSlots.length === 1 && hookSlots[0].raw === line.trim()) return hook!.trim()

  let out = line
  // Backwards, so replacing one span does not move the next one's index.
  for (let i = hookSlots.length - 1; i >= 0; i--) {
    const s = hookSlots[i]
    if (s.raw === line.trim()) return hook!.trim()
    out = out.slice(0, s.index) + hook!.trim() + out.slice(s.index + s.raw.length)
  }
  return out
}

/**
 * Is this line entirely a placeholder — nothing but a slot?
 *
 * THE SINGLE AUTHORITY replacing the two divergent `isPlaceholder` copies. It
 * trims (one copy did, one did not, so a leading space changed the answer
 * between the plan screen and the recorder) and it treats an empty line as a
 * placeholder, which the recorder's copy did not.
 *
 * A declared clip is NOT one: `[SHOW: the settings page]` on its own line is a
 * clip instruction, and replacing it with the hook — which is what the old
 * whole-line rule would do — would silently destroy it.
 */
export function isWhollyPlaceholder(line: string): boolean {
  const t = line.trim()
  if (t === '') return true
  const slots = findSlots(t)
  if (slots.length !== 1) return false
  const only = slots[0]
  if (only.kind === 'declared_clip') return false
  return only.raw === t
}

export interface ScriptResolution {
  /** Every line's blocking slots, keyed by the line's index. Only lines with
   *  something blocking appear. */
  blocking: Array<{ lineIndex: number; slots: ScriptSlot[] }>
  /** Declared clips found, in order. Not a problem — the input Phase 12 item 11
   *  needs, surfaced rather than discarded. */
  declaredClips: Array<{ lineIndex: number; slot: ScriptSlot }>
}

/**
 * Scan a whole script.
 *
 * `blocking` empty is the precondition Phase 12 item 12 states: nothing
 * unresolved reaches filming.
 */
export function resolveScript(lines: readonly string[], hook: string | null): ScriptResolution {
  const blocking: ScriptResolution['blocking'] = []
  const declaredClips: ScriptResolution['declaredClips'] = []
  lines.forEach((line, lineIndex) => {
    const slots = blockingSlots(line, hook)
    if (slots.length > 0) blocking.push({ lineIndex, slots })
    for (const s of findSlots(line)) {
      if (s.kind === 'declared_clip') declaredClips.push({ lineIndex, slot: s })
    }
  })
  return { blocking, declaredClips }
}

/**
 * How an unfilled container reads to the creator.
 *
 * Names the slot rather than describing the problem in the abstract: "[product
 * name] has nothing in it" is fixable in one edit; "your script has an
 * unresolved container" is not.
 */
export function slotMessage(slot: ScriptSlot): string {
  if (slot.kind === 'hook_placeholder') {
    return 'This line still says to insert your hook, and no hook has been chosen yet.'
  }
  return slot.inner === ''
    ? 'This line has an empty gap in it that nothing filled.'
    : `“${slot.inner}” is a gap nothing filled — say what goes here before you film.`
}
