// Editor v2 — Phase 8 Batch 8.5: assembling CompileInput from persisted evidence.
//
// `editorCompile.ts` owns "pure Decision + evidence -> EditPlan" (Gate-0 §7).
// This file owns the step immediately before it: turning the PERSISTED,
// digest-pinned analysis components and the PERSISTED director decision into
// the `CompileInput` that function expects. It is pure — it takes objects and
// returns an object, performs no database read, and opens nothing. The reads
// happen in the stage runner; this is the part worth testing exhaustively.
//
// ============================================================================
// THE ONE RULE THIS FILE EXISTS TO ENFORCE
//
//   The ENVELOPE is what the model SAW.
//   The PINNED COMPONENTS are what the editor CUTS.
//
// They are not interchangeable, and nothing in the type system stops you
// confusing them, because both are made of numbers.
// ============================================================================
//
// The envelope is a deliberately lossy projection built for the Director's
// benefit: timings are quantised to CENTISECONDS (`reqMsToCs`), and `EnvWord`
// is `[text, startCs, confPct]` — it carries no word END time at all. It does
// not contain the information needed to cut or caption accurately and was never
// meant to.
//
// There are exactly two places that mistake is reachable, and both read
// naturally, which is what makes them dangerous:
//
//   (a) `DirectorSelection` carries `startCs`/`endCs` RIGHT THERE on the
//       selection. Writing `s.startCs * 10` produces a plan whose cuts are
//       quantised to 10 ms while the captions use full-resolution word timings:
//       a video that plays, looks nearly right, and is wrong, with no error
//       raised anywhere. Those fields are a RE-RESOLUTION RECORD — what the
//       server resolved the model's index to, in the units the model was shown.
//       They are not the authority on where a cut goes.
//
//   (b) `SpeechWordLike` (the envelope projection's input interface) has no
//       `endMs`, while `CompileWord` requires one. Typing against it because it
//       is the convenient export would invite reconstructing word ends from the
//       next word's start — wrong across every pause in the recording.
//
// So: this module reads `candidateIndex` and indexes the COMPONENT, and it
// types words against the component's own shape. The centisecond fields are
// never read. `assertNoCentisecondLeak` below makes that checkable rather than
// merely intended.
import { EditPlanError } from './editPlanContract.js'
import type {
  CompileInput, CompileWord, CompileCandidate, CompileVisualWaste,
  CompileAudioFacts, CompileEvidence, CompileDecision, CompileIdentity, CompileSource,
  CompileFaceSample,
  SpeechCandidateKind, CandidateConfidence,
} from './editorCompile.js'
import {
  SPEECH_CANDIDATE_KINDS, CANDIDATE_CONFIDENCE_CODES, VISUAL_WASTE_CLASSES,
  visualWasteSelectionEnabled, type DirectorDecision,
} from './directorContract.js'

function bad(message: string, code = 'edit_plan_invalid'): never {
  throw new EditPlanError(`compile input: ${message}`, code)
}

/**
 * The PERSISTED speech component's word. This is `BuiltWord`, not
 * `SpeechWordLike` — the distinction is the whole of hazard (b) above.
 *
 * `endMs` is always present. Compaction under the payload budget drops only the
 * three DERIVABLE fields (`normalizedText`, `unitId`, `endsUnit`) and fails loud
 * rather than dropping evidence: "every word, candidate and timing stays"
 * (editorSpeech.ts). So a component that lacks `endMs` is corrupt, not compact,
 * and is refused below rather than patched around.
 */
export interface ComponentWord {
  id: string
  text: string
  startMs: number
  endMs: number
  confidence: number
}
export interface ComponentCandidate {
  id: string
  kind: string
  wordIds: string[]
  startMs: number
  endMs: number
  confidence: string
  evidence?: Record<string, unknown> | null
}

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v)
/** A real measurement. The analyzer emits floats in natural units and nulls
 *  where there was nothing to measure, so null/NaN/Infinity all mean "no fact"
 *  rather than "zero". */
const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** `w12` -> 12. Positional ids are the codebase's one convention for this and
 *  are enforced by the envelope projection too; resolving by the id rather than
 *  by array position means this module fails the same way for the same reason. */
