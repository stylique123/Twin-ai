import { describe, it, expect } from 'vitest'
import { HOOK_MOVE_IDS, normalizeRead } from './reader.js'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const SHARED = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../../packages/shared/src/script/scriptFamily.ts'), 'utf8')
const SHARED_IDS = [...SHARED.matchAll(/^  (\w+): \{ id: '(\w+)'/gm)].map((m) => m[2])

describe('the corpus reader labels hooks with the same moves the writer uses', () => {
  it('pins the restated list against the shared one', () => {
    expect([...HOOK_MOVE_IDS].filter((m) => m !== 'other').sort()).toEqual([...SHARED_IDS].sort())
    expect(SHARED_IDS.length).toBe(12)
  })
  it('keeps allowed labels and drops the rest', () => {
    const r = normalizeRead({ readable: true, topic: 't', hook_move: 'counted_list', hook_gap: 'open' })
    expect([r.hook_move, r.hook_gap]).toEqual(['counted_list', 'open'])
    const bad = normalizeRead({ readable: true, topic: 't', hook_move: 'bold claim', hook_gap: 'maybe' })
    expect([bad.hook_move, bad.hook_gap]).toEqual([null, null])
  })
})
