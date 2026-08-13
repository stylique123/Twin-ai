#!/usr/bin/env node
// Generate blueprints for QA personas so they can be scored.
//
// USAGE
//   GEMINI_API_KEY=... CASES='[{...}]' node scripts/qa/run-eval.mjs > out.json
//
// A case is { creator, label, fidelity, tone, goal?, refNote }. `creator` keys
// into scripts/qa/creator-pack.json; `refNote` DESCRIBES a reference rather than
// linking one, which is the path that works without a transcript ingest.
//
// ⚠️ THIS IS A HARNESS, NOT THE EDGE FUNCTION. It lifts the REAL rule strings
// verbatim out of generate-blueprint/index.ts so the axes under test are the
// product's own, but the surrounding prompt is reconstructed. It therefore tests
// the DESIGN — containers, ownership, goals, options — and cannot prove the
// deployed function behaves identically.
//
// EVERY RULE UNDER TEST MUST BE LIFTED, NEVER RETYPED. Twice now a hand-written
// approximation has been mistaken for a product finding: once for `promotes`
// (a bare enum with the prohibition omitted), once for the count contract (a
// paraphrase missing the clause the fix turned on, and gated behind a
// `reference_read` field the harness never requested, so the rule was inert).
// Retyped text drifts, and drift is indistinguishable from a result. `liftBlock`
// exits non-zero rather than falling back — a harness that silently
// under-specifies the prompt does not measure the product, it measures itself.
//
// ⚠️ AND THE THIRD TIME: ORDER IS A RULE TOO, AND THIS HARNESS DOES NOT LIFT IT.
//
// Lifting the strings fixed WHAT is sent and not WHERE. In the cross-paired run,
// 4 of 12 cases returned a complete, parseable object containing ONLY
// `reference_read` — finishReason STOP, so the model had finished, not been cut
// off. It had read the mechanism and considered the job done, because
// MECHANISM_READ opens "READ THE FORMAT'S SPINE ... before you write anything
// else" and this prompt is short enough that a near-final instruction dominates.
// In `generate-blueprint` the same sentence is one bullet inside ~100 lines of
// SYSTEM with an explicit ordered task list after it, and it does not dominate.
//
// So a stopped-early case here is EVIDENCE ABOUT THIS FILE, not about the
// product, and must never be reported as a refusal or a defect. Until the
// harness reproduces the real prompt's ORDER, only cases that return a full
// blueprint carry any signal at all.
import { readFileSync } from 'node:fs'

/** Production's cap, lifted so a change there is a change here. Overridable per
 *  case ONLY for the experiment that varies it. */
const KNOWLEDGE_CAP = Number(process.env.KNOWLEDGE_CAP ?? 10)

const KEY = process.env.GEMINI_API_KEY
if (!KEY) { console.error('set GEMINI_API_KEY'); process.exit(1) }

