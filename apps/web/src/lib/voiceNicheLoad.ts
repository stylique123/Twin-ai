import { supabase } from './supabase'
import { stageBandOf } from '@twinai/shared'

/**
 * THE ONE FIELD THAT DECIDES WHICH WORDING A CREATOR SEES.
 *
 * ⚠️ A PURE READ OF ONE COLUMN, like `loadOwnSample` beside it. Selecting the
 * whole profile would pull every stored sentence across the wire to read a
 * niche.
 *
 * ⚖️ AND `null` IS AN ANSWER. A failed read means we do not know this creator's
 * niche, and `questionsFor` treats that exactly as it treats a niche that fits
 * no bucket: the generic bank, which is the bank that has always been there.
 * Nothing degrades — the question simply is not translated.
 */
export async function loadVoiceNiche(voiceId?: string | null): Promise<string | null> {
  if (!voiceId) return null
  try {
    const { data, error } = await supabase
      .from('brand_voices')
      .select('profile')
      .eq('id', voiceId)
      .maybeSingle()
    if (error || !data) return null
    const niche = (data.profile as { niche?: unknown } | null)?.niche
    return typeof niche === 'string' && niche.trim() !== '' ? niche : null
  } catch {
    return null
  }
}

/**
 * Her follower band, for the one question that asks for a number.
 *
 * ⚠⚠ THE FOLLOWER COUNT IS ON THE VOICE ROW, NOT ON THE PROFILE. `VoiceProfile`
 * carries what she is about; `brand_voices.stats` carries how big she is. The
 * onboarding draft holds only the profile, so without this read the stage rule
 * could never fire during onboarding — which is precisely where it matters,
 * because a creator under 1,000 followers is exactly the one being asked for a
 * number she does not have.
 *
 * ⚖️ null FOR A FAILED READ AND FOR AN ABSENT COUNT ALIKE, and both mean the
 * same thing here: we do not know her size, so the question keeps its ordinary
 * wording rather than being softened on a guess. Measured 2026-09-13: 20 of 53
 * voices carry a usable count, so null is the common case and must be harmless.
 */
export async function loadVoiceStageBand(voiceId?: string | null): Promise<string | null> {
  if (!voiceId) return null
  try {
    const { data, error } = await supabase
      .from('brand_voices')
      .select('stats')
      .eq('id', voiceId)
      .maybeSingle()
    if (error || !data) return null
    return stageBandOf((data.stats as { followers?: unknown } | null)?.followers)
  } catch {
    return null
  }
}
