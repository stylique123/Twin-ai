// Blueprint → RecordingScript adapter.
//
// Turns the existing AI Blueprint (reference read + hook options + script +
// shot list + captions) into ONE Recording Script that drives every V2 module.
// Deterministic and invariant-clean: the hook lands once in scene 1, every
// talking line becomes a contiguous talking scene with a clean cut, b-roll
// moments from the shot list become silent insert scenes, and a final CTA scene
// closes it. No module ever re-derives boundaries after this.

import {
  declaredClipOf, isWhollyPlaceholder, stripDeclaredClips, type ClipMedium,
} from './containerResolution.js'
import type { Blueprint } from './types'
import {
  type RecordingScene,
  type RecordingScript,
  type WpmPreset,
  DEFAULT_WPM,
  estimateDurationSec,
  totalDurationSec,
} from './recordingScript'

const BROLL_HINT = /(b-?roll|insert|cutaway|show|overlay|screen|demo|product)/i

// Short on-screen caption from a spoken line: first ~7 words, no trailing punct.
function captionFromLine(line: string): string {
  const words = line.trim().replace(/\s+/g, ' ').split(' ')
  const head = words.slice(0, 7).join(' ')
  return head.replace(/[.,;:!?]+$/, '')
}

function framingFor(
  i: number,
  blueprint: Blueprint,
  seg?: { background?: string; action_posing?: string; direction?: string },
): { camera_framing: string; background: string; movement: string } {
  const shot = blueprint.shot_list?.[i]
  return {
    camera_framing: shot?.framing?.trim() || 'Chest-up shot',
    // Prefer the per-beat SCRIPT background (the real "setting, props, lighting" the
    // model is prompted to write) over the shot-list note, which is often generic or
    // an expression cue — that mismatch was the "Background says an expression" bug.
    background: seg?.background?.trim() || shot?.notes?.trim() || 'Clean, well-lit background',
    // Movement/expression comes from the beat's action_posing (gestures + face), not a
    // fixed default, so the card actually guides how to perform the scene.
    movement: seg?.action_posing?.trim() || 'Look at camera, natural energy',
  }
}

import { readBeatPlan, beatDurationSec, type PlannedBeat } from './beatPlan'
import { blueprintCountIssues, type MechanismIssue } from './referenceMechanism'

export interface BuildRecordingScriptInput {
  generationId: string
  blueprint: Blueprint
  selectedHook?: string | null
  platform?: string
  wpm?: WpmPreset
}

/**
 * THE COUNT CONTRACT, CHECKED AT THE LAST MOMENT IT IS STILL FREE (§5d).
 *
 * This adapter is where a blueprint stops being a document and becomes the
 * thing a person reads off a teleprompter, so it is the last point at which a
 * broken count can be caught before it is broken OUT LOUD, on camera.
 *
 * It reports rather than repairs. Deleting a beat to make the numbers agree
 * would silently ship a shorter video than the creator was promised, and
 * rewriting the hook here would put this module in the writing business — the
 * thing §3's ownership matrix exists to prevent. The caller decides.
 */
export function recordingScriptCountIssues(blueprint: Blueprint): MechanismIssue[] {
  return blueprintCountIssues(blueprint as unknown as Parameters<typeof blueprintCountIssues>[0])
}

