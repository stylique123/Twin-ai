import { useEffect, useState } from 'react'
import { TrendingUp } from 'lucide-react'
import { messageForWhatWorks, timesTheirNormal, type WhatWorks } from '@twinai/shared'
import { loadOwnPerformance } from '../lib/ownPerformanceLoad'

/**
 * WHAT ACTUALLY WORKS ON THIS CREATOR'S OWN ACCOUNT.
 *
 * ⚠️ MEASURED, AND IT IS THE ARGUMENT FOR THE WHOLE CARD. The physiotherapist's
 * median post gets 588 plays. His clinical explainers — the only kind of video
 * Twin has ever written for him — sit between 300 and 5,000. His parody did
 * 543,300, which is 924x his own normal, and his appreciation post did 70,600.
 * Twin held that data and produced only the format that performs at the median.
 *
 * ⚖️ RELATIVE TO THEIR OWN MEDIAN, NEVER TO A THRESHOLD. The mechanic's median
 * is 37,000 — 63x the physio's. Any absolute number calls one of them a failure
 * and the other a star, and tells neither of them anything.
 *
 * ⚖️ THE SHARED RULE DECIDES WHETHER TO SPEAK, not this component — the same
 * shape `OwnAccountFitCard` established. Silence is the default: a creator with
 * a flat account has a consistent one, and manufacturing a "top post" out of a
 * flat distribution would teach them to chase noise.
 */
export function WhatWorksCard({ voiceId }: { voiceId?: string | null }) {
  const [w, setW] = useState<WhatWorks | null>(null)

  useEffect(() => {
    let alive = true
    void loadOwnPerformance(voiceId).then((r) => { if (alive) setW(r) })
    return () => { alive = false }
  }, [voiceId])

  if (!w) return null
  const m = messageForWhatWorks(w)
  if (m.kind === 'silent') return null

  const times = timesTheirNormal(m.best.plays ?? 0, m.median)
  const caption = (m.best.caption ?? '').trim()
  // ⚠️ THE CREATOR'S OWN WORDS, TRIMMED FOR THE CARD RATHER THAN REWRITTEN. A
  // summary of their caption would be us telling them what their video was
  // about, which is the one thing they already know.
  const shown = caption.length > 90 ? `${caption.slice(0, 90).trimEnd()}…` : caption

  return (
    <div className="rounded-card border border-white/5 bg-ink2/70 p-5 shadow-glass backdrop-blur-md">
      <div className="flex items-start gap-3">
        <TrendingUp className="h-4 w-4 text-teal shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm text-cream">What works on your account</p>
          {/* ⚖️ PLAIN ENGLISH AND A MULTIPLE, NOT A PERCENTAGE. "924x your
              normal" is legible; "92,300% above median" has to be decoded
              before it can be felt. */}
          <p className="mt-1.5 text-xs leading-relaxed text-stone">
            Your best post did <span className="text-cream">{(m.best.plays ?? 0).toLocaleString()}</span> views
            {times > 1 && <> — about <span className="text-cream">{times}×</span> your usual {m.median.toLocaleString()}</>}.
            {m.alsoRan > 0 && <> {m.alsoRan} other{m.alsoRan === 1 ? '' : 's'} did the same.</>}
          </p>
          {shown && (
            <p className="mt-2 truncate text-[11px] italic leading-snug text-sand">“{shown}”</p>
          )}
          {/* ⚠️ THE DENOMINATOR IS SHOWN. A claim drawn from 12 posts and one
              drawn from 200 are different claims, and a creator who cannot tell
              them apart will read a sample as a verdict. */}
          <p className="mt-2 text-[11px] leading-snug text-stone/70">
            From your last {m.counted} posts with view counts.
          </p>
        </div>
      </div>
    </div>
  )
}
