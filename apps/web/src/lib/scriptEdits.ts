// THE WRITE THAT KEEPS WHAT THE CREATOR REJECTED.
//
// ⚠️ THIS MUST NEVER BE ABLE TO MAKE A SAVED EDIT LOOK UNSAVED. The creator's
// words are the product; this log is telemetry. `ScriptEditor.commit` calls it
// AFTER `establishDurableRecordingScriptLive` has landed and deliberately does
// not await it, and every failure here is swallowed — a network hiccup on an
// analytics insert must not produce "we couldn't save that change" over a change
// that was saved.
//
// ⚖️ AND IT IS APPEND-ONLY BY CONSTRUCTION. 0127 grants INSERT and SELECT and no
// UPDATE — the same discipline `recordPostStats` had to be given after the
// dashboard's views input was found overwriting its own history on every save.
import { supabase } from './supabase'
import type { ScriptEditRecord } from '@twinai/shared'

/** Store one rewritten line. Resolves either way; never throws. */
export async function recordScriptEdit(
  generationId: string | null,
  edit: ScriptEditRecord,
): Promise<boolean> {
  try {
    const { data: auth } = await supabase.auth.getUser()
    const ownerId = auth?.user?.id
    // ⚠️ NO OWNER MEANS NO ROW. RLS would reject it anyway; failing here keeps
    // the reason legible instead of surfacing as an opaque policy violation.
    if (!ownerId) return false
    const { error } = await supabase.from('script_edits').insert({
      owner_id: ownerId,
      generation_id: generationId,
      target: edit.target,
      scene_number: edit.sceneNumber,
      before_text: edit.before,
      after_text: edit.after,
      facts: edit.facts,
    })
    if (error) {
      // ⚠️ VISIBLE IN THE CONSOLE, INVISIBLE TO THE CREATOR. A table that does
      // not exist yet (0127 unapplied) must not look like a broken editor.
      console.warn('script edit not recorded', error.message)
      return false
    }
    return true
  } catch (err) {
    console.warn('script edit not recorded', err)
    return false
  }
}