function idIndex(id: unknown, prefix: string, n: number, where: string): number {
  if (typeof id !== 'string' || !id.startsWith(prefix)) bad(`${where}: id ${JSON.stringify(id)} is not ${prefix}N`)
  const i = Number(id.slice(prefix.length))
  if (!Number.isInteger(i) || i < 0 || i >= n) bad(`${where}: id ${id} is out of range`)
  return i
}

export function readComponentWords(speech: Record<string, unknown> | null): CompileWord[] {
  const raw = speech?.words
  if (!Array.isArray(raw)) bad('the pinned speech component has no words array')
  return (raw as ComponentWord[]).map((w, i) => {
    if (w.id !== `w${i}`) bad(`word ${i}: positional id mismatch (${String(w.id)})`)
    if (typeof w.text !== 'string') bad(`word ${i}: text is not a string`)
    if (!isInt(w.startMs) || !isInt(w.endMs)) {
      // NOT recoverable from the next word's start: that is wrong across every
      // pause, and silently so.
      bad(`word ${i}: missing integer startMs/endMs — the component is corrupt, not compact`)
    }
    if (w.endMs < w.startMs) bad(`word ${i}: span reversed`)
    if (typeof w.confidence !== 'number' || !Number.isFinite(w.confidence)) bad(`word ${i}: confidence is not finite`)
    return { text: w.text, startMs: w.startMs, endMs: w.endMs, confidence: w.confidence }
  })
}

export function readComponentCandidates(
  speech: Record<string, unknown> | null, wordCount: number,
): CompileCandidate[] {
  const raw = speech?.candidates
  if (!Array.isArray(raw)) bad('the pinned speech component has no candidates array')
  return (raw as ComponentCandidate[]).map((c, i) => {
    if (c.id !== `c${i}`) bad(`candidate ${i}: positional id mismatch (${String(c.id)})`)
    if (!(SPEECH_CANDIDATE_KINDS as readonly string[]).includes(c.kind)) bad(`candidate ${i}: unknown kind ${String(c.kind)}`)
    if (!isInt(c.startMs) || !isInt(c.endMs)) bad(`candidate ${i}: missing integer startMs/endMs`)
    if (c.endMs < c.startMs) bad(`candidate ${i}: span reversed`)
    if (!(CANDIDATE_CONFIDENCE_CODES as readonly string[]).includes(c.confidence)) {
      bad(`candidate ${i}: invalid confidence ${String(c.confidence)}`)
    }
    if (!Array.isArray(c.wordIds)) bad(`candidate ${i}: wordIds is not an array`)
    const wordIndices = c.wordIds.map((id) => idIndex(id, 'w', wordCount, `candidate ${i} ref`))
    for (let r = 1; r < wordIndices.length; r++) {
      if (wordIndices[r] <= wordIndices[r - 1]) bad(`candidate ${i}: refs not strictly ascending`)
    }
    const kind = c.kind as SpeechCandidateKind
    // FILLER IS NEVER SELECTION-ENABLED. Gate-0 §4 freezes filler auto-removal
    // OFF and the compiler rejects it structurally; deriving the flag here from
    // the kind (rather than trusting a stored boolean) means a component with a
    // tampered flag cannot smuggle one through.
    const selectionEnabled: 0 | 1 = kind === 'filler' ? 0 : 1
    return {
      kind,
      startMs: c.startMs,
      endMs: c.endMs,
      confidence: c.confidence as CandidateConfidence,
      selectionEnabled,
      safeToConsider: selectionEnabled === 1,
      wordIndices,
    }
  })
}

export function readComponentVisualWaste(visual: Record<string, unknown> | null): CompileVisualWaste[] {
  const raw = visual?.blankIntervals
  if (!Array.isArray(raw)) return []
  const out: CompileVisualWaste[] = []
  for (const iv of raw as Array<Record<string, unknown>>) {
    const classCode = (VISUAL_WASTE_CLASSES as readonly string[]).indexOf(String(iv.classification ?? ''))
    if (classCode < 0) continue
    const startMs = iv.startMs
    const endMs = iv.endMs
    // MILLISECONDS, taken straight from the component. `buildVisualWasteStream`
    // in editorDirector divides these by 10 for the envelope; that projection is
    // for the model and must not be reused here.
    if (!isInt(startMs) || !isInt(endMs) || startMs > endMs) continue
    out.push({
      startMs, endMs, classCode,
      selectionEnabled: visualWasteSelectionEnabled(VISUAL_WASTE_CLASSES[classCode]),
    })
  }
  return out
}

