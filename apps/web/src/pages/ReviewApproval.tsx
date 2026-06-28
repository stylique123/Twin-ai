import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Loader2, Check, MessageSquare, FileText, Play } from 'lucide-react'
import { getReview, submitReview, type ReviewPayload } from '../lib/api'
import { Logo } from '../components/Logo'
import { Aurora } from '../components/Aurora'
import { cn } from '../lib/cn'

// Login-free CLIENT APPROVAL. An agency shares /review/:token; the client watches
// the finished reel, reads the script, and approves or requests changes — no
// account. The unguessable token is the access control (see migration 0046 +
// the `review` edge fn). Read + submit run through that fn (service role signs
// the private video).
export default function ReviewApproval() {
  const { token = '' } = useParams()
  const [data, setData] = useState<ReviewPayload | null>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'missing'>('loading')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<'approved' | 'changes' | null>(null)
  // Local echo of the decision so the page updates instantly after submit.
  const [decided, setDecided] = useState<'approved' | 'changes' | null>(null)

  useEffect(() => {
    getReview(token)
      .then((r) => {
        if (r) {
          setData(r)
          setState('ok')
          if (r.status === 'approved' || r.status === 'changes') setDecided(r.status)
          if (r.note) setNote(r.note)
        } else setState('missing')
      })
      .catch(() => setState('missing'))
  }, [token])

  const decide = async (decision: 'approved' | 'changes') => {
    if (decision === 'changes' && !note.trim()) return
    setBusy(decision)
    const ok = await submitReview(token, decision, note.trim())
    setBusy(null)
    if (ok) setDecided(decision)
  }

  return (
    <main className="relative min-h-screen overflow-clip">
      <Aurora className="opacity-50" />
      <div className="relative mx-auto max-w-2xl px-5 py-14 lg:py-20">
        {state === 'loading' ? (
          <div className="grid min-h-[50vh] place-items-center text-sand">
            <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</span>
          </div>
        ) : state === 'missing' ? (
          <div className="glass grid min-h-[50vh] place-items-center p-12 text-center">
            <div>
              <p className="font-heading text-lg text-cream">This approval link isn't active.</p>
              <p className="mt-1 text-sm text-stone">Ask your team for a fresh link.</p>
            </div>
          </div>
        ) : data && (
          <>
            {/* White-label: lead with the CLIENT's own brand (logo + name). */}
            <div className="flex items-center gap-3">
              {data.brand_logo && (
                <img src={data.brand_logo} alt={data.brand} className="h-10 w-auto max-w-[150px] object-contain" />
              )}
              <p className="eyebrow">For your approval</p>
            </div>
            <h1 className="mt-3 font-display text-4xl tracking-tight sm:text-5xl">
              <span className="gradient-text">{data.brand}</span>
            </h1>
            <p className="mt-3 text-base text-sand">Review the finished video and the script below, then approve it or tell us what to change.</p>

            {/* The finished reel */}
            <div className="glass mt-8 overflow-hidden p-0">
              {data.video_url ? (
                <video
                  src={data.video_url}
                  poster={data.thumb_url ?? undefined}
                  controls
                  playsInline
                  className="mx-auto aspect-[9/16] max-h-[70vh] w-full bg-ink object-contain"
                />
              ) : (
                <div className="grid aspect-[9/16] max-h-[60vh] place-items-center bg-ink/60 text-center text-sm text-stone">
                  <span className="inline-flex items-center gap-2"><Play className="h-4 w-4" /> The video is still rendering — check back shortly.</span>
                </div>
              )}
            </div>

            {/* Hook + script */}
            {data.hook && (
              <p className="mt-6 rounded-lg bg-amber/10 px-4 py-3 font-heading text-base text-amber">{data.hook}</p>
            )}
            {data.script.length > 0 && (
              <div className="glass mt-4 p-5">
                <p className="eyebrow flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" /> Script</p>
                <div className="mt-3 space-y-2 text-sm leading-relaxed text-sand">
                  {data.script.map((line, i) => <p key={i}>{line}</p>)}
                </div>
              </div>
            )}

            {/* Decision */}
            {decided ? (
              <div className={cn('glass mt-8 p-6 text-center', decided === 'approved' ? 'border border-teal/30' : 'border border-amber/30')}>
                {decided === 'approved' ? (
                  <>
                    <span className="inline-grid h-12 w-12 place-items-center rounded-full bg-teal/15"><Check className="h-6 w-6 text-teal" /></span>
                    <p className="mt-3 font-heading text-lg text-cream">Approved — thank you!</p>
                    <p className="mt-1 text-sm text-stone">Your team has been notified. You can close this page.</p>
                  </>
                ) : (
                  <>
                    <span className="inline-grid h-12 w-12 place-items-center rounded-full bg-amber/15"><MessageSquare className="h-6 w-6 text-amber" /></span>
                    <p className="mt-3 font-heading text-lg text-cream">Change request sent</p>
                    {note.trim() && <p className="mx-auto mt-2 max-w-md text-sm text-sand">“{note.trim()}”</p>}
                    <p className="mt-2 text-sm text-stone">Your team will follow up with an updated cut.</p>
                  </>
                )}
              </div>
            ) : (
              <div className="glass mt-8 p-6">
                <label className="eyebrow">Notes <span className="text-stone">(required to request changes)</span></label>
                <textarea
                  className="field mt-2 resize-none"
                  rows={3}
                  placeholder="Anything you'd tweak? Hook, pacing, a line, the call-to-action…"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
                <div className="mt-4 flex flex-col gap-2.5 sm:flex-row">
                  <button className="btn-gradient flex-1" onClick={() => decide('approved')} disabled={!!busy}>
                    {busy === 'approved' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Approve this video
                  </button>
                  <button className="btn-ghost flex-1" onClick={() => decide('changes')} disabled={!!busy || !note.trim()} title={!note.trim() ? 'Add a note first' : undefined}>
                    {busy === 'changes' ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />} Request changes
                  </button>
                </div>
              </div>
            )}

            <p className="mt-8 flex items-center justify-center gap-1.5 text-center text-[11px] text-stone">
              This link is private to you. · Powered by <Logo className="h-3.5" />
            </p>
          </>
        )}
      </div>
    </main>
  )
}