const EDGE = readFileSync('supabase/functions/generate-blueprint/index.ts', 'utf8')
// Lift the real rules rather than paraphrasing them.
const lift = (name, key) => {
  const m = EDGE.match(new RegExp(`${name}:\\s*\\n?\\s*'([\\s\\S]*?)',\\n`, 'm'))
  return m ? m[1].replace(/\\'/g, "'").replace(/\\n/g, ' ') : null
}
const FID = {
  close: lift('close'), balanced: lift('balanced'), loose: lift('loose'),
}
// THE PROMOTES PROHIBITION, LIFTED VERBATIM.
//
// The first version of this harness sent the bare enum ("review_only") and the
// output produced a founder launch — which I briefly recorded as a product
// defect. It was not. `generate-blueprint` emits a full prohibition for each
// value, and the harness was simply not sending it. That is the exact failure
// the edge function's own comment warns about: "`- What they do: saas` invites
// the model to invent what that implies; naming the consequence is what changes
// the writing."
//
// A harness that under-specifies the prompt does not measure the product, it
// measures the harness. So these are lifted rather than paraphrased.
function promotesLine(v) {
  const re = new RegExp(`brief\\.promotes === '${v}'[\\s\\S]*?\\?\\s*'([\\s\\S]*?)'\\n`, 'm')
  const m = EDGE.match(re)
  return m ? m[1].replace(/\\n/g, '').replace(/\\'/g, "'") : ''
}
// THE COUNT CONTRACT, LIFTED VERBATIM — for the same reason as the above.
//
// This block was PARAPHRASED here for one round of runs, and the paraphrase
// dropped the clause the fix actually turned on ("this is the specific way that
// rule was broken three times"). The runs that moved Cleo from one spoken
// ordinal to five therefore measured a string the product does not send. The
// direction held, the evidence did not cover the shipped text.
//
// ⚖️ Anything hand-copied here will drift, and drift is indistinguishable from
// a finding. So the block is extracted between two markers and the extraction
// FAILS LOUDLY rather than falling back to a paraphrase.
function liftBlock(startMarker, endMarker, label) {
  const from = EDGE.indexOf(startMarker)
  const to = EDGE.indexOf(endMarker, from)
  if (from < 0 || to < 0) {
    console.error(`FATAL: could not lift ${label} from generate-blueprint/index.ts.`)
    console.error('The harness will not run on a paraphrase. Fix the marker, do not inline the text.')
    process.exit(1)
  }
  return EDGE.slice(from, to + endMarker.length)
    .split('\n').map((l) => l.replace(/^\s{2}/, '')).join('\n')
}
// THE SUBSTANCE DECLARATION, LIFTED VERBATIM.
//
// ⚠️ THE HARNESS HAD FALLEN BEHIND PRODUCTION. #316 made the writer declare,
// per beat, WHERE its content came from — and this harness kept sending the old
// prompt and the old schema, so a matrix run could not see the one layer the
// whole substance effort exists to produce. A harness that measures a previous
// version of the product reports on a product nobody is shipping.
const SUBSTANCE_RULES = liftBlock(
  '- SUBSTANCE BEFORE PROSE.',
  '- KILL THE BORING MIDDLE.',
  'the substance declaration rules',
)
// THE BEAT PLAN INSTRUCTION, LIFTED — AND IT WAS RETYPED UNTIL NOW.
//
// ⚠️ THE HARNESS WOULD HAVE MEASURED THE OLD RULE. `proof` was found answering a
// different question on 186 of 192 real beats, and the fix is a sharpened
// instruction naming the three wrong shapes. This file carried its OWN typed
// copy of the beat_plan lines, so a run made to check that fix would have sent
// the pre-fix wording and reported that nothing had changed — a drift result
// indistinguishable from a real one, which is the exact failure the header of
// this file warns about.
const BEAT_PLAN_RULES = liftBlock(
  '- beat_plan: BEFORE writing any words',
  'that is a real answer and it is short.',
  'the beat plan instruction',
)
const COUNT_CONTRACT = liftBlock(
  '- THE COUNT IS THE FORMAT',
  'Silent beats are fine BEFORE the first item and AFTER the last.',
  'the count contract',
)
// ⚖️ THE COUNT CONTRACT IS CONDITIONAL ON A FIELD THE HARNESS NEVER ASKED FOR.
// Every rule above fires only "if enumeration.is_enumerated is true" — and the
// harness's requested JSON had no `reference_read` at all, so that condition was
// never established in any run to date. The rules were present and inert. The
// mechanism read is lifted too, and emitted BEFORE the contract, in the same
// order as production, so the precondition can actually become true.
// ⚠️ AND THE FIFTH TIME: `productFacts` WAS A SLOT THAT WAS ALWAYS EMPTY.
//
// The harness has recorded `supplied.productFacts` on every run since it was
// added, and across all 32 runs of the latest matrix its value was `[]` — every
// time, for every creator — because `creator.productFacts` does not exist in the
// pack. So the entire Product Knowledge path was UNMEASURABLE while appearing in
// the output as a measured zero. `IMPOSS-PROD` fired on beats declaring
// `product_dna`, and the scorer's own note explains it away: "this harness
// supplies no product DNA to anyone."
//
// ⚖️ THAT NOTE IS THE BUG, NOT THE EXPLANATION. A harness that cannot supply the
// thing under test reports the product path as clean no matter how broken it is.
// So the real block is lifted, the pack carries real graded facts, and a script
// that states a HELD fact is now countable.
const PRODUCT_FACTS_RULE = liftBlock(
  '- WHAT IS TRUE ABOUT THIS PRODUCT',
  'describe it in general terms or leave it out.',
  'the usable-product-facts rule',
)

const MECHANISM_READ = liftBlock(
  '- reference_read.mechanism: READ THE FORMAT',
  'the debt that makes a list a sequence rather than a pile.',
  'the mechanism read',
)

// ⚠️ AND THE FOURTH TIME: THE HARNESS WAS SCORING A CTA RULE THAT NO LONGER EXISTS.
//
// Until now this file decided the CTA from the VIDEO GOAL ALONE — the exact
// approximation `generate-blueprint` replaced when it learned that permission
// comes from the RELATIONSHIP, not the goal. So a matrix run reporting "0
// inappropriate sales CTAs" was a fact about code we had already deleted, and
// the four claim rules the product actually sends (vendor attribution, review-
// is-not-advert, no unearned personal use, mandatory disclosure) were sent in
// ZERO runs. `grep -c` for any of them in this file returned 0.
//
// Lifted, not retyped, for the same reason as everything above it.

/** Lift one single-quoted string LITERAL containing `anchor`, unescaped.
 *  Fails loudly — a claim rule that silently resolves to '' is a rule the
 *  matrix will report as obeyed because it was never sent. */
function liftQuoted(anchor, label) {
  const at = EDGE.indexOf(anchor)
  if (at < 0) {
    console.error(`FATAL: could not lift ${label} — anchor not found in generate-blueprint/index.ts.`)
    console.error('Fix the anchor, do not inline the text.')
    process.exit(1)
  }
  const open = EDGE.lastIndexOf("'", at)
  let i = open + 1
  for (; i < EDGE.length; i++) {
    if (EDGE[i] === '\\') { i++; continue }
    if (EDGE[i] === "'") break
  }
  return EDGE.slice(open + 1, i)
    .replace(/\\'/g, "'").replace(/\\n/g, '\n').replace(/\\\\/g, '\\')
}

const CTA_SELL = liftQuoted('\\n- CTA INTENT: this creator', 'the commercial CTA line')
const CTA_NO_TIE = liftQuoted('\\n- CTA INTENT: NO COMMERCIAL CTA', 'the no-commercial-tie CTA line')
const CTA_NOT_SELLING = liftQuoted('\\n- CTA INTENT: NOT a selling video', 'the non-selling CTA line')
const CLAIM_ATTRIBUTED = liftQuoted('\\n- THE VENDOR', 'the vendor-attribution rule')
const CLAIM_REVIEW = liftQuoted('\\n- THIS IS A REVIEW, NOT AN ADVERTISEMENT', 'the review-not-advert rule')
const CLAIM_NO_USE = liftQuoted('\\n- THE CREATOR HAS NOT CONFIRMED', 'the unearned-personal-use rule')
const CLAIM_DISCLOSURE = liftQuoted('\\n- A DISCLOSURE IS REQUIRED', 'the mandatory-disclosure rule')

/** The production enum. A pack creator carrying anything else is a fixture bug,
 *  and is refused rather than defaulted — defaulting is how `rel` would quietly
 *  become NONE and every claim rule would go silent. */
const RELATIONSHIPS = ['NONE', 'REVIEW_ONLY', 'AFFILIATE', 'SPONSOR', 'OWN_PRODUCT', 'OWN_SERVICE']

/**
 * `generate-blueprint`'s permission derivation, replicated on the harness's
 * fixture shape. The BRANCHES are reproduced; every STRING is lifted.
 *
 * ⚖️ WHY THIS IS REPLICATED AND NOT LIFTED. The edge derives `rel` from a DB
 * row (`ownedEntity.relationship`) that does not exist here, so the decision
 * cannot be imported the way a string can. What is copied is small, and the
 * parity test asserts the branch conditions are character-identical to the
 * edge's — see `harnessClaimRulesParity.test.ts`.
 */
function claimRules(truth, goalRaw) {
  const rel = truth?.relationshipCode
  if (!RELATIONSHIPS.includes(rel)) {
    console.error(`FATAL: creator truth has relationshipCode=${JSON.stringify(rel)}.`)
    console.error(`It must be one of ${RELATIONSHIPS.join(', ')} — the prose \`relationship\` field is not a permission.`)
    process.exit(1)
  }
  const personalUse = truth?.personalUse ?? 'NOT_CONFIRMED'
  const creatorExperience = personalUse === 'CONFIRMED'
  const commercialCta = rel === 'OWN_PRODUCT' || rel === 'OWN_SERVICE'
    || rel === 'AFFILIATE' || rel === 'SPONSOR'
    ? 'only_if_intended'
    : 'forbidden'
  const disclosureRequired = rel === 'AFFILIATE' || rel === 'SPONSOR'
  const marketingClaims = rel === 'OWN_PRODUCT' || rel === 'OWN_SERVICE'
    ? 'allowed'
    : rel === 'AFFILIATE' || rel === 'SPONSOR'
      ? 'attributed'
      : 'forbidden'

  // ⚖️ FIXTURE SHAPE, NOT A PRODUCT RULE. Production reads a single-valued
  // `videoGoal` enum; the pack stores composite answer strings ("leads+authority")
  // because a real onboarding answer is a sentence. Reducing to the commercial
  // token is a translation between the two, and is deliberately the ONLY thing
  // here that is not a copy of production.
  const g = String(goalRaw ?? '')
  const videoGoal = g.includes('sell') ? 'sell' : g.includes('leads') ? 'leads' : g
  const goalWantsSale = videoGoal === 'sell' || videoGoal === 'leads'
  // ⚖️ INTENT IS REQUIRED, NOT OPTIONAL — which is what the name says and what
  // this now does. The previous form was `forbidden ? false : commercialCta
  // === 'allowed' || goalWantsSale`, and `commercialCta` is only ever
  // 'only_if_intended' or 'forbidden' — so the 'allowed' arm was unreachable
  // and TypeScript said so. It was a leftover from a design where ownership
  // alone licensed a pitch, which is exactly what the comment above rejects.
  // Behaviour is unchanged for every relationship; the dead arm implied a
  // state that cannot happen and misled the next reader about the model.
  const sellIntent = commercialCta === 'only_if_intended' && goalWantsSale
  const ctaIntentLine = sellIntent
    ? CTA_SELL
    : commercialCta === 'forbidden' && goalWantsSale
      ? CTA_NO_TIE
      : CTA_NOT_SELLING

  const claimLines = []
  if (marketingClaims === 'attributed') claimLines.push(CLAIM_ATTRIBUTED)
  else if (marketingClaims === 'forbidden' && rel === 'REVIEW_ONLY') claimLines.push(CLAIM_REVIEW)
  if (!creatorExperience && rel !== 'NONE') claimLines.push(CLAIM_NO_USE)
  if (disclosureRequired) claimLines.push(CLAIM_DISCLOSURE)

  return { ctaIntentLine, claimRulesBlock: claimLines.join(''), rel, sellIntent }
}

// ⚠️ THE REASON 4 OF 12 CASES RETURNED ONLY `reference_read`.
//
// `generate-blueprint` sends `responseSchema: blueprintSchema` with `required`
// lists. This harness sent `responseMimeType` alone, so the model was free to
// emit a well-formed PARTIAL object — and it did: 2,299 output tokens of a
// 20,000 budget, finishReason STOP. It read the mechanism, wrote a beat-by-beat
// `beat_debts`, and considered the job finished.
//
// I blamed prompt ORDER first and moved the blocks to match production. That
// changed nothing, which is what ruled the hypothesis out — the reorder stays
// because it is closer to the real prompt, but it was not the cause. Then I
// blamed token exhaustion; the usage numbers ruled that out too. The difference
// was the one piece of the request I had never compared.
//
// ⚖️ Kept deliberately shallow. Mirroring the full production schema would be a
// second copy of it here, free to drift; this pins only the KEYS whose absence
// silently turns a run into a non-result.
const S = (t) => ({ type: t })
const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    reference_read: {
      type: 'OBJECT',
      properties: {
        mechanism: {
          type: 'OBJECT',
          properties: {
            enumeration: {
              type: 'OBJECT',
              properties: { is_enumerated: S('STRING'), count: S('STRING'), unit: S('STRING') },
              required: ['is_enumerated', 'count', 'unit'],
            },
            hook_promise: S('STRING'),
            rehook_after_item: S('STRING'),
            beat_debts: { type: 'ARRAY', items: S('STRING') },
          },
          required: ['enumeration', 'hook_promise', 'rehook_after_item', 'beat_debts'],
        },
      },
      required: ['mechanism'],
    },
    beat_plan: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { beat: S('STRING'), target_sec: S('STRING'), proof: S('STRING') },
        required: ['beat', 'target_sec', 'proof'],
      },
    },
    concept: { type: 'OBJECT', properties: { premise: S('STRING') }, required: ['premise'] },
    hook_options: { type: 'ARRAY', items: S('STRING') },
    script: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          section: S('STRING'), line: S('STRING'), location: S('STRING'),
          substance: S('STRING'), substance_evidence: S('STRING'),
          broll_request: S('STRING'), wardrobe: S('STRING'), action_posing: S('STRING'),
        },
        required: ['section', 'line', 'location', 'broll_request', 'wardrobe', 'action_posing'],
      },
    },
    cta: S('STRING'),
  },
  required: ['reference_read', 'beat_plan', 'concept', 'hook_options', 'script', 'cta'],
}

