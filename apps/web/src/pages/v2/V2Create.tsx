// Screen 1 — Create / Remix Input. One job: get the user's starting point (a
// link, an idea, or a clip) and go. On PHONE it's the single-focus wizard (one
// field, one CTA, options collapsed). On DESKTOP it's the full studio page the
// product had before the wizard existed: the reference field with every option
// (fidelity / tone / delivery) laid out as visible cards — not a phone column
// floating in a wide window. Both submit into the same V2 flow. PRODUCT_VISION §7.
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Link2, Wand2, Target, Shuffle, Feather, Wind, Activity, Flame, SlidersHorizontal, ChevronDown } from 'lucide-react'
import ScreenLayout from '../../components/v2/ScreenLayout'
import { PrimaryButton, Card, RecommendedBadge } from '../../components/v2/Primitives'
import { useAuth } from '../../context/AuthContext'
import { videosFromCredits } from '../../lib/brand'
import { Aurora } from '../../components/Aurora'
import { cn } from '../../lib/cn'

type Fidelity = 'close' | 'balanced' | 'loose'
type Tone = 'understated' | 'balanced' | 'punchy'

const FIDELITY = [
  { id: 'close', label: 'Close', note: 'Stay tight to the reference structure.', icon: Target },
  { id: 'balanced', label: 'Balanced', note: 'Proven shape, your spin.', icon: Shuffle },
  { id: 'loose', label: 'Loose', note: 'Just the inspiration, mostly you.', icon: Feather },
] as const

const TONE = [
  { id: 'understated', label: 'Understated', note: 'Calm, credible, no hype.', icon: Wind },
  { id: 'balanced', label: 'Balanced', note: 'Natural energy, your default.', icon: Activity },
  { id: 'punchy', label: 'Punchy', note: 'High-energy, bold hooks.', icon: Flame },
] as const

// Pull a starting reference from the acquisition funnels: Gallery's "Remix in my
// voice" passes `?ref=<url>`, and the landing hero stashes a link in the
// `twinai_pending_remix` localStorage key (which survives signup). Consume it
// once so the promise that got the user here actually carries into the flow.
function initialInput(ref: string | null): string {
  if (ref) return ref
  try {
    const pending = localStorage.getItem('twinai_pending_remix')
    if (pending) {
      localStorage.removeItem('twinai_pending_remix')
      return pending
    }
  } catch { /* localStorage unavailable (private mode) — ignore */ }
  return ''
}

