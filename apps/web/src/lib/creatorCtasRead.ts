import { listBrandVoices } from './api'

/**
 * THE ENDINGS THIS CREATOR ACTUALLY USES, READ THE ONE WAY.
 *
 * ⚠️ TWO SURFACES BUILD THE SAME TIMELINE. `V2Building` builds it once and
 * persists it; `ScriptEditor` rebuilds it in memory when a load returns null.
 * If only one of them passed the creator's CTAs, the same script would end with
 * her own line on one screen and with nothing on the other — two readers
 * disagreeing about one script, which is the defect this repo keeps paying for.
 *
 * ⚖️ AND A FAILED READ IS AN EMPTY LIST, NOT AN INVENTED ENDING. The adapter's
 * rule is that a script with no ask and no creator CTA ends where the writer
 * ended it and says so. An outage must produce that honest state, never a
 * default sentence.
 */
export async function readCreatorCtas(): Promise<string[]> {
  try {
    const voices = await listBrandVoices()
    const def = voices.find((v) => v.is_default) ?? voices[0]
    const ctas = (def?.profile as { recurring_ctas?: unknown } | null)?.recurring_ctas
    return Array.isArray(ctas)
      ? ctas.map((c) => (typeof c === 'string' ? c.trim() : '')).filter((c) => c !== '')
      : []
  } catch {
    return []
  }
}