// CREATOR KNOWLEDGE, rendered exactly as `knowledgePromptLine` renders it.
// ⚖️ Empty stays EMPTY. The whole point of the module is that it never tells the
// model to invent substance, so a creator with no knowledge must produce no
// block at all — otherwise the A/B below measures a different prompt, not a
// different memory.
// ⚠️ THE HARNESS WAS SELECTING KNOWLEDGE DIFFERENTLY FROM PRODUCTION, which
// makes every "how much of what we know reaches a script" number a fact about
// this file. It sent the 12 most-seen items; `generate-blueprint` sends 10
// RANKED BY LEXICAL OVERLAP with what the video is about, so a niche subject
// never starves the prompt. Ranking changes WHICH items the writer sees, and
// that is the whole variable in the breadth measurement.
//
// ⚖️ The cap is a parameter here ONLY so it can be varied as the single
// variable in an experiment. It defaults to production's 10.
// ⚠️ THE SELECTION IS EXTRACTED SO THE RECORDED SET *IS* THE SHOWN SET. The
// run records what the prompt carried, and a second implementation of "which
// items did we show" would be a second chance to be wrong about the only
// question the recording exists to answer. `knowledgeBlock` renders what this
// returns; nothing else may decide it.
// THE SUBSTANCE FLOOR, READ OUT OF THE EDGE THAT SHIPS.
//
// ⚖️ LIFTED, NOT RETYPED. A typed copy of the kind list would drift the moment a
// kind moved between substance and thin, and the run would report a selector
// nobody is running. Same rule as every other lifted block in this file.
const SUBSTANCE_KINDS = new Set(
  (EDGE.match(/const SUBSTANCE_KINDS: ReadonlySet<string> = new Set\(\[([\s\S]*?)\]\)/) ?? [])[1]
    ?.split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean) ?? [])
