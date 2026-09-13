import { useEffect, useState } from 'react'
import { Video } from 'lucide-react'
import { Link } from 'react-router-dom'
import { messageForOwnAccount, platformIsUnreadable, type AccountCounts } from '@twinai/shared'
import { loadTwinStrength } from '../lib/twinStrengthLoad'
import { loadOwnSample } from '../lib/ownSampleLoad'

/**
 * WHAT THE SCAN FOUND IN THE CREATOR'S OWN VIDEOS.
 *
 * ⚠️ THE SENTENCE EXISTED AND NOBODY EVER READ IT. `messageForOwnAccount` has
 * been shipped, tested and stored-against since the gate landed, and no screen
 * imported it — so a creator whose account has nothing of them talking to camera
 * was never told, and found out by reading a script that did not sound like
 * them. That is the founding defect of this product, one layer up.
 *
 * ⚖️ THE MESSAGE DECIDES WHETHER TO SPEAK, NOT THIS COMPONENT. `fine` means
 * silence — a scan that checked nothing, or a sample still being collected — and
 * silence renders nothing at all rather than an empty card. Every judgement
 * about what counts as enough stays in the shared rule.
 *
 * ⚖️ AND THE ZERO CASE IS A DOOR, NOT A WALL. It names the one thing that
 * changes the answer, because "Twin isn't for you" is a verdict a person does
 * not come back from.
 */
export function OwnAccountFitCard({ voiceId }: { voiceId?: string | null }) {
  const [counts, setCounts] = useState<AccountCounts | null>(null)
  // ⚠⚠ WHAT TWIN DID LEARN FROM, SO THE CARD IS NOT ONLY BAD NEWS. On a
  // platform whose videos cannot be read, "Twin cannot read Instagram videos"
  // alone leaves a creator unable to tell whether the scan worked at all — her
  // captions are what it learned from, and that is a fact we hold.
  //
  // ⚖️ A SEPARATE, NON-BLOCKING READ. The message renders the moment the counts
  // arrive; if this one is slower, or fails, the sentence is simply the shorter
  // one. A card that waited on it would trade a true sentence for a blank space.
  const [learned, setLearned] = useState<number | null>(null)

  useEffect(() => {
    let alive = true
    void loadOwnSample(voiceId).then((r: AccountCounts | null) => { if (alive) setCounts(r) })
    void loadTwinStrength(voiceId).then((r) => {
      if (alive && r) setLearned(r.substance)
    })
    return () => { alive = false }
  }, [voiceId])

  if (!counts) return null
  const m = messageForOwnAccount({ ...counts, learnedFrom: learned })
  // ⚠️ READ FROM THE SAME LIST THE MESSAGE USES, not a second copy of it. A
  // string compare on 'instagram' here would drift from `platformIsUnreadable`
  // the day the list shrinks -- and that list is a confession meant to shrink.
  const unreadablePlatform = platformIsUnreadable(counts.platform)
  if (m.kind === 'fine') return null

  // ⚖️ ONE TREATMENT FOR "none" AND "thin", DELIBERATELY. Both are facts about
  // the creator's videos rather than verdicts on the creator, and painting the
  // zero case red would turn a measurement back into the rejection this wording
  // exists to avoid.
  return (
    <div className="rounded-card border border-white/5 bg-ink2/70 p-5 shadow-glass backdrop-blur-md">
      <div className="flex items-start gap-3">
        <Video className="h-4 w-4 text-teal shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm leading-relaxed text-cream">{m.headline}</p>
          <p className="mt-1 text-xs text-stone">
            {m.detail}
            {/* ⚠⚠ THE ONE ROUTE LEFT, OFFERED WHERE THE PROBLEM IS NAMED. If Twin
                cannot read her videos at all, pasting her writing is the only way
                left to give it her voice -- and `voice_samples` is read verbatim
                by the writer as "the single strongest voice signal".
                ⚠️ MEASURED 2026-09-13: that field is empty on 0 of 56 profiles and
                0 of 55 voices. The path works end to end; the box sits inside a
                collapsed editor on a tab nobody opens. Complete feature, zero
                rows -- so the offer goes where the creator already is, and the
                anchor opens the editor rather than landing beside it.
                ⚖️ ONLY ON THE UNREADABLE-PLATFORM CASE. A creator whose videos we
                CAN read does not need to retype her posts, and offering it to
                her would be busywork dressed as help. */}
            {m.kind === 'none' && unreadablePlatform && (
              <>
                {' '}
                <Link to="/settings#how-you-write" className="text-teal hover:text-cream underline underline-offset-2">
                  Paste a few posts instead
                </Link>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  )
}
