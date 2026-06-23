import { useState } from 'react'
import { User, Sparkles, Check, Loader2, LogOut, ArrowUpRight, ShieldCheck, Pencil, CreditCard, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { updateDisplayName, saveDNA, startCheckout } from '../lib/api'
import { PLANS, videosFromCredits } from '../lib/brand'
import type { CreatorDNA, Platform } from '../lib/types'
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

  // Real checkout: routes a card user to the processor, or shows crypto/manual
  // details. This is the upgrade path that was missing entirely before.
  const upgrade = async (planId: string) => {
    setCoBusy(planId); setCoMsg(null)
    try {
      const r = await startCheckout(planId)
      if (r.url) { window.location.href = r.url; return }
      if (r.kind === 'crypto') { setCoMsg(`Send $${r.amount_usd} in ${r.asset} to ${r.address}, then contact us to activate.`); return }
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
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-sand"><Check className="mt-0.5 h-4 w-4 shrink-0 text-teal" /> {f}</li>
              ))}
            </ul>
            <div className="mt-5 flex flex-wrap gap-2 border-t border-white/8 pt-4">
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
            </div>
            {coMsg && <p className="mt-2 text-xs text-sand">{coMsg}</p>}
            <p className="mt-3 text-xs text-stone">Cancel any time — cancelling keeps any credits you've already been granted.</p>
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
                <button onClick={() => setEditingDna(true)} className="btn-ghost text-sm"><Pencil className="h-3.5 w-3.5" /> Edit</button>
              )}
            </div>
            <p className="mt-2 text-sm text-stone">This shapes every blueprint's voice and your gallery's default niche.</p>

            {!editingDna ? (
              /* Read-only view — what we already know about you. */
              <div className="mt-5 space-y-3">
                {DNA_FIELDS.map((f) => (
                  <div key={f.key} className="flex flex-col gap-0.5 border-b border-white/6 pb-3 sm:flex-row sm:items-baseline sm:gap-3">
                    <span className="eyebrow w-40 shrink-0">{f.label}</span>
                    <span className={`text-sm ${dna[f.key] ? 'text-cream' : 'text-stone/60'}`}>{dna[f.key] || 'Not set'}</span>
                  </div>
                ))}
                <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
                  <span className="eyebrow w-40 shrink-0">Platforms</span>
                  <span className="flex flex-wrap gap-1.5">
                    {dna.platforms.length ? dna.platforms.map((p) => <span key={p} className="chip capitalize !py-1 text-xs">{p}</span>) : <span className="text-sm text-stone/60">Not set</span>}
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
                {DNA_FIELDS.map((f) => (
                  <div key={f.key}>
                    <label className="eyebrow mb-1.5 block">{f.label}</label>
                    <input className="field" value={dna[f.key]} placeholder={f.placeholder} onChange={(e) => setDna((d) => ({ ...d, [f.key]: e.target.value }))} />
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
          <div className="glass relative max-h-[88vh] w-full max-w-4xl overflow-y-auto p-6 sm:p-8" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setUpgradeOpen(false)} className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-lg text-stone hover:bg-white/5 hover:text-cream"><X className="h-4 w-4" /></button>
            <h2 className="font-display text-2xl tracking-tight sm:text-3xl">Choose your plan</h2>
            <p className="mt-1 text-sm text-stone">Upgrade, downgrade, or switch any time. You keep credits you've already been granted.</p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {PLANS.map((p) => {
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
    </main>
  )
}
