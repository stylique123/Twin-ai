// SEED THE FICTIONAL CREATOR PANEL (owner, 13 Oct).
//
// Creates one auth user per creator in scripts/ops/fixtures/fictional-panel.json
// (service-role admin API), tags it `app_metadata.twin_test_account =
// 'fictional_panel'` — the identity the edge reads to treat it as a test account
// (is_heartbeat on every generation, so it is excluded from every corpus reader,
// lesson and real-creator stat) — and writes its profile, brand, brand voice,
// knowledge (stories) and products. The owner ids are recorded in ONE PRIVATE
// `test_run_files` row (kind 'other'); only that row's id is printed.
//
// ⚠️ PUBLIC REPO: nothing here prints an id, email or key. No password is ever
// set or stored: the harness signs in with a one-time admin magic link.
// Idempotent: a creator whose email already exists is reused and its rows are
// replaced (knowledge and products deleted and re-inserted); the accounts row in
// test_run_files is reused by label, never duplicated.
//
// Owner conditions: emails are on the reserved `.invalid` TLD (never
// deliverable; --domain must also end in .invalid), email_confirm is set so no
// mail is sent, an account found under the OLD example.com address is migrated
// in place (no mail) rather than duplicated, and credits are always ZERO (the
// edge treats panel accounts as unbillable).
//
// Run (owner, after the PR is merged):
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/ops/seedFictionalPanel.mjs [--domain=panel.invalid]
import { readFileSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

export const PANEL_TAG = 'fictional_panel'
const FIXTURE = new URL('./fixtures/fictional-panel.json', import.meta.url)
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) ?? `=${d}`).split('=').slice(1).join('=')

export const PANEL_DOMAIN = 'panel.invalid'
/** The domain the panel was first seeded on; such accounts are migrated, not duplicated. */
export const LEGACY_PANEL_DOMAIN = 'example.com'
export const PANEL_ROWS_LABEL = 'fictional-panel-accounts'
/** Panel accounts never hold credits (generation is unbillable for them anyway). */
export const PANEL_CREDITS = 0

/** A seeding domain: only the reserved, never-deliverable `.invalid` TLD (RFC 2606). */
export function panelDomain(v) {
  const d = String(v ?? PANEL_DOMAIN).trim().toLowerCase()
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*\.invalid$/.test(d)) throw new Error('--domain must end in .invalid (never deliverable)')
  return d
}

/** Email for a panel creator. Reserved `.invalid` TLD: never deliverable. */
export function panelEmail(key, domain = PANEL_DOMAIN) { return `twin-panel+${key}@${domain}` }

/** A product fact's expiry: 'LIVE_PLUS_<n>_DAYS' resolves against `now`, so the urgency stays live at run time. */
export function resolveExpiry(v, now = Date.now()) {
  const m = /^LIVE_PLUS_(\d+)_DAYS$/.exec(String(v ?? ''))
  return m ? new Date(now + Number(m[1]) * 86400_000).toISOString() : (v ?? null)
}

/** Product knowledge rows in the stored shape ({id, field, value, trust, source, …}). */
export function productKnowledge(creatorKey, product, now = Date.now()) {
  return (product.facts ?? []).map((f, n) => ({
    id: `panel:${creatorKey}:${product.key}:${n}`,
    field: f.field, value: f.value, trust: f.trust === 'unconfirmed' ? 'unconfirmed' : 'usable', source: f.source ?? 'creator',
    ...(f.expires_at ? { expires_at: resolveExpiry(f.expires_at, now) } : {}),
  }))
}

async function findUser(admin, email) {
  for (let page = 1; page < 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const hit = data.users.find((u) => u.email === email)
    if (hit) return hit
    if (data.users.length < 200) return null
  }
  return null
}

/** Reuse decision for one creator (pure, for the self-test): the current
 *  address first, else the legacy example.com address (migrate it), else create.
 *  A legacy hit counts only when it already carries the panel tag. */
export function reusePlan(current, legacy) {
  if (current) return { action: 'reuse', user: current }
  if (legacy && legacy.app_metadata?.twin_test_account === PANEL_TAG) return { action: 'migrate', user: legacy }
  return { action: 'create', user: null }
}

