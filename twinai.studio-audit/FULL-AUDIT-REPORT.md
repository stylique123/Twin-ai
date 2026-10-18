# twinai.studio — SEO Audit (source-level)

**Scope and limits.** The live site was unreachable (network policy 403), so this is a static review of `apps/web` in this repo. Not measured: live HTTP headers and redirects, Core Web Vitals, indexation, rendered DOM, backlinks, SERP positions. Scores below are source-based estimates, not measurements.

**Business type:** SaaS (AI creator tool). Client-rendered React/Vite SPA on Vercel.

## SEO Health Score (source-based): ~58 / 100

| Category | Weight | Score | Note |
|---|---|---|---|
| Technical SEO | 22% | 52 | SPA with a single shell; one indexable page |
| Content Quality | 23% | 55 | Strong copy, but all JS-rendered, one URL |
| On-Page SEO | 20% | 68 | Good title/meta/canonical/OG; weak H1 keyword signal |
| Schema | 10% | 45 | JSON-LD present but prices are stale and wrong |
| Performance | 10% | 50 (unmeasured) | ~14 MB of autoplay MP4s, no poster/preload control |
| AI Search Readiness | 10% | 55 | No llms.txt; content only visible after JS |
| Images | 5% | 70 | One 1200x630 OG image; nothing else to audit |

## Critical / High findings

1. **[High] Structured data prices contradict the product.** `apps/web/index.html` JSON-LD lists Free $0, "Aspiring" $16, "Professional" $31, "Agency" $109. The source of truth (`packages/shared/src/brand.ts`) is Free $0, Creator $9, Pro $25, Studio $49, Agency $99. Wrong or mismatched offer data can disqualify rich results and misleads answer engines that quote it. The plan names don't exist anywhere in the product either.
2. **[High] The entire public site is one URL.** `sitemap.xml` has `/` and `/auth`. Pricing, FAQ, How it works and For agencies are `#` anchors on the homepage, so none can rank on its own query. No pages exist for use cases (talking head, GRWM, podcast clip), comparisons (vs clippers), or the agency offer.
3. **[High] Everything is client-rendered.** `index.html` has an empty `<div id="root">`. Googlebot renders JS, but most AI crawlers (GPTBot, ClaudeBot, PerplexityBot) don't, so they see only the title, meta and JSON-LD. The H1, FAQ and pricing are invisible to them. Fix with prerendering or SSG for marketing routes (e.g. `vite-plugin-prerender`, or moving `/` to Next/Astro).
4. **[High] SPA catch-all returns 200 for every URL.** `vercel.json` rewrites `/(.*)` to `/index.html`, and unknown routes `Navigate` to `/` client-side. Every junk URL is a 200 duplicate of the homepage (soft-404). Serve real 404s for unknown paths, or at least keep the canonical correct.

## Medium

5. **Per-route head is not managed.** One static title, description and canonical for all routes; no head library found. `/auth`, `/r/:token`, `/review/:token` and `/join/:token` all serve the homepage canonical and title. Add per-route titles, and `noindex` on token and auth pages.
6. **robots.txt gaps.** It disallows `/app, /v2, /dashboard, /settings, /billing, /admin, /metrics` but not `/r/`, `/review/`, `/join/`, `/onboarding`, `/brands`, `/brain`, `/gallery`, `/history`, `/calendar`, `/result`, `/record`, `/products`, `/edit`, `/internal`. Blocking in robots.txt also prevents crawlers from seeing a `noindex`, so use `noindex` via header or meta on the private routes rather than relying on Disallow. Add `X-Robots-Tag: noindex` headers in `vercel.json` for them.
7. **Sitemap lists `/auth`** (a login page with no search value) and omits `lastmod`. Remove `/auth`; `changefreq` and `priority` are ignored by Google.
8. **H1 has no keyword signal.** "Steal the format. Keep your voice." is brand-strong but says nothing about the product. The supporting line carries "script", "teleprompter", "shot list" but isn't a heading. Add a descriptive H2 or subhead like "AI script generator for short-form video".
9. **~14 MB of autoplay video on the landing page** (`reel-creator.mp4` is 11.9 MB, `hero-talkinghead.mp4` 2.3 MB). `reel-creator.mp4` is used for two cards, and `hero-talkinghead.mp4` for two. No `poster`, no `preload="none"` on below-fold videos. This is a likely LCP and bandwidth problem on mobile. Compress, add posters, lazy-load below the fold.
10. **Title and meta lengths.** Title is ~64 chars and may truncate; description is ~290 chars (Google shows ~155). Tighten both. `meta keywords` is ignored and can be dropped.
11. **Hash-anchor footer links** (`/#pricing`) are fine for UX, but crawlers treat them as the homepage; see #2.

## Low / Info

12. OG and Twitter tags are complete and correct (1200x630 PNG, alt text, absolute URLs). Good.
13. Security headers in `vercel.json` are solid (HSTS preload, nosniff, frame-ancestors). `X-Frame-Options: DENY` plus CSP `frame-ancestors` is redundant but harmless.
14. Favicon is an inline SVG data-URI only. Add `apple-touch-icon` and a PNG/ICO fallback.
15. Fonts load from Google Fonts with `display=swap` and preconnect. Fine. Consider self-hosting to remove a third-party round trip.
16. No `llms.txt`. It's optional and Google ignores it, but cheap to add.
17. `SoftwareApplication` schema lacks `aggregateRating`/`review` (don't fabricate). The FAQ content exists in the DOM but has no `FAQPage` markup; note Google now limits FAQ rich results, so this is mainly useful for AI answer engines.
18. Missing `Organization` schema with `sameAs` links, which helps brand-entity recognition.

## What works

- Correct canonical, `lang`, viewport, robots meta (`max-image-preview:large`).
- Honest copy: the title and meta state what ships today vs "being rebuilt", which avoids misleading search snippets.
- Sitemap and robots.txt exist and reference each other.
- Strong security headers; immutable caching on `/assets/`.
- Hero H1 is a real `<h1>` (single H1 on the page), and heading hierarchy is sane.

## Verification still needed once the site is reachable

Rendered-DOM check, real response codes for junk URLs, Core Web Vitals (CrUX/PageSpeed), Search Console indexation, and header verification. Allow `twinai.studio` in the environment's network settings and rerun `/seo-audit twinai.studio` to confirm.