const SUBSTANCE_FLOOR = Number(
  (EDGE.match(/const SUBSTANCE_FLOOR = (\d+)/) ?? [])[1] ?? NaN)
if (!SUBSTANCE_KINDS.size || !Number.isFinite(SUBSTANCE_FLOOR)) {
  console.error('FATAL: could not lift the substance floor from generate-blueprint/index.ts.')
  console.error('The harness will not run on a paraphrase of the selector. Fix the marker.')
  process.exit(1)
}

function selectSpeakable(ranked, cap, floor = SUBSTANCE_FLOOR) {
  if (cap <= 0) return []
  const substance = ranked.filter((i) => SUBSTANCE_KINDS.has(i.kind))
  const keep = substance.slice(0, Math.min(floor, cap))
  const taken = new Set(keep)
  const out = [...keep]
  for (const item of ranked) {
    if (out.length >= cap) break
    if (taken.has(item)) continue
    out.push(item); taken.add(item)
  }
  return out
}

function selectKnowledge(k, aboutText = '', cap = KNOWLEDGE_CAP) {
  if (!k) return { items: [], covered: [] }
  const aboutTerms = new Set(String(aboutText).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3))
  const ranked = (k.items ?? []).filter((i) => i.basis !== 'inferred' && i.kind !== 'covered')
  const scored = ranked.map((i) => ({
    i,
    hit: String(i.text).toLowerCase().split(/[^a-z0-9]+/).filter((w) => aboutTerms.has(w)).length,
  }))
  const ordered = [
    ...scored.filter((x) => x.hit > 0).sort((a, b) => b.hit - a.hit).map((x) => x.i),
    ...scored.filter((x) => x.hit === 0).map((x) => x.i),
  ]
  // ⚠️ THE SUBSTANCE FLOOR, LIFTED FROM THE EDGE. Slicing relevance-ordered
  // items straight to the cap is the behaviour an A/B measured taking grounding
  // from 63% to 52% once the store was realistic. Measuring the OLD selector
  // while production runs the new one would report on a product nobody ships —
  // the same drift `SUBSTANCE_RULES` is lifted to avoid.
  //
  // The cap is applied HERE, so what is recorded is what the writer could see —
  // not the fuller store it was chosen from.
  return { items: selectSpeakable(ordered, cap), covered: (k.items ?? []).filter((i) => i.kind === 'covered') }
}

