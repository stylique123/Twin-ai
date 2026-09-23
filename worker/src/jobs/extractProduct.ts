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
import { harvestSections } from '../pageSections.js'
import { geminiJson, geminiGroundedSearch, type InlineImage } from '../gemini.js'
import { findProductOnWeb, type WebProductMatch } from '../productWebSearch.js'

/** Capped: each image is a full-resolution photo inlined into the request, so an
 *  unbounded list is a timeout and a bill. Four views of one object is already
 *  more than the question needs. */
const MAX_IMAGES = 4

/** The stored extension decides the mime type the model is told. The upload
 *  endpoint only ever writes these three. */
function mimeFor(path: string): string {
  const p = path.toLowerCase()
  return p.endsWith('.jpg') || p.endsWith('.jpeg') ? 'image/jpeg'
    : p.endsWith('.webp') ? 'image/webp' : 'image/png'
}
import { modelForTask } from '../modelRouting.js'
import { isShopFront, findShopProduct, variantPriceLines, optionLines } from '../shopProductLookup.js'
import { ldPriceLines } from '../ldProductPrices.js'
import { withoutSiteButtons, labelUnlabeledPrices } from '../pageFactHygiene.js'
import { readExtractedFact, EXTRACTED_FIELDS, EXTRACTION_SOURCES, imageFactAllowed,
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

/** A shop's public JSON, or null. HTTPS only, short timeout, never throws —
 *  a shop that will not answer simply leaves the old path in place. */
async function fetchShopJson(u: string): Promise<unknown | null> {
  if (!/^https:\/\//i.test(u)) return null
  try {
    const res = await fetch(u, { signal: AbortSignal.timeout(10_000), headers: { Accept: 'application/json' }, redirect: 'follow' })
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) return null
    return await res.json()
  } catch { return null }
}

/** Fetch the page and return what it says about itself.
 *
 *  Best effort: a page we cannot read is a page we report on honestly, never one
 *  we guess about. */
/** Prices the fetched page stated as schema.org data, by URL. Filled as a side
 *  effect of `fetchPageText` so its signature (and its tests) stay unchanged. */
const pagePrices = new Map<string, string[]>()

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
    pagePrices.set(url, ldPriceLines(html))

    const prose = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      // A landing page can be enormous and the useful part is near the top.
      .slice(0, 24_000)

    // ⚠️ SECTIONS BEFORE PROSE, for the same reason the head comes first: this
    // is the page describing its own structure, and it is the only evidence
    // `page_section` can honestly be drawn from.
    const sections = harvestSections(html)
    const sectionLine = sections.length > 0
      ? [`SECTIONS PRESENT ON THIS PAGE (headings and labelled regions, verbatim): ${sections.join(' | ')}`]
      : []
    const combined = [...head, ...sectionLine, prose].filter((s) => s.trim() !== '').join('\n')
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
              'guarantee', 'cta',
              // ⚠️ TWO FIELDS THAT EXIST TO STOP THE WRITER INVENTING A PROP.
              // `action_posing` once told a meal-prep creator to hold a glass of
              // water, because nothing told it what the product physically IS.
              // These are extracted the same way every other fact is and stored
              // in the same `knowledge` blob — no new column, no second call.
              'object_shape', 'page_section'],
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
  '',
  '`object_shape`: ONE word for what the product physically is, and ONLY from a',
  'photograph or an explicit statement on the page. One of: jar, bottle, tube,',
  'bag, box, flat, garment, device, food. This decides whether a creator is told',
  'to twist a cap that exists or one that does not, so a guess is worse here than',
  'a blank. If the product is a service, an app or anything with no physical',
  'object, omit it — that is the correct answer, not a failure to find one.',
  '',
  '`page_section`: the NAME of a section that is actually present on the page —',
  '"pricing table", "feature comparison", "dashboard screenshot", "onboarding',
  'flow", "testimonials". A creator will be told to point a camera at what you',
  'name here, so name only what you SAW. Never report a section because a product',
  'of this kind usually has one: an invented "dashboard" sends someone to film a',
  'screen that does not exist.',
].join('\n')

