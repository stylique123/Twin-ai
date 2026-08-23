// THE VISUAL PILOT'S LABELLING PAGE, HOSTED INSIDE TWIN.
//
// The first version of this served from the container that drew the sample, on
// that container's localhost. The owner -- the only person whose judgment the
// pilot collects -- could never open it.
//
// ⚠️ WHAT THIS PAGE MUST NEVER SHOW: any aggregate, any running rate, any count
// of how many claims have been marked SUPPORTED so far. A reviewer who can see
// the score is being told what the answer should be. The numbers exist only
// after Finish & Lock, and only on the server.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Loader2, Lock, AlertTriangle } from 'lucide-react'
import {
  getPilotPacket, savePilotLabel, logPilotEvent, finishPilotReview,
  claimSentence, claimNote, jumpTarget,
  type PilotPacket, type PilotClaim, type PilotLabel,
} from '../lib/api'

/** Drop the focus ring left on an answer button once the view has moved on.
 *  Guarded because `document` is absent under SSR and `blur` is missing on
 *  anything that is not an HTMLElement. */
function blurAnswerFocus(): void {
  if (typeof document === 'undefined') return
  const el = document.activeElement
  if (el instanceof HTMLElement && typeof el.blur === 'function') el.blur()
}

const KEYS: Record<string, PilotLabel> = {
  '1': 'SUPPORTED', '2': 'UNSUPPORTED', '3': 'INDETERMINATE', '4': 'WRONG_EVIDENCE',
}

