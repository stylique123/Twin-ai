import { useEffect, useState } from 'react'
import { Video } from 'lucide-react'
import { messageForOwnAccount, type AccountCounts } from '@twinai/shared'
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

  useEffect(() => {
    let alive = true
    void loadOwnSample(voiceId).then((r: AccountCounts | null) => { if (alive) setCounts(r) })
    return () => { alive = false }
  }, [voiceId])

  if (!counts) return null
  const m = messageForOwnAccount(counts)
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
          <p className="mt-1 text-xs text-stone">{m.detail}</p>
        </div>
      </div>
    </div>
  )
}
