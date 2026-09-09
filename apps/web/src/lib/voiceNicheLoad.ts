import { supabase } from './supabase'

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
