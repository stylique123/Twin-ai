// THE QUESTION THAT DECIDES WHETHER ANY OF THE REST OF THIS MATTERS.
//
// ⚠️ TWIN GRADES ITS OWN SCRIPTS SIX WAYS AND HAS NEVER ASKED THE CREATOR ONE
// THING. Substance depth, claim strength, speech polish, slot fill — all
// measured, none of them the actual pass mark. The pass mark is whether the
// person whose face is on it would put it on their account.
//
// ⚖️ THREE ANSWERS, NOT TWO, BECAUSE THE MIDDLE ONE IS THE USEFUL ONE. "Only if
// I changed some of it" is the most informative thing a creator can tell us and
// a yes/no question forces it into one of the extremes — collecting a cleaner
// number and a worse fact.
//
// ⚠️ AND IT ASKS ONCE. A survey that reappears after it has been answered is a
// survey people learn to dismiss, and the dismissal habit costs us every future
// question too. Answered means answered; the answer stays changeable, but we
// never ask again unprompted.
import { useEffect, useState } from 'react'
import { PUBLISH_INTENTS, PUBLISH_INTENT_LABELS, type PublishIntent } from '@twinai/shared'
import { recordPublishIntent, readPublishIntent } from '../lib/publishIntent'

export default function WouldYouPostThis({ generationId }: { generationId: string }) {
  const [answer, setAnswer] = useState<PublishIntent | null>(null)
  const [known, setKnown] = useState(false)
  const [thanks, setThanks] = useState(false)

  useEffect(() => {
    let live = true
    void readPublishIntent(generationId).then((prev) => {
      if (!live) return
      setAnswer(prev)
      setKnown(true)
    })
    return () => { live = false }
  }, [generationId])

  // ⚠️ NOTHING IS SHOWN UNTIL WE KNOW WHETHER IT WAS ALREADY ANSWERED. Flashing
  // the question and then replacing it with the answer reads as though we lost
  // their response, which is exactly the impression this must not give.
  if (!known) return null

  const choose = (v: PublishIntent) => {
    // ⚖️ THE ANSWER LANDS ON SCREEN BEFORE IT LANDS IN THE DATABASE, and the
    // write is not awaited. This is telemetry; making a creator wait on our
    // analytics round-trip to see their own tap acknowledged is backwards.
    setAnswer(v)
    setThanks(true)
    void recordPublishIntent(generationId, v)
  }

  return (
    <section className="card mt-6 p-4" aria-labelledby="wypt-q">
      <h3 id="wypt-q" className="text-sm font-medium">
        Would you post this?
      </h3>
      <p className="mt-1 text-xs opacity-70">
        {/* ⚠️ PLAIN ENGLISH AND A REASON TO BOTHER. "Help us improve" is what
            every ignored survey says; this states the actual consequence. */}
        Your answer changes what we write next. Nobody else sees it.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {PUBLISH_INTENTS.map((v) => {
          const picked = answer === v
          return (
            <button
              key={v}
              type="button"
              onClick={() => choose(v)}
              aria-pressed={picked}
              className={picked ? 'btn-primary text-sm' : 'btn-ghost text-sm'}
            >
              {PUBLISH_INTENT_LABELS[v]}
            </button>
          )
        })}
      </div>
      {/* ⚖️ ACKNOWLEDGED, NEVER CELEBRATED. A creator who just told us they
          would not post it should not be met with a tick and "thanks!". */}
      {thanks && (
        <p className="mt-3 text-xs opacity-70">Noted — thank you.</p>
      )}
    </section>
  )
}
