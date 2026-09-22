// A LINK A PERSON WOULD ACTUALLY TYPE, WHICH IS NOT A LINK A PARSER WANTS.
//
// ⚠️⚠️ REPORTED 2026-09-22: `www.thedogdaysco.com` was refused, and the message
// said only "Please paste a full https:// link." A creator who does not already
// know the fix has nowhere to go from there — the reporter got past it by
// happening to know.
//
// ⚖️ NOBODY TYPES A SCHEME INTO A BROWSER ANY MORE, so refusing the form
// everybody uses is asking the creator to do the machine's job. The protocol is
// SUPPLIED on the way out rather than demanded on the way in; every reader
// downstream — `requestProductExtraction`, the edge function, the worker — still
// sees exactly what it always required.
//
// ⚠️ IT LIVES HERE RATHER THAN IN THE PAGE BECAUSE THE GATE SAID SO. Written
// first inside `ProductLibrary.tsx`, its test had to import a `.tsx` from
// `apps/web` into `packages/shared`, and `check_test_typecheck_ratchet` refused
// it: "'--jsx' is not set". A pure string rule belongs in the package that has
// no JSX, and the refusal was right.

/**
 * A host with a dot and no spaces, optionally with a path.
 *
 * ⚠️ DELIBERATELY NARROW. Accepting a bare word would send the extractor at a
 * name rather than a page, which fails later and less clearly than refusing it
 * here.
 */
const BARE_DOMAIN =
  /^(?:https?:\/\/)?(?:www\.)?[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+(?:\/\S*)?$/i

export function looksLikeBareDomain(v: string | null | undefined): boolean {
  const s = String(v ?? '').trim()
  return s !== '' && !s.includes(' ') && BARE_DOMAIN.test(s)
}

/**
 * The same string, in the form every reader downstream already requires.
 *
 * ⚖️ http IS UPGRADED, NOT PASSED THROUGH. The downstream guard is https-only,
 * so forwarding http would turn a typed address into a refusal further from the
 * field that produced it.
 */
export function normalizeLink(v: string | null | undefined): string {
  const s = String(v ?? '').trim()
  if (s === '') return ''
  return /^https?:\/\//i.test(s) ? s.replace(/^http:\/\//i, 'https://') : `https://${s}`
}