function knowledgeBlock(k, aboutText = '', cap = KNOWLEDGE_CAP) {
  if (!k) return ''
  const { items, covered } = selectKnowledge(k, aboutText, cap)
  const parts = []
  if (items.length) {
    parts.push('\nWHAT THIS CREATOR ACTUALLY KNOWS AND HAS SAID — real substance, not style.'
      + ' Build the video out of THIS. These are their own positions and examples,'
      + ' so you may put them in their mouth; anything you add that is not here is'
      + ' yours, and they did not say it.\n'
      + items.map((c) => `  * (${c.kind}) ${c.text}`).join('\n'))
  }
  if (covered.length) {
    parts.push('\nALREADY COVERED — they have made a video about each of these. Do NOT hand'
      + ' them their own upload back; go at the topic from an angle they have not used.'
      + ' THIS LIST IS NEVER SPOKEN. It steers what you choose, and it must not appear'
      + ' in any line: a script that says "we\'ve had a video on this" is narrating our'
      + ' notes to the audience, and it asserts something about their back catalogue'
      + ' that nobody checked the phrasing of. Use it to pick a DIFFERENT angle, then'
      + ' write as though the earlier video were simply not the subject.\n'
      + covered.map((c) => `  * ${c.text}`).join('\n'))
  }
  if ((k.audience ?? []).length) {
    parts.push('\nWHAT THEIR AUDIENCE KEEPS ASKING — summarised, never quoted. A video that'
      + ' answers one of these is wanted before it is made. THIS LIST IS NEVER SPOKEN'
      + ' EITHER. Answer the question; do not announce that it was asked. A line like'
      + ' "one my audience asks about a lot" narrates our notes to the room.\n'
      + k.audience.map((a) => `  * ${a.summary} (asked ~${a.asked}x)`).join('\n'))
  }
  return parts.join('\n')
}

