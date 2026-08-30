import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Package } from 'lucide-react'
import {
  loadPreScriptBrief, loadProductEntities, sellsAnswerOf,
  COMMERCIAL_TIES, type CommercialTie,
} from '@twinai/shared'

/**
 * ⚠️ READ OFF THE BRIEF DIRECTLY, NOT THROUGH `briefToProfileAnswers`. That
 * helper deliberately carries only the four fields the profile assembler needs
 * and drops `commercialTies` entirely — routing through it made this card read
 * `undefined` for every creator and never appear at all. Narrowed rather than
 * cast, because the brief stores ties as loose strings.
 */
function tiesOf(brief: { commercialTies?: readonly string[] | null }): CommercialTie[] {
  const raw = brief.commercialTies
  if (!Array.isArray(raw)) return []
  return raw.filter((t): t is CommercialTie =>
    (COMMERCIAL_TIES as readonly string[]).includes(t))
}

/**
 * THE ONE CARD THAT REPLACES THIRTEEN ONBOARDING OPTIONS.
 *
 * ⚠️ ONBOARDING NOW ASKS ONLY WHETHER A COMMERCIAL THING EXISTS — one yes/no
 * where it used to ask six tie chips and a seven-chip service follow-up. That
 * was the right removal: the kind of thing, the relationship and the offer
 * facts belong to the Product Library, which asks all of it properly and behind
 * an attestation. But removing the questions leaves a creator who said "yes"
 * with a stated commercial fact and nowhere it can be used, and the Product
 * Library is the page this repo has already measured nobody visits — roughly
 * one row after weeks of use, because the only door in was a page with no
 * reason to open it.
 *
 * ⚖️ SO THE REMOVAL SHIPS WITH ITS OWN DOOR. This is that door, and it is
 * deliberately ONE card with one link, not a second interrogation.
 *
 * ⚖️ IT IS GATED ON A REAL CONDITION, NOT ON DECORATION. Three things must all
 * hold, and each is a genuine read:
 *
 *   1. They said YES. `sellsAnswerOf` reads the stored `commercialTies`, so it
 *      also recognises the answers the thirteen-option question wrote — a
 *      creator who chose `own_service` back then reads as yes today.
 *   2. They said something. UNANSWERED IS NOT YES. `sellsAnswerOf` returns null
 *      for an empty list, and null must never be nudged: nobody has claimed a
 *      commercial thing exists, so there is nothing to add.
 *   3. They have no product yet. The moment `product_entities` holds a row the
 *      card is finished and stops appearing — permanently, on every device,
 *      because the condition is the row and not a dismissal flag.
 *
 * ⚖️ AND IT RENDERS NOTHING WHILE IT DOES NOT KNOW. A failed or pending read
 * leaves `show` false rather than showing a card on an assumption. Nudging
 * somebody to add a product they already added is the fastest way to teach them
 * the card is noise.
 */
export function AddYourProductCard({ voiceId }: { voiceId?: string | null }) {
  const [show, setShow] = useState(false)

  useEffect(() => {
    let alive = true
    setShow(false)
    if (!voiceId) return
    void (async () => {
      try {
        const [brief, entities] = await Promise.all([
          loadPreScriptBrief(voiceId),
          loadProductEntities(),
        ])
        if (!alive) return
        const saidYes = sellsAnswerOf(tiesOf(brief)) === 'yes'
        setShow(saidYes && entities.length === 0)
      } catch {
        // A read that failed is not a creator with no product. Say nothing.
        if (alive) setShow(false)
      }
    })()
    return () => { alive = false }
  }, [voiceId])

  if (!show) return null

  return (
    <div className="rounded-card border border-white/5 bg-ink2/70 p-5 shadow-glass backdrop-blur-md">
      <div className="flex items-start gap-3">
        <Package className="h-4 w-4 shrink-0 text-amber mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm leading-relaxed text-cream">
            You mentioned you sell something — add it so scripts can talk about it.
          </p>
          <p className="mt-1 text-xs text-stone">
            Until it's there, your scripts won't assume you have a product.{' '}
            <Link
              to="/products"
              className="text-amber underline underline-offset-2 hover:text-cream"
            >
              Add it to your Product Library
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
