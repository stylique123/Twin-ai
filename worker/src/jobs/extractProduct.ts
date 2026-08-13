// READ A PRODUCT PAGE, AND GRADE EVERYTHING IT SAYS.
//
// ⚠️ THIS RUNS IN THE WORKER AND NOT THE EDGE, DELIBERATELY. Fetching an
// arbitrary creator-supplied URL and putting a model over it is slow, sometimes
// very slow, and occasionally blocked. An edge function would inherit the
// browser-dependency problem YouTube DNA was just moved off — close the tab and
// the extraction dies — and would hit a runtime timeout on exactly the pages
// worth reading. The queue already has retries, backoff and a reaper.
//
// ⚖️ THE MODEL IS NOT ASKED TO GRADE ITS OWN OUTPUT. It extracts values; the
// classifier in `productExtraction.ts` decides what may be spoken. A model that
// has just read persuasive copy is the worst available judge of whether that
// copy is persuasive, and asking it to self-assess would make the whole split
// decorative.
import { db, type Job } from '../db.js'
import { geminiJson } from '../gemini.js'
import { modelForTask } from '../modelRouting.js'
import { readExtractedFact, EXTRACTED_FIELDS, EXTRACTION_SOURCES,
  type ExtractedFact, type ExtractedField, type ExtractionSource }
  from './productExtractionContract.js'
import { mergeExtraction, needsAttention, describeChange }
  from './productFreshnessContract.js'

/** Read a fact back off the row so a merge compares like with like.
 *
 *  ⚠️ THE STORED `trust` AND `source` ARE HONOURED, NEVER RECOMPUTED. A fact the
 *  creator confirmed carries `source: 'user_confirmed'`, and re-deriving it here
 *  would erase the confirmation this whole merge exists to protect. */
function readStoredFactLike(raw: unknown): ExtractedFact | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const field = String(r.field ?? '')
  const value = String(r.value ?? '').trim()
  if (value === '' || !EXTRACTED_FIELDS.includes(field as ExtractedField)) return null
  const source = r.source === 'user_confirmed'
    ? 'user_confirmed' as const
    : (EXTRACTION_SOURCES.includes(r.source as ExtractionSource)
        ? r.source as ExtractionSource : 'marketing_copy' as const)
  return {
    field: field as ExtractedField,
    value,
    source: source as ExtractionSource,
    sourceUrl: typeof r.sourceUrl === 'string' ? r.sourceUrl : null,
    trust: r.trust === 'usable' ? 'usable' : 'needs_confirmation',
    extractedAt: typeof r.extractedAt === 'string' ? r.extractedAt : '',
  }
}

/** Structured facts a page states about itself in its HEAD, before any
 *  JavaScript runs.
 *
 *  ⚠️ THE FIRST VERSION THREW THESE AWAY AND FAILED ON THE FIRST REAL PRODUCT.
 *  Stripping tags to get prose also strips `<title>`, `<meta name=description>`,
 *  OpenGraph, and any schema.org JSON-LD. For a client-side-rendered site — most
 *  modern SaaS landing pages, including TwinAI's own — the shell is ALL there is
 *  before JS runs, so the extractor saw under 80 characters and reported the
 *  page unreadable. It returned HTTP 200 the whole time.
 *
 *  ⚖️ AND THIS IS BETTER EVIDENCE THAN THE PROSE WAS. A `SoftwareApplication`
 *  JSON-LD block states name, description, featureList and price as DATA the
 *  site publishes about itself for search engines — less promotional than the
 *  headline copy beside it and already structured. Reading the head first is not
 *  a fallback; it is the more reliable source. */
