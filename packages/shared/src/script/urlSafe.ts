// URL-SAFE SENTENCE SPLITTING (panel 13c, 11 Nov; SCRIPT_CLEANUP_V1, default
// OFF). Panel 13c shipped two scripts ending "com/quiet-loom." and
// "com/pip-live.": a splitter cut "https://example." from "com/…" at the dot,
// and a later step dropped the first half. When the switch is on, every
// splitter that goes through `sentenceMatch` masks the dots inside URLs and
// bare domains first, so a link is never cut. Off (the default), each call is
// byte-for-byte the old `text.match(re)`. Pure apart from the one switch the
// edge and the worker set from the env at start-up.

let urlSafe = false
/** Set once from SCRIPT_CLEANUP_V1 by the edge and the worker. */
export function setUrlSafeSplitting(on: boolean): void { urlSafe = on === true }
export function urlSafeSplitting(): boolean { return urlSafe }
/** The flag reader both runtimes use: only the exact value 'on' turns it on. */
export const scriptCleanupV1On = (v: unknown): boolean => v === 'on'

// A URL ("https://x.y/z", "www.x.y") or a bare domain with a known ending
// ("example.com/pip-live", "shop.example.co.uk"). Trailing sentence
// punctuation is not part of it.
const LINK = /\b(?:https?:\/\/[^\s]+|www\.[^\s]+|(?:[a-z0-9-]+\.)+(?:com|co|org|net|io|shop|store|app|ly|me|tv|uk|ca|au|de|fr|in|us)(?:\/[^\s]*)?)/gi
const MASK = '․' // ONE DOT LEADER: never a sentence end

/** Masks the dots inside links (not a trailing full stop). */
export function maskLinks(text: string): string {
  return String(text ?? '').replace(LINK, (m) => {
    const tail = m.match(/[.,;:!?)"'”’]+$/)?.[0] ?? ''
    const core = tail ? m.slice(0, -tail.length) : m
    return core.replace(/\./g, MASK) + tail
  })
}
export const unmaskLinks = (text: string): string => String(text ?? '').split(MASK).join('.')

/**
 * `text.match(re)` for a sentence regex. With URL-safe splitting on, links are
 * masked before the match and restored in every piece; off, it is the plain
 * match.
 */
export function sentenceMatch(text: string, re: RegExp): RegExpMatchArray | null {
  if (!urlSafe) return text.match(re)
  const m = maskLinks(text).match(re)
  if (!m) return m
  const out = m.map(unmaskLinks) as unknown as RegExpMatchArray
  return out
}
