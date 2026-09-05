import { supabase } from './supabase'
import { whatWorks, type OwnPost, type WhatWorks } from '@twinai/shared'

/**
 * THE CREATOR'S OWN PLAY COUNTS, READ ONCE.
 *
 * ⚠️ `scraped_posts` HAD ONE WRITER AND ZERO READERS. The scan has been storing
 * every post with its play count and nothing has ever looked at them. The
 * analysis module landed first and computed for nobody; this is the half that
 * makes it reach a person.
 *
 * ⚖️ A PURE READ, like `loadOwnSample` beside it. Nothing here writes, so what a
 * creator sees never depends on how often they looked at it.
 *
 * ⚖️ AND `null` IS AN ANSWER, NOT AN ERROR TO SWALLOW. A failed read means we do
 * not know their numbers, and inventing a "top post" on no evidence is worse
 * than saying nothing. The caller shows nothing.
 */
export async function loadOwnPerformance(voiceId?: string | null): Promise<WhatWorks | null> {
  try {
    const { data: auth } = await supabase.auth.getUser()
    const ownerId = auth?.user?.id
    if (!ownerId) return null

    // ⚠️ ONLY THE THREE COLUMNS THE CARD READS. RLS already restricts rows to the
    // owner; selecting the caption and url as well would pull a creator's whole
    // catalogue into the browser to render one sentence.
    let q = supabase
      .from('scraped_posts')
      .select('plays, url, caption')
      .eq('owner_id', ownerId)
    if (voiceId) q = q.eq('voice_id', voiceId)

    const { data, error } = await q.limit(200)
    if (error || !Array.isArray(data)) return null
    // ⚠️ NO ROWS IS NOT THE SAME AS NO NUMBERS. An account that has never been
    // scanned returns null (we know nothing); one scanned and found empty
    // returns a WhatWorks whose `counted` is 0, and the shared rule decides.
    if (data.length === 0) return null
    return whatWorks(data as OwnPost[])
  } catch {
    return null
  }
}
