// DISCONNECT TEST, ledger row 27: the Reddit off switch (#1283). NICHE_REDDIT_ENABLED
// (on only when exactly 'true'). With it off, runNicheReddit returns before any
// read, model call or Apify run; with it on, it reads the due niches and runs.
// Every dependency is mocked: no database, no model, no Apify (nothing paid). Fictional niche only.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const calls = vi.hoisted(() => ({ from: [] as string[], gemini: 0, apify: 0, upserts: 0 }))

vi.mock('../db.js', () => {
  const chain = (table: string) => {
    const rows = table === 'niche_research' ? [{ niche_key: 'home-pottery', sub_niche: 'home pottery', niche: 'crafts' }] : []
    const q = {
      select: () => q,
      limit: async () => ({ data: rows, error: null }),
      upsert: async () => { calls.upserts++; return { error: null } },
    }
    return q
  }
  return { db: { from: (t: string) => { calls.from.push(t); return chain(t) } } }
})
vi.mock('../env.js', () => ({ env: { apifyToken: 'fake-token', apifyRedditActor: 'fake-actor' } }))
vi.mock('../gemini.js', () => ({ geminiJson: async () => { calls.gemini++; return { subreddits: [] } } }))
vi.mock('../modelRouting.js', () => ({ modelForTask: () => 'fake-model' }))
vi.mock('../media.js', () => ({ apifyDataset: async () => { calls.apify++; return [] } }))

const prev = process.env.NICHE_REDDIT_ENABLED
beforeEach(() => { calls.from = []; calls.gemini = 0; calls.apify = 0; calls.upserts = 0; vi.resetModules() })
afterEach(() => { if (prev === undefined) delete process.env.NICHE_REDDIT_ENABLED; else process.env.NICHE_REDDIT_ENABLED = prev })

async function runWith(flag: string | undefined) {
  if (flag === undefined) delete process.env.NICHE_REDDIT_ENABLED
  else process.env.NICHE_REDDIT_ENABLED = flag
  const { runNicheReddit } = await import('../nicheBrain/nicheReddit.js')
  const logs: string[] = []
  await runNicheReddit((_l, msg) => { logs.push(msg) })
  return { from: [...calls.from], gemini: calls.gemini, apify: calls.apify, upserts: calls.upserts, logs }
}

describe('NICHE_REDDIT_ENABLED disconnect', () => {
  it('off (unset or not exactly true): nothing is read, called or written', async () => {
    for (const f of [undefined, '', 'false', '1']) {
      const r = await runWith(f)
      expect(r, String(f)).toEqual({ from: [], gemini: 0, apify: 0, upserts: 0, logs: [] })
    }
  })
  it('on: the due niche is read, the (fake) model and Apify run, and the result is stamped', async () => {
    const on = await runWith('true')
    expect(on.from).toContain('niche_research')
    expect(on.gemini).toBeGreaterThan(0)
    expect(on.apify).toBe(1)
    expect(on.upserts).toBe(1)
    expect(on.logs).toContain('niche_reddit')
  })
  it('the sweep still calls it', () => {
    const sweep = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'nicheBrain', 'sweep.ts'), 'utf8')
    expect(sweep).toContain("await step('niche_reddit', runNicheReddit)")
  })
})