export default function V2Create() {
  const nav = useNavigate()
  const { profile } = useAuth()
  const [params] = useSearchParams()
  const [input, setInput] = useState(() => initialInput(params.get('ref')))
  const [advanced, setAdvanced] = useState(false)
  const [fidelity, setFidelity] = useState<Fidelity>('balanced')
  const [tone, setTone] = useState<Tone>('balanced') // recommended default
  const remixesLeft = videosFromCredits(profile?.credits ?? 0)

  const go = () => {
    if (!input.trim()) return
    const looksUrl = /^https?:\/\//i.test(input.trim())
    nav('/v2/building', {
      state: {
        reference_url: looksUrl ? input.trim() : '',
        reference_note: looksUrl ? '' : input.trim(),
        fidelity,
        tone,
      },
    })
  }

  return (
    <>
      {/* ── PHONE — the single-focus wizard, unchanged ─────────────────── */}
      <div className="lg:hidden">
        <ScreenLayout
          title="Make a video"
          subtitle="Paste a link, describe an idea, or upload a clip"
          onBack={() => nav('/dashboard')}
          cta={<PrimaryButton onClick={go} disabled={!input.trim()}>Remix →</PrimaryButton>}
        >
          <Card>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={4}
              placeholder="Paste a video link, or type what your video is about…"
              className="w-full resize-none bg-transparent outline-none text-cream placeholder:text-sand/40"
            />
          </Card>

          <div className="flex items-center justify-between">
            <RecommendedBadge reason="We'll read it and plan your scenes automatically." />
            <button onClick={() => setAdvanced((v) => !v)} className="text-sm font-medium text-sand hover:text-cream">
              {advanced ? 'Hide options' : 'Advanced ▸'}
            </button>
          </div>

          {advanced && (
            <Card className="space-y-4">
              <Choice label="How close to the reference" value={fidelity} onChange={(v) => setFidelity(v as Fidelity)}
                options={[['close', 'Close'], ['balanced', 'Balanced'], ['loose', 'Loose']]} />
              <Choice label="How it should sound" value={tone} onChange={(v) => setTone(v as Tone)}
                options={[['understated', 'Calm'], ['balanced', 'Natural'], ['punchy', 'Punchy']]} />
            </Card>
          )}
        </ScreenLayout>
      </div>

      {/* ── DESKTOP — one focused column on the brand canvas: input → advanced
          settings (collapsed) → Remix. Both knobs are REAL: fidelity + tone ride
          the request into generate-blueprint, where each maps to a hard prompt
          rule — switching them changes the script you get back. ───────────── */}
      <div className="relative hidden min-h-[100dvh] overflow-clip text-cream lg:block">
        <Aurora className="opacity-80" />
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div className="absolute left-1/3 top-1/4 h-[26rem] w-[26rem] -translate-x-1/2 rounded-full bg-coral/10 blur-[160px]" />
          <div className="absolute right-0 bottom-0 h-[20rem] w-[20rem] rounded-full bg-teal/10 blur-[140px]" />
        </div>
        <div className="relative mx-auto max-w-3xl px-8 py-14">
          <p className="eyebrow">Studio</p>
          <h1 className="mt-3 font-display text-4xl tracking-tight">Make a video</h1>
          <p className="mt-2 max-w-xl text-sm text-stone">
            Paste a reference you wish you'd made — we read the real clip and rebuild it in your voice. Or just describe an idea.
          </p>

          {/* The reference box — the page's one hero input. */}
          <div className="glass gradient-border mt-8 p-6 transition-shadow focus-within:shadow-[0_0_60px_-18px_rgba(255,91,123,.45)]">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-sand">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-signature-soft"><Link2 className="h-3.5 w-3.5 text-cream" /></span>
                Reference link or idea
              </div>
              <span className="text-[11px] text-stone">TikTok · Reels · Shorts · or plain words</span>
            </div>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={3}
              autoFocus
              placeholder={'Paste the link of the video you wish you\'d made…\nor describe your idea in a sentence.'}
              className="mt-4 w-full resize-none bg-transparent text-xl leading-relaxed outline-none text-cream placeholder:text-sand/35"
            />
            <div className="mt-2 border-t border-white/8 pt-3 text-xs text-stone">
              We read the actual video — transcript and structure — before writing a word. Described ideas skip straight to writing.
            </div>
          </div>

          {/* Advanced settings — collapsed; the defaults are the recommended path. */}
          <button
            onClick={() => setAdvanced((v) => !v)}
            className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-medium text-sand transition-colors hover:border-white/20 hover:text-cream"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" /> Advanced settings
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', advanced && 'rotate-180')} />
          </button>
          {advanced && (
            <div className="mt-4 space-y-6 rounded-panel border border-white/8 bg-ink2/50 p-5 backdrop-blur-sm">
              <OptionRow label="How close to the reference" options={FIDELITY} value={fidelity} onPick={(v) => setFidelity(v as Fidelity)} />
              <OptionRow label="How it should sound" options={TONE} value={tone} onPick={(v) => setTone(v as Tone)} />
              <p className="text-xs leading-relaxed text-stone">
                These steer the writing for real: <span className="text-sand">closeness</span> decides how tightly the script mirrors the reference's structure, and{' '}
                <span className="text-sand">sound</span> sets the energy of the hooks and lines. Change them and you'll get a different script.
              </p>
            </div>
          )}

          {/* The one CTA — at the bottom, after the choices. */}
          <div className="mt-8">
            <button onClick={go} disabled={!input.trim()} className="btn-gradient w-full !py-4 text-base">
              <Wand2 className="h-4 w-4" /> Remix
            </button>
            <p className="mt-2.5 text-center text-xs text-stone">{remixesLeft} remixes left · you're only charged when a script is written</p>
          </div>
        </div>
      </div>
    </>
  )
}

/* ── Desktop option cards (the classic studio pattern: icon + label + note) ── */
function OptionRow({ label, options, value, onPick }: {
  label: string
  options: ReadonlyArray<{ id: string; label: string; note: string; icon: React.ComponentType<{ className?: string }> }>
  value: string
  onPick: (id: string) => void
}) {
  return (
    <div>
      <div className="eyebrow mb-2.5">{label}</div>
      <div className={cn('grid gap-2.5', options.length === 3 ? 'grid-cols-3' : 'grid-cols-2')}>
        {options.map((o) => {
          const active = value === o.id
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => onPick(o.id)}
              className={cn(
                'rounded-card border p-3.5 text-left transition-colors',
                active ? 'border-coral/50 bg-coral/[0.07]' : 'border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]',
              )}
            >
              <o.icon className={cn('h-4 w-4', active ? 'text-coral' : 'text-stone')} />
              <div className={cn('mt-2 text-sm font-semibold', active ? 'text-cream' : 'text-sand')}>{o.label}</div>
              <div className="mt-0.5 text-[11px] leading-snug text-stone">{o.note}</div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ── Phone option chips (unchanged) ─────────────────────────────────── */
function Choice({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <div>
      <div className="text-xs font-semibold text-sand/70 mb-1.5">{label}</div>
      <div className="flex gap-2">
        {options.map(([id, text]) => (
          <button key={id} onClick={() => onChange(id)}
            className={`flex-1 rounded-xl border py-2 text-sm ${value === id ? 'border-teal bg-teal/10 text-cream font-medium' : 'border-white/15 text-sand hover:bg-white/5'}`}>
            {text}
          </button>
        ))}
      </div>
    </div>
  )
}