// ⚖️ THE PACK IS OVERRIDABLE, SO AN EXPERIMENT NEVER MUTATES THE CHECKED-IN ONE.
// Comparing hand-written knowledge against derived knowledge means running the
// same cases against two packs; doing that by editing the real file and putting
// it back is how a half-finished run leaves the repo holding an experiment.
const pack = JSON.parse(readFileSync(process.env.CREATOR_PACK ?? 'scripts/qa/creator-pack.json', 'utf8'))

/** What the product's own pages say, split exactly as production splits it.
 *
 *  ⚠️ ONLY `usable` FACTS ARE SENT, and that is the property under test. A fact
 *  graded `needs_confirmation` — anything carrying a magnitude or promising an
 *  outcome — is deliberately WITHHELD from the prompt, so a script that states
 *  one anyway has either invented it or leaked it, and either is a defect worth
 *  counting. Sending both and hoping the model behaves would measure nothing.
 *
 *  ⚖️ THE RULE TEXT IS LIFTED, THE FACTS ARE THE PACK'S. Retyping the instruction
 *  is how this harness has drifted from production five times; retyping the facts
 *  would just be inventing data. */
function productFactsBlock(creator) {
  const facts = creator.productFacts ?? []
  const usable = facts.filter((f) => f.trust === 'usable')
  if (usable.length === 0) return ''
  const lines = usable.map((f) => `  * ${f.field}: ${f.value}`).join('\n')
  return `${PRODUCT_FACTS_RULE.split('\n')[0]}\n${lines}\n${
    PRODUCT_FACTS_RULE.split('\n').slice(1).join('\n')}`
}

