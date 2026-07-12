import { useEffect, useState } from 'react'
import { User, Sparkles, Check, Loader2, LogOut, ArrowUpRight, ShieldCheck, Pencil, CreditCard, X, RefreshCw, Plus, Users, Copy, Link2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { updateDisplayName, saveDNA, startCheckout, listBrandVoices, startDna, pollDna, saveBrandKit, uploadBrandLogo, getWorkspace, createWorkspaceInvite, removeWorkspaceMember, type WorkspaceState } from '../lib/api'
import { PLANS, ADD_ONS, videosFromCredits, PAYMENTS_LIVE } from '../lib/brand'
import type { CreatorDNA, Platform, VoiceProfile, BrandKit } from '../lib/types'
import { CAPTION_STYLE_OPTIONS, CAPTION_COLOR_OPTIONS } from '../lib/types'
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

  const [name, setName] = useState(profile?.display_name ?? '')
  const [savingName, setSavingName] = useState(false)
  const [nameSaved, setNameSaved] = useState(false)

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
  const [brandKit, setBrandKit] = useState<BrandKit>({})
  const [kitSaved, setKitSaved] = useState(false)
  useEffect(() => {
    listBrandVoices()
      .then((vs) => {
        const def = vs.find((v) => v.is_default && v.status === 'ready') ?? vs.find((v) => v.status === 'ready') ?? vs[0]
        if (def?.id) setDefaultVoiceId(def.id)
        if (def?.brand_kit) setBrandKit(def.brand_kit)
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
      .catch(() => {})
  }, [])
  const saveKit = async (next: BrandKit) => {
    setBrandKit(next)
    if (!defaultVoiceId) return
    try { await saveBrandKit(defaultVoiceId, next); setKitSaved(true); setTimeout(() => setKitSaved(false), 1500) } catch { /* ignore */ }
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
      const started = await startDna(v.handle, v.platform)
      const id = started.brand_voice_id ?? v.id
      // Poll until the scan finishes (or we give up after ~90s).
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 3000))
        const res = await pollDna(id)
        if (res.status === 'ready') { setRefreshMsg('Voice & stats refreshed — your dashboard is up to date.'); await refreshProfile(); return }
        if (res.status === 'failed') { setRefreshMsg(res.error || 'Couldn\'t refresh — please try again shortly.'); return }
      }
      setRefreshMsg('Still working in the background — check your dashboard in a minute.')
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

  const saveName = async () => {
    setSavingName(true); setErr(null)
    try {
      await updateDisplayName(name)
      await refreshProfile()
      setNameSaved(true); setTimeout(() => setNameSaved(false), 1800)
    } catch { setErr('Could not save your name. Try again.') } finally { setSavingName(false) }
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
      <div className="relative mx-auto max-w-2xl px-5 py-12 lg:py-16">
        <Reveal>
          <p className="eyebrow">Account</p>
          <h1 className="mt-3 font-display text-4xl tracking-tight sm:text-5xl">Settings</h1>
        </Reveal>

        {err && (
          <div className="mt-6 rounded-card border border-coral/30 bg-coral/10 px-4 py-3 text-sm text-coral">{err}</div>
        )}

        {/* Account */}
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
                <label className="eyebrow mb-1.5 block">Display name</label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
                  <button onClick={saveName} disabled={savingName} className="btn-gradient shrink-0 text-sm">
                    {savingName ? <Loader2 className="h-4 w-4 animate-spin" /> : nameSaved ? <Check className="h-4 w-4" /> : null}
                    {nameSaved ? 'Saved' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          </section>
        </Reveal>

        {/* Team seats */}
        <Reveal delay={0.07}>
          <TeamSeats />
        </Reveal>

        {/* Plan */}
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

        {/* Add-ons — expansion revenue, surfaced so growing accounts can spend more
            without changing tier. */}
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

        {/* Brand kit — default caption look applied to every edit (rides the EDL,
            no render change). The editor panel's #1 churn ask, render-safe slice. */}
        <Reveal delay={0.13}>
          <section className="glass mt-5 p-5 sm:p-6">
            <div className="flex items-center justify-between gap-2.5">
              <div className="flex items-center gap-2.5">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/5"><Sparkles className="h-4 w-4 text-coral" /></span>
                <p className="eyebrow !text-sand">Brand kit</p>
              </div>
              {kitSaved && <span className="inline-flex items-center gap-1 text-xs text-teal"><Check className="h-3.5 w-3.5" /> Saved</span>}
            </div>
            <p className="mt-2 text-sm text-stone">Your default caption look — applied to every video you edit.</p>
            {!defaultVoiceId ? (
              <p className="mt-4 text-sm text-stone/70">Scan a brand voice first to set a brand kit.</p>
            ) : (
              <div className="mt-4 space-y-4">
                <div>
                  <label className="eyebrow mb-2 block">Caption style</label>
                  <div className="flex flex-wrap gap-2">
                    {CAPTION_STYLE_OPTIONS.map((s) => (
                      <button key={s.id} onClick={() => saveKit({ ...brandKit, caption_style: s.id })}
                        className={cn('rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors', brandKit.caption_style === s.id ? 'border-coral/60 bg-coral/15 text-cream' : 'border-white/10 bg-white/5 text-stone hover:text-cream')}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="eyebrow mb-2 block">Highlight color</label>
                  <div className="flex flex-wrap gap-2.5">
                    {CAPTION_COLOR_OPTIONS.map((c) => (
                      <button key={c.id} onClick={() => saveKit({ ...brandKit, color: c.id })} title={c.label}
                        className={cn('h-9 w-9 rounded-full ring-2 ring-offset-2 ring-offset-ink transition-all', brandKit.color === c.id ? 'scale-110 ring-cream' : 'ring-transparent hover:ring-white/30')}
                        style={{ backgroundColor: c.hex }} />
                    ))}
                  </div>
                </div>
                <div>
                  <label className="eyebrow mb-2 block">Your brand colors <span className="font-normal normal-case text-stone">— your real palette, in hex</span></label>
                  <div className="flex flex-wrap gap-5">
                    {([['highlight', 'Caption highlight'], ['primary', 'Primary'], ['secondary', 'Secondary']] as const).map(([key, label]) => (
                      <label key={key} className="flex flex-col items-center gap-1.5 text-[11px] text-stone">
                        <input
                          key={brandKit.palette?.[key] ?? `d-${key}`}
                          type="color"
                          defaultValue={brandKit.palette?.[key] ?? '#65E5D8'}
                          onBlur={(e) => { if (e.target.value !== brandKit.palette?.[key]) saveKit({ ...brandKit, palette: { ...brandKit.palette, [key]: e.target.value }, palette_source: 'manual' }) }}
                          className="h-10 w-10 cursor-pointer rounded-lg border border-white/15 bg-transparent p-0"
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                  <p className="mt-1.5 text-[11px] text-stone">Caption highlight overrides the preset above in every render. Primary/secondary steer the background &amp; wardrobe suggestions in your blueprints.</p>
                </div>
                <div>
                  <label className="eyebrow mb-2 block">Logo <span className="font-normal normal-case text-stone">— burned into the top-right of every export</span></label>
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
                <p className="text-xs text-stone">Applied as the default on new edits, on every plan. You can still tweak any single video in Refine. (16:9 / long-form export + trending audio are coming next.)</p>
              </div>
            )}
          </section>
        </Reveal>

        {/* Creator DNA */}
        <Reveal delay={0.15}>
          <section className="glass mt-5 p-5 sm:p-6">
            <div className="flex items-center justify-between gap-2.5">
              <div className="flex items-center gap-2.5">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/5"><ShieldCheck className="h-4 w-4 text-coral" /></span>
                <p className="eyebrow !text-sand">Creator DNA</p>
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
          </section>
        </Reveal>

        {/* Sign out */}
        <Reveal delay={0.2}>
          <section className="mt-5 flex items-center justify-between rounded-card border border-white/8 bg-white/[0.02] p-5">
            <div>
              <div className="font-heading text-cream">Sign out</div>
              <div className="text-sm text-stone">End your session on this device.</div>
            </div>
            <button onClick={signOut} className="btn-ghost text-sm"><LogOut className="h-4 w-4" /> Sign out</button>
          </section>
        </Reveal>
      </div>

      {/* Plan-comparison upgrade modal (SaaS-style): explains each plan, then
          routes the chosen one to checkout. */}
      {upgradeOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/85 p-4 backdrop-blur-sm" onClick={() => setUpgradeOpen(false)}>
          <div className="glass relative max-h-[88vh] w-full max-w-6xl overflow-y-auto p-6 sm:p-8" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setUpgradeOpen(false)} className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-lg text-stone hover:bg-white/5 hover:text-cream"><X className="h-4 w-4" /></button>
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
            <button onClick={() => setCryptoPay(null)} className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-lg text-stone hover:bg-white/5 hover:text-cream"><X className="h-4 w-4" /></button>
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
function TeamSeats() {
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
          <button onClick={() => { navigator.clipboard.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600) }, () => {}) }} className="shrink-0 text-stone hover:text-cream"><Copy className="h-3.5 w-3.5" /></button>
        </div>
      )}
    </section>
  )
}
