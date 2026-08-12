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
import { readExtractedFact, type ExtractedFact, type ExtractionSource }
  from './productExtractionContract.js'

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
 *  ⚖️ INFERRED FROM THE URL AND DEGRADED TOWARDS `marketing_copy`, never towards
 *  authority. Guessing "official product page" wrongly promotes copy that should
 *  have waited; guessing `marketing_copy` wrongly costs one confirmation tap. */
function sourceFor(url: string): ExtractionSource {
  const u = url.toLowerCase()
  if (/\/(?:docs|documentation|developers?|api)\b/.test(u)) return 'documentation'
  if (/\/(?:pricing|plans)\b/.test(u)) return 'pricing_page'
  if (/(?:amazon\.|etsy\.|ebay\.|shopify\.|\/products?\/)/.test(u)) return 'listing'
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

  const source = sourceFor(url)
  const out = await geminiJson(SYSTEM, `PAGE (${url}):\n${text}`, SCHEMA, 60_000, 0) as
    { facts?: Array<{ field?: string; value?: string }> }

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

  const { error } = await db.from('product_entities').update({
    knowledge: facts,
    knowledge_extracted_at: now,
    knowledge_source_url: url,
  }).eq('id', entityId)
  if (error) throw new Error(`extract_product could not store knowledge: ${error.message}`)

  const usable = facts.filter((f) => f.trust === 'usable').length
  console.log(JSON.stringify({
    event: 'product_knowledge_extracted',
    entity_id: entityId, source, total: facts.length, usable,
    needs_confirmation: facts.length - usable,
  }))
  return { extracted: facts.length, usable }
}
