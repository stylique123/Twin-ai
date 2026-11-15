// Self-test for the panel answering mode (PANEL_ANSWER_MODE=fixture). No network, no database.
//   node scripts/ops/panelAnswers.selftest.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { panel14Answers, isFactsOnlyStop, fixtureAnswers, skipAnswers, panelAnswerMode, panelPlanB, panelQuestionUse, questionRecord, questionSummary, ANSWER_KEY_FOR_FIELD, PANEL_SKIP_ANSWER } from './panelRun.mjs'
import { panelQuestions } from './exportPanel.mjs'

const fixture = JSON.parse(readFileSync(new URL('./fixtures/fictional-panel.json', import.meta.url), 'utf8'))

// Every creator has a short first-person answer for each Need Check kind, no new numbers.
for (const c of fixture.creators) {
  for (const k of ['story', 'product_slot', 'niche', 'profile']) {
    const a = c.answers?.[k]
    assert.ok(typeof a === 'string' && a.length > 10 && a.length <= 240, `${c.key}.${k}`)
    assert.doesNotMatch(a, /\d/, `${c.key}.${k}: no numbers`)
  }
}

// Default stays skip.
assert.equal(panelAnswerMode({}), 'skip')
assert.equal(panelPlanB({}), false)
assert.equal(panelPlanB({ PANEL_PLAN_B: 'on' }), true)
assert.equal(panelAnswerMode({ PANEL_ANSWER_MODE: 'nonsense' }), 'skip')
assert.equal(panelAnswerMode({ PANEL_ANSWER_MODE: 'fixture' }), 'fixture')

const maya = fixture.creators.find((c) => c.key === 'mayas-coffee')
const qs = [
  { field: 'story', question: 'Tell me one moment' },
  { field: 'claims', question: 'What is it?' },
  { field: 'audience', question: 'Who is this for?' },
  { field: 'cta', question: 'What should viewers do?' },
  { field: 'selected_product', options: [{ value: 'p1' }, { value: 'none' }] },
]
const body = { selected_product_id: 'p1' }
const fx = fixtureAnswers(qs, body, maya.answers)
assert.equal(fx.readiness_answers.story, maya.answers.story)
assert.equal(fx.readiness_answers.claims, maya.answers.product_slot)
assert.equal(fx.readiness_answers.audience, maya.answers.profile)
assert.equal(fx.readiness_answers.cta, PANEL_SKIP_ANSWER, 'no answer → skip text')
assert.equal(fx.selected_product_id, 'p1')
assert.equal(ANSWER_KEY_FOR_FIELD.angle, 'niche')
// Skip mode unchanged.
const sk = skipAnswers(qs, body)
for (const f of ['story', 'claims', 'audience', 'cta']) assert.equal(sk.readiness_answers[f], PANEL_SKIP_ANSWER)
// No creator answers → all skip.
assert.deepEqual(fixtureAnswers(qs, body, undefined), sk)

// question_use: the answer words reaching the script; skip text is not an answer.
const lines = ['I started roasting and a customer once brought back a bag because it smelled like toast.']
const use = panelQuestionUse(fx.readiness_answers, lines)
assert.equal(use.answered, 3)
assert.deepEqual(use.used_keys, ['story'])
assert.equal(panelQuestionUse(sk.readiness_answers, lines).answered, 0)

const rec = questionRecord({ mode: 'fixture', fields: ['story', 'claims', 'audience', 'cta'], answers: fx.readiness_answers, lines, bp: { question_necessity: { asked: 2, avoided_invented: 1, avoided_general: 1, pieces: [{ kind: 'story' }] } } })
assert.equal(rec.questions_asked, 4)
assert.deepEqual(rec.fields_asked, ['story', 'claims', 'audience', 'cta'])
assert.deepEqual(rec.question_necessity, { asked: 2, avoided_invented: 1, avoided_general: 1 })
assert.equal(rec.question_use.used, 1)
assert.doesNotMatch(JSON.stringify(rec), /toast|roast/, 'record carries no answer text')

const none = questionRecord({ mode: 'skip', fields: [], answers: {}, lines, bp: null })
const sum = questionSummary([rec, none, null])
assert.deepEqual(sum, { scripts: 2, scripts_asked: 1, questions_asked: 4, fields_asked: { story: 1, claims: 1, audience: 1, cta: 1 }, necessity_asked: 2, necessity_avoided_invented: 1, necessity_avoided_general: 1, answered: 3, used: 1 })

// Export: stored record is reused; older skip rows are rebuilt.
assert.deepEqual(panelQuestions({ questions: rec }, {}), rec)
const old = panelQuestions({ answer_style: 'skip', body: { readiness_answers: { story: PANEL_SKIP_ANSWER } } }, { script: [{ line: 'x' }] })
assert.equal(old.questions_asked, 1)
assert.equal(old.question_use.answered, 0)

console.log('panelAnswers selftest ok')

// Plan v7.1 WP12: the angle loop's self-test rides this CI step.
await import('./panelAngleLoop.selftest.mjs')

// Panel 14: facts-only stops are answered from panel14-answers.json by question key.
const doc = { requests: { 'panel-21': { answers: { 'mn:fo:opinion:x': 'I think sources matter.', 'mn:fo:story:y': 'skip' } } } }
const p14 = panel14Answers([{ field: 'mn:fo:opinion:x' }, { field: 'mn:fo:story:y' }, { field: 'mn:fo:proof:z' }], { readiness_answers: { a: 'b' } }, 'panel-21', doc)
assert.deepEqual(p14.readiness_answers, { a: 'b', 'mn:fo:opinion:x': 'I think sources matter.', 'mn:fo:story:y': PANEL_SKIP_ANSWER, 'mn:fo:proof:z': PANEL_SKIP_ANSWER })
assert.equal(isFactsOnlyStop({ status: 409, json: { code: 'NEEDS_STORY', facts_only: true, questions: [] } }), true)
assert.equal(isFactsOnlyStop({ status: 409, json: { code: 'NEEDS_STORY', questions: [] } }), false)
assert.equal(isFactsOnlyStop({ status: 409, json: { code: 'READINESS_INCOMPLETE', facts_only: true, questions: [] } }), false)
// The real fixture loads and every request has answers.
assert.ok(Object.keys(panel14Answers([{ field: 'nope' }], {}, 'panel-01').readiness_answers).length === 1)
console.log('panel14 answers selftest: ok')
