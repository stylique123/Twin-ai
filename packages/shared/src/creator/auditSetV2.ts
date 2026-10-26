// AUDIT SET V2 — offline fixtures for page-read audits. Each entry is a
// FICTIONAL, de-identified HTML page plus the facts an audit should read from it.
// No scraping: pages are hand-written files under creator/fixtures/auditSetV2.
// The extractor is regex-only (no DOM, no network) so it runs in any runtime.
import { isCreatorType, type CreatorType } from './creatorTypeRules'

export interface AuditPageFacts {
  title: string
  h1: string
  meta_description: string
  links: string[]
  cta_texts: string[]
  price: string
}

export const PRODUCT_KINDS = ['physical', 'digital', 'software', 'service', 'course'] as const
export type ProductKind = (typeof PRODUCT_KINDS)[number]
export const FACT_FIELDS = ['title', 'h1', 'meta_description', 'cta_texts', 'price'] as const

export interface AuditSetV2Entry {
  id: string
  file: string
  kind: ProductKind
  creator_type: CreatorType
  fictional: true
  expected: Partial<AuditPageFacts>
}

export interface AuditSetV2Manifest { schema_version: 2; entries: AuditSetV2Entry[] }

const decode = (s: string) => s
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
const text = (s: string) => decode(s.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
const first = (html: string, re: RegExp) => { const m = re.exec(html); return m ? text(m[1]) : '' }

export function extractPageFacts(html: string): AuditPageFacts {
  const body = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, '')
  const meta = /<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i.exec(body)
  const links = [...body.matchAll(/<a\s[^>]*href=["']([^"']+)["']/gi)].map((m) => m[1])
  const cta_texts = [...body.matchAll(/<(?:a|button)\s[^>]*data-cta[^>]*>([\s\S]*?)<\/(?:a|button)>/gi)].map((m) => text(m[1]))
  return {
    title: first(body, /<title>([\s\S]*?)<\/title>/i),
    h1: first(body, /<h1[^>]*>([\s\S]*?)<\/h1>/i),
    meta_description: meta ? decode(meta[1]) : '',
    links,
    cta_texts,
    price: (/<[^>]*data-price[^>]*>([\s\S]*?)</i.exec(body)?.[1]?.trim())
      ?? (/[$\u20ac\u00a3]\s?\d+(?:[.,]\d{2})?/.exec(text(body))?.[0] ?? ''),
  }
}

/**
 * De-identification check: a fixture must carry no real-looking contact or
 * location data. Emails and links must use reserved example domains (RFC 2606),
 * no phone numbers, no social @handles, and the page must declare itself fictional.
 */
export function deidentificationProblems(html: string): string[] {
  const p: string[] = []
  if (!/data-fictional=["']true["']/.test(html)) p.push('missing data-fictional="true" marker')
  for (const m of html.matchAll(/[\w.+-]+@([\w-]+(?:\.[\w-]+)+)/g)) {
    if (!/(^|\.)example\.(com|org|net)$|\.example$/.test(m[1])) p.push(`email on non-example domain: ${m[1]}`)
  }
  for (const m of html.matchAll(/https?:\/\/([^/"'\s>]+)/g)) {
    if (!/(^|\.)example\.(com|org|net)$|\.example$|\.test$/.test(m[1])) p.push(`link to non-example host: ${m[1]}`)
  }
  if (/\+?\d[\d\s().-]{8,}\d/.test(text(html))) p.push('phone-like number')
  if (/(^|\s)@[A-Za-z0-9_.]{2,}/.test(text(html))) p.push('social handle')
  return p
}

export function validateAuditSetV2Manifest(input: unknown): string[] {
  const e: string[] = []
  if (!input || typeof input !== 'object') return ['manifest: not an object']
  const m = input as Record<string, unknown>
  if (m.schema_version !== 2) e.push('schema_version: must be 2')
  if (!Array.isArray(m.entries) || !m.entries.length) return [...e, 'entries: non-empty list required']
  const ids = new Set<string>()
  m.entries.forEach((x: Record<string, unknown>, i: number) => {
    if (typeof x?.id !== 'string' || !x.id) e.push(`entries[${i}].id: required`)
    else if (ids.has(x.id)) e.push(`entries[${i}].id: duplicate`)
    else ids.add(x.id)
    if (typeof x?.file !== 'string' || !/^[a-z0-9-]+\.html$/.test(x.file)) e.push(`entries[${i}].file: slug .html required`)
    if (!(PRODUCT_KINDS as readonly unknown[]).includes(x?.kind)) e.push(`entries[${i}].kind: invalid`)
    if (!isCreatorType(x?.creator_type)) e.push(`entries[${i}].creator_type: invalid`)
    if (x?.fictional !== true) e.push(`entries[${i}].fictional: must be true`)
    if (!x?.expected || typeof x.expected !== 'object') e.push(`entries[${i}].expected: required`)
  })
  return e
}

export interface LoadedAuditPage { entry: AuditSetV2Entry; facts: AuditPageFacts }

/**
 * Loads the set from a manifest and a file reader (injected so the loader does
 * no I/O of its own). Throws on an invalid manifest, a non-de-identified page,
 * or a page whose extracted facts disagree with `expected`.
 */
export function loadAuditSetV2(manifest: unknown, readFile: (name: string) => string): LoadedAuditPage[] {
  const errs = validateAuditSetV2Manifest(manifest)
  if (errs.length) throw new Error(`audit set v2 manifest invalid: ${errs.join('; ')}`)
  return (manifest as AuditSetV2Manifest).entries.map((entry) => {
    const html = readFile(entry.file)
    const leaks = deidentificationProblems(html)
    if (leaks.length) throw new Error(`${entry.id}: not de-identified: ${leaks.join('; ')}`)
    const facts = extractPageFacts(html)
    for (const [k, v] of Object.entries(entry.expected)) {
      if (JSON.stringify(facts[k as keyof AuditPageFacts]) !== JSON.stringify(v)) {
        throw new Error(`${entry.id}: ${k} expected ${JSON.stringify(v)}, read ${JSON.stringify(facts[k as keyof AuditPageFacts])}`)
      }
    }
    return { entry, facts }
  })
}

/** Share of pages per kind on which each fact field came back non-empty. */
export function fieldFillByKind(pages: Array<{ kind: ProductKind; facts: AuditPageFacts }>) {
  const out: Partial<Record<ProductKind, { pages: number; fill: Record<string, number> }>> = {}
  for (const { kind, facts } of pages) {
    const row = out[kind] ?? (out[kind] = { pages: 0, fill: Object.fromEntries(FACT_FIELDS.map((f) => [f, 0])) })
    row.pages++
    for (const f of FACT_FIELDS) { const v = facts[f]; if (Array.isArray(v) ? v.length : v) row.fill[f]++ }
  }
  for (const r of Object.values(out)) for (const f of FACT_FIELDS) r!.fill[f] = r!.fill[f] / r!.pages
  return out
}