async function gen({ creator, refNote, fidelity, tone, goal, withKnowledge = true, answers, cap = KNOWLEDGE_CAP, knowledgeStore }) {
  // Defaults to the creator's whole store; a `sources` arm passes the filtered one.
  knowledgeStore = knowledgeStore ?? creator.knowledge
  const t = creator.truth ?? {}
  // ⚖️ THE ANSWERS ARE AN INPUT, NOT A PROPERTY OF THE PERSON. A run that can
  // only ever send one set of onboarding answers cannot tell whether the script
  // changed because the CREATOR differs or because what they TOLD US differs —
  // and that is the comparison the questions exist to justify.
  const A = { ...creator.answers, ...(answers ?? {}) }
  const PERMS = claimRules(t, goal ?? A.goal)
  // ⚠️ ORDER MIRRORS PRODUCTION, AND IT IS LOAD-BEARING.
  //
  // The rules come FIRST, as they do in `generate-blueprint`'s SYSTEM constant,
  // and the task list comes LAST. When MECHANISM_READ sat near the end instead,
  // 4 of 12 cases returned only `reference_read` and stopped — finishReason
  // STOP, not truncation. Its opening words are "before you write anything
  // else", and in a short prompt a near-final instruction reads as the whole
  // job. In the real SYSTEM it is one bullet with a hundred lines after it.
  const prompt = `You are TwinAI's reference engine. Turn a proven short-form reference into a personalized, shootable blueprint in the creator's OWN voice.

HOW TO READ THE REFERENCE AND HOLD ITS FORMAT
${MECHANISM_READ}

${COUNT_CONTRACT}

DECIDE THE SUBSTANCE BEFORE THE PROSE
${SUBSTANCE_RULES}

HOW TO SHAPE THE VIDEO
${BEAT_PLAN_RULES}
- Write every script line TO ITS BEAT'S target_sec. A line for a 6 second beat is roughly 15 words at a natural pace; a line for a 16 second beat is roughly 40. Do not write a forty word line into a six second beat.
- This is a SHORT-FORM vertical video.

CREATOR DNA
- Name: ${creator.name}
- Signature structure: ${t.signature ?? 'unknown'}
- Argues against: ${t.enemy ?? 'unknown'}
- CTA style: ${t.ctaStyle ?? 'unknown'}
- Commercial relationship: ${t.relationship ?? 'unknown'}
- Owns: ${t.ownsProduct ?? 'nothing confirmed'}
- Can put product on screen: ${t.showability ?? 'UNKNOWN'}
${t.regulated ? `- REGULATED PROFESSIONAL. Forbidden claims:\n${(creator.forbiddenClaims ?? []).map(c => '  * ' + c).join('\n')}` : ''}

CREATOR'S ANSWERS
- Goal: ${goal ?? A.goal}
- Audience: ${A.audience}
- What they do: ${A.workKind}
- Third-party products featured: ${A.promotes}${promotesLine(A.promotes)}
${withKnowledge ? knowledgeBlock(knowledgeStore, `${refNote} ${A.idea ?? ''}`, cap) : ''}
${productFactsBlock(creator)}

REFERENCE (described, not transcribed)
${refNote}

${FID[fidelity]}
${(creator.truth?.regulated || (creator.forbiddenClaims||[]).length) && tone === 'punchy'
  ? "- TONE WAS CLAMPED. This creator works under stated limits on what they may claim, so the punchy register is not available to them: no hype openers (\"you won't believe\", \"this will blow your mind\"), no manufactured certainty. Write with energy, not with bait."
  : ''}
${PERMS.ctaIntentLine}${PERMS.claimRulesBlock}

YOUR TASK: produce the FULL blueprint now — the mechanism read AND the beat plan AND the concept AND five hook options AND every script beat AND the CTA. Reading the reference is the first step, never the deliverable; a response containing only reference_read is incomplete.

Return JSON only, with EVERY key below present and populated:
{"reference_read":{"mechanism":{"enumeration":{"is_enumerated":"","count":"","unit":""},"hook_promise":"","rehook_after_item":"","beat_debts":[""]}},
 "beat_plan":[{"beat":"","target_sec":"","proof":""}],
 "concept":{"premise":""},"hook_options":["","","","",""],
 "script":[{"section":"","line":"","location":"","broll_request":"","wardrobe":"","action_posing":"","substance":"","substance_evidence":""}],
 "cta":""}`

  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA, maxOutputTokens: 20000, temperature: 0.9, thinkingConfig: { thinkingBudget: 0 } },
    }),
  })
  const j = await r.json()
  const txt = j?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!txt) return { error: j?.error?.message ?? j?.candidates?.[0]?.finishReason ?? 'no text' }
  const finish = j?.candidates?.[0]?.finishReason
  if (finish && finish !== 'STOP') console.error(`  finishReason=${finish}`)
  try { return JSON.parse(txt) } catch { return { error: 'unparseable', raw: txt.slice(0, 300) } }
}

