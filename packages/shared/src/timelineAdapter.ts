// Blueprint → SceneTimeline adapter.
//
// Turns the existing AI Blueprint (reference read + hook options + script +
// shot list + captions) into ONE Scene Timeline that drives every V2 module.
// Deterministic and invariant-clean: the hook lands once in scene 1, every
// talking line becomes a contiguous talking scene with a clean cut, b-roll
// moments from the shot list become silent insert scenes, and a final CTA scene
// closes it. No module ever re-derives boundaries after this.

import type { Blueprint } from './types'
import {
  type Scene,
  type SceneTimeline,
  type WpmPreset,
  DEFAULT_WPM,
  estimateDurationSec,
  totalDurationSec,
} from './timeline'

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

export interface BuildTimelineInput {
  generationId: string
  blueprint: Blueprint
  selectedHook?: string | null
  platform?: string
  wpm?: WpmPreset
}

export function buildTimeline(input: BuildTimelineInput): SceneTimeline {
  const { generationId, blueprint } = input
  const wpm = input.wpm ?? DEFAULT_WPM
  const hook = (input.selectedHook || blueprint.hook_options?.[0] || blueprint.script?.[0]?.line || '').trim()
  const platform = input.platform || blueprint.reference_read?.platform || 'reels'

  const scenes: Scene[] = []
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
    broll_instruction: null,
    cut_point: true,
    transition: 'cut',
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
  const isPlaceholder = (l: string) =>
    /^\[[^\]]*\]$/.test(l) || /\b(hook option\s*\d*|selected hook|insert (the )?hook|your hook (above|here)|hook from above)\b/i.test(l)
  const body = (blueprint.script ?? []).filter((s) => {
    const l = (s.line || '').trim()
    if (!l) return false
    if (isPlaceholder(l)) return false
    if (/hook|opener/i.test(s.section || '')) return false
    return !looksLikeHook(l)
  })

  body.forEach((seg, i) => {
    const n = scenes.length + 1
    const line = (seg.line || '').trim()
    const brollNote = blueprint.shot_list?.[i + 1]?.notes
    const isBroll = BROLL_HINT.test(seg.direction || '') || BROLL_HINT.test(seg.section || '')
    scenes.push({
      scene_number: n,
      scene_type: isBroll ? 'product_demo' : 'talking_head',
      purpose: seg.section?.trim() || 'Deliver the next point',
      dialogue: line,
      duration_sec: estimateDurationSec(line, wpm),
      ...framingFor(i + 1, blueprint, seg),
      caption_text: pushCaption(captionFromLine(line), n),
      broll_instruction: isBroll && brollNote ? `Show this while talking: ${brollNote}` : null,
      cut_point: true,
      transition: 'cut',
      pause_after: true,
      show_in_teleprompter: true,
    })
  })

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
      broll_instruction: `Show this while talking: ${shot.shot || shot.notes || ''}`.trim(),
      cut_point: true,
      transition: 'cut',
      pause_after: false,
      show_in_teleprompter: false,
    })
  })

  // Final action (CTA) scene.
  const cta = blueprint.publish_plan?.[0]?.caption?.trim() || blueprint.reference_read?.format_label
    ? 'Follow for more like this'
    : 'Follow for more'
  const ctaN = scenes.length + 1
  scenes.push({
    scene_number: ctaN,
    scene_type: 'cta',
    purpose: 'End with one clear final action',
    dialogue: cta,
    duration_sec: estimateDurationSec(cta, wpm),
    ...framingFor(scenes.length, blueprint),
    caption_text: pushCaption(captionFromLine(cta), ctaN),
    broll_instruction: null,
    cut_point: true,
    transition: 'cut',
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
