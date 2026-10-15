// B2 Tier-1 community pain map: validator for hand-written rows.
//
// A human reads public threads and writes each row by hand. Nothing here (or
// in the importer) fetches, scrapes or calls any site. Rows are paraphrases.
//
// USE RULE: Twin may use a pain only as a hook or topic seed matched to a
// pillar. It is never proof, never the creator's experience, and never quoted.

export const PAIN_MAP_COLUMNS = [
  'niche', 'pain_sentence', 'pillar_bucket', 'communities', 'thread_count',
  'community_count', 'example_links', 'first_seen', 'last_checked',
  'verification', 'expiry', 'status',
] as const

export type PainRow = Record<(typeof PAIN_MAP_COLUMNS)[number], string>

export interface PainMapRecord {
  niche: string
  pain_sentence: string
  pillar_bucket: string
  communities: string[]
  thread_count: number
  community_count: number
  example_links: string[]
  first_seen: string
  last_checked: string
  verification: 'V1' | 'V2'
  expiry: string
  status: 'active' | 'expired' | 'rejected'
  kind: 'pattern' | 'idea'
  origin: 'audience_pain'
}

export type PainResult =
  | { ok: true; record: PainMapRecord }
  | { ok: false; reasons: string[] }

const QUOTE_RE = /["'“”‘’«»`]/
const HANDLE_RE = /(^|[^\w])@\w|(^|[^\w/])\/?u\/\w/i
const ABSOLUTE_RE = /\b(most|everyone|nobody)\b/i
const PERCENT_RE = /%|\bper ?cent\b/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
export const EXPIRY_DAYS = 90

export function sentenceProblems(s: string): string[] {
  const r: string[] = []
  if (!s.trim()) r.push('pain_sentence_empty')
  if (QUOTE_RE.test(s)) r.push('pain_sentence_quote_marks')
  if (HANDLE_RE.test(s)) r.push('pain_sentence_handle')
  if (ABSOLUTE_RE.test(s)) r.push('pain_sentence_absolute')
  if (PERCENT_RE.test(s)) r.push('pain_sentence_percentage')
  return r
}

export function isPattern(threads: number, communities: number): boolean {
  return threads >= 5 && communities >= 2
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function validDate(s: string): boolean {
  return DATE_RE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`))
}

function splitList(s: string): string[] {
  return (s ?? '').split(/[|;\s]+/).map((x) => x.trim()).filter(Boolean)
}

/** Links are stored as bare URLs only: http(s), no surrounding text. */
export function parseLinks(s: string): { links: string[]; bad: boolean } {
  const parts = splitList(s)
  const links: string[] = []
  let bad = false
  for (const p of parts) {
    try {
      const u = new URL(p)
      if (u.protocol !== 'https:' && u.protocol !== 'http:') bad = true
      else links.push(u.toString())
    } catch { bad = true }
  }
  return { links, bad }
}

function toInt(s: string): number | null {
  return /^\d+$/.test((s ?? '').trim()) ? Number(s.trim()) : null
}

export function validatePainRow(row: Partial<PainRow>): PainResult {
  const g = (k: keyof PainRow) => (row[k] ?? '').trim()
  const reasons: string[] = []
  for (const k of ['niche', 'pillar_bucket'] as const) if (!g(k)) reasons.push(`${k}_missing`)
  reasons.push(...sentenceProblems(g('pain_sentence')))
  const threads = toInt(g('thread_count'))
  const comms = toInt(g('community_count'))
  if (threads === null) reasons.push('thread_count_invalid')
  if (comms === null) reasons.push('community_count_invalid')
  const { links, bad } = parseLinks(g('example_links'))
  if (bad) reasons.push('example_links_not_urls')
  const verification = g('verification').toUpperCase()
  if (verification !== 'V1' && verification !== 'V2') reasons.push('verification_invalid')
  const status = (g('status') || 'active').toLowerCase()
  if (!['active', 'expired', 'rejected'].includes(status)) reasons.push('status_invalid')
  const lastChecked = g('last_checked')
  if (!validDate(lastChecked)) reasons.push('last_checked_invalid')
  const firstSeen = g('first_seen')
  if (firstSeen && !validDate(firstSeen)) reasons.push('first_seen_invalid')
  const expiryIn = g('expiry')
  if (expiryIn && !validDate(expiryIn)) reasons.push('expiry_invalid')
  if (reasons.length) return { ok: false, reasons }
  return {
    ok: true,
    record: {
      niche: g('niche'),
      pain_sentence: g('pain_sentence'),
      pillar_bucket: g('pillar_bucket'),
      communities: splitList(g('communities')),
      thread_count: threads!,
      community_count: comms!,
      example_links: links,
      first_seen: firstSeen || lastChecked,
      last_checked: lastChecked,
      verification: verification as 'V1' | 'V2',
      expiry: expiryIn || addDays(lastChecked, EXPIRY_DAYS),
      status: status as PainMapRecord['status'],
      kind: isPattern(threads!, comms!) ? 'pattern' : 'idea',
      origin: 'audience_pain',
    },
  }
}

/** Minimal RFC4180-style CSV parser (quoted fields, escaped quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], f = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"' && text[i + 1] === '"') { f += '"'; i++ }
      else if (c === '"') q = false
      else f += c
    } else if (c === '"') q = true
    else if (c === ',') { row.push(f); f = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(f); f = ''
      if (row.some((x) => x !== '')) rows.push(row)
      row = []
    } else f += c
  }
  row.push(f)
  if (row.some((x) => x !== '')) rows.push(row)
  return rows
}

export function rowsFromCsv(text: string): Partial<PainRow>[] {
  const [head, ...body] = parseCsv(text)
  if (!head) return []
  const cols = head.map((h) => h.trim())
  const missing = PAIN_MAP_COLUMNS.filter((c) => !cols.includes(c))
  if (missing.length) throw new Error(`missing columns: ${missing.join(', ')}`)
  return body.map((r) => Object.fromEntries(cols.map((c, i) => [c, r[i] ?? ''])))
}