const CASES = JSON.parse(process.env.CASES ?? '[]')
const out = []
for (const c of CASES) {
  // ⚠️ EVERY COHORT, or a new one silently resolves to `undefined` and the run
  // dies on `creator.truth` after the cases are already built. Cohort 3 is the
  // real-scan cohort and was invisible here until it crashed the first matrix.
  const creator = [...pack.creators, ...(pack.cohort2?.creators ?? []), ...(pack.cohort3?.creators ?? [])]
    .find(x => x.key === c.creator)
  if (!creator) throw new Error(`unknown creator key ${c.creator} — is its cohort in the lookup above?`)
  // ⚖️ THE PROMPT AND THE RECORD MUST SEE THE SAME STORE. Building the prompt
  // from the full store while recording the filtered one would report an arm
  // that never ran — the `supplied` block exists precisely so a citation cannot
  // "trace" to something the writer never saw.
  const armStore = c.sources
    ? { ...creator.knowledge, items: (creator.knowledge?.items ?? []).filter((i) => c.sources.includes(i.source)) }
    : creator.knowledge
  const bp = await gen({ creator, refNote: c.refNote, fidelity: c.fidelity, tone: c.tone, goal: c.goal, withKnowledge: c.withKnowledge !== false, answers: c.answers, cap: c.cap ?? KNOWLEDGE_CAP, knowledgeStore: armStore })
  // ⚠️ RECORD WHAT THE PROMPT CARRIED, NOT JUST WHAT CAME BACK. Every result
  // file before this one stored `{case, blueprint}` and nothing else, so
  // `grounded` — did this beat trace to something we actually supplied? — was
  // not computable from the corpus at all. That is why the strict resolution
  // ladder could not be measured offline: the ONE fact it needs was the one
  // fact never written down.
  //
  // ⚖️ It is the SELECTED, CAPPED set, taken from the same function that renders
  // the prompt block. Recording the creator's whole store instead would let a
  // citation "trace" to an item the writer never saw, which is the precise
  // failure `substanceIssues` warns about: checking against a fuller set excuses
  // the fabrication the check exists to catch.
  // ⚠️ THE ARM THAT COULD NOT BE EXPRESSED. `withKnowledge:false` removes
  // knowledge entirely, which answers "does knowledge help at all" — a question
  // already settled. The question NOW is what SPEECH adds over TITLES, and that
  // needs the same creator with the same store filtered by SOURCE. Measured on
  // real production rows: captions produced 0 stated items across 637 of them,
  // transcripts produced 10 for this creator alone.
  //
  // ⚖️ FILTERED BEFORE SELECTION, NOT AFTER. `selectKnowledge` ranks and caps;
  // filtering afterwards would let the caption arm be chosen from a pool that
  // included transcript items and then have them removed, which is a different
  // (and flattering) experiment.
  const store = armStore
  const sel = c.withKnowledge === false
    ? { items: [], covered: [] }
    : selectKnowledge(store, `${c.refNote ?? ''} ${c.idea ?? ''}`, c.cap ?? KNOWLEDGE_CAP)
  out.push({
    case: c,
    blueprint: bp,
    supplied: {
      knowledge: sel.items,
      covered: sel.covered.map((x) => x.text),
      // `[]` means we KNOW none were carried; the pack supplies no product
      // facts, and saying so is different from staying silent about it.
      productFacts: creator.productFacts ?? [],
      cap: c.cap ?? KNOWLEDGE_CAP,
    },
  })
  console.error(`done: ${c.creator} / ${c.fidelity} / ${c.label}${c.withKnowledge === false ? " [no-knowledge]" : ""}`)
}
console.log(JSON.stringify(out, null, 2))