/**
 * The largest face in each sampled frame, as a centre point in source pixels.
 *
 * Defensive in the same way readComponentVisualWaste is: a malformed detection
 * is skipped rather than defaulted, and a sample with no detections produces no
 * entry at all. "No face evidence" and "the face is centred" are different
 * facts and this must never turn the first into the second.
 */
export function readComponentFaces(visual: Record<string, unknown> | null): CompileFaceSample[] {
  const raw = visual?.faces
  if (!Array.isArray(raw)) return []
  const out: CompileFaceSample[] = []
  for (const s of raw as Array<Record<string, unknown>>) {
    const timeMs = s.timeMs
    if (!isInt(timeMs) || timeMs < 0) continue
    const dets = s.detections
    if (!Array.isArray(dets) || dets.length === 0) continue
    let best: { x: number; y: number; w: number; h: number } | null = null
    for (const d of dets as Array<Record<string, unknown>>) {
      const x = d.x, y = d.y, w = d.width, h = d.height
      if (typeof x !== 'number' || typeof y !== 'number'
        || typeof w !== 'number' || typeof h !== 'number') continue
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h)) continue
      if (w <= 0 || h <= 0) continue
      if (!best || w * h > best.w * best.h) best = { x, y, w, h }
    }
    if (!best) continue
    out.push({
      timeMs,
      centreXPx: Math.round(best.x + best.w / 2),
      centreYPx: Math.round(best.y + best.h / 2),
    })
  }
  out.sort((a, b) => a.timeMs - b.timeMs)
  return out
}

/**
 * The audio component's quality facts, in the compiler's milli-integer units.
 *
 * THIS FUNCTION RETURNED null ON EVERY RENDER EVER MADE. It asked the
 * component for `snrDbMilli` and `earlyEnergyRatioMilli`. The analyzer writes
 * `snrDb` and `earlyEnergyRatio` — floats in natural units, named without the
 * suffix (editorAudio.ts, and its header's derivation notes). Neither key
 * existed, `isInt(undefined)` is false, and the compiler took its
 * `evidence.audio === null` branch every single time:
 *
 *     warn.add('audio_preset_defaulted', 'no_audio_component')
 *
 * So every video shipped with `speech-clean-v1` — highpass 80 Hz, no denoise,
 * no de-esser — and `speech-noisy-v1` has never once run. The warning made it
 * worse rather than better: it says the component is MISSING, which is false.
 * The component is present, pinned and correct. Anyone debugging this went
 * looking for a storage bug.
 *
 * The fix belongs on this side. The component is content-addressed and carries
 * an analyzer bundle version; renaming the producer's fields would invalidate
 * every stored analysis to fix a reader's typo.
 *
 * Floats in, integers out — deliberately. The compiler's whole numeric
 * discipline is integer milli-units so a plan hash cannot drift on a float
 * repr, and this is the boundary where that conversion has to happen.
 */
export function readComponentAudioFacts(audio: Record<string, unknown> | null): CompileAudioFacts | null {
  if (!audio || typeof audio !== 'object') return null
  const snrDb = (audio as { snrDb?: unknown }).snrDb
  const earlyEnergyRatio = (audio as { earlyEnergyRatio?: unknown }).earlyEnergyRatio
  // Partial audio facts are NOT half-usable. A missing SNR is not zero SNR, and
  // a compiler decision made on a defaulted number is a decision nobody made.
  // A track with no audio yields null for both (editorAudio.ts's own contract),
  // which lands here as "no facts" — correct, and distinct from "zero".
  if (!isFiniteNumber(snrDb) || !isFiniteNumber(earlyEnergyRatio)) return null
  return {
    snrDbMilli: Math.round(snrDb * 1000),
    earlyEnergyRatioMilli: Math.round(earlyEnergyRatio * 1000),
  }
}

/**
 * Map the persisted decision onto the compiler's decision.
 *
 * `selections` becomes `candidateIndex[]` — NOT the `startCs`/`endCs` sitting on
 * the same object. See hazard (a) at the top of this file.
 */