function harvestHead(html: string): string[] {
  const out: string[] = []
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
  if (title) out.push(`TITLE: ${title.trim()}`)
  for (const m of html.matchAll(
    /<meta[^>]+(?:name|property)=["'](description|og:title|og:description|og:site_name)["'][^>]*content=["']([^"']+)["']/gi)) {
    out.push(`${m[1].toUpperCase()}: ${m[2].trim()}`)
  }
  // Same attribute order reversed — plenty of sites emit content= first.
  for (const m of html.matchAll(
    /<meta[^>]+content=["']([^"']+)["'][^>]*(?:name|property)=["'](description|og:title|og:description)["']/gi)) {
    out.push(`${m[2].toUpperCase()}: ${m[1].trim()}`)
  }
  for (const m of html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    // ⚖️ TRUNCATED, NOT PARSED. A malformed or enormous block must not throw and
    // must not crowd out the page; the model reads it as text either way.
    const raw = m[1].trim()
    if (raw) out.push(`STRUCTURED DATA: ${raw.slice(0, 4_000)}`)
  }
  return out
}

/** Fetch the page and return what it says about itself.
 *
 *  Best effort: a page we cannot read is a page we report on honestly, never one
 *  we guess about. */
async function fetchPageText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(20_000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    })
    if (!res.ok) return null
    const ct = res.headers.get('content-type') ?? ''
    if (!ct.includes('html') && !ct.includes('text')) return null
    const html = await res.text()

    // ⚠️ HEAD FIRST, AND BEFORE ANY STRIPPING. See `harvestHead`.
    const head = harvestHead(html)

    const prose = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      // A landing page can be enormous and the useful part is near the top.
      .slice(0, 24_000)

    const combined = [...head, prose].filter((s) => s.trim() !== '').join('\n')
    return combined.trim() === '' ? null : combined
  } catch {
    return null
  }
}

/** Which kind of page this is, which sets how far its claims are trusted.
 *
 *  ⚠️ `official_product_page` WAS UNREACHABLE, AND THAT MADE THE WHOLE SPLIT
 *  INERT. The first successful extraction pulled 17 real facts off twinai.studio
 *  — features, plans, prices, straight out of its JSON-LD — and graded every one
 *  of them `needs_confirmation`, because this function could only ever return
 *  `documentation`, `pricing_page`, `listing` or `marketing_copy`. The enum value
 *  documented as "the product's own site" was produced by nothing.
 *
 *  So `usable: 0`. The feature was safe and useless: a creator pastes their
 *  homepage, waits, and is handed seventeen things to confirm by hand — which is
 *  the "paste a link and then do all the work anyway" outcome the risk split was
 *  chosen to avoid.
 *
 *  ⚖️ THE AUTHORITY TEST IS THE URL, NOT THE RELATIONSHIP. The entity carries a
 *  `product_url` the creator supplied when they registered it. If the page being
 *  read is on that same host, it is the official page FOR THAT PRODUCT — a
 *  factual claim about two URLs matching, not a permission granted because
 *  someone said they own something. Deliberately not keyed on OWN_PRODUCT: a
 *  vendor's own site is authoritative about what the vendor sells whether the
 *  creator owns it, earns on it, or merely reviews it.
 *
 *  ⚠️ AND IT STILL DEGRADES TOWARDS `marketing_copy`. No product_url, a host
 *  mismatch, or an unparseable URL all fall through to the weakest source.
 *  Guessing "official" wrongly promotes copy that should have waited; guessing
 *  "marketing" wrongly costs one confirmation tap. */
function sameHost(a: string, b: string): boolean {
  try {
    const strip = (h: string) => h.toLowerCase().replace(/^www\./, '')
    return strip(new URL(a).host) === strip(new URL(b).host)
  } catch {
    return false
  }
}

function sourceFor(url: string, productUrl?: string | null): ExtractionSource {
  const u = url.toLowerCase()
  // More specific page KINDS win over "it is their site" — a pricing page is a
  // pricing page whoever owns it, and its own type already carries authority.
  if (/\/(?:docs|documentation|developers?|api)\b/.test(u)) return 'documentation'
  if (/\/(?:pricing|plans)\b/.test(u)) return 'pricing_page'
  if (/(?:amazon\.|etsy\.|ebay\.|shopify\.|\/products?\/)/.test(u)) return 'listing'
  if (productUrl && sameHost(url, productUrl)) return 'official_product_page'
  return 'marketing_copy'
}

const SCHEMA = {
  type: 'object',
  properties: {
    facts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          field: {
            type: 'string',
            enum: ['name', 'category', 'description', 'audience', 'feature',
              'use_case', 'integration', 'benefit', 'claim', 'price', 'plan',
              'guarantee', 'cta'],
          },
          value: { type: 'string' },
        },
        required: ['field', 'value'],
      },
    },
  },
  required: ['facts'],
}

const SYSTEM = [
  'You read a product page and report what it says. You are an EXTRACTOR, not a',
  'copywriter and not a critic.',
  '',
  'Report only what the page states. Do not improve a description, do not infer a',
  'benefit the page does not claim, and do not soften a claim it does make — a',
  'later step decides what may be repeated, and it can only do that if you report',
  'the page faithfully.',
  '',
  'Use `claim` for anything asserting a measurable result, `benefit` for an',
  'outcome stated without a number, and `feature` for a capability. "Automatic',
  'captions" is a feature. "Produces videos 4x faster" is a claim.',
  '',
  'Omit a field entirely rather than guessing at it. An absent value is a fact',
  'about the page; an invented one is a fact about you.',
].join('\n')

