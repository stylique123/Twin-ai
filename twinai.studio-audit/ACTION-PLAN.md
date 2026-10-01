# twinai.studio — Action Plan

## Phase 1: Critical fixes (Week 1)
- [ ] Fix JSON-LD offers in `apps/web/index.html` to match `packages/shared/src/brand.ts` (Free $0, Creator $9, Pro $25, Studio $49, Agency $99). Better: generate from `PLANS` at build time so they can't drift.
- [ ] Stop soft-404s: return a real 404 for unknown paths (or prerender a 404 page).
- [ ] Add `noindex` (header or meta) to `/auth`, `/r/*`, `/review/*`, `/join/*`, `/onboarding` and all signed-in routes; remove `/auth` from the sitemap.

## Phase 2: High-impact (Weeks 2-3)
- [ ] Prerender/SSG the marketing routes so crawlers (including AI bots) get the H1, FAQ and pricing in HTML.
- [ ] Add per-route `<title>`, description and canonical (react-helmet-async or equivalent).
- [ ] Compress the landing videos (<2 MB each), add `poster`, `preload="none"` below the fold. Re-measure LCP.
- [ ] Tighten title (<60 chars) and meta description (~150 chars).

## Phase 3: Content and authority (Month 2)
- [ ] Standalone indexable pages: /pricing, /faq, /for-agencies, /how-it-works, plus use-case pages (talking head, GRWM, podcast clip) and "vs clippers".
- [ ] Add a descriptive subhead/H2 carrying the primary keyword ("AI script generator for short-form video").
- [ ] Add `Organization` schema with `sameAs`; consider `FAQPage` for answer engines.
- [ ] Add `apple-touch-icon`; optionally `llms.txt`.

## Phase 4: Monitoring (Ongoing)
- [ ] Re-run this audit against the live site once `twinai.studio` is reachable (CWV, headers, indexation).
- [ ] Connect Search Console; track indexation of new pages.
- [ ] Baseline with `/seo-drift` after Phase 2 ships.
