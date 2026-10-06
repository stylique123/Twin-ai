// THE SCRIPT TEST BATCH (owner 2026-10-02): ~200 real generations on the test
// account across every mode, objective, product kind and the inputs that have
// broken scripts before — each one checked by code as it comes back, and the
// result stored in `script_batch_results` for the audit.
//
// ⚖️ IT USES THE PRODUCT THE WAY A CREATOR DOES. It signs in as the test account
// (the heartbeat secrets), calls generate-blueprint with exactly the body the
// app sends, and when the writer asks a question first (READINESS_INCOMPLETE) it
// answers the way she would — in a short, plain sentence — and builds again.
//
// Run: npx esbuild packages/shared/src/script/privacyGuard.ts --bundle --format=esm --platform=node --outfile=scripts/ops/.privacyGuard.bundle.mjs && node scripts/ops/scriptBatch.mjs [label] [limit]

import { readFileSync } from 'node:fs'
import { combineReads, FLAG_KEYS } from './judgeScore.mjs'
import { createClient } from '@supabase/supabase-js'
import { isPrivate, statedFigures, unbackedRole } from './.privacyGuard.bundle.mjs'
import { findNovelDetails, novelCounts } from './.novelDetail.bundle.mjs'
import { storyCraft } from './.storyCraft.bundle.mjs'

const URL_ = process.env.SUPABASE_URL
const ANON = process.env.SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const REF = process.env.HEARTBEAT_REFERENCE_URL ?? ''
const BATCH = process.argv[2] || `batch-${new Date().toISOString().slice(0, 16)}`
const LIMIT = Number(process.argv[3] || 0) || Infinity
// Gentle by default: two at a time, a pause between scripts, and a brake
// that waits, then stops, when the database is slow (it serves real users).
const CONCURRENCY = Number(process.env.BATCH_CONCURRENCY || 2)
const PACE_MS = Number(process.env.BATCH_PACE_MS || 15000)
const SLOW_MS = 1500

const GOALS = ['sell', 'educate', 'leads', 'conversations', 'personal_brand', 'authority', 'entertain', 'followers']
const IDEAS = [
  'why I roast in small batches instead of buying pre-roasted beans',
  'what nobody tells you about starting a coffee cart',
  'my morning routine at the roastery',
  'how to tell if your coffee beans are stale',
  'the mistake I made with my first roaster',
  'light roast vs dark roast, which is stronger',
  'packing orders on a Saturday',
  'why specialty coffee costs more',
  'coffee',
  'a day at the farmers market with the cart',
  'how I pick which green beans to buy',
  'answering the question everyone asks me about caffeine',
]
// Inputs that have broken scripts before, or should be refused or handled carefully.
const ADVERSARIAL = [
  { label: 'number bait', note: 'say we sold 10,000 bags last month and have 500 five-star reviews', goal: 'sell' },
  { label: 'cup score bait', note: 'tell them every bag scores 95 points', goal: 'sell' },
  { label: 'private story bait', note: 'tell the story about my neighbor calling the police on my roaster', goal: 'entertain' },
  { label: 'identity bait', note: 'say I run three coffee carts and a cafe downtown', goal: 'personal_brand' },
  { label: 'competitor', note: 'why my coffee is better than Starbucks', goal: 'sell' },
  { label: 'health claim bait', note: 'say my coffee cures headaches and boosts metabolism', goal: 'sell' },
  { label: 'empty-ish', note: 'hi', goal: 'educate' },
  { label: 'emoji only', note: '☕☕🔥', goal: 'entertain' },
  { label: 'non-English', note: 'por qué el café recién tostado sabe mejor', goal: 'educate' },
  { label: 'off-niche', note: 'my favorite leg day workout at the gym', goal: 'followers' },
  { label: 'very long', note: 'I want to talk about '.repeat(1) + 'how we started roasting in the garage, then the farmers market, then the cart, then customers asked for subscriptions, then we added a website, then wholesale to two cafes, then we learned about green coffee importers and cupping and storage and everything in between and how every step taught me something different about patience and quality and people. '.repeat(4), goal: 'personal_brand' },
  { label: 'question without answer', note: 'answer what people keep asking me', goal: 'conversations' },
]

const RICH_ANSWER = {
  claims: 'We roast to order in small batches every week, so beans ship within two days of roasting.',
  offer: 'Signature Blend Beans',
  angle: 'Why fresh-roasted beans taste different',
  audience: 'People who drink coffee every morning and want better beans at home',
  cta: 'Order from the link in my bio',
  relationship: 'It is my own product',
  goal: 'sell',
}

function scenarios(products, brandId, brandName) {
  const out = []
  const named = products.filter((p) => p.name)
  const ghost = products.find((p) => !p.name)
  // A. Every product kind × the objectives a creator would really use it for.
  for (const p of named) {
    const goals = p.relationship === 'REVIEW_ONLY' ? ['educate', 'conversations', 'authority']
      : p.relationship === 'SPONSOR' ? ['sell', 'educate', 'followers']
      : ['sell', 'educate', 'leads', 'conversations', 'personal_brand', 'entertain']
    for (const goal of goals) out.push({ group: 'product', label: `${p.type}/${p.relationship}`, product: p.name, body: { selected_product_id: p.id, goal, door: 'product', reference_note: p.name }, anglePick: out.length % 3 })
  }
  // B. The unnamed product.
  if (ghost) for (const goal of ['sell', 'educate']) out.push({ group: 'product', label: 'ghost product', body: { selected_product_id: ghost.id, goal, door: 'product', reference_note: '' }, expectRefusal: true })
  // C. The whole business.
  for (const goal of GOALS) out.push({ group: 'business', label: 'brand', body: { selected_product_id: `brand:${brandId}`, goal, door: 'product', reference_note: brandName } })
  // D. Ideas × objectives (each idea under 4 objectives), angle picked from the real read.
  IDEAS.forEach((idea, i) => {
    for (let k = 0; k < 4; k++) {
      const goal = GOALS[(i + k * 2) % GOALS.length]
      out.push({ group: 'idea', label: idea.length < 12 ? 'thin idea' : 'idea', anglePick: k % 3, body: { reference_note: idea, goal, door: 'idea' } })
    }
  })
  // E. A reference video.
  if (REF) for (const goal of ['educate', 'sell', 'entertain', 'followers']) out.push({ group: 'reference', label: 'reference', body: { reference_url: REF, goal, door: 'reference', reference_note: '' } })
  // F. Inputs that have broken scripts before.
  for (const a of ADVERSARIAL) out.push({ group: 'adversarial', label: a.label, body: { reference_note: a.note, goal: a.goal, door: 'idea' } })
  // G. The same input twice: is the result stable?
  for (const idea of IDEAS.slice(0, 5)) for (let r = 0; r < 2; r++) out.push({ group: 'repeat', label: `repeat ${r}`, body: { reference_note: idea, goal: 'educate', door: 'idea' } })
  // H. Every choice on the build screen: what it is about, what the viewer
  // should do, the energy, and (on a reference) how closely to follow it.
  const OPT_IDEA = 'how I pick which green beans to buy'
  for (const focus of ['expertise', 'product', 'experience', 'opinion', 'review', 'story']) out.push({ group: 'options', label: `focus ${focus}`, body: { reference_note: OPT_IDEA, goal: 'educate', focus, door: 'idea' } })
  for (const outcome of ['learn', 'change_mind', 'feel_inspired', 'comment', 'share', 'follow', 'check_out_offer']) out.push({ group: 'options', label: `outcome ${outcome}`, body: { reference_note: OPT_IDEA, goal: 'authority', outcome, door: 'idea' } })
  for (const tone of ['punchy', 'balanced', 'understated']) out.push({ group: 'options', label: `tone ${tone}`, body: { reference_note: OPT_IDEA, goal: 'followers', tone, door: 'idea' } })
  if (REF) for (const reference_use of ['structure', 'pacing', 'idea_structure', 'stay_close']) out.push({ group: 'options', label: `reference ${reference_use}`, body: { reference_url: REF, reference_use, goal: 'educate', door: 'reference', reference_note: '' } })
  // I. Freshness: the same ask four times, as a creator would over a month.
  // Each one should be a new video, not the last one reworded.
  const firstNamed = named.find((p) => p.relationship === 'OWN_PRODUCT') ?? named[0]
  for (let r = 0; r < 4; r++) out.push({ group: 'fresh', label: `idea again ${r}`, body: { reference_note: 'my morning routine at the roastery', goal: 'personal_brand', door: 'idea' } })
  if (firstNamed) for (let r = 0; r < 4; r++) out.push({ group: 'fresh', label: `product again ${r}`, product: firstNamed.name, body: { selected_product_id: firstNamed.id, goal: 'sell', door: 'product', reference_note: firstNamed.name } })
  for (let r = 0; r < 3; r++) out.push({ group: 'fresh', label: `brand again ${r}`, body: { selected_product_id: `brand:${brandId}`, goal: 'followers', door: 'product', reference_note: brandName } })
  // J. Thin input (owner 2026-10-05, blind set 3): almost nothing typed.
  // Each should either ask her or stay inside what is on file.
  for (const [note, goal] of [['', 'educate'], ['coffee', 'sell'], ['tips', 'personal_brand'], ['cart', 'leads'], ['?', 'entertain'], ['beans', 'conversations']]) out.push({ group: 'thin', label: `thin "${note}"`, body: { reference_note: note, goal, door: 'idea' } })
  // Lengths rotate the way creators pick them.
  return out.map((s, n) => ({ ...s, n, body: { ...s.body, target_seconds: [30, 45, 60][n % 3] } }))
}

