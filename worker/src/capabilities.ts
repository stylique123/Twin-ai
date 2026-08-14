// WHAT THIS WORKER CAN ACTUALLY DO, SAID OUT LOUD AT BOOT.
//
// ── THE DEFECT THIS CLOSES, WHICH COST A WHOLE SESSION ────────────────────
//
// `APIFY_TOKEN` was missing from this worker's environment for an entire day of
// development. Nothing said so. Every credential check in `media.ts` is correct
// and every one of them is PER-CALL:
//
//     if (!env.apifyToken) throw new Error('YouTube analysis is not configured
//       yet. Try a TikTok or Instagram link, or contact support.')
//
// ⚠️ SO THE ABSENCE ONLY SPEAKS WHEN A USER TRIPS OVER IT, AND WHEN IT SPEAKS IT
// LIES. "Not configured yet… contact support" reads as a product limitation the
// operator chose. It is a missing environment variable, and the person who could
// fix it in thirty seconds is the one person the message never reaches.
//
// ⚖️ A WORKER THAT CANNOT SCRAPE IS NOT A BROKEN WORKER — it is a worker running
// at reduced capability, which is a legitimate state and must not crash on boot.
// TikTok scraping, transcription and rendering all work without Apify. So this
// REPORTS rather than refuses: the process starts, and the log says exactly what
// is dark and which variable turns it on.
//
// ⚠️ AND IT NAMES THE VARIABLE, NOT THE SYMPTOM. "apify unavailable" sends
// somebody reading source; "APIFY_TOKEN is not set" is a fix.

export interface Capability {
  /** What a person would say the product does. */
  name: string
  live: boolean
  /** The env var that turns it on. Named so the log line is actionable. */
  needs: string
  /** What silently does not happen while this is dark. */
  dark: string
}

export interface CapabilityEnv {
  apifyToken?: string
  apifyProxyPassword?: string
  geminiKey?: string
}

/**
 * Read capability from credentials alone.
 *
 * ⚖️ CREDENTIALS ONLY, DELIBERATELY. This says what is POSSIBLE, not what works —
 * a live token can still be rate-limited or revoked. Conflating the two would
 * make this another thing that reports healthy while nothing happens, which is
 * the exact failure it exists to end.
 */
export function readCapabilities(env: CapabilityEnv): Capability[] {
  const apify = Boolean(env.apifyToken)
  return [
    {
      name: 'scan a YouTube or Instagram account',
      live: apify,
      needs: 'APIFY_TOKEN',
      dark: 'every YouTube and Instagram scan fails; TikTok is unaffected',
    },
    {
      name: 'read a reference video transcript',
      live: apify,
      needs: 'APIFY_TOKEN',
      dark: 'references fall back to titles and captions, which carry no substance',
    },
    {
      // ⚠️ SEPARATE FROM THE TOKEN AND NOT DERIVABLE FROM IT. Meta signs its
      // thumbnails to the requesting IP, so Instagram imagery needs the
      // residential proxy even when the token is present — an Apify account
      // with a token and no proxy password scrapes Instagram fine and comes
      // back with empty palettes, which looks like a colour bug.
      name: 'fetch Instagram imagery (palettes, thumbnails)',
      live: Boolean(env.apifyProxyPassword),
      needs: 'APIFY_PROXY_PASSWORD',
      dark: 'Instagram scans succeed but return empty palettes',
    },
    {
      name: 'extract knowledge and build voice',
      live: Boolean(env.geminiKey),
      needs: 'GEMINI_API_KEY',
      dark: 'scans store no knowledge; every script falls back to generic',
    },
  ]
}

/** One line per dark capability, for an operator reading boot logs.
 *
 *  ⚖️ NOTHING IS PRINTED WHEN EVERYTHING IS LIVE. A warning that appears on every
 *  healthy boot is a warning nobody reads. */
export function darkCapabilityWarnings(caps: readonly Capability[]): string[] {
  return caps.filter((c) => !c.live).map(
    (c) => `${c.needs} is not set — cannot ${c.name}. While this is unset, ${c.dark}.`)
}

/** A single compact object for the structured boot log. */
export function capabilitySummary(caps: readonly Capability[]): Record<string, boolean> {
  const out: Record<string, boolean> = {}
  for (const c of caps) out[c.needs] = c.live
  return out
}
