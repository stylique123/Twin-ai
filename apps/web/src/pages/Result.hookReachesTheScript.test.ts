// SHE TAPPED A HOOK, AND THE STORED SCRIPT KEPT THE FIRST ONE — TWICE FIXED.
//
// ⚠️⚠️ MEASURED IN PRODUCTION 2026-09-20 over the six most recent generations
// carrying a `selected_hook`. The four where the creator kept the DEFAULT have a
// `scene_timeline` that agrees. BOTH where she picked a different option have a
// timeline still holding option 0:
//
//   788d20b4  chose "The biggest beginner mistake…"
//             stored "I lost two hundred dollars on candles…"
//   a996c9c1  chose "Leaving factory end sheets intact…"
//             stored "Never pry open factory glued end sheets…"
//
// ⚠️ #927 PATCHED `ScriptEditor`; #940 PATCHED THE TAP. This survived both,
// because the tap handler required `liveScript` to be loaded ALREADY at the
// instant of the tap — so a pick made before the editor reported its script, or
// restored from a previous visit, wrote `selected_hook` and nothing else.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { withSelectedHook, type RecordingScript } from '@twinai/shared'

const PAGE = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'Result.tsx'), 'utf8')

describe('the reconciliation no longer depends on the order of two arrivals', () => {
  it('runs from the PAIR, so whichever lands second triggers it', () => {
    expect(PAGE).toMatch(/\}, \[liveScript, chosenHook, serverSourceAssetId, id\]\)/)
  })

  it('is an effect, not the tap handler', () => {
    // The tap handler still records the CHOICE; it no longer owns the persist.
    expect(PAGE).toMatch(/THE PERSIST NO LONGER HAPPENS HERE/)
    expect(PAGE).toMatch(/establishDurableRecordingScriptLive\(patched\)/)
  })

  it('still refuses to rewrite a script a take was read from', () => {
    // A recorded take's provenance binds to the script it was performed from.
    expect(PAGE).toMatch(/if \(!liveScript \|\| serverSourceAssetId \|\| !chosenHook\) return/)
  })

  it('says so out loud when the persist fails', () => {
    expect(PAGE).toMatch(/hook_choice_not_persisted/)
  })
})

describe('the patch itself, on the real production pair', () => {
  const script = {
    generation_id: '788d20b4-53f5-4180-b6da-fcf2dd9ecede',
    hook: 'I lost two hundred dollars on candles before learning this one rule.',
    wpm: 150,
    total_duration_sec: 45,
    scenes: [
      { scene_number: 1, dialogue: 'I lost two hundred dollars on candles before learning this one rule.', duration_sec: 8, caption_text: null },
      { scene_number: 2, dialogue: 'Second beat.', duration_sec: 10, caption_text: null },
    ],
  } as unknown as RecordingScript

  // ⚠️ TYPED, NOT `as never`. The first draft cast this fixture to `never`, which
  // made `script.hook` below a type error — caught by CI's `npm run typecheck`
  // and NOT by the `tsc -p apps/web/tsconfig.json` run here, because the two do
  // not see the same files. The repo's own command is the one that counts.

  const CHOSEN = 'The biggest beginner mistake in making delicate handmade soy candles.'

  it('moves scene 1 AND the top-level hook, or other readers keep the old one', () => {
    const out = withSelectedHook(script, CHOSEN)!
    expect(out.scenes[0].dialogue).toBe(CHOSEN)
    expect(out.hook).toBe(CHOSEN)
  })

  it('leaves every other scene exactly alone', () => {
    const out = withSelectedHook(script, CHOSEN)!
    expect(out.scenes[1].dialogue).toBe('Second beat.')
  })

  it('returns the SAME object when they already agree, so the effect cannot loop', () => {
    const agreed = withSelectedHook(script, script.hook)
    expect(agreed).toBe(script)
  })

  it('an empty choice is not an instruction to blank the hook', () => {
    // `chosenHook` starts as '' before the generation loads.
    expect(withSelectedHook(script, '')).toBe(script)
  })
})