async function seedCreator(admin, c, { credits, domain, now }) {
  const email = panelEmail(c.key, domain)
  const plan = reusePlan(await findUser(admin, email), await findUser(admin, panelEmail(c.key, LEGACY_PANEL_DOMAIN)))
  let user = plan.user
  if (plan.action === 'migrate') {
    // Move the old address to .invalid in place; email_confirm skips any mail.
    const { data, error } = await admin.auth.admin.updateUserById(user.id, { email, email_confirm: true })
    if (error) throw new Error(`${c.key}: email migrate failed: ${error.message}`)
    user = data.user
  }
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email, email_confirm: true,
      // A password nobody knows and nothing stores: sign-in is by admin magic link.
      password: randomUUID() + randomUUID(),
      app_metadata: { twin_test_account: PANEL_TAG },
      user_metadata: { fictional: true },
    })
    if (error) throw new Error(`${c.key}: createUser failed: ${error.message}`)
    user = data.user
  } else {
    await admin.auth.admin.updateUserById(user.id, { app_metadata: { ...(user.app_metadata ?? {}), twin_test_account: PANEL_TAG } })
  }
  const owner = user.id
  const chk = (label, r) => { if (r.error) throw new Error(`${c.key}: ${label}: ${r.error.message}`); return r.data }
  // The profile row is made by the on_auth_user_created trigger.
  chk('profile', await admin.from('profiles').update({ display_name: c.display_name, credits, onboarded: true }).eq('id', owner))

  let brand = chk('brand read', await admin.from('brands').select('id').eq('owner_id', owner).limit(1).maybeSingle())
  const brandRow = { owner_id: owner, name: c.brand.name, description: c.brand.description, confirmed: true, forbidden_claims: c.brand.forbidden_claims ?? [] }
  if (brand) chk('brand', await admin.from('brands').update(brandRow).eq('id', brand.id))
  else brand = chk('brand', await admin.from('brands').insert(brandRow).select('id').single())

  let voice = chk('voice read', await admin.from('brand_voices').select('id').eq('owner_id', owner).limit(1).maybeSingle())
  const voiceRow = { owner_id: owner, handle: c.handle, platform: 'tiktok', label: c.brand.name, profile: { ...c.voice, fictional: true }, status: 'ready', is_default: true, ownership: 'own' }
  if (voice) chk('voice', await admin.from('brand_voices').update(voiceRow).eq('id', voice.id))
  else voice = chk('voice', await admin.from('brand_voices').insert(voiceRow).select('id').single())

  // Replace knowledge and products wholesale: the fixture is the truth.
  chk('knowledge clear', await admin.from('creator_knowledge').delete().eq('owner_id', owner))
  chk('products clear', await admin.from('product_entities').delete().eq('owner_id', owner))
  const ts = new Date(now).toISOString()
  chk('knowledge', await admin.from('creator_knowledge').insert(c.stories.map((s) => ({
    owner_id: owner, voice_id: voice.id, brand_id: brand.id, kind: s.kind, text: s.text,
    basis: 'stated', source: 'asked', confidence: 1, times_seen: 1, sensitive: false, fact_scope: 'account',
    creator_confirmed_at: ts, privacy_checked_at: ts, last_observed_at: ts,
  }))))
  const products = {}
  for (const p of c.products) {
    const row = chk(`product ${p.key}`, await admin.from('product_entities').insert({
      owner_id: owner, voice_id: voice.id, brand_id: brand.id, name: p.name, type: p.type, relationship: p.relationship,
      offer: p.offer, source: 'user_answer', user_confirmed: true, personal_use: 'CONFIRMED', showability: p.type === 'PHYSICAL_PRODUCT' ? 'ALWAYS' : 'SOMETIMES',
      availability: 'in_stock', knowledge: productKnowledge(c.key, p, now), knowledge_extracted_at: ts,
    }).select('id').single())
    products[p.key] = row.id
  }
  return { action: plan.action, key: c.key, owner_id: owner, email, brand_id: brand.id, voice_id: voice.id, products }
}

async function main() {
  const URL_ = process.env.SUPABASE_URL, SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!URL_ || !SERVICE) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } })
  const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8'))
  if (process.argv.some((a) => a.startsWith('--credits=') && Number(a.split('=')[1]) !== 0)) throw new Error('panel accounts hold zero credits; --credits is not accepted')
  const opts = { credits: PANEL_CREDITS, domain: panelDomain(arg('domain', PANEL_DOMAIN)), now: Date.now() }
  const accounts = []
  const results = []
  for (const c of fixture.creators) {
    const { action, ...acct } = await seedCreator(admin, c, opts)
    accounts.push(acct)
    results.push({ action, stories: c.stories.length, products: c.products.length })
    console.log(`seeded ${c.key}: ${c.stories.length} stories, ${c.products.length} products`)
  }
  const content = JSON.stringify({ tag: PANEL_TAG, fixture_version: fixture.version, seeded_at: new Date(opts.now).toISOString(), accounts }, null, 2)
  const fileRow = {
    label: PANEL_ROWS_LABEL, kind: 'other', file_name: `${PANEL_ROWS_LABEL}.json`,
    sha256: createHash('sha256').update(content).digest('hex'), content,
  }
  // Reuse the one row by label (re-seeding replaces it, never adds another).
  const { data: prior, error: readErr } = await admin.from('test_run_files').select('id')
    .eq('label', PANEL_ROWS_LABEL).eq('kind', 'other').limit(1).maybeSingle()
  if (readErr) throw new Error(`test_run_files read failed: ${readErr.message}`)
  const { data, error } = prior
    ? await admin.from('test_run_files').update(fileRow).eq('id', prior.id).select('id').single()
    : await admin.from('test_run_files').insert(fileRow).select('id').single()
  if (error) throw new Error(`test_run_files write failed: ${error.message}`)
  // The only id printed: the private row. Pass it as the batch's panel_file_id.
  console.log(`panel accounts recorded in test_run_files row ${data.id}`)
  const tally = { accounts: accounts.length, created: 0, reused: 0, migrated: 0, stories: 0, products: 0 }
  for (const r of results) { tally[r.action === 'create' ? 'created' : r.action === 'migrate' ? 'migrated' : 'reused']++; tally.stories += r.stories; tally.products += r.products }
  console.log(`seed totals: accounts ${tally.accounts}, created ${tally.created}, reused ${tally.reused}, migrated ${tally.migrated}, stories ${tally.stories}, products ${tally.products}, panel rows 1 (${prior ? 'reused' : 'new'})`)
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1) })
