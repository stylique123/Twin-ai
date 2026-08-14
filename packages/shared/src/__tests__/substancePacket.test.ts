// THE ARGUMENT A SCRIPT IS BUILT FROM, ASSEMBLED BEFORE ANY PROSE EXISTS.
//
// The writer is currently handed ten standalone facts and asked for an argument.
// It produces inventories: accurate, grounded at 73%, and still a list of true
// sentences in a row. This is the object that replaces the list.
import { describe, expect, it } from 'vitest'
import {
  PACKET_FIELDS, PACKET_SYSTEM, packetPrompt, packetPromptLine, packetShape,
} from '../substancePacket'

const full = {
  coreInsight: 'Virality is bought with nerve, not budget',
  nonObviousDistinction: 'Most founders think reach is a spend problem',
  concreteExample: 'Left £10,000 Birkin bags in London charity shops',
  usefulDetail: 'Sold one for £13,500 in 40 seconds off a single story',
  creatorPov: 'Being safe is the expensive option',
  payoff: 'Pick the move you would be embarrassed to explain',
  builtFrom: ['(experience) Sold a black Birkin bag for £13,500'],
}

describe('packetShape', () => {
  it('counts a complete packet', () => {
    const s = packetShape(full)
    expect(s.filled).toBe(PACKET_FIELDS.length)
    expect(s.empty).toEqual([])
    expect(s.usable).toBe(true)
  })

  it('EMPTY FIELDS ARE LEGAL AND COUNTED, never silently dropped', () => {
    // ⚠️ A creator with no concrete example genuinely has none, and inventing one
    // is the failure this layer exists to prevent. What must not happen is the
    // absence going unrecorded.
    const s = packetShape({ ...full, concreteExample: '', usefulDetail: '  ' })
    expect(s.filled).toBe(4)
    expect(s.empty).toEqual(['concreteExample', 'usefulDetail'])
  })

  it('a headline with nothing behind it is NOT usable', () => {
    const s = packetShape({ ...full, nonObviousDistinction: '', concreteExample: '',
      usefulDetail: '', creatorPov: '', payoff: '' })
    expect(s.filled).toBe(1)
    expect(s.usable).toBe(false)
  })

  it('is not usable without a core insight, however full the rest', () => {
    // Everything else is support. Support for nothing is not an argument.
    expect(packetShape({ ...full, coreInsight: '' }).usable).toBe(false)
  })

  it('counts what it was built from, so a packet from nowhere is visible', () => {
    // ⚠️ A packet citing nothing is a packet the model wrote from its own
    // general knowledge, and the leak and entailment checks have nothing to
    // compare it against.
    expect(packetShape({ ...full, builtFrom: [] }).cites).toBe(0)
    expect(packetShape(null).cites).toBe(0)
  })

  it('survives null and undefined without throwing', () => {
    expect(packetShape(null).usable).toBe(false)
    expect(packetShape(undefined).filled).toBe(0)
  })
})

describe('packetPromptLine', () => {
  it('omits empty fields rather than showing them blank', () => {
    // ⚖️ A labelled empty line reads as a slot to fill, and the writer fills it —
    // which is exactly how an unresolved container comes back invented.
    const line = packetPromptLine({ ...full, concreteExample: '', payoff: '' })
    expect(line).not.toMatch(/THE SPECIFIC CASE/)
    expect(line).not.toMatch(/WHAT THE VIEWER DOES NOW/)
    expect(line).toMatch(/THE ONE THING THIS VIDEO SAYS/)
  })

  it('renders nothing at all for an empty or absent packet', () => {
    expect(packetPromptLine(null)).toBe('')
    expect(packetPromptLine({ ...full, coreInsight: '', nonObviousDistinction: '',
      concreteExample: '', usefulDetail: '', creatorPov: '', payoff: '' })).toBe('')
  })

  it('tells the writer what the packet is FOR, not just what it contains', () => {
    // The list alone would be read as more facts. The instruction is that a
    // section carrying none of it should not exist.
    expect(packetPromptLine(full)).toMatch(/every section must earn its place/)
  })
})

describe('the builder is forbidden from adding anything', () => {
  it('says so, and says an empty field is a true answer', () => {
    expect(PACKET_SYSTEM).toMatch(/Use ONLY the supplied material/)
    expect(PACKET_SYSTEM).toMatch(/An empty field is a true answer/)
  })

  it('prefers what the creator said over what they merely covered', () => {
    expect(PACKET_SYSTEM).toMatch(/A position beats a topic/)
  })

  it('demands an insight another creator could not have said', () => {
    expect(PACKET_SYSTEM).toMatch(/a different creator in the same niche could not have said/)
  })

  it('carries the supplied items into the prompt, numbered and kinded', () => {
    const p = packetPrompt('hanushkaa', 'a 45s piece to camera',
      [{ kind: 'experience', text: 'sold a Birkin in 40 seconds' }])
    expect(p).toMatch(/@hanushkaa/)
    expect(p).toMatch(/1\. \(experience\) sold a Birkin in 40 seconds/)
  })
})
