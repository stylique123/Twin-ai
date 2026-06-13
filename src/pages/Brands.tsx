import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Check, Loader2, Pencil, AtSign, Sparkles, AlertCircle, Building2, X, Star,
} from 'lucide-react'
import {
  listBrandVoices, setDefaultBrandVoice, renameBrandVoice, startDna, pollDna,
} from '../lib/api'
import { planFor, EXTRA_BRAND_VOICE_PRICE } from '../lib/brand'
import { useAuth } from '../context/AuthContext'
import { EASE } from '../components/motion'
import type { BrandVoice, Platform } from '../lib/types'

const PLATFORMS: { id: Platform; label: string }[] = [
  { id: 'tiktok', label: 'TikTok' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'other', label: 'Other' },
]

// Agency workspace: every client brand is its own voice profile. The active
// (default) voice is the one Studio writes blueprints in — switching here
// switches the whole workspace in one tap.
export default function Brands() {
  const { profile } = useAuth()
  const [voices, setVoices] = useState<BrandVoice[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const plan = planFor(profile?.plan)
  const ready = voices.filter((v) => v.status === 'ready')
  const limit = plan.brandVoices
  const atLimit = voices.length >= limit

  const load = async () => {
    try {
      setVoices(await listBrandVoices())
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not load your brands')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const makeActive = async (id: string) => {
    setBusyId(id)
    setErr(null)
    try {
      await setDefaultBrandVoice(id)
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not switch brand')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-5 py-10 sm:py-12">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-signature-soft">
            <Building2 className="h-5 w-5 text-cream" />
          </span>
          <h1 className="mt-4 font-display text-3xl sm:text-4xl">Brand workspaces</h1>
          <p className="mt-2 max-w-xl text-sand">
            One voice profile per client. The <span className="text-cream">active</span> brand is what Studio
            writes in — switch it any time, and every blueprint comes out in that voice.
          </p>
        </div>
        <div className="text-right">
          <div className="font-display text-2xl">
            {voices.length}<span className="text-stone">/{limit}</span>
          </div>
          <div className="text-xs text-stone">brand voices · {plan.name} plan</div>
        </div>
      </div>

      {err && (
        <div className="mt-6 flex items-center gap-2 rounded-xl bg-coral/10 px-4 py-3 text-sm text-coral">
          <AlertCircle className="h-4 w-4 shrink-0" /> {err}
        </div>
      )}

      {/* Brand list */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {loading ? (
          <div className="col-span-full flex items-center gap-2 text-sand">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading your brands…
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {voices.map((v) => (
              <BrandCard
                key={v.id}
                voice={v}
                busy={busyId === v.id}
                onActivate={() => makeActive(v.id)}
                onRenamed={load}
              />
            ))}
          </AnimatePresence>
        )}

        {/* Add card */}
        {!loading && (
          <button
            onClick={() => (atLimit ? setErr(`Your ${plan.name} plan includes ${limit} brand ${limit === 1 ? 'voice' : 'voices'}. Upgrade or add one for $${EXTRA_BRAND_VOICE_PRICE}/mo.`) : setAdding(true))}
            className={`flex min-h-[150px] flex-col items-center justify-center gap-2 rounded-panel border border-dashed p-6 text-sm transition-colors ${
              atLimit
                ? 'cursor-not-allowed border-white/8 text-stone/60'
                : 'border-white/15 text-sand hover:border-signature hover:bg-white/[0.03] hover:text-cream'
            }`}
          >
            <span className="grid h-10 w-10 place-items-center rounded-full bg-white/5">
              <Plus className="h-5 w-5" />
            </span>
            {atLimit ? 'Brand limit reached' : 'Add a client brand'}
          </button>
        )}
      </div>

      {ready.length > 1 && (
        <p className="mt-6 text-center text-xs text-stone">
          Tip: switch the active brand from the sidebar without leaving Studio.
        </p>
      )}

      <AnimatePresence>
        {adding && (
          <AddBrandModal
            onClose={() => setAdding(false)}
            onAdded={async () => {
              setAdding(false)
              await load()
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Brand card ──────────────────────────────────────────────────────────────────

function BrandCard({
  voice, busy, onActivate, onRenamed,
}: {
  voice: BrandVoice
  busy: boolean
  onActivate: () => void
  onRenamed: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [label, setLabel] = useState(voice.label ?? `@${voice.handle}`)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      await renameBrandVoice(voice.id, label.trim() || `@${voice.handle}`)
      setEditing(false)
      onRenamed()
    } finally {
      setSaving(false)
    }
  }

  const niche = voice.profile?.niche
  const tone = voice.profile?.tone

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.35, ease: EASE }}
      className={`relative flex flex-col rounded-panel p-5 ${
        voice.is_default ? 'gradient-border bg-ink2 shadow-glow' : 'glass'
      }`}
    >
      {voice.is_default && (
        <span className="absolute -top-2.5 left-5 inline-flex items-center gap-1 rounded-full bg-signature px-2.5 py-0.5 text-[11px] font-bold text-ink">
          <Star className="h-3 w-3 fill-current" /> Active
        </span>
      )}

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {editing ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && save()}
                className="field !py-1.5 text-sm"
                placeholder="Client name"
              />
              <button onClick={save} disabled={saving} className="grid h-8 w-8 place-items-center rounded-lg bg-teal/15 text-teal">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h3 className="truncate font-heading text-lg text-cream">{voice.label ?? `@${voice.handle}`}</h3>
              <button onClick={() => setEditing(true)} className="text-stone transition-colors hover:text-cream">
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <div className="mt-0.5 flex items-center gap-1 text-xs text-stone">
            <AtSign className="h-3 w-3" />{voice.handle} · {voice.platform}
          </div>
        </div>
        <StatusPill status={voice.status} />
      </div>

      {voice.status === 'ready' && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {niche && <span className="chip">{niche}</span>}
          {tone && <span className="chip">{tone}</span>}
        </div>
      )}
      {voice.status === 'failed' && (
        <p className="mt-3 text-xs text-coral">{voice.error ?? 'Voice scan failed — try re-adding this handle.'}</p>
      )}
      {voice.status === 'building' && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-teal">
          <Loader2 className="h-3 w-3 animate-spin" /> Reading how they sound…
        </p>
      )}

      <div className="mt-auto pt-5">
        {voice.is_default ? (
          <div className="flex items-center justify-center gap-1.5 rounded-xl bg-white/[0.04] py-2.5 text-sm text-stone">
            <Check className="h-4 w-4 text-teal" /> Currently active
          </div>
        ) : (
          <button
            onClick={onActivate}
            disabled={busy || voice.status !== 'ready'}
            className="btn-ghost w-full justify-center disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {voice.status === 'ready' ? 'Make active' : 'Not ready yet'}
          </button>
        )}
      </div>
    </motion.div>
  )
}

function StatusPill({ status }: { status: BrandVoice['status'] }) {
  const map = {
    ready: { c: 'bg-teal/15 text-teal', t: 'Ready' },
    building: { c: 'bg-amber/15 text-amber', t: 'Building' },
    failed: { c: 'bg-coral/15 text-coral', t: 'Failed' },
  }[status]
  return <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${map.c}`}>{map.t}</span>
}

// ─── Add brand modal ─────────────────────────────────────────────────────────

function AddBrandModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [handle, setHandle] = useState('')
  const [platform, setPlatform] = useState<Platform>('tiktok')
  const [phase, setPhase] = useState<'input' | 'building'>('input')
  const [err, setErr] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => () => { if (timer.current) clearInterval(timer.current) }, [])

  const start = async () => {
    if (!handle.trim()) return setErr('Paste the client handle or profile link first.')
    setErr(null)
    setPhase('building')
    try {
      const { brand_voice_id } = await startDna(handle.trim(), platform)
      // Poll until the voice is ready (or fails), then close back to the list.
      timer.current = setInterval(async () => {
        try {
          const res = await pollDna(brand_voice_id)
          if (res.status === 'ready') {
            if (timer.current) clearInterval(timer.current)
            onAdded()
          } else if (res.status === 'failed') {
            if (timer.current) clearInterval(timer.current)
            setErr(res.error ?? 'Voice scan failed — check the handle is public and try again.')
            setPhase('input')
          }
        } catch {
          /* keep polling */
        }
      }, 4000)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not start the voice scan')
      setPhase('input')
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 px-5 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.98 }}
        transition={{ duration: 0.3, ease: EASE }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md rounded-panel border border-white/10 bg-ink2 p-7"
      >
        <button onClick={onClose} className="absolute right-4 top-4 text-stone transition-colors hover:text-cream">
          <X className="h-5 w-5" />
        </button>

        {phase === 'input' ? (
          <>
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-signature-soft">
              <AtSign className="h-5 w-5 text-cream" />
            </span>
            <h2 className="mt-4 font-display text-2xl">Add a client brand</h2>
            <p className="mt-1.5 text-sm text-sand">
              Paste the client's handle. We read their recent posts and build a voice profile you can write in.
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              {PLATFORMS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPlatform(p.id)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    platform === p.id ? 'bg-signature text-ink' : 'bg-white/5 text-sand hover:text-cream'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <input
              autoFocus
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && start()}
              placeholder="@client  or  profile link"
              className="field mt-3"
            />

            {err && <p className="mt-3 text-sm text-coral">{err}</p>}

            <button onClick={start} className="btn-gradient mt-5 w-full justify-center">
              <Sparkles className="h-4 w-4" /> Build this voice
            </button>
          </>
        ) : (
          <div className="py-6 text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-amber" />
            <h2 className="mt-5 font-display text-2xl">Reading how they sound…</h2>
            <p className="mt-2 text-sm text-sand">
              Scanning <span className="text-cream">@{handle.replace(/^@/, '')}</span> — tone, pacing, hooks and
              signature phrases. This usually takes under a minute.
            </p>
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}
