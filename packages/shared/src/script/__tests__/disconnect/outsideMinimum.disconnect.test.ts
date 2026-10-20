// DISCONNECT TEST, ledger row 8: outside minimum relevance (#1273). Kill switch OUTSIDE_MIN_RELEVANCE=false.
// Fictional fixture only (a made-up support tool and event). No model call.
import { describe, it, expect } from 'vitest'
import { pickOutsideForWriter } from '../../outsideSelect'
import { EDGE, edgeGate, edgeAfter } from './edge'

const REQUEST = 'how to stop answering the same customer email twice'
const lists = { notes: [], trends: [], moments: [], research: [{ name: 'Customer Summit', detail: 'support leaders meet in a fictional city' }], reddit: [] }

/** The edge call (index.ts ~9811): the request floor is passed only under `outsideFloorOn`. */
const pickFor = (on: boolean) => pickOutsideForWriter(lists, [REQUEST, 'software'], on ? { requestTexts: [REQUEST] } : {})
const gate = (env: Record<string, string>, trialOn = true) => edgeGate('outsideFloorOn', { trialOn }, env) as boolean

describe('OUTSIDE_MIN_RELEVANCE disconnect', () => {
  it('the edge gate: on for the trial, off with OUTSIDE_MIN_RELEVANCE=false', () => {
    expect(gate({})).toBe(true)
    expect(gate({ OUTSIDE_MIN_RELEVANCE: 'false' })).toBe(false)
  })
  it('on: the one-word-overlap outside item is cut; off: it reaches the writer', () => {
    const on = pickFor(gate({}))
    const off = pickFor(gate({ OUTSIDE_MIN_RELEVANCE: 'false' }))
    expect(on.lists.research).not.toEqual(off.lists.research)
    expect(on.lists.research).toEqual([])
    expect(on.record).toMatchObject({ offered: 1, kept: 0, cut_below_min: 1 })
    expect(off.lists.research).toHaveLength(1)
  })
  it('the edge still passes the floor under the gate', () => {
    expect(edgeAfter('const sel = pickOutsideForWriter(', 300)).toContain('outsideFloorOn ? { requestTexts: outsideRequest } : {}')
  })
})
