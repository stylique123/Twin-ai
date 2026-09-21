import { db } from './db.js'

// WHAT "KEEP THE CREATOR'S EXISTING VOICE" IS ALLOWED TO MEAN.
//
// ⚠️ MEASURED IN PRODUCTION, 2026-09-21: ELEVEN OF FORTY `ready` BRAND VOICES
// HAVE NO SCAN-DERIVED MATERIAL AT ALL — zero `creator_knowledge` rows from a
// caption, transcript or previous video, and zero own transcripts. They are not
// new; they are finished, and empty.
//
// The path that makes them: `start-dna` gets a HANDLE CACHE HIT, copies the
// cached profile onto the row, marks it `ready`, and queues the scan that is
// supposed to fill the knowledge behind the creator. When that scan then fails,
// `scrape_dna`'s `fail()` asked one question — "does this row already carry a
// niche/tone/summary?" — saw the profile the cache had just written, concluded
// the creator had an existing voice worth protecting, and left the row `ready`.
// There was nothing to protect. The profile was minutes old and belonged to the
// handle, not to this account.
//
// ⚖️ THE CONSEQUENCE IS NOT COSMETIC, WHICH IS WHY THIS IS WORTH A MODULE.
// `substanceBudget()` is referencePoints + storeItems + productFacts + free
// beats. An empty store takes it to its floor, the floor was 5, and the owner
// reported 5-scene scripts for a 60-second video with a second story force-
// fitted to reach length. A voice that says `ready` over an empty table does
// not fail loudly — it writes a thin script and lets the creator conclude the
// product is thin.
//
// ⚖️ THE QUESTION IS "OF ITS OWN", NOT "ANY ROWS AT ALL". The account that
// reported this had three `creator_knowledge` rows — the three onboarding
// answers they typed themselves. Counting those would have called the voice
// built on the strength of the creator having answered a form. `user` and
// `asked` are what the creator supplied; `caption`, `transcript` and
// `previous_video` are what a scan of their account produced. Only the second
// kind means a scan has ever succeeded here.
const SCAN_SOURCES = ['caption', 'transcript', 'previous_video']

/**
 * Whether this voice holds material produced by a scan of the account — as
 * opposed to a profile handed to it by the handle cache, or answers the creator
 * typed into a form.
 *
 * ⚠️ RETURNS TRUE WHEN IT CANNOT TELL. The only caller uses this to decide
 * whether to mark a voice `failed`, and a transient read error must never be
 * the reason a creator's built voice is taken away from them. Unknown degrades
 * to the older, gentler behaviour.
 */
export async function voiceHasOwnMaterial(voiceId: string): Promise<boolean> {
  try {
    const [knowledge, transcripts] = await Promise.all([
      db.from('creator_knowledge').select('id').eq('voice_id', voiceId).in('source', SCAN_SOURCES).limit(1),
      db.from('transcripts').select('id').eq('brand_voice_id', voiceId).eq('subject', 'own').limit(1),
    ])
    // ⚠️ AN ERROR IS NOT AN EMPTY RESULT. PostgREST rejects the WHOLE select on
    // an unknown column, and `data` then arrives as null — indistinguishable
    // from "this voice has nothing" unless the error is read first.
    if (knowledge.error || transcripts.error) return true
    return (knowledge.data?.length ?? 0) > 0 || (transcripts.data?.length ?? 0) > 0
  } catch {
    return true
  }
}
