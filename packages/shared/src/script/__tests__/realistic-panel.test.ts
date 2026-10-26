import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  resolveCostMode, planProductPageRead, afterFailedPageRead, isMarketplaceHost, NEVER_SPOKEN_UNCONFIRMED,
  usablePainMap, painEntryProblems, painUseAllowed, painItemsForQuestions, painMapPromptBlock, redditScanV2Allowed,
  pearson, spearman, personaMayInfluence, selectWithPersonas, personaMetadata, PERSONA_MIN_CORRELATION,
  ExtrasLedger, estimatePanelBudget, budgetGate, costByCallerAndModel, EXTRAS, type AccountKind,
} from '../realisticPanel.ts'
import { readExtractedFact, usableFacts } from '../../productExtraction.ts'

// Plan v6.8 §34. Everything here is FICTIONAL: example.com links, made-up topics.
const ROOT = new URL('../../../../../', import.meta.url)
const fictionalPain = JSON.parse(readFileSync(new URL('scripts/ops/fixtures/fictional-pain-map.json', ROOT), 'utf8'))
const storedCalibration = JSON.parse(readFileSync(new URL('scripts/ops/fixtures/persona-calibration.json', ROOT), 'utf8'))
const TODAY = '2026-10-26'
const full = resolveCostMode({ account: 'panel', requested: 'full' })
const entry = (o: Record<string, unknown> = {}) => ({ topic: 'a made-up topic', thread_count: 5, community_count: 2, links: ['https://example.com/fictional/x'], first_seen: '2026-09-01', last_checked: '2026-10-01', ...o })

describe('REAL CREATORS ARE UNAFFECTED (every new path refuses for a real account)', () => {
  const real = resolveCostMode({ account: 'real', requested: 'full', flags: { personas: 'on' } })
  it('cost mode: a real creator stays on the live flow with every extra off, whatever the request asks', () => {
    expect(real).toEqual({ mode: 'live', applies: false, extras: Object.fromEntries(EXTRAS.map((e) => [e, false])) })
    for (const k of ['', 'unknown', 'Real', null] as unknown as AccountKind[]) expect(resolveCostMode({ account: k, requested: 'full' }).applies).toBe(false)
  })
  it('no page read, no pain map, no extra spend, no Reddit scan', () => {
    expect(planProductPageRead({ decision: real, url: 'https://shop.example.com/p/1', offline: false, hasSnapshot: true }).read).toBe(false)
    expect(usablePainMap(fictionalPain.maps[0], { decision: real, today: TODAY }).entries).toEqual([])
    const l = new ExtrasLedger(real)
    for (const e of EXTRAS) expect(l.charge(e, 0)).toBe(false)
    expect(redditScanV2Allowed({ account: 'real', ownerFlag: 'on' })).toEqual({ allowed: false, reason: 'real_creator_never' })
    expect(estimatePanelBudget({ decision: real, requests: 10, pageReads: 10, personas: 3 }).lines.map((x) => x.caller)).toEqual(['script'])
  })
})

describe('cost_mode full for test and panel accounts', () => {
  it('turns every extra on; one extra can be switched off by its own flag', () => {
    expect(full.mode).toBe('full')
    expect(Object.values(full.extras).every(Boolean)).toBe(true)
    const noPersonas = resolveCostMode({ account: 'test', requested: 'full', flags: { personas: 'off' } })
    expect(noPersonas.extras.personas).toBe(false)
    expect(noPersonas.extras.product_pages).toBe(true)
  })
  it('test and checkpoint keep the extras off; an unknown mode reads as test', () => {
    expect(Object.values(resolveCostMode({ account: 'panel', requested: 'test' }).extras).some(Boolean)).toBe(false)
    expect(resolveCostMode({ account: 'panel', requested: 'turbo' }).mode).toBe('test')
  })
})