export function readDecision(decision: DirectorDecision, counts: { candidates: number; visualWaste: number; words: number }): CompileDecision {
  if (!Array.isArray(decision?.selections)) bad('decision has no selections array')
  const selections = decision.selections.map((s, i) => {
    if (!isInt(s?.candidateIndex)) bad(`selection ${i}: candidateIndex is not an integer`)
    if (s.candidateIndex < 0 || s.candidateIndex >= counts.candidates) {
      bad(`selection ${i}: candidateIndex ${s.candidateIndex} is outside the ${counts.candidates} pinned candidates`)
    }
    return s.candidateIndex
  })
  const seen = new Set<number>()
  for (const idx of selections) {
    if (seen.has(idx)) bad(`candidate ${idx} is selected twice`)
    seen.add(idx)
  }

  const visualWasteSelections = (decision.visualWasteSelections ?? []).map((v, i) => {
    if (!isInt(v?.wasteIndex)) bad(`visual waste selection ${i}: wasteIndex is not an integer`)
    if (v.wasteIndex < 0 || v.wasteIndex >= counts.visualWaste) {
      bad(`visual waste selection ${i}: wasteIndex ${v.wasteIndex} is outside the ${counts.visualWaste} pinned intervals`)
    }
    return v.wasteIndex
  })

  const emphasis = (decision.emphasisWordIndices ?? []).map((w, i) => {
    if (!isInt(w) || w < 0 || w >= counts.words) bad(`emphasis word ${i}: index ${String(w)} is out of range`)
    return w
  })

  const hookStartWordIndex = decision.hookStartWordIndex
  if (hookStartWordIndex !== null && hookStartWordIndex !== undefined) {
    if (!isInt(hookStartWordIndex) || hookStartWordIndex < 0 || hookStartWordIndex >= counts.words) {
      bad(`hookStartWordIndex ${String(hookStartWordIndex)} is out of range`)
    }
  }
  if (decision.hookTreatment === 'open_at_word' && (hookStartWordIndex === null || hookStartWordIndex === undefined)) {
    bad('hookTreatment open_at_word with no hookStartWordIndex')
  }

  const zoomRequests = (decision.zoomRequests ?? []).map((z, i) => {
    if (!isInt(z?.anchorWordIndex) || z.anchorWordIndex < 0 || z.anchorWordIndex >= counts.words) {
      bad(`zoom ${i}: anchorWordIndex out of range`)
    }
    return { anchorWordIndex: z.anchorWordIndex, intensity: z.intensity, reasonCode: z.reasonCode }
  })

  return {
    selections,
    visualWasteSelections,
    emphasisWordIndices: emphasis,
    hookTreatment: decision.hookTreatment,
    hookStartWordIndex: hookStartWordIndex ?? null,
    captionPresetId: decision.captionPresetId,
    transitionPolicy: decision.transitionPolicy,
    zoomRequests,
  }
}

export interface AssembleArgs {
  identity: CompileIdentity
  source: CompileSource
  speech: Record<string, unknown> | null
  visual: Record<string, unknown> | null
  audio: Record<string, unknown> | null
  decision: DirectorDecision
  // The pinned boot manifest's brandSnapshot, untyped — only its `visual` hex
  // fields are ever read here (see readComponentBrandColors). Optional so
  // existing callers that don't pass one keep compiling unchanged; absent is
  // treated exactly like null, never like "some" brand.
  brand?: Record<string, unknown> | null
}

const HEX_COLOUR_RE = /^#[0-9a-fA-F]{6}$/

export interface CompileBrandColors { primaryHex: string | null; highlightHex: string | null }

// Partial brand colors are not half-usable, same reasoning as audio facts:
// a malformed or absent hex is not "use the default," it is "this field does
// not exist," and the compiler must be able to tell those apart from a real
// pinned color rather than defaulting silently.
export function readComponentBrandColors(brand: Record<string, unknown> | null): CompileBrandColors {
  const visual = brand && typeof brand === 'object' ? (brand as { visual?: unknown }).visual : null
  const v = visual && typeof visual === 'object' ? (visual as { primaryHex?: unknown; highlightHex?: unknown }) : {}
  const primaryHex = typeof v.primaryHex === 'string' && HEX_COLOUR_RE.test(v.primaryHex) ? v.primaryHex.toLowerCase() : null
  const highlightHex = typeof v.highlightHex === 'string' && HEX_COLOUR_RE.test(v.highlightHex) ? v.highlightHex.toLowerCase() : null
  return { primaryHex, highlightHex }
}

