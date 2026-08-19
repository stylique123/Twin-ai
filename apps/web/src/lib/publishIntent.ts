// THE ONE FUNNEL STAGE NO TABLE CAN INFER.
//
// ⚠️ 41 SCRIPTS, 39 OF THEM NEVER FILMED, 0 EXPORTS EVER. Every other stage is
// already written down somewhere and `recordingFunnel` derives it. This is the
// only thing that has to be asked, because "did they record it" and "would they
// put their name on it" are different questions and the second one is the
// product's actual pass mark.
//
// ⚖️ TELEMETRY, AND THEREFORE NEVER LOAD-BEARING — the same rule
// `recordScriptEdit` follows for the same reason. Every failure is swallowed. A
// creator who taps an answer and gets an error toast about analytics has been
// charged for our curiosity, and the next one will not answer at all.
import { supabase } from './supabase'
import type { PublishIntent } from '@twinai/shared'

/**
 * Record what the creator would actually do with this video.
 *
 * ⚠️ UPSERT, NOT INSERT, AND THAT IS THE POINT. Somebody who says "only if I
 * changed some of it", changes it, and then would post it has told us the most
 * useful thing we can learn. Freezing the first answer would keep the worse one
 * forever; 0148's trigger preserves the previous answer in `answered_before` so
 * the change of mind stays visible rather than being overwritten silently.
 */
export async function recordPublishIntent(
  generationId: string,
  intent: PublishIntent,
  note?: string | null,
): Promise<boolean> {
  try {
    const { data: auth } = await supabase.auth.getUser()
    const ownerId = auth?.user?.id
    // ⚠️ NO OWNER MEANS NO ROW. RLS would reject it anyway; stopping here keeps
    // the reason legible instead of surfacing as an opaque policy violation.
    if (!ownerId) return false
    const trimmed = typeof note === 'string' ? note.trim() : ''
    const { error } = await supabase.from('publish_intents').upsert({
      generation_id: generationId,
      owner_id: ownerId,
      intent,
      // ⚖️ An empty box is not an answer of "". Null keeps "said nothing"
      // distinguishable from "typed and cleared it".
      note: trimmed === '' ? null : trimmed.slice(0, 2000),
    }, { onConflict: 'generation_id' })
    if (error) {
      // ⚠️ VISIBLE IN THE CONSOLE, INVISIBLE TO THE CREATOR. 0148 is excluded
      // from the staging matrix and must be applied to production by hand, so
      // "table does not exist" is a REAL possibility here and must not look
      // like a broken page.
      console.warn('publish intent not recorded', error.message)
      return false
    }
    return true
  } catch (e) {
    console.warn('publish intent not recorded', e)
    return false
  }
}

/** What they said last time, so the question is not asked twice as though new. */
export async function readPublishIntent(
  generationId: string,
): Promise<PublishIntent | null> {
  try {
    const { data } = await supabase
      .from('publish_intents')
      .select('intent')
      .eq('generation_id', generationId)
      .maybeSingle()
    const v = (data as { intent?: unknown } | null)?.intent
    return typeof v === 'string' ? (v as PublishIntent) : null
  } catch {
    return null
  }
}