export function buildRecordingScript(input: BuildRecordingScriptInput): RecordingScript {
  const { generationId, blueprint } = input
  const wpm = input.wpm ?? DEFAULT_WPM
  const hook = (input.selectedHook || blueprint.hook_options?.[0] || blueprint.script?.[0]?.line || '').trim()
  const platform = input.platform || blueprint.reference_read?.platform || 'reels'

  // THE DECIDED LENGTHS, when the model returned a plan that lines up with the
  // script. Read once against the script's own length: a plan that disagrees is
  // refused whole rather than mapped by guesswork, so every scene falls back to
  // the estimator together instead of some scenes silently taking a target that
  // belongs to a different beat.
  const beatPlan: PlannedBeat[] | null = readBeatPlan(
    (blueprint as { beat_plan?: unknown }).beat_plan,
    Array.isArray(blueprint.script) ? blueprint.script.length : 0,
  )

  const scenes: RecordingScene[] = []
  const usedCaptions = new Set<string>()
  const pushCaption = (base: string, n: number): string => {
    let c = base || `Scene ${n}`
    let key = c.toLowerCase()
    if (usedCaptions.has(key)) { c = `${c} ·`; key = c.toLowerCase() } // keep captions unique
    usedCaptions.add(key)
    return c
  }

  // Scene 1 — the hook (talking head), exactly once.
  scenes.push({
    scene_number: 1,
    scene_type: 'talking_head',
    purpose: 'Open with the hook so people keep watching',
    dialogue: hook,
    duration_sec: estimateDurationSec(hook, wpm),
    ...framingFor(0, blueprint, blueprint.script?.[0]),
    caption_text: pushCaption(captionFromLine(hook), 1),
    pause_after: true,
    show_in_teleprompter: true,
  })

  // Remaining script lines → talking scenes. The hook is already scene 1, so we
  // must drop ANY script line that is the hook — the common bug is the script's
  // opening line being a *reworded* version of the selected hook (so a plain
  // substring match misses it and the creator hears the hook twice). We catch it
  // three ways: a "Hook"/"Opener" section label, an exact prefix match, or strong
  // word-overlap with the hook.
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean)
  const hookWords = new Set(norm(hook).slice(0, 8))
  const looksLikeHook = (line: string): boolean => {
    const lw = norm(line).slice(0, 8)
    if (!lw.length) return false
    const overlap = lw.filter((w) => hookWords.has(w)).length
    return overlap >= Math.min(4, Math.ceil(lw.length * 0.6))
  }
  // A bracket-only token ("[Hook Option 1]", "[Insert selected hook…]") is a
  // broken placeholder, never real dialogue — drop it so it can't reach the
  // teleprompter or the worker's caption pass.
  //
  // `isWhollyPlaceholder` is now the ONE authority for that judgement. The copy
  // that lived here did not trim, so a line with a leading space was a
  // placeholder on the plan screen and real dialogue in the recorder — and it
  // treated `[SHOW: …]` as a placeholder, which would drop a declared clip.
  // The model is instructed to write a CTA beat in the script, pointing at the
  // creator's real offer, and explicitly NOT to write "follow for more". So the
  // spoken CTA already exists in `script` — it must be held aside here rather
  // than left in the body, or the video ends on a plain talking scene and then
  // a SECOND, appended ending.
  //
  // "Re-hook" must not match: it is a mid-script beat, and treating it as the
  // ending would move the middle of the video to the end. `\bhook\b` is checked
  // before the CTA test for exactly that reason.
  const isCtaSection = (section: string): boolean =>
    /\b(cta|call[ -]?to[ -]?action|outro|closing|sign[ -]?off)\b/i.test(section)

  const usable = (blueprint.script ?? []).filter((s) => {
    const l = (s.line || '').trim()
    if (!l) return false
    if (isWhollyPlaceholder(l)) return false
    if (/hook|opener/i.test(s.section || '')) return false
    return !looksLikeHook(l)
  })
  // The LAST CTA-labelled beat, not the first: if the model labels more than
  // one, the ending is the one at the end.
  let ctaIdx = -1
  for (let i = usable.length - 1; i >= 0; i--) {
    if (isCtaSection(usable[i].section || '')) { ctaIdx = i; break }
  }
  const ctaBeat = ctaIdx >= 0 ? usable[ctaIdx] : null
  const body = ctaIdx >= 0 ? usable.filter((_, i) => i !== ctaIdx) : usable

  // A CLIP BELONGS TO THE LINE IT WAS WRITTEN INTO.
  //
  // The first pass made every declared clip its OWN silent scene. That stopped
  // the marker being read aloud — the defect it was written for — but it threw
  // away the one thing placement needs: which spoken words the clip plays over.
  // A clip scene is never filmed, so it has no recorded span, so nothing could
  // map it onto the finished timeline. The association WAS the answer, and
  // splitting the clip off destroyed it.
  //
  // So a clip rides on the SPOKEN scene instead. An embedded marker attaches to
  // the line it sits inside; a marker on its own line attaches to the NEXT
  // spoken line, because a cutaway plays while the creator keeps talking and
  // the words that follow are the ones it belongs under.
  //
  // A QUEUE, not a single slot, because two markers can arrive before the next
  // line and one overwriting the other loses a clip the creator was shown. One
  // clip per scene keeps `clip_label` singular and the matching unambiguous;
  // anything still queued at the end becomes its own silent beat rather than
  // being dropped, which is the honest outcome for a clip with no line to play
  // under.
  const pending: Array<{ label: string; medium: ClipMedium }> = []

  body.forEach((seg, i) => {
    const raw = (seg.line || '').trim()

    // A whole-line marker declares a clip and no words. Queued, not emitted.
    const whole = declaredClipOf(raw)
    if (whole) {
      pending.push({ label: whole.label, medium: whole.medium })
      return
    }

    // An embedded marker leaves the spoken words and declares its slot on them.
    const { text: line, clips } = stripDeclaredClips(raw)
    // Stripping can empty a line that was only a marker plus punctuation; an
    // empty dialogue is not a scene the teleprompter can show.
    if (line === '') {
      pending.push(...clips)
      return
    }

    // An embedded clip wins this line, because it names the words it sits
    // inside. Anything else it declared, and anything already queued, waits for
    // a line of its own.
    const attached = clips.length > 0 ? clips[0] : pending.shift()
    if (clips.length > 1) pending.push(...clips.slice(1))

    const n = scenes.length + 1
    const isBroll = BROLL_HINT.test(seg.direction || '') || BROLL_HINT.test(seg.section || '')
    scenes.push({
      scene_number: n,
      scene_type: isBroll ? 'product_demo' : 'talking_head',
      purpose: seg.section?.trim() || 'Deliver the next point',
      dialogue: line,
      // DECIDED, not derived — the plan's target when there is one, and the
      // words-over-speaking-rate estimate when there is not.
      duration_sec: beatDurationSec(beatPlan, i, estimateDurationSec(line, wpm)),
      // Kept beside it, so an edit that stretches the line cannot erase what the
      // beat was planned to be.
      ...(beatPlan?.[i]?.targetSec != null ? { target_sec: beatPlan[i].targetSec } : {}),
      ...framingFor(i + 1, blueprint, seg),
      caption_text: pushCaption(captionFromLine(line), n),
      pause_after: true,
      // STILL SPOKEN. The clip plays OVER these words rather than replacing
      // them — that is what a cutaway is, and the first pass got it backwards
      // by producing a silent beat where the creator should have kept talking.
      show_in_teleprompter: true,
      ...(attached ? { clip_label: attached.label, clip_medium: attached.medium } : {}),
    })
  })

  // Whatever is still queued had no line after it. It becomes its own silent
  // beat: declared, visible to the creator, and captured — just with nothing to
  // play under. Losing it silently would be worse than showing it late.
  for (const clip of pending) {
    const n = scenes.length + 1
    scenes.push({
      scene_number: n,
      scene_type: clip.medium === 'screen' ? 'screen_recording'
        : clip.medium === 'camera' ? 'product_demo' : 'b_roll',
      purpose: `Show: ${clip.label}`,
      dialogue: null,
      duration_sec: estimateDurationSec(null, wpm),
      camera_framing: clip.medium === 'screen' ? 'Screen capture'
        : clip.medium === 'camera' ? 'Hold it up to the camera' : 'To be decided',
      background: '',
      movement: '',
      caption_text: pushCaption(captionFromLine(clip.label), n),
      pause_after: false,
      show_in_teleprompter: false,
      clip_label: clip.label,
      clip_medium: clip.medium,
    })
  }

  // Pure b-roll inserts from shot_list entries flagged as cutaways (silent).
  const brollShots = (blueprint.shot_list ?? []).filter(
    (s) => BROLL_HINT.test(s.shot || '') || BROLL_HINT.test(s.framing || ''),
  )
  brollShots.slice(0, 3).forEach((shot, i) => {
    const n = scenes.length + 1
    scenes.push({
      scene_number: n,
      scene_type: 'b_roll',
      purpose: 'Show this while talking to keep it visual',
      dialogue: null, // silent insert — never a teleprompter scene
      duration_sec: 2.5,
      camera_framing: shot.framing?.trim() || 'Cutaway',
      background: shot.notes?.trim() || '',
      movement: '',
      caption_text: pushCaption(captionFromLine(shot.shot || `B-roll ${i + 1}`), n),
      pause_after: false,
      show_in_teleprompter: false,
    })
  })

  // Final action (CTA) scene — the words the creator actually reads.
  //
  // THIS LINE USED TO BE A BUG THAT REACHED EVERY VIDEO EVER MADE:
  //
  //   const cta = blueprint.publish_plan?.[0]?.caption?.trim() || blueprint.reference_read?.format_label
  //     ? 'Follow for more like this'
  //     : 'Follow for more'
  //
  // `||` binds tighter than `?:`, so the whole `a || b` was the CONDITION and
  // the caption was never read. Both branches are string literals, so the
  // result was always one of two hardcoded lines — in practice always the
  // first, since a blueprint essentially always has one of those two fields.
  // Meanwhile the prompt spends a paragraph demanding a concrete CTA that
  // points at the creator's offer and explicitly forbidding "a generic follow
  // for more". The model wrote one. Nothing read it.
  //
  // The fix is not to repair the ternary — the source it reached for was wrong
  // too. `publish_plan[].caption` is the POST caption, the text typed into the
  // platform's caption box. Reading it aloud is a category error. The spoken
  // CTA is the CTA beat of the script, which is why it is held out of the body
  // above.
  //
  // The fallback stays deliberately plain. "Follow for more" is weak, and a
  // weak line the creator can see and rewrite is better than a confident one
  // that misstates their offer — nothing here knows what they actually sell.
  const ctaLine = (ctaBeat?.line || '').trim()
  const cta = ctaLine || 'Follow for more'
  const ctaN = scenes.length + 1
  scenes.push({
    scene_number: ctaN,
    scene_type: 'cta',
    purpose: ctaBeat?.section?.trim() || 'End with one clear final action',
    dialogue: cta,
    duration_sec: estimateDurationSec(cta, wpm),
    ...framingFor(scenes.length, blueprint, ctaBeat ?? undefined),
    caption_text: pushCaption(captionFromLine(cta), ctaN),
    pause_after: false,
    show_in_teleprompter: true,
  })

  return {
    version: 1,
    generation_id: generationId,
    platform,
    hook,
    wpm,
    scenes,
    total_duration_sec: totalDurationSec(scenes),
  }
}