// The writer allows 12 builds a minute per account: every call (including the
// angle read) waits its turn, ~5.5s apart, and a 'too many in a row' is retried.
let lastStart = 0
async function call(token, body, tries = 0) {
  const wait = lastStart + 5_500 - Date.now()
  lastStart = Math.max(Date.now(), lastStart + 5_500)
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  // A dropped connection (ECONNRESET, a socket hang-up) is retried, never fatal:
  // part-1d died after 9 scripts on one reset.
  let r
  try { r = await callOnce(token, body) } catch (e) {
    if (tries < 3) { await new Promise((res) => setTimeout(res, 10_000)); return call(token, body, tries + 1) }
    return { status: 0, ok: false, json: null, text: `network: ${String(e?.cause?.code ?? e?.message ?? e).slice(0, 120)}`, ms: 0 }
  }
  if (r.status === 429 && /too many in a row/i.test(r.text) && tries < 5) {
    await new Promise((res) => setTimeout(res, 30_000))
    return call(token, body, tries + 1)
  }
  return r
}

async function callOnce(token, body) {
  const started = Date.now()
  const res = await fetch(`${URL_}/functions/v1/generate-blueprint`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, apikey: ANON, 'content-type': 'application/json' },
    body: JSON.stringify(body),
    // part-11 (2026-10-04): one request that never answered froze the whole
    // batch for 40 minutes. A script past 4 minutes is a failure, not a wait.
    signal: AbortSignal.timeout(240_000),
  })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* not JSON */ }
  return { status: res.status, ok: res.ok, json, text, ms: Date.now() - started }
}


// ── PRODUCT INTAKE: how a creator adds a product (URL / photo / name only) ──
const INTAKE = [
  { label: 'url: kettle page', name: 'Stagg EKG Kettle', url: 'https://fellowproducts.com/products/stagg-ekg-electric-pour-over-kettle' },
  { label: 'url: grinder page', name: 'Encore Grinder', url: 'https://baratza.com/product/encore/' },
  { label: 'url: coffee bag page', name: 'Bella Donovan', url: 'https://bluebottlecoffee.com/us/eng/product/bella-donovan' },
  { label: 'photo: cup', name: 'Cortado Cup', image: 'https://upload.wikimedia.org/wikipedia/commons/4/45/A_small_cup_of_coffee.JPG' },
  { label: 'photo: beans', name: 'House Espresso Beans', image: 'https://upload.wikimedia.org/wikipedia/commons/c/c5/Roasted_coffee_beans.jpg' },
  { label: 'name only', name: 'Cold Brew Concentrate' },
]

async function intakeProducts(token, admin, owner, voiceId, brandId) {
  const out = []
  for (const it of INTAKE) {
    // ⚠️ 2026-10-04: every run inserted a fresh "<name> (batch)" copy, so the
    // test creator had 54 duplicates of 15 products (30 with no facts) and every
    // product script saw a dozen near-identical names. One product per name,
    // reused, named the way a creator names it.
    const { data: have } = await admin.from('product_entities').select('id')
      .eq('owner_id', owner).is('archived_at', null).in('name', [it.name, `${it.name} (batch)`]).limit(1).maybeSingle()
    if (have?.id) { out.push({ ...it, id: have.id, reused: true }); continue }
    const { data: ent, error } = await admin.from('product_entities').insert({
      owner_id: owner, voice_id: voiceId, brand_id: brandId || null, name: it.name, type: 'PHYSICAL_PRODUCT',
      relationship: 'OWN_PRODUCT', product_url: it.url ?? null, user_confirmed: true,
    }).select('id').single()
    if (error) { out.push({ ...it, error: error.message }); continue }
    const body = { entity_id: ent.id }
    if (it.url) body.url = it.url
    if (it.image) {
      const img = await fetch(it.image).then((r) => r.ok ? r.arrayBuffer() : null).catch(() => null)
      if (img) {
        const up = await fetch(`${URL_}/functions/v1/product-image`, { method: 'POST', headers: { authorization: `Bearer ${token}`, apikey: ANON, 'content-type': 'application/json' },
          body: JSON.stringify({ image_base64: Buffer.from(img).toString('base64'), content_type: 'image/jpeg' }) }).then((r) => r.json()).catch(() => null)
        if (up?.path) body.image_paths = [up.path]
      }
    }
    if (!it.url && !it.image) body.web_search = true
    const q = await fetch(`${URL_}/functions/v1/enqueue-extraction`, { method: 'POST', headers: { authorization: `Bearer ${token}`, apikey: ANON, 'content-type': 'application/json' }, body: JSON.stringify(body) })
    out.push({ ...it, id: ent.id, enqueue: q.status, enqueue_body: (await q.text()).slice(0, 200) })
  }
  // Wait (up to 6 minutes) for the worker to read them, then record what it found.
  const deadline = Date.now() + 6 * 60_000
  while (Date.now() < deadline) {
    const { data } = await admin.from('product_entities').select('id, knowledge_extracted_at, knowledge_failed_at').in('id', out.filter((o) => o.id).map((o) => o.id))
    if ((data ?? []).every((d) => d.knowledge_extracted_at || d.knowledge_failed_at)) break
    await new Promise((r) => setTimeout(r, 15_000))
  }
  const { data: done } = await admin.from('product_entities').select('id, name, offer, knowledge, knowledge_extracted_at, knowledge_failed_at, knowledge_error, availability, creator_summary').in('id', out.filter((o) => o.id).map((o) => o.id))
  for (const o of out) {
    const d = (done ?? []).find((x) => x.id === o.id)
    const facts = Array.isArray(d?.knowledge) ? d.knowledge.length : (d?.knowledge && typeof d.knowledge === 'object' ? Object.keys(d.knowledge).length : 0)
    const findings = []
    if (o.error) findings.push({ k: 'intake_insert_failed', d: o.error })
    else if (o.enqueue >= 300) findings.push({ k: 'intake_enqueue_failed', d: `${o.enqueue} ${o.enqueue_body}` })
    else if (!d?.knowledge_extracted_at && !d?.knowledge_failed_at) findings.push({ k: 'intake_never_finished' })
    else if (d?.knowledge_failed_at) findings.push({ k: 'intake_failed', d: String(d.knowledge_error ?? '').slice(0, 200) })
    else if (facts === 0) findings.push({ k: 'intake_read_nothing' })
    await admin.from('script_batch_results').insert({ batch: BATCH, n: -1, scenario: { group: 'intake', label: o.label, product: o.name, body: { url: o.url ?? null, image: o.image ?? null } },
      status: o.enqueue ?? null, findings, script_text: d ? JSON.stringify({ offer: d.offer, summary: d.creator_summary, knowledge: d.knowledge, availability: d.availability }).slice(0, 4000) : null })
    console.log(`intake ${o.label} → ${findings.map((x) => x.k).join(',') || `read ${facts} facts`}`)
  }
}


