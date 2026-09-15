// THE VISUAL PASS'S OWN OUTPUT, FETCHED FOR THE REFERENCE ON SCREEN.
//
// ⚠️ THE SCREEN SAID "We did not analyse the video" WHILE 940 STORED PROFILES
// EXISTED. `reference_content_profiles.visual_profile` is where the pass writes,
// and no creator-facing surface had ever read it — the something-built-that-
// nothing-reads shape, on the one screen whose entire job is to show what we
// actually know.
//
// ⚠️⚠️ AND IT WILL BE EMPTY FOR MOST REFERENCES TODAY, WHICH IS MEASURED AND NOT
// A REASON TO SKIP IT. Of 149 generations, 82 carry a `reference_url` and ZERO
// join to a row with a `visual_profile`: creators paste YouTube Shorts, while
// all 940 visual profiles are TikTok URLs from the scraped gallery corpus, and
// YouTube downloads are bot-walled ("Sign in to confirm you're not a bot"). So
// this returns null for a YouTube paste and the row correctly keeps saying "not
// observed" — the screen stops lying the moment the pass CAN run, rather than
// starting to lie now.
//
// ⚖️ NO NEW SURFACE. `generations.reference_url` already exists and
// `reference_content_profiles` already carries a SELECT policy for
// `authenticated` with `using (true)`. Nothing is granted here.
import { supabase } from './supabase'

/**
 * The stored visual profile for a generation's reference, or null.
 *
 * ⚠️ FAILS TO null, NEVER THROWS. This decorates rows on a screen the creator is
 * already reading; a failed lookup must leave the honest "not observed" in place
 * rather than taking the panel down.
 */
export async function loadReferenceVisualProfile(generationId: string): Promise<unknown> {
  try {
    const { data: gen } = await supabase
      .from('generations')
      .select('reference_url')
      .eq('id', generationId)
      .maybeSingle()
    const url = typeof (gen as { reference_url?: unknown } | null)?.reference_url === 'string'
      ? (gen as { reference_url: string }).reference_url.trim()
      : ''
    if (url === '') return null
    const { data } = await supabase
      .from('reference_content_profiles')
      .select('visual_profile')
      .eq('url', url)
      .maybeSingle()
    return (data as { visual_profile?: unknown } | null)?.visual_profile ?? null
  } catch {
    return null
  }
}
