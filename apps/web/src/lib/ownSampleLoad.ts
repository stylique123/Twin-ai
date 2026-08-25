import { supabase } from './supabase'
import { ownSampleCounts, type AccountCounts } from '@twinai/shared'

/**
 * WHAT THE SCAN FOUND ON THE CREATOR'S OWN ACCOUNT, READ ONCE.
 *
 * ⚠️ THE WORKER HAS BEEN WRITING THESE FOUR COLUMNS ALL ALONG AND NOTHING READ
 * THEM. `publishCounts` sets them on every sample; `messageForOwnAccount` turns
 * them into a sentence and is tested four files deep — and `apps/web` imported
 * it nowhere. The picked-video half of the same gate has spoken to creators
 * since it shipped. This half never has.
 *
 * ⚖️ A PURE READ, like the strength meter beside it. Nothing here writes, so the
 * sentence a creator sees never depends on how often they looked at it.
 *
 * ⚖️ AND `null` IS AN ANSWER RATHER THAN AN ERROR TO SWALLOW. A failed read
 * means we do not know what the scan found, and "none of your videos are you
 * talking to the camera" is the single worst thing to say on no evidence. The
 * caller shows nothing.
 */
export async function loadOwnSample(voiceId?: string | null): Promise<AccountCounts | null> {
  try {
    const { data: auth } = await supabase.auth.getUser()
    const ownerId = auth?.user?.id
    if (!ownerId) return null

    // ⚠️ ONLY THE THREE COLUMNS THE SENTENCE READS. `own_sample_no_answer` is an
    // audit number — how many videos the check could not answer for — and it
    // must never reach a creator-facing denominator.
    let q = supabase
      .from('brand_voices')
      .select('own_sample_usable, own_sample_checked, own_sample_complete')
      .eq('owner_id', ownerId)
    // ⚖️ THE DEFAULT VOICE WHEN NO ID IS GIVEN, matching how the rest of the app
    // resolves "this creator's twin" — not simply the first row the database
    // happens to return.
    q = voiceId ? q.eq('id', voiceId) : q.order('is_default', { ascending: false })

    const { data, error } = await q.limit(1).maybeSingle()
    if (error || !data) return null
    return ownSampleCounts(data)
  } catch {
    return null
  }
}
