// Craft + hook judges (craft rubric v1). Calibration fixtures are fictional creators.
// Weights were fitted on P5-P8 only (scripts/calibrate-judges.mjs); P10 is held out.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { scoreCraft, splitScriptText, bestOfNOn, pickByCraft, blueprintLines } from '../craftJudge'
import { scoreHook } from '../hookJudge'
import { parseCsv, spearman, within1 } from '../judgeStats'

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'calibration')
const scripts = parseCsv(readFileSync(join(DIR, 'craft-calibration-set.csv'), 'utf8'))
const hooks = parseCsv(readFileSync(join(DIR, 'hook-calibration-set.csv'), 'utf8'))
const TRAIN = new Set(['P5', 'P6', 'P7', 'P8'])

function craftMetrics(keep: (p: string) => boolean) {
  const rs = scripts.filter((r) => keep(r.panel!))
  const s = rs.map((r) => scoreCraft(splitScriptText(r.script_text!)))
  const g = rs.map((r) => Number(r.craft_1_7))
  return { n: rs.length, rho: spearman(s.map((x) => x.raw), g), w1: within1(s.map((x) => x.craft), g) }
}
function hookMetrics(keep: (p: string) => boolean) {
  const rs = hooks.filter((r) => keep(r.panel!))
  const s = rs.map((r) => scoreHook(r.hook!, { invented: r.invented === 'Y' }))
  const g = rs.map((r) => Number(r.scroll_1_5))
  return { n: rs.length, rho: spearman(s.map((x) => x.raw), g), w1: within1(s.map((x) => x.score), g) }
}

describe('calibration (fixtures load whole)', () => {
  it('109 scripts and 603 hooks', () => {
    expect(scripts).toHaveLength(109)
    expect(hooks).toHaveLength(603)
  })
  // Regression floors at the measured numbers. The craft Spearman target (0.6 on P10)
  // is NOT met by this deterministic judge; see the PR for the LLM-judge plan.
  it('craft: train P5-P8 and held-out P10', () => {
    const tr = craftMetrics((p) => TRAIN.has(p)), te = craftMetrics((p) => p === 'P10')
    expect(tr.n).toBe(85); expect(te.n).toBe(24)
    expect(tr.rho).toBeGreaterThan(0.7); expect(tr.w1).toBeGreaterThan(0.9)
    expect(te.rho).toBeGreaterThan(0.4); expect(te.w1).toBeGreaterThanOrEqual(0.8)
  })
  it('hook: train P5-P8 and held-out P10', () => {
    const tr = hookMetrics((p) => TRAIN.has(p)), te = hookMetrics((p) => p === 'P10')
    expect(tr.rho).toBeGreaterThan(0.5); expect(te.rho).toBeGreaterThan(0.45)
    expect(te.w1).toBeGreaterThan(0.95)
  })
})

describe('craft judge: criteria and caps', () => {
  const good = [
    'We kept answering the exact same customer email twice.',
    'When two people work out of one shared inbox, nobody knows who owns what, so replies sit in drafts.',
    'I built the first version of FlowDesk over a winter because my partner and I kept answering the same customer email twice.',
    'So I made a shared inbox that turns each email into a card on a board, with a 14-day free trial and no card needed.',
    'It is $12 per month for up to three teammates, and every email gets one owner before anyone types.',
    'FlowDesk: free 14-day trial, link in bio.',
  ]
  it('a structured, on-thread script outscores a short generic one', () => {
    const bad = ['Do you prefer pottery that feels smooth?', 'It forces you to slow down.', 'Comment below.']
    expect(scoreCraft(good).raw).toBeGreaterThan(scoreCraft(bad).raw)
    expect(scoreCraft(good).criteria.cta).toBe(1)
  })
  it('a spoken placeholder caps craft at 1', () => {
    const s = scoreCraft([...good.slice(0, 3), '[Your answer: What changed for you?]', good[5]!])
    expect(s.craft).toBe(1); expect(s.caps).toContain('placeholder')
  })
  it('a repeated sentence caps craft at 3', () => {
    const s = scoreCraft([good[0]!, good[2]!, good[3]!, good[4]!, 'I built the first version of FlowDesk over a winter because my partner and I kept answering the same email twice.', good[5]!])
    expect(s.caps).toContain('repeated_sentence'); expect(s.craft).toBeLessThanOrEqual(3)
  })
  it('invention is the caller\'s flag (not detectable offline) and caps at 3', () => {
    expect(scoreCraft(good, { invented: true }).craft).toBeLessThanOrEqual(3)
  })
  it('voice is neutral without context and moves only with it', () => {
    expect(scoreCraft(good).criteria.voice).toBe(0.5)
    expect(scoreCraft(good, { voice: { exclaims: true } }).criteria.voice).toBe(0)
  })
  it('hook judge orders story-first over bare spec and product-first', () => {
    expect(scoreHook('My first kiln load came out glued to the shelf.').raw).toBeGreaterThan(scoreHook('$28 for a 50 ml jar.').raw)
    expect(scoreHook('I threw out forty jars before I got the emulsion right.').raw).toBeGreaterThan(scoreHook('Brewing at home?').raw)
    expect(scoreHook('My first kiln load came out glued to the shelf.', { invented: true }).raw).toBeLessThan(scoreHook('My first kiln load came out glued to the shelf.').raw)
  })
})

describe('best-of-N helpers', () => {
  it('BEST_OF_N_JUDGE is off by default and only for test accounts', () => {
    expect(bestOfNOn(true, undefined)).toBe(false)
    expect(bestOfNOn(true, 'off')).toBe(false)
    expect(bestOfNOn(false, 'on')).toBe(false)
    expect(bestOfNOn(true, 'on')).toBe(true)
  })
  it('picks the higher-scoring blueprint; a tie keeps attempt 0', () => {
    const a = JSON.stringify({ script: [{ line: 'Comment below.' }] })
    const b = JSON.stringify({ script: [{ line: 'We kept answering the exact same customer email twice.' }, { line: 'I built FlowDesk over a winter because my partner and I kept answering the same email.' }, { line: 'It is $12 per month with a 14-day free trial.' }, { line: 'Link in bio.' }] })
    expect(blueprintLines(b)).toHaveLength(4)
    expect(pickByCraft([a, b]).chosen).toBe(1)
    expect(pickByCraft([b, a]).chosen).toBe(0)
    expect(pickByCraft([a, a]).chosen).toBe(0)
  })
})
