// A TAB SWITCH TOOK THE ANSWERS AND RESTARTED THE BUILD.
//
// ⚠️ REPORTED FROM A REAL SESSION. The creator was part-way through answering
// the readiness questions, switched to another tab, and came back to a blank
// screen and a build running from the beginning. Everything typed was component
// state, so a reclaimed tab took it — and the restored page had no questions
// open, so it went straight back to building without them.
//
// ⚖️ THE EVENT THAT LOSES THEM IS NOT A SUBMIT. Chrome and mobile Safari both
// discard background tabs with no unload and no warning, so "save on blur" or a
// beforeunload handler would not have caught it. Every keystroke is written.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const BUILD = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..',
    'apps', 'web', 'src', 'pages', 'v2', 'V2Building.tsx'), 'utf8')

describe('typed answers survive the tab being reclaimed', () => {
  it('writes on every keystroke, not on submit or blur', () => {
    // ⚠️ THE WHOLE POINT. A discarded tab fires no unload.
    //
    // ⚖️ ASSERTED ON THE ONE SAVE PATH RATHER THAN INSIDE EACH HANDLER. Five
    // affordances used to carry their own copy of "merge, then remember", which
    // is five chances for the sixth to be added without one. `answer` makes
    // persisting what SETTING an answer is, so a control cannot forget — and
    // every control now routes through it.
    const helper = BUILD.slice(BUILD.indexOf('const answer = (field: string, value: string)'))
    expect(helper.slice(0, 300)).toMatch(/rememberAnswers\(buildKey\(state\), next\)/)
    expect(BUILD).toMatch(/onChange=\{\(ev\) => answer\(q\.field, ev\.target\.value\)\}/)
  })

  it('restores them into the FORM on mount', () => {
    expect(BUILD).toMatch(/useState<Record<string, string>>\(\s*\n?\s*\(\) => recallAnswers\(/)
  })

  it('restores them into the REF the build actually sends', () => {
    // ⚠️ RESTORING ONLY THE VISIBLE FORM would show the creator their answers
    // and then generate without them — the worst of both.
    expect(BUILD).toMatch(/useRef<Record<string, string>>\(\s*\n?\s*recallAnswers\(/)
  })

  it('restores the OPEN QUESTIONS too, so it does not silently rebuild', () => {
    // ⚖️ Without this the restored page has no card, sees no answers, and goes
    // straight back to building — which is exactly what was reported.
    // ⚠️ THE TYPE WIDENED WHEN THE THREE INTENT QUESTIONS JOINED THE CARD —
    // `AskItem` is a readiness question OR a chip question. The property under
    // test is unchanged: the OPEN QUESTIONS are restored, whatever kind.
    expect(BUILD).toMatch(/useState<AskItem\[\] \| null>\(\s*\n?\s*\(\) => recallAsk\(/)
  })
})

describe('what it keeps and what it drops', () => {
  it('clears the QUESTIONS on submit but keeps the ANSWERS', () => {
    // ⚖️ Keeping the answers means a tab reclaimed mid-build still sends them.
    // Clearing the questions means it does not re-ask what was just answered.
    const submit = BUILD.slice(BUILD.indexOf('answersRef.current = { ...answersRef.current, ...askAnswers }'))
    expect(submit.slice(0, 600)).toMatch(/rememberAnswers\(buildKey\(state\), answersRef\.current\)/)
    expect(submit.slice(0, 600)).toMatch(/rememberAsk\(buildKey\(state\), null\)/)
  })

  it('records the questions wherever they are opened — both paths', () => {
    // The client pre-check and the server refusal each open the card; one of
    // them not recording would restore a half state.
    const hits = BUILD.match(/rememberAsk\((key|buildKey\(state\)), (ask|qs|null)\)/g) ?? []
    expect(hits.length).toBeGreaterThanOrEqual(3)
  })

  it('is parked under the BUILD KEY, so it cannot leak into the next video', () => {
    expect(BUILD).toMatch(/const answersSlot = \(key: string\) => `twinai\.answers\.\$\{key\}`/)
    expect(BUILD).toMatch(/const askSlot = \(key: string\) => `twinai\.ask\.\$\{key\}`/)
  })

  // ⚠️ SCOPED TO THE ANSWER HELPERS THEMSELVES, NOT TO EVERYTHING BEFORE THE
  // COMPONENT. This assertion used to slice from `function rememberAnswers` all
  // the way to `export default function` and forbid `localStorage` anywhere in
  // it — which is right about the answers and wrong about its neighbours. The
  // plan screen's OPT-OUT is a standing preference and belongs in localStorage
  // precisely because it must outlive the tab; landing it in this span turned a
  // correct change into a failure of an unrelated guard.
  //
  // ⚖️ THE INTENT IS UNCHANGED AND NARROWER: each ANSWER slot helper, checked on
  // its own body. A span that grows with its neighbours stops describing what it
  // was written to protect — the same defect as the fixed 1400-character slice
  // this repo has already corrected once.
  it('uses sessionStorage, which dies with the tab like the transcript slot', () => {
    // ⚖️ EVERY LINE THAT TOUCHES AN ANSWER SLOT, rather than a span of source.
    // Keying on `answersSlot(`/`askSlot(` is what these slots ARE, so a renamed
    // helper or a reordered file changes nothing here — and a new read added
    // years from now is covered the day it is written.
    const lines = BUILD.split('\n').filter((l) => /\b(answersSlot|askSlot)\(/.test(l))
    // Guards the guard: an empty list would pass every assertion below.
    expect(lines.length, 'no answer-slot accesses found — the marker moved')
      .toBeGreaterThanOrEqual(4)
    for (const l of lines) {
      if (/=>\s*`twinai\./.test(l)) continue // the slot-name definitions themselves
      expect(l, `an answer slot reached for the wrong storage: ${l.trim()}`)
        .not.toMatch(/localStorage/)
      expect(l, `an answer slot must use sessionStorage: ${l.trim()}`)
        .toMatch(/sessionStorage\./)
    }
  })

  it('treats a CORRUPT slot as an empty one', () => {
    // ⚠️ Restoring junk into the form is worse than asking again.
    expect(BUILD).toMatch(/parsed && typeof parsed === 'object' && !Array\.isArray\(parsed\)/)
  })

  it('never throws when storage is unavailable', () => {
    // Private mode, disabled storage, quota — none may break a build.
    const region = BUILD.slice(BUILD.indexOf('const answersSlot'), BUILD.indexOf('export default function'))
    expect((region.match(/catch/g) ?? []).length).toBeGreaterThanOrEqual(4)
  })
})
