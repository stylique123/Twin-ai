// Screen 1 — Create / Remix Input. One job: get the user's starting point (a
// link, an idea, or a clip) and go. On PHONE it's the single-focus wizard (one
// field, one CTA, options collapsed). On DESKTOP it's the full studio page the
// product had before the wizard existed: the reference field with every option
// (fidelity / tone / delivery) laid out as visible cards — not a phone column
// floating in a wide window. Both submit into the same V2 flow. PRODUCT_VISION §7.
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Link2, Wand2, Sparkles, Target, Shuffle, Feather, Wind, Activity, Flame, Video, Mic, Check } from 'lucide-react'
import ScreenLayout from '../../components/v2/ScreenLayout'
import { PrimaryButton, Card, RecommendedBadge } from '../../components/v2/Primitives'
import { useAuth } from '../../context/AuthContext'
import { videosFromCredits } from '../../lib/brand'
import { cn } from '../../lib/cn'

type Fidelity = 'close' | 'balanced' | 'loose'
type Tone = 'understated' | 'balanced' | 'punchy'
type Delivery = 'on_camera' | 'voiceover'

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

const DELIVERY = [
  { id: 'on_camera', label: 'On camera', note: 'You appear and deliver to camera.', icon: Video },
  { id: 'voiceover', label: 'Voiceover / no face', note: 'Voiceover over demos & b-roll.', icon: Mic },
] as const

const YOU_GET = [
  'A script in YOUR voice, from the real video',
  'Hook options + scene-by-scene shot plan',
  'Teleprompter recording, scene by scene',
  'Auto-edit: cuts, captions, vertical render',
  'Caption, hashtags and one-tap publishing',
]

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
  const [delivery, setDelivery] = useState<Delivery>('on_camera')
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
        delivery,
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
          cta={<PrimaryButton onClick={go} disabled={!input.trim()}>Make my video →</PrimaryButton>}
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
              <Choice label="How it should sound" value={tone} onChange={(v) => setTone(v as Tone)}
                options={[['understated', 'Calm'], ['balanced', 'Natural'], ['punchy', 'Punchy']]} />
              <Choice label="On camera?" value={delivery} onChange={(v) => setDelivery(v as Delivery)}
                options={[['on_camera', 'I appear'], ['voiceover', 'Voiceover only']]} />
            </Card>
          )}
        </ScreenLayout>
      </div>

      {/* ── DESKTOP — the full studio page (the classic layout) ───────── */}
      <div className="hidden min-h-[100dvh] bg-ink text-cream lg:block">
        <div className="mx-auto max-w-5xl px-8 py-12">
          <p className="eyebrow">Studio</p>
          <h1 className="mt-3 font-display text-4xl tracking-tight">Make a video</h1>
          <p className="mt-2 max-w-xl text-sm text-stone">
            Paste a reference you wish you'd made — we read the real clip and rebuild it in your voice. Or just describe an idea.
          </p>

          <div className="mt-8 grid grid-cols-1 items-start gap-8 xl:grid-cols-[1fr_20rem]">
            {/* Left: input + the full option set, all visible */}
            <div className="space-y-6">
              <div className="glass gradient-border p-5">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-stone">
                  <Link2 className="h-3.5 w-3.5 text-amber" /> Reference link or idea
                </div>
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  rows={3}
                  placeholder="https://www.tiktok.com/@creator/video/…   — or type what your video is about"
                  className="mt-3 w-full resize-none bg-transparent text-lg outline-none text-cream placeholder:text-sand/35"
                />
              </div>

              <OptionRow label="How close to the reference" options={FIDELITY} value={fidelity} onPick={(v) => setFidelity(v as Fidelity)} />
              <OptionRow label="How it should sound" options={TONE} value={tone} onPick={(v) => setTone(v as Tone)} />
              <OptionRow label="Delivery" options={DELIVERY} value={delivery} onPick={(v) => setDelivery(v as Delivery)} />
            </div>

            {/* Right: what you get + the one CTA */}
            <aside className="space-y-4">
              <div className="glass p-5">
                <div className="flex items-center gap-2 text-sm font-semibold text-cream">
                  <Sparkles className="h-4 w-4 text-amber" /> What you'll get
                </div>
                <ul className="mt-3 space-y-2.5">
                  {YOU_GET.map((t) => (
                    <li key={t} className="flex gap-2.5 text-sm leading-snug text-sand">
                      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-teal/15">
                        <Check className="h-3 w-3 text-teal" />
                      </span>
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
              <button onClick={go} disabled={!input.trim()} className="btn-gradient w-full !py-4 text-base">
                <Wand2 className="h-4 w-4" /> Make my video
              </button>
              <p className="text-center text-xs text-stone">{remixesLeft} remixes left · we read the real video before writing a word</p>
            </aside>
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
