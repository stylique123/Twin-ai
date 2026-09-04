// RECORD WHICH WAY IN THEY TOOK. NOTHING ELSE.
//
// ⚖️ BEST-EFFORT AND SILENT, exactly like `markQuestionShown`, and for the same
// reason: an impression that fails to record must never cost the creator the
// thing they were doing. This returns nothing and throws nothing.
//
// ⚠️ AND IT FAILS IN THE HONEST DIRECTION. A lost row understates the
// denominator for whichever door was being taken, which can only make a door
// look LESS popular than it is — never more. The dangerous failure would be a
// write that succeeds with a door the creator did not take, which is why the
// door is computed by `entryImpression` in shared code and not assembled here.
import { supabase } from './supabase'
import { entryImpression, type EntryDoor, type DoorSource } from '@twinai/shared'

/**
 * ⚠️ CALLED WHEN A BUILD STARTS, NOT WHEN THE SCREEN RENDERS. An impression here
 * means "a creator went through this door", so it is the click that writes.
 * Writing on render would count a creator who opened the studio and left as
 * having taken the door the screen happened to open on — which is precisely the
 * preselection this table exists to tell apart from a choice.
 */
export async function recordEntryDoor(input: {
  door: EntryDoor
  source: DoorSource
  offered: readonly EntryDoor[]
  text?: string | null
}): Promise<void> {
  try {
    const { data: auth } = await supabase.auth.getUser()
    const ownerId = auth?.user?.id
    if (!ownerId) return
    const row = entryImpression(input)
    const { error } = await supabase.from('entry_impressions').insert({
      owner_id: ownerId,
      door: row.door,
      source: row.source,
      offered: row.offered,
      had_text: row.hadText,
    })
    // A table that does not exist yet (0183 unapplied) is a warning, never a
    // thrown error on the path to a build the creator has already paid for.
    if (error) console.warn('entry door not recorded', error.message)
  } catch (err) {
    console.warn('entry door not recorded', err)
  }
}
