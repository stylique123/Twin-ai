import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
import { strengthSentence, type TwinStrength } from '@twinai/shared'
import { loadTwinStrength } from '../lib/twinStrengthLoad'

/**
 * THE TWIN SAYS WHAT IT KNOWS, IN COUNTS.
 *
 * ⚠️ THE FAILURE THIS ENDS IS A SILENT ONE. A creator whose catalogue is
 * captions gets a hollow twin and nothing tells them — they find out by reading
 * a disappointing script and concluding the product is bad at its job. Measured:
 * caption-derived knowledge is 13% substance with ZERO experiences ever;
 * transcripts are 78%.
 *
 * ⚖️ IT RENDERS NOTHING WHEN IT KNOWS NOTHING. A failed read is not "your twin
 * is empty" — that would be a claim about their work we cannot support.
 */
export function TwinStrengthCard({ voiceId }: { voiceId?: string | null }) {
  const [s, setS] = useState<TwinStrength | null>(null)

  useEffect(() => {
    let alive = true
    void loadTwinStrength(voiceId).then((r: TwinStrength | null) => { if (alive) setS(r) })
    return () => { alive = false }
  }, [voiceId])

  if (!s) return null
  const { headline, nudge } = strengthSentence(s)

  return (
    <div className="rounded-card border border-white/5 bg-ink2/70 p-5 shadow-glass backdrop-blur-md">
      <div className="flex items-start gap-3">
        <Sparkles className="h-4 w-4 text-teal shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm leading-relaxed text-cream">{headline}</p>
          {nudge !== '' && (
            <p className="mt-1 text-xs text-stone">
              {nudge}{' '}
              <Link to="/settings" className="text-teal hover:text-cream underline underline-offset-2">
                Teach it something
              </Link>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