/**
 * ⚠️ A FAILED READ MUST LEAVE A TRACE, and until now it left none: the handler
 * threw and the row was untouched, so the failure was indistinguishable from an
 * extraction nobody had started. The creator's card then said "Twin is reading
 * the page" forever.
 *
 * ⚖️ THE WRAPPER RECORDS AND RETHROWS. It must not swallow: the job still fails,
 * still retries under the queue's own rules, and still shows up in the worker's
 * error path. All that changes is that the ROW now says what happened.
 *
 * ⚠️ AND RECORDING MUST NOT ITSELF BECOME A FAILURE. If the write fails, the
 * original error is what propagates -- losing the note is bad, replacing the
 * real cause with a note-writing error is worse.
 */
export async function handleExtractProduct(job: Job): Promise<Record<string, unknown>> {
  try {
    return await extractProduct(job)
  } catch (e) {
    const payload = (job.payload ?? {}) as Record<string, unknown>
    const entityId = typeof payload.entity_id === 'string' ? payload.entity_id : ''
    if (entityId) {
      try {
        await db.from('product_entities').update({
          knowledge_failed_at: new Date().toISOString(),
          knowledge_error: creatorSafeReason(e),
        }).eq('id', entityId)
      } catch (writeError) {
        console.warn('extract_product: could not record the failure',
          writeError instanceof Error ? writeError.message : writeError)
      }
    }
    throw e
  }
}

/**
 * ⚠️ WHAT THE CREATOR IS ALLOWED TO SEE. A raw error carries stack frames, our
 * host names and sometimes the URL with its query string -- none of which is
 * theirs to read, and none of which tells them what to do. This maps the causes
 * we actually produce onto sentences a person can act on, and everything else
 * onto one that blames nobody.
 */
function creatorSafeReason(e: unknown): string {
  const raw = (e instanceof Error ? e.message : String(e)).toLowerCase()
  if (raw.includes('https')) return 'That link has to start with https.'
  if (raw.includes('quota') || raw.includes('rate')) return 'Twin was busy when it tried. Try that link again in a few minutes.'
  if (raw.includes('timeout') || raw.includes('timed out')) return 'That page took too long to answer.'
  if (raw.includes('404') || raw.includes('not found')) return 'That page could not be found.'
  if (raw.includes('403') || raw.includes('forbidden') || raw.includes('401')) return 'That page would not let Twin read it.'
  // ⚖️ THE DEFAULT IS OURS, NOT THEIRS. An unrecognised failure is not evidence
  // the creator did anything wrong, and must never be worded as though it were.
  return 'Twin could not read that page. This is on our side — try again, or add the details yourself.'
}