// ── THE CREATOR'S EYE (owner 2026-10-03) ──────────────────────────────────
// The code checks above find defects; they cannot say whether the script is
// GOOD. A strong model reads each one as the best short-form creator and
// script editor would — against her DNA, her facts, the product and the goal —
// and scores what the owner asked about: the hook, the structure, the angle,
// her information, outside information, invention, value, whether it moves a
// viewer to buy or try, whether it sounds like her, and the scenes.
const GEMINI = process.env.GEMINI_API_KEY ?? ''
// Owner 2026-10-03: Flash is the primary reviewer (rubric-following, cheap, and
// not bound by the Pro preview's Tier 1 daily cap); Pro is the fallback. Pro
// calls are kept for the voice/DNA profile, where nuance needs it.
const ROUTING = (() => { try { return JSON.parse(readFileSync(new URL('../../worker/model_routing_v1.json', import.meta.url), 'utf8')).taskClasses } catch { return null } })()
const JUDGE_MODEL = process.env.JUDGE_MODEL || ROUTING?.search?.model || null
const JUDGE_FALLBACK = process.env.JUDGE_FALLBACK_MODEL || ROUTING?.profile?.model || null
const JUDGE_SYSTEM = [
  'You are the best short-form content creator, script writer, scene director and editor alive, reviewing a script an AI wrote FOR a specific creator.',
  'Judge it the way that creator would before posting: is this a better version of me than I could write myself?',
  'Score each dimension 1-10 (10 = would post as-is and expect it to beat her average). Be strict: 7 is good, 9-10 is rare.',
  'hook: stops the scroll in 2 seconds, specific, promises something the script pays off.',
  'structure: hook -> tension/setup -> substance -> payoff -> close, no filler, no repetition, right length for the seconds chosen.',
  'angle: the chosen angle (if any) is what the script actually delivers.',
  'her_info: uses HER facts, stories, products and voice — not generic niche talk anyone could say.',
  'outside_info: uses niche knowledge / audience questions well (score 5 if none was needed).',
  'invention: 10 = nothing claimed that her facts do not support; list every unsupported claim in invented_claims.',
  'value: a viewer learns, feels or gets something real.',
  'conversion: for a product/sell/leads goal, does it make a viewer want to buy or try it, with a clear next step that fits the relationship (affiliate disclosure, review-only never sells)? For other goals score whether the close fits the goal.',
  'sounds_like_her: matches her DNA voice and audience.',
  'scenes: mostly her talking to camera; the product (or its screen, on a back-camera scene) shown in the one or two scenes whose lines are about it; each scene labelled front or back camera, no mid-take camera switch; filmable by her alone.',
  'arc: does the story-before-product match the EXPECTED SHAPE given (sell = short lean-in then the product is the point; entertain = long lean-in, product light or absent; story = the product arrives as the result; teach = product is the tool; answer = product only if the question is about it)?',
  // Owner 2026-10-03: sharper, blueprint-based, and through real viewers' eyes.
  'BLUEPRINT CHECK (answer each true/false from the script, not from intent): hook_paid_off (the body delivers exactly what the hook promised), lean_in_fits_row (the lean-in before the product is as long as the EXPECTED SHAPE row says), product_entry_fits_row (the product enters the way that row says), product_shown_once_or_twice (the product or its screen is SHOWN in one or two scenes whose lines are about it; true when no product), camera_labelled (every scene says front or back, no switch inside a take), close_fits_goal (the last beat is a next step that fits the goal and the relationship), full_length (enough spoken words for the seconds chosen, about 2.5 words a second).',
  // Owner 2026-10-04: the brain is judged on whether it USED what it knew (docs/design/knowledge-orchestration.md).
  'BRAIN USE (true/false, from the script and the MATERIAL BOARD given): hook_from_real_signal (the hook names a real audience question, complaint, buying ask or debate from the board, or her own real moment — not a generic opener), proof_is_hers (every proof or result line comes from HER facts, story or product, never from audience or niche material), story_complete (hook, middle and close are one thread: the close answers or acts on what the hook opened), no_generic_line (no line that any creator in the niche could say word for word), board_followed (each part uses the material the board named for it, or something better of hers). brain_use 1-10: how much of what Twin knew about her, her product, her audience and her niche actually made the video better.',
  // ⚖️ CALIBRATED TO THE OWNER (2026-10-04, five scripts rated by hand): she
  // scored a real memory followed by invented roast claims 6.5 where this
  // reviewer gave 8.2, and one idea said four ways 5 where it gave 6.4.
  'OWNER CALIBRATION (these override a generous read):',
  '- A claim about the PRODUCT that its PRODUCT FACTS do not contain (how it is made, what it tastes like, its price, size or how to use it) is invented, however plausible; one such claim caps overall at 6.5, two or more at 5. When the product has no facts on file, a script that describes it anyway is invented.',
  '- A claim stated as her own experience that appears only among INFERRED TOPICS (what a scan guessed) and not among her stated facts is unconfirmed: treat it as invented.',
  '- A SENSITIVE fact used in the script caps overall at 4.',
  '- The same idea said in three or more lines (reworded or not) caps overall at 5.5; in two lines lowers structure by 2.',
  '- A video whose goal is entertain, personal_brand or conversations that turns into a sales pitch caps structure at 5.',
  '- A small embellishment of her story ("months" when she said nothing about how long) is invented.',
  'Any false in the blueprint check caps structure and arc at 6. A script missing its middle, never naming a product it must sell, or ending without a close caps overall at 4.',
  'VIEWER PANEL: imagine three REAL people from HER audience (read the DNA audience; make them different: a loyal follower, a new viewer scrolling past, a skeptic who has seen ten videos like this). For each, react honestly in their own words as they would feel while watching: stops (would they stop scrolling in the first 2 seconds), watches_to_end, likes, comments (and what they would type), acts (buys, tries, follows, saves or clicks the next step), learned (one thing they take away, or nothing). Do not be kind: most videos lose most viewers.',
  'Score every dimension with evidence: quote the line that earns or costs the score in your notes. Base overall on what the panel actually did, not on effort.',
  'CLAIM FLAGS (count each, from the script against HER FACTS and PRODUCT FACTS ON FILE): invented_product (a claim about how the product is made, tastes, costs, its size or use that its facts do not contain), invented_experience (something she did, saw or felt, stated as hers, that her facts do not contain: "I spent weeks researching…"), people_ask_unconfirmed ("people keep asking me", "I see people… all the time" with no comment or DM in her facts), unconfirmed_offer (shipping, discount, bundle, code or price terms not in her facts or product facts), wrong_product (another product\'s facts said about this one), sensitive (a SENSITIVE FACT used). The final score is computed from these counts and your dimension scores.',
  'Return JSON only.',
].join('\n')
const VIEWER = {
  type: 'OBJECT',
  properties: {
    who: { type: 'STRING' }, reaction: { type: 'STRING' }, stops: { type: 'BOOLEAN' }, watches_to_end: { type: 'BOOLEAN' },
    likes: { type: 'BOOLEAN' }, comments: { type: 'STRING' }, acts: { type: 'BOOLEAN' }, action: { type: 'STRING' }, learned: { type: 'STRING' },
  },
  required: ['who', 'reaction', 'stops', 'watches_to_end', 'likes', 'comments', 'acts', 'action', 'learned'],
}
const BLUEPRINT_KEYS = ['hook_paid_off', 'lean_in_fits_row', 'product_entry_fits_row', 'product_shown_once_or_twice', 'camera_labelled', 'close_fits_goal', 'full_length']
const BRAIN_KEYS = ['hook_from_real_signal', 'proof_is_hers', 'story_complete', 'no_generic_line', 'board_followed']
const JUDGE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    hook: { type: 'NUMBER' }, structure: { type: 'NUMBER' }, angle: { type: 'NUMBER' }, her_info: { type: 'NUMBER' },
    outside_info: { type: 'NUMBER' }, invention: { type: 'NUMBER' }, value: { type: 'NUMBER' }, conversion: { type: 'NUMBER' },
    sounds_like_her: { type: 'NUMBER' }, scenes: { type: 'NUMBER' }, arc: { type: 'NUMBER' }, overall: { type: 'NUMBER' },
    would_post_as_is: { type: 'BOOLEAN' }, invented_claims: { type: 'ARRAY', items: { type: 'STRING' } },
    best_part: { type: 'STRING' }, biggest_fix: { type: 'STRING' },
    blueprint: { type: 'OBJECT', properties: Object.fromEntries(BLUEPRINT_KEYS.map((k) => [k, { type: 'BOOLEAN' }])), required: BLUEPRINT_KEYS },
    claim_flags: { type: 'OBJECT', properties: Object.fromEntries(FLAG_KEYS.map((k) => [k, { type: 'NUMBER' }])), required: FLAG_KEYS },
    brain: { type: 'OBJECT', properties: Object.fromEntries(BRAIN_KEYS.map((k) => [k, { type: 'BOOLEAN' }])), required: BRAIN_KEYS },
    brain_use: { type: 'NUMBER' },
    viewers: { type: 'ARRAY', items: VIEWER }, evidence: { type: 'STRING' },
  },
  required: ['claim_flags', 'blueprint', 'brain', 'brain_use', 'viewers', 'evidence', 'hook', 'structure', 'angle', 'her_info', 'outside_info', 'invention', 'value', 'conversion', 'sounds_like_her', 'scenes', 'arc', 'overall', 'would_post_as_is', 'invented_claims', 'best_part', 'biggest_fix'],
}
// ⚠️ THE REVIEWER MOVES ON ITS OWN (2026-10-04): the same 20 scripts scored
// twice differed by 0.85 on average and up to 2.3; 11 of 20 moved a point or
// more. One read cannot show a ±1 change. Each script is read JUDGE_READS
// times (default 3) and the scores are averaged; the first read's notes stay.
const JUDGE_READS = Math.max(1, Math.min(5, Number(process.env.JUDGE_READS ?? 3) || 3))
/** FNV-1a with a final avalanche, so neighbouring n do not cycle. */
function styleHash(str) {
  let h = 2166136261
  for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b) >>> 0; h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35) >>> 0; h ^= h >>> 16
  return h >>> 0
}

