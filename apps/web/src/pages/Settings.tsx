import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { User, Sparkles, Check, Loader2, LogOut, ArrowUpRight, ShieldCheck, Pencil, CreditCard, X, RefreshCw, Plus, Users, Copy, Link2, Info } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { saveDNA, startCheckout, listBrandVoices, startDna, pollDna, saveBrandKit, uploadBrandLogo, getWorkspace, createWorkspaceInvite, removeWorkspaceMember, type WorkspaceState } from '../lib/api'
import { PLANS, ADD_ONS, videosFromCredits, PAYMENTS_LIVE } from '../lib/brand'
import {
  contentProfile, brandKitStatus, productDnaStatus, loadProductEntities,
  setupAreas, setupSummary, type SetupArea, type SetupState,
  resolveProfileAnswers, readStoredBrief, savePreScriptBrief,
} from '@twinai/shared'
import type { ContentProfile, BrandKitStatus, ProductDnaStatus } from '@twinai/shared'
import { readOnboardingDraft, profileAnswersOf } from '../lib/onboardingDraft'
import type { CreatorDNA, Platform, VoiceProfile, BrandKit } from '../lib/types'
import { Aurora } from '../components/Aurora'
import { Reveal } from '../components/motion'
import { cn } from '../lib/cn'

const PLATFORMS: Platform[] = ['tiktok', 'instagram', 'youtube']

// The Creator-DNA fields a user can refine after onboarding. Editing the niche
// here also re-targets the Gallery's default niche, the blueprint voice, etc.
const DNA_FIELDS: { key: keyof Omit<CreatorDNA, 'platforms'>; label: string; placeholder: string }[] = [
  { key: 'niche', label: 'Niche', placeholder: 'e.g. fitness for busy parents' },
  { key: 'audience', label: 'Audience', placeholder: 'who you make videos for' },
  { key: 'product', label: 'Product / offer', placeholder: 'what you sell or promote' },
  { key: 'goal', label: 'Goal', placeholder: 'what success looks like' },
  { key: 'voice', label: 'Voice', placeholder: 'how you sound — direct, warm, punchy' },
  { key: 'editing_style', label: 'Editing style', placeholder: 'fast jump cuts, burned-in captions' },
]

const EMPTY_DNA: CreatorDNA = { niche: '', audience: '', product: '', goal: '', voice: '', platforms: [], editing_style: '' }