export default function PilotVisualReview() {
  const { pilotRunId = '' } = useParams()
  const [packet, setPacket] = useState<PilotPacket | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [at, setAt] = useState(0)
  const [saving, setSaving] = useState(false)
  const [locking, setLocking] = useState(false)
  const [locked, setLocked] = useState(false)
  // ⚠️ THE EVIDENCE MUST BE LOOKABLE-AT. A thumbnail a reviewer cannot open
  // is not evidence they can judge; the owner said so on the live packet.
  const [zoom, setZoom] = useState<string | null>(null)
  const started = useRef(false)

  useEffect(() => {
    let live = true
    getPilotPacket(pilotRunId)
      .then((p) => { if (!live) return; setPacket(p); setLocked(p.run.status === 'locked') })
      .catch((e) => { if (live) setError(String(e.message ?? e)) })
    return () => { live = false }
  }, [pilotRunId])

  useEffect(() => {
    if (!packet || started.current) return
    started.current = true
    void logPilotEvent(pilotRunId, 'session_start').catch(() => {})
  }, [packet, pilotRunId])

  // ⚠️ A CLAIM TWIN NEVER MADE CANNOT BE LABELLED, AND ASKING IS WORSE THAN NOT
  // ASKING. The first real packet put 17 of these in front of the owner --
  // "Twin did not reach a conclusion about this one" over four buttons that all
  // judge a claim. There is no honest press. Every one of them also blocked
  // Finish & Lock, so the run could not be completed at all.
  //
  // ⚖️ HIDDEN FROM THE QUEUE, NOT FROM THE REPORT. The server keeps them in the
  // denominator and reports model_did_not_answer; what is removed here is only
  // the demand that a person settle them.
  const allClaims = packet?.claims ?? []
  const claims = useMemo(() => allClaims.filter((c) => c.answered), [allClaims])
  const notAnswered = allClaims.length - claims.length
  const claim: PilotClaim | undefined = claims[at]
  const remaining = useMemo(() => claims.filter((c) => !c.current?.label).length, [claims])

  const framesFor = useCallback((c: PilotClaim) => {
    const cited = c.cited_frames ?? []
    return (packet?.frames ?? [])
      .filter((f) => f.url === c.url && (cited.length === 0 || cited.includes(f.frame_index)))
      .sort((a, b) => a.frame_index - b.frame_index)
  }, [packet])

  const apply = useCallback(async (label: PilotLabel | null) => {
    if (!claim || locked) return
    setSaving(true)
    try {
      // ⚠️ SAVED BEFORE THE VIEW MOVES ON. Advancing first and saving after is
      // how a session ends with labels the reviewer believes they gave and the
      // database never received.
      await savePilotLabel(pilotRunId, claim.id, label)
      const wasAnswered = !!claim.current?.label
      setPacket((p) => p && ({
        ...p,
        claims: p.claims.map((c) => c.id === claim.id
          ? { ...c, current: { label, corrected_value: null } } : c),
      }))
      void logPilotEvent(pilotRunId, wasAnswered ? 'relabel' : (label === null ? 'skip' : 'label'),
        { claim_id: claim.id, label }).catch(() => {})
      // ⚠️ A SKIP SENDS THE REVIEWER BACK. It is not an answer, and the run
      // cannot lock while one is outstanding.
      setAt((i) => Math.min(claims.length - 1, i + 1))
      // ⚠️ AND THE PREVIOUS ANSWER MUST NOT ARRIVE PRE-HIGHLIGHTED ON THE NEXT
      // CLAIM. These buttons are keyed by label, so React reuses the same DOM
      // nodes as the view advances and the browser's focus ring stays on the one
      // just clicked. The owner saw claim 2 open with "The frames contradict
      // this" already ringed in blue and reasonably read it as selected.
      //
      // ⚖️ THAT IS NOT COSMETIC ON THIS PAGE. A visibly pre-picked answer nudges
      // a reviewer toward repeating their last one, and repeated answers are
      // indistinguishable from agreement in the results. This page already
      // refuses to show a running score for the same reason; a sticky highlight
      // is the same coaching by another route.
      //
      // Blurring, not re-keying: keyboard labelling is bound to window (1-4, s,
      // arrows), so nothing here depends on the button keeping focus.
      blurAnswerFocus()
    } catch (e) {
      setError(String((e as Error).message))
    } finally { setSaving(false) }
  }, [claim, claims.length, locked, pilotRunId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (locked) return
      if (KEYS[e.key]) { void apply(KEYS[e.key]); void logPilotEvent(pilotRunId, 'key', { key: e.key }).catch(() => {}) }
      else if (e.key === 's') { void apply(null) }
      else if (e.key === 'ArrowLeft') { setAt((i) => Math.max(0, i - 1)); void logPilotEvent(pilotRunId, 'nav', { dir: -1 }).catch(() => {}) }
      else if (e.key === 'ArrowRight') { setAt((i) => Math.min(claims.length - 1, i + 1)); void logPilotEvent(pilotRunId, 'nav', { dir: 1 }).catch(() => {}) }
      // ⚠️ THE PAGE OPENS AT CLAIM 1 EVERY TIME. Three deploys landed during one
      // labelling session and each asked the reviewer to reload and then arrow
      // forward past everything already answered. `j` jumps to the next claim
      // still needing an answer, wrapping, so a skip left behind at claim 7 is
      // reachable from claim 60.
      else if (e.key === 'j') {
        const to = jumpTarget(claims.map((c) => !!c.current?.label), at)
        if (to !== null) { setAt(to); void logPilotEvent(pilotRunId, 'jump', { to }).catch(() => {}) }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [apply, at, claims, locked, pilotRunId])

  const finish = async () => {
    setLocking(true)
    try {
      await finishPilotReview(pilotRunId)
      setLocked(true)
    } catch (e) { setError(String((e as Error).message)) } finally { setLocking(false) }
  }

  if (error) {
    return (
      <div className="mx-auto max-w-2xl p-8">
        <div className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-200">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div><div className="font-medium">The review could not load</div>
            <div className="mt-1 text-sm opacity-80">{error}</div></div>
        </div>
      </div>
    )
  }
  if (!packet) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin opacity-60" /></div>
  }
  if (locked) {
    return (
      <div className="mx-auto max-w-2xl p-8">
        <div className="flex items-start gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
          <Lock className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
          <div>
            <div className="font-medium text-emerald-100">This review is locked</div>
            <div className="mt-1 text-sm text-emerald-200/70">
              Labels are final. The report and the go / hold decision were computed on the
              server and are recorded against this run.
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-4 flex items-baseline justify-between text-sm opacity-70">
        <span>Claim {at + 1} of {claims.length}</span>
        {/* Progress only. Never a score. */}
        {/* Progress, never a score: how much work is left, never how any of it
            was answered. The jump control is navigation for the same reason. */}
        <span className="flex items-center gap-3">
          <span>{remaining} left to answer</span>
          {remaining > 0 && (
            <button
              type="button"
              onClick={() => {
                const to = jumpTarget(claims.map((c) => !!c.current?.label), at)
                if (to !== null) { setAt(to); void logPilotEvent(pilotRunId, 'jump', { to }).catch(() => {}) }
              }}
              disabled={jumpTarget(claims.map((c) => !!c.current?.label), at) === null}
              className="rounded border border-white/15 px-2 py-1 text-xs hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-30">
              <span className="mr-1 opacity-50">j</span>Next unanswered
            </button>
          )}
        </span>
      </div>

      {/* Said plainly, and said once. The reviewer should know these exist and
          know they are not being withheld -- not be asked to judge them. */}
      {notAnswered > 0 && (
        <div className="mb-4 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm opacity-70">
          Twin had no answer for {notAnswered} more {notAnswered === 1 ? 'thing' : 'things'}.
          There is nothing to check on those, so they are not in your list. They are still counted
          in the results.
        </div>
      )}

      {claim && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          {/* ⚠️ THE SENTENCE IS WHAT A PERSON JUDGES. This card used to print the
              internal field path and JSON.stringify(value) -- "PERFORMANCE.TALKINGHEAD"
              over "false" -- and the owner could not tell what was being asked.
              An unreadable claim does not produce a careful label, it produces a
              fast one, and the labels are the entire result of this experiment. */}
          <div className="text-xs uppercase tracking-wide opacity-40">Twin says</div>
          <div className="mt-2 text-lg leading-snug">
            {(() => {
              const said = claimSentence(claim.claim_path, claim.claim_value, claim.answered)
              // ⚠️ FALLS BACK RATHER THAN INVENTING. An unmapped path shows the raw
              // pair: a reviewer judging a sentence the client made up would be
              // judging the wrong claim.
              if (said) return <span>{said}</span>
              return claim.answered
                ? <code className="rounded bg-white/10 px-2 py-1">{claim.claim_path} = {JSON.stringify(claim.claim_value)}</code>
                : <span className="opacity-60">Twin did not reach a conclusion about this one.</span>
            })()}
          </div>
          {/* ⚠️ HOW MUCH TWIN LOOKED AT IS PART OF THE CLAIM, AND THE CARD USED TO
              HIDE IT. The sentence above is about the WHOLE VIDEO -- "Nobody is
              talking to the camera" -- while the evidence below is whatever
              frames the claim cited, sometimes a single still. The owner met
              exactly that: one 1.8s frame offered as grounds for an absence
              across a whole video, with nothing on screen saying so.
              ⚖️ SAYING IT DOES NOT CHANGE THE CLAIM. The reviewer still judges
              what the model asserted; they can now see the evidence is thin
              instead of inferring it, which is the difference between "these
              frames cannot settle it" being an informed answer and a guess. */}
          {(() => {
            const shown = framesFor(claim).length
            const all = (packet.frames ?? []).filter((f) => f.url === claim.url).length
            const scope = all > 0 && shown < all
              ? `Twin pointed at ${shown} of the ${all} pictures it looked at from this video.`
              : shown > 0
                ? `Twin pointed at ${shown === all ? 'all ' : ''}${shown} picture${shown === 1 ? '' : 's'} from this video.`
                : null
            return (
              <>
                <div className="mt-3 text-sm opacity-60">
                  {shown === 1
                    ? 'Does the picture below back that up?'
                    : 'Do the pictures below back that up?'}
                </div>
                {scope && (
                  <div className="mt-1 text-[13px] opacity-45">{scope}</div>
                )}
              </>
            )
          })()}
          {/* The internal path stays available, but as debug detail rather than
              as the thing a human is asked to read. */}
          {/* ⚠️ WHAT THE FIELD MEANS, FOR THE CLAIMS THAT LOOK LIKE EACH OTHER.
              The owner reached "The camera stays in one position the whole way
              through", saw a wide shot and a close-up of one face, and could not
              tell whether a ZOOM counted as the camera moving. It does not --
              that is camera.framingChanges, a separate claim the model answered
              separately. A reviewer who conflates the two scores the model wrong
              for something it never claimed.
              ⚖️ THE NOTE EXPLAINS THE QUESTION, NEVER THE ANSWER. It says what
              the field means; it does not say what is in the frames or which way
              to lean. A note that decides for the reviewer is the same defect as
              a pre-highlighted button. */}
          {(() => {
            const note = claimNote(claim.claim_path)
            return note
              ? <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-[13px] leading-snug opacity-75">
                  {note}
                </div>
              : null
          })()}
          <div className="mt-2 text-[11px] opacity-30">{claim.claim_path}</div>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {framesFor(claim).map((f) => (
              <figure key={`${f.url}-${f.frame_index}`} className="overflow-hidden rounded-lg border border-white/10">
                {f.signed_url
                  ? <button type="button" onClick={() => setZoom(f.signed_url)}
                      className="block w-full cursor-zoom-in"
                      aria-label={`Open frame ${f.frame_index} full size`}>
                      <img src={f.signed_url} alt={`frame ${f.frame_index}`} className="w-full" />
                    </button>
                  : <div className="flex h-24 items-center justify-center text-xs opacity-50">frame unavailable</div>}
                <figcaption className="px-2 py-1 text-[11px] opacity-60">
                  #{f.frame_index}
                  {/* at_seconds travels with the frame: a claim about what CHANGES
                      cannot be judged without knowing how far apart the stills are. */}
                  {f.at_seconds != null && <> · {f.at_seconds.toFixed(1)}s</>}
                </figcaption>
              </figure>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {(Object.entries(KEYS) as Array<[string, PilotLabel]>).map(([k, label]) => (
              <button key={label} disabled={saving} onClick={() => void apply(label)}
                className={`rounded-lg border px-3 py-2 text-sm transition ${
                  claim.current?.label === label
                    ? 'border-sky-400 bg-sky-400/20' : 'border-white/15 hover:bg-white/5'}`}>
                <span className="mr-2 opacity-50">{k}</span>{packet.vocabulary[label] ?? label}
              </button>
            ))}
            <button disabled={saving} onClick={() => void apply(null)}
              className="rounded-lg border border-white/15 px-3 py-2 text-sm opacity-70 hover:bg-white/5">
              <span className="mr-2 opacity-50">s</span>Skip for now
            </button>
          </div>
        </div>
      )}

      {/* Tap the picture to see it properly. Tap anywhere to close. */}
      {zoom && (
        <div
          role="dialog" aria-modal="true" aria-label="Frame, full size"
          onClick={() => setZoom(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4">
          <img src={zoom} alt="Frame, full size" className="max-h-full max-w-full object-contain" />
          <div className="absolute bottom-6 text-sm opacity-70">Tap anywhere to close</div>
        </div>
      )}

      <div className="mt-6">
        <button
          onClick={() => void finish()}
          disabled={remaining > 0 || locking}
          className="rounded-lg bg-emerald-500/90 px-4 py-2 font-medium text-black disabled:cursor-not-allowed disabled:opacity-40">
          {locking ? 'Locking…' : 'Finish & Lock'}
        </button>
        {remaining > 0 && (
          <span className="ml-3 text-sm opacity-60">
            {remaining} claim{remaining === 1 ? '' : 's'} still need an answer.
          </span>
        )}
      </div>
    </div>
  )
}
