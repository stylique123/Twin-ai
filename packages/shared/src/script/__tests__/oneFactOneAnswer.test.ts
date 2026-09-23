// Items 35, 39, 40, 41 — asks, the "why it works" retention panel, and the
// hook-remainder scene. Fixture shapes come from production generation
// 8ce1290d (2026-09-22): three beats carrying one identical product ask.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { askGroupKey, askPeers, productAskCopy, askContext } from '../beatAsk'
import { syncRetentionMapToScript } from '../retentionMapSync'
import { discoveryQuestions } from '../../generationReadiness'
import { buildRecordingScript } from '../../recordingScriptAdapter'

const OLD = 'This beat needs a real detail about your product, and nothing about it was supplied. What does it actually do here?'

describe('item 40: one missing fact, one answer', () => {
  it('groups identical legacy asks, so one answer fills all three', () => {
    const script = [
      { section: 'Hook', ask: OLD },
      { section: 'Setup', line: 'x' },
      { section: 'Re-hook', ask: OLD },
      { section: 'Summary', ask: OLD },
    ]
    expect(askPeers(script, 0)).toEqual([2, 3])
  })
  it('groups by the missing fact even when the copy differs per beat', () => {
    const script = [
      { ask: 'A?', ask_fact: 'product_function' },
      { ask: 'B?', ask_fact: 'product_function' },
      { ask: 'C?', ask_fact: 'product_accuracy' },
    ]
    expect(askPeers(script, 0)).toEqual([1])
    expect(askGroupKey(script[2])).toBe('fact:product_accuracy')
  })
  it('never overwrites a beat that was already answered', () => {
    expect(askPeers([{ ask: OLD }, { ask: OLD, ask_state: 'answered' }], 0)).toEqual([])
  })
})

describe('item 41: an ask a first-time creator can answer', () => {
  it('names the product and gives an example, and keeps the authorship marker', () => {
    const c = productAskCopy('product_function', 'Reversible Scrunchie Bandana')
    expect(c.ask).toContain('Reversible Scrunchie Bandana')
    expect(c.ask.length).toBeLessThanOrEqual(160)
    expect(c.example).toMatch(/^e\.g\. "/)
    expect(discoveryQuestions([c.ask])).toEqual([0])
    expect(discoveryQuestions([productAskCopy('product_accuracy', 'Bandana').ask])).toEqual([0])
  })
  it('shows what the beat is doing', () => {
    expect(askContext({ section: 'Re-hook', action_posing: 'Stretch the elastic opening with both hands.' }))
      .toBe('Re-hook beat — on screen: Stretch the elastic opening with both hands.')
  })
})

describe('item 39: beat-type specific, never repeated, "why it works"', () => {
  it('gives structurally different middle beats different, type-specific goals', () => {
    const beats = ['Hook', 'Setup', 'Product Reveal', 'Detail Breakdown', 'Re-hook', 'Durability Proof',
      'Double Outfit Benefit', 'Detail Close-up', 'Summary', 'Call to Action']
      .map((section) => ({ section, line: 'Words here.' }))
    const goals = syncRetentionMapToScript([], beats).retentionMap.map((r) => String(r.goal))
    expect(new Set(goals).size).toBe(goals.length)
    expect(goals[5]).toMatch(/Show it|Back the promise/)
    expect(goals[2]).toMatch(/on screen|Name what you are showing/)
    expect(goals[0]).toMatch(/Earn the next three seconds/)
    expect(goals[9]).toMatch(/Land the ask/)
  })
})

describe('wiring: the edge and the answer endpoint use these rules', () => {
  const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..')
  const read = (p: string) => readFileSync(join(REPO, p), 'utf8')
  it('answer-beat-ask fills peers from one answer and returns them', () => {
    const src = read('supabase/functions/answer-beat-ask/index.ts')
    expect(src).toMatch(/askPeers\(script, beatIndex as number\)/)
    expect(src).toMatch(/also: peerLines/)
  })
  it('generate-blueprint keys product asks by fact, gates stories, and runs the integrity pass', () => {
    const src = read('supabase/functions/generate-blueprint/index.ts')
    expect(src).toMatch(/productAskCopy\(askFact,/)
    expect(src).toMatch(/\.ask_fact = askFact/)
    expect(src).toMatch(/const storyGate = gateStories\(/)
    expect(src).toMatch(/from\('creator_knowledge_uses'\)/)
    expect(src).toMatch(/repairScriptIntegrity\(bpAny\.script/)
    expect(src).toMatch(/NEVER INVENT A NAME/)
    // The pass runs before the syncs that read the script.
    expect(src.indexOf('repairScriptIntegrity(bpAny.script')).toBeLessThan(src.indexOf('syncRetentionMapToScript('))
  })
  it('generate-blueprint tags story sources before the pass and re-validates the one extension pass', () => {
    const src = read('supabase/functions/generate-blueprint/index.ts')
    const tag = src.indexOf('bpAny.script = tagStorySources(')
    const pass = src.indexOf('repairScriptIntegrity(bpAny.script')
    const decide = src.indexOf('shouldExtendScript(integrity.beats')
    const accept = src.indexOf('acceptExtension(integrity.beats')
    expect(tag).toBeGreaterThan(0)
    expect(tag).toBeLessThan(pass)
    expect(pass).toBeLessThan(decide)
    expect(decide).toBeLessThan(accept)
    expect(src.slice(decide, accept)).toMatch(/buildExtensionPrompt\(/)
    expect(src).toMatch(/event: 'script_length_extended'/)
    expect(accept).toBeLessThan(src.indexOf('syncRetentionMapToScript('))
  })
})

describe('item 35: the hook remainder can never be a fragment of a later scene', () => {
  const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..')
  it('the adapter refuses a remainder a later beat already says (source anchor)', () => {
    const src = readFileSync(join(REPO, 'packages/shared/src/recordingScriptAdapter.ts'), 'utf8')
    expect(src).toMatch(/saidLater/)
    expect(src).toMatch(/rest !== '' && whole && !saidLater/)
  })
  it('does not emit a scene that repeats words from a later beat', () => {
    const bp = {
      script: [
        { section: 'Hook', line: 'Cheap snaps cost me money. People think fabric is the expensive part.' },
        { section: 'Setup', line: 'People think fabric is the expensive part. It is the hardware.' },
        { section: 'CTA', line: 'Tag us in your photo of your dog wearing one.' },
      ],
      hook_options: ['Cheap snaps cost me money.'],
    }
    const rs = buildRecordingScript({ generationId: 'g', blueprint: bp } as unknown as Parameters<typeof buildRecordingScript>[0])
    const lines = rs.scenes.map((s) => s.dialogue ?? '')
    const dupes = lines.filter((l) => l === 'People think fabric is the expensive part.')
    expect(dupes).toHaveLength(0)
  })
})
