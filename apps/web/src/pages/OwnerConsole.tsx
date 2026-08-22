// WHAT IS LEFT FOR A PERSON TO DO.
//
// The remaining human work in this project has been living in chat messages and
// in the owner's memory: which migration is next, whether a pilot may start,
// whether two recordings exist, whether the key may be rotated yet. This page
// asks the database instead.
//
// ⚠️ IT SHOWS ONLY WORK, NEVER PROGRESS THEATRE. No percentages, no streaks, no
// counts of things already done. A card that needs nothing says so in one line
// and gets out of the way.
//
// ⚖️ AND IT NAMES ONE NEXT THING. Five open cards is the problem this page
// exists to solve, so the server computes which single card is actually
// actionable — a card waiting on another card can never be it.
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, AlertTriangle, RefreshCw, Check } from 'lucide-react'
import { ownerConsole, type OwnerConsoleView, type OwnerCard } from '../lib/api'

// Plain English, in the owner's terms. No card says "migration", "endpoint" or
// "job type" in its title; the detail line explains the consequence instead.
const TITLES: Record<OwnerCard['card'], string> = {
  production_schema: 'The live database',
  visual_pilot: 'The video-frames check',
  recordings: 'Two real recordings',
  watched_session: 'Watching one creator',
  key_rotation: 'Replacing the exposed key',
}

const TONE: Record<string, string> = {
  action_needed: 'border-amber-400/40 bg-amber-400/[0.07]',
  working: 'border-sky-400/30 bg-sky-400/[0.05]',
  blocked: 'border-white/10 bg-white/[0.02]',
  waiting: 'border-white/10 bg-white/[0.02]',
  done: 'border-emerald-400/25 bg-emerald-400/[0.05]',
  unknown: 'border-red-400/40 bg-red-400/[0.07]',
}

const LABEL: Record<string, string> = {
  action_needed: 'Your turn',
  working: 'Twin is working',
  blocked: 'Waiting on something else',
  waiting: 'Not yet',
  done: 'Done',
  unknown: 'Could not check',
}

export default function OwnerConsole() {
  const [view, setView] = useState<OwnerConsoleView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(true)

  const load = useCallback(async () => {
    setBusy(true); setError(null)
    try { setView(await ownerConsole()) }
    catch (e) { setError(String((e as Error).message ?? e)) }
    finally { setBusy(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  if (error) {
    return (
      <div className="mx-auto max-w-2xl p-8">
        <div className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-200">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <div className="font-medium">This page could not be loaded</div>
            <div className="mt-1 text-sm opacity-80">{error}</div>
            {/* ⚠️ AN UNREADABLE PAGE IS NOT AN EMPTY LIST OF WORK. Saying
                "nothing to do" here would be the worst possible failure. */}
            <div className="mt-2 text-sm opacity-70">
              This does not mean there is nothing to do — it means nothing could be checked.
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!view) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin opacity-60" /></div>
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">What needs you</h1>
          <p className="mt-1 text-sm opacity-70">
            Everything Twin can do on its own, it has already done. This is the rest.
          </p>
        </div>
        <button onClick={() => void load()} disabled={busy}
          className="flex shrink-0 items-center gap-2 rounded border px-3 py-1.5 text-sm disabled:opacity-50">
          <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />Refresh
        </button>
      </div>

      {view.next ? (
        <div className="rounded-2xl border border-amber-400/40 bg-amber-400/10 p-5">
          <div className="text-xs uppercase tracking-wide opacity-60">Do this next</div>
          <div className="mt-1 text-lg font-medium">{view.next.ownerAction}</div>
          <div className="mt-1 text-sm opacity-75">{view.next.detail}</div>
          {view.next.href && (
            <Link to={view.next.href}
              className="mt-3 inline-block rounded bg-white px-4 py-2 text-sm font-medium text-black">
              Open it
            </Link>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-5">
          <Check className="h-5 w-5 text-emerald-300" />
          <span>Nothing needs you right now.</span>
        </div>
      )}

      <div className="space-y-3">
        {view.cards.map((c) => (
          <div key={c.card} className={`rounded-xl border p-4 ${TONE[c.state] ?? TONE.blocked}`}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-medium">{TITLES[c.card] ?? c.card}</span>
              <span className="shrink-0 text-xs uppercase tracking-wide opacity-60">{LABEL[c.state] ?? c.state}</span>
            </div>
            {c.ownerAction && <div className="mt-1.5 text-sm">{c.ownerAction}</div>}
            <div className="mt-1 text-sm opacity-70">{c.detail}</div>
            {c.checklist && (
              // ⚠️ ALL OF THEM, BEFORE STARTING. Discovering these one at a time
              // is how a rotation half-completes and something somewhere keeps
              // authenticating with the old key.
              <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm opacity-70">
                {c.checklist.map((s) => <li key={s}>{s}</li>)}
              </ul>
            )}
            {c.href && c.state !== 'done' && (
              <Link to={c.href} className="mt-2 inline-block text-sm underline opacity-80">Open</Link>
            )}
          </div>
        ))}
      </div>

      <p className="text-xs opacity-50">
        Read from the live database when you opened this page. Nothing here is remembered.
      </p>
    </div>
  )
}
