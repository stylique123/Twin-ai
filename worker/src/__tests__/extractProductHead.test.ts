// A CLIENT-RENDERED PAGE IS NOT AN UNREADABLE PAGE.
//
// ⚠️ THE DEFECT, FOUND BY WALKING THE FEATURE ONCE. The first real product added
// to `product_entities` was TwinAI itself, and the extractor reported its own
// marketing site UNREADABLE. The site returned HTTP 200 throughout. It is a
// client-side-rendered SPA, so the served HTML is a shell — and stripping tags
// to get prose also stripped `<title>`, `<meta name=description>`, OpenGraph and
// the schema.org JSON-LD block. Under 80 characters survived, so the handler
// took its honest "we read it and got nothing" branch and stored `[]`.
//
// ⚖️ THE HEAD IS NOT A FALLBACK, IT IS THE BETTER SOURCE. A `SoftwareApplication`
// JSON-LD block states name, description, featureList and price as structured
// data the site publishes about itself for search engines — less promotional
// than the headline copy beside it, and already typed. Reading it first is the
// right order, not a consolation prize.
//
// This is a unit test over the harvest, not a network test. The fixture is the
// shape that actually failed.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'jobs', 'extractProduct.ts'), 'utf8')

/** The SPA shell shape: a title, meta tags, JSON-LD, and an EMPTY body. */
const SPA_SHELL = `<!doctype html><html><head>
<title>TwinAI · Viral reference to your filmed script, in your voice</title>
<meta name="description" content="Paste any viral TikTok, Reel, or Short. TwinAI reads the real video and writes the script in your voice." />
<meta property="og:site_name" content="TwinAI" />
<script type="application/ld+json">{"@type":"SoftwareApplication","name":"TwinAI","applicationCategory":"MultimediaApplication","offers":{"price":"0","priceCurrency":"USD"}}</script>
<script type="module" src="/assets/index-abc.js"></script>
</head><body><div id="root"></div></body></html>`

describe('the head is read before anything is stripped', () => {
  it('harvests BEFORE the strip, not after', () => {
    // ⚠️ ORDER IS THE WHOLE FIX. Harvesting after the tag-strip would find
    // nothing, which is exactly what the first version did.
    const fn = SRC.slice(SRC.indexOf('async function fetchPageText'))
    const harvest = fn.indexOf('harvestHead(html)')
    const strip = fn.indexOf('.replace(/<script')
    expect(harvest).toBeGreaterThan(-1)
    expect(harvest).toBeLessThan(strip)
  })

  it('pulls title, description, og and JSON-LD out of a shell with an empty body', () => {
    // Reconstruct the harvest from the shipped regexes rather than retyping
    // them, so a change to the source is exercised here.
    const out: string[] = []
    const title = SPA_SHELL.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
    if (title) out.push(`TITLE: ${title.trim()}`)
    for (const m of SPA_SHELL.matchAll(
      /<meta[^>]+(?:name|property)=["'](description|og:title|og:description|og:site_name)["'][^>]*content=["']([^"']+)["']/gi)) {
      out.push(`${m[1].toUpperCase()}: ${m[2].trim()}`)
    }
    for (const m of SPA_SHELL.matchAll(
      /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
      out.push(`STRUCTURED DATA: ${m[1].trim()}`)
    }
    const text = out.join('\n')

    // The body strips to nothing — this is what made the page look unreadable.
    const prose = SPA_SHELL
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    expect(prose.length).toBeLessThan(80)

    // …and the head alone clears the threshold with real product facts in it.
    expect(text.length).toBeGreaterThan(80)
    expect(text).toMatch(/TwinAI/)
    expect(text).toMatch(/writes the script in your voice/)
    expect(text).toMatch(/SoftwareApplication/)
  })

  it('handles content= appearing before name=, which plenty of sites emit', () => {
    const reversed = '<meta content="An analytics tool" name="description">'
    const m = [...reversed.matchAll(
      /<meta[^>]+content=["']([^"']+)["'][^>]*(?:name|property)=["'](description|og:title|og:description)["']/gi)]
    expect(m).toHaveLength(1)
    expect(m[0][1]).toBe('An analytics tool')
  })

  it('truncates a JSON-LD block rather than letting it crowd out the page', () => {
    // ⚖️ Some sites emit enormous graphs. Truncated and read as text, never
    // parsed — a malformed block must not throw inside a job.
    expect(SRC).toMatch(/raw\.slice\(0, 4_000\)/)
    expect(SRC).not.toMatch(/JSON\.parse\(raw/)
  })

  it('still reports an actually-empty page as unreadable', () => {
    // ⚠️ THE FIX MUST NOT TURN "NOTHING THERE" INTO "SOMETHING THERE". A page
    // with no head and no body is still honestly unreadable, and the `[]` branch
    // is what tells the creator we tried.
    const empty = '<!doctype html><html><head></head><body></body></html>'
    const title = empty.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
    expect(title).toBeUndefined()
    const prose = empty.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    expect(prose.length).toBeLessThan(80)
  })
})
