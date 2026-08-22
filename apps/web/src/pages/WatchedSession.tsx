// THE OBSERVER'S PAGE. ONE FIELD ON IT CANNOT BE AUTOMATED.
//
// ⚠️ EVERY CONTROL HERE EXISTS TO GET OUT OF THE WAY. The observer is watching
// a person, not a screen. So the page holds state across the whole session,
// asks for nothing the machine already knows, and puts the one question that
// matters — why did they stop — in front of them at the moment they can ask it.
//
// ⚖️ AND IT NEVER SUGGESTS AN ANSWER. No default blocker, no pre-selected
// category, no autocomplete on the creator's words. A form that offers a
// likely-looking reason gets that reason back, and the whole session becomes a
// confirmation of whatever the form guessed.
import { useCallback, useState } from 'react'
import { Loader2, AlertTriangle, Lock } from 'lucide-react'
import {
  createWatchedSession, consentWatchedSession, startWatchedSession,
  finishWatchedSession, observeWatchedSession, lockWatchedSession,
  type WatchedSessionFinish,
} from '../lib/api'

// Kept in step with BLOCKERS in scripts/d1-core.mjs. The server validates
// against its own copy — this list only decides what the buttons say.
const BLOCKERS: Array<[string, string]> = [
  ['SCRIPT_REJECTION', 'The words were wrong — they would not say that.'],
  ['PREMISE_REJECTION', 'The idea was wrong — not a video they would make.'],
  ['PRODUCTION_TOO_HARD', 'They would say it, but not shoot it.'],
  ['CAMERA_FRICTION', 'The recording step itself got in the way.'],
  ['TIME_CONSTRAINT', 'They ran out of time, not out of willingness.'],
  ['BROWSING_ONLY', 'They were never going to record today.'],
  ['TECHNICAL_FAILURE', 'Something broke.'],
  ['OTHER', 'None of these fit — say what it was.'],
]

const CONSENT = [
  'I am watching what you do on screen and writing down the steps.',
  'I will ask you why at a few points. You can say "I would rather not".',
  'Nothing is recorded unless you say yes to that separately.',
  'You can stop at any point and I will delete the notes.',
  'There is no right way to use it. If it is confusing, that is the finding.',
]

export default function WatchedSession() {
  const [subject, setSubject] = useState('')
  const [id, setId] = useState<string | null>(null)
  const [status, setStatus] = useState<string>('none')
  const [finish, setFinish] = useState<WatchedSessionFinish | null>(null)
  // ⚠️ NO DEFAULT. An empty string, not the first category.
  const [blocker, setBlocker] = useState('')
  const [reason, setReason] = useState('')
  const [recorded, setRecorded] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true); setError(null)
    // The server's refusals say which rule refused and what to do about it.
    // Replacing them with "something went wrong" would throw that away.
    try { await fn() } catch (e) { setError(String((e as Error).message ?? e)) }
    finally { setBusy(false) }
  }, [])

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Watch someone use Twin</h1>
        <p className="mt-1 text-sm opacity-70">
          Twin writes down what happened. You ask them why.
        </p>
      </div>

      {error && (
        <div className="flex gap-2 rounded border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span>
        </div>
      )}

      {!id && (
        <div className="space-y-2">
          <label className="block text-sm">Who are you watching?</label>
          <input
            value={subject} onChange={(e) => setSubject(e.target.value)}
            placeholder="their account id"
            className="w-full rounded border bg-transparent px-3 py-2"
          />
          <button
            disabled={busy || !subject}
            onClick={() => run(async () => {
              const r = await createWatchedSession(subject)
              setId(r.watched_session_id); setStatus('created')
            })}
            className="rounded border px-4 py-2 text-sm disabled:opacity-50"
          >Set up the session</button>
        </div>
      )}

      {id && status === 'created' && (
        <div className="space-y-3 rounded border p-4">
          {/* ⚠️ READ ALOUD BEFORE ANYTHING STARTS. Consent recorded after
              watching is bookkeeping, and the server refuses it. */}
          <div className="font-medium">Read this out, and wait for a yes.</div>
          <p className="text-sm">Before we start — is it OK if I watch you use this, and take notes?</p>
          <ul className="list-disc space-y-1 pl-5 text-sm opacity-80">
            {CONSENT.map((line) => <li key={line}>{line}</li>)}
          </ul>
          <button
            disabled={busy}
            onClick={() => run(async () => {
              await consentWatchedSession(id); await startWatchedSession(id); setStatus('watching')
            })}
            className="rounded bg-white px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
          >They said yes — start watching</button>
        </div>
      )}

      {id && status === 'watching' && (
        <div className="space-y-3 rounded border p-4">
          <div className="font-medium">Watching.</div>
          <p className="text-sm opacity-70">
            Nothing to do here. Twin is collecting the timeline. Press finish when they stop.
          </p>
          <button
            disabled={busy}
            onClick={() => run(async () => {
              const f = await finishWatchedSession(id); setFinish(f); setStatus('finished')
            })}
            className="rounded border px-4 py-2 text-sm disabled:opacity-50"
          >{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Finish'}</button>
        </div>
      )}

      {id && status === 'finished' && (
        <div className="space-y-4">
          {finish && (
            <div className="rounded border p-3 text-sm">
              <div>{finish.events_captured} things recorded.</div>
              {/* ⚠️ SHOWN, NOT HIDDEN. A step Twin never recorded and a step
                  they never took look identical in a timeline and point at
                  opposite fixes. */}
              {finish.blind_spots.length > 0 && (
                <div className="mt-2">
                  <div className="opacity-70">Twin could not see:</div>
                  <ul className="mt-1 list-disc pl-5 opacity-70">
                    {finish.blind_spots.map((g) => (
                      <li key={g.event_name}>
                        {g.event_name}
                        {g.reason === 'uninstrumented' && ' — never recorded by Twin at all'}
                        {g.reason === 'unknown' && ' — recorded elsewhere, but nothing arrived'}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="space-y-3 rounded border p-4">
            <div className="font-medium">Why did they stop?</div>
            <p className="text-sm opacity-70">
              Pick the closest one, then write what they actually said.
            </p>
            <div className="space-y-1">
              {BLOCKERS.map(([key, label]) => (
                <button
                  key={key} onClick={() => setBlocker(key)}
                  className={`block w-full rounded border px-3 py-2 text-left text-sm ${
                    blocker === key ? 'border-white' : 'border-white/20'}`}
                >{label}</button>
              ))}
            </div>
            <textarea
              value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="Their words, however short."
              rows={3}
              className="w-full rounded border bg-transparent px-3 py-2 text-sm"
            />
            <div className="flex gap-2">
              <button
                disabled={busy || !blocker || !reason.trim()}
                onClick={() => run(async () => {
                  await observeWatchedSession(id, blocker, reason)
                  setRecorded((n) => n + 1); setBlocker(''); setReason('')
                })}
                className="rounded border px-4 py-2 text-sm disabled:opacity-50"
              >Record it</button>
              <button
                disabled={busy || recorded === 0}
                onClick={() => run(async () => {
                  const r = await lockWatchedSession(id); setStatus(r.status)
                })}
                className="flex items-center gap-2 rounded bg-white px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
              ><Lock className="h-4 w-4" />Finish &amp; Lock</button>
            </div>
            {recorded > 0 && <div className="text-xs opacity-60">{recorded} recorded.</div>}
          </div>
        </div>
      )}

      {status === 'locked' && (
        <div className="rounded border p-4 text-sm">
          Locked. {recorded} reason{recorded === 1 ? '' : 's'} recorded, and they cannot change now.
        </div>
      )}
    </div>
  )
}