async function extractProduct(job: Job): Promise<Record<string, unknown>> {
  const payload = (job.payload ?? {}) as Record<string, unknown>
  const entityId = typeof payload.entity_id === 'string' ? payload.entity_id : ''
  let url = typeof payload.url === 'string' ? payload.url.trim() : ''
  // ⚠️ EITHER SOURCE IS ENOUGH, AND THAT IS A CHANGE. This demanded a URL, so a
  // job carrying only photographs failed before it started — and plenty of
  // products have no page worth reading.
  const imagePaths = Array.isArray(payload.image_paths)
    ? payload.image_paths.filter((p): p is string => typeof p === 'string' && p.trim() !== '')
    : []
  // ⚖️ A THIRD WAY IN: no link, no photo, and the page asked Twin to search the
  // web for the product by name (productWebSearch.ts).
  const webSearchAsked = payload.web_search === true
  if (!entityId || (!url && imagePaths.length === 0 && !webSearchAsked)) {
    throw new Error('extract_product needs entity_id and either a url or image_paths')
  }
  // ⚠️ HTTPS ONLY. A creator-supplied URL is untrusted input, and this process
  // holds service-role credentials — `file://`, `http://` to a private address,
  // and anything else non-HTTPS are refused rather than fetched.
  if (url && !/^https:\/\//i.test(url)) throw new Error('extract_product needs an https URL')

  // The entity's own registered URL, so `sourceFor` can tell "this is the page
  // for the thing you registered" from "some page on the internet".
  // ⚠️ `owner_id` IS SELECTED FOR THE IMAGE READ, NOT FOR TIDINESS. Storage paths
  // are only honoured inside the owner's own folder, and without this the check
  // has nothing to compare against.
  const { data: entity } = await db.from('product_entities')
    .select('product_url, owner_id, name, creator_summary').eq('id', entityId).maybeSingle()
  const productUrl = (entity as { product_url?: string | null } | null)?.product_url ?? null
  const ownerId = (entity as { owner_id?: string | null } | null)?.owner_id ?? ''
  const existingName = (entity as { name?: string | null } | null)?.name ?? null
  const creatorSummary = (entity as { creator_summary?: string | null } | null)?.creator_summary ?? null

  // ── HER PRODUCT, FOUND ON HER OWN SHOP ──────────────────────────────────
  //
  // ⚠️ A HOMEPAGE LINK READ AS A PRODUCT PAGE IS HOW THE BANDANA GOT THE BRAND'S
  // STORY AND THREE OTHER PRODUCTS' PRICES. When the link is the shop's front
  // (or it had no link and was sent with her brand's website), look the product up BY
  // NAME on that shop and read its own page instead. See shopProductLookup.ts.
  // ⚖️ ONLY WHEN SHE NAMED IT, and a weak match is refused — reading the wrong
  // product confidently is worse than the old behaviour.
  // A product with no link of its own is sent here with its BRAND's website
  // (Product Library, "Find it on …"), which is a shop front by definition.
  // ⚖️ WHAT EACH LOOKUP SAW, KEPT ON THE JOB'S OWN RESULT. Worker logs are not
  // reachable from where misses get diagnosed; `jobs.result` is (2026-09-23).
  const lookup: Record<string, unknown> = {}
  let candidates: Array<{ title: string; url: string }> = []
  const shopBase = isShopFront(url) ? url : ''
  const shopProduct = shopBase && existingName
    ? await findShopProduct(shopBase, existingName, fetchShopJson, (closest) => {
      lookup.shop = { matched: false, closest: closest.map((c) => c.title) }
      candidates = closest
      console.log(JSON.stringify({ event: 'product_not_found_on_shop', entity_id: entityId, shop: shopBase, closest }))
    }).catch((e) => { lookup.shop = { error: String(e).slice(0, 160) }; return null })
    : null
  if (shopBase && existingName && !lookup.shop) lookup.shop = { matched: !!shopProduct, url: shopProduct?.url ?? null }
  if (shopProduct) {
    url = shopProduct.url
    // Her link now points at the product itself, so the card and every later
    // read use the right page. Recorded, never silent: logged below.
    await db.from('product_entities').update({ product_url: shopProduct.url }).eq('id', entityId)
    console.log(JSON.stringify({ event: 'product_found_on_shop', entity_id: entityId, url: shopProduct.url,
      variants: shopProduct.variants.length }))
  }

  // ── HER PRODUCT, FOUND ON THE WIDER WEB ─────────────────────────────────
  //
  // ⚖️ ONLY WHEN THERE IS NOTHING BETTER: no link of its own and no photo, or
  // her brand's shop was searched and did not have it. A grounded Google search
  // proposes a page; productWebSearch.ts refuses any URL Google did not
  // actually retrieve and any page whose title lacks a word of her name.
  // ⚠️ NEVER THROWS INTO THE JOB. Quota, timeout, a bad answer — every failure
  // leaves the old path (her own sentence, or the shop's front page) in place.
  let webMatch: WebProductMatch | null = null
  const shopMissed = shopBase !== '' && !shopProduct
  if (existingName && imagePaths.length === 0 && ((!url && webSearchAsked) || shopMissed)) {
    webMatch = await searchWebForProduct(entityId, existingName, lookup)
    if (webMatch) {
      url = webMatch.url
      await db.from('product_entities').update({ product_url: webMatch.url }).eq('id', entityId)
    }
  }

  // ⚖️ NO EXACT MATCH: KEEP THE CLOSEST SHOP PRODUCTS FOR HER TO PICK FROM.
  // Measured 2026-09-23: her name ("Reversible Scrunchie Bandana") is a kind of
  // product; the shop names each by its print. Refusing to guess was right;
  // leaving her with nothing was not. Any match clears the list.
  const found = !!shopProduct || !!webMatch
  if (found || candidates.length > 0) {
    await db.from('product_entities').update({
      lookup_candidates: found ? null : { source: 'shop', at: new Date().toISOString(), items: candidates },
    }).eq('id', entityId)
  }

  // (A web match was already read once to check its title; reading it again
  // here keeps one path for every page, including its schema.org prices.)
  const text = url ? await fetchPageText(url) : null
  // ⚠️ THE UNREADABLE-PAGE BRANCH MUST NOT SWALLOW AN IMAGE-ONLY JOB. It writes
  // `knowledge: []` and returns, which for a creator who supplied photographs and
  // no link would read as "we looked at your photos and found nothing" — while
  // never having opened one.
  if ((!text || text.length < 80) && imagePaths.length === 0) {
    // ⚠️ AND THE CREATOR'S OWN SENTENCE IS THE FLOOR UNDER THAT FAILURE, WHERE
    // THEY GAVE ONE. `[]` used to be the honest end of the story — "we read it
    // and got nothing" — but a creator who answered "what is it and who is it
    // for?" on the add form gave us something usable even when the page did not
    // cooperate. It arrives with `source: 'user_confirmed'`, the same authority
    // a page never earns, because it is literally the creator speaking — the
    // exact provenance `readExtractedFact` cannot assign on its own, so it is
    // built by hand here.
    const fallback: ExtractedFact[] = creatorSummary
      ? [{
          field: 'description', value: creatorSummary, source: 'user_confirmed',
          sourceUrl: null, trust: 'usable', extractedAt: new Date().toISOString(),
        }]
      : []
    // ⚖️ AN UNREADABLE PAGE IS RECORDED AS EMPTY (OR AS THE FALLBACK), NOT LEFT
    // NULL. Null means "never extracted" and would show the creator "add a
    // link" for a link they already added; `[]` (or the fallback fact) means
    // "we read it and got nothing (of our own)", which is what happened and
    // what they need to know.
    await db.from('product_entities').update({
      knowledge: fallback,
      knowledge_extracted_at: new Date().toISOString(),
      knowledge_source_url: url,
      // ⚠️ CLEARED, BECAUSE THIS ATTEMPT DID NOT FAIL. A product that failed
      // once and then read fine would otherwise keep reporting a failure it has
      // already recovered from. Stale is not absent.
      knowledge_failed_at: null,
      knowledge_error: null,
    }).eq('id', entityId)
    return { extracted: fallback.length, reason: 'unreadable', lookup }
  }

  // ⚠️ A PAGE TWIN FOUND ITSELF IS `web_search`, WHATEVER KIND OF PAGE IT IS.
  // She never pointed at it, so all but its name waits for her "yes".
  const source: ExtractionSource = webMatch ? 'web_search' : sourceFor(url, shopProduct ? shopProduct.url : productUrl)
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
  // ── THE PHOTOGRAPHS, IF ANY ─────────────────────────────────────────────
  //
  // ⚠️ OWNER-PREFIXED OR NOT READ. Every storage reader in this tree refuses a
  // path outside the owner's own folder, and this is the one that would
  // otherwise hand another account's file to a model.
  //
  // ⚖️ A FAILED IMAGE IS SKIPPED, NOT FATAL. The creator may have supplied four
  // photos and a link; losing one to a transient storage error should cost that
  // photo, not the whole extraction they are waiting on.
  const images: InlineImage[] = []
  for (const path of imagePaths.slice(0, MAX_IMAGES)) {
    if (!path.startsWith(`${ownerId}/`)) {
      console.warn('extract_product: refusing a path outside the owner folder')
      continue
    }
    try {
      const dl = await db.storage.from('edits').download(path)
      if (dl.error || !dl.data) { console.warn('extract_product: image unreadable', path); continue }
      const buf = Buffer.from(await dl.data.arrayBuffer())
      images.push({ mimeType: mimeFor(path), data: buf.toString('base64') })
    } catch (e) {
      console.warn('extract_product: image failed', path, e instanceof Error ? e.message : e)
    }
  }

  // ⚖️ ONE CALL, BOTH SOURCES, AND THE PROMPT SAYS WHICH IS WHICH. A model given
  // a page and photographs with no distinction will happily attribute a price it
  // saw in a screenshot to the page it was told to read — and that fact would
  // carry the PAGE's provenance, which is the exact laundering this split exists
  // to prevent.
  const imageRule = images.length > 0
    ? `\n\nThe creator also supplied ${images.length} PHOTOGRAPH(S) of the product. From the images you may report ONLY: name, category, description, object_shape - what the thing IS and what it LOOKS LIKE. You must NOT report a price, plan, guarantee, benefit, claim or call to action from an image, even if you can read one in the picture. A number visible in a photograph is not a stated price.`
    : ''
  const out = await geminiJson(
    SYSTEM,
    `${url ? `PAGE (${url}):\n${text}` : 'No page was supplied; work from the photographs alone.'}${imageRule}`,
    SCHEMA, 60_000, undefined, modelForTask('extract'), images,
  ) as { facts?: Array<{ field?: string; value?: string }> }

  const now = new Date().toISOString()
  const facts: ExtractedFact[] = []
  // ⚖️ WHEN THERE IS NO PAGE, THE PROVENANCE IS THE PHOTOGRAPH. `sourceFor` reads
  // a URL, and with none it would degrade to `marketing_copy` — which is both
  // wrong and far too permissive here: marketing copy may state a price, and a
  // photograph may not.
  const factSource = (!url && images.length > 0) ? 'creator_image' : source
  // ⚠️ SITE BUTTONS ARE NOT SPOKEN CTAs, AND BARE MULTIPLE PRICES ARE NOT "THE"
  // PRICE. See pageFactHygiene.ts. A page whose only CTAs were cart buttons
  // stores no cta at all, which is the truth: it has no spoken one.
  const modelFacts = labelUnlabeledPrices(withoutSiteButtons(out?.facts ?? []).kept)
  for (const raw of modelFacts) {
    const field = String(raw?.field ?? '')
    // ⚠️ THE PROMPT ASKS AND THIS ENFORCES, AND THE DIFFERENCE IS THE WHOLE
    // POINT. A model told not to read a price off a photograph will mostly
    // comply; "mostly" is not a permission system. `imageFactAllowed` is the
    // decidable rule, applied to what actually came back.
    if (factSource === 'creator_image' && !imageFactAllowed(field as never)) {
      console.warn('extract_product: dropped an image-sourced', field)
      continue
    }
    const f = readExtractedFact({
      field: field as never,
      value: String(raw?.value ?? ''),
      source: factSource,
      // ⚖️ NO SOURCE URL FOR A PHOTOGRAPH. Writing the page's URL onto a fact
      // that came from an image is the laundering this split exists to stop —
      // and with no page there is no honest value to write.
      sourceUrl: factSource === 'creator_image' ? null : url,
      now,
    })
    if (f) facts.push(f)
  }

  // ⚖️ THE SHOP'S OWN DATA, NOT THE MODEL'S READING OF IT. Variant prices come
  // straight from the product's JSON, one line per option, so "€28 and €13" are
  // attached to the sizes they belong to rather than guessed off a listing.
  // Graded by the same classifier as every other fact: a price waits for her.
  if (shopProduct) {
    const seen = new Set(facts.map((f) => `${f.field}|${f.value}`))
    const add = (field: string, value: string) => {
      if (seen.has(`${field}|${value}`)) return
      const f = readExtractedFact({ field: field as never, value, source, sourceUrl: shopProduct.url, now })
      if (f) { facts.push(f); seen.add(`${field}|${value}`) }
    }
    if (shopProduct.description && !facts.some((f) => f.field === 'description')) add('description', shopProduct.description)
    for (const line of variantPriceLines(shopProduct)) add('price', line)
    for (const line of optionLines(shopProduct)) add('feature', `Options — ${line}`)
  } else if (url && (pagePrices.get(url)?.length ?? 0) > 0) {
    // ⚖️ ANY OTHER SHOP: the page's own schema.org product data (ldProductPrices.ts).
    // One product on the page or nothing, so a homepage never lends its prices.
    const seen = new Set(facts.map((f) => `${f.field}|${f.value}`))
    for (const line of pagePrices.get(url)!) {
      if (seen.has(`price|${line}`)) continue
      const f = readExtractedFact({ field: 'price' as never, value: line, source, sourceUrl: url, now })
      if (f) { facts.push(f); seen.add(`price|${line}`) }
    }
    console.log(JSON.stringify({ event: 'product_prices_from_page_data', entity_id: entityId, count: pagePrices.get(url)!.length }))
  }
  if (url) pagePrices.delete(url)

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

  // ⚠️ A NEW PAGE REPLACES WHAT THE OLD PAGE SAID. When the shop lookup moved
  // her link from the shop's front page to the product's own page, the front
  // page's facts (the brand's story, free shipping, other products' prices)
  // were merged in beside the product's and showed on the card as its own.
  // Only what she confirmed survives the move.
  const carried = (shopProduct || webMatch) && previous
    ? previous.filter((f) => f.source === 'user_confirmed' || f.sourceUrl === url)
    : previous
  const { knowledge, changes } = mergeExtraction(carried, facts)

  // ⚠️ THE PAGE'S OWN NAME NEVER REACHED `product_entities.name`, AND THAT WAS
  // THE GAP: a creator who trusted "Twin will read this from the page" and left
  // the add form's name field blank got a `name` FACT filed correctly into
  // `knowledge` and a NAME COLUMN that stayed null forever, so the detail
  // card's Name field kept showing its placeholder no matter how many times the
  // page was read.
  //
  // ⚖️ WRITTEN ONLY WHEN THE CREATOR NEVER TYPED ONE. `name` is theirs to set —
  // the add form and the card's own editable Name field both write it directly
  // — and an extraction that ran afterwards must never overwrite a name a
  // person chose on purpose. Absent or blank is the only case this may fill.
  const extractedName = facts.find((f) => f.field === 'name')?.value ?? null
  const nameUpdate = (existingName === null || existingName.trim() === '') && extractedName
    ? { name: extractedName }
    : {}

  const { error } = await db.from('product_entities').update({
    knowledge,
    knowledge_extracted_at: now,
    knowledge_source_url: url,
    // Same clearing as the unreadable path, for the same reason.
    knowledge_failed_at: null,
    knowledge_error: null,
    ...nameUpdate,
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
  return { extracted: knowledge.length, usable, changed: changes.length, conflicts: attention.length, lookup }
}

/** Run the grounded web search for a product, logging what happened. Returns
 *  null — and the caller keeps its old path — on every kind of failure. */
async function searchWebForProduct(entityId: string, name: string, lookup: Record<string, unknown> = {}): Promise<WebProductMatch | null> {
  try {
    let brandName: string | null = null
    const { data: row } = await db.from('product_entities').select('brand_id').eq('id', entityId).maybeSingle()
    const brandId = (row as { brand_id?: string | null } | null)?.brand_id ?? null
    if (brandId) {
      const { data: b } = await db.from('brands').select('name').eq('id', brandId).maybeSingle()
      brandName = (b as { name?: string | null } | null)?.name ?? null
    }
    const model = modelForTask('extract')
    const run = (m: string) => findProductOnWeb({
      productName: name,
      brandName,
      search: (system, prompt) => geminiGroundedSearch(system, prompt, m),
      fetchPage: (u) => fetchPageText(u),
    })
    let outcome = await run(model)
    // ⚠️ ZERO SOURCES MEANS THE SEARCH NEVER RAN (measured 2026-09-23), not that
    // the web had nothing. One retry on the model Google documents grounding for.
    const searchModel = modelForTask('search')
    if (!outcome.ok && outcome.sources === 0 && outcome.reason !== 'search_failed' && model !== searchModel) {
      outcome = await run(searchModel)
    }
    lookup.web = outcome.ok
      ? { matched: true, host: outcome.match.host, url: outcome.match.url }
      : { matched: false, reason: outcome.reason, detail: outcome.detail ?? null, sources: outcome.sources }
    if (outcome.ok) {
      console.log(JSON.stringify({ event: 'product_found_on_web', entity_id: entityId, host: outcome.match.host,
        confidence: outcome.match.confidence }))
      return outcome.match
    }
    console.log(JSON.stringify({ event: 'product_web_search_no_match', entity_id: entityId, reason: outcome.reason,
      detail: outcome.detail ?? null, sources: outcome.sources }))
    return null
  } catch (e) {
    lookup.web = { matched: false, reason: 'error', detail: (e instanceof Error ? e.message : String(e)).slice(0, 200) }
    console.log(JSON.stringify({ event: 'product_web_search_no_match', entity_id: entityId, reason: 'error',
      detail: (e instanceof Error ? e.message : String(e)).slice(0, 200) }))
    return null
  }
}