describe('product and web-page extraction', () => {
  const plan = (url: string, o: Partial<{ offline: boolean; hasSnapshot: boolean; counselMarketplaceOk: boolean }> = {}) =>
    planProductPageRead({ decision: full, url, offline: o.offline ?? true, hasSnapshot: o.hasSnapshot ?? true, counselMarketplaceOk: o.counselMarketplaceOk })
  it('blocks marketplaces on every TLD and subdomain until counsel agrees', () => {
    for (const u of ['https://www.amazon.com/dp/X', 'https://amazon.co.uk/x', 'https://www.etsy.com/listing/1', 'https://ebay.de/itm/1', 'https://m.aliexpress.com/i/1']) {
      expect(plan(u).reason).toBe('marketplace_until_counsel')
    }
    expect(isMarketplaceHost('shop.example.com')).toBe(false)
    expect(plan('https://www.etsy.com/listing/1', { counselMarketplaceOk: true }).read).toBe(true)
  })
  it('reads PUBLIC https pages only', () => {
    expect(plan('http://shop.example.com/p').reason).toBe('not_https')
    expect(plan('https://192.168.0.4/p').reason).toBe('private_host')
    expect(plan('https://localhost/p').reason).toBe('private_host')
    expect(plan('https://user:pw@shop.example.com/p').reason).toBe('private_host')
    expect(plan('https://shop.example.com/account/orders').reason).toBe('private_path')
    expect(plan('https://shop.example.com/p?token=abc').reason).toBe('secret_in_url')
    expect(plan('not a url').reason).toBe('bad_url')
  })
  it('offline uses a saved snapshot; live goes through the policy-v2 Apify guard (#1320), never directly', () => {
    expect(plan('https://shop.example.com/p')).toMatchObject({ read: true, source: 'snapshot' })
    expect(plan('https://shop.example.com/p', { hasSnapshot: false })).toMatchObject({ read: false, reason: 'no_snapshot_offline' })
    expect(plan('https://shop.example.com/p', { hasSnapshot: false, offline: false })).toMatchObject({ read: true, source: 'apify_policy_v2' })
  })
  it('a failed or refused read NEVER falls back to a name search', () => {
    expect(afterFailedPageRead()).toEqual({ nameSearch: false, useExtracted: false })
    for (const u of ['https://amazon.com/x', 'http://x.example.com', 'https://shop.example.com/p']) expect(plan(u, { hasSnapshot: false }).nameSearchFallback).toBe(false)
  })
  it('unconfirmed numbers, testimonials and comparisons from a page are never usable (productExtraction is the authority)', () => {
    const facts = [
      readExtractedFact({ field: 'testimonial', value: 'A made-up buyer loved it', source: 'official_product_page' }),
      readExtractedFact({ field: 'comparison', value: 'Better than a made-up rival', source: 'official_product_page' }),
      readExtractedFact({ field: 'proof_number', value: 'Used by 50,000 made-up people', source: 'official_product_page' }),
      readExtractedFact({ field: 'feature', value: 'Saves 40% of your time', source: 'official_product_page' }),
      readExtractedFact({ field: 'name', value: 'Fictional Widget', source: 'official_product_page' }),
    ].filter((f): f is NonNullable<typeof f> => !!f)
    const usable = usableFacts(facts).map((f) => f.field)
    for (const f of NEVER_SPOKEN_UNCONFIRMED) expect(usable).not.toContain(f)
    expect(usable).not.toContain('feature') // a measured number in an ordinary field also waits
    expect(usable).toContain('name')
  })
})

