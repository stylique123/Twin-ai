import { useEffect, useState } from 'react'
import { scriptOrigin } from '@twinai/shared'
import { loadScriptProduct, type ScriptProduct } from '../lib/scriptOriginLoad'

/**
 * WHAT A PERSON FORWARDING THIS SCRIPT NEEDS TO KNOW ABOUT IT.
 *
 * ⚠️ THE AGENCY'S REPORT, AND IT IS AN AUDIT LINE RATHER THAN A NICETY: "Product
 * Mode per client. But I need to know which product each script used, or I'll
 * send a client the wrong one." The finished script named no product and stated
 * no rules, so the one fact needed before forwarding it to a brand was the one
 * fact the page did not carry.
 *
 * ⚖️ THE RULES SENTENCE IS THE PICKER'S OWN. `scriptOrigin` composes it through
 * `productChoiceConstraint`, so the creator reads the SAME words before choosing
 * and after the script exists. A second wording here would be two derivations of
 * one policy.
 *
 * ⚠️ THE PRODUCT LINE IS ABSENT UNTIL IT IS KNOWN, AND NEVER GUESSED. Every
 * generation written before 0137 has no choice row, and a failed read is
 * silence — the source line still renders, because that one is derived from the
 * generation's own URL and is always true.
 */
export function ScriptOriginPanel(
  { generationId, referenceUrl }: { generationId: string; referenceUrl: string | null },
) {
  const [product, setProduct] = useState<ScriptProduct | null>(null)
  useEffect(() => {
    let alive = true
    void loadScriptProduct(generationId).then((p) => { if (alive) setProduct(p) })
    return () => { alive = false }
  }, [generationId])

  const origin = scriptOrigin({ referenceUrl, product })
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-stone">Where this came from</p>
      <p className="mt-1 text-xs text-stone/80">{origin.source}</p>
      {origin.product && <p className="mt-1 text-xs text-sand">{origin.product}</p>}
    </div>
  )
}