export function buildCompileInput(args: AssembleArgs): CompileInput {
  const words = readComponentWords(args.speech)
  const candidates = readComponentCandidates(args.speech, words.length)
  const visualWaste = readComponentVisualWaste(args.visual)
  const faces = readComponentFaces(args.visual)
  // The face boxes are in the visual analyzer's display space, so the raster
  // they are measured against has to travel with them. Read from the SAME
  // component, never from the inspection row, so a component recomputed at a
  // different resolution cannot be paired with the previous one's geometry.
  const dw = (args.visual as { displayWidth?: unknown } | null)?.displayWidth
  const dh = (args.visual as { displayHeight?: unknown } | null)?.displayHeight
  const sourceWithRaster: CompileSource = (isInt(dw) && isInt(dh) && dw > 0 && dh > 0)
    ? { ...args.source, displayWidthPx: dw, displayHeightPx: dh }
    : args.source
  const audio = readComponentAudioFacts(args.audio)
  const evidence: CompileEvidence = { words, candidates, visualWaste, audio, faces }
  const decision = readDecision(args.decision, {
    candidates: candidates.length, visualWaste: visualWaste.length, words: words.length,
  })
  const brandColors = readComponentBrandColors(args.brand ?? null)
  return { identity: args.identity, source: sourceWithRaster, evidence, decision, brandColors }
}

/**
 * A CHECKABLE version of "we never read the centisecond fields".
 *
 * TWO ARMS, AND ONLY ONE OF THEM CAN CATCH THE LEAK. Saying which is the point:
 *
 *  1. CONSISTENCY — the component span must quantise to the decision's record.
 *     This CANNOT detect the leak, by construction: a span read as
 *     `startCs * 10` quantises back to exactly `startCs`, so it agrees with the
 *     record perfectly. It is kept because it catches a DIFFERENT real defect —
 *     a decision paired with the wrong component, i.e. evidence from one run and
 *     a decision from another — which would otherwise compile silently.
 *
 *     (The first version of this function relied on this arm to catch the leak.
 *     Its own mutation test proved it could not, which is what a mutation test
 *     is for.)
 *
 *  2. BOUNDARY — every selected span lying exactly on a 10 ms boundary. This is
 *     the arm that actually detects the leak: it is the signature the leak
 *     leaves, and the one real ASR timings do not.
 *
 * The boundary arm fires from TWO spans upward. With N spans there are 2N
 * endpoints, so if timings were uniform the false-alarm rate is 10^-2N: one in
 * ten thousand at N=2, one in a million at N=3. At N=1 it would be one in a
 * hundred, too loud to be worth having — so a single-selection plan is not
 * checked, and that limit is stated rather than hidden.
 *
 * It stays a ONE-WAY check. An individual span that genuinely starts on a
 * centisecond is fine and common; only the systematic case is refused.
 */
export function assertNoCentisecondLeak(input: CompileInput, decision: DirectorDecision): void {
  const spans = input.decision.selections.map((idx) => input.evidence.candidates[idx])
  if (spans.length === 0) return

  // Arm 1: decision/component pairing. Not a leak detector — see above.
  for (let i = 0; i < spans.length; i++) {
    const s = spans[i]
    const rec = decision.selections[i]
    if (!rec) continue
    if (Math.abs(Math.round(s.startMs / 10) - rec.startCs) > 1) {
      bad(
        `selection ${i}: the component span ${s.startMs}ms does not quantise to the decision's ` +
        `record ${rec.startCs}cs — the decision and the evidence are not from the same run`,
        'edit_plan_divergent',
      )
    }
  }

  // Arm 2: the leak itself.
  if (spans.length >= 2 && spans.every((s) => s.startMs % 10 === 0 && s.endMs % 10 === 0)) {
    bad(
      'every selected span lies exactly on a 10ms boundary — this is what reading the ' +
      "decision's centisecond fields produces, and real word timings do not look like this",
      'edit_plan_divergent',
    )
  }
}