export async function handleExtractProduct(job: Job): Promise<Record<string, unknown>> {
  const payload = (job.payload ?? {}) as Record<string, unknown>
  const entityId = typeof payload.entity_id === 'string' ? payload.entity_id : ''
  const url = typeof payload.url === 'string' ? payload.url.trim() : ''
  if (!entityId || !url) throw new Error('extract_product needs entity_id and url')
  // ⚠️ HTTPS ONLY. A creator-supplied URL is untrusted input, and this process
  // holds service-role credentials — `file://`, `http://` to a private address,
  // and anything else non-HTTPS are refused rather than fetched.
  if (!/^https:\/\//i.test(url)) throw new Error('extract_product needs an https URL')

  // The entity's own registered URL, so `sourceFor` can tell "this is the page
  // for the thing you registered" from "some page on the internet".
  const { data: entity } = await db.from('product_entities')
    .select('product_url').eq('id', entityId).maybeSingle()
  const productUrl = (entity as { product_url?: string | null } | null)?.product_url ?? null

  const text = await fetchPageText(url)
  if (!text || text.length < 80) {
    // ⚖️ AN UNREADABLE PAGE IS RECORDED AS EMPTY, NOT LEFT NULL. Null means
    // "never extracted" and would show the creator "add a link" for a link they
    // already added; `[]` means "we read it and got nothing", which is what
    // happened and what they need to know.
    await db.from('product_entities').update({
      knowledge: [],
      knowledge_extracted_at: new Date().toISOString(),
      knowledge_source_url: url,
    }).eq('id', entityId)
    return { extracted: 0, reason: 'unreadable' }
  }

  const source = sourceFor(url, productUrl)
  // ⚠️ `thinkingBudget: 0` IS INVALID FOR THIS MODEL CLASS, AND THE FIRST REAL
  // RUN FOUND IT: "Budget 0 is invalid. This model only works in thinking mode."
  // Every other `geminiJson` caller in the worker either omits the budget or
  // passes a computed one; this was the only site pinning it to zero, copied
  // from an edge-function habit where a different model runs. Omitting it lets
  // the model use its own default rather than asserting a number that happens to
  // be legal today.
  //
  // ⚖️ AND THE TASK CLASS IS NAMED RATHER THAN INHERITED. Passing no model landed
  // on `modelForTask('profile')` by fallthrough — a choice by omission, which is
  // exactly what `model_routing_v1.json` exists to make visible. Reading a page
  // into a fixed schema is an EXTRACT, the same class `structure.ts` uses for
  // reference-structure extraction, and its env override is the one an operator
  // would reach for to cut cost on schema-constrained work.
  const out = await geminiJson(
    SYSTEM, `PAGE (${url}):\n${text}`, SCHEMA, 60_000, undefined, modelForTask('extract'),
  ) as { facts?: Array<{ field?: string; value?: string }> }

  const now = new Date().toISOString()
  const facts: ExtractedFact[] = []
  for (const raw of out?.facts ?? []) {
    const f = readExtractedFact({
      field: String(raw?.field ?? '') as never,
      value: String(raw?.value ?? ''),
      source,
      sourceUrl: url,
      now,
    })
    if (f) facts.push(f)
  }

  // ⚠️ A RE-EXTRACT USED TO DESTROY EVERY CONFIRMATION THE CREATOR HAD MADE.
  // This wrote `knowledge: facts` — a wholesale replace — and
  // `confirmProductFacts` stores a creator's approvals INSIDE THAT SAME JSONB,
  // flipping `source` to `user_confirmed` on the facts they personally vouched
  // for. So a creator could work through ten held prices by hand, paste the
  // link again a month later, and have all ten silently revert to
  // `needs_confirmation`. Nothing told them; the only sign was being asked
  // again about facts they had already approved.
  //
  // ⚖️ MERGED, AND THE DISAGREEMENTS REPORTED. A confirmed fact is never
  // overwritten and never silently kept: if the page now says something else,
  // both survive and the conflict is surfaced, because the creator is the one
  // who gets to retire something they vouched for. Unconfirmed facts are the
  // extractor's own and a newer read replaces them, which is what re-crawling
  // is for.
  const { data: prevRow } = await db.from('product_entities')
    .select('knowledge').eq('id', entityId).maybeSingle()
  const rawPrev = (prevRow as { knowledge?: unknown } | null)?.knowledge
  const previous = Array.isArray(rawPrev)
    ? rawPrev.map((r) => readStoredFactLike(r)).filter((f): f is ExtractedFact => f !== null)
    : null

  const { knowledge, changes } = mergeExtraction(previous, facts)

  const { error } = await db.from('product_entities').update({
    knowledge,
    knowledge_extracted_at: now,
    knowledge_source_url: url,
  }).eq('id', entityId)
  if (error) throw new Error(`extract_product could not store knowledge: ${error.message}`)

  const usable = knowledge.filter((f) => f.trust === 'usable').length
  const attention = needsAttention(changes)
  console.log(JSON.stringify({
    event: 'product_knowledge_extracted',
    entity_id: entityId, source, total: knowledge.length, usable,
    needs_confirmation: knowledge.length - usable,
    // What a refresh actually DID, so "we re-read the page and nothing moved" is
    // distinguishable from "we re-read it and quietly replaced nine things".
    read_from_page: facts.length,
    changed: changes.length,
    by_change: changes.reduce<Record<string, number>>(
      (a, c) => ({ ...a, [c.kind]: (a[c.kind] ?? 0) + 1 }), {}),
    // Confirmations that the page now contradicts or has dropped. Both were
    // performed silently by the replace this fixed.
    needs_creator: attention.length,
    conflicts: attention.map(describeChange).slice(0, 10),
  }))
  return { extracted: knowledge.length, usable, changed: changes.length, conflicts: attention.length }
}
