// CANARY OWNER WALK (Fast Path v1, Track B): onboarding -> first Create for a
// REAL (non-test) account that is the canary. Fictional data, no network: an
// in-memory table stands in for creator_knowledge / brand_voices, and every
// step runs the same pure functions the edge function and the web call.
// docs/release/owner-account-setup.md is the click-by-click version of this.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isCanaryAccount, trialSideDoorOpen } from '../canary'
import { pickAngles, type AngleMaterial } from '../angleFit'
import { planQuestionsForAngle, answerFactRow, angleMaterialUsable } from '../questionUsefulness'
import { ANGLE_SPECS } from '../angleFit'
import { itemFromCreatorKnowledge } from '../itemFormat'
import { CREATOR_QUESTIONS, answerToKnowledge } from '../../creatorQuestions'
import { sanitizeBriefForWrite, readStoredBrief } from '../../preScriptBrief'

const ROOT = join(__dirname, '..', '..', '..', '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

// Fictional ids. OWNER is a real (non-test) account named in CANARY_ACCOUNT_IDS.
const OWNER = '0b0e0000-0000-4000-8000-00000000c0de'
const STRANGER = '0b0e0000-0000-4000-8000-00000000beef'
const HEARTBEAT = '0b0e0000-0000-4000-8000-0000000000aa'
const PRODUCT = '0b0e0000-0000-4000-8000-0000000000bb'
const env = { CANARY_ACCOUNT_IDS: OWNER, CANARY_KILL: '', HEARTBEAT_USER_ID: HEARTBEAT }
const door = (userId: string, kill = env.CANARY_KILL) => trialSideDoorOpen({
  userId, heartbeatUserId: env.HEARTBEAT_USER_ID, isPanel: false, canaryAccountsRaw: env.CANARY_ACCOUNT_IDS, canaryKillRaw: kill,
})

describe('canary owner walk: onboarding -> first Create', () => {
  // In-memory rows (creator_knowledge, brand_voices.pre_script_brief).
  const knowledge: Array<Record<string, unknown>> = []
  let storedBrief: unknown = {}
  let n = 0
  const insert = (row: Record<string, unknown>) => { knowledge.push({ id: `k${++n}`, ...row }) }

  it('0. the canary switch: the owner is in, a stranger and a killed canary are not', () => {
    expect(isCanaryAccount(OWNER, env.CANARY_ACCOUNT_IDS, '')).toBe(true)
    expect(door(OWNER)).toBe(true)
    expect(door(STRANGER)).toBe(false)
    expect(door(OWNER, '1')).toBe(false)
    expect(door(HEARTBEAT)).toBe(true)
  })

  it('1. pillars are saved on the brief and read back', () => {
    storedBrief = sanitizeBriefForWrite({ contentPillars: ['Faceless shorts', 'Pricing a small app', ''] } as never)
    const back = readStoredBrief(storedBrief) as { contentPillars?: string[] }
    expect(back.contentPillars).toEqual(['Faceless shorts', 'Pricing a small app'])
  })

  it('2. stories from the story question are saved as his facts', () => {
    const lesson = CREATOR_QUESTIONS.find((q) => q.id === 'expensive_lesson')!
    for (const story of [
      'I spent three months building a feature nobody opened, so now I ship a fake button first.',
      'My first launch got eleven signups because I posted it at 2am my time.',
      'I rewrote the onboarding four times before I noticed people quit on the pricing page.',
    ]) {
      const r = answerToKnowledge(lesson, story)
      expect(r.ok).toBe(true)
      if (r.ok) insert({ owner_id: OWNER, ...r.row, creator_confirmed_at: '2026-10-26T10:00:00Z' })
    }
    expect(knowledge.filter((k) => k.owner_id === OWNER && k.kind === 'experience')).toHaveLength(3)
  })

  it('3. Create: three angle cards with an opening line and one Twin\'s pick', () => {
    const material: AngleMaterial[] = []
    for (const r of knowledge) {
      const it = itemFromCreatorKnowledge(r)
      if (it && angleMaterialUsable(r, it.status)) material.push({ id: it.id, slot: it.slot_hint, text: it.text, source: 'her_material' })
    }
    const cards = pickAngles({ goal: 'sell', hasProduct: true, material })
    expect(cards.length).toBeGreaterThanOrEqual(2)
    expect(cards.length).toBeLessThanOrEqual(3)
    expect(cards.filter((c) => c.twins_pick)).toHaveLength(1)
    expect(cards.some((c) => c.opening.text !== null)).toBe(true)
  })

  it('4. questions under the picked angle: at most 3, all skippable; answers become his facts and are read back', () => {
    const material = knowledge.map((r) => itemFromCreatorKnowledge(r)).filter(Boolean).map((it) => it!.slot_hint)
    const cards = pickAngles({ goal: 'sell', hasProduct: true, material: [] })
    const angle = cards[0].angle
    const qs = planQuestionsForAngle({ angle, angleNeeds: ANGLE_SPECS[angle].needs, onFile: [...new Set(material)], hasProduct: true, entityKey: `product:${PRODUCT}` })
    expect(qs.length).toBeLessThanOrEqual(3)
    for (const q of qs) expect(q.skippable).toBe(true)
    // angle_answer: a non-story answer (kind 'claim').
    const row = answerFactRow({ ownerId: OWNER, productId: PRODUCT, key: `mn:product:${PRODUCT}:proof`, piece: 'proof', answer: 'Forty two people paid in the first week.', now: '2026-10-26T10:20:00Z' })
    expect(row).not.toBeNull()
    expect(row!.owner_id).toBe(OWNER)
    expect(row!.creator_confirmed_at).toBeTruthy()
    insert({ ...row!, sensitive: false })
    // Read back by the next angle_plan: a typed, confirmed claim counts (was dropped as 'unconfirmed').
    const saved = knowledge[knowledge.length - 1]
    expect(angleMaterialUsable(saved, itemFromCreatorKnowledge(saved)!.status)).toBe(true)
    // A skip saves nothing.
    expect(answerFactRow({ ownerId: OWNER, key: 'mn:story', piece: 'story', answer: '', now: 'x' })).toBeNull()
    // A sensitive row never feeds.
    expect(angleMaterialUsable({ ...saved, sensitive: true }, 'confirmed')).toBe(false)
  })

  it('5. the server wiring: every trial side door and the main path let the canary in; credits are not keyed on the trial', () => {
    const src = read('supabase/functions/generate-blueprint/index.ts')
    for (const mode of ['voice_card', 'check_line', 'using_item', 'angle_plan']) {
      const at = src.indexOf(`if (specMode === '${mode}'`)
      expect(at, mode).toBeGreaterThan(0)
      expect(src.slice(at, at + 200), mode).toContain('sideDoorOpen()')
    }
    expect(src).toMatch(/const sideDoorOpen = \(\) => trialSideDoorOpen\(/)
    expect(src).toMatch(/let trialOn = isHeartbeat \|\| isCanary/)
    // Result fields the Create flow v4 screens read.
    expect(src).toMatch(/isCanary \? \{ canary: true \}/)
    expect(src).toMatch(/trialOn && checkLineOn\(Deno\.env\.get\('CHECK_LINE_KILL'\)\) \? \{ check_lines: true \}/)
    // Pillars are read from the brief on her voice row.
    expect(src).toMatch(/ncBrief\.contentPillars/)
    // Spend and refund are keyed on the panel / shadow run, never on trialOn.
    expect(src).toMatch(/const \{ error: spendErr \} = isPanel \?/)
    expect(src).not.toMatch(/trialOn[^\n]{0,40}spend_credits/)
  })

  it('6. the web screens: the canary sees the trial screens', () => {
    const gate = read('apps/web/src/components/ProductDetailsByKind.tsx')
    expect(gate).toMatch(/return canaryUser\(userId\)/)
    for (const f of ['CheckThisLine', 'GeneralVersionBanner', 'UsingList']) {
      expect(read(`apps/web/src/components/${f}.tsx`), f).toMatch(/trialUser\(userId\)/)
    }
    // The pillars question on onboarding is behind the same gate.
    expect(read('apps/web/src/pages/Onboarding.tsx')).toMatch(/trialUser\(trialId\) && \(/)
    // The angle card gets the picked product.
    expect(read('apps/web/src/pages/v2/V2Building.tsx')).toMatch(/<AngleQuestionsCard[\s\S]{0,200}productId=/)
  })
})
