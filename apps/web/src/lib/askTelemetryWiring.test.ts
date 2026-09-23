// TWIN ASKED 29 TIMES AND NEVER LEARNED WHY NOBODY ANSWERED.
//
// ⚠️ MEASURED 2026-09-16. `beat_audit.beat_asks.emitted` sums to 29 across 16
// generations, and NOT ONE of 857 stored beats carries an `ask_state` — so no
// creator has ever completed this loop. Three causes fit that evidence equally
// and nothing recorded which: she never saw the card, she saw it and moved on,
// or she tried and the save failed.
//
// ⚖️ AND THE ANSWER IS THE HIGHEST-YIELD SUPPLY IN THE SYSTEM. Over all 1,308
// knowledge rows: captions yield 16% substance, transcripts 84%, and `asked` —
// a sentence she typed — 100%, on 21 rows in the whole database. Half of all
// generations run on 2.4 substance items against a floor of 6, so three
// answers close the gap for a creator. That is why the ask is worth a counter.
//
// ⚠️⚠️ THIS FILE READS SOURCE TEXT, AND THAT HAS BITTEN TWICE HERE. A `<Section`
// count once matched the comment protecting it, and an affiliateUrl assertion
// counted a comment that merely NAMED the field. So comments are STRIPPED
// before anything is asserted — whole lines only, never everything after `//`,
// or a real call sitting after a string containing "https://" disappears.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const RAW = readFileSync(join(HERE, '..', 'components', 'ScriptEditor.tsx'), 'utf8')
/** Code only: drop WHOLE-LINE comments and block comments, keep everything else. */
const CODE = RAW
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((l) => !/^\s*\/\//.test(l))
  .join('\n')

describe('the ask records that it was shown', () => {
  it('fires beat_ask_shown from an effect, so it cannot be a render-count', () => {
    // ⚠️ THE MUTANT THAT MATTERS is no event at all — the shipped state until
    // now. The second is an event on every render, which would report a
    // creator seeing one question forty times.
    expect(CODE).toMatch(/logEvent\('beat_ask_shown'/)
    const effect = CODE.slice(CODE.indexOf("logEvent('beat_ask_shown'"))
    expect(effect).toMatch(/\}, \[script\.generation_id, beatIndex\]\)/)
  })

  it('keys the effect on the beat, so a second question is a second event', () => {
    const before = CODE.slice(0, CODE.indexOf("logEvent('beat_ask_shown'"))
    expect(before).toMatch(/const beatIndex = scene\.beat_index/)
    expect(before).toMatch(/useEffect\(\(\) => \{/)
  })
})

describe('what the creator typed never leaves the component', () => {
  it('logs a LENGTH, not the answer', () => {
    // ⚖️ `answer_chars` separates an empty submit from a real one without
    // putting a creator's sentence in an analytics row.
    expect(CODE).toMatch(/answer_chars: answer === null \? 0 : answer\.length/)
  })

  it('never passes the answer itself into a logged payload', () => {
    // ⚠️ MY FIRST VERSION OF THIS ASSERTION WAS WRONG, AND THE CODE WAS RIGHT.
    // `/answer[,}\s]/` matched `answer_chars: answer === null ? 0 : answer.length`
    // — the expression that computes the LENGTH, which is exactly what is
    // allowed. What must be forbidden is `answer` as a logged VALUE: a direct
    // property value, or the object shorthand. `answer.length` and
    // `answer === null` are computations and stay legal.
    for (const call of CODE.match(/logEvent\([^;]*?\)\n/gs) ?? []) {
      expect(call).not.toMatch(/:\s*answer\s*[,}]/)
      expect(call).not.toMatch(/[{,]\s*answer\s*[,}]/)
      expect(call).not.toMatch(/\bdraft\b/)
    }
  })
})

describe('the outcome recorded is the server verdict', () => {
  it('records ask_state as returned, not the intent that was sent', () => {
    // Recording what we SENT would count an answer the server rejected as an
    // answer, which is the one reading that would make this counter lie.
    const submit = CODE.slice(CODE.indexOf("logEvent('beat_ask_submitted'"))
    expect(submit).toMatch(/ask_state,/)
    // Re-pointed: the destructure also takes `also` (item 40: one answer fills peer beats).
    const destructure = CODE.indexOf('const { line, ask_state, also } = await answerBeatAsk')
    expect(destructure).toBeGreaterThan(-1)
    expect(destructure).toBeLessThan(CODE.indexOf("logEvent('beat_ask_submitted'"))
  })

  it('separates every way it can fail, under its own reason', () => {
    for (const reason of ['no_beat_index', 'commit_failed', 'no_line_not_skipped', 'threw']) {
      expect(CODE).toMatch(new RegExp(`reason: '${reason}'`))
    }
  })
})

describe('telemetry may never cost the creator anything', () => {
  it('never awaits a single one of these writes', () => {
    // The rule `recordScriptEdit` and `recordPublishIntent` already follow: an
    // analytics round-trip must not stand between somebody and their camera.
    const calls = CODE.match(/[a-z ]*logEvent\('beat_ask_[a-z_]+'/g) ?? []
    expect(calls.length).toBeGreaterThanOrEqual(6)
    for (const call of calls) expect(call).toMatch(/void logEvent/)
  })
})
