import { describe, expect, it } from 'vitest'
import { topicMap } from './WhatTwinKnows'

describe('her topic map (24-ideas #6)', () => {
  it('counts videos per topic, most first, and marks the ones already made', () => {
    const t = topicMap([
      { kind: 'topic', text: 'Pricing handmade work', times_seen: 6 },
      { kind: 'topic', text: 'Glaze failures', times_seen: 2 },
      { kind: 'topic', text: 'pricing handmade work', times_seen: 1 },
      { kind: 'covered', text: 'why handmade pricing is about time', times_seen: 1 },
      { kind: 'fact', text: 'ignored', times_seen: 9 },
    ])
    expect(t).toEqual([
      { text: 'Pricing handmade work', times_seen: 6, covered: true },
      { text: 'Glaze failures', times_seen: 2, covered: false },
    ])
  })
})
