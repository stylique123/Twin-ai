import { supabase } from './supabase'
import { twinStrength, type TwinStrength } from '@twinai/shared'

/**
 * WHAT THIS CREATOR'S TWIN KNOWS, READ ONCE FOR THE METER.
 *
 * ⚠️ A PURE READ. Nothing about the meter writes, and that is deliberate: a
 * display that also records would make the number it shows depend on how often
 * somebody looked at it.
 *
 * ⚖️ AND `null` IS AN ANSWER, NOT AN ERROR TO SWALLOW. When the read fails we do
 * not know what the twin holds, and rendering "nothing yet" would be a claim
 * about the creator's work that we cannot support. The caller shows nothing.
 */
export async function loadTwinStrength(voiceId?: string | null): Promise<TwinStrength | null> {
  try {
    const { data: auth } = await supabase.auth.getUser()
    const ownerId = auth?.user?.id
    if (!ownerId) return null

    // ⚠️ ONLY THE THREE COLUMNS THE CALCULATION READS. Selecting the whole row
    // would pull every stored sentence across the wire just to count them.
    let q = supabase
      .from('creator_knowledge')
      .select('kind, text, source')
      .eq('owner_id', ownerId)
      .limit(1000)
    if (voiceId) q = q.eq('voice_id', voiceId)

    const { data, error } = await q
    if (error || !Array.isArray(data)) return null
    return twinStrength(data)
  } catch {
    return null
  }
}