describe('the pain-map path', () => {
  it('the fictional map is labelled FICTIONAL, links lead to example.com, and carries only topics/counts/links/dates', () => {
    expect(fictionalPain.fictional).toBe(true)
    expect(fictionalPain._note).toMatch(/FICTIONAL/)
    for (const m of fictionalPain.maps) {
      expect(m.fictional).toBe(true)
      for (const e of m.entries) {
        expect(Object.keys(e).sort()).toEqual(['community_count', 'first_seen', 'last_checked', 'links', 'thread_count', 'topic'])
        for (const l of e.links) expect(l).toMatch(/^https:\/\/example\.com\/fictional\//)
      }
    }
  })
  it('keeps entries with ≥5 threads from ≥2 communities, drops the rest (the coffee map has one thin entry)', () => {
    const coffee = fictionalPain.maps.find((m: { niche: string }) => m.niche === 'coffee')
    const u = usablePainMap(coffee, { decision: full, today: TODAY, niche: 'coffee' })
    expect(u.entries.length).toBe(3)
    expect(u.rejected).toBe(1)
    expect(u.reasons).toEqual({ too_few_threads: 1, too_few_communities: 1 })
    expect(u.fictional).toBe(true)
  })
  it('expires after 90 days', () => {
    expect(painEntryProblems(entry({ last_checked: '2026-07-28' }), TODAY)).toEqual([])
    expect(painEntryProblems(entry({ last_checked: '2026-07-27' }), TODAY)).toContain('expired')
  })
  it('refuses post text, quotes and usernames (no extra fields, no quoted or handle topics)', () => {
    expect(painEntryProblems(entry({ post_text: 'x' }), TODAY)).toContain('extra_field_post_text')
    expect(painEntryProblems(entry({ username: 'x' }), TODAY)).toContain('extra_field_username')
    expect(painEntryProblems(entry({ topic: '"my beans are stale"' }), TODAY)).toContain('topic_quoted')
    expect(painEntryProblems(entry({ topic: 'asked by u/someone' }), TODAY)).toContain('topic_username')
    expect(painEntryProblems(entry({ links: ['http://example.com/x'] }), TODAY)).toContain('link_not_https')
  })
  it('only hooks, questions and the reality check; never proof or her experience', () => {
    for (const u of ['hook', 'question', 'reality_check']) expect(painUseAllowed(u)).toBe(true)
    for (const u of ['proof', 'her_experience', 'quote', 'testimonial', 'statistic']) expect(painUseAllowed(u)).toBe(false)
    const u = usablePainMap(fictionalPain.maps[0], { decision: full, today: TODAY })
    const block = painMapPromptBlock(u)
    expect(block).toMatch(/NEVER as proof/)
    expect(block).not.toMatch(/https?:/)
    expect(painItemsForQuestions(u).every((i) => i.origin === 'audience_pain')).toBe(true)
  })
  it('is off outside full mode and for another niche', () => {
    expect(usablePainMap(fictionalPain.maps[0], { decision: resolveCostMode({ account: 'panel', requested: 'test' }), today: TODAY }).entries).toEqual([])
    expect(usablePainMap(fictionalPain.maps[0], { decision: full, today: TODAY, niche: 'skincare' }).entries).toEqual([])
  })
})

describe('automated Reddit scan v2 stays OFF', () => {
  it('refuses test and panel accounts until the owner flips the flag; refuses real creators always', () => {
    for (const account of ['test', 'panel'] as const) {
      for (const f of [undefined, '', 'off', '0', 'false', 'maybe']) expect(redditScanV2Allowed({ account, ownerFlag: f }).allowed).toBe(false)
      expect(redditScanV2Allowed({ account, ownerFlag: 'on' }).allowed).toBe(true)
    }
    for (const f of [undefined, 'on', '1', 'true']) expect(redditScanV2Allowed({ account: 'real', ownerFlag: f }).allowed).toBe(false)
  })
})

describe('practice viewers (personas): calibrated before they influence anything', () => {
  it('correlations are computed correctly', () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1)
    expect(pearson([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1)
    expect(pearson([1, 1, 1], [1, 2, 3])).toBeNull()
    expect(pearson([1, 2], [1, 2])).toBeNull()
    expect(spearman([1, 2, 3, 4], [1, 4, 9, 16])).toBeCloseTo(1)
  })
  it('needs r ≥ 0.5 on BOTH sets; unmeasured never influences', () => {
    expect(PERSONA_MIN_CORRELATION).toBe(0.5)
    expect(personaMayInfluence(null)).toBe(false)
    expect(personaMayInfluence({ persona: 'p', hook_r: 0.7, craft_r: null, measured_at: null })).toBe(false)
    expect(personaMayInfluence({ persona: 'p', hook_r: 0.49, craft_r: 0.9, measured_at: 'x' })).toBe(false)
    expect(personaMayInfluence({ persona: 'p', hook_r: 0.5, craft_r: 0.5, measured_at: 'x' })).toBe(true)
  })
  it('the stored calibration is UNRUN, so no persona influences selection today', () => {
    expect(storedCalibration.status).toBe('unrun')
    expect(storedCalibration.personas.length).toBeGreaterThan(0)
    for (const c of storedCalibration.personas) expect(personaMayInfluence(c)).toBe(false)
  })
  it('never overrides the honesty gate, and an uncalibrated persona changes nothing', () => {
    const cands = [
      { id: 'honest-low', honestyPassed: true, baseScore: 5, personaScores: { a: 1, b: 1 } },
      { id: 'honest-high', honestyPassed: true, baseScore: 6, personaScores: { a: 1, b: 9 } },
      { id: 'dishonest', honestyPassed: false, baseScore: 9, personaScores: { a: 100, b: 100 } },
    ]
    const calibrated = [{ persona: 'a', hook_r: 0.8, craft_r: 0.7, measured_at: 'x' }, { persona: 'b', hook_r: 0.2, craft_r: 0.9, measured_at: 'x' }]
    const r = selectWithPersonas(cands, calibrated)
    expect(r.blocked).toEqual(['dishonest'])
    expect(r.order).not.toContain('dishonest')
    expect(r.influencing).toEqual(['a'])
    expect(r.signalOnly).toEqual(['b'])
    expect(r.order).toEqual(['honest-high', 'honest-low']) // b's 9 ignored: base order kept
    const flip = selectWithPersonas([{ ...cands[0]!, personaScores: { a: 9 } }, { ...cands[1]!, personaScores: { a: 1 } }], calibrated, 0.3)
    expect(flip.order).toEqual(['honest-low', 'honest-high']) // a calibrated persona may reorder honest candidates
  })
  it('metadata for the judge pre-score and the blind package: numbers and labels only', () => {
    expect(personaMetadata({ a: 4, b: Number.NaN }, [{ persona: 'a', hook_r: 0.6, craft_r: 0.6, measured_at: 'x' }])).toEqual([{ persona: 'a', score: 4, calibrated: true }])
  })
})

describe('extras ledger and guardrails', () => {
  it('each extra has its own per-run cap and a counts-only report', () => {
    const l = new ExtrasLedger(full, { product_pages: 0.01, pain_map: 0, personas: 0.01, outside_knowledge: 0.01, audience_comments: 0.01, niche_notes: 0.01 })
    expect(l.charge('personas', 0.006)).toBe(true)
    expect(l.charge('personas', 0.006)).toBe(false)
    expect(l.charge('pain_map', 0)).toBe(true)
    const rep = l.report()
    expect(rep.personas).toEqual({ on: true, uses: 1, refused: 1, usd: 0.006, cap_usd: 0.01 })
    for (const v of Object.values(rep)) for (const x of Object.values(v)) expect(['number', 'boolean']).toContain(typeof x)
  })
  it('the per-panel budget is split Apify vs AI by caller and refused over the cap or with no cap', () => {
    const b = estimatePanelBudget({ decision: full, requests: 40, pageReads: 10, personas: 3 })
    expect(b.apify_usd).toBeCloseTo(0.02)
    expect(b.lines.map((x) => `${x.provider}:${x.caller}`)).toEqual(['gemini:script', 'apify:product_pages', 'gemini:product_pages', 'gemini:personas', 'gemini:outside_knowledge', 'gemini:audience_comments', 'gemini:niche_notes'])
    expect(budgetGate(b, 100).ok).toBe(true)
    expect(budgetGate(b, 0.5)).toEqual({ ok: false, reason: 'over_cap' })
    expect(budgetGate(b, undefined)).toEqual({ ok: false, reason: 'no_cap' })
  })
  it('the run report groups dollars by provider, caller and model and strips anything but labels', () => {
    const r = costByCallerAndModel([
      { provider: 'gemini', caller: 'writer', model: 'gemini-2.5-flash', usd: 0.01 },
      { provider: 'gemini', caller: 'writer', model: 'gemini-2.5-flash', usd: '0.02' },
      { provider: 'apify', caller: 'product_pages', model: 'cheap~actor', usd: 0.002 },
      { provider: 'gemini', caller: 'judge <b>x</b>', model: null, usd: 'n/a' },
    ])
    expect(r[0]).toEqual({ provider: 'gemini', caller: 'writer', model: 'gemini-2.5-flash', usd: 0.03, rows: 2 })
    expect(r.find((x) => x.provider === 'apify')?.model).toBe('cheapactor')
    expect(r.find((x) => x.caller.startsWith('judge'))).toMatchObject({ caller: 'judgebx/b', model: 'unknown', usd: 0 })
  })
})
