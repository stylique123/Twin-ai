// Screen 1 — Create / Remix Input. One job: get the user's starting point (a
// link, an idea, or a clip) and go. One field, one CTA. Advanced options stay
// collapsed so beginners see a single clear next step. See PRODUCT_VISION §7.
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import ScreenLayout from '../../components/v2/ScreenLayout'
import { PrimaryButton, Card, RecommendedBadge } from '../../components/v2/Primitives'

type Tone = 'understated' | 'balanced' | 'punchy'
type Delivery = 'on_camera' | 'voiceover'

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
  const [params] = useSearchParams()
  const [input, setInput] = useState(() => initialInput(params.get('ref')))
  const [advanced, setAdvanced] = useState(false)
  const [tone, setTone] = useState<Tone>('balanced') // recommended default
  const [delivery, setDelivery] = useState<Delivery>('on_camera')

  const go = () => {
    if (!input.trim()) return
    const looksUrl = /^https?:\/\//i.test(input.trim())
    nav('/v2/building', {
      state: {
        reference_url: looksUrl ? input.trim() : '',
        reference_note: looksUrl ? '' : input.trim(),
        tone,
        delivery,
      },
    })
  }

  return (
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
  )
}

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