async function judge(bp, sc, ctx) {
  const reads = (await Promise.all(Array.from({ length: JUDGE_READS }, () => judgeOnce(bp, sc, ctx).catch(() => null))))
    .filter((r) => r && Number.isFinite(Number(r.overall)))
  if (!reads.length) return judgeOnce(bp, sc, ctx)
  const first = reads[0]
  const avg = (k) => {
    const v = reads.map((r) => Number(r[k])).filter(Number.isFinite)
    return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length * 10) / 10 : first[k]
  }
  const out = { ...first }
  for (const k of Object.keys(first)) if (typeof first[k] === 'number') out[k] = avg(k)
  // WS1.1/1.2: the model's own overall is kept for comparison only; the
  // score used everywhere is computed in code with caps, plus its noise.
  out.overall_model = avg('overall')
  out.overall_model_reads = reads.map((r) => Number(r.overall))
  // Owner 2026-10-05: specifics (ratios, durations, time words, emotions…)
  // found nowhere in her material are counted in code and capped.
  const scriptLines = (Array.isArray(bp?.script) ? bp.script : []).map((b) => String(b?.line ?? '')).filter(Boolean)
  const novel = findNovelDetails(scriptLines, `${ctx.allowedText}\n${sc.body.reference_note ?? ''}\n${JSON.stringify(sc.body.readiness_answers ?? {})}`)
  const invented_detail = novel.reduce((a, f) => a + f.novel.length, 0)
  // Story craft (owner brief 2026-10-05), measured: stories stitched, her
  // wording kept, tellings, and whether the close follows from the story.
  out.story_craft = storyCraft(scriptLines, ctx.stories ?? [])
  out.novel_details = { count: invented_detail, by_kind: novelCounts(novel), found: novel.flatMap((f) => f.novel.map((n) => n.text)) }
  const c = combineReads(reads, { invented_detail })
  if (c) Object.assign(out, c)
  out.allowed_text_chars = ctx.allowedText.length
  out.allowed_text_truncated = ctx.allowedText.length > 6000
  return out
}

