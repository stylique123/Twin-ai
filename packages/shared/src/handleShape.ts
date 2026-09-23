// ⚠️ OWNER REPORT: pasting a sentence into the handle box said "That handle looks
// too long." The problem was never length — it was not a handle at all. A shape
// mismatch gets its own sentence, checked BEFORE length.
//
// ⚖️ HAND-MIRRORED in supabase/functions/_shared/dna.ts (`handleShapeError`),
// pinned by `handleShape.test.ts`. The edge cannot import this package.

export const NOT_A_HANDLE = "That doesn't look like a handle — paste @name or a profile link."
export const HANDLE_TOO_LONG = 'That handle looks too long.'

/** Null when `raw` could be a handle or a profile link, otherwise the sentence to show. */
export function handleShapeError(raw: string): string | null {
  const s = String(raw ?? '').trim()
  if (!s) return null
  // A profile link: a URL (with or without scheme) on a known host shape.
  const isLink = /^(?:https?:\/\/)?(?:www\.|m\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+\/\S*$/i.test(s)
  if (isLink) return /\s/.test(s) ? NOT_A_HANDLE : null
  // A bare handle: optional @, then handle characters only.
  if (/\s/.test(s) || /[^@\w.\-]/.test(s) || /^https?:/i.test(s)) return NOT_A_HANDLE
  if (s.replace(/^@+/, '').length > 60) return HANDLE_TOO_LONG
  return null
}
