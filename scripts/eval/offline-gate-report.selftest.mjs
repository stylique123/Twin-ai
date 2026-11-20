#!/usr/bin/env node
// Self-test for offline-gate-report.mjs scoring (fictional ids only).
import assert from 'node:assert/strict'
import { score } from './offline-gate-report.mjs'

const labels = new Map([['A', 'INVENTED'], ['B', 'INVENTED'], ['C', 'TRUE'], ['D', 'TRUE'], ['E', 'TRUE']])
const s = score(['A', 'C', 'Z'], labels)
assert.equal(s.invented, 2)
assert.equal(s.caught, 1)
assert.equal(s.recall, 0.5)
assert.deepEqual(s.missed, ['B'])
assert.equal(s.true_labeled, 3)
assert.equal(s.false_blocks, 1)
assert.equal(s.false_block_rate, 0.333)
assert.deepEqual(s.false_block_ids, ['C'])
const empty = score([], new Map())
assert.equal(empty.recall, null)
assert.equal(empty.false_block_rate, null)
console.log('offline-gate-report selftest OK')