export default function Settings() {
  const { profile, refreshProfile, signOut } = useAuth()
  const plan = PLANS.find((p) => p.id === profile?.plan) ?? PLANS[0]
  const left = videosFromCredits(profile?.credits ?? 0)


  const [dna, setDna] = useState<CreatorDNA>({ ...EMPTY_DNA, ...(profile?.dna ?? {}) })
  const [savingDna, setSavingDna] = useState(false)
  const [dnaSaved, setDnaSaved] = useState(false)
  // DNA is SHOWN read-only by default (it's already saved from the scan); "Edit"
  // reveals the form. Re-flagged feedback: don't dump editable fields by default.
  const [editingDna, setEditingDna] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [coBusy, setCoBusy] = useState<string | null>(null)
  const [coMsg, setCoMsg] = useState<string | null>(null)
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const [cryptoPay, setCryptoPay] = useState<{ asset: string; address: string; amount: number; plan: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null)
  const [addonBusy, setAddonBusy] = useState<string | null>(null)
  const [addonMsg, setAddonMsg] = useState<string | null>(null)

  // The REAL brand DNA for handle-scanned users lives in their default brand voice
  // (brand_voices.profile), not profile.dna — which is why this panel showed "Not
  // set" for everything ("I can't see my own brand DNA"). Load it and surface it.
  const [voiceProfile, setVoiceProfile] = useState<VoiceProfile | null>(null)
  const [defaultVoiceId, setDefaultVoiceId] = useState<string | null>(null)
  // The default brand voice actually loaded — so we can SHOW which brand is active
  // (@handle · platform), not just render its DNA anonymously.
  const [activeVoice, setActiveVoice] = useState<Awaited<ReturnType<typeof listBrandVoices>>[number] | null>(null)
  // Distinguish "still loading" and "load failed" from "genuinely no voice". The
  // old code swallowed errors (.catch(()=>{})) with no loading state, so a transient
  // fetch hiccup rendered the whole DNA as empty "+ Add" fields — looking broken.
  const [voiceLoading, setVoiceLoading] = useState(true)
  const [voiceErr, setVoiceErr] = useState(false)
  const [brandKit, setBrandKit] = useState<BrandKit>({})
  const [kitSaved, setKitSaved] = useState(false)
  const [kitErr, setKitErr] = useState(false)
  // ⚠️ A COUNT, NOT THE ROWS. Nothing on this card needs a product's contents —
  // only whether anything has been claimed — and loading the library to render a
  // status word would make an unrelated failure able to blank this card.
  const [entityCount, setEntityCount] = useState<number | null>(null)
  // ⚠️ null MEANS "NOT LOADED YET", '' MEANS "LOADED AND THEY HAVE NOT SET ONE".
  // Rendering the second as the first would show an empty box to somebody who
  // has a CTA, and a save from that box would erase it.
  const [defaultCta, setDefaultCta] = useState<string | null>(null)
  const [ctaSaved, setCtaSaved] = useState(false)
  const [ctaErr, setCtaErr] = useState(false)
  const loadVoice = useCallback(() => {
    setVoiceErr(false); setVoiceLoading(true)
    listBrandVoices()
      .then((vs) => {
        const def = vs.find((v) => v.is_default && v.status === 'ready') ?? vs.find((v) => v.status === 'ready') ?? vs[0] ?? null
        setActiveVoice(def)
        if (def?.id) setDefaultVoiceId(def.id)
        if (def?.brand_kit) setBrandKit(def.brand_kit)
        setDefaultCta(String(readStoredBrief(def?.pre_script_brief).defaultCta ?? ''))
        if (def?.profile) {
          const vp = def.profile as VoiceProfile
          setVoiceProfile(vp)
          // Pre-fill the EDIT form from the scan so "Edit" starts from the creator's
          // existing DNA, not a blank slate ("why does it tell me to edit from start?").
          // Only fills EMPTY fields — never clobbers anything the user already saved.
          setDna((d) => ({
            ...d,
            niche: d.niche || [vp.niche, vp.sub_niche].filter(Boolean).join(' · '),
            voice: d.voice || [vp.tone, vp.pacing].filter(Boolean).join(', '),
            editing_style: d.editing_style || vp.hook_style || '',
            platforms: d.platforms.length ? d.platforms : (def.platform ? [def.platform] : []),
          }))
        }
      })
      .catch(() => setVoiceErr(true)) // surface + offer retry — never a silent empty DNA
      .finally(() => setVoiceLoading(false))
  }, [])
  useEffect(() => { loadVoice() }, [loadVoice])
  // ⚖️ A FAILED LOAD LEAVES THE COUNT null AND THE CARD SAYS SO, rather than
  // reporting zero. "We could not check" and "you have none" are different facts,
  // and rendering the second for the first is how a creator gets told to claim a
  // product they already claimed.
  useEffect(() => {
    let alive = true
    loadProductEntities()
      .then((rows) => { if (alive) setEntityCount(rows.length) })
      .catch(() => { if (alive) setEntityCount(null) })
    return () => { alive = false }
  }, [])
  // ⚖️ SAVED ON BLUR, NOT PER KEYSTROKE. Every intermediate value of a sentence
  // somebody is still typing would otherwise be written as their confirmed CTA,
  // and a half-typed one is exactly the kind of not-quite-an-answer the whole
  // three-state discipline exists to keep out of the column.
  const saveCta = async (next: string) => {
    if (!defaultVoiceId) return
    setCtaErr(false)
    try {
      await savePreScriptBrief(defaultVoiceId, { defaultCta: next.trim() })
      setCtaSaved(true); setTimeout(() => setCtaSaved(false), 1500)
    } catch { setCtaErr(true) }
  }

  const saveKit = async (next: BrandKit) => {
    setBrandKit(next)
    if (!defaultVoiceId) return
    // Surface a failed save (M7) instead of swallowing it — otherwise the creator
    // thinks a brand colour/kit change persisted when it didn't, then gets a surprise
    // at render time. The optimistic setBrandKit above keeps their edit on screen to retry.
    setKitErr(false)
    try { await saveBrandKit(defaultVoiceId, next); setKitSaved(true); setTimeout(() => setKitSaved(false), 1500) }
    catch { setKitErr(true) }
  }
  const [logoBusy, setLogoBusy] = useState(false)
  const onLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !defaultVoiceId) return
    setLogoBusy(true)
    try {
      const dataUrl: string = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(file) })
      const path = await uploadBrandLogo(dataUrl)
      await saveKit({ ...brandKit, logo_path: path })
    } catch { /* ignore */ } finally { setLogoBusy(false); e.target.value = '' }
  }
  // Fall back to the scanned voice when a quiz field is empty, so the view shows
  // the creator's actual niche/voice instead of blanks.
  const voiceFallback: Partial<Record<keyof CreatorDNA, string>> = voiceProfile
    ? {
        niche: [voiceProfile.niche, voiceProfile.sub_niche].filter(Boolean).join(' · '),
        voice: [voiceProfile.tone, voiceProfile.pacing].filter(Boolean).join(', '),
        editing_style: voiceProfile.hook_style ?? '',
      }
    : {}
  const shownDna = (k: keyof Omit<CreatorDNA, 'platforms'>): string => (dna[k] as string) || voiceFallback[k] || ''

  // Expansion add-ons: attempt checkout; until billing is connected, tell the user
  // plainly how to get it rather than throwing a raw error.
  const buyAddon = async (id: string) => {
    setAddonBusy(id); setAddonMsg(null)
    try {
      const r = await startCheckout(id)
      if (r.url) { window.location.href = r.url; return }
      setAddonMsg("Add-ons activate as soon as checkout is connected — contact support and we'll add it to your account today.")
    } catch {
      setAddonMsg("Add-ons activate as soon as checkout is connected — contact support and we'll add it to your account today.")
    } finally { setAddonBusy(null) }
  }

  // Re-scan the creator's handle so the Dashboard's stats (followers, posts, avg
  // views/likes) and the voice profile are rebuilt from their latest public posts.
  // This is the only re-scan path for solo accounts now that Workspaces is agency-
  // only — and it back-fills stats for voices created before we captured them.
  const refreshVoice = async () => {
    setRefreshing(true); setRefreshMsg(null)
    try {
      const voices = await listBrandVoices()
      const v = voices.find((x) => x.is_default) ?? voices[0]
      if (!v?.handle) { setRefreshMsg('No handle on file yet — add one in onboarding first.'); return }
      // refresh:true → re-scan the existing voice in place. Your current voice
      // stays live and usable the whole time; a hiccup never breaks it.
      const started = await startDna(v.handle, v.platform, true)
      const id = started.brand_voice_id ?? v.id
      // Poll until the scan finishes (or we give up after ~90s).
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 3000))
        const res = await pollDna(id)
        if (res.status === 'ready') { setRefreshMsg('Voice & stats refreshed — your dashboard is up to date.'); await refreshProfile(); return }
        // A failed re-scan keeps your current voice intact — say so, don't alarm.
        if (res.status === 'failed') { setRefreshMsg('Couldn\'t pull fresh data just now — your current voice is unchanged and still working. Try again in a bit.'); return }
      }
      setRefreshMsg('Still working in the background — your current voice keeps working; check your dashboard in a minute.')
    } catch (e) {
      setRefreshMsg(e instanceof Error ? e.message : 'Couldn\'t refresh your voice. Try again.')
    } finally {
      setRefreshing(false)
    }
  }

  // Real checkout: routes a card user to the processor, or shows crypto/manual
  // details. This is the upgrade path that was missing entirely before.
  const upgrade = async (planId: string) => {
    setCoBusy(planId); setCoMsg(null)
    try {
      const r = await startCheckout(planId)
      if (r.url) { window.location.href = r.url; return }
      if (r.kind === 'crypto' && r.address) { setUpgradeOpen(false); setCryptoPay({ asset: r.asset ?? 'USDT', address: r.address, amount: r.amount_usd ?? 0, plan: planId }); return }
      if (r.kind === 'manual') { setCoMsg(r.message ?? 'Contact us to activate this plan.'); return }
      if (r.kind === 'unconfigured') { setCoMsg('Checkout is not enabled yet — please contact support.'); return }
      setCoMsg('Could not start checkout. Please try again.')
    } catch (e) {
      setCoMsg(e instanceof Error ? e.message : 'Checkout failed.')
    } finally {
      setCoBusy(null)
    }
  }
  const higherPlans = PLANS.filter((p) => p.price > plan.price)

  // ── WHAT TWIN KNOWS, SPLIT BY WHAT IT CONTROLS ────────────────────────────
  //
  // ⚠️ THE ANSWERS COME FROM THE ONBOARDING DRAFT, WHICH IS LOCAL-STORAGE ONLY
  // AND NEVER PERSISTED SERVER-SIDE. On a second device there is nothing to read,
  // so this reports a lower number than the truth — which is the safe direction
  // (it under-claims what Twin knows rather than over-claiming), but it is a real
  // gap and the fix is to persist the answers, not to assume them here.
  const profileAnswers = (() => {
    const id = profile?.id
    let draft = null
    try {
      const d = id ? readOnboardingDraft(localStorage, id) : null
      draft = d ? profileAnswersOf(d) : null
    } catch { draft = null }
    // ⚖️ THE CONFIRMED ANSWER BEATS THE HALF-FINISHED FORM, per field. A stored
    // brief written before a question existed has no key for it, so preferring
    // the whole stored object would discard a draft answer to a question the
    // brief predates — reporting a gap the creator just filled in front of us.
    return resolveProfileAnswers({
      stored: readStoredBrief(activeVoice?.pre_script_brief) as never,
      draft,
    })
  })()
  // ⚠️ THE PAGE RAN FROM PROFILE INTELLIGENCE INTO CREDIT PACKS INTO BRANDING
  // INTO THE WHOLE DNA RECORD, in one column, so the next useful action was
  // something you had to find rather than something you were told. Tabs are the
  // smallest change that gives the page a shape: what Twin knows, how it looks,
  // what it costs, and who you are.
  const [tab, setTab] = useState<'twin' | 'brand' | 'plan' | 'account'>('twin')
  const nav = useNavigate()
  /** ⚖️ COLLAPSED BY DEFAULT, AND IT IS THE SAME RECORD EITHER WAY. Folding is
   *  not hiding: the summary answers "does this sound like me", which is the
   *  question people actually open this page with. */
  const [dnaOpen, setDnaOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)

  const content = contentProfile({
    answers: profileAnswers,
    dnaReady: activeVoice?.status === 'ready',
    // ⚠️ NOT `dna.goal`. The goal is what the creator wants the video to achieve;
    // the CTA is the sentence they want said at the end. Mapping one onto the
    // other would mark this satisfied by an answer to a different question — and
    // there is currently no field that asks it, so the gap is honest and points
    // at work that is genuinely missing.
    cta: defaultCta,
  })
  const productDna = productDnaStatus(profileAnswers?.commercialTies ?? null, entityCount ?? 0)
  // ⚖️ `palette_source: 'manual'` IS THE ONLY THING THAT MAKES COLOURS A BRAND.
  // An auto-extracted palette is a reading, and this card must not report a
  // reading as a decision — the same line `brandSnapshot` draws for the editor.
  const kitStatus = brandKitStatus({
    primaryHex: brandKit.palette?.primary ?? null,
    secondaryHex: brandKit.palette?.secondary ?? null,
    logoPath: brandKit.logo_path ?? null,
    paletteSource: brandKit.palette_source ?? null,
  })

  // ⚖️ THE STATUS IS READ, NOT DECIDED HERE. `setupAreas` is in shared with its
  // own tests; a status computed in this component is one no test can reach and
  // one the next screen would compute differently.
  const areas = setupAreas({
    answers: profileAnswers,
    dnaReady: activeVoice?.status === 'ready',
    // ⚖️ CONFIRMED MEANS THE CREATOR HAS TOUCHED IT. `voice` is the field this page
    // lets them edit, so a non-empty one is the closest thing to an approval we
    // actually hold — and it is a reading of real state rather than a flag we set
    // ourselves when the scan finished.
    dnaConfirmed: activeVoice?.status === 'ready' && Boolean(dna?.voice?.trim()),
    cta: defaultCta,
    productCount: entityCount ?? 0,
    brandKit: {
      primaryHex: brandKit.palette?.primary ?? null,
      secondaryHex: brandKit.palette?.secondary ?? null,
      logoPath: brandKit.logo_path ?? null,
      paletteSource: brandKit.palette_source ?? null,
    },
  })
  const summary = setupSummary(areas)
  /** ⚖️ ONE PLACE THAT KNOWS WHERE EACH ACTION GOES. A card whose button has no
   *  destination is the defect this rebuild is for, so the mapping is total and
   *  the compiler enforces it. */
  const goTo = (a: SetupArea) => {
    switch (a.action) {
      case 'add_product': return nav('/products?add=1')
      case 'manage_products': return nav('/products')
      case 'setup_brand_kit': return setTab('brand')
      case 'view_dna': return setTab('twin')
      // ⚠️ IT USED TO LEAVE SETTINGS ENTIRELY. Sending somebody to onboarding to
      // change one answer means re-walking a flow they finished weeks ago, and
      // the thing they wanted to change was two chips.
      case 'edit_profile': return setProfileOpen(true)
      case 'edit_cta': return setTab('twin')
    }
  }

  /** ⚖️ THE SAME TWO ANSWERS THE PIPELINE ACTUALLY BRANCHES ON. What they know
   *  decides how much a script explains; the commercial tie decides what it may
   *  claim. Both are the creator's own assertion, so editing them here carries
   *  exactly the authority it carried at onboarding — `user_answer` either way. */
  const saveProfileAnswers = async (patch: Record<string, unknown>) => {
    if (!defaultVoiceId) return
    setSavingProfile(true)
    try {
      await savePreScriptBrief(defaultVoiceId, patch)
      await loadVoice()
    } catch { setErr('Could not save that answer. Try again.') }
    finally { setSavingProfile(false) }
  }

  const saveDna = async () => {
    setSavingDna(true); setErr(null)
    try {
      await saveDNA(dna)
      await refreshProfile()
      setDnaSaved(true); setTimeout(() => setDnaSaved(false), 1800)
    } catch { setErr('Could not save your creator DNA. Try again.') } finally { setSavingDna(false) }
  }

  const togglePlatform = (p: Platform) =>
    setDna((d) => ({ ...d, platforms: d.platforms.includes(p) ? d.platforms.filter((x) => x !== p) : [...d.platforms, p] }))

  return (
    <main className="relative min-h-screen overflow-clip">
      <Aurora className="opacity-60" />
      <div className="relative mx-auto max-w-5xl px-5 py-12 lg:py-16">
        <Reveal>
          <p className="eyebrow">Account</p>
          <h1 className="mt-3 font-display text-4xl tracking-tight sm:text-5xl">Settings</h1>
        </Reveal>

        {err && (
          <div className="mt-6 rounded-card border border-coral/30 bg-coral/10 px-4 py-3 text-sm text-coral">{err}</div>
        )}

        {/* ── FOUR OBLIGATIONS, ONE NUMBER ──────────────────────────────────
            ⚠️ THE BANNER THIS REPLACES SAID "your profile is incomplete" AND
            COUNTED A LOGO TOWARD IT. A creator with every creative answer
            resolved and no brand colours was told Twin did not know enough to
            write for them, which was false — and the fix on offer was to invent
            a palette, which is the one thing `brandSnapshot` refuses to treat as
            brand truth. The obligations are separate here because they are
            separate: only the first one changes a script. */}
        {/* ── TABS: WHAT TWIN KNOWS · HOW IT LOOKS · WHAT IT COSTS · WHO YOU ARE ──
            ⚠️ THE OLD PAGE SCROLLED FROM PROFILE INTELLIGENCE INTO CREDIT PACKS
            INTO BRANDING INTO THE FULL DNA RECORD. There was no conceptual
            hierarchy, so the next useful action was something a creator had to
            find. */}
        <Reveal delay={0.02}>
          <div className="mt-7 flex gap-1 overflow-x-auto rounded-xl bg-white/[0.04] p-1 text-sm">
            {([
              ['twin', 'Your Twin'],
              ['brand', 'Logo & colours'],
              ['plan', 'Plan'],
              ['account', 'Account'],
            ] as const).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                aria-current={tab === k}
                className={`shrink-0 rounded-lg px-3.5 py-2 transition-colors ${
                  tab === k ? 'bg-white/10 text-cream' : 'text-sand hover:text-cream'}`}
              >{label}</button>
            ))}
          </div>
        </Reveal>

        {/* ── THE SETUP HERO: ONE COUNT, ONE NEXT STEP ────────────────────────
            ⚖️ AND IT GETS OUT OF THE WAY WHEN THE WORK IS DONE. A permanent
            "100%!" is a demand that has stopped meaning anything, so a finished
            setup collapses to a sentence rather than a bar. */}
        {tab === 'twin' && (
        <Reveal delay={0.03}>
          <section className="glass mt-6 p-5 sm:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="eyebrow !text-sand">Your Twin setup</p>
              <p className="font-heading text-cream">{summary.headline}</p>
            </div>
            {summary.total > 0 && summary.ready < summary.total && (
              <div className="mt-3 flex gap-1.5" aria-hidden>
                {/* ⚖️ SEGMENTS, NOT A PERCENTAGE. "3 of 4" is inspectable; a bar
                    at 74% invites the question nobody can answer. */}
                {areas.filter((a) => a.counts && a.state !== 'not_needed').map((a) => (
                  <span
                    key={a.id}
                    className={`h-1.5 flex-1 rounded-full ${
                      a.state === 'ready' ? 'bg-teal' : 'bg-white/12'}`}
                  />
                ))}
              </div>
            )}
            {summary.next ? (
              <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <p className="eyebrow !text-stone">Next step</p>
                <p className="mt-1.5 font-heading text-cream">{summary.next.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-sand">{summary.next.detail}</p>
                <button
                  type="button"
                  onClick={() => goTo(summary.next!)}
                  className="btn-gradient mt-4 rounded-lg px-3.5 py-2 text-sm"
                >{summary.next.actionLabel} →</button>
              </div>
            ) : (
              <p className="mt-3 text-sm leading-relaxed text-sand">
                Your voice, audience, goals and commercial context are all set.
              </p>
            )}

            {/* ⚠️ EVERY CARD IS GENUINELY INTERACTIVE. The old page had panels
                that looked tappable and went nowhere, which is worse than a plain
                list: it costs somebody an attempt to find out. */}
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {areas.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => goTo(a)}
                  className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-left transition-colors hover:border-white/20 hover:bg-white/[0.04]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-heading text-sm text-cream">{a.title}</span>
                    <StateChip state={a.state} />
                  </div>
                  <span className="mt-1.5 block text-xs leading-relaxed text-stone">{a.detail}</span>
                  <span className="mt-2.5 block text-xs text-sand underline">{a.actionLabel}</span>
                </button>
              ))}
            </div>
          </section>
        </Reveal>
        )}

        {/* ── EDIT PROFILE, WITHOUT LEAVING THE PAGE ─────────────────────────
            ⚠️ THE CARD USED TO SEND SOMEBODY TO ONBOARDING. Changing one answer
            meant re-walking a flow they finished weeks ago, to alter what is
            really two chips — so most people never changed anything, and the
            profile silently aged.
            ⚖️ ONLY THE TWO THE PIPELINE BRANCHES ON. What they know decides how
            much a script explains; the commercial tie decides what it may claim.
            The rest of onboarding is either already visible on this page or does
            not change behaviour, and a settings drawer that reprints an entire
            questionnaire is the wall of forms this rebuild exists to remove. */}
        {profileOpen && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-5" role="dialog" aria-modal>
            <div className="glass max-h-[85vh] w-full max-w-lg overflow-y-auto p-5">
              <p className="font-heading text-cream">What Twin writes from</p>
              <p className="mt-1 text-sm leading-relaxed text-sand">
                These two change your scripts more than anything else here.
              </p>

              <p className="mt-5 text-sm text-cream">How much does your audience already know?</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {([
                  ['beginners', 'They are new to this'],
                  ['basics', 'They know the basics'],
                  ['experienced', 'They know it well'],
                  ['mixed', 'A bit of everything'],
                ] as const).map(([v, label]) => {
                  const on = profileAnswers?.audienceKnowledge === v
                  return (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={on}
                      disabled={savingProfile}
                      onClick={() => void saveProfileAnswers({ audienceKnowledge: on ? null : v })}
                      className={`rounded-full border px-3.5 py-2 text-[13px] ${
                        on ? 'border-coral/50 bg-coral/[0.08] text-cream'
                          : 'border-white/10 bg-white/[0.02] text-sand hover:border-white/20'}`}
                    >{label}</button>
                  )
                })}
              </div>

              <p className="mt-5 text-sm text-cream">Do you sell or promote anything?</p>
              <p className="mt-0.5 text-xs text-stone">
                This decides what your scripts are allowed to claim. Pick everything that is true.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {([
                  ['own_product', 'I sell my own product'],
                  ['own_service', 'I sell my own service'],
                  ['affiliate', 'I earn a commission'],
                  ['sponsor', 'I get paid to feature things'],
                  ['review', 'I just cover things'],
                  ['none', 'Nothing commercial'],
                ] as const).map(([v, label]) => {
                  const ties = profileAnswers?.commercialTies ?? []
                  const on = ties.includes(v)
                  return (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={on}
                      disabled={savingProfile}
                      onClick={() => {
                        // ⚖️ "NOTHING COMMERCIAL" IS EXCLUSIVE. Holding it beside a
                        // real tie is a contradiction, and the pipeline would have
                        // to pick one — which is the class of decision this whole
                        // batch moved out of the model and into code.
                        const next = v === 'none'
                          ? (on ? [] : ['none'])
                          : on ? ties.filter((t) => t !== v)
                            : [...ties.filter((t) => t !== 'none'), v]
                        void saveProfileAnswers({ commercialTies: next })
                      }}
                      className={`rounded-full border px-3.5 py-2 text-[13px] ${
                        on ? 'border-coral/50 bg-coral/[0.08] text-cream'
                          : 'border-white/10 bg-white/[0.02] text-sand hover:border-white/20'}`}
                    >{label}</button>
                  )
                })}
              </div>

              <div className="mt-6 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => nav('/onboarding')}
                  className="text-xs text-sand underline"
                >Go through all the questions again</button>
                <button
                  type="button"
                  onClick={() => setProfileOpen(false)}
                  className="btn-gradient rounded-lg px-3.5 py-2 text-sm"
                >{savingProfile ? 'Saving…' : 'Done'}</button>
              </div>
            </div>
          </div>
        )}

        {tab === 'twin' && (
        <Reveal delay={0.04}>
          <ProfileStatus
            content={content}
            productDna={productDna}
            brandKit={kitStatus}
            cta={defaultCta}
            onCtaChange={setDefaultCta}
            onCtaCommit={(v) => void saveCta(v)}
            ctaSaved={ctaSaved}
            ctaErr={ctaErr}
          />
        </Reveal>
        )}

        {/* Account */}
        {tab === 'account' && (
        <Reveal delay={0.05}>
          <section className="glass mt-8 p-5 sm:p-6">
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/5"><User className="h-4 w-4 text-amber" /></span>
              <p className="eyebrow !text-sand">Profile</p>
            </div>
            <div className="mt-5 space-y-4">
              <div>
                <label className="eyebrow mb-1.5 block">Email</label>
                <input className="field" value={profile?.email ?? ''} disabled />
              </div>
              <div>
                <label className="eyebrow mb-1.5 block">Brand voice handle</label>
                <input
                  className="field"
                  value={activeVoice?.handle ? `@${activeVoice.handle}${activeVoice.platform ? ` · ${activeVoice.platform}` : ''}` : 'Not set yet'}
                  disabled
                />
                <p className="mt-1.5 text-[11px] text-stone">The account your voice was built from. Change it by scanning a new handle in “Refresh voice &amp; stats” below.</p>
              </div>
            </div>
          </section>
        </Reveal>

        )}

        {/* Team seats */}
        {tab === 'account' && (
        <Reveal delay={0.07}>
          <TeamSeats />
        </Reveal>
        )}

        {/* Plan */}
        {tab === 'plan' && (
        <Reveal delay={0.1}>
          <section className="glass mt-5 p-5 sm:p-6">
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/5"><Sparkles className="h-4 w-4 text-teal" /></span>
              <p className="eyebrow !text-sand">Plan</p>
            </div>
            <div className="mt-5">
              <div className="font-display text-2xl text-cream">{plan.name}</div>
              <div className="mt-1 text-sm text-stone">{plan.price ? `$${plan.price}/mo` : 'Free'} · {left} remix{left === 1 ? '' : 'es'} left</div>
            </div>
            <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-sand"><Check className="mt-0.5 h-4 w-4 shrink-0 text-teal" /> {f}</li>
              ))}
            </ul>
            <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-white/8 pt-4">
              {!PAYMENTS_LIVE ? (
                <>
                  <button onClick={() => setUpgradeOpen(true)} className="btn-ghost text-sm">
                    <ArrowUpRight className="h-4 w-4" /> See plans
                  </button>
                  <span className="rounded-full border border-amber/25 bg-amber/10 px-3 py-1 text-xs font-medium text-amber">Paid plans coming soon</span>
                </>
              ) : (
                <>
                  {higherPlans.length > 0 && (
                    <button onClick={() => setUpgradeOpen(true)} className="btn-gradient text-sm">
                      <ArrowUpRight className="h-4 w-4" /> {plan.id === 'free' ? 'Upgrade plan' : 'Change plan'}
                    </button>
                  )}
                  {plan.price > 0 && (
                    <button onClick={() => upgrade(plan.id)} disabled={coBusy !== null} className="btn-ghost text-sm disabled:opacity-60">
                      {coBusy === plan.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />} Manage payment
                    </button>
                  )}
                </>
              )}
            </div>
            {coMsg && <p className="mt-2 text-xs text-sand">{coMsg}</p>}
            <p className="mt-3 text-xs text-stone">Cancel any time — cancelling keeps any credits you've already been granted.</p>
          </section>
        </Reveal>

        )}

        {/* Add-ons — expansion revenue, surfaced so growing accounts can spend more
            without changing tier. */}
        {tab === 'plan' && (
        <Reveal delay={0.12}>
          <section className="glass mt-5 p-5 sm:p-6">
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/5"><Plus className="h-4 w-4 text-amber" /></span>
              <p className="eyebrow !text-sand">Add-ons</p>
            </div>
            <p className="mt-2 text-sm text-stone">Top up your plan as you grow — no need to switch tiers.</p>
            <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              {ADD_ONS.map((a) => (
                <div key={a.id} className="flex flex-col rounded-card border border-white/8 bg-white/[0.02] p-4">
                  <div className="font-heading text-sm text-cream">{a.name}</div>
                  <div className="mt-0.5 text-lg font-bold text-cream">${a.price}<span className="text-xs font-normal text-stone"> {a.unit}</span></div>
                  <p className="mt-1 flex-1 text-xs text-stone">{a.desc}</p>
                  {!PAYMENTS_LIVE ? (
                    <div className="mt-3 rounded-lg border border-amber/20 bg-amber/10 py-1.5 text-center text-[11px] font-medium text-amber">Coming soon</div>
                  ) : (
                    <button onClick={() => buyAddon(a.id)} disabled={addonBusy !== null} className="btn-ghost mt-3 text-xs disabled:opacity-60">
                      {addonBusy === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Add
                    </button>
                  )}
                </div>
              ))}
            </div>
            {addonMsg && <p className="mt-2 text-xs text-sand">{addonMsg}</p>}
          </section>
        </Reveal>

        )}

        {/* Brand kit — the creator's real colors + logo. Palette steers blueprint
            suggestions today; the rebuilt editor will consume the kit for renders. */}
        {tab === 'brand' && (
        <Reveal delay={0.13}>
          <section className="glass mt-5 p-5 sm:p-6">
            <div className="flex items-center justify-between gap-2.5">
              <div className="flex items-center gap-2.5">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/5"><Sparkles className="h-4 w-4 text-coral" /></span>
                <p className="eyebrow !text-sand">Brand kit</p>
              </div>
              {kitSaved && <span className="inline-flex items-center gap-1 text-xs text-teal"><Check className="h-3.5 w-3.5" /> Saved</span>}
              {kitErr && <span className="text-xs text-coral">Couldn’t save — change it again to retry.</span>}
            </div>
            {/* ⚖️ SAYS WHAT IT ACTUALLY CHANGES. Claiming "used across your
                blueprints and videos" oversells it: the palette steers packaging
                and thumbnail direction and the editor's supported styling, and it
                changes no word of a script. Overstating what a setting does is
                how a creator concludes the whole page is decorative. */}
            <p className="mt-2 text-sm text-stone">
              Your real colours and logo. They steer packaging, thumbnails and supported
              visual styling — they do not change what your scripts say.
            </p>
            {!defaultVoiceId ? (
              <p className="mt-4 text-sm text-stone/70">Scan a brand voice first to set a brand kit.</p>
            ) : (
              <div className="mt-4 space-y-4">
                <div>
                  <label className="eyebrow mb-2 block">Your brand colors <span className="font-normal normal-case text-stone">— your real palette, in hex</span></label>
                  {/* Honest fallback: the scan tried to read the palette from the
                      creator's posts but couldn't (e.g. Instagram blocks the images).
                      We say so plainly and invite them to set the colours here, rather
                      than showing a fabricated default. */}
                  {brandKit.palette_source === 'pending' && (
                    <div className="mb-3 flex items-start gap-2 rounded-xl border border-amber/25 bg-amber/[0.06] px-3 py-2.5 text-[12px] text-sand">
                      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber" />
                      <span>We couldn’t read your brand colours from your posts automatically — Instagram often blocks that. No problem: set them by hand below, or upload your logo, and they’ll be used everywhere.</span>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-5">
                    {/* ⚠️ THREE SLOTS, BECAUSE THREE ARE READ. `highlight` is
                        consumed by `brandSnapshot` and by the blueprint's
                        `paletteHex`, and Settings offered no way to set it — a
                        field with two readers and no writer, which is the same
                        asked-and-discarded defect in reverse. */}
                    {([['primary', 'Primary'], ['secondary', 'Secondary'], ['highlight', 'Highlight']] as const).map(([key, label]) => {
                      // Only show a swatch for a colour the creator has ACTUALLY set
                      // (scanned or hand-picked). Never fabricate a default hex — an
                      // unset colour showed a fake teal that looked like "a colour I
                      // don't have". Unset renders an empty "＋ Set" chip instead.
                      const set = brandKit.palette?.[key]
                      return (
                        <div key={key} className="flex flex-col items-center gap-1.5 text-[11px] text-stone">
                          {set ? (
                            <label className="cursor-pointer">
                              <input
                                key={set}
                                type="color"
                                defaultValue={set}
                                onBlur={(e) => { if (e.target.value !== set) saveKit({ ...brandKit, palette: { ...brandKit.palette, [key]: e.target.value }, palette_source: 'manual' }) }}
                                className="h-10 w-10 cursor-pointer rounded-lg border border-white/15 bg-transparent p-0"
                              />
                            </label>
                          ) : (
                            <label className="grid h-10 w-10 cursor-pointer place-items-center rounded-lg border border-dashed border-white/20 text-stone transition-colors hover:border-white/40 hover:text-cream">
                              <Plus className="h-4 w-4" />
                              <input
                                type="color"
                                defaultValue="#65E5D8"
                                onChange={(e) => saveKit({ ...brandKit, palette: { ...brandKit.palette, [key]: e.target.value }, palette_source: 'manual' })}
                                className="sr-only"
                              />
                            </label>
                          )}
                          {label}
                        </div>
                      )
                    })}
                  </div>
                  <p className="mt-1.5 text-[11px] text-stone">Not set yet? Tap ＋ to add a colour, or hit “Refresh voice &amp; stats” to read them from your posts. Primary/secondary steer background &amp; wardrobe suggestions in your blueprints.</p>
                </div>
                <div>
                  <label className="eyebrow mb-2 block">Logo <span className="font-normal normal-case text-stone">— part of your brand kit</span></label>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="btn-ghost cursor-pointer text-sm">
                      {logoBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                      {brandKit.logo_path ? 'Replace logo' : 'Upload logo'}
                      <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={onLogo} disabled={logoBusy} />
                    </label>
                    {brandKit.logo_path && (
                      <>
                        <span className="inline-flex items-center gap-1 text-xs text-teal"><Check className="h-3.5 w-3.5" /> Logo set</span>
                        <button onClick={() => saveKit({ ...brandKit, logo_path: undefined })} className="text-xs text-stone hover:text-coral">Remove</button>
                      </>
                    )}
                  </div>
                  <p className="mt-1 text-[11px] text-stone">PNG with transparency works best. Max 3MB.</p>
                </div>
                <p className="text-xs text-stone">Saved with your brand — the rebuilt AI editor will apply your kit to every video automatically.</p>
              </div>
            )}
          </section>
        </Reveal>

        )}

        {/* ── YOUR VOICE: A SUMMARY, WITH THE RECORD BEHIND IT ────────────────
            ⚠️ THE FULL DNA RECORD OCCUPIED HALF A KILOMETRE OF SETTINGS. Every
            visit meant scrolling past niche, audience, vocabulary, POV, hooks and
            pacing to reach anything else — which is most of why the page read as
            a document rather than a place where things happen.
            ⚖️ NOTHING IS REMOVED, ONLY FOLDED. It is the same canonical record,
            one tap away, and the summary above it is the part a creator actually
            checks: does this sound like me? */}
        {tab === 'twin' && (
        <Reveal delay={0.15}>
          <section className="glass mt-5 p-5 sm:p-6">
            {!dnaOpen && (
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="eyebrow !text-sand">Your voice</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-cream">
                    {(dna.voice ?? '').trim() || 'Twin has not learned how you sound yet.'}
                  </p>
                  <p className="mt-1 truncate text-xs text-stone">
                    {[dna.niche, dna.audience].map((x) => (x ?? '').trim()).filter(Boolean).join(' · ')
                      || 'Scan your account and Twin will fill this in.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDnaOpen(true)}
                  className="shrink-0 rounded-lg border border-white/15 px-3 py-1.5 text-xs text-cream"
                >View everything</button>
              </div>
            )}
            {dnaOpen && (
            <>
            <button
              type="button"
              onClick={() => setDnaOpen(false)}
              className="mb-4 text-xs text-sand underline"
            >← Back to the summary</button>
            <div className="flex items-center justify-between gap-2.5">
              <div className="flex items-center gap-2.5">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/5"><ShieldCheck className="h-4 w-4 text-coral" /></span>
                <div>
                  <p className="eyebrow !text-sand">Creator DNA</p>
                  {activeVoice?.handle && (
                    <p className="mt-0.5 text-xs text-stone">Active brand: <span className="text-sand">@{activeVoice.handle}</span>{activeVoice.platform ? ` · ${activeVoice.platform}` : ''}</p>
                  )}
                </div>
              </div>
              {!editingDna && (
                <div className="flex items-center gap-2">
                  <button onClick={refreshVoice} disabled={refreshing} className="btn-ghost text-sm disabled:opacity-60">
                    <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} /> {refreshing ? 'Scanning…' : 'Refresh voice & stats'}
                  </button>
                  <button onClick={() => setEditingDna(true)} className="btn-ghost text-sm"><Pencil className="h-3.5 w-3.5" /> Edit</button>
                </div>
              )}
            </div>
            <p className="mt-2 text-sm text-stone">This shapes every script's voice and your gallery's default niche.</p>
            {refreshMsg && <p className="mt-2 rounded-lg bg-white/[0.04] px-3 py-2 text-xs text-sand">{refreshMsg}</p>}

            {!editingDna ? (
              voiceLoading ? (
                <div className="mt-5 flex items-center gap-2 text-sm text-sand"><Loader2 className="h-4 w-4 animate-spin" /> Loading your brand DNA…</div>
              ) : voiceErr ? (
                <div className="mt-5 rounded-card border border-coral/20 bg-coral/[0.05] p-4">
                  <p className="text-sm text-cream">Couldn't load your brand DNA.</p>
                  <p className="mt-1 text-xs text-stone">This is usually a brief connection hiccup — your DNA is safe, nothing was lost.</p>
                  <button onClick={loadVoice} className="btn-ghost mt-3 text-sm"><RefreshCw className="h-3.5 w-3.5" /> Try again</button>
                </div>
              ) : (
              /* Read-only view — what we already know about you. */
              <div className="mt-5 space-y-3">
                {voiceProfile?.summary && (
                  <div className="rounded-card border border-teal/15 bg-teal/[0.04] p-4">
                    <p className="eyebrow !text-teal">What we learned from your posts</p>
                    <p className="mt-1.5 text-sm leading-relaxed text-sand">{voiceProfile.summary}</p>
                    {voiceProfile.vocabulary?.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {voiceProfile.vocabulary.slice(0, 8).map((w) => <span key={w} className="chip !py-1 text-xs">{w}</span>)}
                      </div>
                    )}
                  </div>
                )}
                {DNA_FIELDS.map((f) => {
                  const v = shownDna(f.key)
                  return (
                  <div key={f.key} className="flex flex-col gap-0.5 border-b border-white/6 pb-3 sm:flex-row sm:items-baseline sm:gap-3">
                    <span className="eyebrow w-40 shrink-0">{f.label}</span>
                    {v ? <span className="text-sm text-cream">{v}</span> : <button onClick={() => setEditingDna(true)} className="text-sm text-amber/80 hover:text-amber">+ Add</button>}
                  </div>
                  )
                })}
                <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
                  <span className="eyebrow w-40 shrink-0">Platforms</span>
                  <span className="flex flex-wrap gap-1.5">
                    {dna.platforms.length ? dna.platforms.map((p) => <span key={p} className="chip capitalize !py-1 text-xs">{p}</span>) : <button onClick={() => setEditingDna(true)} className="text-sm text-amber/80 hover:text-amber">+ Add</button>}
                  </span>
                </div>
                {dna.voice_samples && (
                  <div className="flex flex-col gap-0.5">
                    <span className="eyebrow">How you write</span>
                    <span className="line-clamp-2 text-sm text-sand">{dna.voice_samples}</span>
                  </div>
                )}
              </div>
              )
            ) : (
              /* Edit form. */
              <div className="mt-5 space-y-4">
                <p className="rounded-lg bg-white/[0.04] px-3 py-2 text-xs text-sand">Your scanned niche &amp; voice are filled in below — tweak them, and add audience, product and goal so every script gets sharper.</p>
                {DNA_FIELDS.map((f) => (
                  <div key={f.key}>
                    <label className="eyebrow mb-1.5 block">{f.label}</label>
                    <input className="field" value={shownDna(f.key)} placeholder={f.placeholder} onChange={(e) => setDna((d) => ({ ...d, [f.key]: e.target.value }))} />
                  </div>
                ))}
                <div>
                  <label className="eyebrow mb-1.5 block">How you write <span className="font-normal normal-case text-stone">— paste a few posts (optional)</span></label>
                  <textarea className="field min-h-[96px] resize-y" value={dna.voice_samples ?? ''} placeholder="Paste 2–3 of your real posts (LinkedIn, captions, a blog excerpt). We match your exact cadence." onChange={(e) => setDna((d) => ({ ...d, voice_samples: e.target.value }))} />
                </div>
                <div>
                  <label className="eyebrow mb-2 block">Platforms</label>
                  <div className="flex flex-wrap gap-2">
                    {PLATFORMS.map((p) => (
                      <button key={p} onClick={() => togglePlatform(p)} className={`chip capitalize ${dna.platforms.includes(p) ? 'border-coral/60 bg-coral/10 text-cream' : 'hover:border-white/20 hover:text-cream'}`}>
                        {dna.platforms.includes(p) && <Check className="h-3.5 w-3.5 text-coral" />} {p}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={async () => { await saveDna(); setEditingDna(false) }} disabled={savingDna} className="btn-gradient text-sm">
                    {savingDna ? <Loader2 className="h-4 w-4 animate-spin" /> : dnaSaved ? <Check className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                    {dnaSaved ? 'Saved' : 'Save'}
                  </button>
                  <button onClick={() => { setDna({ ...EMPTY_DNA, ...(profile?.dna ?? {}) }); setEditingDna(false) }} className="btn-ghost text-sm">Cancel</button>
                </div>
              </div>
            )}
            </>
            )}
          </section>
        </Reveal>

        )}

        {/* Sign out */}
        {tab === 'account' && (
        <Reveal delay={0.2}>
          <section className="mt-5 flex items-center justify-between rounded-card border border-white/8 bg-white/[0.02] p-5">
            <div>
              <div className="font-heading text-cream">Sign out</div>
              <div className="text-sm text-stone">End your session on this device.</div>
            </div>
            <button onClick={signOut} className="btn-ghost text-sm"><LogOut className="h-4 w-4" /> Sign out</button>
          </section>
        </Reveal>
        )}
      </div>

      {/* Plan-comparison upgrade modal (SaaS-style): explains each plan, then
          routes the chosen one to checkout. */}
      {upgradeOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/85 p-4 backdrop-blur-sm" onClick={() => setUpgradeOpen(false)}>
          <div className="glass relative max-h-[88vh] w-full max-w-6xl overflow-y-auto p-6 sm:p-8" onClick={(e) => e.stopPropagation()}>
            <button aria-label="Close" onClick={() => setUpgradeOpen(false)} className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-lg text-stone hover:bg-white/5 hover:text-cream"><X className="h-4 w-4" /></button>
            <h2 className="font-display text-2xl tracking-tight sm:text-3xl">Choose your plan</h2>
            <p className="mt-1 text-sm text-stone">Upgrade, downgrade, or switch any time. You keep credits you've already been granted.</p>
            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {PLANS.filter((p) => !p.hidden).map((p) => {
                const current = p.id === plan.id
                const isUp = p.price > plan.price
                return (
                  <div key={p.id} className={cn('flex flex-col rounded-card border p-5', current ? 'border-teal/50 bg-teal/[0.05]' : p.id === 'professional' ? 'border-amber/40 bg-amber/[0.04]' : 'border-white/10 bg-white/[0.02]')}>
                    {p.id === 'professional' && !current && <span className="mb-2 inline-block w-fit rounded-full bg-amber/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber">Most popular</span>}
                    <div className="font-display text-xl text-cream">{p.name}</div>
                    <div className="mt-1 text-3xl font-bold text-cream">{p.price ? `$${p.price}` : 'Free'}<span className="text-sm font-normal text-stone">{p.price ? '/mo' : ''}</span></div>
                    <p className="mt-1 text-xs text-stone">{p.blurb}</p>
                    <ul className="mt-3 flex-1 space-y-1.5">
                      {p.features.map((f) => (
                        <li key={f} className="flex items-start gap-1.5 text-xs text-sand"><Check className="mt-0.5 h-3 w-3 shrink-0 text-teal" /> {f}</li>
                      ))}
                    </ul>
                    <div className="mt-4">
                      {current ? (
                        <div className="rounded-lg bg-white/5 py-2 text-center text-xs font-semibold text-stone">Current plan</div>
                      ) : p.price === 0 ? (
                        <div className="py-2 text-center text-xs text-stone">—</div>
                      ) : !PAYMENTS_LIVE ? (
                        <div className="rounded-lg border border-amber/20 bg-amber/10 py-2 text-center text-xs font-medium text-amber">Coming soon</div>
                      ) : (
                        <button onClick={() => upgrade(p.id)} disabled={coBusy !== null} className={cn('w-full text-sm', isUp ? 'btn-gradient' : 'btn-ghost')}>
                          {coBusy === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : isUp ? <ArrowUpRight className="h-4 w-4" /> : null}
                          {isUp ? `Upgrade to ${p.name}` : `Switch to ${p.name}`}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            {coMsg && <p className="mt-4 text-center text-xs text-sand">{coMsg}</p>}
          </div>
        </div>
      )}

      {/* Crypto payment panel — copyable address + amount; the plan activates once
          the on-chain payment is confirmed (admin/webhook). No bank or LLC needed. */}
      {cryptoPay && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/85 p-4 backdrop-blur-sm" onClick={() => setCryptoPay(null)}>
          <div className="glass relative w-full max-w-md p-6 sm:p-7" onClick={(e) => e.stopPropagation()}>
            <button aria-label="Close" onClick={() => setCryptoPay(null)} className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-lg text-stone hover:bg-white/5 hover:text-cream"><X className="h-4 w-4" /></button>
            <h2 className="font-display text-2xl tracking-tight">Pay with crypto</h2>
            <p className="mt-1 text-sm text-stone">Send the exact amount to the address below. Your plan activates once the payment is confirmed (usually within the hour).</p>
            <div className="mt-5 space-y-3">
              <div className="flex items-center justify-between rounded-card border border-white/8 bg-white/[0.02] px-4 py-3">
                <span className="text-xs uppercase tracking-wider text-stone">Amount</span>
                <span className="font-display text-xl text-cream">${cryptoPay.amount} <span className="text-sm text-sand">{cryptoPay.asset}</span></span>
              </div>
              <div className="rounded-card border border-white/8 bg-white/[0.02] px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase tracking-wider text-stone">{cryptoPay.asset} address</span>
                  <button
                    onClick={() => { navigator.clipboard?.writeText(cryptoPay.address).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }, () => {}) }}
                    className="inline-flex items-center gap-1 text-xs text-amber hover:text-cream"
                  >
                    {copied ? <Check className="h-3.5 w-3.5 text-teal" /> : <CreditCard className="h-3.5 w-3.5" />} {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <p className="mt-1.5 break-all font-mono text-sm text-cream">{cryptoPay.address}</p>
              </div>
              <p className="text-xs text-stone">Network: send {cryptoPay.asset} on a supported chain (e.g. TRC-20 / ERC-20). After sending, keep this window — we confirm and unlock your plan automatically.</p>
            </div>
            <button onClick={() => setCryptoPay(null)} className="btn-gradient mt-5 w-full">I've sent the payment</button>
          </div>
        </div>
      )}
    </main>
  )
}

// Team seats: invite ONE teammate (free for now) into your workspace — they see
// and work on your client voices + scripts on your remixes. More seats are paid
// (later). If you're a teammate yourself, this shows your workspace status.
const SEAT_LIMIT = 1
// Teammates are a top-tier feature only. Solo plans (free / aspiring /
// professional) manage a single voice themselves and never see invite controls.
const TEAM_PLANS = new Set(['studio', 'agency'])

function TeamSeats() {
  const { profile } = useAuth()
  const [ws, setWs] = useState<WorkspaceState | null>(null)
  const [link, setLink] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  const load = () => { getWorkspace().then(setWs).catch(() => {}) }
  useEffect(load, [])

  const invite = async () => {
    setBusy(true)
    const url = await createWorkspaceInvite()
    setBusy(false)
    if (!url) return
    setLink(url)
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1600) } catch { /* shown to copy */ }
  }
  const remove = async (memberId: string) => {
    setWs((w) => (w ? { ...w, members: w.members.filter((m) => m.member_id !== memberId) } : w))
    await removeWorkspaceMember(memberId).catch(() => {})
  }

  // A teammate in someone else's workspace — show status, no invite controls.
  // (Shown regardless of the teammate's own plan; it's just informational.)
  if (ws?.memberOf) {
    return (
      <section className="glass mt-5 p-5 sm:p-6">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/5"><Users className="h-4 w-4 text-amber" /></span>
          <p className="eyebrow !text-sand">Team</p>
        </div>
        <p className="mt-4 text-sm text-sand">You're a teammate in a shared workspace. You can create and edit in the workspace's brand voices — billing stays with the workspace owner.</p>
      </section>
    )
  }

  // Owner-side invite controls are Studio/Agency only — hide the whole section
  // on solo plans (the "why is invite a teammate here on Free?" fix).
  if (!TEAM_PLANS.has(profile?.plan ?? 'free')) return null

  const used = ws?.members.length ?? 0
  const atCap = used >= SEAT_LIMIT

  return (
    <section className="glass mt-5 p-5 sm:p-6">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/5"><Users className="h-4 w-4 text-amber" /></span>
          <p className="eyebrow !text-sand">Team</p>
        </div>
        <span className="text-xs text-stone">{used} / {SEAT_LIMIT} seat{SEAT_LIMIT === 1 ? '' : 's'} used</span>
      </div>
      <p className="mt-3 text-sm text-stone">
        Invite a teammate into your workspace — they work on your client voices and scripts, on your remixes. You keep billing and can remove them anytime.
      </p>

      {(ws?.members ?? []).length > 0 && (
        <div className="mt-4 space-y-2">
          {ws!.members.map((m) => (
            <div key={m.member_id} className="flex items-center justify-between rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2.5">
              <span className="inline-flex items-center gap-2 text-sm text-sand"><span className="grid h-6 w-6 place-items-center rounded-full bg-teal/15 text-[10px] font-bold text-teal">{m.member_id.slice(0, 2).toUpperCase()}</span> Teammate</span>
              <button onClick={() => remove(m.member_id)} className="text-xs text-stone transition-colors hover:text-coral">Remove</button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {atCap ? (
          <span className="text-xs text-stone">Seat full. <span className="text-amber">More seats are coming soon.</span></span>
        ) : (
          <button onClick={invite} disabled={busy} className="btn-ghost text-sm disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />} {link ? 'Copy invite link' : 'Create invite link'}
          </button>
        )}
        {copied && <span className="inline-flex items-center gap-1 text-xs text-teal"><Check className="h-3.5 w-3.5" /> Copied</span>}
      </div>
      {link && (
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-white/8 bg-ink/40 px-3 py-2">
          <span className="min-w-0 flex-1 truncate text-xs text-stone">{link}</span>
          <button aria-label="Copy invite link" title="Copy invite link" onClick={() => { navigator.clipboard.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600) }, () => {}) }} className="shrink-0 rounded text-stone hover:text-cream focus-visible:outline focus-visible:outline-2 focus-visible:outline-coral"><Copy className="h-3.5 w-3.5" /></button>
        </div>
      )}
    </section>
  )
}

/** WHAT TWIN KNOWS, SPLIT BY WHAT IT CONTROLS.
 *
 *  ⚠️ ONE PERCENTAGE AND THREE STATES, AND THE SHAPE IS THE ARGUMENT. Only the
 *  first of these changes a script; the other three change what the editor may
 *  render, what a script may claim about an offer, and what the Director Plan may
 *  ask a person to physically do. Folding them into one number is what let the
 *  old banner tell a fully-answered creator they were 70% known.
 *
 *  ⚖️ AND NOTHING HERE IS WORDED AS A DEFICIENCY. "Not set up" is a true and
 *  unembarrassing state; a percentage attached to it would imply a shortfall that
 *  costs the creator nothing.
 */
function ProfileStatus({
  content, productDna, brandKit, cta, onCtaChange, onCtaCommit, ctaSaved, ctaErr,
}: {
  content: ContentProfile
  productDna: ProductDnaStatus
  brandKit: BrandKitStatus
  cta: string | null
  onCtaChange: (v: string) => void
  onCtaCommit: (v: string) => void
  ctaSaved: boolean
  ctaErr: boolean
}) {
  const ctaText = (cta ?? '').trim()
  const [ctaOpen, setCtaOpen] = useState(false)
  const [ctaDraft, setCtaDraft] = useState(ctaText)
  return (
    <section className="glass mt-8 p-5 sm:p-6">
      <div className="flex items-baseline justify-between gap-3">
        <p className="eyebrow !text-sand">What Twin knows about you</p>
        <span className="font-display text-2xl leading-none">{content.percent}%</span>
      </div>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/8">
        <div className="h-full rounded-full bg-signature" style={{ width: `${content.percent}%` }} />
      </div>
      <p className="mt-2 text-xs text-stone">
        This is what your scripts are written from. Colours and logos are separate — they
        never change what a script says.
      </p>

      {content.gaps.length > 0 && (
        <ul className="mt-4 space-y-2">
          {content.gaps.map((g) => (
            <li key={g.id} className="rounded-lg border border-white/10 px-3 py-2">
              <p className="text-sm text-cream">{g.label}</p>
              {/* ⚖️ WHAT IT UNLOCKS, NOT WHAT IS MISSING. A creator can decide
                  whether to spend thirty seconds on this; "incomplete" only tells
                  them they are behind. */}
              <p className="mt-0.5 text-xs text-stone">Adding this changes {g.unlocks}.</p>
            </li>
          ))}
        </ul>
      )}

      {/* ⚠️ A PERMANENTLY EDITABLE NAKED INPUT ON A SETTINGS PAGE IS NOT A
          SETTING, it is a form field somebody has to notice, decide about, and
          then wonder whether it saved. What a creator wants here is to SEE their
          answer and change it deliberately.
          ⚖️ ASKED ONCE, AND ONLY THEIR OWN WORDING IS STORED. Twin writes a CTA
          when there is none; a generated sentence never becomes their preference. */}
      <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-cream">What viewers should do after your videos</p>
            <p className="mt-1 truncate text-sm text-sand">
              {ctaText
                ? `“${ctaText}”`
                // ⚠️ NOT AN ERROR STATE. Plenty of creators do not want every
                // video to end with an ask, and saying so plainly is the
                // difference between a choice and an omission.
                : 'No usual ending — Twin writes one to fit each video.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => { setCtaDraft(ctaText); setCtaOpen(true) }}
            className="shrink-0 rounded-lg border border-white/15 px-3 py-1.5 text-xs text-cream"
          >{ctaText ? 'Edit' : 'Add one'}</button>
        </div>
        {ctaSaved && <p className="mt-2 text-xs text-teal">Saved</p>}
        {ctaErr && <p className="mt-2 text-xs text-coral">Could not save that — try again.</p>}
      </div>

      {ctaOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-5" role="dialog" aria-modal>
          <div className="glass w-full max-w-md p-5">
            <p className="font-heading text-cream">Your usual ending</p>
            <p className="mt-1 text-sm leading-relaxed text-sand">
              What should Twin usually ask viewers to do? You can change it for any
              single video.
            </p>
            <input
              autoFocus
              type="text"
              value={ctaDraft}
              onChange={(e) => setCtaDraft(e.target.value)}
              placeholder="Try Twin free"
              className="mt-3 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-cream outline-none placeholder:text-stone/60 focus:border-signature"
            />
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => { onCtaChange(ctaDraft); onCtaCommit(ctaDraft); setCtaOpen(false) }}
                className="btn-gradient rounded-lg px-3.5 py-2 text-sm"
              >Save</button>
              {/* ⚖️ AN EXPLICIT "NO" IS AN ANSWER AND MUST BE STORABLE. Clearing
                  the box and leaving is ambiguous — this is not. */}
              <button
                type="button"
                onClick={() => { onCtaChange(''); onCtaCommit(''); setCtaOpen(false) }}
                className="btn-ghost rounded-lg px-3.5 py-2 text-sm"
              >I don't have a usual ending</button>
              <button
                type="button"
                onClick={() => setCtaOpen(false)}
                className="rounded-lg px-3.5 py-2 text-sm text-stone"
              >Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <StatusLine
          title="Products you sell"
          state={productDna === 'ready' ? 'Ready' : productDna === 'not_needed' ? 'Not needed' : 'Not added'}
          tone={productDna === 'missing' ? 'open' : 'done'}
          note={productDna === 'not_needed'
            // ⚠️ NOT "you have not added a product". They told us there is none;
            // repeating the ask is the product arguing with them.
            ? 'You told us you do not sell anything, so there is nothing to add.'
            : productDna === 'ready'
              ? 'Your scripts can talk about it, using only what you confirmed.'
              : 'Add one if you want your scripts to talk about what you sell.'}
        />
        <StatusLine
          title="Brand Kit"
          state={brandKit === 'ready' ? 'Ready' : 'Not set up'}
          tone={brandKit === 'ready' ? 'done' : 'open'}
          note="Add colours and a logo if you want Twin to use your branding in supported visuals."
        />
      </div>
    </section>
  )
}

/** ⚖️ `open` IS NOT A WARNING COLOUR. Nothing here is wrong — these are things
 *  that exist or do not, and painting an unset kit amber would reintroduce the
 *  guilt the percentage used to carry. */
/** ⚖️ FIVE STATES, FIVE WORDS A CREATOR ALREADY KNOWS. `optional` and
 *  `not_needed` read differently on purpose — one is something they could do,
 *  the other is something that does not apply to them, and collapsing either
 *  into "missing" is how a page starts nagging for work that cannot help. */
function StateChip({ state }: { state: SetupState }) {
  const map: Record<SetupState, { label: string; cls: string }> = {
    ready: { label: 'Ready', cls: 'bg-teal/15 text-teal' },
    needs_setup: { label: 'Needs setup', cls: 'bg-amber-500/15 text-amber-400' },
    needs_review: { label: 'Worth a look', cls: 'bg-amber-500/10 text-amber-300' },
    optional: { label: 'Optional', cls: 'bg-white/8 text-stone' },
    not_needed: { label: 'Not needed', cls: 'bg-white/8 text-stone' },
  }
  const { label, cls } = map[state]
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${cls}`}>{label}</span>
}

function StatusLine({ title, state, note, tone }: {
  title: string; state: string; note: string; tone: 'done' | 'open'
}) {
  return (
    <div className="rounded-lg border border-white/10 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-cream">{title}</p>
        <span className={cn(
          'rounded-full px-2 py-0.5 text-[11px]',
          tone === 'done' ? 'bg-teal/15 text-teal' : 'bg-white/8 text-stone',
        )}>{state}</span>
      </div>
      <p className="mt-1 text-xs leading-snug text-stone">{note}</p>
    </div>
  )
}
