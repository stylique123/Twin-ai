// STARTING THE VISUAL PILOT, FROM INSIDE TWIN.
//
// The previous way to start a pilot was a terminal command holding a service
// role key. This page is the whole replacement: it can ask for a size and a
// spending ceiling and nothing else, because the endpoint behind it accepts
// nothing else.
//
// ⚠️ THE BILL IS SHOWN BEFORE IT IS AGREED TO, AND IT IS THE SERVER'S NUMBER.
// The quote is not computed here. Recomputing it in the browser would create a
// second authority on what a pilot costs, and the two would drift on the first
// change — so this page asks the server what it would charge and displays the
// answer it gets back.
//
// ⚖️ AND STARTING IS DELIBERATELY TWO STEPS. Quote, read the number, then
// confirm. A single button that draws, freezes and spends on one click is how
// a run gets started by a misplaced keystroke.
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, AlertTriangle, Play } from 'lucide-react'
import { quotePilot, startPilot, pilotStatus, type PilotQuote, type PilotStatus } from '../lib/api'

// Kept in step with MAX_SIZE in scripts/pilot-core.mjs. A larger number typed
// here is refused by the server, which is the check that matters; this only
// stops the page offering a choice that cannot work.
const MAX_SIZE = 10
const DEFAULT_SIZE = 8

export default function PilotVisualStart() {
  const [size, setSize] = useState(DEFAULT_SIZE)
  const [ceiling, setCeiling] = useState(DEFAULT_SIZE * 2)
  const [quote, setQuote] = useState<PilotQuote | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [runId, setRunId] = useState<string | null>(null)
  const [status, setStatus] = useState<PilotStatus | null>(null)

  const ask = useCallback(async () => {
    setBusy(true); setError(null); setQuote(null)
    try { setQuote((await quotePilot(size, ceiling)).quoted) }
    catch (e) { setError(String((e as Error).message ?? e)) }
    finally { setBusy(false) }
  }, [size, ceiling])

  const go = useCallback(async () => {
    setBusy(true); setError(null)
    try {
      const r = await startPilot(size, ceiling)
      // ⚠️ DO NOT JUMP STRAIGHT TO THE REVIEW PAGE. Collection has only just
      // been enqueued; the packet does not exist yet. Landing on an empty
      // review screen reads as a broken pilot, and worse, invites labelling a
      // half-collected sample. Poll instead, and hand over the link only when
      // the server says there is something to label.
      setRunId(r.pilot_run_id)
    } catch (e) {
      // ⚠️ THE REFUSAL TEXT IS SHOWN VERBATIM. The server's messages say which
      // rule refused and what to do about it ("one pilot at a time — finish and
      // lock it, or abandon it"). Replacing them with "Something went wrong"
      // would throw away the only explanation anybody gets.
      setError(String((e as Error).message ?? e))
    } finally { setBusy(false) }
  }, [size, ceiling])

  // Poll while collection runs. Stops as soon as the server reports it is done.
  useEffect(() => {
    if (!runId || status?.collecting === false) return
    let live = true
    const tick = () => {
      pilotStatus(runId)
        .then((s) => { if (live) setStatus(s) })
        .catch((e) => { if (live) setError(String((e as Error).message ?? e)) })
    }
    tick()
    const h = setInterval(tick, 10_000)
    return () => { live = false; clearInterval(h) }
  }, [runId, status?.collecting])

  return (
    <div className="mx-auto max-w-xl space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Start a visual pilot</h1>
        <p className="mt-1 text-sm opacity-70">
          Twin picks the videos, checks what they would cost, and starts looking at them.
          You label what it claims once they are ready.
        </p>
      </div>

      <label className="block space-y-1">
        <span className="text-sm">How many videos</span>
        <input
          type="number" min={1} max={MAX_SIZE} value={size}
          onChange={(e) => { setSize(Number(e.target.value)); setQuote(null) }}
          className="w-full rounded border bg-transparent px-3 py-2"
        />
        <span className="block text-xs opacity-60">Up to {MAX_SIZE}.</span>
      </label>

      <label className="block space-y-1">
        <span className="text-sm">Most downloads you will allow</span>
        <input
          type="number" min={1} value={ceiling}
          onChange={(e) => { setCeiling(Number(e.target.value)); setQuote(null) }}
          className="w-full rounded border bg-transparent px-3 py-2"
        />
        <span className="block text-xs opacity-60">
          Each video is downloaded twice — once for the video, once for the still frames.
          Nothing starts if the real number comes out above this.
        </span>
      </label>

      {error && (
        <div className="flex gap-2 rounded border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {quote && (
        <div className="rounded border p-3 text-sm">
          <div className="font-medium">This run would use:</div>
          <ul className="mt-1 space-y-0.5 opacity-80">
            <li>{quote.references} videos</li>
            <li>{quote.downloads} downloads</li>
            <li>{quote.visionCalls} looks at the frames</li>
          </ul>
          <div className="mt-2 text-xs opacity-60">Nothing has started yet.</div>
        </div>
      )}

      {status && (
        <div className="rounded border p-3 text-sm">
          <div className="font-medium">
            {status.collecting ? 'Twin is watching the videos…' : 'Done watching.'}
          </div>
          <ul className="mt-1 space-y-0.5 opacity-80">
            <li>{status.progress.ready_for_label} of {status.progress.selected} ready for you</li>
            {status.progress.still_running > 0 && <li>{status.progress.still_running} still going</li>}
            {/* ⚠️ SHOWN, NOT HIDDEN. A pilot where two videos failed must not
                read as a clean run — the count you label against is the count
                that was picked, not the count that worked. */}
            {status.progress.unreadable > 0 && <li>{status.progress.unreadable} had nothing to see</li>}
            {status.progress.failed > 0 && <li>{status.progress.failed} could not be checked</li>}
          </ul>
          {status.review_url && (
            <Link
              to={status.review_url}
              className="mt-3 inline-block rounded bg-white px-4 py-2 text-sm font-medium text-black"
            >
              Start labelling
            </Link>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={ask} disabled={busy || !!runId}
          className="rounded border px-4 py-2 text-sm disabled:opacity-50"
        >
          {busy && !quote ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Check what it costs'}
        </button>
        <button
          onClick={go} disabled={busy || !quote || !!runId}
          className="flex items-center gap-2 rounded bg-white px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
        >
          <Play className="h-4 w-4" />
          Start
        </button>
      </div>
      <p className="text-xs opacity-50">
        You can only run one pilot at a time. Finish the one you have, or drop it, before starting another.
      </p>
    </div>
  )
}
