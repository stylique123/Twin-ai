/**
 * A CALL TO ACTION MAY NOT NAME AN ACTION THE PLATFORM DOES NOT HAVE.
 *
 * ⚠️ MEASURED IN PRODUCTION 2026-09-07. FOUR stored scripts tell the viewer to
 * "subscribe to our channel". All four are TikTok, and Twin KNEW that twice
 * over: `reference_read.platform` reads `tiktok` on all four, and
 * `brand_voices.platform` reads `tiktok` for every one of those creators. The
 * platform was on file in two places and the line shipped anyway.
 *
 * TikTok has no channels and no subscribe button. A creator reading this to
 * camera asks their audience to press something that is not on the screen.
 *
 * ⚠️ AND IT IS NOT A HARD-CODED FALLBACK — I looked. No string in this
 * repository produces it; the model writes it, unprompted, because nothing
 * downstream ever checked the CTA against the platform. So the fix is a check,
 * not a copy edit: there is no default sentence to correct.
 *
 * ⚖️ THIS IS NOT "USE THE CREATOR'S OWN CTA". That rule was considered and is
 * NOT what this does, because it would be inert: measured the same day, ZERO of
 * 37 creators has a `defaultCta` on file, and onboarding never asks for one
 * (`defaultCta` appears nowhere in Onboarding.tsx). A rule reading an empty
 * field for every creator in production is the defect this repo keeps finding.
 * This asks a question that CAN be answered from data that IS there.
 *
 * ⚖️ WRONG-PLATFORM ONLY, NEVER "IS THIS A GOOD CTA". "Follow for more" on
 * TikTok, "link in bio", "comment below", "save this" and "share it with a
 * friend" are all fine and all stay. The only thing refused is a verb the
 * platform does not implement.
 */

/** What each platform's audience can actually be asked to do. Absent from a
 *  list means "we have no opinion", never "forbidden". */
const WRONG_FOR: Readonly<Record<string, readonly RegExp[]>> = Object.freeze({
  // ⚠️ "SUBSCRIBE" AND "CHANNEL" ARE BOTH YOUTUBE NOUNS, and both were in the
  // measured line. Matched separately so "subscribe to my newsletter" — a real
  // thing a TikTok creator says — is NOT caught by the channel rule.
  tiktok: Object.freeze([
    /\bsubscribe\b/i,
    /\bmy channel\b|\bour channel\b|\bthe channel\b/i,
    /\bring the bell\b|\bnotification bell\b/i,
  ]),
  instagram: Object.freeze([
    /\bsubscribe\b/i,
    /\bmy channel\b|\bour channel\b|\bthe channel\b/i,
    /\bring the bell\b|\bnotification bell\b/i,
  ]),
})

export interface PlatformCtaFailure {
  index: number
  line: string
  repair: string
}

const isCta = (section: unknown): boolean =>
  /cta|call to action/i.test(String(section ?? ''))

/** Plain everyday English, per the standing rule: what a creator would say. */
const RIGHT_WORD: Readonly<Record<string, string>> = Object.freeze({
  tiktok: 'follow',
  instagram: 'follow',
})

/**
 * @param script   the declared beats
 * @param platform where this video is going. ⚠️ THE NULL CHECK PRECEDES THE
 *   COERCION: an unknown platform is "we do not know", never "no platform", and
 *   an unknown platform forbids nothing.
 */
export function platformCtaFailures(
  script: readonly { section?: unknown; line?: unknown }[] | null | undefined,
  platform: unknown,
): PlatformCtaFailure[] {
  const p = String(platform ?? '').trim().toLowerCase()
  const wrong = WRONG_FOR[p]
  if (!wrong) return []
  const beats = Array.isArray(script) ? script : []
  const out: PlatformCtaFailure[] = []
  beats.forEach((b, i) => {
    // ⚖️ THE CTA BEAT ONLY. A hook may legitimately mention subscribing —
    // "everyone tells you to grow a YouTube channel first" is a real opinion,
    // not an instruction to the viewer.
    if (!isCta(b?.section)) return
    const line = typeof b?.line === 'string' ? b.line : ''
    if (line.trim() === '') return
    if (!wrong.some((re) => re.test(line))) return
    out.push({
      index: i,
      line,
      repair: `This video is going on ${p}, which has no channels and no subscribe button.`
        + ` Rewrite the call to action using what ${p} actually has —`
        + ` "${RIGHT_WORD[p] ?? 'follow'}", saving the video, commenting, or sharing it.`
        + ' Do not ask anyone to press something that is not on their screen.',
    })
  })
  return out
}
