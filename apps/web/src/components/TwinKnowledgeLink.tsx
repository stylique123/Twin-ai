import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { strengthSentence, type TwinStrength } from '@twinai/shared'
import { loadTwinStrength } from '../lib/twinStrengthLoad'

/**
 * WHAT THE TWIN KNOWS, UNDER THE SCRIPT — AS A LINE, NOT AS WORK.
 *
 * ⚠️ SEVENTH FLAG FROM THE OWNER'S REVIEW. The script screen asked the creator
 * to write a paragraph, in a textarea, directly under a script they had opened
 * to READ. The ask is legitimate and the moment is not: someone who came to film
 * is handed homework, and the one surface where the product has just delivered
 * becomes the one that asks for something back.
 *
 * ⚖️ THE QUESTION IS NOT DELETED — IT MOVES. `CreatorQuestionCard` now lives in
 * Settings under "My Twin", where a creator arrives having chosen to teach it.
 * What stays here is the fact and the door: what Twin knows, and one link.
 *
 * ⚠️ THIS OVERRULES A MEASURED DECISION, AND THE MEASUREMENT STILL STANDS.
 * `CreatorQuestionCard`'s own header records why it was put here: every question
 * below the fold on the confirm screen came back unanswered, and the Product
 * Library is "a complete, working feature with zero rows because it waits to be
 * visited". A settings page is that same wall. The counter-argument the owner is
 * making is that an ask which degrades the delivery surface costs more than the
 * answers it collects — and unlike the Library, this leaves a line behind that
 * states what is missing and where to fix it, on the screen they already opened.
 * If answer volume drops to zero, this is the change to revert.
 *
 * ⚖️ IT COUNTS THROUGH `strengthSentence`, NOT A SECOND VOCABULARY. That module
 * is already the one authority for what a twin knows said in plain English —
 * counts, never a score, never the word "weak". A separate sentence written here
 * is how two screens come to report different numbers for one store.
 *
 * ⚖️ AND IT RENDERS NOTHING WHEN IT KNOWS NOTHING. A failed read is not an empty
 * twin, and "Twin knows 0 things" would be a claim about the creator's work that
 * a network error is not entitled to make.
 */
export function TwinKnowledgeLink({ voiceId = null }: { voiceId?: string | null }) {
  const [s, setS] = useState<TwinStrength | null>(null)

  useEffect(() => {
    let alive = true
    void loadTwinStrength(voiceId).then((r: TwinStrength | null) => { if (alive) setS(r) })
    return () => { alive = false }
  }, [voiceId])

  if (!s) return null
  const { headline } = strengthSentence(s)

  return (
    <p className="text-xs text-stone">
      {headline}{' '}
      <Link
        to="/settings#my-twin"
        className="text-teal underline underline-offset-2 hover:text-cream"
      >
        Add another →
      </Link>
    </p>
  )
}
