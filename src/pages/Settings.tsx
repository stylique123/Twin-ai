import { useState } from 'react'
import { Link } from 'react-router-dom'
import { User, Sparkles, Check, Loader2, LogOut, ArrowUpRight, ShieldCheck } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { updateDisplayName, saveDNA, startCheckout } from '../lib/api'
import { PLANS, videosFromCredits } from '../lib/brand'
import type { CreatorDNA, Platform } from '../lib/types'
import { Aurora } from '../components/Aurora'
import { Reveal } from '../components/motion'

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
  const [err, setErr] = useState<string | null>(null)
  const [coBusy, setCoBusy] = useState<string | null>(null)
  const [coMsg, setCoMsg] = useState<string | null>(null)

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
    <main className="relative overflow-clip">
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
            {higherPlans.length > 0 && (
              <div className="mt-5 border-t border-white/8 pt-4">
                <div className="eyebrow !text-sand">Upgrade</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {higherPlans.map((p) => (
                    <button key={p.id} onClick={() => upgrade(p.id)} disabled={coBusy !== null} className="btn-gradient text-sm disabled:opacity-60">
                      {coBusy === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpRight className="h-4 w-4" />}
                      {p.name} · ${p.price}/mo
                    </button>
                  ))}
                </div>
                {coMsg && <p className="mt-2 text-xs text-sand">{coMsg}</p>}
                <Link to="/#pricing" className="mt-2 inline-block text-xs text-stone hover:text-cream">Compare plans →</Link>
              </div>
            )}
            <p className="mt-4 text-xs text-stone">Manage or cancel your subscription from your payment provider's portal. Cancelling keeps any credits you've already been granted.</p>
          </section>
        </Reveal>

        {/* Creator DNA */}
        <Reveal delay={0.15}>
          <section className="glass mt-5 p-5 sm:p-6">
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/5"><ShieldCheck className="h-4 w-4 text-coral" /></span>
              <p className="eyebrow !text-sand">Creator DNA</p>
            </div>
            <p className="mt-2 text-sm text-stone">This shapes every blueprint's voice and your gallery's default niche. Refine it any time.</p>
            <div className="mt-5 space-y-4">
              {DNA_FIELDS.map((f) => (
                <div key={f.key}>
                  <label className="eyebrow mb-1.5 block">{f.label}</label>
                  <input
                    className="field"
                    value={dna[f.key]}
                    placeholder={f.placeholder}
                    onChange={(e) => setDna((d) => ({ ...d, [f.key]: e.target.value }))}
                  />
                </div>
              ))}
              <div>
                <label className="eyebrow mb-1.5 block">How you write <span className="font-normal normal-case text-stone">— paste a few posts (optional)</span></label>
                <textarea
                  className="field min-h-[96px] resize-y"
                  value={dna.voice_samples ?? ''}
                  placeholder="Paste 2–3 of your real posts (LinkedIn, captions, a blog excerpt). We match your exact cadence and phrasing — the single strongest signal for sounding like you, especially if you're camera-shy or B2B."
                  onChange={(e) => setDna((d) => ({ ...d, voice_samples: e.target.value }))}
                />
              </div>
              <div>
                <label className="eyebrow mb-2 block">Platforms</label>
                <div className="flex flex-wrap gap-2">
                  {PLATFORMS.map((p) => (
                    <button
                      key={p}
                      onClick={() => togglePlatform(p)}
                      className={`chip capitalize ${dna.platforms.includes(p) ? 'border-coral/60 bg-coral/10 text-cream' : 'hover:border-white/20 hover:text-cream'}`}
                    >
                      {dna.platforms.includes(p) && <Check className="h-3.5 w-3.5 text-coral" />} {p}
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={saveDna} disabled={savingDna} className="btn-gradient text-sm">
                {savingDna ? <Loader2 className="h-4 w-4 animate-spin" /> : dnaSaved ? <Check className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                {dnaSaved ? 'Saved' : 'Save creator DNA'}
              </button>
            </div>
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
    </main>
  )
}