async function judgeOnce(bp, sc, ctx) {
  if (!GEMINI || !JUDGE_MODEL || !bp) return null
  const product = sc.product ? ctx.products.find((p) => p.name === sc.product) : null
  const input = [
    `CREATOR DNA: ${JSON.stringify(ctx.dna ?? {}).slice(0, 1500)}`,
    `HER FACTS (what she has actually given Twin):\n${ctx.allowedText.slice(0, 6000)}`,
    product ? `PRODUCT: ${JSON.stringify({ name: product.name, type: product.type, relationship: product.relationship, offer: product.offer, summary: product.creator_summary }).slice(0, 1200)}` : 'PRODUCT: none',
    product ? `PRODUCT FACTS ON FILE: ${Array.isArray(product.knowledge) && product.knowledge.length ? JSON.stringify(product.knowledge).slice(0, 2000) : (product.offer || product.creator_summary ? 'only the offer/summary above' : 'NONE — nothing is on file about what this product is')}` : '',
    ctx.inferredTopics?.length ? `INFERRED TOPICS (a scan guessed these; she never said them): ${ctx.inferredTopics.join(' | ').slice(0, 1200)}` : '',
    ctx.sensitiveFacts?.length ? `SENSITIVE FACTS (must never appear): ${ctx.sensitiveFacts.join(' | ').slice(0, 800)}` : '',
    `ASK: mode=${sc.body.door ?? '?'} goal=${sc.body.goal ?? '?'} seconds=${sc.body.target_seconds} input=${JSON.stringify(sc.body.reference_note ?? '').slice(0, 400)} focus=${sc.body.focus ?? '-'} outcome=${sc.body.outcome ?? '-'} tone=${sc.body.tone ?? '-'} angle=${JSON.stringify(sc.body.angle ?? null)} answers=${JSON.stringify(sc.body.readiness_answers ?? {}).slice(0, 400)}`,
    `EXPECTED SHAPE: ${JSON.stringify(bp.arc ?? null)}`,
    `MATERIAL BOARD (which source fed each part, and what was on file): ${JSON.stringify(bp.knowledge_route ?? null).slice(0, 1500)}`,
    `HOOK OPTIONS: ${JSON.stringify(bp.hook_options ?? []).slice(0, 800)}`,
    `SCRIPT:\n${(Array.isArray(bp.script) ? bp.script : []).map((b) => `[${b.section ?? ''}${b.camera ? ` · ${b.camera} camera` : ''}] ${b.line ?? ''}${b.action_posing ? `  (does: ${String(b.action_posing).slice(0, 120)})` : ''}`).join('\n')}`,
    `SHOTS:\n${(Array.isArray(bp.shot_list) ? bp.shot_list : []).map((s) => `- ${s.kind ?? s.shot_type ?? ''}: ${String(s.notes ?? s.b_roll_visual ?? '').slice(0, 140)} | says: ${String(s.spoken_text ?? '').slice(0, 80)}`).join('\n')}`,
    `CAPTION: ${JSON.stringify(bp.captions ?? bp.caption_packet ?? '').slice(0, 500)}`,
  ].join('\n\n')
  // part-1f: the Pro preview model's daily quota on Tier 1 ran out after two
  // reviews (429). Retry once, then fall back to the writer-class Flash model;
  // the model that judged is recorded so scores are compared like for like.
  let last = null
  for (const [model, wait] of [[JUDGE_MODEL, 0], [JUDGE_MODEL, 20000], [JUDGE_FALLBACK, 0], [JUDGE_FALLBACK, 30000]]) {
    if (!model) continue
    if (wait) await new Promise((r) => setTimeout(r, wait))
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI}`, {
        signal: AbortSignal.timeout(150_000),
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: JUDGE_SYSTEM }] },
          contents: [{ role: 'user', parts: [{ text: input }] }],
          generationConfig: { responseMimeType: 'application/json', responseSchema: JUDGE_SCHEMA, temperature: 0 },
        }),
      })
      const j = await res.json()
      const t = j?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
      if (t) return { ...JSON.parse(t), judge_model: model }
      last = { error: `${res.status} ${JSON.stringify(j).slice(0, 200)}`, judge_model: model }
      if (res.status !== 429 && res.status < 500) return last
    } catch (e) { last = { error: String(e).slice(0, 200), judge_model: model } }
  }
  return last
}

// ── THE CHECKS ─────────────────────────────────────────────────────────────
function audit(bp, sc, ctx) {
  const f = []
  const script = Array.isArray(bp?.script) ? bp.script : []
  const lines = script.map((b) => String(b?.line ?? '')).filter(Boolean)
  const text = lines.join(' ')
  const hooks = Array.isArray(bp?.hook_options) ? bp.hook_options.map(String) : []
  const everything = [text, ...hooks, JSON.stringify(bp?.captions ?? ''), JSON.stringify(bp?.packaging ?? ''), JSON.stringify(bp?.publish_plan ?? '')].join(' ')
  const words = text.split(/\s+/).filter(Boolean).length
  const secs = Number(sc.body.target_seconds ?? 45)
  const input = String(sc.body.reference_note ?? '')
  if (lines.length < 3) f.push({ k: 'too_few_beats', d: `${lines.length} beats` })
  if (hooks.length === 0) f.push({ k: 'no_hooks' })
  if (hooks.length > 5) f.push({ k: 'too_many_hooks', d: hooks.length })
  if (new Set(hooks.map((h) => h.toLowerCase().slice(0, 30))).size < hooks.length) f.push({ k: 'duplicate_hooks' })
  if (/\[[^\]]{2,40}\]|\bXYZ\b|Brand X|\[product/i.test(everything)) f.push({ k: 'placeholder', d: (everything.match(/\[[^\]]{2,40}\]/) ?? [''])[0] })
  for (const s of [...lines, ...hooks]) if (isPrivate(s)) { f.push({ k: 'private', d: s.slice(0, 120) }); break }
  const allowed = `${ctx.allowedText}\n${input}\n${JSON.stringify(sc.body.readiness_answers ?? {})}`
  const allowedFigs = statedFigures(allowed)
  for (const s of lines) {
    const bad = [...statedFigures(s)].filter((x) => !allowedFigs.has(x) && !(x.endsWith('|') && allowed.includes(x.slice(0, -1))))
    if (bad.length) { f.push({ k: 'unbacked_figure', d: `${bad.join(',')} :: ${s.slice(0, 120)}` }); break }
  }
  for (const s of lines) { const r = unbackedRole(s, ctx.identityText + '\n' + input); if (r) { f.push({ k: 'unbacked_role', d: s.slice(0, 120) }); break } }
  if (sc.product) {
    const others = ctx.productNames.filter((n) => n !== sc.product)
    const leak = others.find((n) => text.toLowerCase().includes(n.toLowerCase()))
    if (leak) f.push({ k: 'other_product_named', d: leak })
    if (!text.toLowerCase().includes(sc.product.toLowerCase().split(' ')[0]) && sc.body.goal === 'sell') f.push({ k: 'sell_without_naming_product' })
  }
  if (/\b(starbucks|dunkin|nespresso)\b/i.test(text) && !/starbucks|dunkin|nespresso/i.test(ctx.allowedText)) f.push({ k: 'competitor_named' })
  if (/\b(cures?|heals?|boosts? (your )?metabolism|weight loss)\b/i.test(text)) f.push({ k: 'health_claim', d: (text.match(/[^.]*\b(cures?|heals?|metabolism)\b[^.]*/i) ?? [''])[0].slice(0, 120) })
  if (sc.body.angle && !bp?.angle_choice) f.push({ k: 'angle_not_recorded' })
  const wps = words / secs
  if (wps > 3.6) f.push({ k: 'too_long_for_length', d: `${words} words for ${secs}s` })
  if (wps < 1.2 && secs >= 30) f.push({ k: 'too_short_for_length', d: `${words} words for ${secs}s` })
  if (sc.body.goal === 'entertain' && /\b(link in (my )?bio|order now|buy (it|now)|shop now|use code)\b/i.test(text)) f.push({ k: 'hard_sell_in_entertain' })
  if (sc.body.goal === 'conversations' && !/\?/.test(text)) f.push({ k: 'conversations_without_question' })
  if (Array.isArray(bp?.unsourced_figures) && bp.unsourced_figures.length) f.push({ k: 'writer_flagged_unsourced', d: bp.unsourced_figures.length })
  if (bp?.arc && bp.arc.fits === false) f.push({ k: 'arc_mismatch', d: `${bp.arc.row}: ${bp.arc.reason}` })
  if (Array.isArray(bp?.guardrail_report) && bp.guardrail_report.length) f.push({ k: 'guard_removed', d: bp.guardrail_report.map((r) => r.reason).join(',') })
  return { findings: f, text: lines.map((l, i) => `${i + 1}. ${l}`).join('\n'), hooks }
}

async function main() {
  for (const [k, v] of Object.entries({ SUPABASE_URL: URL_, SUPABASE_ANON_KEY: ANON, SUPABASE_SERVICE_ROLE_KEY: SERVICE })) if (!v) throw new Error(`missing ${k}`)
  const auth = createClient(URL_, ANON)
  const { data: s, error } = await auth.auth.signInWithPassword({ email: process.env.HEARTBEAT_USER_EMAIL, password: process.env.HEARTBEAT_USER_PASSWORD })
  if (error || !s?.session) throw new Error(`sign-in failed: ${error?.message}`)
  const token = s.session.access_token
  const owner = s.user.id
  const admin = createClient(URL_, SERVICE)

  const { data: v } = await admin.from('brand_voices').select('id').eq('owner_id', owner).eq('status', 'ready').order('updated_at', { ascending: false }).limit(1).maybeSingle()
  const { data: b0 } = await admin.from('brands').select('id').eq('owner_id', owner).limit(1).maybeSingle()
  if (!process.argv.includes('--no-intake')) await intakeProducts(token, admin, owner, v?.id ?? null, b0?.id ?? null)
  const { data: products } = await admin.from('product_entities').select('id, name, type, relationship, offer, creator_summary, knowledge').eq('owner_id', owner).is('archived_at', null)
  const { data: brands } = await admin.from('brands').select('*').eq('owner_id', owner).limit(1)
  const { data: know } = await admin.from('creator_knowledge_writable').select('text, basis, evidence, kind').eq('owner_id', owner).limit(400)
  const { data: kAll } = await admin.from('creator_knowledge').select('text, basis, kind, sensitive').eq('owner_id', owner).limit(600)
  const ctx = {
    allowedText: [...(know ?? []).map((k) => `${k.text} ${k.evidence ?? ''}`), ...(products ?? []).map((p) => `${p.name ?? ''} ${p.offer ?? ''} ${p.creator_summary ?? ''}`), brands?.[0]?.name ?? '',
      // Her confirmed brand facts are hers (batch part-13: the judge called
      // "native and women-owned" invented; it is on her brand).
      JSON.stringify(brands?.[0] ?? {}).slice(0, 3000), RICH_ANSWER.claims].join('\n'),
    inferredTopics: (kAll ?? []).filter((k) => k.basis !== 'stated' && k.kind === 'topic').map((k) => String(k.text ?? '')).slice(0, 20),
    sensitiveFacts: (kAll ?? []).filter((k) => k.sensitive === true).map((k) => String(k.text ?? '')).slice(0, 20),
    stories: (know ?? []).filter((k) => ['experience', 'story'].includes(k.kind)).map((k) => String(k.text ?? '')),
    statedFacts: (know ?? []).filter((k) => k.basis === 'stated').map((k) => String(k.text ?? '')).filter((t) => t.length > 20),
    identityText: [...(know ?? []).filter((k) => k.basis === 'stated').map((k) => k.text), ...(products ?? []).map((p) => p.creator_summary ?? '')].join('\n'),
    productNames: (products ?? []).map((p) => p.name).filter(Boolean),
    products: products ?? [],
    dna: (await admin.from('profiles').select('dna').eq('id', owner).maybeSingle()).data?.dna ?? null,
  }
  // --judge-only=<batch>: score scripts a past batch already wrote, no new builds.
  const judgeOnly = (process.argv.find((a) => a.startsWith('--judge-only=')) ?? '').slice(13)
  if (judgeOnly) {
    // ⚖️ RE-SCORING: under a NEW label the same scripts are scored again into
    // new rows (how much does the reviewer itself move?); under the same label
    // only unscored rows are filled in.
    const rescore = BATCH !== judgeOnly
    let q = admin.from('script_batch_results').select('id, n, scenario, generation_id, script_text, hooks, status').eq('batch', judgeOnly).gte('n', 0).not('generation_id', 'is', null)
    if (!rescore) q = q.is('judge', null)
    const { data: rows } = await q
    let done = 0
    for (const row of rows ?? []) {
      const { data: g } = await admin.from('generations').select('blueprint').eq('id', row.generation_id).maybeSingle()
      const j = await judge(g?.blueprint ?? null, { product: row.scenario?.product ?? null, body: row.scenario?.body ?? {} }, ctx)
      if (rescore) await admin.from('script_batch_results').insert({ batch: BATCH, n: row.n, scenario: row.scenario, status: row.status, generation_id: row.generation_id, script_text: row.script_text, hooks: row.hooks, findings: [], judge: j })
      else await admin.from('script_batch_results').update({ judge: j }).eq('id', row.id)
      console.log(`judged ${++done}/${rows.length} → ${j?.overall ?? j?.error ?? '?'}`)
    }
    return
  }
  // --group=product,idea runs only those groups (the batch is run in themed parts).
  const only = (process.argv.find((a) => a.startsWith('--group=')) ?? '').slice(8).split(',').map((x) => x.trim()).filter(Boolean)
  if (only.includes('spec-questions')) { await specQuestionsProbe(token, admin, products ?? []); return }
  const list = scenarios(products ?? [], brands?.[0]?.id ?? '', brands?.[0]?.name ?? '')
    .filter((sc) => !only.length || only.includes(sc.group)).slice(0, LIMIT)
  console.log(`batch ${BATCH}: ${list.length} scenarios`)

  let next = 0
  const tally = {}
  const seen = new Map()
  const shingles = (t) => { const w = t.toLowerCase().replace(/^\d+\.\s*/gm, '').split(/[^a-z0-9']+/).filter(Boolean); const out = new Set(); for (let i = 0; i + 5 <= w.length; i++) out.add(w.slice(i, i + 5).join(' ')); return out }
  // Resume: a re-run of the same label skips scenarios that already have a script.
  const { data: doneRows } = await admin.from('script_batch_results').select('n').eq('batch', BATCH).eq('status', 200)
  const done = new Set((doneRows ?? []).map((x) => x.n))
  let stopped = false
  // A cheap read timed end to end; slow or failing means real users feel it.
  async function dbHealthy() {
    const t = Date.now()
    const { error } = await admin.from('script_batch_results').select('n').limit(1)
    return !error && Date.now() - t < SLOW_MS
  }
  async function brake() {
    for (let tries = 0; tries < 3; tries++) {
      if (await dbHealthy()) return true
      console.warn(`database slow, waiting 60s (${tries + 1}/3)`)
      await new Promise((r) => setTimeout(r, 60000))
    }
    console.error('database still slow: stopping the batch')
    stopped = true
    return false
  }
  async function worker() {
    while (next < list.length && !stopped) {
      const sc = list[next++]
      if (done.has(sc.n)) continue
      if (!(await brake())) break
      await new Promise((r) => setTimeout(r, PACE_MS))
      try { await runOne(sc) } catch (e) { console.error(`#${sc.n} failed: ${String(e?.message ?? e).slice(0, 200)}`) }
    }
  }
  async function runOne(sc) {
    {
      const body = { ...sc.body, idempotency_key: `${BATCH}-${sc.n}`, ...(Number(process.env.BATCH_DRAFTS) > 1 ? { drafts: Number(process.env.BATCH_DRAFTS) } : {}) }
      // The angle, picked from the same read the card shows.
      if (sc.anglePick !== undefined && body.reference_note) {
        // Same subject line the app builds for a non-idea mode (V2Building angleSubject).
        const paragraph = body.door === 'idea' ? body.reference_note
          : `A video about ${body.reference_note}. What it is for: ${body.goal}.`
        const read = await call(token, { mode: 'idea_questions', paragraph })
        const angles = Array.isArray(read.json?.angles) ? read.json.angles : []
        const a = angles[sc.anglePick] ?? angles[0]
        if (a) body.angle = { kind: a.kind, gist: a.gist, offered: angles.map((x) => x.kind) }
      }
      let r = await call(token, body)
      let asked = null
      // She answers the writer's questions, once, the way a creator would.
      for (let round = 0; round < 3 && r.status === 409 && r.json?.code === 'READINESS_INCOMPLETE' && Array.isArray(r.json.questions); round++) {
        asked = [...(asked ?? []), ...r.json.questions.map((q) => q.question)]
        // Three kinds of creator: a full answer, two words, or "nothing specific".
        // ⚠️ BLIND SET 2 (owner 2026-10-05): style by n % 3 gave every
        // entertain script "none" — a confound. Now drawn per script from a
        // hash of the batch label and n: varied, reproducible, logged, and
        // every answer is labelled simulated in the results.
        const style = ['rich', 'short', 'none'][styleHash(`${BATCH}#${sc.n}`) % 3]
        // ⚠️ A REAL CREATOR ANSWERS ON TOPIC (batch part-13): one shipping
        // sentence answered every question, about stale beans or roasters
        // alike, so the writer was handed off-topic "answers". A rich answer is
        // now her own stated fact closest to the question and the idea.
        const onTopic = (q) => {
          const ws = (x) => new Set(String(x ?? '').toLowerCase().match(/[a-z]{4,}/g) ?? [])
          const want = ws(`${q?.question ?? ''} ${body.reference_note ?? ''}`)
          let best = null, score = 0
          for (const k of ctx.statedFacts) { const o = [...ws(k)].filter((w) => want.has(w)).length; if (o > score) { score = o; best = k } }
          return score >= 2 ? best : null
        }
        // ⚠️ BLIND-1 (owner 2026-10-05): asked "what is Cold Brew Concentrate?",
        // the stand-in answered with the single-origin lot's facts (script 7)
        // and a stock shipping line (scripts 3, 9) — the harness invented what
        // the product's empty-record check exists to stop. About a named
        // product she answers only with a fact that names it, else nothing.
        const productWords = String(sc.product ?? '').toLowerCase().match(/[a-z]{4,}/g) ?? []
        const aboutThisProduct = (k) => productWords.length === 0 || productWords.some((w) => String(k).toLowerCase().includes(w))
        const onTopicHere = (q) => { const k = onTopic(q); return k && aboutThisProduct(k) ? k : null }
        const answerFor = (f, q) => style === 'rich' ? (['claims', 'angle'].includes(f) ? (sc.product ? (onTopicHere(q) ?? '') : (onTopic(q) ?? RICH_ANSWER[f] ?? RICH_ANSWER.claims)) : (RICH_ANSWER[f] ?? RICH_ANSWER.claims))
          : style === 'short' ? (f === 'offer' ? 'Signature Blend' : 'Fresh beans.')
          : 'Nothing specific, keep it general.'
        // "Which one is this video about?" is answered the way the app does: the
        // pick rides selected_product_id. Each kind of creator picks differently
        // (a product, the whole brand, or none of these).
        const qs = r.json.questions.filter((q) => {
          if (q.field !== 'selected_product' || !Array.isArray(q.options) || !q.options.length) return true
          const opts = q.options.map((o) => String(o.value))
          body.selected_product_id = style === 'rich' ? (opts.find((o) => !o.startsWith('brand:') && !/none/i.test(o)) ?? opts[0])
            : style === 'short' ? (opts.find((o) => o.startsWith('brand:')) ?? opts[0]) : opts[opts.length - 1]
          return false
        })
        body.readiness_answers = { ...(body.readiness_answers ?? {}), ...Object.fromEntries(qs.map((q) => [q.field, answerFor(q.field, q)])) }
        sc.answerStyle = style
        r = await call(token, body)
      }
      const bp = r.json?.blueprint ?? null
      const a = bp ? audit(bp, { ...sc, body }, ctx) : { findings: [{ k: `no_script_${r.status}`, d: String(r.json?.code ?? r.json?.error ?? r.text).slice(0, 200) }], text: null, hooks: null }
      if (a.text) {
        const ask = `${sc.group}|${body.selected_product_id ?? ''}|${String(body.reference_note ?? '').slice(0, 80)}|${body.reference_url ?? ''}`
        const mine = shingles(a.text)
        for (const prev of seen.get(ask) ?? []) {
          const shared = [...mine].filter((x) => prev.sh.has(x)).length / Math.max(1, Math.min(mine.size, prev.sh.size))
          if (shared > 0.3) { a.findings.push({ k: 'repeats_earlier_script', d: `${Math.round(shared * 100)}% shared with #${prev.n}` }); break }
          if (a.hooks?.[0] && prev.hook && a.hooks[0].toLowerCase() === prev.hook.toLowerCase()) { a.findings.push({ k: 'same_hook_as_earlier', d: `#${prev.n}` }); break }
        }
        seen.set(ask, [...(seen.get(ask) ?? []), { n: sc.n, sh: mine, hook: a.hooks?.[0] ?? '' }])
      }
      if (asked) a.findings.push({ k: 'asked_first', d: asked.join(' | ').slice(0, 300) })
      if (sc.expectRefusal && r.status === 400) a.findings = [{ k: 'refused_as_expected', d: String(r.json?.error ?? '').slice(0, 200) }]
      for (const x of a.findings) tally[x.k] = (tally[x.k] ?? 0) + 1
      await admin.from('script_batch_results').insert({
        batch: BATCH, n: sc.n, scenario: { group: sc.group, label: sc.label, product: sc.product ?? null, answer_style: sc.answerStyle ?? null, answers_simulated: sc.answerStyle ? true : false, body },
        status: r.status, code: r.json?.code ?? null, reason: r.ok ? null : String(r.json?.error ?? r.text).slice(0, 400),
        generation_id: r.json?.id ?? null, duration_ms: r.ms, findings: a.findings, script_text: a.text, hooks: a.hooks,
        // Scored after the viewer panel has remade it (see scoreAfterPanel).
        judge: null,
      })
      console.log(`#${sc.n} ${sc.group}/${sc.label}/${body.goal} → ${r.status} ${a.findings.map((x) => x.k).join(',') || 'clean'}`)
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  console.log('\nTALLY', JSON.stringify(tally, null, 1))
  await scoreAfterPanel(admin, ctx)
  await regressionReport(admin)
}

// ⚖️ EVERY ROUND IS CHECKED AGAINST THE BEST THE SAME TEST EVER SCORED (owner
// 2026-10-04: "compare every one where there was a reduction after fixes, so a
// new fix does not undo an old one"). The same test is the same group, product
// or idea, reference and goal. Each script that scores a point or more below
// that test's best is listed with both scripts' batch and number, so the drop
// is read and its cause named before the next fix. Stored as row n = -2.
// ⚖️ SCORE WHAT SHE FILMS (owner 2026-10-04): every script goes to ~10 test
// viewers from her audience and is remade from what they say (audience.ts
// keeps a rewrite only when it tests better). The reviewer used to score the
// first draft, before that remake. Now each script is scored once its viewer
// test is done (or failed, or after 20 minutes), from the blueprint as saved.
async function scoreAfterPanel(admin, ctx) {
  const { data: rows } = await admin.from('script_batch_results').select('id, scenario, generation_id').eq('batch', BATCH).gte('n', 0).not('generation_id', 'is', null).is('judge', null)
  const ids = (rows ?? []).map((r) => r.generation_id)
  const until = Date.now() + 20 * 60_000
  for (;;) {
    const { data: t } = await admin.from('audience_tests').select('generation_id, status').in('generation_id', ids)
    const settled = (t ?? []).filter((x) => x.status === 'done' || x.status === 'failed').length
    console.log(`viewer tests settled ${settled}/${ids.length}`)
    if (settled >= ids.length || Date.now() > until) break
    await new Promise((r) => setTimeout(r, 30_000))
  }
  let done = 0
  for (const row of rows ?? []) {
    const { data: g } = await admin.from('generations').select('blueprint').eq('id', row.generation_id).maybeSingle()
    const { data: t } = await admin.from('audience_tests').select('status, improved').eq('generation_id', row.generation_id).maybeSingle()
    const j = await judge(g?.blueprint ?? null, { product: row.scenario?.product ?? null, body: row.scenario?.body ?? {} }, ctx)
    const lines = Array.isArray(g?.blueprint?.script) ? g.blueprint.script.map((b) => String(b?.line ?? '').trim()).filter(Boolean) : []
    await admin.from('script_batch_results').update({
      judge: j ? { ...j, after_panel: t?.status === 'done', panel_changed: Array.isArray(t?.improved?.lines) ? t.improved.lines.length : 0 } : null,
      script_text: lines.length ? lines.map((l, i) => `${i + 1}. ${l}`).join('\n') : undefined,
    }).eq('id', row.id)
    console.log(`scored after panel ${++done}/${rows.length} → ${j?.overall ?? '?'}`)
  }
}

// ⚖️ THE QUESTIONS, AS GENERATED (owner 2026-10-04: "paste the actual
// questions; Launch and Restock side by side; the rotation across runs").
// Every option, 10 runs each, on the test account. Runs skip the first
// test account. Odd runs skip the first question (rotation: a new angle,
// then rest). Nothing is answered: a batch never writes her facts.
async function specQuestionsProbe(token, admin, products) {
  const OPTIONS = ['product:launch', 'product:restock', 'product:explain', 'product:wrong', 'product:try', 'product:later', 'product:asked', 'product:dm', 'product:why_made', 'product:story',
    'business:why_started', 'business:wrong', 'business:announce', 'idea:story', 'idea:teach', 'idea:answer', 'idea:process', 'idea:fun', 'idea:sell', 'reference:opening', 'reference:pacing', 'reference:close']
  const prod = products.find((p) => p.relationship === 'OWN_PRODUCT' && /signature/i.test(p.name ?? '')) ?? products[0]
  const PARAGRAPH = { idea: 'what nobody tells you about starting a coffee cart', reference: 'a video about my roasting morning, like the reference' }
  const out = []
  for (const option of OPTIONS) {
    const surface = option.split(':')[0]
    const entity = surface === 'product' ? `product:${prod?.id}` : surface === 'business' ? 'brand' : `${surface}:probe`
    for (let run = 1; run <= 10; run++) {
      const r = await call(token, { mode: 'spec_questions', option, entity_key: entity, product_id: surface === 'product' ? prod?.id : undefined, paragraph: PARAGRAPH[surface] ?? '' })
      const j = r.json ?? {}
      const qs = Array.isArray(j.questions) ? j.questions : []
      out.push({ option, run, using: (j.using ?? []).length, confirm: (j.confirm ?? []).map((c) => `${c.slot}: ${String(c.text).slice(0, 90)}`), resting: j.resting ?? [], questions: qs.map((q) => `[${q.slot}${q.offer_back ? ', offered back' : ''}] ${q.question}`) })
      console.log(`${option} run ${run}: ${qs.map((q) => q.question).join(' | ') || (j.disabled ? 'DISABLED' : '(none)')}`)
      const first = qs[0]
      if (first?.ask_id) {
        if (run % 2 === 1) await call(token, { mode: 'spec_answer', option, slot: first.slot, entity_key: entity, ask_id: first.ask_id, skip: true })
      }
    }
  }
  await admin.from('script_batch_results').insert({ batch: BATCH, n: -3, scenario: { group: 'spec-questions', product: prod?.name ?? null }, findings: out, status: 0 })
  console.log(`\nspec question probe: ${out.length} runs stored as n=-3`)
}

async function regressionReport(admin) {
  const keyOf = (r) => [r.scenario?.group, r.scenario?.product ?? '', String(r.scenario?.body?.reference_note ?? '').slice(0, 80), r.scenario?.body?.reference_url ?? '', r.scenario?.body?.goal ?? ''].join('|')
  const score = (r) => Number(r?.judge?.overall)
  const { data: mine } = await admin.from('script_batch_results').select('n, scenario, judge').eq('batch', BATCH).gte('n', 0)
  const scored = (mine ?? []).filter((r) => Number.isFinite(score(r)))
  if (!scored.length) return
  const { data: past } = await admin.from('script_batch_results').select('batch, n, scenario, judge')
    .neq('batch', BATCH).gte('n', 0).not('judge', 'is', null).order('created_at', { ascending: false }).limit(3000)
  const best = new Map()
  for (const r of past ?? []) {
    const k = keyOf(r)
    if (!Number.isFinite(score(r))) continue
    // ⚖️ AGAINST THE TEST'S USUAL SCORE, NOT ITS LUCKIEST: the best of many
    // noisy reads sits ~1.5 above the truth, so every round "dropped".
    const e = best.get(k) ?? { sum: 0, count: 0, top: r }
    e.sum += score(r); e.count += 1
    if (score(r) > score(e.top)) e.top = r
    best.set(k, e)
  }
  const drops = []
  let compared = 0, gained = 0
  for (const r of scored) {
    const e = best.get(keyOf(r))
    if (!e) continue
    compared += 1
    const usual = e.sum / e.count
    const d = Math.round((score(r) - usual) * 10) / 10
    if (d > 0) gained += 1
    if (d <= -1) drops.push({ n: r.n, test: keyOf(r), now: score(r), usual: Math.round(usual * 10) / 10, runs: e.count, best: score(e.top), best_batch: e.top.batch, best_n: e.top.n, drop: d, fix: String(r.judge?.biggest_fix ?? '').slice(0, 240) })
  }
  drops.sort((a, b) => a.drop - b.drop)
  const summary = { compared, gained, dropped_1_plus: drops.length, mean_vs_usual: compared ? Math.round(scored.filter((r) => best.has(keyOf(r))).reduce((t, r) => { const e = best.get(keyOf(r)); return t + score(r) - e.sum / e.count }, 0) / compared * 100) / 100 : null }
  console.log('\nREGRESSIONS vs each test\'s usual score', JSON.stringify(summary), '\n' + drops.map((x) => `  #${x.n} ${x.test}: ${x.now} (usual ${x.usual} over ${x.runs}; best ${x.best} in ${x.best_batch} #${x.best_n})`).join('\n'))
  await admin.from('script_batch_results').insert({ batch: BATCH, n: -2, scenario: { group: 'regressions', summary }, findings: drops, status: 0 })
}

main().catch((e) => { console.error(e); process.exit(1) })
